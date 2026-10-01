// Preloaded by bunfig.toml: loads bibel's .env (one level up) into the test
// process, so `cd mcp && bun test` reaches the same local database as
// `bun run test`. A variable already set in the environment wins, as with
// Bun's own .env loading.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from './parse-env';

// Not a URL pathname: the worktree path has an æ, and a percent-encoded one
// does not exist (CLAUDE.md).
const rootEnv = join(import.meta.dir, '..', '..', '.env');
if (existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, 'utf8')))) {
    process.env[key] ??= value;
  }
}
