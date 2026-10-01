import { afterAll, describe, expect, test } from 'bun:test';
import { closeSql } from '../../src/lib/db.ts';
import { LOCALES } from '../../src/lib/i18n.ts';
import { createHandler, SERVER_NAME } from '../src/server.ts';
import { MAX_VERSES } from '../src/tools.ts';
import { CALLS, mcpPost } from './calls.ts';

// Runs against the local database (`../.env`, DB_PORT=3326), like bibel's own
// DB tests: the point is that the real getters answer, not that a stub does.

const handler = createHandler({ maxConcurrent: 4, maxConcurrentCli: 4, queueWaitMs: 1000, dbBudgetMs: 5000 });
let id = 0;

function post(body: unknown, h = handler): Promise<Response> {
  return mcpPost(h, body);
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

// The invariants below run over ALL of `CALLS`, so a new tool is held to them
// the moment it is added there.

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

test('check_references counts in its structured answer what its text says', async () => {
  const { result } = await rpc('tools/call', {
    name: 'check_references',
    arguments: { text: 'Joh 3,16 og Sal 23,9.', first_line: 7 },
  });
  expect(result.structuredContent.checked).toBe(2);
  expect(result.structuredContent.problems).toBe(1);
  expect(result.structuredContent.references.map((r: { line: number }) => r.line)).toEqual([7, 7]);
  expect(result.content.at(-1).text).toBe('2 Bible references, 1 with problems.');
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
    const full = createHandler({ maxConcurrent: 0, maxConcurrentCli: 0, queueWaitMs: 0, dbBudgetMs: 1000 });
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, full);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  // A slow call holds its slot long enough for the others to arrive while it does.
  const slow = (n: number, ua?: string) =>
    new Request('http://localhost/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...(ua ? { 'user-agent': ua } : {}),
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/call', params: { name: 'get_passage', arguments: { reference: 'Ps 119', editions: ['osen', 'osnb', 'tanach'] } } }),
        });

  test('the command line client holds at most its own share of the slots', async () => {
    const capped = createHandler({ maxConcurrent: 2, maxConcurrentCli: 1, queueWaitMs: 0, dbBudgetMs: 5000 });
    const cli = 'flogvit-bible-cli/1.0.0';
    const statuses = await Promise.all([slow(1, cli), slow(2, cli), slow(3)].map((r) => capped(r).then((x) => x.status)));
    // The second CLI request finds the CLI's one slot taken; the assistant's request still gets the other.
    expect(statuses).toEqual([200, 503, 200]);
  });

  test('without the User-Agent, the same requests share the global cap as before', async () => {
    const capped = createHandler({ maxConcurrent: 2, maxConcurrentCli: 1, queueWaitMs: 0, dbBudgetMs: 5000 });
    const statuses = await Promise.all([slow(1), slow(2)].map((r) => capped(r).then((x) => x.status)));
    expect(statuses).toEqual([200, 200]);
  });

  test('a slot frees up when a request finishes', async () => {
    const one = createHandler({ maxConcurrent: 1, maxConcurrentCli: 1, queueWaitMs: 5000, dbBudgetMs: 5000 });
    const results = await Promise.all(
      [1, 2, 3].map((n) => post({ jsonrpc: '2.0', id: n, method: 'tools/list' }, one).then((r) => r.status)),
    );
    expect(results).toEqual([200, 200, 200]);
  });
});
