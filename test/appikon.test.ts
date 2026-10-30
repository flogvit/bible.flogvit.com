// Appikonene er portalens sett for dette produktet (portal/design/appikoner/<produkt>/,
// portal/STYLE.md → «Ikoner og appikoner», flogvit-com#349). Kopien holdes lik med
// `bun ikonkopi.ts --skriv` i meta-repoet; denne testen feller når den avviker.
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const DIR = resolve(ROOT, 'public');
const MANIFEST = 'public/manifest.json';
const PRODUKT: string = JSON.parse(readFileSync(resolve(DIR, 'fv-appikon.json'), 'utf8')).produkt;

const sh = (args: string[], cwd: string) => {
  const r = Bun.spawnSync(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
};

/** portal/ ved siden av utsjekken, eller ved siden av hovedutsjekken et arbeidstre hører til. */
function portalDir(): string | null {
  for (let d = ROOT; d !== dirname(d); d = dirname(d)) if (existsSync(resolve(d, 'portal/design/appikoner.json'))) return resolve(d, 'portal');
  const felles = sh(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], ROOT);
  if (!felles) return null;
  for (let d = dirname(felles); d !== dirname(d); d = dirname(d)) if (existsSync(resolve(d, 'portal/design/appikoner.json'))) return resolve(d, 'portal');
  return null;
}
const PORTAL = portalDir();

describe('appikonene', () => {
  // Tre git-kall i alt, ikke ett per fil: under last tar hvert kall over et sekund.
  test('settet er portalens, byte for byte', () => {
    expect(PORTAL).not.toBeNull();
    const ref = sh(['git', 'rev-parse', '-q', '--verify', 'origin/main'], PORTAL!) ? 'origin/main' : 'HEAD';
    // «<modus> blob <id>\t<navn>» for hver fil i portalens sett.
    const portal = new Map(
      (sh(['git', 'ls-tree', `${ref}:design/appikoner/${PRODUKT}`], PORTAL!) ?? '')
        .split('\n')
        .filter(Boolean)
        .map((l) => [l.split('\t')[1]!, l.split(/\s+/)[2]!] as const),
    );
    expect(portal.size).toBeGreaterThan(0);
    const filer = [...portal.keys()];
    const mangler = filer.filter((f) => !existsSync(resolve(DIR, f)));
    expect(mangler).toEqual([]);
    const her = (sh(['git', 'hash-object', ...filer.map((f) => resolve(DIR, f))], ROOT) ?? '').split('\n');
    expect(filer.map((f, i) => ({ f, lik: her[i] === portal.get(f) }))).toEqual(filer.map((f) => ({ f, lik: true })));
  }, 60_000);

  test.if(MANIFEST !== null)('manifestet peker på ikonene, også det maskerbare', () => {
    const m = JSON.parse(readFileSync(resolve(ROOT, MANIFEST!), 'utf8'));
    const src = (m.icons as { src: string; purpose?: string }[]).map((i) => i.src);
    for (const f of ['/favicon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']) expect(src).toContain(f);
    expect(m.icons.find((i: { src: string }) => i.src === '/icon-maskable-512.png').purpose).toBe('maskable');
  });
});
