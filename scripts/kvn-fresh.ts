// Is the INSTALLED kvn the one in $FREE_BIBLE_DIR/kvn? (#227)
//
// The import reads verse text from $FREE_BIBLE_DIR, but the mappings (the
// gate's `textVerification`, the renumbering) and the verse slicer from the
// installed package, `node_modules/@free-bible/kvn`. `ensure-kvn.ts` checks
// that the package is there and shaped right, not that it is the one the text
// comes from. The orchestra's deployer imports into its test base before
// `deploy-bibel-hono.sh` stages kvn, and `deploy-bibel-data.sh` imports in the
// same checkout without staging, so both imported against whatever had been
// staged last. On 2026-11-08 that was a copy older than free-bible#139, and
// every bibel deploy stopped on «textVerification.status: missing». A stale
// copy that passed the gate would have been worse: text moved by an old
// mapping, sliced by an old slicer, and shipped to prod by the data deploy.
//
// The answer is in the installed package's own stamp: `stage-kvn.ts` writes
// the source's fingerprint into `kvn-package/.stage-stamp.json`, and
// `bun install` copies it along. Equal fingerprints = fresh.

import fs from 'node:fs';
import { INSTALLED_STAMP, SOURCE, sourceFingerprint } from './kvn-staging.ts';

export type Freshness = { fresh: true } | { fresh: false; reason: string };

/** The fingerprint the installed package was staged from, or null when there is none. */
export function installedFingerprint(stampPath: string = INSTALLED_STAMP): string | null {
  try {
    return (JSON.parse(fs.readFileSync(stampPath, 'utf-8')) as { fingerprint?: string }).fingerprint ?? null;
  } catch {
    return null;
  }
}

export function kvnFreshness(
  installed: string | null = installedFingerprint(),
  source: () => string = () => sourceFingerprint(),
): Freshness {
  if (!installed) return { fresh: false, reason: 'the installed @free-bible/kvn has no stage stamp' };
  let wanted: string;
  try {
    wanted = source();
  } catch (e) {
    return { fresh: false, reason: `cannot read ${SOURCE}: ${(e as Error).message}` };
  }
  return installed === wanted
    ? { fresh: true }
    : { fresh: false, reason: `the installed @free-bible/kvn was staged from another ${SOURCE} (${installed} ≠ ${wanted})` };
}

export interface FreshSteps {
  stage(): number;
  install(): number;
  rerun(): number;
  log(line: string): void;
}

/** Set on the second run, so a staging that does not take cannot loop. */
export const RERUN_FLAG = 'KVN_FRESH_RERUN';

/**
 * Null: go on, the kvn in memory is the right one. A number: exit with it —
 * the import ran again in a new process with fresh kvn, or staging failed.
 */
export function ensureFreshKvn(
  env: Record<string, string | undefined>,
  steps: FreshSteps,
  check: () => Freshness = () => kvnFreshness(),
): number | null {
  const f = check();
  if (f.fresh) return null;
  if (env[RERUN_FLAG] === '1') {
    steps.log(`kvn is still not the one in ${SOURCE} after staging: ${f.reason}`);
    return 1;
  }
  steps.log(`kvn: ${f.reason} — staging it again and running the import with the fresh copy`);
  const staged = steps.stage();
  if (staged !== 0) return staged;
  const installed = steps.install();
  if (installed !== 0) return installed;
  return steps.rerun();
}
