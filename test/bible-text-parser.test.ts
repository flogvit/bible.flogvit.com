import { describe, expect, test } from 'bun:test';
// @ts-expect-error — delt klient-modul uten typer
import { parseBibleText } from '../public/js/bible-text-parser.js';

const BOOK_NAMES = { '1 Mos': 1, '2 Mos': 2, Joh: 43 };

describe('parseBibleText', () => {
  test('parser «Boknavn kapittel,vers tekst» og grupperer per kapittel', () => {
    const text = [
      '1 Mos 1,1 I begynnelsen skapte Gud himmelen og jorden.',
      '1 Mos 1,2 Jorden var øde og tom.',
      '1 Mos 2,1 Slik ble himmelen og jorden fullført.',
      'Joh 3,16 For så høyt har Gud elsket verden.',
    ].join('\n');
    const res = parseBibleText(text, BOOK_NAMES, 'user:test');
    expect(res.stats).toEqual({ books: 2, chapters: 3, verses: 4 });
    expect(res.warnings).toEqual([]);
    const gen1 = res.chapters.find((c: any) => c.bookId === 1 && c.chapter === 1);
    expect(gen1.bible).toBe('user:test');
    expect(gen1.verses.map((v: any) => v.verse)).toEqual([1, 2]);
    expect(gen1.verses[0].text).toBe('I begynnelsen skapte Gud himmelen og jorden.');
  });

  test('greedy boknavn: «1 Mos» vinner over kortere match, vers sorteres', () => {
    const text = ['1 Mos 1,3 Tredje.', '1 Mos 1,1 Første.'].join('\n');
    const res = parseBibleText(text, BOOK_NAMES, 'user:x');
    expect(res.chapters[0].verses.map((v: any) => v.verse)).toEqual([1, 3]);
  });

  test('ukjente linjer gir advarsler, tomme linjer ignoreres', () => {
    const text = ['', 'Ukjent Bok 1,1 Hei.', '1 Mos hei du', '1 Mos 1,1 OK.'].join('\n');
    const res = parseBibleText(text, BOOK_NAMES, 'user:x');
    expect(res.stats.verses).toBe(1);
    expect(res.warnings.length).toBe(2);
  });

  test('tom tekst gir 0 vers', () => {
    const res = parseBibleText('', BOOK_NAMES, 'user:x');
    expect(res.stats.verses).toBe(0);
  });
});
