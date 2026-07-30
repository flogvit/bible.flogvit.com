// Lesekartet (GitHub #16): statistikken som utledes av hendelsesloggen.
// Rene funksjoner, testet uten DB — sidene mater dem med getReadingProgress().

import { describe, expect, test } from 'bun:test';
import { summarizeProgress, bookHeat, HEAT_LEVELS, planCoverage, suggestedPlans } from '../src/lib/reading-map.ts';
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

// ── Leseplan som DEKNING, ikke som rute (#16) ─────────────────────────
//
// «En leseplan blir bare et spørsmål mot kartet» — det er hele poenget med
// issuen: fri lesing skal telle. Planene GJENBRUKES som kapittelsett framfor en
// egen liste-datafil, fordi de allerede er kuratert og oversatt per språk.

const plan = (id: string, chapters: [number, number][]) => ({
  id,
  name: id,
  chapters: chapters.map(([bookId, chapter]) => ({ bookId, chapter })),
});

describe('planCoverage', () => {
  const paulus = plan('paulus', [[45, 1], [45, 2], [46, 1]]);

  test('teller kapitler fra kartet, uansett hvordan de ble lest', () => {
    const c = planCoverage([p(45, 1), p(46, 1)], [paulus])[0]!;
    expect({ total: c.total, read: c.read, missing: c.missing }).toEqual({ total: 3, read: 2, missing: 1 });
  });

  test('gjenlesing teller fortsatt som ETT kapittel', () => {
    const c = planCoverage([p(45, 1), p(45, 1, { count: 9 })], [paulus])[0]!;
    expect(c.read).toBe(1);
  });

  test('påbegynt kapittel (kun delvis lest) teller ikke', () => {
    const c = planCoverage([p(45, 1, { count: 0, verses: '1-3' })], [paulus])[0]!;
    expect({ read: c.read, missing: c.missing }).toEqual({ read: 0, missing: 3 });
  });

  test('lesing utenfor planen påvirker den ikke', () => {
    const c = planCoverage([p(1, 1), p(19, 23)], [paulus])[0]!;
    expect(c.read).toBe(0);
  });
});

describe('suggestedPlans', () => {
  const nesten = plan('nesten', [[45, 1], [45, 2]]);
  const halv = plan('halv', [[46, 1], [46, 2], [46, 3], [46, 4]]);
  const urørt = plan('urørt', [[47, 1], [47, 2]]);
  const ferdig = plan('ferdig', [[48, 1]]);
  const tom = plan('tom', []);
  const progress = [p(45, 1), p(46, 1), p(46, 2), p(48, 1)];

  test('nærmest først', () => {
    expect(suggestedPlans(progress, [halv, nesten]).map((s) => s.id)).toEqual(['nesten', 'halv']);
  });

  test('upåbegynte holdes utenfor — forslaget er «nesten i mål», ikke katalogen', () => {
    expect(suggestedPlans(progress, [urørt, nesten]).map((s) => s.id)).toEqual(['nesten']);
  });

  test('fullførte planer foreslås ikke', () => {
    expect(suggestedPlans(progress, [ferdig]).map((s) => s.id)).toEqual([]);
  });

  test('en plan uten kapitler (ugyldig JSON i importen) faller ut', () => {
    expect(suggestedPlans(progress, [tom]).map((s) => s.id)).toEqual([]);
  });

  test('lista er begrenset', () => {
    const mange = Array.from({ length: 9 }, (_, i) => plan(`p${i}`, [[45, 1], [45, 2 + i]]));
    expect(suggestedPlans([p(45, 1)], mange, 3)).toHaveLength(3);
  });

  test('uten framdrift foreslås ingenting', () => {
    expect(suggestedPlans([], [nesten, halv])).toEqual([]);
  });
});
