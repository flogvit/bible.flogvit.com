// Every edition we offer can be kept on the account (#218).
//
// The owner, logged in: «hvis jeg endrer Bibeloversettelse under innstillinger
// og refresher siden så er den tilbake til OSNB». konto checks `bible.edition`
// against a pattern (`PRODUCT_PREF_REGISTRY`, konto/src/lib/prefs.ts) that had
// no underscore. The editions #215 published — luther_1912, segond_1910,
// rv_1909 — were dropped in silence by PUT /api/prefs, which then wrote the
// account's OLD value back over the cookie. On the reload the server read the
// account, the truth for a logged-in reader (#182), and showed OSNB.
//
// Nothing in bibel could see it: our ids and konto's pattern live in two repos.
// This test reads konto's pattern where it is defined and holds every id in
// IMPORTED_BIBLES to it, and the browser's own guard (SERVED in
// public/js/edition-pref.js) too, so the next group of editions (#216:
// chinese_union_simp …) cannot be published into the same hole.

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { IMPORTED_BIBLES } from '../src/lib/editions.ts';

const ROOT = resolve(import.meta.dir, '..');

/**
 * konto/ lies beside the bibel checkout (flogvit.com/bibel). A worktree
 * elsewhere has no sibling, so look beside the main checkout it belongs to —
 * the same lookup as portalDir() in family-menu.test.ts.
 */
function kontoPrefsFile(): string | null {
  const candidates = [resolve(ROOT, '../konto')];
  const git = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT });
  const commonDir = git.stdout.toString().trim();
  if (commonDir) candidates.push(resolve(dirname(dirname(commonDir)), 'konto'));
  for (const dir of candidates) {
    const file = resolve(dir, 'src/lib/prefs.ts');
    if (existsSync(file)) return file;
  }
  return null;
}

/** The pattern konto checks `bible.edition` against, read from konto's source. */
function kontoEditionPattern(file: string): RegExp {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/'bible\.edition':\s*\/(.+)\/([a-z]*),/);
  if (!m) throw new Error(`no 'bible.edition' pattern in ${file}`);
  return new RegExp(m[1]!, m[2]);
}

const KONTO_PREFS = kontoPrefsFile();

describe('every edition can be kept on the account', () => {
  test.skipIf(!KONTO_PREFS)('konto accepts every id in IMPORTED_BIBLES', () => {
    const pattern = kontoEditionPattern(KONTO_PREFS!);
    const refused = IMPORTED_BIBLES.filter((id) => !pattern.test(id));
    expect(refused, `konto (${KONTO_PREFS}) refuses ${refused.join(', ')} with ${pattern}`).toEqual([]);
    // "follow the interface language" is a choice too.
    expect(pattern.test('')).toBe(true);
  });

  test('konto is found from this checkout (the test above is not skipped in silence)', () => {
    // Bibel's own checkout and the deploy run beside konto. Should a checkout
    // without it appear (orkester trees elsewhere), the skip is visible here.
    if (!KONTO_PREFS) console.warn('edition-konto-contract: konto/src/lib/prefs.ts not found — the contract is unmeasured');
    expect(KONTO_PREFS === null || existsSync(KONTO_PREFS)).toBe(true);
  });

  test('the browser guard accepts every edition free-bible can name', async () => {
    const src = readFileSync(resolve(ROOT, 'public/js/edition-pref.js'), 'utf8');
    const m = src.match(/const SERVED = \/(.+)\/;/);
    expect(m, 'SERVED in edition-pref.js').toBeTruthy();
    const served = new RegExp(m![1]!);
    // The longest ids in free-bible's harvested editions (generate/bibles_raw).
    for (const id of [...IMPORTED_BIBLES, 'chinese_union_simp', 'papua_new_guinea_tok_pisin']) {
      expect(served.test(id), id).toBe(true);
    }
    expect(served.test('user:abc')).toBe(false);
  });
});
