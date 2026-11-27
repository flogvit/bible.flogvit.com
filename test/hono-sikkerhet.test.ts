// hono under 4.13.23 har kjente sikkerhetsråd (#276): GHSA-mhwf-w6q6-q58w
// (getPath dropper første segment på Bun uten Host), GHSA-586x-c76g-h528 og
// GHSA-656w-x92q-369m (TrieRouter). bibel og bibel-mcp bygges hver fra sin lås,
// så gulvet sjekkes i BEGGE — rotas `bun test` hopper over mcp/, men låsen er
// bare tekst og kan leses herfra.
//
// Vakta står på LÅSEN, ikke på node_modules: imaget installeres fra låsen, og
// et arbeidstres node_modules kan være delt med andre kloner.
//
// ALLE hono-oppføringer telles, også en nøstet kopi (`"<pakke>/hono": [...]`)
// som en avhengighet drar inn med sitt eget område — den havner i imaget like
// mye som toppnivåets.

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const HONO_GULV = '4.13.23';
const ROT = path.join(import.meta.dir, '..');

/** Hver hono-versjon låsen løser opp til, toppnivå og nøstet. */
function låsteHono(lås: string): string[] {
  return [...lås.matchAll(/"(?:[^"\s]+\/)?hono": \["hono@([^"]+)"/g)].map((m) => m[1]!);
}

/** Versjonene under gulvet. Tom liste = grønt; en lås uten hono er en feil. */
function underGulvet(lås: string): string[] {
  const versjoner = låsteHono(lås);
  if (versjoner.length === 0) throw new Error('fant ikke hono i låsen');
  return versjoner.filter((v) => Bun.semver.order(v, HONO_GULV) < 0);
}

describe('hono er over gulvet for kjente råd (#276)', () => {
  for (const lås of ['bun.lock', 'mcp/bun.lock']) {
    test(`${lås} låser hono ${HONO_GULV} eller nyere`, () => {
      expect(underGulvet(fs.readFileSync(path.join(ROT, lås), 'utf-8'))).toEqual([]);
    });
  }

  test('vakta fanger en nøstet gammel kopi selv når toppnivået er løftet', () => {
    const lås = `{
      "packages": {
        "hono": ["hono@4.13.23", "", {}, "sha512-a"],
        "@hono/node-server/hono": ["hono@4.13.18", "", {}, "sha512-b"],
      }
    }`;
    expect(underGulvet(lås)).toEqual(['4.13.18']);
  });

  test('sammenligningen er semver, ikke tekst: 4.13.100 er over, 4.9.99 er under', () => {
    const lås = (v: string) => `"hono": ["hono@${v}", "", {}, "sha512-a"],`;
    expect(underGulvet(lås('4.13.100'))).toEqual([]);
    expect(underGulvet(lås('4.14.0'))).toEqual([]);
    expect(underGulvet(lås('4.9.99'))).toEqual(['4.9.99']);
  });

  test('en lås uten hono er rød, ikke stille grønn', () => {
    expect(() => underGulvet('{ "packages": {} }')).toThrow('fant ikke hono');
  });
});
