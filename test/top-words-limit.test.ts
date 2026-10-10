// `?limit=` på ordlistene klemmes til 1–500 (#131). Et negativt tall slapp
// gjennom `Math.min(…, 500)`, og `.slice(0, -3)` kutter bakfra i stedet for å
// begrense: nesten hele ordlista, ~200 ganger standardsvaret, for hvem som helst.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const RUTER = ['/api/statistics/top-words', '/api/statistics/top-words/hebrew', '/api/statistics/top-words/greek'];

async function ord(path: string): Promise<unknown[]> {
  const res = await app.request(path);
  expect(res.status).toBe(200);
  return ((await res.json()) as { words: unknown[] }).words;
}

describe('limit på ordlistene (#131)', () => {
  for (const rute of RUTER) {
    for (const limit of ['-3', '0', '99999', '-99999']) {
      test(`${rute}?limit=${limit} gir mellom 1 og 500 ord`, async () => {
        const words = await ord(`${rute}?limit=${limit}`);
        expect(words.length).toBeGreaterThanOrEqual(1);
        expect(words.length).toBeLessThanOrEqual(500);
      });
    }

    // Ellers ville «svar alltid med ett ord» bestått.
    test(`${rute}?limit=5 gir nøyaktig 5 ord`, async () => {
      expect((await ord(`${rute}?limit=5`)).length).toBe(5);
    });
  }
});
