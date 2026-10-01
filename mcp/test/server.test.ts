import { afterAll, describe, expect, test } from 'bun:test';
import { closeSql } from '../../src/lib/db.ts';
import { LOCALES } from '../../src/lib/i18n.ts';
import { createHandler, SERVER_NAME } from '../src/server.ts';
import { MAX_VERSES } from '../src/tools.ts';

// Runs against the local database (`../.env`, DB_PORT=3326), like bibel's own
// DB tests: the point is that the real getters answer, not that a stub does.

const handler = createHandler({ maxConcurrent: 4, queueWaitMs: 1000, dbBudgetMs: 5000 });
let id = 0;

function post(body: unknown, h = handler): Promise<Response> {
  return h(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    }),
  );
}

async function rpc(method: string, params?: unknown) {
  const res = await post({ jsonrpc: '2.0', id: ++id, method, params });
  expect(res.status).toBe(200);
  return (await res.json()) as { result?: any; error?: any };
}

async function call(name: string, args: Record<string, unknown>) {
  const { result, error } = await rpc('tools/call', { name, arguments: args });
  expect(error).toBeUndefined();
  return { text: result.content[0].text as string, isError: Boolean(result.isError) };
}

afterAll(() => closeSql());

test('initialize names the server and tells the model how to cite', async () => {
  const { result } = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  expect(result.serverInfo.name).toBe(SERVER_NAME);
  expect(result.instructions).toContain('CC BY');
});

test('every tool is declared read-only', async () => {
  const { result } = await rpc('tools/list');
  expect(result.tools.length).toBeGreaterThanOrEqual(13);
  for (const t of result.tools) expect(t.annotations?.readOnlyHint).toBe(true);
});

// One ordinary call per tool. The invariants below run over ALL of them, so a
// new tool is held to them the moment it is added here.
const CALLS: [string, Record<string, unknown>][] = [
  ['list_editions', {}],
  ['get_passage', { reference: 'John 3:16-18', editions: ['osen', 'osnb', 'sblgnt'], include_notes: true }],
  ['get_passage', { reference: 'Ps 23', language: 'nb' }],
  ['search_bible', { query: 'forgiv sins', testament: 'NT' }],
  ['search_bible', { query: '"elske hverandre"', edition: 'osnb', book: 'Joh', language: 'nb' }],
  ['get_original_text', { reference: 'John 1:1-2' }],
  ['get_original_text', { reference: 'Gen 1:1', word_by_word: false }],
  ['search_original_word', { word: 'ἀγάπη', limit: 5 }],
  ['get_cross_references', { reference: 'John 3:16' }],
  ['get_chapter_study', { reference: 'Matt 1' }],
  ['get_book_overview', { book: 'Romerbrevet', language: 'nb' }],
  ['search_people', { query: 'tamar' }],
  ['get_person', { id: 'tamar-juda' }],
  ['search_topics', { query: 'prodigal' }],
  ['get_topic', { kind: 'story', id: 'den-fortapte-sonn' }],
  ['get_topic', { kind: 'theme', id: 'david' }],
  ['get_daily_verse', { language: 'nn' }],
];

/** The licence statements require these links to follow the text. */
const LICENCE_SOURCES = ['https://sblgnt.com', 'https://www.tanach.us'];

describe.each(CALLS)('%s %j', (name, args) => {
  test('answers without error', async () => {
    const r = await call(name, args);
    expect(r.isError).toBe(false);
    expect(r.text.length).toBeGreaterThan(20);
  });

  test('every link points to a localised page on bible.flogvit.com, or a source the licence names', async () => {
    const { text } = await call(name, args);
    for (const url of text.match(/https?:\/\/[^\s,)]+/g) ?? []) {
      if (LICENCE_SOURCES.some((s) => url.startsWith(s))) continue;
      expect(url).toMatch(new RegExp(`^https://bible\\.flogvit\\.com/(${LOCALES.join('|')})/`));
    }
  });

  test("the site's link markup never reaches the model", async () => {
    const { text } = await call(name, args);
    expect(text).not.toMatch(/\[(ref|vers|person|tema|profeti|parallell|historie|manuskript|andakt):/);
  });
});

test('quoted text carries its licence, one source line per edition', async () => {
  const { text } = await call('get_passage', { reference: 'John 3:16', editions: ['osen', 'osnn', 'sblgnt'] });
  const source = text.slice(text.lastIndexOf('Source:'));
  for (const e of ['OSEN', 'OSNN', 'SBLGNT']) expect(source).toContain(e);
  expect(source).toContain('CC-BY-4.0');
});

test('the language picks the edition when none is named', async () => {
  expect((await call('get_passage', { reference: 'John 3:16', language: 'nb' })).text).toContain('**osnb**');
  expect((await call('get_passage', { reference: 'John 3:16', language: 'de' })).text).toContain('**osen**');
});

test(`a passage stops at ${MAX_VERSES} verses and says so`, async () => {
  const { text } = await call('get_passage', { reference: 'Ps 119; Ps 118', editions: ['osen'] });
  expect(text).toContain(`Stopped at ${MAX_VERSES} verses`);
  expect(text.match(/^\d+ /gm)?.length).toBe(MAX_VERSES);
});

test('an unreadable reference is an error the model can act on', async () => {
  const r = await call('get_passage', { reference: 'Foo 3:16' });
  expect(r.isError).toBe(true);
  expect(r.text).toContain('unknown book');
});

test('search pages with offset', async () => {
  const first = await call('search_bible', { query: 'love', limit: 2 });
  expect(first.text).toContain('call again with offset 2');
  const second = await call('search_bible', { query: 'love', limit: 2, offset: 2 });
  expect(second.text).toContain('showing 3-4');
});

test('search terms are literal, not LIKE patterns', async () => {
  const { text } = await call('search_bible', { query: '%%' });
  expect(text).toContain('No verses');
});

describe('HTTP', () => {
  test('GET is not a stream here', async () => {
    const res = await handler(new Request('http://localhost/mcp'));
    expect(res.status).toBe(405);
  });

  test('other paths are 404', async () => {
    const res = await handler(new Request('http://localhost/other', { method: 'POST' }));
    expect(res.status).toBe(404);
  });

  test('a full server answers 503 with Retry-After instead of queueing forever', async () => {
    const full = createHandler({ maxConcurrent: 0, queueWaitMs: 0, dbBudgetMs: 1000 });
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, full);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  test('a slot frees up when a request finishes', async () => {
    const one = createHandler({ maxConcurrent: 1, queueWaitMs: 5000, dbBudgetMs: 5000 });
    const results = await Promise.all(
      [1, 2, 3].map((n) => post({ jsonrpc: '2.0', id: n, method: 'tools/list' }, one).then((r) => r.status)),
    );
    expect(results).toEqual([200, 200, 200]);
  });
});
