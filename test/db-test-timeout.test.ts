/**
 * VAKT: en testfil som snakker med databasen oppgir taket sitt SELV (#74).
 *
 * Saken: `beforeAll` i `shares` og `reading-map-page` røk på 5001 ms mens
 * `ensureSchema()` legitimt tok 2,4 s på en tom maskin og 14 s på en travel.
 * Da kjøres ingen av filens tester, og suiten melder «797 pass» der den skulle
 * meldt 822 — den ser grønn ut for alt annet enn de to linjene.
 *
 * Vakta er formulert på HVA FILEN NÅR, ikke på en liste over filnavn: når en
 * testfil (transitivt) importerer `src/lib/db.ts`, avhenger kjøretiden av
 * databasen framfor av koden vår, og da er buns 5 s ikke et tak noen har valgt
 * til den — det er standardverdien for en ren logikktest, arvet. Neste DB-test
 * fanges dermed uten at noen har ført den opp noe sted.
 *
 * Begge retninger måles med vilje. Uten den andre halvdelen ville «sett linja i
 * ALLE filene» bestått, og da hadde de rene logikktestene mistet det stramme
 * taket sitt i stillhet — nettopp den byttehandelen saken advarer mot.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

const ROOT = resolve(import.meta.dir, '..');
const DB_MODULE = resolve(ROOT, 'src/lib/db.ts');

/** Linja filen skal bære. Den skal se lik ut overalt, så det finnes ett tall. */
const DECLARATION = /^setDefaultTimeout\(DB_TEST_TIMEOUT_MS\);$/m;

const kilde = new Map<string, string>();
function les(file: string): string {
  let s = kilde.get(file);
  if (s === undefined) {
    s = readFileSync(file, 'utf8');
    kilde.set(file, s);
  }
  return s;
}

/** Relative importer i en modul, resolvet til filer som finnes på disk. */
function importer(file: string): string[] {
  const ut: string[] = [];
  for (const m of les(file).matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) {
    const p = resolve(dirname(file), m[1]!);
    for (const kandidat of [p, `${p}.ts`, `${p}.tsx`, `${p}.js`, `${p}/index.ts`]) {
      if (existsSync(kandidat) && statSync(kandidat).isFile()) {
        ut.push(kandidat);
        break;
      }
    }
  }
  return ut;
}

/** Når filen databasen, direkte eller gjennom noe den importerer? */
function nårDatabasen(entry: string): boolean {
  const sett = new Set<string>([entry]);
  const kø = [entry];
  while (kø.length) {
    const f = kø.pop()!;
    if (f === DB_MODULE) return true;
    for (const neste of importer(f)) {
      if (!sett.has(neste)) {
        sett.add(neste);
        kø.push(neste);
      }
    }
  }
  return false;
}

const TESTFILER = readdirSync(resolve(ROOT, 'test'))
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => resolve(ROOT, 'test', f));

describe('DB-tester oppgir taket sitt (#74)', () => {
  const dbFiler = TESTFILER.filter(nårDatabasen);
  const reneFiler = TESTFILER.filter((f) => !dbFiler.includes(f));

  test('filene som når databasen finnes — ellers måler vakta ingenting', () => {
    expect(dbFiler.length).toBeGreaterThan(10);
    expect(reneFiler.length).toBeGreaterThan(0);
  });

  test('hver DB-testfil erklærer setDefaultTimeout(DB_TEST_TIMEOUT_MS)', () => {
    const manglende = dbFiler.filter((f) => !DECLARATION.test(les(f))).map((f) => relative(ROOT, f));
    expect(manglende).toEqual([]);
  });

  test('en fil som IKKE når databasen erklærer det ikke', () => {
    const overflødige = reneFiler.filter((f) => DECLARATION.test(les(f))).map((f) => relative(ROOT, f));
    expect(overflødige).toEqual([]);
  });

  // Taket er den ENESTE spaken, siden alle filene bruker samme konstant. Målt
  // tyngste arbeid under last er ~15 s (se `db-timeout.ts`); et tak på 15 eller
  // 20 s ville vært samme feil én størrelse opp.
  test('taket ligger godt over det tyngste vi har målt', () => {
    expect(DB_TEST_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000);
  });

  // En hook som migrerer skjemaet får ikke sette taket sitt NED igjen med et
  // eget tall: `ensureSchema()` er det tyngste vi kjører i en hook, og et
  // håndskrevet `}, 30_000)` ved siden av filens erklæring er samme felle én
  // størrelse opp — og den er usynlig, for filen ser jo ut til å ha erklært seg.
  test('ingen skjemamigrerende hook overstyrer taket nedover', () => {
    const brudd: string[] = [];
    for (const f of dbFiler) {
      const src = les(f);
      if (!src.includes('ensureSchema(')) continue;
      for (const m of src.matchAll(/^\}, ([\d_]+)\);$/gm)) {
        const ms = Number(m[1]!.replaceAll('_', ''));
        if (ms < DB_TEST_TIMEOUT_MS) brudd.push(`${relative(ROOT, f)}: ${ms} ms`);
      }
    }
    expect(brudd).toEqual([]);
  });
});
