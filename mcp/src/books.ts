// Book lookup for text written by a MODEL, not by a reader of the site.
//
// The site's two reference parsers (`src/lib/reference-parser.ts`,
// `src/lib/standard-ref-parser.ts`) only know the Norwegian aliases: "1 Cor 13"
// is not found, and "John 3:16" silently loses its verse. A model writes the
// book in whatever language the conversation is in, so this index is built from
// every name and abbreviation the site already shows — `book-names.ts` covers
// all eight locales, `book-aliases.ts` the Norwegian spellings. Nothing here is
// a new list of names except `EXTRA`, which holds the forms no table has.

import { bookAliases } from '../../src/lib/book-aliases.ts';
import { BOOK_ABBRS, BOOK_NAMES } from '../../src/lib/book-names.ts';
import { booksData, getBookInfoById, type BookInfo } from '../../src/lib/books-data.ts';

/** Common forms a model writes that no display table carries. */
const EXTRA: Record<string, number> = {
  psalm: 19,
  salmene: 19,
  'salmenes bok': 19,
  'song of songs': 22,
  canticles: 22,
  qohelet: 21,
  revelations: 66,
  apocalypse: 66,
  'acts of the apostles': 44,
  mt: 40,
  mk: 41,
  lk: 42,
  jn: 43,
  phm: 57,
};

/** Lowercase, no dots, single spaces: "1. Kor" and "1 kor" are the same key. */
export function bookKey(input: string): string {
  return input.normalize('NFC').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

const index = new Map<string, number>();

function add(name: string, id: number): void {
  const key = bookKey(name);
  // First writer wins: the Norwegian keys the site itself parses come first.
  // A collision between two languages is caught by test/books.test.ts, which
  // demands that every displayed name finds its own book.
  if (!index.has(key)) index.set(key, id);
  const compact = key.replace(/ /g, '');
  if (!index.has(compact)) index.set(compact, id);
}

for (const b of booksData) {
  add(b.short_name, b.id);
  add(b.name_no, b.id);
}
for (const [alias, id] of Object.entries(bookAliases)) add(alias, id);
for (const lang of Object.keys(BOOK_NAMES)) {
  for (const [id, name] of Object.entries(BOOK_NAMES[lang] ?? {})) add(name, Number(id));
  for (const [id, abbr] of Object.entries(BOOK_ABBRS[lang] ?? {})) add(abbr, Number(id));
}
for (const [name, id] of Object.entries(EXTRA)) add(name, id);

// Norwegian speaks of the letters as letters — «Romerbrevet», «1. Korinterbrev»,
// «Jakobs brev» — where the tables say «Romerne», «1. Korinterne», «Jakob».
// Derived from the names rather than listed, for bokmål and nynorsk alike.
const LETTERS = { from: 45, to: 65 };
for (const names of [Object.fromEntries(booksData.map((b) => [b.id, b.name_no])), BOOK_NAMES.nn ?? {}]) {
  for (let id = LETTERS.from; id <= LETTERS.to; id++) {
    const name = names[id];
    if (!name) continue;
    const stem = name.replace(/(ane|ne)$/, '');
    for (const suffix of ['brev', 'brevet', 's brev', 'sbrev', 'sbrevet']) add(stem + suffix, id);
  }
}

export function findBook(input: string): BookInfo | undefined {
  const key = bookKey(input);
  const id = index.get(key) ?? index.get(key.replace(/ /g, ''));
  return id ? getBookInfoById(id) : undefined;
}
