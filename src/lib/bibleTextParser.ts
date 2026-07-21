import type { StoredChapter, StoredVerse } from './offline/db';

export interface MappingData {
  bookNames: Record<string, number>; // "1 Mos" -> 1
}

export interface ParseResult {
  chapters: StoredChapter[];
  stats: { books: number; chapters: number; verses: number };
  warnings: string[];
}

/**
 * Parse a Bible text file where each line has format:
 *   BookName chapter,verse text
 * Example:
 *   1 Mos 1,1 I begynnelsen skapte Gud himmelen og jorden.
 */
export function parseBibleText(
  text: string,
  mapping: MappingData,
  bibleId: string
): ParseResult {
  const lines = text.split('\n');
  const warnings: string[] = [];

  // Build a sorted list of book name prefixes (longest first for greedy matching)
  const bookNamesSorted = Object.keys(mapping.bookNames).sort(
    (a, b) => b.length - a.length
  );

  // Group verses by [bookId, chapter] (original numbering)
  const chapterMap = new Map<string, { verses: StoredVerse[]; bookId: number; chapter: number }>();

  let parsedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try to match a book name prefix
    let matchedBookName: string | null = null;
    let bookId: number | null = null;

    for (const name of bookNamesSorted) {
      if (line.startsWith(name + ' ')) {
        matchedBookName = name;
        bookId = mapping.bookNames[name];
        break;
      }
    }

    if (!matchedBookName || !bookId) {
      // Could be a header line or unrecognized - skip silently unless it looks like a verse
      if (/^\S+\s+\d+,\d+/.test(line)) {
        warnings.push(`Linje ${i + 1}: Ukjent boknavn: ${line.substring(0, 40)}...`);
      }
      continue;
    }

    // Rest after book name
    const rest = line.substring(matchedBookName.length + 1);

    // Match chapter,verse pattern
    const refMatch = rest.match(/^(\d+),(\d+)\s+(.+)$/);
    if (!refMatch) {
      warnings.push(`Linje ${i + 1}: Kunne ikke lese kapittel/vers: ${line.substring(0, 40)}...`);
      continue;
    }

    const srcChapter = parseInt(refMatch[1], 10);
    const srcVerse = parseInt(refMatch[2], 10);
    const verseText = refMatch[3];

    // Store with original numbering (no conversion)
    const chapterKey = `${bookId}-${srcChapter}`;
    if (!chapterMap.has(chapterKey)) {
      chapterMap.set(chapterKey, {
        bookId,
        chapter: srcChapter,
        verses: [],
      });
    }

    chapterMap.get(chapterKey)!.verses.push({
      id: 0,
      book_id: bookId,
      chapter: srcChapter,
      verse: srcVerse,
      text: verseText,
      bible: bibleId,
    });

    parsedCount++;
  }

  // Convert to StoredChapter array, sorting verses within each chapter
  const chapters: StoredChapter[] = [];
  const bookIds = new Set<number>();

  for (const entry of chapterMap.values()) {
    entry.verses.sort((a, b) => a.verse - b.verse);
    bookIds.add(entry.bookId);

    chapters.push({
      bookId: entry.bookId,
      chapter: entry.chapter,
      bible: bibleId,
      verses: entry.verses,
      cachedAt: Date.now(),
    });
  }

  chapters.sort((a, b) => a.bookId - b.bookId || a.chapter - b.chapter);

  return {
    chapters,
    stats: {
      books: bookIds.size,
      chapters: chapters.length,
      verses: parsedCount,
    },
    warnings: warnings.slice(0, 50), // Cap at 50 warnings
  };
}
