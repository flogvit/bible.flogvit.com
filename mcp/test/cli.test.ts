import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeSql } from '../../src/lib/db.ts';
import { CLI_USER_AGENT, createHandler } from '../src/server.ts';
import { MAX_CHECK_TEXT } from '../src/tools.ts';

// The command line client is its own program, so it is run as one: `node` on
// the file a user downloads, against a real listening server over HTTP. An
// in-process call would miss exactly the seams that break — argument parsing,
// the HTTP framing, exit codes, the file read in parts.

const CLI = join(import.meta.dir, '../../cli/skills/flogvit-bible/flogvit-bible.mjs');
const dir = mkdtempSync(join(tmpdir(), 'flogvit-bible-cli-'));
const userAgents: string[] = [];
let server: ReturnType<typeof Bun.serve>;
let url: string;

beforeAll(() => {
  const handler = createHandler({ maxConcurrent: 4, maxConcurrentCli: 4, queueWaitMs: 2000, dbBudgetMs: 5000 });
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      userAgents.push(req.headers.get('user-agent') ?? '');
      return handler(req);
    },
  });
  url = `http://localhost:${server.port}/mcp`;
});

afterAll(async () => {
  server.stop(true);
  await closeSql();
});

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(args: string[], opts: { env?: Record<string, string>; stdin?: string; runtime?: string; endpoint?: string } = {}): Promise<Run> {
  const proc = Bun.spawn([opts.runtime ?? 'node', CLI, ...args], {
    env: { PATH: process.env.PATH!, LANG: 'C', FLOGVIT_BIBLE_URL: opts.endpoint ?? url, ...opts.env },
    stdin: opts.stdin === undefined ? 'ignore' : new TextEncoder().encode(opts.stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

function file(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

async function toolList(): Promise<{ name: string; inputSchema: { properties?: Record<string, { type?: string }> } }[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  return ((await res.json()) as { result: { tools: [] } }).result.tools;
}

describe('the commands ARE the tools', () => {
  test('every tool is a command, with every option in its help', async () => {
    const tools = await toolList();
    expect(tools.length).toBeGreaterThanOrEqual(14);
    const usage = await run(['--help']);
    expect(usage.code).toBe(0);
    for (const tool of tools) {
      const command = tool.name.replace(/^get_/, '').replace(/_/g, '-');
      expect(usage.stdout).toContain(`  ${command} `);
      const help = await run([command, '--help']);
      expect(help.code).toBe(0);
      for (const [option, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        if (tool.name === 'check_references' && (option === 'text' || option === 'first_line')) continue;
        const flag = `--${option.replace(/_/g, '-')}`;
        expect(help.stdout).toContain(schema.type === 'boolean' ? `${flag}, --no-${option.replace(/_/g, '-')}` : `${flag} <`);
      }
    }
  });

  test('a command may be shortened while it is unambiguous', async () => {
    expect((await run(['pass', 'John 3:16'])).stdout).toContain('## John 3:16');
    const ambiguous = await run(['search', 'love']);
    expect(ambiguous.code).toBe(2);
    expect(ambiguous.stderr).toContain('search-bible');
  });
});

describe('a passage', () => {
  test('reads with its link and its source line', async () => {
    const r = await run(['passage', 'John 3:16', '--editions', 'osen,sblgnt']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('https://bible.flogvit.com/en/joh/3#v16');
    expect(r.stdout).toContain('**sblgnt**');
    expect(r.stdout).toContain('CC-BY-4.0');
  });

  test('takes the rest of the words as the last required argument', async () => {
    const r = await run(['search-bible', 'forgiv', 'sins', '--testament', 'NT', '--limit', '2']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/verses in osen, showing 1-2/);
  });

  test('--json is the server answer, parseable', async () => {
    const r = await run(['passage', 'Ps 23:1', '--json']);
    const answer = JSON.parse(r.stdout);
    expect(answer.content[0].text).toContain('Psalms 23:1');
  });

  test('the language comes from --language, FLOGVIT_BIBLE_LANG or LANG', async () => {
    expect((await run(['passage', 'Joh 3,16'], { env: { LANG: 'nb_NO.UTF-8' } })).stdout).toContain('**osnb**');
    expect((await run(['passage', 'Joh 3,16'], { env: { LANG: 'no_NO.UTF-8' } })).stdout).toContain('**osnb**');
    expect((await run(['passage', 'Joh 3,16'], { env: { FLOGVIT_BIBLE_LANG: 'nn', LANG: 'nb_NO' } })).stdout).toContain('**osnn**');
    expect((await run(['passage', 'Joh 3,16', '--language', 'en'], { env: { LANG: 'nb_NO' } })).stdout).toContain('**osen**');
    expect((await run(['passage', 'Joh 3,16'], { env: { LANG: 'C' } })).stdout).toContain('**osen**');
  });

  test('runs with bun as well as node', async () => {
    expect((await run(['passage', 'John 3:16'], { runtime: 'bun' })).stdout).toContain('## John 3:16');
  });
});

describe('exit codes: 0 answered, 1 the answer is a problem, 2 the command could not run', () => {
  test('a reference the server cannot read is 1, on stderr', async () => {
    const r = await run(['passage', 'Foo 3:16']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('unknown book');
  });

  test('an unknown command, option or missing argument is 2', async () => {
    expect((await run(['nonsense'])).code).toBe(2);
    const option = await run(['passage', 'John 3:16', '--colour', 'red']);
    expect(option.code).toBe(2);
    expect(option.stderr).toContain('--editions');
    const missing = await run(['passage']);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('<reference>');
    expect((await run(['search-bible', 'love', '--limit', 'many'])).code).toBe(2);
  });

  test('a server that cannot be reached says where it tried', async () => {
    const r = await run(['passage', 'John 3:16'], { endpoint: 'http://localhost:1/mcp' });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Could not reach http://localhost:1/mcp');
  });

  test('a busy server says so, and when to try again', async () => {
    const busy = Bun.serve({ port: 0, fetch: createHandler({ maxConcurrent: 0, maxConcurrentCli: 0, queueWaitMs: 0, dbBudgetMs: 1000 }) });
    try {
      const r = await run(['passage', 'John 3:16'], { endpoint: `http://localhost:${busy.port}/mcp` });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('busy');
      expect(r.stderr).toContain('10 seconds');
    } finally {
      busy.stop(true);
    }
  });
});

describe('check', () => {
  const manuscript = file(
    'manuscript.md',
    ['Som det står i Joh 3,16: «For så høyt har Gud elsket verden».', 'Sal 23,9 finnes ikke.', '', 'Se også Rom 8:28; 9:1.'].join('\n'),
  );

  test('finds each reference where it stands, and the one that points at nothing', async () => {
    const r = await run(['check', manuscript, '--language', 'nb']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('line 1, column 16: Joh 3,16 → Johannes 3:16');
    expect(r.stdout).toContain('For så høyt har Gud elsket verden');
    expect(r.stdout).toContain('line 2, column 1: Sal 23,9 — PROBLEM: Salmene 23 has 6 verses, not 9.');
    expect(r.stdout).toContain('line 4, column 9: Rom 8:28; 9:1');
    expect(r.stdout).toContain('3 Bible references, 1 with problems.');
  });

  test('a text without problems is 0', async () => {
    const r = await run(['check', file('fine.md', 'Les Joh 3,16 og Ps 23.')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('2 Bible references, 0 with problems.');
  });

  test('reads standard input', async () => {
    const r = await run(['check', '-'], { stdin: 'Les Joh 3,16.' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('line 1, column 5: Joh 3,16');
  });

  test('a file longer than one call is sent in parts, and keeps its line numbers', async () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `Linje ${i + 1} er fyllord og ikke noe mer enn det.`);
    lines[9] = 'Her står Joh 3,16.';
    lines[1989] = 'Og her står Sal 200.';
    const text = lines.join('\n');
    expect(text.length).toBeGreaterThan(2 * MAX_CHECK_TEXT);

    const r = await run(['check', file('long.md', text), '--no-include-text']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('line 10, column 10: Joh 3,16');
    expect(r.stdout).toContain('line 1990, column 13: Sal 200 — PROBLEM');
    // One count for the whole file, not one per part.
    expect(r.stdout.match(/Bible references/g)).toHaveLength(1);
    expect(r.stdout).toContain('2 Bible references, 1 with problems.');

    const json = JSON.parse((await run(['check', join(dir, 'long.md'), '--json'])).stdout);
    expect(json.references.map((x: { line: number }) => x.line)).toEqual([10, 1990]);
    expect(json.problems).toBe(1);
  });

  test('a line longer than one call says that its end was not checked', async () => {
    const r = await run(['check', file('one-line.md', `Joh 3,16 ${'ord '.repeat(MAX_CHECK_TEXT / 2)} Sal 23,1`)]);
    expect(r.stdout).toContain('Joh 3,16');
    expect(r.stderr).toContain(`Line 1 is longer than ${MAX_CHECK_TEXT - 1} characters`);
  });
});

test('the server recognises the User-Agent the CLI sends', async () => {
  userAgents.length = 0;
  await run(['passage', 'John 3:16']);
  expect(userAgents.length).toBeGreaterThan(0);
  for (const ua of userAgents) expect(ua).toMatch(CLI_USER_AGENT);
});
