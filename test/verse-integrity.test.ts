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

import { beforeAll, describe, expect, test } from 'bun:test';
import { getSql } from '../src/lib/db.ts';
import { CHAPTER_REF_TABLES, VERSE_REF_TABLES, UNCHECKED_TABLES, findDanglingRefs } from '../src/lib/verse-refs.ts';
import { TABLES } from '../src/lib/schema.ts';
import { booksData } from '../src/lib/books-data.ts';
import { verseCounts } from '../src/lib/verse-counts.ts';

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
