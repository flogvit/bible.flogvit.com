import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from './parse-env';

// The database settings live in bibel's .env, one level up. Bun only reads the
// .env in the working directory, so a plain `cd mcp && bun test` started with
// none of them and every database test timed out against port 3306 — 24 red
// tests that said nothing about why.
const rootEnv = join(import.meta.dir, '..', '..', '.env');

test('the repo root .env reaches the tests, also under a plain `bun test`', () => {
  if (!existsSync(rootEnv)) return; // a checkout without one has nothing to load
  const wanted = parseEnv(readFileSync(rootEnv, 'utf8'));
  expect(Object.keys(wanted).length).toBeGreaterThan(0);
  for (const key of Object.keys(wanted)) expect(process.env[key]).toBeDefined();
});

test('parseEnv reads KEY=VALUE, skips comments, strips quotes', () => {
  expect(parseEnv('# note\n\nDB_PORT=3326\nA="x y"\nB=\'z\'\nC=a=b\n')).toEqual({
    DB_PORT: '3326',
    A: 'x y',
    B: 'z',
    C: 'a=b',
  });
});
