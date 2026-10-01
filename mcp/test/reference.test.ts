import { describe, expect, test } from 'bun:test';
import { chaptersOf, contains, parseReferences } from '../src/reference.ts';

/** [short_name, chapter, verseStart, endChapter, verseEnd] per passage. */
const read = (input: string) =>
  parseReferences(input).passages.map((p) => [p.book.short_name, p.chapter, p.verseStart, p.endChapter, p.verseEnd]);

describe('both citation conventions', () => {
  test.each([
    ['John 3:16', [['Joh', 3, 16, 3, 16]]],
    ['Joh 3,16', [['Joh', 3, 16, 3, 16]]],
    ['John 3:16-18', [['Joh', 3, 16, 3, 18]]],
    ['Joh 3,16-18', [['Joh', 3, 16, 3, 18]]],
    ['John 3:16,18', [['Joh', 3, 16, 3, 16], ['Joh', 3, 18, 3, 18]]],
    ['Joh 3,16.18', [['Joh', 3, 16, 3, 16], ['Joh', 3, 18, 3, 18]]],
    ['Gen 1:1-2:3', [['1Mos', 1, 1, 2, 3]]],
    ['1. Mosebok 1,1-2,3', [['1Mos', 1, 1, 2, 3]]],
    ['1 Cor 13:4-7', [['1Kor', 13, 4, 13, 7]]],
    ['John 3:16–18', [['Joh', 3, 16, 3, 18]]],
  ] as const)('%s', (input, expected) => {
    expect(read(input)).toEqual(expected as unknown as (string | number | null)[][]);
  });
});

test('whole chapters and chapter ranges', () => {
  expect(read('Ps 23')).toEqual([['Sal', 23, null, 23, null]]);
  expect(read('Psalm 23-24')).toEqual([['Sal', 23, null, 24, null]]);
});

test('a reference without a book keeps the previous book', () => {
  expect(read('Rom 8:28; 9:1')).toEqual([['Rom', 8, 28, 8, 28], ['Rom', 9, 1, 9, 1]]);
  expect(read('John 3:16; Rom 5:8')).toEqual([['Joh', 3, 16, 3, 16], ['Rom', 5, 8, 5, 8]]);
});

test('a single-chapter book reads the number as a verse', () => {
  expect(read('Jude 3')).toEqual([['Jud', 1, 3, 1, 3]]);
  expect(read('Jude 3-5')).toEqual([['Jud', 1, 3, 1, 5]]);
  expect(read('Phlm 1:4')).toEqual([['Filem', 1, 4, 1, 4]]);
});

test('what cannot be read is reported, not guessed', () => {
  expect(parseReferences('Ruth').errors[0]).toContain('add a chapter');
  expect(parseReferences('Ps 151').errors[0]).toContain('has 150');
  expect(parseReferences('Foo 3:1').errors[0]).toContain('unknown book');
  expect(parseReferences('John 3:0').errors[0]).toContain('start at 1');
  expect(parseReferences('John 3:18-16').errors[0]).toContain('backwards');
  expect(parseReferences('9:1').errors[0]).toContain('no book');
});

test('one bad reference does not lose the good ones', () => {
  const r = parseReferences('John 3:16; Foo 1; Rom 5:8');
  expect(r.passages).toHaveLength(2);
  expect(r.errors).toHaveLength(1);
});

test('contains and chaptersOf follow the passage bounds', () => {
  const [p] = parseReferences('Gen 1:30-2:2').passages;
  expect(chaptersOf(p!)).toEqual([1, 2]);
  expect(contains(p!, 1, 29)).toBe(false);
  expect(contains(p!, 1, 31)).toBe(true);
  expect(contains(p!, 2, 2)).toBe(true);
  expect(contains(p!, 2, 3)).toBe(false);
  const [whole] = parseReferences('Ps 23').passages;
  expect(contains(whole!, 23, 6)).toBe(true);
  expect(contains(whole!, 24, 1)).toBe(false);
});
