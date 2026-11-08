// The import must not run against a kvn other than the one in $FREE_BIBLE_DIR
// (#227). On 2026-11-08 the deployer's test import read a copy staged before
// free-bible#139 and refused every edition verified since.

import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureFreshKvn, installedFingerprint, kvnFreshness, RERUN_FLAG, type FreshSteps } from '../scripts/kvn-fresh.ts';

const steps = (codes: Partial<Record<'stage' | 'install' | 'rerun', number>> = {}) => {
  const calls: string[] = [];
  const s: FreshSteps = {
    stage: () => (calls.push('stage'), codes.stage ?? 0),
    install: () => (calls.push('install'), codes.install ?? 0),
    rerun: () => (calls.push('rerun'), codes.rerun ?? 0),
    log: () => {},
  };
  return { s, calls };
};

describe('kvnFreshness', () => {
  test('fresh when the installed stamp has the source fingerprint', () => {
    expect(kvnFreshness('abc', () => 'abc')).toEqual({ fresh: true });
  });
  test('stale when they differ, and the reason names both', () => {
    const f = kvnFreshness('old', () => 'new');
    expect(f.fresh).toBe(false);
    expect(!f.fresh && f.reason).toContain('old ≠ new');
  });
  test('stale when there is no stamp, or the source cannot be read', () => {
    expect(kvnFreshness(null, () => 'x').fresh).toBe(false);
    expect(kvnFreshness('x', () => { throw new Error('ENOENT'); }).fresh).toBe(false);
  });
  test('the stamp is read from the installed package', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kvn-stamp-'));
    const p = path.join(dir, '.stage-stamp.json');
    fs.writeFileSync(p, JSON.stringify({ source: '/x/kvn', fingerprint: 'f00' }));
    expect(installedFingerprint(p)).toBe('f00');
    expect(installedFingerprint(path.join(dir, 'none.json'))).toBeNull();
  });
});

describe('ensureFreshKvn', () => {
  test('fresh: the import goes on in this process', () => {
    const { s, calls } = steps();
    expect(ensureFreshKvn({}, s, () => ({ fresh: true }))).toBeNull();
    expect(calls).toEqual([]);
  });
  test('stale: stage, install, and run the import again, with its exit code', () => {
    const { s, calls } = steps({ rerun: 0 });
    expect(ensureFreshKvn({}, s, () => ({ fresh: false, reason: 'old' }))).toBe(0);
    expect(calls).toEqual(['stage', 'install', 'rerun']);
    const failed = steps({ rerun: 1 });
    expect(ensureFreshKvn({}, failed.s, () => ({ fresh: false, reason: 'old' }))).toBe(1);
  });
  test('a failed staging stops there, with its code', () => {
    const { s, calls } = steps({ stage: 2 });
    expect(ensureFreshKvn({}, s, () => ({ fresh: false, reason: 'old' }))).toBe(2);
    expect(calls).toEqual(['stage']);
  });
  test('still stale on the second run: stop, never loop', () => {
    const { s, calls } = steps();
    expect(ensureFreshKvn({ [RERUN_FLAG]: '1' }, s, () => ({ fresh: false, reason: 'old' }))).toBe(1);
    expect(calls).toEqual([]);
  });
});

test('import-bible.ts loads the guard before anything else', () => {
  const src = fs.readFileSync(path.join(import.meta.dir, '..', 'scripts', 'import-bible.ts'), 'utf-8');
  const firstImport = src.split('\n').find((l) => l.startsWith('import '));
  expect(firstImport).toBe("import './kvn-fresh-guard.ts';");
});
