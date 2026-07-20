// Portert fra bibel (better-sqlite3) til Bun.sql mot MySQL.
// Alle DB-funksjoner er async; bok-metadata caches ved oppstart via initBooks()
// slik at bok-oppslag (getAllBooks/getBookById/...) forblir synkrone — de brukes
// synkront av reference-parser.ts.

import { getSql } from './db.ts';

// Re-export toUrlSlug for convenience (server-side usage)
export { toUrlSlug } from './url-utils.ts';
import { toUrlSlug } from './url-utils.ts';

export interface Book {
  id: number;
  name: string;
  name_no: string;
  short_name: string;
  testament: string;
  chapters: number;
}

export type VersionType = 'error' | 'suggestion' | 'theological' | 'grammar';
export type VersionSeverity = 'critical' | 'major' | 'minor';

export interface VerseVersion {
  text: string;
  explanation: string;
  type?: VersionType;
  severity?: VersionSeverity;
}

export interface VerseFootnote {
  text: string;
  source?: string;
}

export interface Verse {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
  bible: string;
  versions?: VerseVersion[];
  footnotes?: VerseFootnote[];
}

export interface Word4Word {
  word_index: number;
  word: string;
  original: string | null;
  pronunciation: string | null;
  explanation: string | null;
}

export interface Reference {
  to_book_id: number;
  to_chapter: number;
  to_verse_start: number;
  to_verse_end: number;
  description: string | null;
  book_short_name?: string;
}

// --- Bok-metadata (synkron cache) ---

let booksCache: Book[] | null = null;

/** Laster bok-metadata inn i minnet. Må kjøres ved oppstart før bok-oppslag. */
export async function initBooks(): Promise<void> {
  const sql = getSql();
  booksCache = await sql`SELECT * FROM books ORDER BY id` as Book[];
}

function requireBooks(): Book[] {
  if (!booksCache) throw new Error('initBooks() er ikke kjørt');
  return booksCache;
}

/**
 * Get URL slug for a book (ASCII-safe version of short_name)
 */
export function getBookUrlSlug(book: Book): string {
  return toUrlSlug(book.short_name);
}

export function getBookByShortName(shortName: string): Book | undefined {
  const books = requireBooks();
  const normalized = shortName.toLowerCase();

  // First try exact match
  const book = books.find(b => b.short_name.toLowerCase() === normalized);
  if (book) return book;

  // Try matching with ASCII conversion (e.g., "ap" matches "Åp")
  return books.find(b => toUrlSlug(b.short_name) === normalized);
}

export function getBookById(id: number): Book | undefined {
  return requireBooks().find(b => b.id === id);
}

export function getAllBooks(): Book[] {
  return requireBooks();
}

interface VerseRow {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
  bible: string;
  versions: string | null;
  footnotes: string | null;
}

export async function getVerses(bookId: number, chapter: number, bible = 'osnb2'): Promise<Verse[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM verses WHERE book_id = ${bookId} AND chapter = ${chapter} AND bible = ${bible} ORDER BY verse
  ` as VerseRow[];

  return rows.map(row => ({
    ...row,
    versions: row.versions ? JSON.parse(row.versions) : undefined,
    footnotes: row.footnotes ? JSON.parse(row.footnotes) : undefined,
  }));
}

export async function getOriginalVerses(bookId: number, chapter: number): Promise<Verse[]> {
  const sql = getSql();
  // GT (book 1-39) uses tanach (Hebrew), NT (book 40-66) uses sblgnt (Greek)
  const bible = bookId <= 39 ? 'tanach' : 'sblgnt';
  return await sql`
    SELECT * FROM verses WHERE book_id = ${bookId} AND chapter = ${chapter} AND bible = ${bible} ORDER BY verse
  ` as Verse[];
}

export function getOriginalLanguage(bookId: number): 'hebrew' | 'greek' {
  return bookId <= 39 ? 'hebrew' : 'greek';
}

export interface VerseRef {
  bookId: number;
  chapter: number;
  verse?: number;
  verses?: number[];
}

export interface VerseWithOriginal {
  verse: Verse;
  originalText: string | null;
  originalLanguage: 'hebrew' | 'greek';
  bookShortName: string;
}

export async function getVerse(bookId: number, chapter: number, verseNum: number, bible = 'osnb2'): Promise<Verse | undefined> {
  const sql = getSql();
  const [row] = await sql`
    SELECT * FROM verses WHERE book_id = ${bookId} AND chapter = ${chapter} AND verse = ${verseNum} AND bible = ${bible}
  ` as VerseRow[];

  if (!row) return undefined;

  return {
    ...row,
    versions: row.versions ? JSON.parse(row.versions) : undefined,
    footnotes: row.footnotes ? JSON.parse(row.footnotes) : undefined,
  };
}

export async function getOriginalVerse(bookId: number, chapter: number, verseNum: number): Promise<Verse | undefined> {
  const sql = getSql();
  const bible = bookId <= 39 ? 'tanach' : 'sblgnt';
  const [row] = await sql`
    SELECT * FROM verses WHERE book_id = ${bookId} AND chapter = ${chapter} AND verse = ${verseNum} AND bible = ${bible}
  ` as Verse[];
  return row;
}

export async function getVersesWithOriginal(refs: VerseRef[], bible = 'osnb2'): Promise<VerseWithOriginal[]> {
  const results: VerseWithOriginal[] = [];

  for (const ref of refs) {
    const book = getBookById(ref.bookId);
    if (!book) continue;

    const verseNums = ref.verses || (ref.verse ? [ref.verse] : []);

    for (const verseNum of verseNums) {
      const verse = await getVerse(ref.bookId, ref.chapter, verseNum, bible);
      if (!verse) continue;

      const originalVerse = await getOriginalVerse(ref.bookId, ref.chapter, verseNum);

      results.push({
        verse,
        originalText: originalVerse?.text || null,
        originalLanguage: getOriginalLanguage(ref.bookId),
        bookShortName: book.short_name
      });
    }
  }

  return results;
}

export async function getWord4Word(bookId: number, chapter: number, verse: number, bible = 'osnb2'): Promise<Word4Word[]> {
  const sql = getSql();
  return await sql`
    SELECT word_index, word, original, pronunciation, explanation FROM word4word
    WHERE book_id = ${bookId} AND chapter = ${chapter} AND verse = ${verse} AND bible = ${bible} ORDER BY word_index
  ` as Word4Word[];
}

export async function getOriginalWord4Word(bookId: number, chapter: number, verse: number, lang = 'nb'): Promise<Word4Word[]> {
  // GT (book 1-39) uses tanach (Hebrew), NT (book 40-66) uses sblgnt (Greek)
  // Combined with language: tanach-nb, tanach-nn, sblgnt-nb, sblgnt-nn
  const original = bookId <= 39 ? 'tanach' : 'sblgnt';
  const bible = `${original}-${lang}`;
  return getWord4Word(bookId, chapter, verse, bible);
}

export async function getReferences(bookId: number, chapter: number, verse: number, lang = 'nb'): Promise<Reference[]> {
  const sql = getSql();
  const refs = await sql`
    SELECT r.*, b.short_name as book_short_name
    FROM references_ r
    JOIN books b ON r.to_book_id = b.id
    WHERE r.from_book_id = ${bookId} AND r.from_chapter = ${chapter} AND r.from_verse = ${verse} AND r.language = ${lang}
  ` as Reference[];

  // Fallback to 'nb' if no results for the requested language
  if (refs.length === 0 && lang !== 'nb') {
    return await sql`
      SELECT r.*, b.short_name as book_short_name
      FROM references_ r
      JOIN books b ON r.to_book_id = b.id
      WHERE r.from_book_id = ${bookId} AND r.from_chapter = ${chapter} AND r.from_verse = ${verse} AND r.language = 'nb'
    ` as Reference[];
  }

  return refs;
}

export async function getBookSummary(bookId: number): Promise<string | null> {
  const sql = getSql();
  const [result] = await sql`
    SELECT summary FROM book_summaries WHERE book_id = ${bookId}
  ` as { summary: string }[];
  return result?.summary ?? null;
}

export async function getChapterSummary(bookId: number, chapter: number): Promise<string | null> {
  const sql = getSql();
  const [result] = await sql`
    SELECT summary FROM chapter_summaries WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { summary: string }[];
  return result?.summary ?? null;
}

export async function getChapterContext(bookId: number, chapter: number): Promise<string | null> {
  const sql = getSql();
  const [result] = await sql`
    SELECT context FROM chapter_context WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { context: string }[];
  return result?.context ?? null;
}

export async function getImportantWords(bookId: number, chapter: number): Promise<{ word: string; explanation: string }[]> {
  const sql = getSql();
  return await sql`
    SELECT word, explanation FROM important_words WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { word: string; explanation: string }[];
}

export async function getVersePrayer(bookId: number, chapter: number, verse: number): Promise<string | null> {
  const sql = getSql();
  const [result] = await sql`
    SELECT prayer FROM verse_prayers WHERE book_id = ${bookId} AND chapter = ${chapter} AND verse = ${verse}
  ` as { prayer: string }[];
  return result?.prayer ?? null;
}

export async function getVerseSermon(bookId: number, chapter: number, verse: number): Promise<string | null> {
  const sql = getSql();
  const [result] = await sql`
    SELECT sermon FROM verse_sermons WHERE book_id = ${bookId} AND chapter = ${chapter} AND verse = ${verse}
  ` as { sermon: string }[];
  return result?.sermon ?? null;
}

export function formatReference(ref: Reference): string {
  const verseRange = ref.to_verse_start === ref.to_verse_end
    ? `${ref.to_verse_start}`
    : `${ref.to_verse_start}-${ref.to_verse_end}`;
  return `${ref.book_short_name} ${ref.to_chapter}:${verseRange}`;
}

export interface ImportantVerse {
  book_id: number;
  chapter: number;
  verse: number;
  text: string | null;
}

export async function getImportantVersesForChapter(bookId: number, chapter: number): Promise<number[]> {
  const sql = getSql();
  const results = await sql`
    SELECT verse FROM important_verses WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { verse: number }[];
  return results.map(r => r.verse);
}

export interface WellKnownVerse {
  book_id: number;
  book_name_no: string;
  book_short_name: string;
  chapter: number;
  verse: number;
  text: string;
  verse_text: string;
}

export async function getAllWellKnownVerses(): Promise<WellKnownVerse[]> {
  const sql = getSql();
  return await sql`
    SELECT
      iv.book_id,
      b.name_no as book_name_no,
      b.short_name as book_short_name,
      iv.chapter,
      iv.verse,
      iv.text,
      v.text as verse_text
    FROM important_verses iv
    JOIN books b ON iv.book_id = b.id
    JOIN verses v ON iv.book_id = v.book_id AND iv.chapter = v.chapter AND iv.verse = v.verse AND v.bible = 'osnb2'
    ORDER BY iv.book_id, iv.chapter, iv.verse
  ` as WellKnownVerse[];
}

export interface SearchResult {
  book_id: number;
  book_name_no: string;
  book_short_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface Theme {
  id: number;
  name: string;
  content: string;
}

// Gammelt format (txt-filer)
export interface ThemeItem {
  title: string;
  description: string;
}

// Nytt JSON-format
export interface ThemeVerseRef {
  bookId: number;
  chapter: number;
  verse?: number;
  verses?: number[];
}

export interface ThemeSection {
  title: string;
  description?: string;
  verses: ThemeVerseRef[];
}

export interface ThemeData {
  title: string;
  introduction?: string;
  sections: ThemeSection[];
}

export async function getAllThemes(): Promise<Theme[]> {
  const sql = getSql();
  return await sql`SELECT * FROM themes ORDER BY name` as Theme[];
}

export async function getThemeByName(name: string): Promise<Theme | undefined> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM themes WHERE name = ${name}` as Theme[];
  return row;
}

export function isJsonTheme(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && 'sections' in parsed;
  } catch {
    return false;
  }
}

export function parseThemeJson(content: string): ThemeData | null {
  try {
    return JSON.parse(content) as ThemeData;
  } catch {
    return null;
  }
}

// Beholdes for bakoverkompatibilitet med txt-filer
export function parseThemeContent(content: string): ThemeItem[] {
  return content.split('\n')
    .filter(line => line.includes(':'))
    .map(line => {
      const colonIdx = line.indexOf(':');
      return {
        title: line.substring(0, colonIdx).trim(),
        description: line.substring(colonIdx + 1).trim()
      };
    });
}

// --- Dager (helligdager/merkedager) ---

export interface Day {
  id: string;
  name: string;
  content: string;
}

export interface DayReference {
  bookId: number;
  chapterId: number;
  fromVerseId: number;
  toVerseId: number;
  relevance: 'primary' | 'secondary';
  reason?: string;
}

export interface DayData {
  id: string;
  name: string;
  description: string;
  category: string;
  biblicalBasis?: string;
  significance?: string;
  liturgicalContext?: string;
  history?: string;
  otConnections?: string;
  dates: Record<string, string>;
  references?: DayReference[];
  footnotes?: { text: string; source?: string }[];
}

export async function getAllDays(): Promise<Day[]> {
  const sql = getSql();
  return await sql`SELECT * FROM days ORDER BY name` as Day[];
}

export async function getDayById(id: string): Promise<Day | undefined> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM days WHERE id = ${id}` as Day[];
  return row;
}

export async function getTodaysDays(): Promise<DayData[]> {
  const sql = getSql();
  const today = new Date().toISOString().substring(0, 10);
  const year = today.substring(0, 4);
  const rows = await sql`SELECT * FROM days` as Day[];

  return rows
    .map(row => {
      try {
        return JSON.parse(row.content) as DayData;
      } catch {
        return null;
      }
    })
    .filter((d): d is DayData => d !== null && d.dates[year] === today);
}

export async function searchDays(query: string): Promise<{ id: string; name: string; description: string; category: string }[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(name) LIKE ? OR LOWER(content) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p];
  });

  const rows = await sql.unsafe(
    `SELECT * FROM days WHERE ${conditions} ORDER BY name`, params
  ) as Day[];

  return rows.map(row => {
    const data = JSON.parse(row.content) as DayData;
    return { id: data.id, name: data.name, description: data.description, category: data.category };
  });
}

// --- Tallsymbolikk ---

export interface NumberSymbolism {
  id: number;
  number: number;
  content: string;
}

export interface NumberSymbolismData {
  number: number;
  meaning: string;
  description: string;
  references: {
    bookId: number;
    chapterId: number;
    fromVerseId: number;
    toVerseId: number;
  }[];
  footnotes?: {
    text: string;
    source?: string;
  }[];
}

export async function getAllNumberSymbolism(): Promise<NumberSymbolism[]> {
  const sql = getSql();
  return await sql`SELECT * FROM number_symbolism ORDER BY number` as NumberSymbolism[];
}

export async function getNumberSymbolismByNumber(num: number): Promise<NumberSymbolism | undefined> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM number_symbolism WHERE number = ${num}` as NumberSymbolism[];
  return row;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  hasMore: boolean;
}

export async function searchVerses(query: string, limit = 50, offset = 0, bible = 'osnb2'): Promise<SearchResponse> {
  if (!query || query.length < 2) return { results: [], total: 0, hasMore: false };

  const sql = getSql();
  const pattern = `%${query}%`;

  const [countResult] = await sql`
    SELECT COUNT(*) as total
    FROM verses v
    WHERE v.text LIKE ${pattern} AND v.bible = ${bible}
  ` as { total: number | bigint }[];

  const total = Number(countResult?.total ?? 0);

  const results = await sql`
    SELECT v.book_id, b.name_no as book_name_no, b.short_name as book_short_name,
           v.chapter, v.verse, v.text
    FROM verses v
    JOIN books b ON v.book_id = b.id
    WHERE v.text LIKE ${pattern} AND v.bible = ${bible}
    ORDER BY v.book_id, v.chapter, v.verse
    LIMIT ${limit} OFFSET ${offset}
  ` as SearchResult[];

  return { results, total, hasMore: offset + results.length < total };
}

export async function getVerseCount(bookId: number, chapter: number, bible = 'osnb2'): Promise<number> {
  const sql = getSql();
  const [result] = await sql`
    SELECT MAX(verse) as count FROM verses WHERE book_id = ${bookId} AND chapter = ${chapter} AND bible = ${bible}
  ` as { count: number | bigint | null }[];
  return result?.count == null ? 0 : Number(result.count);
}

export interface OriginalWordSearchResult {
  book_id: number;
  book_name_no: string;
  book_short_name: string;
  chapter: number;
  verse: number;
  text: string;
  original_text: string;
  norwegianWords: string[]; // Norwegian words that translate to the matched original word
  originalWordsInVerse: string[]; // The actual original words found in this verse (from word4word)
}

export interface OriginalWordSearchResponse {
  results: OriginalWordSearchResult[];
  total: number;
  hasMore: boolean;
  word: string;
  language: 'hebrew' | 'greek';
  matchingWords: string[]; // All word variants that matched (for highlighting)
}

/**
 * Normalize Hebrew text by removing cantillation marks (ta'amim)
 * Keeps vowel points (nikkud) for better matching
 * Cantillation marks: U+0591-U+05AF
 */
function normalizeHebrew(text: string): string {
  // Remove cantillation marks (U+0591 to U+05AF)
  return text.replace(/[\u0591-\u05AF]/g, '');
}

/**
 * Strip all Hebrew diacritics (both cantillation and vowels) for consonant-only matching
 * Used for prefix detection where vowels differ
 */
function stripHebrewDiacritics(text: string): string {
  // Remove cantillation marks (U+0591-U+05AF) AND vowel points (U+05B0-U+05C7)
  return text.replace(/[\u0591-\u05C7]/g, '');
}

/**
 * Normalize Greek text by removing diacritical variations
 * This handles different accent marks on the same base character
 */
function normalizeGreek(text: string): string {
  // Normalize to NFD (decomposed form), remove combining diacriticals, then back to NFC
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

export async function searchOriginalWord(word: string, limit = 50, offset = 0): Promise<OriginalWordSearchResponse> {
  if (!word) return { results: [], total: 0, hasMore: false, word: '', language: 'greek', matchingWords: [] };

  const sql = getSql();

  // Determine language based on word characters
  const isHebrew = /[\u0590-\u05FF]/.test(word);
  const word4wordBible = isHebrew ? 'tanach-nb' : 'sblgnt-nb';  // word4word table uses -nb suffix
  const versesBible = isHebrew ? 'tanach' : 'sblgnt';            // verses table uses plain names
  const language: 'hebrew' | 'greek' = isHebrew ? 'hebrew' : 'greek';

  // Normalize the search word
  const normalizedWord = isHebrew ? normalizeHebrew(word) : normalizeGreek(word);

  // Get all unique words from the bible and find those matching when normalized
  const allWords = await sql`
    SELECT DISTINCT word FROM word4word WHERE bible = ${word4wordBible}
  ` as { word: string }[];

  // For Hebrew, also match words that CONTAIN the normalized word (to handle prefixes)
  // Hebrew prefixes like בְּ (be-), הַ (ha-), וְ (ve-) are attached to the word
  const strippedWord = isHebrew ? stripHebrewDiacritics(word) : normalizedWord;

  const matchingWords = allWords
    .filter(w => {
      const normalized = isHebrew ? normalizeHebrew(w.word) : normalizeGreek(w.word);
      if (normalized === normalizedWord) return true;
      // For Hebrew, check if consonants end with the search term (handles prefix + vowel differences)
      if (isHebrew) {
        const stripped = stripHebrewDiacritics(w.word);
        if (stripped.endsWith(strippedWord)) return true;
      }
      return false;
    })
    .map(w => w.word);

  if (matchingWords.length === 0) {
    return { results: [], total: 0, hasMore: false, word, language, matchingWords: [] };
  }

  // Create placeholders for IN clause
  const placeholders = matchingWords.map(() => '?').join(',');

  // Count total matches
  // MySQL: || er ikke strengkonkatenering — bruk CONCAT i stedet for SQLite's '-'-join
  const [countResult] = await sql.unsafe(`
    SELECT COUNT(DISTINCT CONCAT(w.book_id, '-', w.chapter, '-', w.verse)) as total
    FROM word4word w
    WHERE w.word IN (${placeholders}) AND w.bible = ?
  `, [...matchingWords, word4wordBible]) as { total: number | bigint }[];

  const total = Number(countResult?.total ?? 0);

  // Get matching verses with both Norwegian and original text
  const rawResults = await sql.unsafe(`
    SELECT DISTINCT
      w.book_id,
      b.name_no as book_name_no,
      b.short_name as book_short_name,
      w.chapter,
      w.verse,
      v_no.text as text,
      v_orig.text as original_text
    FROM word4word w
    JOIN books b ON w.book_id = b.id
    JOIN verses v_no ON w.book_id = v_no.book_id AND w.chapter = v_no.chapter AND w.verse = v_no.verse AND v_no.bible = 'osnb2'
    JOIN verses v_orig ON w.book_id = v_orig.book_id AND w.chapter = v_orig.chapter AND w.verse = v_orig.verse AND v_orig.bible = ?
    WHERE w.word IN (${placeholders}) AND w.bible = ?
    ORDER BY w.book_id, w.chapter, w.verse
    LIMIT ? OFFSET ?
  `, [versesBible, ...matchingWords, word4wordBible, limit, offset]) as Omit<OriginalWordSearchResult, 'norwegianWords'>[];

  // For each result, find the Norwegian words and original words that match
  const results: OriginalWordSearchResult[] = [];
  for (const r of rawResults) {
    // Get Norwegian word4word entries for this verse
    const norwegianEntries = await sql`
      SELECT DISTINCT word, original FROM word4word
      WHERE book_id = ${r.book_id} AND chapter = ${r.chapter} AND verse = ${r.verse} AND bible = 'osnb2' AND original IS NOT NULL
    ` as { word: string; original: string }[];

    // Get original language word4word entries for this verse
    const originalEntries = await sql`
      SELECT DISTINCT word FROM word4word
      WHERE book_id = ${r.book_id} AND chapter = ${r.chapter} AND verse = ${r.verse} AND bible = ${word4wordBible}
    ` as { word: string }[];

    // Find Norwegian words whose 'original' matches when normalized/stripped
    const norwegianWords = norwegianEntries
      .filter(entry => {
        if (!entry.original) return false;
        const normalizedOriginal = isHebrew ? normalizeHebrew(entry.original) : normalizeGreek(entry.original);
        const strippedOriginal = isHebrew ? stripHebrewDiacritics(entry.original) : normalizedOriginal;
        // Check exact match or prefix match (for Hebrew)
        if (normalizedOriginal === normalizedWord) return true;
        if (isHebrew && strippedOriginal.endsWith(strippedWord)) return true;
        return false;
      })
      .map(entry => entry.word);

    // Find original words in this verse that match
    const originalWordsInVerse = originalEntries
      .filter(entry => {
        const normalized = isHebrew ? normalizeHebrew(entry.word) : normalizeGreek(entry.word);
        const stripped = isHebrew ? stripHebrewDiacritics(entry.word) : normalized;
        if (normalized === normalizedWord) return true;
        if (isHebrew && stripped.endsWith(strippedWord)) return true;
        return false;
      })
      .map(entry => entry.word);

    results.push({ ...r, norwegianWords, originalWordsInVerse });
  }

  return { results, total, hasMore: offset + results.length < total, word, language, matchingWords };
}

// Timeline types and functions

export interface TimelinePeriod {
  id: string;
  timeline_type: string;
  name: string;
  color: string | null;
  description: string | null;
  sort_order: number;
}

export interface TimelineReference {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  book_short_name?: string;
  book_name_no?: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string | null;
  year: number | null;
  year_display: string | null;
  period_id: string | null;
  importance: string;
  sort_order: number;
  timeline_type: string;
  region?: string | null;
  book_id?: number | null;
  section_id?: string | null;
  references?: TimelineReference[];
  period?: TimelinePeriod;
}

export interface TimelineBookSection {
  id: string;
  book_id: number;
  title: string;
  chapter_start: number;
  chapter_end: number;
  description: string | null;
  sort_order: number;
}

export interface TimelineData {
  periods: TimelinePeriod[];
  events: TimelineEvent[];
}

export interface MultiTimelineData {
  bible: {
    periods: TimelinePeriod[];
    events: TimelineEvent[];
  };
  world: {
    periods: TimelinePeriod[];
    events: TimelineEvent[];
  };
  books: {
    available: { id: number; name_no: string; short_name: string }[];
    sections: TimelineBookSection[];
    events: TimelineEvent[];
  };
}

// `seq` er en intern rekkefølge-kolonne (se schema.ts) og skal aldri ut i
// API-kontrakten — den fantes ikke i SQLite-utgaven.
function dropSeq<T>(rows: T[]): T[] {
  for (const r of rows) delete (r as { seq?: unknown }).seq;
  return rows;
}

async function attachReferencesToEvents(events: (TimelineEvent & { period_name?: string; period_color?: string })[]): Promise<TimelineEvent[]> {
  const sql = getSql();
  dropSeq(events);
  const result: TimelineEvent[] = [];
  for (const event of events) {
    const refs = await sql`
      SELECT tr.book_id, tr.chapter, tr.verse_start, tr.verse_end, b.short_name as book_short_name, b.name_no as book_name_no
      FROM timeline_references tr
      JOIN books b ON tr.book_id = b.id
      WHERE tr.event_id = ${event.id}
    ` as TimelineReference[];

    result.push({
      ...event,
      references: refs,
      period: event.period_id ? {
        id: event.period_id,
        timeline_type: event.timeline_type || 'bible',
        name: event.period_name || '',
        color: event.period_color || null,
        description: null,
        sort_order: 0
      } : undefined
    });
  }
  return result;
}

export async function getTimelinePeriods(): Promise<TimelinePeriod[]> {
  const sql = getSql();
  return await sql`SELECT * FROM timeline_periods WHERE timeline_type = ${'bible'} ORDER BY sort_order` as TimelinePeriod[];
}

export async function getTimelineEvents(): Promise<TimelineEvent[]> {
  const sql = getSql();
  const events = await sql`
    SELECT e.*, p.name as period_name, p.color as period_color
    FROM timeline_events e
    LEFT JOIN timeline_periods p ON e.period_id = p.id AND p.timeline_type = e.timeline_type
    WHERE e.timeline_type = 'bible'
    ORDER BY p.sort_order, e.year IS NULL DESC, e.year, e.sort_order, e.seq
  ` as (TimelineEvent & { period_name?: string; period_color?: string })[];

  return attachReferencesToEvents(events);
}

export async function getWorldTimelinePeriods(): Promise<TimelinePeriod[]> {
  const sql = getSql();
  return await sql`SELECT * FROM timeline_periods WHERE timeline_type = ${'world'} ORDER BY sort_order` as TimelinePeriod[];
}

export async function getWorldTimelineEvents(): Promise<TimelineEvent[]> {
  const sql = getSql();
  const events = await sql`
    SELECT e.*, p.name as period_name, p.color as period_color
    FROM timeline_events e
    LEFT JOIN timeline_periods p ON e.period_id = p.id AND p.timeline_type = e.timeline_type
    WHERE e.timeline_type = 'world'
    ORDER BY p.sort_order, e.year IS NULL DESC, e.year, e.sort_order, e.seq
  ` as (TimelineEvent & { period_name?: string; period_color?: string })[];

  return attachReferencesToEvents(events);
}

export async function getBookTimelineSections(bookId?: number): Promise<TimelineBookSection[]> {
  const sql = getSql();
  if (bookId) {
    return dropSeq(await sql`SELECT * FROM timeline_book_sections WHERE book_id = ${bookId} ORDER BY sort_order, seq` as TimelineBookSection[]);
  }
  return dropSeq(await sql`SELECT * FROM timeline_book_sections ORDER BY book_id, sort_order, seq` as TimelineBookSection[]);
}

export async function getBookTimelineEvents(bookId?: number): Promise<TimelineEvent[]> {
  const sql = getSql();
  let events: (TimelineEvent & { period_name?: string; period_color?: string })[];
  if (bookId) {
    events = await sql`
      SELECT e.*, NULL as period_name, NULL as period_color
      FROM timeline_events e
      WHERE e.timeline_type = 'books' AND e.book_id = ${bookId}
      ORDER BY e.sort_order, e.seq
    ` as (TimelineEvent & { period_name?: string; period_color?: string })[];
  } else {
    events = await sql`
      SELECT e.*, NULL as period_name, NULL as period_color
      FROM timeline_events e
      WHERE e.timeline_type = 'books'
      ORDER BY e.book_id, e.sort_order, e.seq
    ` as (TimelineEvent & { period_name?: string; period_color?: string })[];
  }
  return attachReferencesToEvents(events);
}

export async function getMultiTimeline(): Promise<MultiTimelineData> {
  const sql = getSql();

  // Get books that have timeline data
  const availableBooks = await sql`
    SELECT DISTINCT b.id, b.name_no, b.short_name
    FROM timeline_events e
    JOIN books b ON e.book_id = b.id
    WHERE e.timeline_type = 'books'
    ORDER BY b.id
  ` as { id: number; name_no: string; short_name: string }[];

  return {
    bible: {
      periods: await getTimelinePeriods(),
      events: await getTimelineEvents(),
    },
    world: {
      periods: await getWorldTimelinePeriods(),
      events: await getWorldTimelineEvents(),
    },
    books: {
      available: availableBooks,
      sections: await getBookTimelineSections(),
      events: await getBookTimelineEvents(),
    },
  };
}

export async function getTimelineEventById(id: string): Promise<TimelineEvent | undefined> {
  const sql = getSql();
  const [event] = await sql`
    SELECT e.*, p.name as period_name, p.color as period_color, p.description as period_description
    FROM timeline_events e
    LEFT JOIN timeline_periods p ON e.period_id = p.id AND p.timeline_type = e.timeline_type
    WHERE e.id = ${id}
  ` as (TimelineEvent & { period_name?: string; period_color?: string; period_description?: string })[];

  if (!event) return undefined;
  dropSeq([event]);

  const refs = await sql`
    SELECT tr.book_id, tr.chapter, tr.verse_start, tr.verse_end, b.short_name as book_short_name, b.name_no as book_name_no
    FROM timeline_references tr
    JOIN books b ON tr.book_id = b.id
    WHERE tr.event_id = ${id}
  ` as TimelineReference[];

  return {
    ...event,
    references: refs,
    period: event.period_id ? {
      id: event.period_id,
      timeline_type: event.timeline_type || 'bible',
      name: event.period_name || '',
      color: event.period_color || null,
      description: event.period_description || null,
      sort_order: 0
    } : undefined
  };
}

export async function getTimelineEventsByPeriod(periodId: string): Promise<TimelineEvent[]> {
  const sql = getSql();
  const events = await sql`
    SELECT e.*, p.name as period_name, p.color as period_color
    FROM timeline_events e
    LEFT JOIN timeline_periods p ON e.period_id = p.id AND p.timeline_type = e.timeline_type
    WHERE e.period_id = ${periodId} AND e.timeline_type = 'bible'
    ORDER BY e.year IS NULL DESC, e.year, e.sort_order, e.seq
  ` as (TimelineEvent & { period_name?: string; period_color?: string })[];

  return attachReferencesToEvents(events);
}

export async function getFullTimeline(): Promise<TimelineData> {
  return {
    periods: await getTimelinePeriods(),
    events: await getTimelineEvents()
  };
}

function deduplicateTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const titleMap = new Map<string, TimelineEvent>();
  for (const event of events) {
    const key = event.title.toLowerCase();
    const existing = titleMap.get(key);
    if (!existing || (event.timeline_type === 'books' && existing.timeline_type !== 'books')) {
      titleMap.set(key, event);
    }
  }
  return Array.from(titleMap.values());
}

function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.sort((a, b) => {
    if (a.year == null && b.year == null) return a.sort_order - b.sort_order;
    if (a.year == null) return -1;
    if (b.year == null) return 1;
    if (a.year !== b.year) return a.year - b.year;
    return a.sort_order - b.sort_order;
  });
}

async function getEventsForChapterDirect(bookId: number, chapter: number): Promise<TimelineEvent[]> {
  const sql = getSql();
  const eventIds = await sql`
    SELECT DISTINCT event_id
    FROM timeline_references
    WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { event_id: string }[];

  const events: TimelineEvent[] = [];
  for (const { event_id } of eventIds) {
    const event = await getTimelineEventById(event_id);
    if (event) events.push(event);
  }
  return events;
}

/**
 * Map events to bible-type event IDs for highlighting in the main timeline.
 * For books-type events, find bible equivalent by title or nearest by year.
 */
async function mapToBibleEventIds(events: TimelineEvent[]): Promise<string[]> {
  const sql = getSql();
  const ids = new Set<string>();
  for (const event of events) {
    if (event.timeline_type === 'bible') {
      ids.add(event.id);
      continue;
    }
    // Try exact title match first
    const [bibleEvent] = await sql`
      SELECT id FROM timeline_events
      WHERE timeline_type = 'bible' AND LOWER(title) = LOWER(${event.title})
    ` as { id: string }[];
    if (bibleEvent) {
      ids.add(bibleEvent.id);
      continue;
    }
    // Fallback: find nearest bible event by year
    if (event.year != null) {
      const [nearest] = await sql`
        SELECT id FROM timeline_events
        WHERE timeline_type = 'bible' AND year IS NOT NULL
        ORDER BY ABS(year - ${event.year})
        LIMIT 1
      ` as { id: string }[];
      if (nearest) {
        ids.add(nearest.id);
      }
    }
  }
  return Array.from(ids);
}

export async function getTimelineEventsForChapter(bookId: number, chapter: number): Promise<TimelineEvent[]> {
  const sql = getSql();

  // Direct hits for this chapter
  const direct = await getEventsForChapterDirect(bookId, chapter);
  if (direct.length > 0) {
    return sortTimelineEvents(deduplicateTimelineEvents(direct));
  }

  // No direct hits — find nearest chapters in this book that have events
  const nearbyChapters = await sql`
    SELECT DISTINCT chapter
    FROM timeline_references
    WHERE book_id = ${bookId}
    ORDER BY chapter
  ` as { chapter: number }[];

  if (nearbyChapters.length === 0) return [];

  const chapters = nearbyChapters.map(r => r.chapter);

  // Find closest chapter before and after
  let before: number | null = null;
  let after: number | null = null;
  for (const ch of chapters) {
    if (ch < chapter) before = ch;
    if (ch > chapter && after === null) after = ch;
  }

  const contextEvents: TimelineEvent[] = [];
  if (before !== null) {
    contextEvents.push(...await getEventsForChapterDirect(bookId, before));
  }
  if (after !== null) {
    contextEvents.push(...await getEventsForChapterDirect(bookId, after));
  }

  return sortTimelineEvents(deduplicateTimelineEvents(contextEvents));
}

/**
 * Get bible-timeline event IDs relevant for a chapter.
 * Maps books-type events to bible-type equivalents.
 */
export async function getChapterTimelineEventIds(bookId: number, chapter: number): Promise<string[]> {
  const events = await getTimelineEventsForChapter(bookId, chapter);
  return mapToBibleEventIds(events);
}

// Prophecy types and functions

export interface ProphecyCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface ProphecyReference {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  book_short_name?: string;
  book_name_no?: string;
  reference?: string;
}

export interface Prophecy {
  id: string;
  category_id: string;
  title: string;
  explanation: string | null;
  prophecy: ProphecyReference;
  fulfillments: ProphecyReference[];
  category?: ProphecyCategory;
}

export interface ProphecyData {
  categories: ProphecyCategory[];
  prophecies: Prophecy[];
}

export async function getProphecyCategories(): Promise<ProphecyCategory[]> {
  const sql = getSql();
  // seq bevarer innsettingsrekkefølgen (= rekkefølgen i prophecies.json, som
  // SQLite ga implisitt via rowid).
  return dropSeq(await sql`SELECT * FROM prophecy_categories ORDER BY seq` as ProphecyCategory[]);
}

export async function getProphecies(): Promise<Prophecy[]> {
  const sql = getSql();
  const prophecies = await sql`
    SELECT p.*, c.name as category_name, c.description as category_description,
           b.short_name as prophecy_book_short_name, b.name_no as prophecy_book_name_no
    FROM prophecies p
    LEFT JOIN prophecy_categories c ON p.category_id = c.id
    LEFT JOIN books b ON p.prophecy_book_id = b.id
    ORDER BY p.seq
  ` as (Prophecy & {
    category_name?: string;
    category_description?: string;
    prophecy_book_id: number;
    prophecy_chapter: number;
    prophecy_verse_start: number;
    prophecy_verse_end: number;
    prophecy_book_short_name?: string;
    prophecy_book_name_no?: string;
  })[];

  const result: Prophecy[] = [];
  for (const p of prophecies) {
    // Get fulfillments
    const fulfillments = await sql`
      SELECT pf.book_id, pf.chapter, pf.verse_start, pf.verse_end,
             b.short_name as book_short_name, b.name_no as book_name_no
      FROM prophecy_fulfillments pf
      JOIN books b ON pf.book_id = b.id
      WHERE pf.prophecy_id = ${p.id}
    ` as ProphecyReference[];

    // Format reference strings
    const formatRef = (ref: ProphecyReference): string => {
      const verseRange = ref.verse_start === ref.verse_end
        ? `${ref.verse_start}`
        : `${ref.verse_start}-${ref.verse_end}`;
      return `${ref.book_short_name} ${ref.chapter}:${verseRange}`;
    };

    const prophecyRef: ProphecyReference = {
      book_id: p.prophecy_book_id,
      chapter: p.prophecy_chapter,
      verse_start: p.prophecy_verse_start,
      verse_end: p.prophecy_verse_end,
      book_short_name: p.prophecy_book_short_name,
      book_name_no: p.prophecy_book_name_no
    };
    prophecyRef.reference = formatRef(prophecyRef);

    const fulfillmentsWithRef = fulfillments.map(f => ({
      ...f,
      reference: formatRef(f)
    }));

    result.push({
      id: p.id,
      category_id: p.category_id,
      title: p.title,
      explanation: p.explanation,
      prophecy: prophecyRef,
      fulfillments: fulfillmentsWithRef,
      category: p.category_id ? {
        id: p.category_id,
        name: p.category_name || '',
        description: p.category_description || null
      } : undefined
    });
  }
  return result;
}

export async function getProphecyById(id: string): Promise<Prophecy | undefined> {
  const sql = getSql();
  const [prophecy] = await sql`
    SELECT p.*, c.name as category_name, c.description as category_description,
           b.short_name as prophecy_book_short_name, b.name_no as prophecy_book_name_no
    FROM prophecies p
    LEFT JOIN prophecy_categories c ON p.category_id = c.id
    LEFT JOIN books b ON p.prophecy_book_id = b.id
    WHERE p.id = ${id}
  ` as (Prophecy & {
    category_name?: string;
    category_description?: string;
    prophecy_book_id: number;
    prophecy_chapter: number;
    prophecy_verse_start: number;
    prophecy_verse_end: number;
    prophecy_book_short_name?: string;
    prophecy_book_name_no?: string;
  })[];

  if (!prophecy) return undefined;

  const fulfillments = await sql`
    SELECT pf.book_id, pf.chapter, pf.verse_start, pf.verse_end,
           b.short_name as book_short_name, b.name_no as book_name_no
    FROM prophecy_fulfillments pf
    JOIN books b ON pf.book_id = b.id
    WHERE pf.prophecy_id = ${id}
  ` as ProphecyReference[];

  const formatRef = (ref: ProphecyReference): string => {
    const verseRange = ref.verse_start === ref.verse_end
      ? `${ref.verse_start}`
      : `${ref.verse_start}-${ref.verse_end}`;
    return `${ref.book_short_name} ${ref.chapter}:${verseRange}`;
  };

  const prophecyRef: ProphecyReference = {
    book_id: prophecy.prophecy_book_id,
    chapter: prophecy.prophecy_chapter,
    verse_start: prophecy.prophecy_verse_start,
    verse_end: prophecy.prophecy_verse_end,
    book_short_name: prophecy.prophecy_book_short_name,
    book_name_no: prophecy.prophecy_book_name_no
  };
  prophecyRef.reference = formatRef(prophecyRef);

  return {
    id: prophecy.id,
    category_id: prophecy.category_id,
    title: prophecy.title,
    explanation: prophecy.explanation,
    prophecy: prophecyRef,
    fulfillments: fulfillments.map(f => ({ ...f, reference: formatRef(f) })),
    category: prophecy.category_id ? {
      id: prophecy.category_id,
      name: prophecy.category_name || '',
      description: prophecy.category_description || null
    } : undefined
  };
}

export async function getPropheciesByCategory(categoryId: string): Promise<Prophecy[]> {
  const all = await getProphecies();
  return all.filter(p => p.category_id === categoryId);
}

export async function getFullProphecyData(): Promise<ProphecyData> {
  return {
    categories: await getProphecyCategories(),
    prophecies: await getProphecies()
  };
}

export async function getPropheciesForChapter(bookId: number, chapter: number): Promise<Prophecy[]> {
  const sql = getSql();

  // Find prophecies that reference this chapter (either as prophecy or fulfillment)
  const prophecyIds = await sql`
    SELECT DISTINCT p.id
    FROM prophecies p
    WHERE (p.prophecy_book_id = ${bookId} AND p.prophecy_chapter = ${chapter})
    UNION
    SELECT DISTINCT pf.prophecy_id
    FROM prophecy_fulfillments pf
    WHERE pf.book_id = ${bookId} AND pf.chapter = ${chapter}
  ` as { id: string }[];

  if (prophecyIds.length === 0) return [];

  const prophecies: Prophecy[] = [];
  for (const { id } of prophecyIds) {
    const prophecy = await getProphecyById(id);
    if (prophecy) {
      prophecies.push(prophecy);
    }
  }

  return prophecies;
}

export async function getPropheciesForVerse(bookId: number, chapter: number, verse: number): Promise<Prophecy[]> {
  const sql = getSql();

  // Find prophecies where this verse is part of the prophecy reference or a fulfillment
  const prophecyIds = await sql`
    SELECT DISTINCT p.id
    FROM prophecies p
    WHERE p.prophecy_book_id = ${bookId} AND p.prophecy_chapter = ${chapter}
      AND ${verse} >= p.prophecy_verse_start AND ${verse} <= p.prophecy_verse_end
    UNION
    SELECT DISTINCT pf.prophecy_id
    FROM prophecy_fulfillments pf
    WHERE pf.book_id = ${bookId} AND pf.chapter = ${chapter}
      AND ${verse} >= pf.verse_start AND ${verse} <= pf.verse_end
  ` as { id: string }[];

  if (prophecyIds.length === 0) return [];

  const prophecies: Prophecy[] = [];
  for (const { id } of prophecyIds) {
    const prophecy = await getProphecyById(id);
    if (prophecy) {
      prophecies.push(prophecy);
    }
  }

  return prophecies;
}

// Person types and functions

export interface PersonVerseRef {
  bookId: number;
  chapter: number;
  verse?: number;
  verses?: number[];
}

export interface PersonKeyEvent {
  title: string;
  description: string;
  verses: PersonVerseRef[];
}

export interface PersonFamily {
  father?: string | null;
  mother?: string | null;
  siblings?: string[];
  spouse?: string | null;
  children?: string[];
}

export interface PersonReference {
  bookId: number;
  chapterId: number;
  verseId: number;
}

export interface PersonData {
  id: string;
  name: string;
  title: string;
  era: string;
  lifespan?: string;
  summary: string;
  roles: string[];
  aliases?: string[];
  references?: PersonReference[];
  family?: PersonFamily;
  relatedPersons?: string[];
  keyEvents: PersonKeyEvent[];
}

export interface Person {
  id: number;
  name: string;
  content: string;
}

// Era labels in Norwegian
export const eraLabels: Record<string, string> = {
  'creation': 'Skapelsen',
  'patriarchs': 'Patriarkene',
  'exodus': 'Utgang fra Egypt',
  'conquest': 'Erobringen',
  'judges': 'Dommertiden',
  'united-kingdom': 'Det forente kongerike',
  'divided-kingdom': 'Det delte kongerike',
  'exile': 'Eksilet',
  'return': 'Tilbakekomsten',
  'intertestamental': 'Mellomtestamentlig tid',
  'jesus': 'Jesu tid',
  'early-church': 'Den tidlige kirke'
};

// Role labels in Norwegian
export const roleLabels: Record<string, string> = {
  'profet': 'Profet',
  'konge': 'Konge',
  'dommer': 'Dommer',
  'prest': 'Prest',
  'apostel': 'Apostel',
  'disippel': 'Disippel',
  'leder': 'Leder',
  'matriark': 'Matriark',
  'patriark': 'Patriark',
  'martyr': 'Martyr',
  'kriger': 'Kriger',
  'vismann': 'Vismann'
};

export async function getAllPersons(): Promise<Person[]> {
  const sql = getSql();
  return await sql`SELECT * FROM persons ORDER BY name` as Person[];
}

export async function getPersonByName(name: string): Promise<Person | undefined> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM persons WHERE name = ${name}` as Person[];
  return row;
}

export function parsePersonContent(content: string): PersonData | null {
  try {
    return JSON.parse(content) as PersonData;
  } catch {
    return null;
  }
}

export async function getPersonData(name: string): Promise<PersonData | null> {
  const person = await getPersonByName(name);
  if (!person) return null;
  return parsePersonContent(person.content);
}

export async function getAllPersonsData(): Promise<PersonData[]> {
  const persons = await getAllPersons();
  const all = persons
    .map(p => parsePersonContent(p.content))
    .filter((p): p is PersonData => p !== null);
  // Deduplicate by id (keep last/latest version)
  const byId = new Map<string, PersonData>();
  for (const p of all) byId.set(p.id, p);
  return Array.from(byId.values());
}

export async function getPersonsByChapter(bookId: number, chapter: number): Promise<PersonData[]> {
  const sql = getSql();
  // SQLite brukte json_each/json_extract; i MySQL filtrerer vi i JS i stedet
  // (samme semantikk: minst én reference med matchende bookId + chapterId)
  const rows = await sql`SELECT content FROM persons` as { content: string }[];

  return rows
    .map(r => parsePersonContent(r.content))
    .filter((p): p is PersonData =>
      p !== null && !!p.references?.some(ref => ref.bookId === bookId && ref.chapterId === chapter)
    );
}

export async function getNumberSymbolismByChapter(bookId: number, chapter: number): Promise<NumberSymbolismData[]> {
  const sql = getSql();
  // SQLite brukte json_each/json_extract; i MySQL filtrerer vi i JS i stedet
  const rows = await sql`SELECT content FROM number_symbolism` as { content: string }[];

  return rows
    .map(r => { try { return JSON.parse(r.content) as NumberSymbolismData; } catch { return null; } })
    .filter((n): n is NumberSymbolismData =>
      n !== null && !!n.references?.some(ref => ref.bookId === bookId && ref.chapterId === chapter)
    );
}

export async function getThemesByChapter(bookId: number, chapter: number): Promise<{ id: number; name: string; title: string; introduction?: string; verses: number[] }[]> {
  const sql = getSql();
  const themes = await sql`SELECT id, name, content FROM themes` as Theme[];

  return themes.filter(t => {
    try {
      const data: ThemeData = JSON.parse(t.content);
      return data.sections?.some(s =>
        s.verses?.some(v => v.bookId === bookId && v.chapter === chapter)
      );
    } catch { return false; }
  }).map(t => {
    const data: ThemeData = JSON.parse(t.content);
    const verses: number[] = [];
    for (const s of data.sections || []) {
      for (const v of s.verses || []) {
        if (v.bookId === bookId && v.chapter === chapter) {
          if (v.verses) verses.push(...v.verses);
          else if (v.verse) verses.push(v.verse);
        }
      }
    }
    return { id: t.id, name: t.name, title: data.title, introduction: data.introduction, verses: [...new Set(verses)] };
  });
}

export async function getStoriesByChapter(bookId: number, chapter: number): Promise<{ slug: string; title: string; category: string; description: string; verses: number[] }[]> {
  const sql = getSql();
  const stories = await sql`SELECT slug, title, category, content, description FROM stories` as (Story & { description: string })[];

  return stories.filter(s => {
    try {
      const data: StoryData = JSON.parse(s.content);
      return data.references?.some(r =>
        r.bookId === bookId && r.startChapter <= chapter && r.endChapter >= chapter
      );
    } catch { return false; }
  }).map(s => {
    const data: StoryData = JSON.parse(s.content);
    const verses: number[] = [];
    for (const r of data.references || []) {
      if (r.bookId === bookId && r.startChapter <= chapter && r.endChapter >= chapter) {
        const startV = r.startChapter === chapter ? r.startVerse : 1;
        const endV = r.endChapter === chapter ? r.endVerse : 999;
        for (let v = startV; v <= endV; v++) verses.push(v);
      }
    }
    return { slug: s.slug, title: s.title, category: s.category, description: s.description || data.description, verses: [...new Set(verses)] };
  });
}

export async function getPersonsByRole(role: string): Promise<PersonData[]> {
  const allPersons = await getAllPersonsData();
  return allPersons.filter(p => p.roles.includes(role));
}

export async function getPersonsByEra(era: string): Promise<PersonData[]> {
  const allPersons = await getAllPersonsData();
  return allPersons.filter(p => p.era === era);
}

export async function getRelatedPersonsData(personId: string): Promise<PersonData[]> {
  const person = await getPersonData(personId);
  if (!person || !person.relatedPersons) return [];

  const result: PersonData[] = [];
  for (const id of person.relatedPersons) {
    const p = await getPersonData(id);
    if (p !== null) result.push(p);
  }
  return result;
}

// Chapter Insights types and functions

export interface ChapterInsightBase {
  type: string;
  title: string;
  buttonText: string;
  hint: string;
  intro: string;
}

export interface ChapterInsightDbRow {
  book_id: number;
  chapter: number;
  type: string;
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getChapterInsight(bookId: number, chapter: number): Promise<any | null> {
  const sql = getSql();
  const [result] = await sql`
    SELECT content FROM chapter_insights WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { content: string }[];

  if (!result) return null;

  try {
    return JSON.parse(result.content);
  } catch {
    return null;
  }
}

// Gospel Parallels types and functions

export interface GospelParallelSection {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface GospelParallelPassage {
  gospel: string;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  reference: string;
  book_short_name?: string;
  book_name_no?: string;
}

export interface GospelParallel {
  id: string;
  section_id: string;
  title: string;
  notes: string | null;
  sort_order: number;
  passages?: Record<string, GospelParallelPassage>;
  section?: GospelParallelSection;
}

export interface GospelParallelsData {
  sections: GospelParallelSection[];
  parallels: GospelParallel[];
}

export async function getGospelParallelSections(): Promise<GospelParallelSection[]> {
  const sql = getSql();
  return await sql`SELECT * FROM gospel_parallel_sections ORDER BY sort_order` as GospelParallelSection[];
}

export async function getGospelParallels(): Promise<GospelParallel[]> {
  const sql = getSql();
  const parallels = await sql`
    SELECT p.*, s.name as section_name, s.description as section_description
    FROM gospel_parallels p
    LEFT JOIN gospel_parallel_sections s ON p.section_id = s.id
    ORDER BY p.sort_order
  ` as (GospelParallel & { section_name?: string; section_description?: string })[];

  const result: GospelParallel[] = [];
  for (const parallel of parallels) {
    // Get passages for this parallel
    const passages = await sql`
      SELECT gpp.*, b.short_name as book_short_name, b.name_no as book_name_no
      FROM gospel_parallel_passages gpp
      JOIN books b ON gpp.book_id = b.id
      WHERE gpp.parallel_id = ${parallel.id}
    ` as (GospelParallelPassage & { parallel_id: string })[];

    // Convert passages array to Record keyed by gospel
    const passagesRecord: Record<string, GospelParallelPassage> = {};
    for (const passage of passages) {
      passagesRecord[passage.gospel] = {
        gospel: passage.gospel,
        book_id: passage.book_id,
        chapter: passage.chapter,
        verse_start: passage.verse_start,
        verse_end: passage.verse_end,
        reference: passage.reference,
        book_short_name: passage.book_short_name,
        book_name_no: passage.book_name_no
      };
    }

    result.push({
      id: parallel.id,
      section_id: parallel.section_id,
      title: parallel.title,
      notes: parallel.notes,
      sort_order: parallel.sort_order,
      passages: passagesRecord,
      section: parallel.section_id ? {
        id: parallel.section_id,
        name: parallel.section_name || '',
        description: parallel.section_description || null,
        sort_order: 0
      } : undefined
    });
  }
  return result;
}

export async function getGospelParallelsData(): Promise<GospelParallelsData> {
  return {
    sections: await getGospelParallelSections(),
    parallels: await getGospelParallels()
  };
}

export async function getGospelParallelById(id: string): Promise<GospelParallel | undefined> {
  const sql = getSql();
  const [parallel] = await sql`
    SELECT p.*, s.name as section_name, s.description as section_description
    FROM gospel_parallels p
    LEFT JOIN gospel_parallel_sections s ON p.section_id = s.id
    WHERE p.id = ${id}
  ` as (GospelParallel & { section_name?: string; section_description?: string })[];

  if (!parallel) return undefined;

  // Get passages for this parallel
  const passages = await sql`
    SELECT gpp.*, b.short_name as book_short_name, b.name_no as book_name_no
    FROM gospel_parallel_passages gpp
    JOIN books b ON gpp.book_id = b.id
    WHERE gpp.parallel_id = ${id}
  ` as (GospelParallelPassage & { parallel_id: string })[];

  // Convert passages array to Record keyed by gospel
  const passagesRecord: Record<string, GospelParallelPassage> = {};
  for (const passage of passages) {
    passagesRecord[passage.gospel] = {
      gospel: passage.gospel,
      book_id: passage.book_id,
      chapter: passage.chapter,
      verse_start: passage.verse_start,
      verse_end: passage.verse_end,
      reference: passage.reference,
      book_short_name: passage.book_short_name,
      book_name_no: passage.book_name_no
    };
  }

  return {
    id: parallel.id,
    section_id: parallel.section_id,
    title: parallel.title,
    notes: parallel.notes,
    sort_order: parallel.sort_order,
    passages: passagesRecord,
    section: parallel.section_id ? {
      id: parallel.section_id,
      name: parallel.section_name || '',
      description: parallel.section_description || null,
      sort_order: 0
    } : undefined
  };
}

export async function getGospelParallelsBySection(sectionId: string): Promise<GospelParallel[]> {
  const all = await getGospelParallels();
  return all.filter(p => p.section_id === sectionId);
}

export async function getGospelParallelsForChapter(bookId: number, chapter: number): Promise<GospelParallel[]> {
  const sql = getSql();

  // Find all parallels that have a passage in this book/chapter
  const parallelIds = await sql`
    SELECT DISTINCT parallel_id
    FROM gospel_parallel_passages
    WHERE book_id = ${bookId} AND chapter = ${chapter}
  ` as { parallel_id: string }[];

  if (parallelIds.length === 0) return [];

  // Get full parallel data for each
  const parallels: GospelParallel[] = [];
  for (const { parallel_id } of parallelIds) {
    const parallel = await getGospelParallelById(parallel_id);
    if (parallel) {
      parallels.push(parallel);
    }
  }

  return parallels;
}

// Statistics types and functions

export interface BookStatistics {
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

export interface BibleStatistics {
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

export interface WordFrequency {
  word: string;
  count: number;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

export async function getBookStatistics(bookId: number, bible = 'osnb2'): Promise<BookStatistics | null> {
  const sql = getSql();
  const book = getBookById(bookId);
  if (!book) return null;

  // Get verse count and word count for the book (Norwegian).
  // SQLite brukte GROUP_CONCAT(text, ' '); i MySQL trunkeres GROUP_CONCAT av
  // group_concat_max_len, så vi henter radene og joiner teksten i JS i stedet.
  const rows = await sql`
    SELECT text FROM verses WHERE book_id = ${bookId} AND bible = ${bible}
  ` as { text: string }[];
  const allText = rows.map(r => r.text).join(' ');

  // Get original text word count
  const originalBible = bookId <= 39 ? 'tanach' : 'sblgnt';
  const origRows = await sql`
    SELECT text FROM verses WHERE book_id = ${bookId} AND bible = ${originalBible}
  ` as { text: string }[];
  const originalAllText = origRows.map(r => r.text).join(' ');

  // Count original words (split on whitespace, remove punctuation)
  let originalWords = 0;
  if (originalAllText) {
    originalWords = originalAllText
      .replace(/[.,;:!?־׃׀·]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0).length;
  }

  return {
    bookId: book.id,
    bookName: book.name_no,
    shortName: book.short_name,
    testament: book.testament,
    chapters: book.chapters,
    verses: rows.length,
    words: countWords(allText),
    originalWords,
    originalLanguage: bookId <= 39 ? 'hebrew' : 'greek'
  };
}

export async function getBibleStatistics(bible = 'osnb2'): Promise<BibleStatistics> {
  const books = getAllBooks();

  let totalChapters = 0;
  let totalVerses = 0;
  let totalWords = 0;
  let totalOriginalWords = 0;
  let otChapters = 0;
  let otVerses = 0;
  let otWords = 0;
  let ntChapters = 0;
  let ntVerses = 0;
  let ntWords = 0;

  const bookStats: BookStatistics[] = [];

  for (const book of books) {
    const stats = await getBookStatistics(book.id, bible);
    if (stats) {
      bookStats.push(stats);
      totalChapters += stats.chapters;
      totalVerses += stats.verses;
      totalWords += stats.words;
      totalOriginalWords += stats.originalWords;

      if (book.testament === 'OT') {
        otChapters += stats.chapters;
        otVerses += stats.verses;
        otWords += stats.words;
      } else {
        ntChapters += stats.chapters;
        ntVerses += stats.verses;
        ntWords += stats.words;
      }
    }
  }

  const otBooks = books.filter(b => b.testament === 'OT').length;
  const ntBooks = books.filter(b => b.testament === 'NT').length;

  return {
    totalBooks: books.length,
    totalChapters,
    totalVerses,
    totalWords,
    totalOriginalWords,
    otBooks,
    otChapters,
    otVerses,
    otWords,
    ntBooks,
    ntChapters,
    ntVerses,
    ntWords,
    books: bookStats
  };
}

export async function getTopWords(bible = 'osnb2', limit = 100, includeStopWords = false): Promise<WordFrequency[]> {
  const sql = getSql();

  // Get all text from verses
  const verses = await sql`
    SELECT text FROM verses WHERE bible = ${bible}
  ` as { text: string }[];

  // Count words
  const wordCounts: Record<string, number> = {};
  const stopWords = new Set(['og', 'i', 'til', 'som', 'for', 'med', 'den', 'det', 'de', 'en', 'et',
    'av', 'på', 'er', 'var', 'han', 'ham', 'hun', 'seg', 'skal', 'vil', 'har', 'ikke',
    'jeg', 'du', 'vi', 'dere', 'dem', 'sin', 'sine', 'sitt', 'fra', 'om', 'eller',
    'men', 'så', 'da', 'når', 'ble', 'blir', 'være', 'min', 'mitt', 'mine', 'din',
    'ditt', 'dine', 'dette', 'denne', 'disse', 'at', 'over', 'under', 'ut', 'inn',
    'opp', 'ned', 'mot', 'ved', 'etter', 'før', 'selv', 'alle', 'alt', 'noe', 'ingen',
    'hver', 'noen', 'andre', 'mange', 'hele', 'også', 'bare', 'kunne', 'skulle', 'ville',
    'måtte', 'måtte', 'må', 'kan', 'kunne', 'la', 'lot', 'oss', 'deg', 'dem', 'der', 'her']);

  for (const { text } of verses) {
    if (!text) continue;
    const words = text.toLowerCase()
      .replace(/[.,;:!?»«"'"'\-–—()[\]{}]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && (includeStopWords || !stopWords.has(w)));

    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }

  // Sort by frequency and return top N
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

export async function getTopOriginalWords(language: 'hebrew' | 'greek', limit = 100): Promise<WordFrequency[]> {
  const sql = getSql();
  const bible = language === 'hebrew' ? 'tanach' : 'sblgnt';

  // Get all text from verses in the original language
  const verses = await sql`
    SELECT text FROM verses WHERE bible = ${bible}
  ` as { text: string }[];

  // Count words
  const wordCounts: Record<string, number> = {};

  for (const { text } of verses) {
    if (!text) continue;
    // Remove directional formatting characters
    const cleaned = text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D]/g, '');
    // Split on whitespace
    const words = cleaned
      .split(/\s+/)
      .map(w => w.replace(/[׃׀·.,;:!?]/g, '').trim())  // Remove punctuation
      .filter(w => w.length > 1 || (w.length === 1 && !/[ספ]/.test(w)));  // Filter out paragraph markers

    for (const word of words) {
      // Normalize Hebrew by removing cantillation marks (U+0591-U+05AF) for counting
      // This groups words that differ only in cantillation
      const normalized = language === 'hebrew'
        ? word.replace(/[\u0591-\u05AF]/g, '')
        : word;

      if (normalized.length > 0) {
        wordCounts[normalized] = (wordCounts[normalized] || 0) + 1;
      }
    }
  }

  // Sort by frequency and return top N
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// --- Verse mappings ---

export interface VerseMapping {
  id: string;
  name: string;
  description: string | null;
  book_names: string;
  verse_map: string;
  unmapped: string | null;
}

export async function getAllVerseMappings(): Promise<{ id: string; name: string; description: string | null }[]> {
  const sql = getSql();
  return await sql`SELECT id, name, description FROM verse_mappings ORDER BY name` as { id: string; name: string; description: string | null }[];
}

export async function getVerseMappingById(id: string): Promise<VerseMapping | undefined> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM verse_mappings WHERE id = ${id}` as VerseMapping[];
  return row;
}

// === Stories (Bibelhistorier) ===

export interface StoryReference {
  bookId: number;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

export interface StoryData {
  slug: string;
  title: string;
  keywords: string[];
  description: string;
  category: string;
  references: StoryReference[];
}

export interface Story {
  id: number;
  slug: string;
  title: string;
  keywords: string;
  description: string | null;
  category: string;
  content: string;
}

export async function getAllStories(): Promise<Story[]> {
  const sql = getSql();
  return await sql`SELECT * FROM stories ORDER BY category, title` as Story[];
}

export async function getStoryBySlug(slug: string): Promise<Story | undefined> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM stories WHERE slug = ${slug}` as Story[];
  return row;
}

export async function searchStories(query: string): Promise<Story[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  // Split into words and require all significant words to match (in title, keywords, or description)
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(title) LIKE ? OR LOWER(keywords) LIKE ? OR LOWER(description) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p, p];
  });

  return await sql.unsafe(
    `SELECT * FROM stories WHERE ${conditions} ORDER BY title`, params
  ) as Story[];
}

export async function searchThemes(query: string): Promise<Theme[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(name) LIKE ? OR LOWER(content) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p];
  });

  return await sql.unsafe(
    `SELECT * FROM themes WHERE ${conditions} ORDER BY name`, params
  ) as Theme[];
}

export async function getStoriesByCategory(category: string): Promise<Story[]> {
  const sql = getSql();
  return await sql`SELECT * FROM stories WHERE category = ${category} ORDER BY title` as Story[];
}

// --- Extended search functions ---

export interface PersonSearchResult {
  id: string;
  name: string;
  title: string;
  era: string;
  summary: string;
  roles: string[];
}

export async function searchPersons(query: string): Promise<PersonSearchResult[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(name) LIKE ? OR LOWER(content) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p];
  });

  const rows = await sql.unsafe(
    `SELECT * FROM persons WHERE ${conditions} ORDER BY name`, params
  ) as Person[];

  return rows
    .map(row => {
      const data = parsePersonContent(row.content);
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        title: data.title,
        era: data.era,
        summary: data.summary,
        roles: data.roles,
      };
    })
    .filter((p): p is PersonSearchResult => p !== null);
}

export interface ProphecySearchResult {
  id: string;
  title: string;
  explanation: string | null;
  category_name: string;
  prophecy_ref: string;
}

export async function searchProphecies(query: string): Promise<ProphecySearchResult[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(p.title) LIKE ? OR LOWER(p.explanation) LIKE ? OR LOWER(c.name) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p, p];
  });

  // MySQL: CONCAT i stedet for SQLite's ||-konkatenering
  return await sql.unsafe(`
    SELECT p.id, p.title, p.explanation, c.name as category_name,
           CONCAT(b.short_name, ' ', p.prophecy_chapter, ':', p.prophecy_verse_start) as prophecy_ref
    FROM prophecies p
    LEFT JOIN prophecy_categories c ON p.category_id = c.id
    LEFT JOIN books b ON p.prophecy_book_id = b.id
    WHERE ${conditions}
    ORDER BY p.title
  `, params) as ProphecySearchResult[];
}

export interface TimelineSearchResult {
  id: string;
  title: string;
  description: string | null;
  year_display: string | null;
  timeline_type: string;
}

export async function searchTimelineEvents(query: string): Promise<TimelineSearchResult[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p];
  });

  return await sql.unsafe(
    `SELECT id, title, description, year_display, timeline_type
     FROM timeline_events
     WHERE ${conditions}
     ORDER BY sort_order, seq
     LIMIT 20`, params
  ) as TimelineSearchResult[];
}

export interface GospelParallelSearchResult {
  id: string;
  title: string;
  notes: string | null;
  section_name: string;
}

export async function searchGospelParallels(query: string): Promise<GospelParallelSearchResult[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(p.title) LIKE ? OR LOWER(p.notes) LIKE ? OR LOWER(s.name) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p, p];
  });

  return await sql.unsafe(`
    SELECT p.id, p.title, p.notes, s.name as section_name
    FROM gospel_parallels p
    LEFT JOIN gospel_parallel_sections s ON p.section_id = s.id
    WHERE ${conditions}
    ORDER BY p.sort_order
  `, params) as GospelParallelSearchResult[];
}

export interface ReadingPlanSearchResult {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  days: number;
}

export async function searchReadingPlans(query: string): Promise<ReadingPlanSearchResult[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p, p];
  });

  return await sql.unsafe(
    `SELECT id, name, description, category, days FROM reading_plans WHERE ${conditions} ORDER BY name`, params
  ) as ReadingPlanSearchResult[];
}

export interface ImportantWordSearchResult {
  word: string;
  explanation: string;
  book_id: number;
  chapter: number;
  book_short_name: string;
  book_name_no: string;
}

export async function searchImportantWords(query: string): Promise<ImportantWordSearchResult[]> {
  if (!query || query.length < 2) return [];
  const sql = getSql();

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    '(LOWER(iw.word) LIKE ? OR LOWER(iw.explanation) LIKE ?)'
  ).join(' AND ');

  const params = words.flatMap(w => {
    const p = `%${w}%`;
    return [p, p];
  });

  return await sql.unsafe(`
    SELECT iw.word, iw.explanation, iw.book_id, iw.chapter,
           b.short_name as book_short_name, b.name_no as book_name_no
    FROM important_words iw
    JOIN books b ON iw.book_id = b.id
    WHERE ${conditions}
    ORDER BY CAST(iw.word AS BINARY), iw.id
    LIMIT 10
  `, params) as ImportantWordSearchResult[];
}

export interface NumberSymbolismSearchResult {
  number: number;
  meaning: string;
  description: string;
}

export async function searchNumberSymbolism(query: string): Promise<NumberSymbolismSearchResult[]> {
  const sql = getSql();

  // Direct number lookup — bypasses the 2-char minimum
  if (/^\d+$/.test(query.trim())) {
    const num = parseInt(query.trim(), 10);
    const [row] = await sql`SELECT * FROM number_symbolism WHERE number = ${num}` as NumberSymbolism[];
    if (row) {
      const data = JSON.parse(row.content) as NumberSymbolismData;
      return [{ number: data.number, meaning: data.meaning, description: data.description }];
    }
    return [];
  }

  if (!query || query.length < 2) return [];

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() =>
    'LOWER(content) LIKE ?'
  ).join(' AND ');

  const params = words.map(w => `%${w}%`);

  const rows = await sql.unsafe(
    `SELECT * FROM number_symbolism WHERE ${conditions} ORDER BY number`, params
  ) as NumberSymbolism[];

  return rows.map(row => {
    const data = JSON.parse(row.content) as NumberSymbolismData;
    return { number: data.number, meaning: data.meaning, description: data.description };
  });
}

// ============================================================
// Reading texts (lesetekster)
// ============================================================

export interface ReadingText {
  id: number;
  date: string;
  name: string;
  series: string | null;
}

export interface ReadingTextRef {
  id: number;
  reading_text_id: number;
  slot_index: number;
  option_index: number;
  part_index: number;
  title: string | null;
  display_ref: string;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  part_start: string | null;
  part_end: string | null;
  sort_order: number;
}

export interface VerseRange {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  part_start: string | null;
  part_end: string | null;
}

export interface ReadingPart {
  title: string | null;
  /**
   * Stable key for the part: ALL ref markups joined with ';' (with their @source intact).
   * Used as the lookup key in `verses` and as a deterministic identity for the part.
   * Not for direct human display — the UI renders each entry of `refs` separately
   * (so cross-chapter compound refs like "1 Mos 1,1-5; 1,26-2,2" render as two
   * <Reference> links).
   */
  display_ref: string;
  /** Individual ref markups, e.g. ["Apg 16,25-40@dnb2024"] or two for compound. */
  refs: string[];
  ranges: VerseRange[];
}

export interface ReadingOption {
  parts: ReadingPart[];
}

export interface ReadingSlot {
  options: ReadingOption[];
}

export interface ReadingTextWithSlots extends ReadingText {
  slots: ReadingSlot[];
}

/** @deprecated transitional alias — prefer ReadingTextWithSlots */
export type ReadingTextWithRefs = ReadingTextWithSlots;

export async function getAllReadingTexts(): Promise<ReadingText[]> {
  const sql = getSql();
  return await sql`SELECT * FROM reading_texts ORDER BY date` as ReadingText[];
}

/**
 * Strip the `[ref:` / `]` envelope but KEEP the @source mapping suffix so callers
 * (e.g. <Reference />) can convert to the user's preferred numbering system.
 *   "[ref:Apg 16,25-40@dnb2024]" → "Apg 16,25-40@dnb2024"
 *   "[ref:Apg 16,25-40@dnb2024|display]" → "Apg 16,25-40@dnb2024"  (drop |display)
 */
function stripRefMarkupToText(markup: string): string {
  const m = markup.match(/^\[ref:([^|\]]+)/);
  if (!m) return markup;
  return m[1]!.trim();
}

function buildSlots(rows: ReadingTextRef[]): ReadingSlot[] {
  const sorted = [...rows].sort((a, b) =>
    a.slot_index - b.slot_index ||
    a.option_index - b.option_index ||
    a.part_index - b.part_index ||
    a.sort_order - b.sort_order,
  );
  const slots: ReadingSlot[] = [];
  for (const r of sorted) {
    while (slots.length <= r.slot_index) slots.push({ options: [] });
    const slot = slots[r.slot_index]!;
    while (slot.options.length <= r.option_index) slot.options.push({ parts: [] });
    const option = slot.options[r.option_index]!;
    while (option.parts.length <= r.part_index) {
      option.parts.push({ title: null, display_ref: '', refs: [], ranges: [] });
    }
    const part = option.parts[r.part_index]!;
    if (part.title === null) part.title = r.title;
    // Each row's display_ref is one [ref:Book ch,vv@source] markup. Multiple distinct
    // markups in the same part = compound cross-chapter ref ("1 Mos 1,1-5;1,26-2,2").
    const refText = stripRefMarkupToText(r.display_ref);
    if (!part.refs.includes(refText)) part.refs.push(refText);
    part.display_ref = part.refs.join(';');
    part.ranges.push({
      book_id: r.book_id,
      chapter: r.chapter,
      verse_start: r.verse_start,
      verse_end: r.verse_end,
      part_start: r.part_start,
      part_end: r.part_end,
    });
  }
  return slots;
}

export async function getReadingTextById(id: number): Promise<ReadingTextWithSlots | undefined> {
  const sql = getSql();
  const [text] = await sql`SELECT * FROM reading_texts WHERE id = ${id}` as ReadingText[];
  if (!text) return undefined;
  const refs = await sql`
    SELECT * FROM reading_text_refs WHERE reading_text_id = ${id} ORDER BY slot_index, option_index, part_index, sort_order
  ` as ReadingTextRef[];
  return { ...text, slots: buildSlots(refs) };
}

export async function getReadingTextsByDate(date: string): Promise<ReadingTextWithSlots[]> {
  const sql = getSql();
  const texts = await sql`SELECT * FROM reading_texts WHERE date = ${date} ORDER BY id` as ReadingText[];
  const result: ReadingTextWithSlots[] = [];
  for (const text of texts) {
    const refs = await sql`
      SELECT * FROM reading_text_refs WHERE reading_text_id = ${text.id} ORDER BY slot_index, option_index, part_index, sort_order
    ` as ReadingTextRef[];
    result.push({ ...text, slots: buildSlots(refs) });
  }
  return result;
}

export async function getTodaysReadingTexts(): Promise<ReadingTextWithSlots[]> {
  const today = new Date().toISOString().substring(0, 10);
  return getReadingTextsByDate(today);
}

export async function getReadingTextsByChapter(bookId: number, chapter: number): Promise<{
  id: number;
  name: string;
  date: string;
  title: string | null;
  display_ref: string;
  verse_start: number;
  verse_end: number | null;
}[]> {
  const sql = getSql();
  return await sql`
    SELECT t.id, t.name, t.date, r.title, r.display_ref, r.verse_start, r.verse_end
    FROM reading_text_refs r
    JOIN reading_texts t ON r.reading_text_id = t.id
    WHERE r.book_id = ${bookId} AND r.chapter = ${chapter}
    ORDER BY t.date
  ` as any[];
}

export async function searchReadingTexts(query: string): Promise<{ id: number; name: string; date: string; series: string | null }[]> {
  const sql = getSql();
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  if (words.length === 0) return [];

  const conditions = words.map(() => 'LOWER(name) LIKE ?').join(' AND ');
  const params = words.map(w => `%${w}%`);

  return await sql.unsafe(
    `SELECT * FROM reading_texts WHERE ${conditions} ORDER BY date LIMIT 50`, params
  ) as any[];
}
