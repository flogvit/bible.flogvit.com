// Lesekartet (GitHub #16): statistikken som utledes av hendelsesloggen.
// Rene funksjoner, testet uten DB — sidene mater dem med getReadingProgress().

import { describe, expect, test } from 'bun:test';
import { summarizeProgress, bookHeat, HEAT_LEVELS } from '../src/lib/reading-map.ts';
import type { ChapterProgress } from '../src/lib/user-data.ts';

const p = (bookId: number, chapter: number, extra: Partial<ChapterProgress> = {}): ChapterProgress => ({
  bookId,
  chapter,
  firstAt: 1000,
  lastAt: 1000,
  count: 1,
  opens: 1,
  ...extra,
});

describe('summarizeProgress', () => {
  test('teller leste kapitler, ikke hendelser', () => {
    const s = summarizeProgress([p(1, 1), p(1, 2), p(1, 2, { count: 5 })]);
    expect(s.chaptersRead).toBe(2);
  });

  test('kapitler uten fullført lesing teller ikke', () => {
    const s = summarizeProgress([p(1, 1, { count: 0, verses: '1-3' })]);
    expect(s.chaptersRead).toBe(0);
  });

  test('deler GT og NT', () => {
    const s = summarizeProgress([p(1, 1), p(40, 1)]);
    expect(s.otRead).toBe(1);
    expect(s.ntRead).toBe(1);
  });

  test('prosent regnes mot alle 1189 kapitler', () => {
    const s = summarizeProgress([p(1, 1)]);
    expect(s.totalChapters).toBe(1189);
    expect(s.percent).toBeCloseTo(100 / 1189, 3);
  });

  test('sist lest er seneste kjente tidspunkt', () => {
    const s = summarizeProgress([p(1, 1, { lastAt: 500 }), p(1, 2, { lastAt: 9000 })]);
    expect(s.lastReadAt).toBe(9000);
  });

  test('kapitler uten tidspunkt telles for seg og forstyrrer ikke «sist lest»', () => {
    const s = summarizeProgress([p(1, 1, { firstAt: null, lastAt: null }), p(1, 2, { lastAt: 700 })]);
    expect(s.undatedChapters).toBe(1);
    expect(s.lastReadAt).toBe(700);
  });

  test('tomt kart gir nuller, ikke krasj', () => {
    const s = summarizeProgress([]);
    expect(s.chaptersRead).toBe(0);
    expect(s.percent).toBe(0);
    expect(s.lastReadAt).toBeNull();
  });
});

describe('bookHeat', () => {
  test('uleste kapitler har nivå 0', () => {
    expect(bookHeat([], 1)?.chapters[0]).toBe(0);
  });

  test('lest én gang gir laveste ikke-null nivå', () => {
    const heat = bookHeat([p(1, 1)], 1)!;
    expect(heat.chapters[0]).toBe(1);
  });

  test('flere lesinger gir høyere intensitet', () => {
    const heat = bookHeat([p(1, 1, { count: 1 }), p(1, 2, { count: 6 })], 1)!;
    expect(heat.chapters[1]).toBeGreaterThan(heat.chapters[0]!);
  });

  test('intensiteten er begrenset oppad', () => {
    const heat = bookHeat([p(1, 1, { count: 999 })], 1)!;
    expect(heat.chapters[0]).toBeLessThanOrEqual(HEAT_LEVELS);
  });

  test('delvis lest kapittel skiller seg fra ulest og fra fullført', () => {
    const delvis = bookHeat([p(1, 1, { count: 0, verses: '1-5' })], 1)!;
    expect(delvis.chapters[0]).toBe(0.5);
  });

  test('lengden følger bokas kapitteltall', () => {
    expect(bookHeat([], 1)!.chapters).toHaveLength(50);
    expect(bookHeat([], 65)!.chapters).toHaveLength(1);
  });

  test('ukjent bok gir null', () => {
    expect(bookHeat([], 999)).toBeNull();
  });
});
