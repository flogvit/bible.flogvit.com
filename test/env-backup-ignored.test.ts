/**
 * En editor-backup av en env-fil er like hemmelig som fila selv (#119).
 *
 * `.env*` treffer `.env~` og `.env.local~`, men ikke `<tjeneste>.env~` —
 * en backup av en tjeneste-env stod som usporet i `git status`, ett
 * `git add -A` fra historikken (konto lekket en Stripe-nøkkel slik,
 * flogvit-com#261). Vakta spør git selv, ikke `.gitignore`-teksten: det er
 * git som avgjør hva `add -A` tar med.
 *
 * To halvdeler: BACKUPENE ignoreres, også i en underkatalog, og en SPORET
 * eksempelfil blir IKKE ignorert — ellers ville «ignorer alt» bestått, og
 * eksempelet forsvunnet fra neste klon.
 */
import { describe, expect, test } from 'bun:test';

const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));

function ignored(path: string): boolean {
  const res = Bun.spawnSync(['git', 'check-ignore', '-q', '--no-index', path], { cwd: ROOT });
  if (res.exitCode !== 0 && res.exitCode !== 1) {
    throw new Error(`git check-ignore feilet (${res.exitCode}): ${res.stderr.toString()}`);
  }
  return res.exitCode === 0;
}

describe('env-backuper holdes utenfor git (#119)', () => {
  const BACKUPS = ['.env~', 'api/.env~', 'puzzles.env~', 'server/bibel.env~', '.env.local~'];

  for (const f of BACKUPS) {
    test(`${f} ignoreres`, () => {
      expect(ignored(f)).toBe(true);
    });
  }

  test('sporede eksempelfiler ignoreres ikke', () => {
    const res = Bun.spawnSync(['git', 'ls-files', '.env.example', '**/.env.example', '*.env.example'], { cwd: ROOT });
    const files = res.stdout.toString().split('\n').filter(Boolean);
    const hidden = files.filter(ignored);
    expect(hidden).toEqual([]);
    // Et eksempel som IKKE sporet ennå skal heller ikke skjules av mønsteret.
    expect(ignored('.env.example')).toBe(false);
  });
});
