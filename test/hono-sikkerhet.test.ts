// hono under 4.13.23 har kjente sikkerhetsråd (#276): GHSA-mhwf-w6q6-q58w
// (getPath dropper første segment på Bun uten Host), GHSA-586x-c76g-h528 og
// GHSA-656w-x92q-369m (TrieRouter). bibel og bibel-mcp bygges hver fra sin lås,
// så gulvet sjekkes i BEGGE — rotas `bun test` hopper over mcp/, men låsen er
// bare tekst og kan leses herfra.
//
// Vakta står på LÅSEN, ikke på node_modules: imaget installeres fra låsen, og
// et arbeidstres node_modules kan være delt med andre kloner.

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const HONO_GULV = '4.13.23';
const ROT = path.join(import.meta.dir, '..');

function sammenlign(a: string, b: string): number {
  const [x = [], y = []] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

function låstHono(lås: string): string {
  const treff = fs.readFileSync(path.join(ROT, lås), 'utf-8').match(/"hono": \["hono@(\d+\.\d+\.\d+)"/);
  if (!treff?.[1]) throw new Error(`fant ikke hono i ${lås}`);
  return treff[1];
}

describe('hono er over gulvet for kjente råd (#276)', () => {
  for (const lås of ['bun.lock', 'mcp/bun.lock']) {
    test(`${lås} låser hono ${HONO_GULV} eller nyere`, () => {
      expect(sammenlign(låstHono(lås), HONO_GULV)).toBeGreaterThanOrEqual(0);
    });
  }
});
