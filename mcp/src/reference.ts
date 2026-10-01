// Bible references as a model writes them, in both conventions:
//
//   English    John 3:16   John 3:16-18   John 3:16,18   John 3:16-4:2
//   Norwegian  Joh 3,16    Joh 3,16-18    Joh 3,16.18    Joh 3,16-4,2
//
// plus whole chapters ("Ps 23", "Ps 23-24") and several references separated
// by ";", where a reference without a book keeps the previous one
// ("Rom 8:28; 9:1"). A single-chapter book takes the number as a verse
// ("Jude 3"), which is how those books are always cited.

import type { BookInfo } from '../../src/lib/books-data.ts';
import { findBook } from './books.ts';

export interface Passage {
  book: BookInfo;
  chapter: number;
  /** null = from the start of the chapter. */
  verseStart: number | null;
  endChapter: number;
  /** null = to the end of `endChapter`. */
  verseEnd: number | null;
}

export interface ParsedReferences {
  passages: Passage[];
  errors: string[];
}

const BOOK_AND_REST = /^((?:[1-3]\s*\.?\s*)?\p{L}[^\d]*?)\s*(\d.*)?$/u;
const NUMBERS_ONLY = /^\d/;

export function parseReferences(input: string): ParsedReferences {
  const passages: Passage[] = [];
  const errors: string[] = [];
  let book: BookInfo | undefined;

  for (const raw of input.split(';')) {
    const part = raw.trim();
    if (!part) continue;

    let rest: string;
    if (NUMBERS_ONLY.test(part) && !BOOK_AND_REST.test(part)) {
      if (!book) {
        errors.push(`"${part}": no book given.`);
        continue;
      }
      rest = part;
    } else {
      const m = part.match(BOOK_AND_REST);
      const found = m ? findBook(m[1]!) : undefined;
      if (!found) {
        errors.push(`"${part}": unknown book "${m?.[1]?.trim() ?? part}".`);
        continue;
      }
      book = found;
      if (!m![2]) {
        errors.push(`"${part}": add a chapter, e.g. "${part} 1".`);
        continue;
      }
      rest = m![2];
    }

    const result = parseNumbers(book, rest.replace(/\s+/g, '').replace(/[–—]/g, '-'));
    if (typeof result === 'string') errors.push(`"${part}": ${result}`);
    else passages.push(...result);
  }

  return { passages, errors };
}

function parseNumbers(book: BookInfo, spec: string): Passage[] | string {
  const single = book.chapters === 1;

  // No chapter/verse separator: a chapter or a chapter range — or, in a
  // single-chapter book, verses.
  const plain = spec.match(/^(\d+)(?:-(\d+))?$/);
  if (plain) {
    const a = Number(plain[1]);
    const b = plain[2] ? Number(plain[2]) : a;
    if (single) return checked(book, [{ book, chapter: 1, verseStart: a, endChapter: 1, verseEnd: b }]);
    return checked(book, [{ book, chapter: a, verseStart: null, endChapter: b, verseEnd: null }]);
  }

  const withVerses = spec.match(/^(\d+)([:,])(.+)$/);
  if (!withVerses) return `cannot read "${spec}" as chapter and verses.`;
  const chapter = Number(withVerses[1]);
  const listSeparator = withVerses[2] === ':' ? ',' : '.';

  const passages: Passage[] = [];
  for (const item of withVerses[3]!.split(listSeparator)) {
    const m = item.match(/^(\d+)(?:-(\d+)(?:[:,](\d+))?)?$/);
    if (!m) return `cannot read verses "${item}".`;
    const from = Number(m[1]);
    if (m[3]) {
      passages.push({ book, chapter, verseStart: from, endChapter: Number(m[2]), verseEnd: Number(m[3]) });
    } else {
      const to = m[2] ? Number(m[2]) : from;
      passages.push({ book, chapter, verseStart: from, endChapter: chapter, verseEnd: to });
    }
  }
  return checked(book, passages);
}

function checked(book: BookInfo, passages: Passage[]): Passage[] | string {
  for (const p of passages) {
    for (const c of [p.chapter, p.endChapter]) {
      if (c < 1 || c > book.chapters) return `chapter ${c} does not exist (the book has ${book.chapters}).`;
    }
    if (p.endChapter < p.chapter) return 'the range runs backwards.';
    if (p.endChapter === p.chapter && p.verseStart !== null && p.verseEnd !== null && p.verseEnd < p.verseStart) {
      return 'the verse range runs backwards.';
    }
    if (p.verseStart === 0 || p.verseEnd === 0) return 'verses start at 1.';
  }
  return passages;
}

/** Does verse `chapter:verse` fall inside the passage? */
export function contains(p: Passage, chapter: number, verse: number): boolean {
  const after = chapter > p.chapter || (chapter === p.chapter && (p.verseStart === null || verse >= p.verseStart));
  const before = chapter < p.endChapter || (chapter === p.endChapter && (p.verseEnd === null || verse <= p.verseEnd));
  return after && before;
}

/** The chapters a passage touches, in order. */
export function chaptersOf(p: Passage): number[] {
  const out: number[] = [];
  for (let c = p.chapter; c <= p.endChapter; c++) out.push(c);
  return out;
}
