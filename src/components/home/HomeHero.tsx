import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReadingPosition } from '../ReadingPositionContext';
import { useReadingPlan } from '../ReadingPlanContext';
import { useFavorites } from '../FavoritesContext';
import { useSettings } from '../SettingsContext';
import { toUrlSlug } from '@/lib/url-utils';
import { getBookInfoById, getBookInfoBySlug } from '@/lib/books-data';
import styles from './HomeHero.module.scss';

interface DailyVerseData {
  reference: {
    bookId: number;
    bookName: string;
    shortName: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
    display: string;
  };
  text: string;
  note: string;
}

interface LastVerseData {
  text: string;
  bible: string;
}

export function HomeHero() {
  const { position, clearPosition } = useReadingPosition();
  const { activePlan, activeProgress, todaysReading, currentDay, streak, completionPercentage } = useReadingPlan();
  const { addFavorite, removeFavorite, isFavorite } = useFavorites();
  const { settings } = useSettings();
  const [verse, setVerse] = useState<DailyVerseData | null>(null);
  const [verseLoading, setVerseLoading] = useState(true);
  const [lastVerse, setLastVerse] = useState<LastVerseData | null>(null);
  const [vodExpanded, setVodExpanded] = useState(false);
  const [vodOverflows, setVodOverflows] = useState(false);
  const vodScrollRef = useRef<HTMLButtonElement>(null);

  const bible = settings.bible?.startsWith('user:') ? 'osnb2' : (settings.bible || 'osnb2');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/daily-verse?bible=${encodeURIComponent(bible)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setVerse(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVerseLoading(false); });
    return () => { cancelled = true; };
  }, [bible]);

  // Fetch the last verse text where the user stopped, to show inside the hero.
  useEffect(() => {
    if (!position) {
      setLastVerse(null);
      return;
    }
    const bookInfo = getBookInfoBySlug(position.bookSlug);
    if (!bookInfo) {
      setLastVerse(null);
      return;
    }
    let cancelled = false;
    fetch('/api/verses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refs: [{ bookId: bookInfo.id, chapter: position.chapter, verse: position.verse }],
        bible,
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !Array.isArray(d) || d.length === 0) return;
        const text = d[0]?.verse?.text;
        if (text) setLastVerse({ text, bible });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [position, bible]);

  const hasContinue = !!position;
  const continueUrl = position ? `/${position.bookSlug}/${position.chapter}#v${position.verse}` : '/';

  const verseUrl = verse
    ? `/${toUrlSlug(verse.reference.shortName)}/${verse.reference.chapter}#v${verse.reference.verseStart}`
    : '/';
  const verseIsFav = !!verse && isFavorite(verse.reference.bookId, verse.reference.chapter, verse.reference.verseStart);

  // Detect whether the verse overflows the collapsed box, so we only show
  // the "Vis mer" affordance when there's actually more to read. We only
  // measure when collapsed; once expanded, the box height is uncapped so
  // measuring would always read "no overflow" and we'd lose the toggle.
  useLayoutEffect(() => {
    if (vodExpanded) return;
    const el = vodScrollRef.current;
    if (!el || !verse) {
      setVodOverflows(false);
      return;
    }
    setVodOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [verse, vodExpanded]);

  function toggleVerseFav() {
    if (!verse) return;
    const v = {
      bookId: verse.reference.bookId,
      chapter: verse.reference.chapter,
      verse: verse.reference.verseStart,
    };
    if (verseIsFav) removeFavorite(v);
    else addFavorite(v);
  }

  const planChapters = todaysReading?.chapters?.map((c) => {
    const b = getBookInfoById(c.bookId);
    return b ? `${b.name_no} ${c.chapter}` : null;
  }).filter(Boolean).join(' · ') || '';

  return (
    <div className={styles.hero}>
      <div className={styles.continue}>
        {hasContinue ? (
          <>
            <div>
              <div className={styles.eyebrow}>Fortsett å lese</div>
              <h2 className={styles.continueTitle}>
                {position!.bookName} {position!.chapter}
              </h2>
              <div className={styles.continueSub}>
                Du stoppet ved vers {position!.verse}
              </div>
              {lastVerse && (
                <div className={styles.lastVerse}>
                  «{lastVerse.text}»
                </div>
              )}
            </div>
            <div className={styles.actions}>
              <Link to={continueUrl} className={`${styles.btn} ${styles.btnPrimary}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
                Fortsett ved vers {position!.verse}
              </Link>
              <Link to={`/${position!.bookSlug}/${position!.chapter + 1}`} className={`${styles.btn} ${styles.btnGhost}`}>
                Neste kapittel
              </Link>
              <button
                type="button"
                onClick={clearPosition}
                className={styles.clearBtn}
                aria-label="Fjern leseposisjon"
                title="Fjern"
              >
                ×
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className={styles.eyebrow}>Velkommen</div>
              <h2 className={styles.continueTitle}>Bibelen</h2>
              <div className={styles.continueSub}>Begynn et sted under, eller bruk ⌘K for å gå rett til et vers.</div>
            </div>
            <div className={styles.actions}>
              <Link to="/1mos/1" className={`${styles.btn} ${styles.btnPrimary}`}>
                Start med 1. Mosebok 1
              </Link>
              <Link to="/joh/1" className={`${styles.btn} ${styles.btnGhost}`}>
                Eller Johannes 1
              </Link>
            </div>
          </>
        )}
      </div>

      <div className={styles.side}>
        <div className={`${styles.card} ${styles.vod}`}>
          <h3>Dagens vers</h3>
          {verseLoading ? (
            <div className={styles.vodLoading}>Laster…</div>
          ) : verse ? (
            <>
              <button
                ref={vodScrollRef}
                type="button"
                className={`${styles.vodScroll} ${vodExpanded ? styles.vodScrollExpanded : ''} ${vodOverflows ? styles.vodScrollOverflows : ''}`}
                onClick={() => vodOverflows && setVodExpanded(v => !v)}
                aria-expanded={vodOverflows ? vodExpanded : undefined}
                aria-label={vodOverflows ? (vodExpanded ? 'Skjul resten av verset' : 'Vis hele verset') : undefined}
                tabIndex={vodOverflows ? 0 : -1}
              >
                <span className={styles.vodText}>«{verse.text}»</span>
                {vodOverflows && (
                  <span className={styles.vodMore} aria-hidden="true">
                    {vodExpanded ? 'Vis mindre ↑' : 'Vis mer ↓'}
                  </span>
                )}
              </button>
              <div className={styles.vodFoot}>
                <div className={styles.vodRef}>
                  <Link to={verseUrl}>{verse.reference.display}</Link>
                  {verse.note ? <span className={styles.vodNote}> · {verse.note}</span> : null}
                </div>
                <div className={styles.vodActions}>
                  <button
                    type="button"
                    onClick={toggleVerseFav}
                    aria-label={verseIsFav ? 'Fjern favoritt' : 'Marker som favoritt'}
                    title={verseIsFav ? 'Fjern favoritt' : 'Favoritt'}
                    className={verseIsFav ? styles.vodActOn : ''}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={verseIsFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M19 14c-3 4-7 7-7 7s-4-3-7-7-3-8 0-10 6-1 7 2c1-3 4-4 7-2s3 6 0 10z" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.vodLoading}>Ingen vers for i dag</div>
          )}
        </div>

        <div className={`${styles.card} ${styles.plans}`}>
          <div className={styles.plansHead}>
            <h3>Leseplaner</h3>
            <span className={styles.plansCount}>
              {activePlan ? '1 aktiv' : 'Ingen aktiv'}
            </span>
          </div>
          {activePlan && activeProgress && todaysReading ? (
            <>
              <div className={styles.plansTabs}>
                <button type="button" className={`${styles.plansTab} ${styles.plansTabOn}`}>
                  {activePlan.name}
                  {streak > 0 && <span className={styles.streakMini}>{streak}</span>}
                </button>
                <Link to="/leseplan" className={`${styles.plansTab} ${styles.plansTabAdd}`}>
                  + ny
                </Link>
              </div>
              <div className={styles.streakRow}>
                <div>
                  <div className={styles.streakNum}>{streak}</div>
                  <small>dager på rad · dag {currentDay} av {activePlan.days}</small>
                </div>
              </div>
              <div className={styles.planProg}>
                <span style={{ width: `${completionPercentage}%` }} />
              </div>
              <div className={styles.planToday}>
                <span className={styles.planWhat}>{planChapters || 'I dag'}</span>
                <span className={styles.planDays}>i dag</span>
              </div>
            </>
          ) : (
            <div className={styles.plansEmpty}>
              <p>Du har ingen aktiv leseplan ennå.</p>
              <Link to="/leseplan" className={styles.plansChooseBtn}>Velg leseplan</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
