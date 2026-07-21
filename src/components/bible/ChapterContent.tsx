import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useChapter } from '@/hooks/useChapter';
import { useTimeline } from '@/hooks/useTimeline';
import { useChapterParallels } from '@/hooks/useChapterParallels';
import { getStoredChapter } from '@/lib/offline/storage';
import { VerseDisplay } from '@/components/bible/VerseDisplay';
import { Summary } from '@/components/bible/Summary';
import { ImportantWords } from '@/components/bible/ImportantWords';
import { ChapterInsightsPanel } from '@/components/bible/ChapterInsightsPanel';
import { ChapterParallelsView } from '@/components/bible/ChapterParallelsView';

import { MobileToolbar } from '@/components/bible/MobileToolbar';
import { ScrollToVerse } from '@/components/bible/ScrollToVerse';
import { ReadingSidebar } from '@/components/bible/ReadingSidebar';
import { ChapterToc } from '@/components/bible/ChapterToc';
import { ChapterKeyboardShortcuts } from '@/components/bible/ChapterKeyboardShortcuts';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ReadingModeWrapper } from '@/components/bible/ReadingModeWrapper';
import { ReadingPositionTracker } from '@/components/bible/ReadingPositionTracker';
import { useSettings } from '@/components/SettingsContext';
import { useReadingPlan } from '@/components/ReadingPlanContext';
import { PrefsPopover } from '@/components/bible/PrefsPopover';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { getUserBibles } from '@/lib/offline/userBibles';
import { bibleVersions } from '@/lib/settings';
import { getBookInfoById as getBookById2 } from '@/lib/books-data';
import { toUrlSlug } from '@/lib/url-utils';
import styles from '@/styles/pages/chapter.module.scss';

interface ChapterContentProps {
  bookId: number;
  bookName: string;
  bookSlug: string;
  chapter: number;
  maxChapter: number;
  nextBookName?: string;
  nextBookSlug?: string;
  bible?: string;
  // Server-rendered initial data (for hydration)
  initialData?: {
    verses: Array<{
      id: number;
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
      bible: string;
    }>;
    originalVerses: Array<{ verse: number; text: string }>;
    summary: string | null;
    context: string | null;
    insight: unknown | null;
  };
}

export function ChapterContent({
  bookId,
  bookName,
  bookSlug,
  chapter,
  maxChapter,
  nextBookName,
  nextBookSlug,
  bible = 'osnb2',
  initialData,
}: ChapterContentProps) {
  const bibleQuery = bible !== 'osnb2' ? `?bible=${bible}` : '';
  const { settings, updateSetting } = useSettings();

  const secondaryBible = settings.showOriginalText ? settings.secondaryBible : undefined;
  const mapping = settings.numberingSystem || 'osnb2';

  // Use client-side data fetching
  const { data, isLoading, error, isOffline } = useChapter({
    bookId,
    chapter,
    bible,
    secondaryBible,
    mapping: mapping !== 'osnb2' ? mapping : undefined,
  });

  // Fetch all timeline events + which ones are relevant for this chapter
  const { events: timelineEvents, chapterEventIds } = useTimeline(bookId, chapter);

  // Fetch parallels for gospel chapters
  const { parallels, hasParallels } = useChapterParallels(bookId, chapter);

  // Use initial data for SSR, then switch to client data
  const verses = data?.verses || initialData?.verses || [];
  const originalVerses = data?.originalVerses || initialData?.originalVerses || [];
  const bookSummary = data?.bookSummary ?? null;
  const summary = data?.summary ?? initialData?.summary ?? null;
  const context = data?.context ?? initialData?.context ?? null;
  const insight = data?.insight ?? initialData?.insight ?? null;
  const word4word = data?.word4word || {};
  const references = data?.references || {};

  // Create a map of original verses by verse number
  const originalVersesMap = useMemo(
    () => new Map(originalVerses.map(v => [v.verse, v.text])),
    [originalVerses]
  );

  // Fetch user bible secondary verses from IndexedDB
  const [userSecondaryVerses, setUserSecondaryVerses] = useState<{ verse: number; text: string }[]>([]);
  useEffect(() => {
    if (!secondaryBible || !secondaryBible.startsWith('user:')) {
      setUserSecondaryVerses([]);
      return;
    }
    getStoredChapter(bookId, chapter, secondaryBible).then(cached => {
      if (cached?.verses) {
        setUserSecondaryVerses(cached.verses.map(v => ({ verse: v.verse, text: v.text })));
      } else {
        setUserSecondaryVerses([]);
      }
    });
  }, [bookId, chapter, secondaryBible]);

  // Create a map of secondary verses by verse number
  const secondaryVersesData = secondaryBible?.startsWith('user:')
    ? userSecondaryVerses
    : (data?.secondaryVerses || []);
  const secondaryVersesMap = useMemo(
    () => new Map(secondaryVersesData.map(v => [v.verse, v.text])),
    [secondaryVersesData]
  );

  // Determine original language based on book
  const originalLanguage = bookId <= 39 ? 'hebrew' : 'greek';

  // Layout ref for live sidebar resize
  const layoutRef = useRef<HTMLDivElement>(null);
  const handleSidebarWidthChange = useCallback((width: number) => {
    layoutRef.current?.style.setProperty('--sidebar-width', `${width}px`);
  }, []);

  // Active reading plan badge — show only when the current chapter is in today's reading
  const { activePlan, todaysReading, currentDay } = useReadingPlan();
  const chapterIsInTodaysPlan = !!todaysReading?.chapters?.some(
    (c) => c.bookId === bookId && c.chapter === chapter
  );

  // Build bible options for PrefsPopover
  const [bibleOpts, setBibleOpts] = useState<{ id: string; name: string }[]>(
    bibleVersions.map(v => ({ id: v.value, name: v.label })),
  );
  useEffect(() => {
    getUserBibles().then(userBibles => {
      setBibleOpts([
        ...bibleVersions.map(v => ({ id: v.value, name: v.label })),
        ...userBibles.map(ub => ({ id: ub.id, name: ub.name })),
      ]);
    });
  }, []);

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  function handleBibleChange(newBible: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('bible', newBible);
    updateSetting('bible', newBible);
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    navigate(`${location.pathname}?${params.toString()}${hash}`);
  }
  const isFocus = settings.layoutMode === 'reading';

  // Copy handler: intercept copy events to include verse numbers and clean formatting
  const versesRef = useRef<HTMLElement>(null);
  useEffect(() => {
    function handleCopy(e: ClipboardEvent) {
      const section = versesRef.current;
      if (!section) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      // Only intercept if selection is within the verses section
      if (!section.contains(range.startContainer) && !section.contains(range.endContainer)) return;

      const verseElements = section.querySelectorAll<HTMLElement>('[data-verse-num]');
      const parts: { num: string; text: string }[] = [];

      for (const verseEl of verseElements) {
        if (!selection.containsNode(verseEl, true)) continue;

        const verseNum = verseEl.dataset.verseNum || '';
        const textSpan = verseEl.querySelector<HTMLElement>('[data-verse-text]');
        if (!textSpan) continue;

        const isFullySelected = selection.containsNode(verseEl, false);

        if (isFullySelected) {
          parts.push({ num: verseNum, text: textSpan.textContent?.trim() || '' });
        } else {
          // Partially selected verse - extract just the selected portion
          try {
            const verseRange = document.createRange();
            verseRange.selectNodeContents(textSpan);

            if (range.compareBoundaryPoints(Range.START_TO_START, verseRange) > 0) {
              verseRange.setStart(range.startContainer, range.startOffset);
            }
            if (range.compareBoundaryPoints(Range.END_TO_END, verseRange) < 0) {
              verseRange.setEnd(range.endContainer, range.endOffset);
            }

            const selectedText = verseRange.toString().trim();
            if (selectedText) {
              parts.push({ num: verseNum, text: selectedText });
            }
          } catch {
            // Fallback: use full verse text
            parts.push({ num: verseNum, text: textSpan.textContent?.trim() || '' });
          }
        }
      }

      if (parts.length === 0) return;

      e.preventDefault();

      const includeNums = settings.copyVerseNumbers ?? true;

      // Plain text: "1 Text here\n2 More text" or just "Text here\nMore text"
      const plainText = parts.map(p => includeNums ? `${p.num} ${p.text}` : p.text).join('\n');

      // HTML: clean formatting for Word/rich text editors
      const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const htmlLines = parts.map(p =>
        includeNums
          ? `<p style="margin:0 0 4px 0;line-height:1.6;"><sup style="color:#8b7355;font-size:0.75em;">${escHtml(p.num)}</sup> ${escHtml(p.text)}</p>`
          : `<p style="margin:0 0 4px 0;line-height:1.6;">${escHtml(p.text)}</p>`
      ).join('\n');
      const html = `<div style="font-family:Georgia,serif;font-size:12pt;color:#333333;background:white;">${htmlLines}</div>`;

      e.clipboardData?.setData('text/plain', plainText);
      e.clipboardData?.setData('text/html', html);
    }

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [settings.copyVerseNumbers]);

  // Show loading state only if we have no data at all
  if (isLoading && !verses.length && !initialData?.verses?.length) {
    return (
      <ReadingModeWrapper className={styles.main}>
        <div className={styles.loading}>
          <p>Laster {bookName} {chapter}...</p>
        </div>
      </ReadingModeWrapper>
    );
  }

  // Show error state
  if (error && !verses.length) {
    return (
      <ReadingModeWrapper className={styles.main}>
        <div className={styles.error}>
          <h1>Kunne ikke laste kapittelet</h1>
          <p>{error}</p>
          {isOffline && (
            <p className={styles.offlineHint}>
              Du er offline. <Link to="/offline">Se hva som er tilgjengelig offline</Link>.
            </p>
          )}
        </div>
      </ReadingModeWrapper>
    );
  }

  return (
    <ReadingModeWrapper className={styles.main}>
      <ScrollToVerse />
      <ReadingPositionTracker
        bookId={bookId}
        chapter={chapter}
        bookSlug={bookSlug}
        bookName={bookName}
      />
      <ChapterKeyboardShortcuts
        bookSlug={bookSlug}
        currentChapter={chapter}
        maxChapter={maxChapter}
        nextBookSlug={nextBookSlug || null}
        bibleQuery={bibleQuery}
      />

      <div
        ref={layoutRef}
        className={styles.layout}
        style={{ '--sidebar-width': `${settings.sidebarWidth || 280}px` } as React.CSSProperties}
      >
        <aside className={styles.sidebar} aria-label="Kapittelnavigasjon">
          <ChapterToc
            bookId={bookId}
            bookName={bookName}
            bookSlug={bookSlug}
            chapter={chapter}
            maxChapter={maxChapter}
            bibleQuery={bibleQuery}
          />
        </aside>

        <article className={styles.content}>
          <div className={styles.chapterMeta}>
            <Breadcrumbs items={[
              { label: 'Hjem', href: '/' },
              { label: bookName, href: `/${bookSlug}/1${bibleQuery}` },
              { label: `Kap. ${chapter}` }
            ]} />
            {activePlan && chapterIsInTodaysPlan && (
              <Link to="/leseplan" className={styles.planBadge} title={`Del av leseplanen «${activePlan.name}»`}>
                <span className={styles.planBadgeNum}>{currentDay}</span>
                Dag {currentDay} · {activePlan.name}
              </Link>
            )}
            <span className={styles.chapterMetaActions}>
              <button
                type="button"
                className={`${styles.focusBtn} ${isFocus ? styles.focusBtnOn : ''}`}
                onClick={() => updateSetting('layoutMode', isFocus ? 'normal' : 'reading')}
                aria-label="Fokusmodus (F)"
                aria-pressed={isFocus}
                title="Fokusmodus (F)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
                </svg>
              </button>
              <PrefsPopover
                bibleOptions={bibleOpts}
                currentBible={bible}
                onBibleChange={handleBibleChange}
              />
            </span>
          </div>

          <header className={styles.header}>
            <div className={styles.chapterBook}>{bookName}</div>
            <h1 className={styles.chapterTitle}>Kapittel {chapter}</h1>
          </header>

          <div className={styles.chapterRail}>
            <button
              type="button"
              className={`${styles.railChip} ${settings.showOriginalText && settings.secondaryBible !== 'original' ? styles.railChipOn : ''}`}
              onClick={() => {
                const undertekstOn = settings.showOriginalText && settings.secondaryBible !== 'original';
                if (undertekstOn) {
                  updateSetting('showOriginalText', false);
                  return;
                }
                // Pick a sensible default: the "other" Norwegian translation.
                let nextSecondary = settings.secondaryBible;
                if (!nextSecondary || nextSecondary === 'original') {
                  nextSecondary = bible === 'osnn1' ? 'osnb2' : 'osnn1';
                }
                updateSetting('secondaryBible', nextSecondary);
                updateSetting('showOriginalText', true);
              }}
              aria-pressed={!!settings.showOriginalText && settings.secondaryBible !== 'original'}
              title="Undertekst under hvert vers (velg oversettelse i ⚙)"
            >
              + Undertekst
            </button>
            <button
              type="button"
              className={`${styles.railChip} ${settings.showOriginalText && settings.secondaryBible === 'original' ? styles.railChipOn : ''}`}
              onClick={() => {
                if (settings.showOriginalText && settings.secondaryBible === 'original') {
                  updateSetting('showOriginalText', false);
                } else {
                  updateSetting('secondaryBible', 'original');
                  updateSetting('showOriginalText', true);
                }
              }}
              aria-pressed={!!settings.showOriginalText && settings.secondaryBible === 'original'}
            >
              Grunntekst
            </button>
            {chapter > 1 && (
              <Link to={`/${bookSlug}/${chapter - 1}${bibleQuery}`} className={styles.railChip}>← Forrige</Link>
            )}
            {chapter < maxChapter ? (
              <Link to={`/${bookSlug}/${chapter + 1}${bibleQuery}`} className={styles.railChip}>Neste →</Link>
            ) : nextBookSlug && (
              <Link to={`/${nextBookSlug}/1${bibleQuery}`} className={styles.railChip}>{nextBookName} →</Link>
            )}
          </div>

          {settings.showContextInline && (
            <>
              {bookSummary && (
                <Summary
                  type="book"
                  title={`Om ${bookName}`}
                  content={bookSummary}
                />
              )}

              {summary && (
                <Summary
                  type="chapter"
                  title={`Kapittel ${chapter}`}
                  content={summary}
                />
              )}

              {context && (
                <Summary
                  type="context"
                  title="Historisk kontekst"
                  content={context}
                />
              )}

              <ImportantWords bookId={bookId} chapter={chapter} />
            </>
          )}

          <ChapterInsightsPanel bookId={bookId} chapter={chapter} insight={insight} />

          {settings.showParallels && hasParallels && (
            <ChapterParallelsView
              bookId={bookId}
              chapter={chapter}
              parallels={parallels}
              bible={bible}
            />
          )}

          <section className={styles.verses} ref={versesRef}>
            {verses.map(verse => (
              <VerseDisplay
                key={`${verse.bible}-${verse.verse}`}
                verse={verse}
                bookId={bookId}
                originalText={originalVersesMap.get(verse.verse)}
                originalLanguage={originalLanguage}
                secondaryText={
                  settings.secondaryBible === 'original'
                    ? undefined
                    : secondaryVersesMap.get(verse.verse)
                }
                initialWord4Word={word4word[verse.verse]}
                initialReferences={references[verse.verse]}
              />
            ))}
          </section>

          <footer className={styles.footer}>
            <div className={styles.navButtons}>
              {chapter > 1 && (
                <Link to={`/${bookSlug}/${chapter - 1}${bibleQuery}`} className={styles.navButton}>
                  ← Forrige kapittel
                </Link>
              )}
              {chapter < maxChapter ? (
                <Link to={`/${bookSlug}/${chapter + 1}${bibleQuery}`} className={styles.navButton}>
                  Neste kapittel →
                </Link>
              ) : nextBookSlug && (
                <Link to={`/${nextBookSlug}/1${bibleQuery}`} className={styles.navButton}>
                  {nextBookName} →
                </Link>
              )}
            </div>
          </footer>
        </article>

        <aside className={styles.rightSidebar} aria-label="Verktøypanel">
          <ReadingSidebar
            bookId={bookId}
            chapter={chapter}
            bookName={bookName}
            timelineEvents={timelineEvents}
            chapterEventIds={chapterEventIds}
            bookSummary={bookSummary}
            chapterSummary={summary}
            historicalContext={context}
            onWidthChange={handleSidebarWidthChange}
          />
        </aside>
      </div>
      <MobileToolbar
        bookName={bookName}
        chapter={chapter}
        maxChapter={maxChapter}
        bookSlug={bookSlug}
        bookId={bookId}
        timelineEvents={timelineEvents}
        chapterEventIds={chapterEventIds}
        hasParallels={hasParallels}
        bookSummary={bookSummary}
        chapterSummary={summary}
        historicalContext={context}
      />
    </ReadingModeWrapper>
  );
}
