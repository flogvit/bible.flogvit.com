// Bible references inside running text — a sermon, a manuscript, an article —
// rather than a field that holds nothing else.
//
// A reference is a capitalised book name or abbreviation followed by numbers in
// one of the forms `parseReferences` reads ("Joh 3,16", "John 3:16-18",
// "1. Kor 13", "Rom 8:28; 9:1"). The book is found by trying the words before
// the numbers from the longest run to the shortest, so "som det står i Joh
// 3,16" finds "Joh" and "Song of Songs 2:1" finds all three words.
//
// Capitalised because running text is full of short words that are also book
// abbreviations — Norwegian "hos 3 av dem" would otherwise be Hosea 3. A book
// name in a manuscript is written with a capital; the cost is a reference
// written in lower case, which is rare in text meant for a reader.
//
// Verse letters ("64,6b") are dropped: the reference is to the verse.

import { bookName } from '../../src/lib/books-data.ts';
import { getChapterVerseCount } from '../../src/lib/verse-counts.ts';
import { findBook } from './books.ts';
import { parseReferences, type Passage } from './reference.ts';

export interface FoundReference {
  /** 1-based, counted from `firstLine`. */
  line: number;
  /** 1-based, in UTF-16 code units like an editor's column. */
  column: number;
  /** The reference exactly as it stands in the text. */
  written: string;
  passages: Passage[];
  /** Why the reference points at nothing; absent when it is fine. */
  problem?: string;
}

const VERSE = String.raw`\d+[a-c]?`;
const RANGE = String.raw`${VERSE}(?:[-–]${VERSE}(?:[:,]${VERSE})?)?`;
/** "3", "3-4", "3:16", "3,16-18", "3:16,18", "3,16.18", "3:16-4:2". */
const SPEC = String.raw`\d+(?:[:,]${RANGE}(?:[.,]${RANGE})*|[-–]\d+)?`;
const WORD = String.raw`\p{L}[\p{L}'’]*\.?`;
const CANDIDATE = new RegExp(
  String.raw`(?<![\p{L}\d])((?:[1-5]\.?\s?)?\p{Lu}[\p{L}'’]*\.?(?:\s+${WORD}){0,3})\s+(${SPEC}(?:;\s*${SPEC})*)(?![\p{L}\d])`,
  'gu',
);

/** The longest run of trailing words that names a book, with its offset in `words`. */
function bookAtEnd(words: string): { offset: number; name: string } | undefined {
  const starts = [0];
  for (const m of words.matchAll(/\s+/g)) starts.push(m.index! + m[0].length);
  for (const start of starts) {
    const name = words.slice(start);
    // "1. Kor" is one name, and so is "Kor" — but "i Joh" is not.
    if (!/^(?:[1-5]\.?\s?)?\p{Lu}/u.test(name)) continue;
    if (findBook(name)) return { offset: start, name };
  }
  return undefined;
}

function verseProblem(p: Passage, lang: string): string | undefined {
  for (const [chapter, verse] of [
    [p.chapter, p.verseStart],
    [p.endChapter, p.verseEnd],
  ] as const) {
    if (verse === null) continue;
    const count = getChapterVerseCount(p.book.id, chapter);
    if (verse > count) return `${bookName(p.book, lang)} ${chapter} has ${count} verses, not ${verse}.`;
  }
  return undefined;
}

/**
 * `inMapping`: the text is in another verse numbering (#169). Every chapter
 * number is read then, and verse counts are not checked against osnb — the
 * caller checks each passage against the mapping.
 */
export function findReferences(text: string, firstLine = 1, lang = 'en', inMapping = false): FoundReference[] {
  const found: FoundReference[] = [];
  text.split(/\r?\n/).forEach((lineText, i) => {
    CANDIDATE.lastIndex = 0;
    for (let m = CANDIDATE.exec(lineText); m; m = CANDIDATE.exec(lineText)) {
      const book = bookAtEnd(m[1]!);
      if (!book) {
        // "Jf. 1. Kor 13" first matches "Jf. 1": no book, and the "1." belongs
        // to the next one. Look again from just after where this match began.
        CANDIDATE.lastIndex = m.index + 1;
        continue;
      }
      const column = m.index! + book.offset + 1;
      const written = lineText.slice(column - 1, m.index! + m[0].length);
      const spec = m[2]!.replace(/(\d)[a-c]/g, '$1');
      const { passages, errors } = parseReferences(`${book.name} ${spec}`, { anyChapter: inMapping });
      const problem = errors.length
        ? errors.map((e) => e.replace(/^"[^"]*": /, '')).join(' ')
        : inMapping
          ? undefined
          : passages.map((p) => verseProblem(p, lang)).find(Boolean);
      found.push({ line: firstLine + i, column, written, passages, ...(problem ? { problem } : {}) });
    }
  });
  return found;
}
