import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useSettings } from '@/components/SettingsContext';
import { bibleVersions } from '@/lib/settings';
import { getUserBibles } from '@/lib/offline/userBibles';
import { getUserBibleStatistics, getUserBibleTopWords } from '@/lib/offline/userBibleStats';
import styles from '@/styles/pages/statistics.module.scss';

interface BookStatistics {
  bookId: number;
  bookName: string;
  shortName: string;
  testament: string;
  chapters: number;
  verses: number;
  words: number;
  originalWords: number;
  originalLanguage: 'hebrew' | 'greek';
}

interface BibleStatistics {
  totalBooks: number;
  totalChapters: number;
  totalVerses: number;
  totalWords: number;
  totalOriginalWords: number;
  otBooks: number;
  otChapters: number;
  otVerses: number;
  otWords: number;
  ntBooks: number;
  ntChapters: number;
  ntVerses: number;
  ntWords: number;
  books: BookStatistics[];
}

interface WordFrequency {
  word: string;
  count: number;
}

type WordTab = 'translation' | 'hebrew' | 'greek';
type SortColumn = 'bookName' | 'chapters' | 'verses' | 'words' | 'originalWords';
type SortDirection = 'asc' | 'desc';

function isUserBible(bible: string): boolean {
  return bible.startsWith('user:');
}

export function StatisticsPage() {
  const { settings } = useSettings();
  const currentBible = settings.bible || 'osnb2';

  const [stats, setStats] = useState<BibleStatistics | null>(null);
  const [topWords, setTopWords] = useState<WordFrequency[]>([]);
  const [wordTab, setWordTab] = useState<WordTab>('translation');
  const [loading, setLoading] = useState(true);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [showAllWords, setShowAllWords] = useState(false);
  const [wordFilter, setWordFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [includeStopWords, setIncludeStopWords] = useState(false);
  const [allVersions, setAllVersions] = useState(bibleVersions);
  const [bibleName, setBibleName] = useState('Bokmål');

  const isUser = isUserBible(currentBible);

  // Load available bible versions
  useEffect(() => {
    getUserBibles().then(userBibles => {
      if (userBibles.length > 0) {
        setAllVersions([
          ...bibleVersions,
          ...userBibles.map(ub => ({ value: ub.id, label: ub.name })),
        ]);
      }
    });
  }, []);

  // Update bible name when currentBible or allVersions changes
  useEffect(() => {
    const version = allVersions.find(v => v.value === currentBible);
    setBibleName(version?.label ?? currentBible);
  }, [currentBible, allVersions]);

  // Reset word tab when switching to user bible (no hebrew/greek available)
  useEffect(() => {
    if (isUser && wordTab !== 'translation') {
      setWordTab('translation');
    }
  }, [isUser, wordTab]);

  // Load statistics
  useEffect(() => {
    setLoading(true);
    setStats(null);

    if (isUser) {
      getUserBibleStatistics(currentBible)
        .then(data => {
          setStats(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error loading user bible statistics:', err);
          setLoading(false);
        });
    } else {
      fetch(`/api/statistics?bible=${encodeURIComponent(currentBible)}`)
        .then(res => res.json())
        .then(data => {
          setStats(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error loading statistics:', err);
          setLoading(false);
        });
    }
  }, [currentBible, isUser]);

  // Load top words
  const loadTopWords = useCallback(async () => {
    setWordsLoading(true);

    try {
      if (isUser) {
        if (wordTab !== 'translation') {
          setTopWords([]);
          setWordsLoading(false);
          return;
        }
        const words = await getUserBibleTopWords(currentBible, 500, includeStopWords);
        setTopWords(words);
      } else {
        let endpoint: string;
        if (wordTab === 'translation') {
          const params = new URLSearchParams();
          params.set('bible', currentBible);
          params.set('limit', '500');
          if (includeStopWords) params.set('all', 'true');
          endpoint = `/api/statistics/top-words?${params.toString()}`;
        } else {
          endpoint = `/api/statistics/top-words/${wordTab}?limit=500`;
        }

        const res = await fetch(endpoint, { cache: 'no-store' });
        const data = await res.json();
        setTopWords(data.words);
      }
    } catch (err) {
      console.error('Error loading top words:', err);
    } finally {
      setWordsLoading(false);
    }
  }, [currentBible, wordTab, includeStopWords, isUser]);

  useEffect(() => {
    loadTopWords();
  }, [loadTopWords]);

  const formatNumber = (n: number) => n.toLocaleString('nb-NO');

  // Filter words based on search
  const filteredWords = useMemo(() => {
    if (!wordFilter.trim()) return topWords;
    const filter = wordFilter.toLowerCase();
    return topWords.filter(w => w.word.toLowerCase().includes(filter));
  }, [topWords, wordFilter]);

  // Get words to display (limited or all)
  const displayWords = showAllWords ? filteredWords : filteredWords.slice(0, 50);

  // Get search URL for a word
  const getWordSearchUrl = (word: string) => {
    if (wordTab === 'translation') {
      return `/sok?q=${encodeURIComponent(word)}`;
    }
    return `/sok/original?q=${encodeURIComponent(word)}`;
  };

  // Reset filter and expanded view when changing tabs
  useEffect(() => {
    setShowAllWords(false);
    setWordFilter('');
  }, [wordTab]);

  if (loading) {
    return (
      <div className={styles.main}>
        <div className="container">
          <div className={styles.loading}>Laster statistikk...</div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={styles.main}>
        <div className="container">
          <p>Kunne ikke laste statistikk.</p>
        </div>
      </div>
    );
  }

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (column === 'bookName') {
        if (sortDirection === 'asc') {
          setSortDirection('desc');
        } else {
          setSortColumn(null);
        }
      } else {
        if (sortDirection === 'desc') {
          setSortDirection('asc');
        } else {
          setSortColumn(null);
        }
      }
    } else {
      setSortColumn(column);
      setSortDirection(column === 'bookName' ? 'asc' : 'desc');
    }
  };

  // Sort books
  const sortBooks = (books: BookStatistics[]) => {
    if (!sortColumn) return books;

    return [...books].sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'bookName') {
        comparison = a.bookName.localeCompare(b.bookName, 'nb');
      } else {
        comparison = a[sortColumn] - b[sortColumn];
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const otBooks = sortBooks(stats.books.filter(b => b.testament === 'OT'));
  const ntBooks = sortBooks(stats.books.filter(b => b.testament === 'NT'));
  const hasOT = otBooks.length > 0;
  const hasNT = ntBooks.length > 0;

  // Get sort indicator
  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const colSpan = isUser ? 4 : 5;

  return (
    <div className={styles.main}>
      <div className="container">
        <Breadcrumbs items={[
          { label: 'Hjem', href: '/' },
          { label: 'Statistikk' }
        ]} />

        <h1>Bibelstatistikk – {bibleName}</h1>

        <section className={styles.section}>
          <h2>Oversikt</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{formatNumber(stats.totalBooks)}</div>
              <div className={styles.statLabel}>Bøker</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{formatNumber(stats.totalChapters)}</div>
              <div className={styles.statLabel}>Kapitler</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{formatNumber(stats.totalVerses)}</div>
              <div className={styles.statLabel}>Vers</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{formatNumber(stats.totalWords)}</div>
              <div className={styles.statLabel}>Ord</div>
            </div>
          </div>

          {(hasOT && hasNT) && (
            <div className={styles.comparison}>
              <div className={styles.comparisonCard}>
                <h3>Det gamle testamente</h3>
                <div className={styles.comparisonStats}>
                  <div className={styles.comparisonRow}>
                    <span>Bøker</span>
                    <span>{formatNumber(stats.otBooks)}</span>
                  </div>
                  <div className={styles.comparisonRow}>
                    <span>Kapitler</span>
                    <span>{formatNumber(stats.otChapters)}</span>
                  </div>
                  <div className={styles.comparisonRow}>
                    <span>Vers</span>
                    <span>{formatNumber(stats.otVerses)}</span>
                  </div>
                  <div className={styles.comparisonRow}>
                    <span>Ord</span>
                    <span>{formatNumber(stats.otWords)}</span>
                  </div>
                </div>
              </div>
              <div className={styles.comparisonCard}>
                <h3>Det nye testamente</h3>
                <div className={styles.comparisonStats}>
                  <div className={styles.comparisonRow}>
                    <span>Bøker</span>
                    <span>{formatNumber(stats.ntBooks)}</span>
                  </div>
                  <div className={styles.comparisonRow}>
                    <span>Kapitler</span>
                    <span>{formatNumber(stats.ntChapters)}</span>
                  </div>
                  <div className={styles.comparisonRow}>
                    <span>Vers</span>
                    <span>{formatNumber(stats.ntVerses)}</span>
                  </div>
                  <div className={styles.comparisonRow}>
                    <span>Ord</span>
                    <span>{formatNumber(stats.ntWords)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2>Vanligste ord</h2>
          {!isUser ? (
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${wordTab === 'translation' ? styles.active : ''}`}
                onClick={() => setWordTab('translation')}
              >
                {bibleName}
              </button>
              <button
                className={`${styles.tab} ${wordTab === 'hebrew' ? styles.active : ''}`}
                onClick={() => setWordTab('hebrew')}
              >
                Hebraisk (GT)
              </button>
              <button
                className={`${styles.tab} ${wordTab === 'greek' ? styles.active : ''}`}
                onClick={() => setWordTab('greek')}
              >
                Gresk (NT)
              </button>
            </div>
          ) : null}

          {wordTab === 'translation' && (
            <label className={styles.stopWordsToggle}>
              <input
                type="checkbox"
                checked={includeStopWords}
                onChange={(e) => setIncludeStopWords(e.target.checked)}
              />
              <span>Inkluder vanlige ord (og, i, til, om, ...)</span>
            </label>
          )}

          {wordsLoading ? (
            <div className={styles.loading}>Laster ord...</div>
          ) : (
            <>
              <div className={styles.wordFilterContainer}>
                <input
                  type="text"
                  value={wordFilter}
                  onChange={(e) => setWordFilter(e.target.value)}
                  placeholder="Søk blant ord..."
                  className={styles.wordFilterInput}
                />
                {wordFilter && (
                  <span className={styles.filterCount}>
                    {filteredWords.length} av {topWords.length} ord
                  </span>
                )}
              </div>
              <div className={`${styles.wordList} ${showAllWords ? styles.expanded : ''}`}>
                {displayWords.map((item, i) => (
                  <Link
                    key={i}
                    to={getWordSearchUrl(item.word)}
                    className={styles.wordChip}
                    title={`Søk etter "${item.word}"`}
                  >
                    <span className={`${styles.wordText} ${wordTab !== 'translation' ? styles.originalWord : ''}`}>
                      {item.word}
                    </span>
                    <span className={styles.wordCount}>{formatNumber(item.count)}</span>
                  </Link>
                ))}
              </div>
              {!showAllWords && topWords.length > 50 && (
                <button
                  className={styles.showAllButton}
                  onClick={() => setShowAllWords(true)}
                >
                  Vis alle {topWords.length} ord
                </button>
              )}
              {showAllWords && (
                <button
                  className={styles.showAllButton}
                  onClick={() => {
                    setShowAllWords(false);
                    setWordFilter('');
                  }}
                >
                  Vis færre
                </button>
              )}
            </>
          )}
        </section>

        <section className={styles.section}>
          <h2>Per bok</h2>
          <table className={styles.booksTable}>
            <thead>
              <tr>
                <th
                  className={`${styles.sortable} ${sortColumn === 'bookName' ? styles.sorted : ''}`}
                  onClick={() => handleSort('bookName')}
                >
                  Bok{getSortIndicator('bookName')}
                </th>
                <th
                  className={`${styles.numberCell} ${styles.sortable} ${sortColumn === 'chapters' ? styles.sorted : ''}`}
                  onClick={() => handleSort('chapters')}
                >
                  Kapitler{getSortIndicator('chapters')}
                </th>
                <th
                  className={`${styles.numberCell} ${styles.sortable} ${sortColumn === 'verses' ? styles.sorted : ''}`}
                  onClick={() => handleSort('verses')}
                >
                  Vers{getSortIndicator('verses')}
                </th>
                <th
                  className={`${styles.numberCell} ${styles.sortable} ${sortColumn === 'words' ? styles.sorted : ''}`}
                  onClick={() => handleSort('words')}
                >
                  Ord{getSortIndicator('words')}
                </th>
                {!isUser && (
                  <th
                    className={`${styles.numberCell} ${styles.sortable} ${sortColumn === 'originalWords' ? styles.sorted : ''}`}
                    onClick={() => handleSort('originalWords')}
                  >
                    Ord (original){getSortIndicator('originalWords')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {hasOT && (
                <>
                  {hasNT && (
                    <tr className={styles.testamentHeader}>
                      <td colSpan={colSpan}>Det gamle testamente</td>
                    </tr>
                  )}
                  {otBooks.map(book => (
                    <tr key={book.bookId}>
                      <td>{book.bookName}</td>
                      <td className={styles.numberCell}>{formatNumber(book.chapters)}</td>
                      <td className={styles.numberCell}>{formatNumber(book.verses)}</td>
                      <td className={styles.numberCell}>{formatNumber(book.words)}</td>
                      {!isUser && (
                        <td className={styles.numberCell}>{formatNumber(book.originalWords)}</td>
                      )}
                    </tr>
                  ))}
                </>
              )}
              {hasNT && (
                <>
                  {hasOT && (
                    <tr className={styles.testamentHeader}>
                      <td colSpan={colSpan}>Det nye testamente</td>
                    </tr>
                  )}
                  {ntBooks.map(book => (
                    <tr key={book.bookId}>
                      <td>{book.bookName}</td>
                      <td className={styles.numberCell}>{formatNumber(book.chapters)}</td>
                      <td className={styles.numberCell}>{formatNumber(book.verses)}</td>
                      <td className={styles.numberCell}>{formatNumber(book.words)}</td>
                      {!isUser && (
                        <td className={styles.numberCell}>{formatNumber(book.originalWords)}</td>
                      )}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
