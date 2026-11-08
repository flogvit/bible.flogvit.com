// Imported FIRST by import-bible.ts (#227): the import must not run against a
// kvn other than the one in $FREE_BIBLE_DIR. When it does, the package is
// staged again and the import runs anew in a fresh process, which loads the new
// copy; this process exits with that run's code. See kvn-fresh.ts.
//
// It is a module of its own, and first in the list, because ES modules are
// evaluated in import order: this runs before anything that uses kvn has run.

import { BIBEL_DIR } from './kvn-staging.ts';
import { ensureFreshKvn, RERUN_FLAG } from './kvn-fresh.ts';

const run = (cmd: string[], env: Record<string, string | undefined> = process.env) =>
  Bun.spawnSync(cmd, { cwd: BIBEL_DIR, env, stdout: 'inherit', stderr: 'inherit' }).exitCode ?? 1;

const code = ensureFreshKvn(process.env, {
  stage: () => run(['bun', 'scripts/stage-kvn.ts']),
  install: () => run(['bun', 'install']),
  rerun: () => run([process.execPath, ...process.argv.slice(1)], { ...process.env, [RERUN_FLAG]: '1' }),
  log: (line) => console.log(line),
});
if (code !== null) process.exit(code);
