// Strong's numbers in a translation's text (#202): kjv_strongs and
// rv_1909_strongs carry «God{H430} created{H1254}{(H8804)}{H853}» in the verse.
// The number belongs to the word, not to the text: the stored text stays clean
// (search, MCP and the songs read it), and the numbers are kept per word so the
// page can show them beside the word without standing in the way of reading.

import { describe, expect, test } from 'bun:test';
import { parseStrongs, strongsSegments } from '../src/lib/strongs.ts';
import { toOsnbNumbering } from '../src/lib/edition-import.ts';
import { ukvnEncode } from '@free-bible/kvn';
import { StrongsText } from '../src/views/strongs-text.tsx';

describe('parseStrongs', () => {
  test('numbers come out of the text and attach to the word they follow', () => {
    const r = parseStrongs('In the beginning{H7225} God{H430} created{H1254}{(H8804)}{H853} the heaven{H8064}.');
    expect(r.text).toBe('In the beginning God created the heaven.');
    expect(r.strongs).toEqual([
      { i: 2, n: ['H7225'] },
      { i: 3, n: ['H430'] },
      { i: 4, n: ['H1254', 'H853'] },
      { i: 6, n: ['H8064'] },
    ]);
  });

  test('a number standing on its own after a space joins the word before it', () => {
    const r = parseStrongs('a{G1} {G2} b');
    expect(r.text).toBe('a b');
    expect(r.strongs).toEqual([{ i: 0, n: ['G1', 'G2'] }]);
  });

  test('a verse without numbers gives none, and the text is as it was', () => {
    expect(parseStrongs('In the beginning God.')).toEqual({ text: 'In the beginning God.', strongs: null });
  });
});

describe('strongsSegments', () => {
  test('splits the text into words and gaps, with the numbers on their word', () => {
    const segs = strongsSegments('God created', [{ i: 1, n: ['H1254'] }]);
    expect(segs.map((s) => s.text).join('')).toBe('God created');
    expect(segs.find((s) => s.n)).toEqual({ text: 'created', n: ['H1254'] });
  });

  test('numbers pointing past the last word are ignored, not thrown', () => {
    expect(strongsSegments('God', [{ i: 5, n: ['H1'] }]).some((s) => s.n)).toBe(false);
  });
});

describe('the page', () => {
  test('the number stands before the trailing punctuation, and the text stays whole', () => {
    const html = String(StrongsText({ text: 'God created, and', strongs: [{ i: 1, n: ['H1254'] }] }));
    expect(html).toContain('data-strongs="H1254"');
    expect(html).toContain('created<sup');
    expect(html).toContain('</sup>,');
    expect(html.replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]+>/g, '')).toBe('God created, and');
  });

  test('without numbers the text is rendered as plain text', () => {
    expect(String(StrongsText({ text: 'God created', strongs: null }))).toBe('God created');
  });
});

describe('renumbering', () => {
  const source = { system: 'x', map: [] } as never;
  const identity = { system: 'x', map: [] } as never;

  test('numbers follow an unmerged verse into the osnb numbering', () => {
    const { verses } = toOsnbNumbering([{ bookId: 1, chapterId: 1, verseId: 1, text: 'God{H430} created{H1254}.' }], source, identity);
    expect(verses[0]!.text).toBe('God created.');
    expect(verses[0]!.strongs).toEqual([
      { i: 0, n: ['H430'] },
      { i: 1, n: ['H1254'] },
    ]);
  });

  test('a verse joined from several keeps the clean text but no numbers (they would point at the wrong words)', () => {
    const { verses, merged } = toOsnbNumbering(
      [
        { bookId: 1, chapterId: 1, verseId: 1, text: 'a{H1} b' },
        { bookId: 1, chapterId: 1, verseId: 2, text: 'c{H2} d' },
      ],
      { system: 'x', map: [{ tkvnFrom: ukvnEncode(1, 1, 1), kvnFrom: ukvnEncode(1, 1, 1) }, { tkvnFrom: ukvnEncode(1, 1, 2), kvnFrom: ukvnEncode(1, 1, 1) }] } as never,
      identity,
    );
    expect(merged).toBe(1);
    expect(verses[0]!.text).toBe('a b c d');
    expect(verses[0]!.strongs).toBeNull();
  });
});
