import { afterAll, describe, expect, test } from 'bun:test';
import { getVerses } from '../../src/lib/bible.ts';
import { bookName, getBookInfoById } from '../../src/lib/books-data.ts';
import { closeSql, getSql } from '../../src/lib/db.ts';
import { createHandler } from '../src/server.ts';
import { mcpPost } from './calls.ts';

// The direct lookups (#169), held to the data they look up — EVERY row, not a
// few favourites: every lectionary date, every period, every prophecy from its
// own passages, every story by its id and by its title, every number, every
// gospel parallel from each of its Gospels. The rows are read from the local
// database, so a new import moves the test with it.

const handler = createHandler({ maxConcurrent: 4, maxConcurrentCli: 4, queueWaitMs: 5000, dbBudgetMs: 10_000 });
const SWEEP = 120_000;
let id = 0;

async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const res = await mcpPost(handler, { jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  return { text: body.result.content.map((c) => c.text).join('\n'), isError: Boolean(body.result.isError) };
}

/** A reference the tools read, for a row's address. */
function ref(bookId: number, chapter: number, from: number, to: number): string {
  return `${bookName(getBookInfoById(bookId)!, 'en')} ${chapter}:${from}-${to}`;
}

const rows = <T>(q: Promise<unknown>) => q as Promise<T[]>;

afterAll(() => closeSql());

describe('get_church_year_readings', () => {
  test(
    'every date in the lectionary gives that date and every day on it; the day before gives it too',
    async () => {
      const texts = await rows<{ date: string; name: string }>(getSql()`SELECT date, name FROM reading_texts WHERE language = 'nb' ORDER BY date`);
      expect(texts.length).toBeGreaterThan(100);
      const dates = [...new Set(texts.map((t) => t.date))];
      for (const date of dates) {
        const { text, isError } = await call('get_church_year_readings', { date, language: 'nb' });
        expect(isError).toBe(false);
        expect(text).toContain(`— ${date}`);
        for (const t of texts.filter((x) => x.date === date)) expect(text).toContain(`# ${t.name} — ${date}`);
        expect(text).toContain(`/nb/lesetekster/${date}`);
      }
      for (const [i, date] of dates.entries()) {
        const before = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
        if (i > 0 && dates[i - 1]! >= before) continue;
        const { text } = await call('get_church_year_readings', { date: before });
        expect(text).toContain(`— ${date}`);
      }
    },
    SWEEP,
  );

  test(
    "every day in `days` the lectionary has is found by its English name, and leads to that day",
    async () => {
      // The contract: a `days` entry whose Norwegian name is one of the parts of
      // a lectionary day's name ("Påskenatt" in "Påskenatt/Ottesang").
      const part = (s: string) => s.split('/').map((p) => p.toLowerCase().replace(/\s+/g, ' ').trim());
      const days = await rows<{ id: string; en: string; nb: string }>(getSql()`
        SELECT e.id, e.name AS en, n.name AS nb FROM days e JOIN days n ON n.id = e.id AND n.language = 'nb' WHERE e.language = 'en'`);
      const texts = await rows<{ date: string; name: string }>(getSql()`SELECT date, name FROM reading_texts WHERE language = 'nb' ORDER BY date`);
      const start = texts[0]!.date;
      let found = 0;
      for (const d of days) {
        const own = texts.filter((t) => part(t.name).some((p) => part(d.nb).includes(p)));
        const { text, isError } = await call('get_church_year_readings', { name: d.en, date: start });
        if (own.length === 0) continue;
        found++;
        expect(isError).toBe(false);
        expect(text).toContain(`— ${own[0]!.date}`);
        expect(text).toContain(`/dager/${d.id}`);
      }
      expect(found).toBeGreaterThan(30);
    },
    SWEEP,
  );

  test('a language without the lectionary gets the Norwegian one, and is told so', async () => {
    const { text } = await call('get_church_year_readings', { date: '2026-03-25', language: 'en' });
    expect(text).toContain('Palmesøndag — 2026-03-29');
    expect(text).toContain('Palm Sunday');
    expect(text).toContain('only on bible.flogvit.com in Norwegian');
  });

  test('include_text quotes the readings, with their source', async () => {
    const { text } = await call('get_church_year_readings', { date: '2026-03-29', include_text: true, edition: 'osen' });
    const john = (await getVerses(43, 12, 'osen')).find((v) => v.verse === 12)!;
    expect(text).toContain(john.text);
    expect(text).toContain('Source: ');
  });

  test('a name the lectionary does not have is an error that names the days it has', async () => {
    const { text, isError } = await call('get_church_year_readings', { name: 'Hanukkah' });
    expect(isError).toBe(true);
    expect(text).toContain('Palmesøndag');
  });
});

describe('get_timeline', () => {
  test(
    'every period lists exactly its events, in both timelines',
    async () => {
      for (const type of ['bible', 'world'] as const) {
        const periods = await rows<{ id: string; n: number }>(getSql()`
          SELECT period_id AS id, COUNT(*) AS n FROM timeline_events WHERE timeline_type = ${type} AND language = 'en' GROUP BY period_id`);
        expect(periods.length).toBeGreaterThan(5);
        const overview = await call('get_timeline', { timeline: type });
        for (const p of periods) {
          expect(overview.text).toContain(`[period: ${p.id}]`);
          const { text } = await call('get_timeline', { period: p.id, timeline: type });
          expect(text).toContain(`${Number(p.n)} event`);
        }
      }
    },
    SWEEP,
  );

  test('a span of years and a name give the events the data has for them', async () => {
    const [{ n }] = (await rows<{ n: number }>(getSql()`
      SELECT COUNT(*) AS n FROM timeline_events WHERE timeline_type = 'bible' AND language = 'en'
        AND year BETWEEN -1100 AND -950 AND (LOWER(title) LIKE '%david%' OR LOWER(description) LIKE '%david%')`)) as [{ n: number }];
    expect(Number(n)).toBeGreaterThan(5);
    const { text } = await call('get_timeline', { from_year: -1100, to_year: -950, query: 'David' });
    expect(text).toContain(`${Number(n)} events`);
    expect(text).toContain("David's Death");
    expect(text).not.toContain('Solomon Builds');
  });

  test('an unknown period is an error that lists the periods', async () => {
    const { text, isError } = await call('get_timeline', { period: 'no such period' });
    expect(isError).toBe(true);
    expect(text).toContain('[exile]');
  });
});

describe('get_prophecies', () => {
  test(
    'every prophecy is found from its own passage and from each passage that fulfils it',
    async () => {
      const prophecies = await rows<{ id: string; b: number; c: number; vs: number; ve: number }>(getSql()`
        SELECT id, prophecy_book_id AS b, prophecy_chapter AS c, prophecy_verse_start AS vs, prophecy_verse_end AS ve
        FROM prophecies WHERE language = 'en'`);
      const fulfilments = await rows<{ id: string; b: number; c: number; vs: number; ve: number }>(getSql()`
        SELECT f.prophecy_id AS id, f.book_id AS b, f.chapter AS c, f.verse_start AS vs, f.verse_end AS ve
        FROM prophecy_fulfillments f JOIN prophecies p ON p.id = f.prophecy_id AND p.language = f.language
        WHERE f.language = 'en'`);
      expect(prophecies.length).toBeGreaterThan(20);
      for (const p of [...prophecies, ...fulfilments]) {
        const { text, isError } = await call('get_prophecies', { reference: ref(p.b, p.c, p.vs, p.ve) });
        expect(isError).toBe(false);
        expect(text).toContain(`[id: ${p.id}]`);
      }
    },
    SWEEP,
  );

  test('every category gives exactly its prophecies, and no arguments gives all of them', async () => {
    const counts = await rows<{ id: string; n: number }>(getSql()`
      SELECT category_id AS id, COUNT(*) AS n FROM prophecies WHERE language = 'en' GROUP BY category_id`);
    for (const c of counts) {
      const { text } = await call('get_prophecies', { category: c.id });
      expect(text).toContain(`# ${Number(c.n)} prophec`);
    }
    const total = counts.reduce((s, c) => s + Number(c.n), 0);
    expect((await call('get_prophecies', {})).text).toContain(`# ${total} prophecies`);
  });

  test('include_text quotes the prophecy and its fulfilment', async () => {
    const { text } = await call('get_prophecies', { reference: 'Isa 7:14', include_text: true, edition: 'osen' });
    const isaiah = (await getVerses(23, 7, 'osen')).find((v) => v.verse === 14)!;
    const matthew = (await getVerses(40, 1, 'osen')).find((v) => v.verse === 23)!;
    expect(text).toContain(isaiah.text);
    expect(text).toContain(matthew.text);
  });
});

describe('get_story', () => {
  test(
    'every story is found by its id, and by its title when no other story has that title',
    async () => {
      const stories = await rows<{ slug: string; title: string }>(getSql()`SELECT slug, title FROM stories WHERE language = 'en'`);
      expect(stories.length).toBeGreaterThan(1000);
      const titles = new Map<string, number>();
      for (const s of stories) titles.set(s.title.toLowerCase(), (titles.get(s.title.toLowerCase()) ?? 0) + 1);
      for (const s of stories) {
        const byId = await call('get_story', { name: s.slug, include_text: false });
        expect(byId.text).toContain(`# ${s.title}\n`);
        expect(byId.text).toContain(`/en/historier/${s.slug}`);
        if (titles.get(s.title.toLowerCase())! > 1) continue;
        const byTitle = await call('get_story', { name: s.title, include_text: false });
        expect(byTitle.text).toContain(`/en/historier/${s.slug}\n`);
      }
    },
    SWEEP,
  );

  test('the text comes with it, in the reader\'s language', async () => {
    const { text } = await call('get_story', { name: 'den-fortapte-sonn', language: 'nb' });
    const verse = (await getVerses(42, 15, 'osnb')).find((v) => v.verse === 11)!;
    expect(text).toContain('# Den fortapte sønn');
    expect(text).toContain('Lukas 15:11-32');
    expect(text).toContain(verse.text);
    expect(text).toContain('Source: ');
  });
});

describe('get_number', () => {
  test(
    'every number gives its meaning and every passage it is found in',
    async () => {
      const numbers = await rows<{ number: number; content: string }>(getSql()`SELECT number, content FROM number_symbolism WHERE language = 'en'`);
      expect(numbers.length).toBeGreaterThan(100);
      for (const row of numbers) {
        const data = JSON.parse(row.content) as { meaning: string; references: unknown[] };
        const { text, isError } = await call('get_number', { number: row.number });
        expect(isError).toBe(false);
        expect(text).toContain(`# ${row.number} — ${data.meaning}`);
        if (data.references.length) expect(text).toContain(`(${data.references.length} passage`);
      }
      const list = (await call('get_number', {})).text;
      for (const row of numbers) expect(list).toContain(`- **${row.number}**:`);
    },
    SWEEP,
  );

  test('a number without an entry is an error that names the nearest that have one', async () => {
    const [{ n }] = (await rows<{ n: number }>(getSql()`SELECT MAX(number) + 1 AS n FROM number_symbolism`)) as [{ n: number }];
    const { text, isError } = await call('get_number', { number: Number(n) });
    expect(isError).toBe(true);
    expect(text).toContain(String(Number(n) - 1));
  });
});

describe('get_gospel_parallels', () => {
  test(
    'every parallel is found from each of its Gospels, and no reference lists them all',
    async () => {
      const passages = await rows<{ id: string; b: number; c: number; vs: number; ve: number }>(getSql()`
        SELECT parallel_id AS id, book_id AS b, chapter AS c, verse_start AS vs, verse_end AS ve FROM gospel_parallel_passages WHERE language = 'en'`);
      expect(passages.length).toBeGreaterThan(100);
      for (const p of passages) {
        const { text, isError } = await call('get_gospel_parallels', { reference: ref(p.b, p.c, p.vs, p.ve) });
        expect(isError).toBe(false);
        expect(text).toContain(`[id: ${p.id}]`);
      }
      const list = (await call('get_gospel_parallels', {})).text;
      for (const id of new Set(passages.map((p) => p.id))) expect(list).toContain(`[id: ${id}]`);
    },
    SWEEP,
  );

  test('include_text quotes every Gospel in turn', async () => {
    const { text } = await call('get_gospel_parallels', { reference: 'Mark 4:35-41', include_text: true, edition: 'osen' });
    for (const [book, chapter, verse] of [
      [40, 8, 23],
      [41, 4, 35],
      [42, 8, 22],
    ] as const) {
      const v = (await getVerses(book, chapter, 'osen')).find((x) => x.verse === verse)!;
      expect(text).toContain(v.text);
    }
  });
});
