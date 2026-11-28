// To testporter mot samme lokale base får aldri samme bruker-id (#276-porten).

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { testUserId } from './test-users.ts';

const INT_MAX = 2 ** 31 - 1;

describe('testUserId', () => {
  test('to samtidige kjøringer (to pid-er) deler ingen id', () => {
    const a = Array.from({ length: 100 }, (_, s) => testUserId(s, 41_000));
    const b = Array.from({ length: 100 }, (_, s) => testUserId(s, 41_001));
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  test('filene i samme kjøring får hver sin id', () => {
    expect(new Set([0, 1, 2].map((s) => testUserId(s))).size).toBe(3);
  });

  test('id-en passer i user_id (INT), også for den største pid-en', () => {
    expect(testUserId(99, 9_999_999)).toBeLessThanOrEqual(INT_MAX);
  });

  test('en slot utenfor området er en feil, ikke en kollisjon', () => {
    expect(() => testUserId(100)).toThrow('utenfor');
    expect(() => testUserId(-1)).toThrow('utenfor');
  });

  // Pid-en skiller KJØRINGER; sloten er det eneste som skiller filene i samme
  // kjøring. To filer med samme slot sletter hverandres rader akkurat som de
  // faste id-ene gjorde — bare innenfor én `bun test` i stedet for mellom to.
  test('ingen slot brukes to ganger, og hver slot er en literal', () => {
    const dir = import.meta.dir;
    const bruk: string[] = [];
    for (const fil of fs.readdirSync(dir, { recursive: true }) as string[]) {
      if (!fil.endsWith('.ts') || path.basename(fil).startsWith('test-users')) continue;
      const tekst = fs.readFileSync(path.join(dir, fil), 'utf-8');
      for (const m of tekst.matchAll(/testUserId\(([^)]*)\)/g)) {
        expect(m[1], `${fil}: slot må være et tall, ikke «${m[1]}»`).toMatch(/^\d+$/);
        bruk.push(`${m[1]} ${fil}`);
      }
    }
    expect(bruk.length).toBeGreaterThan(0);
    const perSlot = Map.groupBy(bruk, (b) => b.split(' ')[0]);
    const doble = [...perSlot.values()].filter((v) => v.length > 1);
    expect(doble).toEqual([]);
  });

  // #288: en fast 99xxxx-id er nøyaktig det testUserId() erstatter — to porter
  // samtidig mot samme lokale base sletter hverandres rader.
  test('ingen testfil tildeler en fast 99xxxx-bruker-id', () => {
    const dir = import.meta.dir;
    const funn: string[] = [];
    for (const fil of fs.readdirSync(dir, { recursive: true }) as string[]) {
      if (!fil.endsWith('.ts') || path.basename(fil).startsWith('test-users')) continue;
      const tekst = fs.readFileSync(path.join(dir, fil), 'utf-8');
      for (const m of tekst.matchAll(/(?:USER[A-Z_]*\s*=|\bid:)\s*99\d{4}\b/g)) funn.push(`${fil}: ${m[0]}`);
    }
    expect(funn).toEqual([]);
  });
});
