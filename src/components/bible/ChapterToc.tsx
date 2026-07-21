import { Link } from 'react-router-dom';
import { booksData } from '@/lib/books-data';
import { toUrlSlug } from '@/lib/url-utils';
import styles from './ChapterToc.module.scss';

interface ChapterTocProps {
  bookId: number;
  bookName: string;
  bookSlug: string;
  chapter: number;
  maxChapter: number;
  bibleQuery: string;
}

// Categorise the 66 books into the same groups the home page uses, so the
// left rail can show "you are in Evangeliene, here are the other books in
// this group" links.
const CATEGORIES: Array<{ label: string; range: [number, number] }> = [
  { label: 'Mosebøkene', range: [1, 5] },
  { label: 'Historiske', range: [6, 17] },
  { label: 'Poetiske', range: [18, 22] },
  { label: 'Profetene', range: [23, 39] },
  { label: 'Evangeliene & Apg', range: [40, 44] },
  { label: 'Paulus-brev', range: [45, 57] },
  { label: 'Øvrige brev & Åp.', range: [58, 66] },
];

function categoryFor(bookId: number) {
  return CATEGORIES.find(c => bookId >= c.range[0] && bookId <= c.range[1]);
}

export function ChapterToc({
  bookId,
  bookName,
  bookSlug,
  chapter,
  maxChapter,
  bibleQuery,
}: ChapterTocProps) {
  const category = categoryFor(bookId);
  const siblings = category
    ? booksData.filter(b => b.id >= category.range[0] && b.id <= category.range[1])
    : [];

  return (
    <nav className={styles.toc} aria-label="Kapittelnavigasjon">
      <div className={styles.groupLabel}>{bookName}</div>
      <div className={styles.chapterGrid}>
        {Array.from({ length: maxChapter }, (_, i) => i + 1).map(ch => (
          <Link
            key={ch}
            to={`/${bookSlug}/${ch}${bibleQuery}`}
            className={`${styles.chapterCell} ${ch === chapter ? styles.chapterCellActive : ''}`}
            aria-current={ch === chapter ? 'page' : undefined}
          >
            {ch}
          </Link>
        ))}
      </div>

      {category && siblings.length > 1 && (
        <>
          <div className={styles.groupLabel}>{category.label}</div>
          {siblings.map(b => {
            const slug = toUrlSlug(b.short_name);
            const isCurrent = b.id === bookId;
            return (
              <Link
                key={b.id}
                to={`/${slug}/1${bibleQuery}`}
                className={`${styles.tocItem} ${isCurrent ? styles.tocItemActive : ''}`}
              >
                <span className={styles.tocItemName}>{b.name_no}</span>
                <span className={styles.tocItemChapters}>{b.chapters}</span>
              </Link>
            );
          })}
        </>
      )}

      <div className={styles.groupLabel}>Alle bøker</div>
      <Link to="/" className={styles.tocItem}>
        <span className={styles.tocItemName}>Forsiden →</span>
      </Link>
    </nav>
  );
}
