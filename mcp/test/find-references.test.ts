import { expect, test } from 'bun:test';
import { booksData, bookName } from '../../src/lib/books-data.ts';
import { getChapterVerseCount } from '../../src/lib/verse-counts.ts';
import { findReferences } from '../src/find-references.ts';

const found = (text: string) => findReferences(text).map((f) => f.written);

test('references in both conventions, inside a sentence', () => {
  expect(found('Som det står i Joh 3,16: «For så høyt …»')).toEqual(['Joh 3,16']);
  expect(found('See John 3:16-18, and 1 Cor 13:4-7.')).toEqual(['John 3:16-18', '1 Cor 13:4-7']);
  expect(found('Jf. 1. Kor 13,4.7 og Jes 64,6b-65,2.')).toEqual(['1. Kor 13,4.7', 'Jes 64,6b-65,2']);
  expect(found('Song of Songs 2:1 and Ps 23 and Jude 3.')).toEqual(['Song of Songs 2:1', 'Ps 23', 'Jude 3']);
});

test('a reference without a book keeps the previous one, as parseReferences reads it', () => {
  const [f] = findReferences('Se Rom 8:28; 9:1.');
  expect(f!.written).toBe('Rom 8:28; 9:1');
  expect(f!.passages.map((p) => `${p.chapter}:${p.verseStart}`)).toEqual(['8:28', '9:1']);
});

test('line and column are where the reference starts', () => {
  const [a, b] = findReferences('Første linje.\nHer står Joh 3,16 og John 1:1.', 41);
  expect([a!.line, a!.column]).toEqual([42, 10]);
  expect([b!.line, b!.column]).toEqual([42, 22]);
});

test('lower-case words that are also abbreviations are not references', () => {
  expect(found('Han var hos 3 av dem, og en sak 4 ganger.')).toEqual([]);
  expect(found('I 1984 var det 3,5 millioner. Kapittel 4 er langt.')).toEqual([]);
});

test('a reference past the end of a book or chapter is a problem, named in the language', () => {
  expect(findReferences('Sal 151')[0]!.problem).toContain('chapter 151 does not exist');
  expect(findReferences('Sal 23,9', 1, 'nb')[0]!.problem).toBe('Salmene 23 has 6 verses, not 9.');
  expect(findReferences('Ps 23:1-9')[0]!.problem).toBe('Psalms 23 has 6 verses, not 9.');
  expect(findReferences('Ps 23:1-6')[0]!.problem).toBeUndefined();
});

// Every book, by every name the site shows, at its last verse and one past it.
test('every book is found by its name, and its last verse is the last one', () => {
  for (const b of booksData) {
    const last = b.chapters;
    const verses = getChapterVerseCount(b.id, last);
    for (const name of new Set([b.name_no, b.short_name, bookName(b, 'en')])) {
      const [ok] = findReferences(`Se ${name} ${last}:${verses}.`);
      expect(ok?.passages[0]?.book.id, name).toBe(b.id);
      expect(ok?.problem, name).toBeUndefined();
      expect(findReferences(`Se ${name} ${last}:${verses + 1}.`)[0]?.problem, name).toBeDefined();
    }
  }
});
