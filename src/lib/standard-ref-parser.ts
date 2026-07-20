/**
 * Client-safe standard Norwegian Bible reference parser.
 * Only depends on static data (books-data.ts, book-aliases.ts).
 *
 * Supports formats:
 * - "Joh 3,16"          → single verse
 * - "Joh 3,16-19"       → verse range
 * - "Joh 3,16.19"       → specific verses (16 and 19)
 * - "Joh 3,16-19.21"    → range 16-19 plus verse 21
 * - "Joh 3,16-19;4,1-5" → multiple chapters (semicolon = new chapter)
 * - "Joh 3,16-4,20"     → cross-chapter range
 * - "Joh 3"             → whole chapter
 */

import { booksData, type BookInfo } from './books-data.ts';
import { bookAliases } from './book-aliases.ts';

export interface RefSegment {
  bookId: number;
  bookShortName: string;
  chapter: number;
  verses?: number[];    // explicit verse list when known
  fromVerse?: number;   // for open-ended ranges (from this verse to end of chapter)
}

export interface VerseRef {
  bookId: number;
  chapter: number;
  verse?: number;
  verses?: number[];
}

/**
 * Client-safe book lookup using static data and aliases
 */
export function findBookClient(input: string): BookInfo | undefined {
  const normalized = input.toLowerCase().trim();

  const aliasId = bookAliases[normalized];
  if (aliasId) return booksData.find(b => b.id === aliasId);

  const shortMatch = booksData.find(b => b.short_name.toLowerCase() === normalized);
  if (shortMatch) return shortMatch;

  return booksData.find(b => b.name_no.toLowerCase() === normalized);
}

/**
 * Extract book name and remaining text from a reference string
 */
function extractBookAndRest(input: string): { book: BookInfo; rest: string } | null {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);

  // Try from longest to shortest prefix (max 3 words for book name)
  for (let i = Math.min(words.length - 1, 3); i >= 1; i--) {
    const bookPart = words.slice(0, i).join(' ');
    const rest = words.slice(i).join(' ');
    const book = findBookClient(bookPart);
    if (book && /^\d/.test(rest)) {
      return { book, rest };
    }
  }

  return null;
}

/**
 * Parse a single chapter-verse segment (after book name, between semicolons)
 */
function parseSegment(spec: string, bookId: number, bookShortName: string): RefSegment[] {
  spec = spec.trim();
  if (!spec) return [];

  // Check for cross-chapter range: "3,16-4,20"
  const crossMatch = spec.match(/^(\d+),(\d+)-(\d+),(\d+)$/);
  if (crossMatch) {
    const startCh = parseInt(crossMatch[1]!);
    const startV = parseInt(crossMatch[2]!);
    const endCh = parseInt(crossMatch[3]!);
    const endV = parseInt(crossMatch[4]!);

    if (startCh === endCh) {
      const verses: number[] = [];
      for (let v = startV; v <= endV; v++) verses.push(v);
      return [{ bookId, bookShortName, chapter: startCh, verses }];
    }

    const segments: RefSegment[] = [];
    // First chapter: from startVerse to end of chapter
    segments.push({ bookId, bookShortName, chapter: startCh, fromVerse: startV });
    // Middle chapters: whole chapters
    for (let ch = startCh + 1; ch < endCh; ch++) {
      segments.push({ bookId, bookShortName, chapter: ch });
    }
    // Last chapter: verse 1 to endVerse
    const endVerses: number[] = [];
    for (let v = 1; v <= endV; v++) endVerses.push(v);
    segments.push({ bookId, bookShortName, chapter: endCh, verses: endVerses });

    return segments;
  }

  // Regular format: "chapter" or "chapter,verseSpec"
  const commaIdx = spec.indexOf(',');
  if (commaIdx === -1) {
    const chapter = parseInt(spec);
    if (isNaN(chapter)) return [];
    return [{ bookId, bookShortName, chapter }];
  }

  const chapter = parseInt(spec.substring(0, commaIdx));
  if (isNaN(chapter)) return [];

  const verseSpec = spec.substring(commaIdx + 1);

  // Parse verse specification (dot-separated elements)
  const parts = verseSpec.split('.');
  const verses: number[] = [];

  for (const part of parts) {
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;

    if (trimmedPart.includes('-')) {
      const [startStr, endStr] = trimmedPart.split('-');
      const start = parseInt(startStr!);
      const end = parseInt(endStr!);
      if (!isNaN(start) && !isNaN(end)) {
        for (let v = start; v <= end; v++) verses.push(v);
      }
    } else {
      const v = parseInt(trimmedPart);
      if (!isNaN(v)) verses.push(v);
    }
  }

  return [{ bookId, bookShortName, chapter, verses }];
}

/**
 * Parse a standard Norwegian Bible reference string.
 * Returns an array of RefSegments (one per chapter referenced).
 */
export function parseStandardRef(input: string): RefSegment[] {
  const result = extractBookAndRest(input);
  if (!result) return [];

  const { book, rest } = result;

  // Split on semicolons for chapter segments
  const segmentStrs = rest.split(';');
  const segments: RefSegment[] = [];

  for (const segStr of segmentStrs) {
    segments.push(...parseSegment(segStr, book.id, book.short_name));
  }

  return segments;
}

/**
 * Convert RefSegments to VerseRef[] for API calls.
 * For open-ended ranges (fromVerse) or whole chapters, generates verses up to 200.
 * The API gracefully skips non-existent verse numbers.
 */
export function refSegmentsToVerseRefs(segments: RefSegment[]): VerseRef[] {
  return segments.map(s => {
    if (s.verses && s.verses.length > 0) {
      return { bookId: s.bookId, chapter: s.chapter, verses: s.verses };
    }
    if (s.fromVerse !== undefined) {
      const verses: number[] = [];
      for (let v = s.fromVerse; v <= 200; v++) verses.push(v);
      return { bookId: s.bookId, chapter: s.chapter, verses };
    }
    // Whole chapter
    const verses: number[] = [];
    for (let v = 1; v <= 200; v++) verses.push(v);
    return { bookId: s.bookId, chapter: s.chapter, verses };
  });
}

/**
 * Build a URL for the first verse of a RefSegment
 */
export function refSegmentToUrl(segment: RefSegment): string {
  const slug = segment.bookShortName.toLowerCase();
  let url = `/${slug}/${segment.chapter}`;
  const firstVerse = segment.verses?.[0] || segment.fromVerse;
  if (firstVerse) {
    url += `#v${firstVerse}`;
  }
  return url;
}
