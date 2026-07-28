// Kjernelogikken for lesesporing (GitHub #16). Ren modul uten DOM/DB, delt
// mellom klienten (reading.js) og serveren (sync.ts), så terskler og
// merge-regler finnes ÉN gang.

import { describe, expect, test } from 'bun:test';
// @ts-expect-error — delt klient-modul uten typer
import { dwellFloorMs, dwellCapMs, chapterComplete, versesToRanges, rangesToVerses, mergeProgress, recordRead, recordOpen, emptyProgress, heatLevel, HEAT_LEVELS } from '../public/js/reading-progress.js';

describe('dwell-terskler', () => {
  test('lengre vers krever lengre synlig tid', () => {
    expect(dwellFloorMs(40)).toBeGreaterThan(dwellFloorMs(10));
  });

  test('kalibrert mot en RASK leser: et 10-ords vers krever ~1 sekund', () => {
    const ms = dwellFloorMs(10);
    expect(ms).toBeGreaterThan(700);
    expect(ms).toBeLessThan(1600);
  });

  test('svært korte vers har et gulv så de ikke passerer på et blunk', () => {
    expect(dwellFloorMs(1)).toBeGreaterThanOrEqual(400);
    expect(dwellFloorMs(0)).toBeGreaterThanOrEqual(400);
  });

  test('taket ligger over gulvet, så en parkert side ikke bygger kreditt', () => {
    expect(dwellCapMs(20)).toBeGreaterThan(dwellFloorMs(20));
  });
});

describe('chapterComplete', () => {
  test('90 % dekning er nok — siste versene kan skummes', () => {
    expect(chapterComplete(27, 30)).toBe(true);
    expect(chapterComplete(26, 30)).toBe(false);
  });

  test('alle vers i et ettverskapittel må leses', () => {
    expect(chapterComplete(1, 1)).toBe(true);
    expect(chapterComplete(0, 1)).toBe(false);
  });

  test('null vers er aldri komplett', () => {
    expect(chapterComplete(0, 0)).toBe(false);
  });
});

describe('range-koding', () => {
  test('sammenhengende vers blir til intervaller', () => {
    expect(versesToRanges([1, 2, 3, 7])).toBe('1-3,7');
  });

  test('usortert og duplisert input normaliseres', () => {
    expect(versesToRanges([7, 1, 3, 2, 3])).toBe('1-3,7');
  });

  test('tom liste blir tom streng', () => {
    expect(versesToRanges([])).toBe('');
  });

  test('rundtur bevarer versene', () => {
    expect(rangesToVerses(versesToRanges([1, 2, 3, 7, 8, 20]))).toEqual([1, 2, 3, 7, 8, 20]);
  });

  test('tom streng gir tom liste', () => {
    expect(rangesToVerses('')).toEqual([]);
  });
});

describe('mergeProgress', () => {
  test('en lest-markering kan aldri forsvinne i fletting', () => {
    const lest = { firstAt: 100, lastAt: 100, count: 1, opens: 1 };
    const tom = emptyProgress();
    expect(mergeProgress(lest, tom).count).toBe(1);
    expect(mergeProgress(tom, lest).count).toBe(1);
  });

  test('firstAt er tidligste, lastAt er seneste', () => {
    const a = { firstAt: 100, lastAt: 500, count: 2, opens: 3 };
    const b = { firstAt: 50, lastAt: 300, count: 1, opens: 9 };
    const m = mergeProgress(a, b);
    expect(m.firstAt).toBe(50);
    expect(m.lastAt).toBe(500);
    expect(m.count).toBe(2);
    expect(m.opens).toBe(9);
  });

  test('ukjent tidspunkt (null) taper mot et kjent', () => {
    const ukjent = { firstAt: null, lastAt: null, count: 1, opens: 0 };
    const kjent = { firstAt: 400, lastAt: 400, count: 1, opens: 0 };
    const m = mergeProgress(ukjent, kjent);
    expect(m.firstAt).toBe(400);
    expect(m.lastAt).toBe(400);
  });

  test('to ukjente forblir ukjent — vi dikter ikke opp et tidspunkt', () => {
    const a = { firstAt: null, lastAt: null, count: 1, opens: 0 };
    const m = mergeProgress(a, { firstAt: null, lastAt: null, count: 1, opens: 0 });
    expect(m.lastAt).toBeNull();
    expect(m.count).toBe(1);
  });

  test('delvis leste vers unioneres', () => {
    const a = { firstAt: 1, lastAt: 1, count: 0, opens: 1, verses: '1-3' };
    const b = { firstAt: 1, lastAt: 1, count: 0, opens: 1, verses: '5,7-8' };
    expect(mergeProgress(a, b).verses).toBe('1-3,5,7-8');
  });

  test('merge er kommutativ', () => {
    const a = { firstAt: 100, lastAt: 500, count: 2, opens: 3, verses: '1-3' };
    const b = { firstAt: 50, lastAt: 300, count: 3, opens: 1, verses: '2-5' };
    expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
  });

  test('merge er idempotent', () => {
    const a = { firstAt: 100, lastAt: 500, count: 2, opens: 3, verses: '1-3' };
    expect(mergeProgress(a, a)).toEqual(mergeProgress(a, mergeProgress(a, a)));
  });
});

describe('heatLevel', () => {
  test('ulest er 0', () => {
    expect(heatLevel({ count: 0, opens: 3 })).toBe(0);
  });

  test('delvis lest ligger mellom ulest og lest', () => {
    const level = heatLevel({ count: 0, verses: '1-4' });
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(1);
  });

  test('én lesing er nivå 1, gjenlesing gir høyere', () => {
    expect(heatLevel({ count: 1 })).toBe(1);
    expect(heatLevel({ count: 5 })).toBeGreaterThan(1);
  });

  test('nivået har et tak', () => {
    expect(heatLevel({ count: 100000 })).toBe(HEAT_LEVELS);
  });

  test('tom eller manglende oppføring er 0', () => {
    expect(heatLevel(null)).toBe(0);
    expect(heatLevel(undefined)).toBe(0);
  });
});

describe('recordRead / recordOpen', () => {
  test('første lesing setter firstAt og lastAt og teller 1', () => {
    const e = recordRead(emptyProgress(), 1000);
    expect(e).toMatchObject({ firstAt: 1000, lastAt: 1000, count: 1 });
  });

  test('gjenlesing beholder firstAt, flytter lastAt og øker count', () => {
    const e = recordRead(recordRead(emptyProgress(), 1000), 5000);
    expect(e).toMatchObject({ firstAt: 1000, lastAt: 5000, count: 2 });
  });

  test('lesing uten kjent tidspunkt teller, men setter ikke tid', () => {
    const e = recordRead(emptyProgress(), null);
    expect(e.count).toBe(1);
    expect(e.lastAt).toBeNull();
  });

  test('fullført lesing rydder bort delvis-tilstanden', () => {
    const delvis = { ...emptyProgress(), verses: '1-3' };
    expect(recordRead(delvis, 1000).verses).toBeUndefined();
  });

  test('åpning teller opens uten å telle som lest', () => {
    const e = recordOpen(emptyProgress(), 1000);
    expect(e.opens).toBe(1);
    expect(e.count).toBe(0);
  });
});
