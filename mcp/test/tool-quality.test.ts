import { afterAll, describe, expect, test } from 'bun:test';
import { closeSql } from '../../src/lib/db.ts';
import { createHandler } from '../src/server.ts';
import { mcpPost } from './calls.ts';

// What a client — and a directory like mcptry.com, which scores it — reads
// before it calls anything: the tool list. A model picks a tool and fills in
// its arguments from these descriptions alone, so an argument without one is
// an argument it has to guess (#168).
//
// Read from the server's real `tools/list`, not from tools.ts, so a tool or an
// argument added anywhere is held to it the moment it exists.

type Schema = {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
};
type Tool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Schema;
  outputSchema?: Schema;
  annotations?: Record<string, unknown>;
};

const handler = createHandler({ maxConcurrent: 1, maxConcurrentCli: 1, queueWaitMs: 1000, dbBudgetMs: 2000 });
const res = await mcpPost(handler, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
const { result } = (await res.json()) as { result: { tools: Tool[] } };
const tools = result.tools;

afterAll(() => closeSql());

const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const;

/** Every argument and output field with its schema, named as a reader would. */
function fields(schema: Schema | undefined): [string, Schema, boolean][] {
  const required = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).map(([k, v]) => [k, v, required.has(k)]);
}

test('the server lists tools', () => {
  expect(tools.length).toBeGreaterThanOrEqual(14);
});

describe.each(tools.map((t) => [t.name, t] as const))('%s', (_, tool) => {
  test('has a title and a description that says what it answers', () => {
    expect(tool.title?.trim().length ?? 0).toBeGreaterThan(5);
    expect(tool.description?.trim().length ?? 0).toBeGreaterThanOrEqual(40);
  });

  test('declares every annotation hint, and is read-only', () => {
    for (const hint of HINTS) expect(typeof tool.annotations?.[hint]).toBe('boolean');
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.destructiveHint).toBe(false);
  });

  const args = fields(tool.inputSchema);
  const out = fields(tool.outputSchema);
  if (args.length + out.length === 0) return;

  test.each([...args, ...out])('%s is described', (_, schema) => {
    expect(schema.description?.trim().length ?? 0).toBeGreaterThanOrEqual(15);
  });

  if (args.length === 0) return;

  // The model can leave these out, so it has to know what it gets then.
  test.each(args.filter(([, s, required]) => !required))('%s says its default', (_, schema) => {
    expect(schema.description).toContain('Default');
  });

  // A value the model cannot see in the description is one it will not try.
  test.each(args.filter(([, s]) => (s.enum ?? s.items?.enum)?.length))('%s names every allowed value', (_, schema) => {
    for (const value of (schema.enum ?? schema.items!.enum)!) {
      expect(schema.description).toMatch(new RegExp(`\\b${String(value)}\\b`));
    }
  });
});

// The guard must see what it guards: an argument the SDK dropped from the
// schema, or a list whose properties were not read, would pass every test above.
test('the sweep reads real arguments', () => {
  const all = tools.flatMap((t) => fields(t.inputSchema));
  expect(all.length).toBeGreaterThan(30);
  expect(all.some(([, s]) => s.default !== undefined)).toBe(true);
  expect(all.some(([, s]) => s.items?.enum)).toBe(true);
});
