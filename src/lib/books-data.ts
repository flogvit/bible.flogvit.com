/**
 * Static book data for client-side usage
 * This file can be imported in both client and server components
 */
import { bookAliases } from './book-aliases.ts';
import { contentLanguageChain, currentContentLanguage } from './lang.ts';

export interface BookInfo {
  id: number;
  name_no: string;
  short_name: string;
  testament: 'OT' | 'NT';
  chapters: number;
}

export const booksData: BookInfo[] = [
  // GT - Det gamle testamente
  { id: 1, name_no: '1. Mosebok', short_name: '1Mos', testament: 'OT', chapters: 50 },
  { id: 2, name_no: '2. Mosebok', short_name: '2Mos', testament: 'OT', chapters: 40 },
  { id: 3, name_no: '3. Mosebok', short_name: '3Mos', testament: 'OT', chapters: 27 },
  { id: 4, name_no: '4. Mosebok', short_name: '4Mos', testament: 'OT', chapters: 36 },
  { id: 5, name_no: '5. Mosebok', short_name: '5Mos', testament: 'OT', chapters: 34 },
  { id: 6, name_no: 'Josva', short_name: 'Jos', testament: 'OT', chapters: 24 },
  { id: 7, name_no: 'Dommerne', short_name: 'Dom', testament: 'OT', chapters: 21 },
  { id: 8, name_no: 'Rut', short_name: 'Rut', testament: 'OT', chapters: 4 },
  { id: 9, name_no: '1. Samuel', short_name: '1Sam', testament: 'OT', chapters: 31 },
  { id: 10, name_no: '2. Samuel', short_name: '2Sam', testament: 'OT', chapters: 24 },
  { id: 11, name_no: '1. Kongebok', short_name: '1Kong', testament: 'OT', chapters: 22 },
  { id: 12, name_no: '2. Kongebok', short_name: '2Kong', testament: 'OT', chapters: 25 },
  { id: 13, name_no: '1. Krønikebok', short_name: '1Krøn', testament: 'OT', chapters: 29 },
  { id: 14, name_no: '2. Krønikebok', short_name: '2Krøn', testament: 'OT', chapters: 36 },
  { id: 15, name_no: 'Esra', short_name: 'Esra', testament: 'OT', chapters: 10 },
  { id: 16, name_no: 'Nehemja', short_name: 'Neh', testament: 'OT', chapters: 13 },
  { id: 17, name_no: 'Ester', short_name: 'Est', testament: 'OT', chapters: 10 },
  { id: 18, name_no: 'Job', short_name: 'Job', testament: 'OT', chapters: 42 },
  { id: 19, name_no: 'Salmene', short_name: 'Sal', testament: 'OT', chapters: 150 },
  { id: 20, name_no: 'Ordspråkene', short_name: 'Ordsp', testament: 'OT', chapters: 31 },
  { id: 21, name_no: 'Forkynneren', short_name: 'Fork', testament: 'OT', chapters: 12 },
  { id: 22, name_no: 'Høysangen', short_name: 'Høys', testament: 'OT', chapters: 8 },
  { id: 23, name_no: 'Jesaja', short_name: 'Jes', testament: 'OT', chapters: 66 },
  { id: 24, name_no: 'Jeremia', short_name: 'Jer', testament: 'OT', chapters: 52 },
  { id: 25, name_no: 'Klagesangene', short_name: 'Klag', testament: 'OT', chapters: 5 },
  { id: 26, name_no: 'Esekiel', short_name: 'Esek', testament: 'OT', chapters: 48 },
  { id: 27, name_no: 'Daniel', short_name: 'Dan', testament: 'OT', chapters: 12 },
  { id: 28, name_no: 'Hosea', short_name: 'Hos', testament: 'OT', chapters: 14 },
  { id: 29, name_no: 'Joel', short_name: 'Joel', testament: 'OT', chapters: 4 },
  { id: 30, name_no: 'Amos', short_name: 'Amos', testament: 'OT', chapters: 9 },
  { id: 31, name_no: 'Obadja', short_name: 'Ob', testament: 'OT', chapters: 1 },
  { id: 32, name_no: 'Jona', short_name: 'Jona', testament: 'OT', chapters: 4 },
  { id: 33, name_no: 'Mika', short_name: 'Mika', testament: 'OT', chapters: 7 },
  { id: 34, name_no: 'Nahum', short_name: 'Nah', testament: 'OT', chapters: 3 },
  { id: 35, name_no: 'Habakkuk', short_name: 'Hab', testament: 'OT', chapters: 3 },
  { id: 36, name_no: 'Sefanja', short_name: 'Sef', testament: 'OT', chapters: 3 },
  { id: 37, name_no: 'Haggai', short_name: 'Hag', testament: 'OT', chapters: 2 },
  { id: 38, name_no: 'Sakarja', short_name: 'Sak', testament: 'OT', chapters: 14 },
  { id: 39, name_no: 'Malaki', short_name: 'Mal', testament: 'OT', chapters: 3 },

  // NT - Det nye testamente
  { id: 40, name_no: 'Matteus', short_name: 'Matt', testament: 'NT', chapters: 28 },
  { id: 41, name_no: 'Markus', short_name: 'Mark', testament: 'NT', chapters: 16 },
  { id: 42, name_no: 'Lukas', short_name: 'Luk', testament: 'NT', chapters: 24 },
  { id: 43, name_no: 'Johannes', short_name: 'Joh', testament: 'NT', chapters: 21 },
  { id: 44, name_no: 'Apostlenes gjerninger', short_name: 'Apg', testament: 'NT', chapters: 28 },
  { id: 45, name_no: 'Romerne', short_name: 'Rom', testament: 'NT', chapters: 16 },
  { id: 46, name_no: '1. Korinterne', short_name: '1Kor', testament: 'NT', chapters: 16 },
  { id: 47, name_no: '2. Korinterne', short_name: '2Kor', testament: 'NT', chapters: 13 },
  { id: 48, name_no: 'Galaterne', short_name: 'Gal', testament: 'NT', chapters: 6 },
  { id: 49, name_no: 'Efeserne', short_name: 'Ef', testament: 'NT', chapters: 6 },
  { id: 50, name_no: 'Filipperne', short_name: 'Fil', testament: 'NT', chapters: 4 },
  { id: 51, name_no: 'Kolosserne', short_name: 'Kol', testament: 'NT', chapters: 4 },
  { id: 52, name_no: '1. Tessalonikerne', short_name: '1Tess', testament: 'NT', chapters: 5 },
  { id: 53, name_no: '2. Tessalonikerne', short_name: '2Tess', testament: 'NT', chapters: 3 },
  { id: 54, name_no: '1. Timoteus', short_name: '1Tim', testament: 'NT', chapters: 6 },
  { id: 55, name_no: '2. Timoteus', short_name: '2Tim', testament: 'NT', chapters: 4 },
  { id: 56, name_no: 'Titus', short_name: 'Tit', testament: 'NT', chapters: 3 },
  { id: 57, name_no: 'Filemon', short_name: 'Filem', testament: 'NT', chapters: 1 },
  { id: 58, name_no: 'Hebreerne', short_name: 'Hebr', testament: 'NT', chapters: 13 },
  { id: 59, name_no: 'Jakob', short_name: 'Jak', testament: 'NT', chapters: 5 },
  { id: 60, name_no: '1. Peter', short_name: '1Pet', testament: 'NT', chapters: 5 },
  { id: 61, name_no: '2. Peter', short_name: '2Pet', testament: 'NT', chapters: 3 },
  { id: 62, name_no: '1. Johannes', short_name: '1Joh', testament: 'NT', chapters: 5 },
  { id: 63, name_no: '2. Johannes', short_name: '2Joh', testament: 'NT', chapters: 1 },
  { id: 64, name_no: '3. Johannes', short_name: '3Joh', testament: 'NT', chapters: 1 },
  { id: 65, name_no: 'Judas', short_name: 'Jud', testament: 'NT', chapters: 1 },
  { id: 66, name_no: 'Åpenbaringen', short_name: 'Åp', testament: 'NT', chapters: 22 },
];

// Create a map for fast lookup by ID
const booksById = new Map(booksData.map(book => [book.id, book]));

// Create a map for fast lookup by slug (short_name lowercased)
const booksBySlug = new Map(booksData.map(book => [book.short_name.toLowerCase(), book]));

/**
 * Get book info by ID (client-safe)
 */
export function getBookInfoById(id: number): BookInfo | undefined {
  return booksById.get(id);
}

/**
 * Get book info by URL slug (client-safe)
 * Falls back to book-aliases for alternate spellings (e.g., "1kron" → "1krøn")
 */
export function getBookInfoBySlug(slug: string): BookInfo | undefined {
  const normalized = slug.toLowerCase();
  const direct = booksBySlug.get(normalized);
  if (direct) return direct;

  // Fallback: check aliases
  const bookId = bookAliases[normalized];
  if (bookId) return booksById.get(bookId);

  return undefined;
}

/**
 * Get book name in Norwegian by ID (client-safe)
 */
export function getBookNameById(id: number): string | undefined {
  return booksById.get(id)?.name_no;
}

/**
 * Get book short name by ID (client-safe)
 */
export function getBookShortNameById(id: number): string | undefined {
  return booksById.get(id)?.short_name;
}

// ── Boknavn per språk (GitHub #20) ───────────────────────────────────
//
// `name_no`/`short_name` over er NORSKE og er samtidig NØKLENE: URL-slugene
// og begge referanseparserne slår opp på dem, og de ligger i delte lenker og
// i brukernes egne data. De skal derfor ikke røres — engelske navn legges ved
// siden av, og valget skjer først ved visning.
//
// Bare engelsk er fylt ut. De øvrige fem språkene har ingen verifiserte
// boknavn hos oss, og faller gjennom innholdskjeden til engelsk — samme
// oppførsel som resten av innholdet. Et nytt språk er ren data her.

const BOOK_NAMES_EN: Record<number, string> = {
  1: 'Genesis', 2: 'Exodus', 3: 'Leviticus', 4: 'Numbers', 5: 'Deuteronomy',
  6: 'Joshua', 7: 'Judges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
  11: '1 Kings', 12: '2 Kings', 13: '1 Chronicles', 14: '2 Chronicles',
  15: 'Ezra', 16: 'Nehemiah', 17: 'Esther', 18: 'Job', 19: 'Psalms',
  20: 'Proverbs', 21: 'Ecclesiastes', 22: 'Song of Solomon', 23: 'Isaiah',
  24: 'Jeremiah', 25: 'Lamentations', 26: 'Ezekiel', 27: 'Daniel', 28: 'Hosea',
  29: 'Joel', 30: 'Amos', 31: 'Obadiah', 32: 'Jonah', 33: 'Micah', 34: 'Nahum',
  35: 'Habakkuk', 36: 'Zephaniah', 37: 'Haggai', 38: 'Zechariah', 39: 'Malachi',
  40: 'Matthew', 41: 'Mark', 42: 'Luke', 43: 'John', 44: 'Acts', 45: 'Romans',
  46: '1 Corinthians', 47: '2 Corinthians', 48: 'Galatians', 49: 'Ephesians',
  50: 'Philippians', 51: 'Colossians', 52: '1 Thessalonians',
  53: '2 Thessalonians', 54: '1 Timothy', 55: '2 Timothy', 56: 'Titus',
  57: 'Philemon', 58: 'Hebrews', 59: 'James', 60: '1 Peter', 61: '2 Peter',
  62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude', 66: 'Revelation',
};

/** Standardforkortelsene (SBL-nær), brukt i referansene. */
const BOOK_ABBR_EN: Record<number, string> = {
  1: 'Gen', 2: 'Exod', 3: 'Lev', 4: 'Num', 5: 'Deut', 6: 'Josh', 7: 'Judg',
  8: 'Ruth', 9: '1 Sam', 10: '2 Sam', 11: '1 Kgs', 12: '2 Kgs', 13: '1 Chr',
  14: '2 Chr', 15: 'Ezra', 16: 'Neh', 17: 'Esth', 18: 'Job', 19: 'Ps',
  20: 'Prov', 21: 'Eccl', 22: 'Song', 23: 'Isa', 24: 'Jer', 25: 'Lam',
  26: 'Ezek', 27: 'Dan', 28: 'Hos', 29: 'Joel', 30: 'Amos', 31: 'Obad',
  32: 'Jonah', 33: 'Mic', 34: 'Nah', 35: 'Hab', 36: 'Zeph', 37: 'Hag',
  38: 'Zech', 39: 'Mal', 40: 'Matt', 41: 'Mark', 42: 'Luke', 43: 'John',
  44: 'Acts', 45: 'Rom', 46: '1 Cor', 47: '2 Cor', 48: 'Gal', 49: 'Eph',
  50: 'Phil', 51: 'Col', 52: '1 Thess', 53: '2 Thess', 54: '1 Tim',
  55: '2 Tim', 56: 'Titus', 57: 'Phlm', 58: 'Heb', 59: 'Jas', 60: '1 Pet',
  61: '2 Pet', 62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude',
  66: 'Rev',
};

/**
 * Første ledd i innholdskjeden vi har navn for. `nn` treffer `nb` (nabospråk
 * før basespråk), alt annet ender på engelsk — nøyaktig som resten av
 * innholdet.
 */
function pickByLanguage<T>(lang: string, norwegian: T, english: T | undefined): T {
  for (const candidate of contentLanguageChain(lang)) {
    if (candidate === 'nb') return norwegian;
    if (candidate === 'en' && english !== undefined) return english;
  }
  return norwegian;
}

/** Boknavnet slik det skal VISES. Språket følger forespørselen. */
export function bookName(book: BookInfo, lang = currentContentLanguage()): string {
  return pickByLanguage(lang, book.name_no, BOOK_NAMES_EN[book.id]);
}

/** Forkortelsen slik den skal VISES (referansechips, kompakte lister). */
export function bookAbbr(book: BookInfo, lang = currentContentLanguage()): string {
  return pickByLanguage(lang, book.short_name, BOOK_ABBR_EN[book.id]);
}

/** Som `bookName`, men fra en bok-id. Ukjent id gir tom streng. */
export function bookNameById(id: number, lang = currentContentLanguage()): string {
  const book = booksById.get(id);
  return book ? bookName(book, lang) : '';
}

/** Som `bookAbbr`, men fra en bok-id. Ukjent id gir tom streng. */
export function bookAbbrById(id: number, lang = currentContentLanguage()): string {
  const book = booksById.get(id);
  return book ? bookAbbr(book, lang) : '';
}

/**
 * Navn/forkortelse fra den norske forkortelsen, som er den nøkkelen SQL-radene
 * bærer med seg (`book_short_name`). Finnes for at et visningssted skal slippe
 * å ha bok-id-en for hånden bare for å oversette navnet.
 */
export function bookNameByShort(short: string | null | undefined, lang = currentContentLanguage()): string {
  const book = short ? booksBySlug.get(short.toLowerCase()) : undefined;
  return book ? bookName(book, lang) : (short ?? '');
}

export function bookAbbrByShort(short: string | null | undefined, lang = currentContentLanguage()): string {
  const book = short ? booksBySlug.get(short.toLowerCase()) : undefined;
  return book ? bookAbbr(book, lang) : (short ?? '');
}
