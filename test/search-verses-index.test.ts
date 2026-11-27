// Verse search reads ONE edition, not every edition's verses (#285).
//
// `searchVerses()` orders its hits by book, chapter and verse with a LIMIT. When
// the edition had few hits, MySQL served the ORDER BY from uq_verses (book_id,
// chapter, verse, bible) and walked all 1.66 M verse rows of every edition to
// find them: 4–6 s for «gud» on every page not in Norwegian, and past Bun's
// 10 s idle timeout under load (the footer tests on /es|fi|de/sok went red).
//
// A search with NO hits is the worst case for that plan, and needs no
// particular edition in the base: it walks the whole table, every time. Measured
// locally: 5.1 s before, 0.08 s after. The bound below leaves a wide margin for
// a busy machine on both sides.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import { searchVerses } from '../src/lib/bible.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const BOUND_MS = 1500;

beforeAll(async () => {
  // Open the pool first, so the measurement is the query and not the connect.
  await getSql()`SELECT 1`;
});

describe('verse search reads one edition (#285)', () => {
  test(`a search with no hits answers in under ${BOUND_MS} ms`, async () => {
    const t = performance.now();
    const res = await searchVerses('qxzqwvk', 50, 0, 'osnb');
    const ms = performance.now() - t;
    expect(res.total).toBe(0);
    expect(ms, `searchVerses took ${Math.round(ms)} ms`).toBeLessThan(BOUND_MS);
  });

  test('hits still come in book, chapter, verse order, from the edition asked for', async () => {
    const res = await searchVerses('Gud', 50, 0, 'osnb');
    expect(res.results.length).toBeGreaterThan(1);
    const keys = res.results.map((r) => r.book_id * 1e6 + r.chapter * 1e3 + r.verse);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(res.total).toBeGreaterThanOrEqual(res.results.length);
  });
});
