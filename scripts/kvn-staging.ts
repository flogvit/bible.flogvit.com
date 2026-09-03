// HVA kvn-package/ skal bestå av — ett sted, lest av alle tre som bryr seg:
// `stage-kvn.ts` (som lager den), `ensure-kvn.ts` (som reparerer den) og
// `test/kvn-staging.test.ts` (som vokter den).
//
// Lista lå tidligere som fire `cp`-linjer i deploy-skriptet i et ANNET repo, og
// som en setning i CLAUDE.md. Ingen av dem kunne håndheve noe, og setningen ble
// lest som «kopier free-bible/kvn» — altså også `tests/`, `data/`, `scripts/`,
// `research/` og `node_modules/`. Se #62.

import fs from 'node:fs';
import path from 'node:path';

export const BIBEL_DIR = path.resolve(import.meta.dir, '..');

/**
 * Alle stedene free-bible kan ligge, i den rekkefølgen de prøves.
 *
 * Søsterkatalogen holder for en vanlig klone, men IKKE for et arbeidstre:
 * smias trær ligger under `~/.flogvit-orkester/trær/<grein>/`, og der er
 * `../free-bible` en katalog som ikke finnes. Det er nettopp arbeidstreet som
 * må kunne bootstrappe seg selv (#62), så en oppløsning som bare virker hjemme
 * er ingen oppløsning.
 *
 * `git rev-parse --git-common-dir` peker fra et arbeidstre tilbake til
 * HOVEDKLONENS `.git`, og derfra er free-bible søsteren igjen.
 */
export function freeBibleCandidates(): string[] {
  // En eksplisitt FREE_BIBLE_DIR er et svar, ikke et forslag: er den satt og
  // feil, skal det si fra framfor at vi stille bruker en annen klone. Det var
  // en stale klone som en gang ga «0 endringer» ved import.
  if (process.env.FREE_BIBLE_DIR) return [path.resolve(process.env.FREE_BIBLE_DIR)];

  const ut = [path.join(BIBEL_DIR, '..', 'free-bible')];
  const git = Bun.spawnSync(['git', 'rev-parse', '--git-common-dir'], { cwd: BIBEL_DIR });
  if (git.exitCode === 0) {
    const felles = path.resolve(BIBEL_DIR, git.stdout.toString().trim());
    ut.push(path.join(path.dirname(felles), '..', 'free-bible'));
  }
  return [...new Set(ut.map((p) => path.normalize(p)))];
}

export const FREE_BIBLE_DIR =
  freeBibleCandidates().find((c) => fs.existsSync(path.join(c, 'kvn'))) ?? freeBibleCandidates()[0]!;

export const SOURCE = path.join(FREE_BIBLE_DIR, 'kvn');
export const TARGET = path.join(BIBEL_DIR, 'kvn-package');
export const STAMP_FILE = '.stage-stamp.json';
export const STAMP = path.join(TARGET, STAMP_FILE);
export const INSTALLED = path.join(BIBEL_DIR, 'node_modules', '@free-bible', 'kvn', 'package.json');

/**
 * ALT pakka skal bestå av — en HVITLISTE.
 *
 * Kjøretidsflata er `package.json` sin `exports` (fem filer under `src/`)
 * pluss `mappings/`, som `verse-mapper.ts` leser. `tsconfig.json` trengs av
 * typecheck.
 *
 * `src/` tas hel framfor fil-for-fil: en liste over enkeltfiler ville drevet
 * fra free-bibles interne imports i stillhet, og poenget her er at ingenting
 * skal kunne drive. En SVARTELISTE ville på sin side måttet utvides hver gang
 * free-bible får en ny katalog — hvitlista tar det nye tilfellet gratis.
 */
export const STAGED = ['src', 'mappings', 'package.json', 'tsconfig.json'] as const;

/** Filer stagingen selv legger igjen, og som derfor ikke er fremmedlegemer. */
export const OWN = new Set([STAMP_FILE]);

/**
 * Felter som IKKE bæres over i den stagede `package.json`.
 *
 * Hvitlista over gjelder FILER, og `package.json` er én av dem — men inni den
 * står et felt som drar free-bibles eget testverktøy inn i VÅR `bun.lock`:
 *
 *   @free-bible/kvn (devDependencies) -> vitest -> vite -> postcss -> nanoid
 *
 * 108 pakker vi verken importerer eller kjører, men som `bun audit` med rette
 * reviderer fordi de står låst hos oss. Det ga #112, og neste råd ville kommet
 * mot esbuild eller rollup i den samme kjeden.
 *
 * Regelen er installasjonens egen: en devDependency får man av ROT-prosjektet
 * sitt, aldri av en avhengighet. Bun avviker fra det for `file:`-avhengigheter
 * — den installerer dem som et arbeidsområde — og det avviket er hele saken.
 *
 * `dependencies` strippes IKKE. Får kvn en ekte kjøretidsavhengighet en dag,
 * trenger vi den; det er testverktøyet for tester vi aldri kjører her (#62)
 * som ikke er vårt.
 */
export const STRIPPED_FIELDS = ['devDependencies'] as const;

/**
 * Innholdet i den stagede `package.json`, gitt kildens.
 *
 * Ren tekst inn og ut, så vakta kan måle REGELEN uten en free-bible-klone.
 */
export function stagedPackageJson(sourceText: string): string {
  const pkg = JSON.parse(sourceText) as Record<string, unknown>;
  for (const field of STRIPPED_FIELDS) delete pkg[field];
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Hva som er galt med kvn-package/ slik den ligger nå. Tom liste = i orden.
 *
 * Returnerer TEKST framfor en boolean fordi den eneste leseren som betyr noe
 * er et menneske foran en rød test, og «noe er galt» hjelper ingen.
 */
export function inventoryProblems(): string[] {
  if (!fs.existsSync(TARGET)) return [`kvn-package/ finnes ikke (${TARGET})`];

  const problems: string[] = [];
  const present = fs.readdirSync(TARGET).filter((n) => !OWN.has(n));

  for (const extra of present.filter((n) => !(STAGED as readonly string[]).includes(n))) {
    problems.push(`kvn-package/${extra} hører ikke i pakka — stagingen har kopiert for mye`);
  }
  for (const missing of STAGED.filter((n) => !present.includes(n))) {
    problems.push(`kvn-package/${missing} mangler`);
  }

  // En rå kopi av kildens package.json ser riktig ut i inventaret over —
  // filnavnet er jo på hvitlista — mens den drar free-bibles testverktøy inn i
  // bun.lock (#112). Derfor er dette en INVENTARFEIL og ikke bare noe
  // stagingen gjør: `ensure-kvn.ts` reparerer det som står her, og stagingen
  // hopper ikke over en kjøring så lenge lista ikke er tom.
  const pkgPath = path.join(TARGET, 'package.json');
  if (fs.existsSync(pkgPath)) {
    let pkg: Record<string, unknown> | null = null;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      problems.push('kvn-package/package.json lar seg ikke lese som JSON');
    }
    for (const field of STRIPPED_FIELDS) {
      if (pkg && pkg[field] !== undefined) {
        problems.push(`kvn-package/package.json deklarerer «${field}» — free-bibles verktøy er ikke vårt å låse`);
      }
    }
  }
  return problems;
}

/** Alle `*.test.ts`/`*.test.tsx` under kvn-package/, relativt til den. */
export function foreignTestFiles(): string[] {
  if (!fs.existsSync(TARGET)) return [];
  const found: string[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(path.join(abs, d.name), childRel);
      else if (/\.test\.tsx?$/.test(d.name)) found.push(childRel);
    }
  };
  walk(TARGET, '');
  return found.sort();
}
