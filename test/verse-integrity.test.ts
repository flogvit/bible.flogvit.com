// VERSADRESSE-INTEGRITET — ingen importert rad skal peke på et vers som ikke finnes (#46).
//
// Bakgrunnen er en ekte 404-storm: referanse-chipene i versdetaljen lenker til
// `/nn/ord/119` fordi raden sier «Ordspråkene 119» der kilden mente Salme 119.
// GPTBot fulgte dem og ga 400 404-er på én time. 182 unike døde mål, lenket fra
// 136 kapittelsider, servert under alle åtte språkprefikser.
//
// Dette er en SVEIP over KLASSEN, ikke over tilfellet: hver tabell som
// adresserer et vers sjekkes med samme regel. Den fanger derfor neste
// innholdsslag som får en død adresse, uten at noen må huske denne saken.
//
// Vakta har to halvdeler, og begge trengs:
//   1. DATA  — ingen rad i basen peker utenfor `verses`.
//   2. FORM  — hver tabell i skjemaet som HAR en versadresse står i lista som
//              punkt 1 sveiper. Uten den vokser skjemaet fra vakta i stillhet.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import {
  CHAPTER_REF_TABLES,
  VERSE_REF_TABLES,
  UNCHECKED_TABLES,
  findDanglingRefs,
  JSON_ADDRESS_KEYS,
  EXEMPT_ADDRESS_KEYS,
  allAddressKeys,
  verseExtentFrom,
  stripDanglingJsonVerseRefs,
  findDanglingJsonVerseRefs,
} from '../src/lib/verse-refs.ts';
import { CONTENT_SOURCES } from '../src/lib/person-refs.ts';
import { TABLES } from '../src/lib/schema.ts';
import { booksData } from '../src/lib/books-data.ts';
import { verseCounts } from '../src/lib/verse-counts.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Poolen hentes PER KALL, aldri på modulnivå. `closeSql()` i en annen testfil
// nuller den ut, og en referanse tatt ved import ville da vært død når denne
// fila kjørte — som «Connection closed» i to helt andre filer.
const db = () => getSql();

// Uten importert innhold har sveipen ingenting å si noe om, og en grønn test
// ville vært en løgn. Da feiler den heller med en beskjed som sier hva som må
// kjøres.
let hasContent = false;
beforeAll(async () => {
  const [row] = (await db()`SELECT COUNT(*) AS n FROM verses WHERE bible = 'osnb'`) as { n: number }[];
  hasContent = Number(row?.n ?? 0) > 0;
});

describe('versadresser i importert innhold', () => {
  test('basen har osnb-vers å måle mot', () => {
    expect(hasContent, 'kjør `bun scripts/import-bible.ts` først — uten vers kan ingenting valideres').toBe(true);
  });

  test('ingen rad peker på et vers som ikke finnes', async () => {
    const findings = await findDanglingRefs(db());
    const report = findings
      .map((f) => `${f.table}.${f.column}: ${f.rows} rader (${f.examples.join(', ')})`)
      .join('\n');
    expect(report, `døde versadresser — kjør \`bun scripts/init-db.ts\` for å rydde:\n${report}`).toBe('');
  });
});

describe('kapittelantall har ÉN sannhet', () => {
  // Bifunnet i #46: `books-data.ts` sa Joel har 4 kapitler, `books.chapters` i
  // basen sa 3, og `verses` hadde 4. Ingenting var synlig ødelagt — koden vant
  // der det betydde noe — men to kilder som kan drifte er neste avvik.
  test('books.chapters i basen er den samme som books-data.ts', async () => {
    const rows = (await db()`SELECT id, chapters FROM books ORDER BY id`) as { id: number; chapters: number }[];
    const inDb = new Map(rows.map((r) => [Number(r.id), Number(r.chapters)]));
    const avvik = booksData
      .filter((b) => inDb.has(b.id) && inDb.get(b.id) !== b.chapters)
      .map((b) => `${b.short_name}: books-data=${b.chapters} books.chapters=${inDb.get(b.id)}`);
    expect(avvik.join(', ')).toBe('');
  });

  test('books-data.ts stemmer med kapitlene som faktisk ligger i verses', async () => {
    const rows = (await db()`
      SELECT book_id, MAX(chapter) AS mx FROM verses WHERE bible = 'osnb' GROUP BY book_id
    `) as { book_id: number; mx: number }[];
    const inVerses = new Map(rows.map((r) => [Number(r.book_id), Number(r.mx)]));
    const avvik = booksData
      .filter((b) => inVerses.has(b.id) && inVerses.get(b.id) !== b.chapters)
      .map((b) => `${b.short_name}: books-data=${b.chapters} verses=${inVerses.get(b.id)}`);
    expect(avvik.join(', ')).toBe('');
  });

  test('verse-counts.ts er i takt med verses', async () => {
    // Generert artefakt (scripts/generate-verse-counts.ts), sjekket inn og brukt
    // av importen. Blir den stale, gjetter importen feil om hva som er et helt
    // kapittel.
    const rows = (await db()`
      SELECT book_id, chapter, MAX(verse) AS mx FROM verses WHERE bible = 'osnb'
      GROUP BY book_id, chapter
    `) as { book_id: number; chapter: number; mx: number }[];
    const avvik: string[] = [];
    for (const r of rows) {
      const generert = verseCounts[Number(r.book_id)]?.[Number(r.chapter) - 1];
      if (generert !== Number(r.mx)) {
        avvik.push(`${r.book_id}:${r.chapter} verse-counts=${generert} verses=${r.mx}`);
      }
    }
    expect(avvik.slice(0, 10).join(', ')).toBe('');
  });
});

/**
 * Tabellene i skjemaet som ADRESSERER et vers eller et kapittel — lest ut av
 * DDL-en, ikke ført opp for hånd. En ny tabell med `book_id` + `chapter` dukker
 * dermed opp her av seg selv, og må plasseres i sveipen eller unntas med grunn.
 */
function verseAddressingTablesInSchema(): string[] {
  const found: string[] = [];
  for (const ddl of TABLES) {
    const name = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(ddl)?.[1];
    if (!name) continue;
    // Kolonnedefinisjonene, ikke nøklene: `INDEX idx_x (book_id, chapter)`
    // nevner de samme ordene uten at tabellen adresserer noe.
    const columns = ddl
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\w+ (INT|BIGINT|VARCHAR)/.test(l))
      .map((l) => l.split(/\s+/)[0]!);
    const hasBook = columns.some((c) => /book_id$/.test(c));
    const hasChapter = columns.some((c) => /^(chapter|.*_chapter|chapter_start)$/.test(c));
    const hasVerse = columns.some((c) => /^(verse|.*_verse|verse_start|.*_verse_start)$/.test(c));
    if (hasBook && (hasChapter || hasVerse)) found.push(name);
  }
  return found;
}

describe('vakta dekker skjemaet', () => {
  test('DDL-lesningen finner faktisk noe', () => {
    // Uten denne ville en regex som slutter å matche gjort neste test grønn av
    // feil grunn: ingen funn, altså ingenting udekket.
    expect(verseAddressingTablesInSchema()).toContain('references_');
    expect(verseAddressingTablesInSchema().length).toBeGreaterThan(10);
  });

  test('hver tabell med versadresse står i sveipen', () => {
    const dekket = new Set([
      ...VERSE_REF_TABLES.map((t) => t.table),
      ...CHAPTER_REF_TABLES.map((t) => t.table),
      ...UNCHECKED_TABLES.map((t) => t.table),
    ]);
    const udekket = verseAddressingTablesInSchema().filter((t) => !dekket.has(t));
    expect(
      udekket.join(', '),
      'ny tabell med (book_id, chapter, verse…): legg den i VERSE_REF_TABLES/CHAPTER_REF_TABLES, ' +
        'eller i UNCHECKED_TABLES med en begrunnelse',
    ).toBe('');
  });

  test('hvert unntak har en begrunnelse', () => {
    const uten = UNCHECKED_TABLES.filter((t) => !t.why.trim()).map((t) => t.table);
    expect(uten.join(', ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// SAMME KLASSE, ANNEN LAGRING: versadressen ligger i en JSON-BLOB
// ---------------------------------------------------------------------------
//
// Sveipen over leser KOLONNER, og `verseAddressingTablesInSchema()` leter etter
// `book_id` + `chapter` i DDL-en. `persons`, `stories`, `themes`,
// `reading_plans`, `number_symbolism` og `days` har ingen slik kolonne — de
// bærer adressen inne i en JSON-blob — så de har aldri vært med i sveipen, og
// FORM-halvdelens løfte om at «skjemaet ikke kan vokse fra vakta i stillhet»
// gjaldt bare halve lagringen.
//
// Målt i basen da dette ble skrevet: 282 døde adresser, 276 i `persons` og 6 i
// `stories`. Utslaget er todelt, og begge sidene er verifisert i prod:
//
//   - `persons.references[]` bygger en `<a href>` DIREKTE, uten å slå opp om
//     verset finnes (`persons.tsx`). En død adresse der er #46 om igjen, ordrett.
//     Den er tom i dag — men ingenting fanget den om den ble det.
//   - Resten går gjennom `getVersesWithOriginal()`, som `continue`-r på et vers
//     som ikke finnes. Da faller innholdet BORT i stillhet: 128 nøkkelhendelser
//     rendres som overskrift og beskrivelse uten ett eneste vers
//     (`/nb/personer/epainetos` — fire hendelser, null vers), og
//     `/nb/historier/susanna-frikjennes-av-daniel` er en `<h2>Daniel 13,1-64</h2>`
//     over ingenting, fordi osnb har 12 kapitler i Daniel.
//
// Samme lærdom som #61: en adresse som bor i en blob er usynlig for en vakt som
// er formulert på kolonner.

describe('regelen for en versadresse i en JSON-blob', () => {
  // Bok 1: kapittel 1 (31 vers) og 2 (25 vers). Bok 2: kapittel 1 (10 vers).
  const extent = verseExtentFrom([
    { book_id: 1, chapter: 1, mx: 31 },
    { book_id: 1, chapter: 2, mx: 25 },
    { book_id: 2, chapter: 1, mx: 10 },
  ]);
  const strip = (content: unknown) => stripDanglingJsonVerseRefs(content, extent, () => {});

  test('en adresse til en bok vi ikke har, fjernes', () => {
    expect(strip({ references: [{ bookId: 72, chapterId: 2, verseId: 3 }] })).toEqual({ references: [] });
  });

  test('en adresse til et kapittel som ikke finnes, fjernes', () => {
    // Saken selv: `Ordsp 119:36`, bare lagret i en blob i stedet for i en kolonne.
    expect(strip({ references: [{ bookId: 1, chapterId: 119, verseId: 36 }] })).toEqual({ references: [] });
  });

  test('døde vers i en liste filtreres bort — de levende blir', () => {
    // «Kast aldri innhold vi HAR for å bli kvitt en adresse vi ikke har.»
    expect(strip({ verses: [{ bookId: 1, chapter: 1, verses: [1, 99, 5] }] })).toEqual({
      verses: [{ bookId: 1, chapter: 1, verses: [1, 5] }],
    });
  });

  test('dør ALLE versene i lista, faller hele adressen', () => {
    expect(strip({ verses: [{ bookId: 1, chapter: 1, verses: [98, 99] }] })).toEqual({ verses: [] });
  });

  test('et startvers som ikke finnes, feller adressen', () => {
    expect(strip({ references: [{ bookId: 2, chapter: 1, fromVerseId: 40, toVerseId: 41 }] })).toEqual({
      references: [],
    });
  });

  test('et sluttvers forbi kapittelslutt KLIPPES, ikke slettes', () => {
    // Samme avveining som «start slettes, slutt klippes» i kolonnesveipen.
    expect(strip({ references: [{ bookId: 2, chapter: 1, fromVerseId: 2, toVerseId: 99 }] })).toEqual({
      references: [{ bookId: 2, chapter: 1, fromVerseId: 2, toVerseId: 10 }],
    });
  });

  test('et sluttkapittel forbi bokas slutt klippes', () => {
    expect(
      strip({ references: [{ bookId: 1, startChapter: 1, startVerse: 1, endChapter: 9, endVerse: 4 }] }),
    ).toEqual({ references: [{ bookId: 1, startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 4 }] });
  });

  test('en levende adresse røres ikke, uansett dybde', () => {
    const levende = { a: { b: [{ keyEvents: [{ verses: [{ bookId: 1, chapter: 2, verses: [4, 5] }] }] }] } };
    expect(strip(levende)).toBeNull();
  });

  test('et objekt UTEN bok-nøkkel er ikke en adresse', () => {
    // `{day, chapter}` i en leseplan-dag ser adresse-likt ut uten å være det.
    expect(strip({ readings: [{ day: 3, chapter: 119 }] })).toBeNull();
  });

  test('ryddingen er idempotent', () => {
    const en = strip({ verses: [{ bookId: 1, chapter: 1, verses: [1, 99] }] });
    expect(strip(en)).toBeNull();
  });

  test('rapporten navngir adressen som falt', () => {
    const sett: string[] = [];
    stripDanglingJsonVerseRefs({ references: [{ bookId: 1, chapterId: 119, verseId: 36 }] }, extent, (_k, addr) =>
      sett.push(addr),
    );
    expect(sett.join(', ')).toContain('1:119');
  });
});

describe('versadresser i JSON-blobbene', () => {
  test('ingen JSON-blob peker på et vers som ikke finnes', async () => {
    const findings = await findDanglingJsonVerseRefs(db());
    const report = findings.map((f) => `${f.table}.${f.key}: ${f.hits} × ${f.address}`).join('\n');
    expect(report, `døde versadresser i JSON — kjør \`bun scripts/init-db.ts\` for å rydde:\n${report}`).toBe('');
  });
});

describe('vakta dekker adressenøklene i JSON-en', () => {
  // Samme grep som nøkkelhalvdelen i `person-refs.test.ts`: lista over nøkler
  // skal ikke kunne bli stale i stillhet. Denne finner objektene som BÆRER en
  // bok-nøkkel og krever at hver TALL-nøkkel på dem er deklarert — så en ny
  // `endVerseId` fra free-bible dukker opp her av seg selv.
  let numericKeys: Map<string, number> = new Map();

  beforeAll(async () => {
    const bookKeys = new Set(JSON_ADDRESS_KEYS.book);
    const counts = new Map<string, number>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const erAdresse = Object.keys(obj).some((k) => bookKeys.has(k) && typeof obj[k] === 'number');
      if (erAdresse) {
        for (const [k, v] of Object.entries(obj)) {
          const tallbærende = typeof v === 'number' || (Array.isArray(v) && v.every((x) => typeof x === 'number'));
          if (tallbærende) counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      for (const v of Object.values(obj)) walk(v);
    };
    for (const source of CONTENT_SOURCES) {
      const rows = (await db().unsafe(`SELECT ${source.column} AS content FROM ${source.table}`)) as {
        content: string;
      }[];
      for (const row of rows) {
        try {
          walk(JSON.parse(row.content));
        } catch {
          /* ugyldig blob er ikke denne vaktas sak */
        }
      }
    }
    numericKeys = counts;
  });

  test('sveipen finner faktisk adresseobjekter i dataene', () => {
    // Uten denne ville en walk som traff feil gjort neste test grønn av
    // ingenting funnet i det hele tatt.
    expect([...numericKeys.keys()], 'bookId skal finnes i innholdet').toContain('bookId');
    expect(numericKeys.get('bookId') ?? 0).toBeGreaterThan(100);
  });

  test('ingen udeklarert tall-nøkkel sitter på et adresseobjekt', () => {
    const dekket = new Set<string>([...allAddressKeys(), ...EXEMPT_ADDRESS_KEYS.map((e) => e.key)]);
    const udekket = [...numericKeys.entries()]
      .filter(([k]) => !dekket.has(k))
      .map(([k, n]) => `${k} (${n})`)
      .sort();
    expect(
      udekket.join(', '),
      'ny tall-nøkkel på et adresseobjekt: legg den i JSON_ADDRESS_KEYS, ' +
        'eller i EXEMPT_ADDRESS_KEYS med en begrunnelse',
    ).toBe('');
  });

  test('hvert nøkkelunntak har en begrunnelse', () => {
    const uten = EXEMPT_ADDRESS_KEYS.filter((e) => !e.why.trim()).map((e) => e.key);
    expect(uten.join(', ')).toBe('');
  });
});
