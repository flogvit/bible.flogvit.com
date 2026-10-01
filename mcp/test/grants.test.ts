import { afterAll, beforeAll, expect, test } from 'bun:test';
import { SQL } from 'bun';
import { closeSql, DB_NAME, getSql } from '../../src/lib/db.ts';
import { grantStatements } from '../src/grants.ts';
import { createHandler } from '../src/server.ts';

// The grants are the security boundary, so they are tested the only way that
// proves anything: every tool runs as a LOCAL user that has exactly
// `grantStatements()` — and that user is refused the user tables. A table a
// tool needs but the list lacks fails here, not in prod.

const USER = 'bibel-mcp-test';
const PASSWORD = `t${crypto.randomUUID()}`;
const saved = { user: process.env.DB_USER, password: process.env.DB_PASSWORD, tls: process.env.DB_TLS };

function admin(): SQL {
  return new SQL({
    adapter: 'mysql',
    hostname: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
      username: saved.user || 'root',
    password: saved.password || '',
  });
}

beforeAll(async () => {
  const sql = admin();
  // 'localhost' and not '%': a local MySQL matches a TCP connection from
  // 127.0.0.1 as localhost, and an anonymous ''@'localhost' would win over '%'.
  await sql.unsafe(`DROP USER IF EXISTS '${USER}'@'localhost'`);
  await sql.unsafe(`CREATE USER '${USER}'@'localhost' IDENTIFIED BY '${PASSWORD}'`);
  for (const g of grantStatements(USER, DB_NAME, 'localhost')) await sql.unsafe(g);
  await sql.end();

  await closeSql();
  process.env.DB_USER = USER;
  process.env.DB_PASSWORD = PASSWORD;
  // A user created through Bun is refused in plain text locally (see db.ts).
  process.env.DB_TLS = '1';
});

afterAll(async () => {
  await closeSql();
  for (const [key, value] of [['DB_USER', saved.user], ['DB_PASSWORD', saved.password], ['DB_TLS', saved.tls]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const sql = admin();
  await sql.unsafe(`DROP USER IF EXISTS '${USER}'@'localhost'`);
  await sql.end();
});

const CALLS: [string, Record<string, unknown>][] = [
  ['list_editions', {}],
  ['get_passage', { reference: 'John 3:16-18', editions: ['osen', 'osnb', 'sblgnt'], include_notes: true }],
  ['search_bible', { query: 'love', testament: 'NT' }],
  ['get_original_text', { reference: 'John 1:1' }],
  ['search_original_word', { word: 'λόγος', limit: 3 }],
  ['get_cross_references', { reference: 'John 3:16' }],
  ['get_chapter_study', { reference: 'Matt 1' }],
  ['get_book_overview', { book: 'Romans' }],
  ['search_people', { query: 'ruth' }],
  ['get_person', { id: 'tamar-juda' }],
  ['search_topics', { query: 'prodigal' }],
  ['get_topic', { kind: 'story', id: 'den-fortapte-sonn' }],
  ['get_topic', { kind: 'theme', id: 'david' }],
  ['get_daily_verse', {}],
];

test.each(CALLS)('%s runs with only the granted tables', async (name, args) => {
  const handler = createHandler({ maxConcurrent: 2, queueWaitMs: 1000, dbBudgetMs: 2000 });
  const res = await handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }),
  );
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  expect(body.result.content[0]!.text).not.toMatch(/denied|command denied/i);
  expect(body.result.isError ?? false).toBe(false);
});

test.each(['sync_items', 'devotional_shares', 'contrib_submissions', 'user_bibles'])('%s is out of reach', async (table) => {
  // try/catch and not `expect(...).rejects`: a Bun SQL query is a lazy
  // thenable, and `rejects` spins on it at full CPU without ever settling.
  let error = '';
  try {
    await getSql().unsafe(`SELECT 1 FROM \`${table}\` LIMIT 1`);
  } catch (e) {
    error = (e as Error).message;
  }
  expect(error).toMatch(/denied/i);
});

test('/healthz answers 200 with the verse when every content table is granted', async () => {
  const res = await createHandler({ maxConcurrent: 1, queueWaitMs: 1000, dbBudgetMs: 2000 })(new Request('http://localhost/healthz'));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('For God so loved');
});

test('/healthz names a content table the user cannot read', async () => {
  const sql = admin();
  await sql.unsafe(`REVOKE SELECT ON \`${DB_NAME}\`.\`persons\` FROM '${USER}'@'localhost'`);
  await sql.end();
  try {
    const res = await createHandler({ maxConcurrent: 1, queueWaitMs: 1000, dbBudgetMs: 2000 })(new Request('http://localhost/healthz'));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('persons');
  } finally {
    const again = admin();
    await again.unsafe(`GRANT SELECT ON \`${DB_NAME}\`.\`persons\` TO '${USER}'@'localhost'`);
    await again.end();
  }
});
