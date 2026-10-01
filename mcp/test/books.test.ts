import { describe, expect, test } from 'bun:test';
import { bookAliases } from '../../src/lib/book-aliases.ts';
import { BOOK_ABBRS, BOOK_NAMES } from '../../src/lib/book-names.ts';
import { booksData } from '../../src/lib/books-data.ts';
import { findBook } from '../src/books.ts';

// Every name and abbreviation the site shows, in every language, must find ITS
// book — not just exist. The index is first-writer-wins across languages, so a
// collision (one language's abbreviation being another book's name elsewhere)
// would send a model to the wrong book without any error.
describe('every displayed book name finds its own book', () => {
  const cases: [string, string, number][] = [];
  for (const b of booksData) {
    cases.push(['nb name', b.name_no, b.id], ['nb key', b.short_name, b.id]);
  }
  for (const [lang, table] of Object.entries(BOOK_NAMES)) {
    for (const [id, name] of Object.entries(table)) cases.push([`${lang} name`, name, Number(id)]);
  }

  test.each(cases)('%s %s', (_kind, name, id) => {
    expect(findBook(name)?.id).toBe(id);
  });
});

describe('abbreviations', () => {
  // Abbreviations are short enough to collide across languages. Each language's
  // own must still resolve, unless another language's NAME or the Norwegian
  // alias list has the same form — then the collision is documented here.
  const knownCollisions = new Set<string>([
    // French «Ag» (Aggée, Haggai) is the Norwegian alias for Acts (`book-aliases.ts`),
    // which the site itself parses; the Norwegian reading wins.
    'fr:Ag',
  ]);
  const cases: [string, string, number][] = [];
  for (const [lang, table] of Object.entries(BOOK_ABBRS)) {
    for (const [id, abbr] of Object.entries(table)) cases.push([lang, abbr, Number(id)]);
  }

  test.each(cases)('%s %s', (lang, abbr, id) => {
    if (knownCollisions.has(`${lang}:${abbr}`)) return;
    expect(findBook(abbr)?.id).toBe(id);
  });
});

test('the Norwegian aliases the site parses keep working', () => {
  for (const [alias, id] of Object.entries(bookAliases)) expect(findBook(alias)?.id).toBe(id);
});

test('Norwegian letter names', () => {
  expect(findBook('Romerbrevet')?.id).toBe(45);
  expect(findBook('1. Korinterbrev')?.id).toBe(46);
  expect(findBook('Jakobs brev')?.id).toBe(59);
  expect(findBook('Romarbrevet')?.id).toBe(45);
});

test('spacing and dots do not matter', () => {
  expect(findBook('1 Cor')?.id).toBe(46);
  expect(findBook('1Cor')?.id).toBe(46);
  expect(findBook('1. kor')?.id).toBe(46);
  expect(findBook('  JOHN ')?.id).toBe(43);
});

test('an unknown book is not guessed', () => {
  expect(findBook('Maccabees')).toBeUndefined();
  expect(findBook('Foo')).toBeUndefined();
});
