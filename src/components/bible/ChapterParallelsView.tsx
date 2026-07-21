import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './ChapterParallelsView.module.scss';
import type { GospelParallel, GospelParallelPassage } from '@/lib/bible';
import { toUrlSlug } from '@/lib/url-utils';

type Gospel = 'matthew' | 'mark' | 'luke' | 'john';

const GOSPELS: Gospel[] = ['matthew', 'mark', 'luke', 'john'];

const GOSPEL_NAMES: Record<Gospel, string> = {
  matthew: 'Matteus',
  mark: 'Markus',
  luke: 'Lukas',
  john: 'Johannes'
};

const GOSPEL_COLORS: Record<Gospel, string> = {
  matthew: 'blue',
  mark: 'green',
  luke: 'orange',
  john: 'purple'
};

const BOOK_ID_TO_GOSPEL: Record<number, Gospel> = {
  40: 'matthew',
  41: 'mark',
  42: 'luke',
  43: 'john'
};

interface LoadedVerses {
  [parallelId: string]: Record<string, Array<{ verse: number; text: string }>>;
}

interface ChapterParallelsViewProps {
  bookId: number;
  chapter: number;
  parallels: GospelParallel[];
  bible?: string;
}

function useIsNarrow(ref: React.RefObject<HTMLElement | null>, breakpoint = 500) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => setIsNarrow(el.offsetWidth <= breakpoint);
    check();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(check);
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', check);
      return () => window.removeEventListener('resize', check);
    }
  }, [ref, breakpoint]);

  return isNarrow;
}

function getPassageUrl(passage: GospelParallelPassage): string {
  return `/${toUrlSlug(passage.book_short_name || '')}/${passage.chapter}#v${passage.verse_start}`;
}

interface GospelColumnProps {
  gospel: Gospel;
  passage: GospelParallelPassage | undefined;
  verses: Array<{ verse: number; text: string }> | undefined;
  isLoading: boolean;
  isCurrentGospel: boolean;
}

function GospelColumn({ gospel, passage, verses, isLoading, isCurrentGospel }: GospelColumnProps) {
  if (!passage) {
    return (
      <div className={`${styles.gospelColumn} ${styles[GOSPEL_COLORS[gospel]]}`}>
        <div className={styles.columnHeader}>
          <span className={styles.gospelBadge}>{GOSPEL_NAMES[gospel]}</span>
        </div>
        <div className={styles.noPassage}>
          Ikke i {GOSPEL_NAMES[gospel]}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.gospelColumn} ${styles[GOSPEL_COLORS[gospel]]} ${isCurrentGospel ? styles.current : ''}`}>
      <div className={styles.columnHeader}>
        <span className={styles.gospelBadge}>
          {GOSPEL_NAMES[gospel]}
          {isCurrentGospel && <span className={styles.currentLabel}>(du leser)</span>}
        </span>
        {!isCurrentGospel && (
          <Link to={getPassageUrl(passage)} className={styles.referenceLink}>
            {passage.reference}
          </Link>
        )}
      </div>
      <div className={styles.versesContent}>
        {isLoading && <p className={styles.loading}>Laster...</p>}
        {!isLoading && verses && verses.map(v => (
          <p key={v.verse} className={styles.verse}>
            <span className={styles.verseNum}>{v.verse}</span>
            {v.text}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ChapterParallelsView({ bookId, chapter, parallels, bible = 'osnb2' }: ChapterParallelsViewProps) {
  const [expandedParallel, setExpandedParallel] = useState<string | null>(null);
  const [loadedVerses, setLoadedVerses] = useState<LoadedVerses>({});
  const [loadingVerses, setLoadingVerses] = useState<{ [parallelId: string]: boolean }>({});
  const [mobileGospel, setMobileGospel] = useState<Gospel>(BOOK_ID_TO_GOSPEL[bookId] || 'matthew');
  const containerRef = useRef<HTMLDivElement>(null);
  const useTabs = useIsNarrow(containerRef);

  const currentGospel = BOOK_ID_TO_GOSPEL[bookId];

  // Auto-expand if there's only one parallel
  useEffect(() => {
    if (parallels.length === 1 && !expandedParallel) {
      handleExpand(parallels[0]);
    }
  }, [parallels]);

  const handleExpand = async (parallel: GospelParallel) => {
    const parallelId = parallel.id;

    if (expandedParallel === parallelId) {
      setExpandedParallel(null);
      return;
    }

    setExpandedParallel(parallelId);

    if (loadedVerses[parallelId]) {
      return;
    }

    setLoadingVerses(prev => ({ ...prev, [parallelId]: true }));

    try {
      const response = await fetch(`/api/parallels/${parallelId}/verses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bible }),
      });

      if (!response.ok) throw new Error('Failed to fetch verses');

      const data = await response.json();
      setLoadedVerses(prev => ({ ...prev, [parallelId]: data.verses }));
    } catch (error) {
      console.error('Error loading verses:', error);
    } finally {
      setLoadingVerses(prev => ({ ...prev, [parallelId]: false }));
    }
  };

  const getGospelsInParallel = (parallel: GospelParallel): Gospel[] => {
    if (!parallel.passages) return [];
    return GOSPELS.filter(g => parallel.passages![g]);
  };

  // Filter parallels to only show those relevant to the current chapter
  const relevantParallels = parallels.filter(p => {
    if (!p.passages) return false;
    const currentGospelPassage = p.passages[currentGospel];
    return currentGospelPassage && currentGospelPassage.chapter === chapter;
  });

  if (relevantParallels.length === 0) {
    return null;
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h3 className={styles.title}>Parallelle tekster</h3>
        <p className={styles.subtitle}>
          {relevantParallels.length} {relevantParallels.length === 1 ? 'parallell' : 'paralleller'} i dette kapitlet
        </p>
      </div>

      <div className={styles.parallelList}>
        {relevantParallels.map(parallel => {
          const isExpanded = expandedParallel === parallel.id;
          const isLoading = loadingVerses[parallel.id];
          const verses = loadedVerses[parallel.id];
          const gospelsInParallel = getGospelsInParallel(parallel);

          return (
            <div key={parallel.id} className={`${styles.parallel} ${isExpanded ? styles.expanded : ''}`}>
              <div
                className={styles.parallelHeader}
                onClick={() => handleExpand(parallel)}
              >
                <div className={styles.parallelInfo}>
                  <h4 className={styles.parallelTitle}>{parallel.title}</h4>
                  <div className={styles.gospelBadges}>
                    {gospelsInParallel.map(gospel => (
                      <span
                        key={gospel}
                        className={`${styles.badge} ${styles[GOSPEL_COLORS[gospel]]} ${gospel === currentGospel ? styles.current : ''}`}
                        title={GOSPEL_NAMES[gospel]}
                      >
                        {GOSPEL_NAMES[gospel].charAt(0)}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={styles.expandIcon}>{isExpanded ? '−' : '+'}</span>
              </div>

              {isExpanded && (
                <div className={styles.parallelContent}>
                  {parallel.notes && (
                    <p className={styles.notes}>{parallel.notes}</p>
                  )}

                  {useTabs ? (
                    /* Mobile: Tabs */
                    <div className={styles.mobileTabs}>
                      <div className={styles.tabButtons}>
                        {gospelsInParallel.map(gospel => (
                          <button
                            key={gospel}
                            className={`${styles.tabButton} ${styles[GOSPEL_COLORS[gospel]]} ${mobileGospel === gospel ? styles.active : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMobileGospel(gospel);
                            }}
                          >
                            {GOSPEL_NAMES[gospel]}
                            {gospel === currentGospel && ' *'}
                          </button>
                        ))}
                      </div>
                      <div className={styles.tabContent}>
                        <GospelColumn
                          gospel={mobileGospel}
                          passage={parallel.passages?.[mobileGospel]}
                          verses={verses?.[mobileGospel]}
                          isLoading={isLoading}
                          isCurrentGospel={mobileGospel === currentGospel}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Desktop: Side by side columns */
                    <div className={styles.columnsGrid} style={{ gridTemplateColumns: `repeat(${gospelsInParallel.length}, 1fr)` }}>
                      {gospelsInParallel.map(g => (
                        <GospelColumn
                          key={g}
                          gospel={g}
                          passage={parallel.passages?.[g]}
                          verses={verses?.[g]}
                          isLoading={isLoading}
                          isCurrentGospel={g === currentGospel}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
