import type { Book } from './bible.ts';
import { getAllBooks, getBookById, getBookUrlSlug } from './bible.ts';
import { bookAliases } from './book-aliases.ts';
import { bookNameById } from './books-data.ts';

export interface ParsedReference {
  book: Book;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  url: string;
}

export interface BookSuggestion {
  book: Book;
  matchedAlias: string;
}

export interface ParseResult {
  success: boolean;
  reference?: ParsedReference;
  suggestions?: BookSuggestion[];
  error?: string;
  partial?: {
    book?: Book;
    chapter?: number;
  };
}

/**
 * Normalize input for comparison
 */
function normalizeInput(input: string): string {
  return input.toLowerCase().trim();
}

/**
 * Find book by alias or partial match
 */
export function findBook(input: string): Book | undefined {
  const normalized = normalizeInput(input);

  // Direct alias match
  if (bookAliases[normalized]) {
    return getBookById(bookAliases[normalized]);
  }

  // Try matching short_name directly
  const books = getAllBooks();
  const shortMatch = books.find(b => b.short_name.toLowerCase() === normalized);
  if (shortMatch) return shortMatch;

  // Try matching full Norwegian name
  const nameMatch = books.find(b => b.name_no.toLowerCase() === normalized);
  if (nameMatch) return nameMatch;

  return undefined;
}

/**
 * Get book suggestions based on partial input
 */
export function getBookSuggestions(input: string): BookSuggestion[] {
  const normalized = normalizeInput(input);
  if (!normalized) return [];

  const books = getAllBooks();
  const suggestions: BookSuggestion[] = [];
  const seenBookIds = new Set<number>();

  // Check all aliases for partial matches
  for (const [alias, bookId] of Object.entries(bookAliases)) {
    if (alias.startsWith(normalized) && !seenBookIds.has(bookId)) {
      const book = books.find(b => b.id === bookId);
      if (book) {
        suggestions.push({ book, matchedAlias: alias });
        seenBookIds.add(bookId);
      }
    }
  }

  // Also check short_name and name_no
  for (const book of books) {
    if (seenBookIds.has(book.id)) continue;

    if (book.short_name.toLowerCase().startsWith(normalized)) {
      suggestions.push({ book, matchedAlias: book.short_name });
      seenBookIds.add(book.id);
    } else if (book.name_no.toLowerCase().startsWith(normalized)) {
      suggestions.push({ book, matchedAlias: book.name_no });
      seenBookIds.add(book.id);
    }
  }

  // Sort by book ID for consistent ordering
  return suggestions.sort((a, b) => a.book.id - b.book.id);
}

/**
 * Parse a Bible reference string
 * Supports formats like:
 * - "mat 4,5" or "matt 4:5" or "matteus 4.5"
 * - "1 mos 3,16" or "1mos 3:16"
 * - "joh 3:16-17" (verse range)
 * - "sal 23" (whole chapter)
 */
export function parseReference(input: string): ParseResult {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return { success: false, error: 'Tom input' };
  }

  // Pattern to match book name (with optional number prefix) and chapter/verse
  // Examples: "1 mos 3,16", "matt 4:5", "sal 23", "joh 3:16-17"
  const pattern = /^(\d?\s*\.?\s*[a-zæøå]+)\s*(\d+)?(?:[,:.\s]+(\d+))?(?:\s*[-–]\s*(\d+))?$/i;
  const match = normalized.match(pattern);

  if (!match) {
    // Try to at least find a book match for suggestions
    const suggestions = getBookSuggestions(normalized);
    if (suggestions.length > 0) {
      return {
        success: false,
        suggestions,
        partial: { book: suggestions[0]!.book }
      };
    }
    return { success: false, error: 'Ugyldig format' };
  }

  const [, bookPart, chapterStr, verseStartStr, verseEndStr] = match;

  // Find the book
  const book = findBook(bookPart!.trim());

  if (!book) {
    const suggestions = getBookSuggestions(bookPart!.trim());
    if (suggestions.length > 0) {
      return { success: false, suggestions, error: 'Fant ikke bok' };
    }
    return { success: false, error: 'Fant ikke bok' };
  }

  // If no chapter specified, return partial result
  if (!chapterStr) {
    return {
      success: false,
      partial: { book },
      error: 'Mangler kapittel'
    };
  }

  const chapter = parseInt(chapterStr, 10);

  // Validate chapter
  if (chapter < 1 || chapter > book.chapters) {
    return {
      success: false,
      partial: { book },
      error: `${book.name_no} har ${book.chapters} kapitler`
    };
  }

  const verseStart = verseStartStr ? parseInt(verseStartStr, 10) : undefined;
  const verseEnd = verseEndStr ? parseInt(verseEndStr, 10) : verseStart;

  // Build URL with ASCII-safe slug
  const urlSlug = getBookUrlSlug(book);
  let url = `/${urlSlug}/${chapter}`;
  if (verseStart) {
    url += `#v${verseStart}`;
  }

  return {
    success: true,
    reference: {
      book,
      chapter,
      verseStart,
      verseEnd,
      url
    }
  };
}

/**
 * Check if input looks like a Bible reference
 */
export function looksLikeReference(input: string): boolean {
  const normalized = normalizeInput(input);
  if (!normalized) return false;

  // Check if it starts with something that could be a book name
  const bookPattern = /^(\d?\s*\.?\s*)?[a-zæøå]{2,}/i;
  if (!bookPattern.test(normalized)) return false;

  // Check if there's a number after the potential book name
  const hasNumber = /[a-zæøå]\s*\d/.test(normalized);

  // Or check if the input matches known book aliases/names
  const suggestions = getBookSuggestions(normalized.split(/[\s\d]/)[0]!);

  return hasNumber || suggestions.length > 0;
}

/**
 * Referansen slik den skal VISES — kommandopaletten (⌘K) og oppslaget i
 * studiepanelet skriver denne strengen rett i lista.
 *
 * `name_no` er nøkkelen parseren slår opp PÅ, og sto her som visningsnavn: det
 * ga «Matteus 5» i paletten på alle åtte språk, også engelsk (#69).
 * `bookNameById()` leser locale fra contextStorage, og `/api/*` setter den fra
 * `?lang=`/Referer (#24), så oppslaget svarer på leserens språk. Nøkkelen er
 * fallback for en bok-id som ikke finnes i den statiske tabellen — da er den
 * bedre enn en tom streng.
 */
export function formatParsedReference(ref: ParsedReference): string {
  let result = `${bookNameById(ref.book.id) || ref.book.name_no} ${ref.chapter}`;
  if (ref.verseStart) {
    result += `:${ref.verseStart}`;
    if (ref.verseEnd && ref.verseEnd !== ref.verseStart) {
      result += `-${ref.verseEnd}`;
    }
  }
  return result;
}
