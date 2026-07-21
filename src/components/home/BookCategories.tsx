import { useState } from 'react';
import { Link } from 'react-router-dom';
import { booksData, type BookInfo } from '@/lib/books-data';
import { toUrlSlug } from '@/lib/url-utils';
import { useReadingPosition } from '../ReadingPositionContext';
import styles from './BookCategories.module.scss';

type Mode = 'kategorier' | 'alfabetisk' | 'kronologisk';

interface Group {
  label: string;
  books: BookInfo[];
}

function categoryGroups(): Group[] {
  return [
    { label: 'Det gamle testamente · Mosebøkene', books: booksData.filter(b => b.id >= 1 && b.id <= 5) },
    { label: 'Historiske bøker', books: booksData.filter(b => b.id >= 6 && b.id <= 17) },
    { label: 'Poetiske bøker', books: booksData.filter(b => b.id >= 18 && b.id <= 22) },
    { label: 'Profetene', books: booksData.filter(b => b.id >= 23 && b.id <= 39) },
    { label: 'Det nye testamente · Evangeliene & Apg', books: booksData.filter(b => b.id >= 40 && b.id <= 44) },
    { label: 'Paulus-brev', books: booksData.filter(b => b.id >= 45 && b.id <= 57) },
    { label: 'Øvrige brev & Åpenbaringen', books: booksData.filter(b => b.id >= 58 && b.id <= 66) },
  ];
}

function alphabeticalGroups(): Group[] {
  const sorted = [...booksData].sort((a, b) => a.name_no.localeCompare(b.name_no, 'no'));
  return [{ label: 'Alle bøker · alfabetisk', books: sorted }];
}

function chronologicalGroups(): Group[] {
  return [
    { label: 'Det gamle testamente · i bokrekkefølge', books: booksData.filter(b => b.testament === 'OT') },
    { label: 'Det nye testamente · i bokrekkefølge', books: booksData.filter(b => b.testament === 'NT') },
  ];
}

export function BookCategories() {
  const [mode, setMode] = useState<Mode>('kategorier');
  const { position } = useReadingPosition();
  const currentBookId = position
    ? booksData.find(b => toUrlSlug(b.short_name) === position.bookSlug)?.id
    : undefined;

  const groups = mode === 'kategorier'
    ? categoryGroups()
    : mode === 'alfabetisk'
      ? alphabeticalGroups()
      : chronologicalGroups();

  return (
    <section className={styles.section} aria-labelledby="books-heading">
      <div className={styles.head}>
        <h2 id="books-heading">Bibelens bøker</h2>
        <div className={styles.tabs} role="tablist">
          {(['kategorier', 'alfabetisk', 'kronologisk'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              className={`${styles.tab} ${mode === m ? styles.tabActive : ''}`}
              onClick={() => setMode(m)}
              role="tab"
              aria-selected={mode === m}
            >
              {m === 'kategorier' ? 'Kategorier' : m === 'alfabetisk' ? 'Alfabetisk' : 'Kronologisk'}
            </button>
          ))}
        </div>
      </div>

      {groups.map(group => (
        <div key={group.label} className={styles.group}>
          <div className={styles.groupLabel}>{group.label}</div>
          <div className={styles.grid}>
            {group.books.map(book => {
              const isCurrent = book.id === currentBookId;
              return (
                <Link
                  key={book.id}
                  to={`/${toUrlSlug(book.short_name)}/${isCurrent && position ? position.chapter : 1}`}
                  className={`${styles.book} ${isCurrent ? styles.bookCurrent : ''}`}
                >
                  <span className={styles.bookName}>{book.name_no}</span>
                  <span className={styles.bookMeta}>
                    {book.chapters} kap.{isCurrent ? ' · nå' : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
