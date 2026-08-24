/**
 * Vakta for #101: hvert kapittel med `mapping=` svarte 500 fordi kryssmapperen
 * lastet nummeringsfila under det navnet free-bible ga den FØR omdøpingen
 * 2026-07-26 (`osnb2.ukvn.json` → `osnb.ukvn.json`). `loadUkvnMapping` gjør
 * `readFileSync` uten fallback, så det ble ENOENT og ikke et tomt svar.
 *
 * Halvdelene er formulert på KATALOGEN av mappingfiler, ikke på strengen
 * «osnb»: den NESTE omdøpingen i kilden skal bli rød her, ikke en 500 hos en
 * leser som slår på parallellnummereringen.
 *
 * Kjøres med `npm test` (= `bun test api`). Denne branchen har ingen annen
 * testrigg, og bun trenger ingen installasjon utover den `npm ci` alt gjør —
 * `@free-bible/kvn` må være på plass i `node_modules`.
 */
import { test, expect, describe, mock } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listUkvnMappings } from '@free-bible/kvn';

const API_DIR = join(import.meta.dir, '..');

/** Bibel-id-en i basen — en ANNEN akse enn mapping-id-en, og den skal stå. */
const BIBLE_ID = 'osnb2';

const verse = (chapter: number, v: number) => ({
  id: chapter * 1000 + v,
  book_id: 31,
  chapter,
  verse: v,
  text: `Obadja ${chapter},${v}`,
  bible: BIBLE_ID,
});

// Kryssmappingen er ren kvn-aritmetikk; versoppslaget mot basen er ikke det
// som måles her, så det stubbes framfor å kreve en database.
mock.module('../../src/lib/bible', () => ({
  getVerses: (_book: number, chapter: number) =>
    chapter === 1 ? [verse(1, 1), verse(1, 2), verse(1, 3)] : [],
  getVerse: () => null,
  toUrlSlug: (s: string) => s,
}));

const { mapChapter, getAvailableMappings, OSNB_MAPPING_ID } = await import('./verse-mapper');

describe('BASEN', () => {
  test('nummereringen alt kryssmappes gjennom er en fil katalogen faktisk har', () => {
    // Ikke `toBe('osnb')`: det ville låst navnet i stedet for å kreve at fila
    // finnes, og da hadde neste omdøping bestått testen og felt prod.
    expect(listUkvnMappings()).toContain(OSNB_MAPPING_ID);
  });
});

describe('FLATA', () => {
  // Id-ene velges av DATAENE — nøyaktig de appen selv tilbyr i nedtrekket
  // (`/api/mappings`), pluss den saken målte. En håndplukket liste ville målt
  // det noen kom på; dette måler det leseren kan velge.
  const offered = getAvailableMappings()
    .map((m) => m.id)
    .sort();
  const sample = [...new Set([offered[0], offered[offered.length - 1], OSNB_MAPPING_ID, 'dnb2024_nb'])];

  test('appen tilbyr i det hele tatt mappinger', () => {
    expect(offered.length).toBeGreaterThan(0);
    expect(offered).toContain('dnb2024_nb');
  });

  for (const id of sample) {
    test(`mapChapter kaster ikke og gir vers for «${id}»`, () => {
      const mapped = mapChapter(31, 1, id, BIBLE_ID);
      expect(mapped.length).toBeGreaterThan(0);
      // Bibel-id-en er en annen akse og skal ikke ha fulgt med omdøpingen.
      expect(mapped[0]!.verse.bible).toBe(BIBLE_ID);
    });
  }
});

describe('FORMEN', () => {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) files.push(p);
    }
  })(API_DIR);

  // Kallformene som tar en MAPPING-id (ikke en bibel-id). To ulike former, og
  // begge telles hver for seg: ett samlet tall ville holdt seg over gulvet
  // selv om den ene regexen sluttet å treffe, altså dekket bare halve api/.
  const SHAPES: Record<string, RegExp> = {
    // loadUkvnMapping(x) / getMapper(x) / getCachedMapper(x) — id-en er eneste arg.
    'lastet ved navn': /\b(?:loadUkvnMapping|getCachedMapper|getMapper)\(\s*([^)]*?)\)/,
    // osmainTo(bok, kap, vers, x) — id-en er siste arg. Deklarasjonen er ikke
    // et kallsted og telles ikke.
    'siste argument': /(?<!function )\bosmainTo\(([^)]*)\)/,
  };

  const callSites: { shape: string; file: string; arg: string }[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    for (const [shape, re] of Object.entries(SHAPES)) {
      for (const m of src.matchAll(new RegExp(re.source, 'g'))) {
        callSites.push({ shape, file, arg: m[1]!.split(',').pop()!.trim() });
      }
    }
  }

  for (const shape of Object.keys(SHAPES)) {
    test(`sveipen finner kallsteder av formen «${shape}»`, () => {
      // Uten denne ville halvdelen under vært en tom påstand den dagen en
      // regex slutter å treffe — og det er nettopp da den trengs.
      expect(callSites.filter((c) => c.shape === shape).length).toBeGreaterThan(0);
    });
  }

  test('ingen mapping-id skrives som literal i api/', () => {
    const literals = callSites.filter((c) => /^['"`]/.test(c.arg));
    expect(literals.map((c) => `${c.file.slice(API_DIR.length + 1)}: ${c.arg}`)).toEqual([]);
  });

  test('bibel-id-en osnb2 lever videre — den fulgte ikke med omdøpingen', () => {
    // Uten denne ville «søk og erstatt osnb2 → osnb i hele api/» bestått, og
    // da hadde alle versoppslagene mot basen sluttet å finne noe.
    const withBibleId = files.filter((f) => readFileSync(f, 'utf-8').includes(`'${BIBLE_ID}'`));
    expect(withBibleId.length).toBeGreaterThan(0);
  });
});
