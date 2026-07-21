import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ToolsPanel } from './ToolsPanel';
import { MobileSidebarOverlay } from './MobileSidebarOverlay';
import { useSettings } from '@/components/SettingsContext';
import { booksData } from '@/lib/books-data';
import styles from './MobileToolbar.module.scss';
import type { TimelineEvent } from '@/lib/bible';

interface MobileToolbarProps {
  bookName: string;
  chapter: number;
  maxChapter: number;
  bookSlug: string;
  bookId: number;
  timelineEvents?: TimelineEvent[];
  chapterEventIds?: string[];
  hasParallels?: boolean;
  bookSummary?: string | null;
  chapterSummary?: string | null;
  historicalContext?: string | null;
}

export function MobileToolbar({
  bookName,
  chapter,
  maxChapter,
  bookSlug,
  bookId,
  timelineEvents = [],
  chapterEventIds = [],
  hasParallels = false,
  bookSummary = null,
  chapterSummary = null,
  historicalContext = null,
}: MobileToolbarProps) {
  const [showTools, setShowTools] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [pickerBookId, setPickerBookId] = useState(bookId);
  const { settings } = useSettings();
  const [searchParams] = useSearchParams();
  const bible = searchParams.get('bible');
  const bibleQuery = bible ? `?bible=${bible}` : '';

  const pickerBook = booksData.find(b => b.id === pickerBookId);
  const otBooks = booksData.filter(b => b.testament === 'OT');
  const ntBooks = booksData.filter(b => b.testament === 'NT');

  // Hide in reading mode
  if (settings.layoutMode === 'reading') {
    return null;
  }

  return (
    <>
      <div className={styles.toolbar}>
        <a
          href={chapter > 1 ? `/${bookSlug}/${chapter - 1}${bibleQuery}` : undefined}
          className={`${styles.navButton} ${chapter === 1 ? styles.disabled : ''}`}
          aria-label={`Forrige kapittel${chapter > 1 ? `: ${bookName} ${chapter - 1}` : ' (ikke tilgjengelig)'}`}
          aria-disabled={chapter === 1}
        >
          ←
        </a>

        <button
          className={styles.titleButton}
          onClick={() => {
            setPickerBookId(bookId);
            setShowChapterPicker(true);
          }}
        >
          {bookName} {chapter} <span className={styles.titleArrow}>&#9660;</span>
        </button>

        <button
          className={styles.sidebarButton}
          onClick={() => setShowSidebar(true)}
          title="Studium og verktøy"
          aria-label="Åpne studium-panel"
        >
          ▥
        </button>

        <button
          className={styles.toolsButton}
          onClick={() => setShowTools(true)}
          title="Hjelpemidler"
        >
          ⚙
        </button>

        <a
          href={chapter < maxChapter ? `/${bookSlug}/${chapter + 1}${bibleQuery}` : undefined}
          className={`${styles.navButton} ${chapter === maxChapter ? styles.disabled : ''}`}
          aria-label={`Neste kapittel${chapter < maxChapter ? `: ${bookName} ${chapter + 1}` : ' (ikke tilgjengelig)'}`}
          aria-disabled={chapter === maxChapter}
        >
          →
        </a>
      </div>

      {showTools && (
        <div className={styles.overlay} onClick={() => setShowTools(false)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <ToolsPanel onClose={() => setShowTools(false)} hasParallels={hasParallels} />
          </div>
        </div>
      )}

      {showSidebar && (
        <MobileSidebarOverlay
          bookId={bookId}
          chapter={chapter}
          bookName={bookName}
          timelineEvents={timelineEvents}
          chapterEventIds={chapterEventIds}
          bookSummary={bookSummary}
          chapterSummary={chapterSummary}
          historicalContext={historicalContext}
          onClose={() => setShowSidebar(false)}
        />
      )}

      {showChapterPicker && (
        <div className={styles.overlay} onClick={() => setShowChapterPicker(false)}>
          <div className={styles.pickerSheet} onClick={e => e.stopPropagation()}>
            <div className={styles.pickerHeader}>
              <h3>{pickerBook?.name_no ?? bookName}</h3>
              <button className={styles.pickerClose} onClick={() => setShowChapterPicker(false)}>&#10005;</button>
            </div>

            <div className={styles.chapterGrid}>
              {Array.from({ length: pickerBook?.chapters ?? maxChapter }, (_, i) => i + 1).map(ch => (
                <a
                  key={ch}
                  href={`/${(pickerBook?.short_name ?? bookSlug).toLowerCase()}/${ch}${bibleQuery}`}
                  className={`${styles.chapterCell} ${pickerBookId === bookId && ch === chapter ? styles.chapterActive : ''}`}
                  onClick={() => setShowChapterPicker(false)}
                >
                  {ch}
                </a>
              ))}
            </div>

            <div className={styles.bookPicker}>
              <h4>Det gamle testamente</h4>
              <div className={styles.bookGrid}>
                {otBooks.map(b => (
                  <button
                    key={b.id}
                    className={`${styles.bookCell} ${b.id === pickerBookId ? styles.bookActive : ''}`}
                    onClick={() => setPickerBookId(b.id)}
                  >
                    {b.short_name}
                  </button>
                ))}
              </div>
              <h4>Det nye testamente</h4>
              <div className={styles.bookGrid}>
                {ntBooks.map(b => (
                  <button
                    key={b.id}
                    className={`${styles.bookCell} ${b.id === pickerBookId ? styles.bookActive : ''}`}
                    onClick={() => setPickerBookId(b.id)}
                  >
                    {b.short_name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
