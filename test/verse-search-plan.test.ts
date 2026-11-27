// Søket i en utgave leser utgaven, ikke hele verses-tabellen (#282).
//
// Prod 2026-11-27: `/es/sok?q=gud` brukte 4 s. MySQL valgte `uq_verses`
// (book_id, chapter, verse, bible) for å slippe sorteringen og gikk gjennom alle
// 1,66 mill. rader til LIMIT var fylt — for en utgave med ett treff, hele
// tabellen. Under last passerte siden Bun.serve sin idleTimeout, og #70-vakta i
// mobile-layout fikk ECONNRESET, så deployen av #274 stoppet.
//
// Vakta måler PLANEN, ikke tiden: en tidsgrense ville vært flakete på en travel
// maskin, og planen er det som avgjør om tiden vokser med tabellen.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import { VERSE_SEARCH_SQL, searchVerses } from '../src/lib/bible.ts';
import { IMPORTED_BIBLES } from '../src/lib/editions.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** En importert utgave som finnes i basen — det er der planen snudde. */
async function enUtgave(): Promise<string> {
  const sql = getSql();
  const rows = (await sql`SELECT DISTINCT bible FROM verses`) as { bible: string }[];
  const har = new Set(rows.map((r) => r.bible));
  return IMPORTED_BIBLES.find((id) => id !== 'osnb' && har.has(id)) ?? 'osnb';
}

describe('verssøket (#282)', () => {
  test('planen leser utgaven gjennom idx_verses_bible, ikke hele tabellen i sorteringsrekkefølge', async () => {
    const bible = await enUtgave();
    const [rad] = (await getSql().unsafe(`EXPLAIN FORMAT=TREE ${VERSE_SEARCH_SQL}`, ['%gud%', bible, 20, 0])) as unknown as Record<string, string>[];
    const plan = Object.values(rad!)[0]!;
    expect(plan, plan).toContain('idx_verses_bible');
    expect(plan, plan).not.toContain('Index scan on v using uq_verses');
  });

  test('treffene er de samme som før: utgavens vers, i bibelrekkefølge, og totalen stemmer', async () => {
    const bible = await enUtgave();
    const res = await searchVerses('Gud', 30, 0, bible);
    const [rad] = (await getSql()`SELECT COUNT(*) AS total FROM verses WHERE text LIKE ${'%Gud%'} AND bible = ${bible}`) as { total: number | bigint }[];
    const total = rad!.total;
    expect(res.total).toBe(Number(total));
    expect(res.results.length).toBe(Math.min(30, Number(total)));
    const nøkler = res.results.map((r) => r.book_id * 1e6 + r.chapter * 1e3 + r.verse);
    expect(nøkler).toEqual([...nøkler].sort((a, b) => a - b));
  });
});
