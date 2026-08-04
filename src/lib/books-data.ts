/**
 * Static book data for client-side usage
 * This file can be imported in both client and server components
 */
import { bookAliases } from './book-aliases.ts';
import { BOOK_ABBRS, BOOK_NAMES, type BookNameTable } from './book-names.ts';
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

// ── Boknavn per språk (GitHub #20, alle åtte språk i #69) ────────────
//
// `name_no`/`short_name` over er NORSKE og er samtidig NØKLENE: URL-slugene
// og begge referanseparserne slår opp på dem, og de ligger i delte lenker og
// i brukernes egne data. De skal derfor ikke røres — navnene på de andre
// språkene ligger ved siden av (`book-names.ts`), og valget skjer først ved
// visning.
//
// Bokmål bor derfor HER og ikke i tabellene: én verdi, som både er nøkkelen og
// den norske visningen, kan ikke drive fra seg selv.

/**
 * Første ledd i innholdskjeden vi har navnet på. Bokmål er nøkkelspråket over;
 * resten slås opp i tabellen. Mangler et språk navnet, ender kjeden på engelsk
 * — nøyaktig som resten av innholdet — men det er nettopp det `#69` handlet om,
 * så `test/book-names.test.ts` er rød hvis det skjer.
 */
function pickByLanguage(lang: string, book: BookInfo, table: BookNameTable, norwegian: string): string {
  for (const candidate of contentLanguageChain(lang)) {
    if (candidate === 'nb') return norwegian;
    const hit = table[candidate]?.[book.id];
    if (hit) return hit;
  }
  return norwegian;
}

/** Boknavnet slik det skal VISES. Språket følger forespørselen. */
export function bookName(book: BookInfo, lang = currentContentLanguage()): string {
  return pickByLanguage(lang, book, BOOK_NAMES, book.name_no);
}

/** Forkortelsen slik den skal VISES (referansechips, kompakte lister). */
export function bookAbbr(book: BookInfo, lang = currentContentLanguage()): string {
  return pickByLanguage(lang, book, BOOK_ABBRS, book.short_name);
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
 *
 * Går gjennom `getBookInfoBySlug`, altså ALIAS-tabellen: kildene staver ikke
 * nøkkelen likt («Høy» mot bokas «Høys»), og et direkte oppslag i booksBySlug
 * falt da stille tilbake til den norske nøkkelen — «Høy 1:1» sto igjen på
 * /en/tidslinje og /en/statistikk. URL-siden slo alt opp med alias; nå gjør
 * visningen det samme, så nøkkel og navn ikke kan sprike.
 */
export function bookNameByShort(short: string | null | undefined, lang = currentContentLanguage()): string {
  const book = short ? getBookInfoBySlug(short) : undefined;
  return book ? bookName(book, lang) : (short ?? '');
}

export function bookAbbrByShort(short: string | null | undefined, lang = currentContentLanguage()): string {
  const book = short ? getBookInfoBySlug(short) : undefined;
  return book ? bookAbbr(book, lang) : (short ?? '');
}
