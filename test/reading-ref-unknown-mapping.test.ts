// En adresse skrevet i en nummerering vi ikke HAR skal gi null, ikke ENOENT (#100).
//
// Saken er meldt på `bibel.flogvit.no`, som serveres fra den frosne branchen
// `bibel-no` — en commit herfra når den ikke. Men MEKANISMEN bak den er ikke
// frossen: free-bible omdøpte `osnb2`→`osnb` 2026-07-26, og et kallsted som
// rekker den gamle id-en videre til `loadUkvnMapping()` får `readFileSync` uten
// fallback, altså et ubehandlet kast:
//
//     ENOENT: no such file or directory, open '…/mappings/osnb2.ukvn.json'
//
// På `main` finnes ETT slikt kallsted, og det er `parseReadingRefMarkup()`:
// `resolveMappingId(system) || system` (reading-ref.ts) rekker systemnavnet fra
// `display_ref` rått videre til mapperen. Fila lover selv det motsatte —
// «returnerer null når boka er ukjent eller markupen ikke lar seg lese, en
// gjettet adresse er verre enn ingen (#61)» — og en nummerering vi ikke har er
// nettopp en markup vi ikke kan lese.
//
// UTSLAGET er verre her enn på .no, og det er derfor vakta finnes.
// `repairWholeChapterReadingRefs()` kjøres fra `ensureSchema()`, altså ved HVER
// deploy (#92), og har ingen `try`. Én rad med et systemnavn vi ikke kjenner
// feller dermed `bun scripts/init-db.ts`, som deployen kjører fra det nye imaget
// FØR restart — altså står hele bible.flogvit.com uten utrulling til noen
// finner raden. Importen fanger sitt eget kast per referanse, så der er prisen
// bare at lesningen mister versene sine.
//
// Vaktene er formulert på KONTRAKTEN, ikke på strengen «osnb2»: en id vi ikke
// har en fil for gir null, uansett hva den heter, og reparasjonen bærer den
// videre framfor å felle deployen. Krever lokal DB (DBngin :3326).

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { listUkvnMappings } from '@free-bible/kvn';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import {
  parseReadingRefMarkup,
  repairWholeChapterReadingRefs,
  formatReadingRefRepair,
  readingRefRepairIsEmpty,
} from '../src/lib/reading-ref.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Den døde id-en saken navngir — omdøpt til `osnb` av free-bible 2026-07-26. */
const DØD_ID = 'osnb2';

// ── REGELEN ────────────────────────────────────────────────────────────────
// Ren logikk. Halvdelen kjenner ingen id-liste: den spør FILKATALOGEN hva vi
// har, så en mapping free-bible fjerner eller døper om fanges av seg selv.

describe('REGELEN: en nummerering vi ikke har gir null framfor et kast', () => {
  test('sakens egen id: en adresse i osnb2 leses ikke, og kaster ikke', () => {
    expect(listUkvnMappings()).not.toContain(DØD_ID);
    expect(parseReadingRefMarkup(`[ref:Sal 1,1@${DØD_ID}]`)).toBeNull();
    // Formen UTEN vers går en annen vei gjennom parseren («hele kapittelet»),
    // og den kastet like godt.
    expect(parseReadingRefMarkup(`[ref:Sal 1@${DØD_ID}]`)).toBeNull();
    // Og den kryssende formen, som er den #92 innførte.
    expect(parseReadingRefMarkup(`[ref:Jes 64,6b-65,2@${DØD_ID}]`)).toBeNull();
  });

  test('enhver id vi ikke har en fil for, ikke bare den ene målte', () => {
    const har = listUkvnMappings();
    // Kandidatene utledes av DATAENE: en ekte id med et tegn på, altså et navn
    // som ligner til forveksling og likevel ikke finnes på disk.
    const ukjente = [har[0]!, har[har.length - 1]!, 'osnb'].map((id) => `${id}x`);
    for (const id of ukjente) {
      expect(har).not.toContain(id);
      expect({ id, parsed: parseReadingRefMarkup(`[ref:Sal 1,1@${id}]`) }).toEqual({ id, parsed: null });
    }
  });

  test('en id vi HAR leses fortsatt — ellers ville «alltid null» bestått', () => {
    // Systemnavnene i basen er alias («dnb2024» → `dnb2024_nb`), så begge
    // formene må gjennom.
    const parsed = parseReadingRefMarkup('[ref:Jes 64,6b-65,2@dnb2024]');
    expect(parsed?.mappingId).toBe('dnb2024_nb');
    expect(parsed?.rows.length).toBe(2);
    // Og id-en slik den står på disk.
    expect(parseReadingRefMarkup('[ref:Sal 1,1@osnb]')?.mappingId).toBe('osnb');
    // Ingen `@` i det hele tatt er osmain, som før.
    expect(parseReadingRefMarkup('[ref:Sal 1,1]')?.mappingId).toBe('osnb');
  });
});

// ── DEPLOYEN ───────────────────────────────────────────────────────────────
// Reparasjonen kjøres fra `ensureSchema()`, altså hver deploy. Halvdelen måler
// at én ulesbar rad ikke feller den — og at en rad som SKAL rettes fortsatt
// blir det, ellers ville «hopp over alt» bestått.

const DATO_UKJENT = '2099-09-11';
const DATO_EKTE = '2099-09-12';
const MARKUP_UKJENT = `[ref:Sal 1,1-6@${DØD_ID}]`;
const MARKUP_EKTE = '[ref:Jes 64,6b-65,2@dnb2024]';

async function slettLesedag(dato: string): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE r
    FROM reading_text_refs r
    JOIN reading_texts t ON t.id = r.reading_text_id
    WHERE t.date = ${dato}
  `;
  await sql`
    DELETE
    FROM reading_texts
    WHERE date = ${dato}
  `;
}

async function seedFallbackRad(dato: string, markup: string, bookId: number, chapter: number): Promise<void> {
  const sql = getSql();
  await slettLesedag(dato);
  await sql`
    INSERT INTO reading_texts
      (date, name, series, language)
    VALUES (
      ${dato}, ${'#100-vakt'}, ${'I'}, ${'nb'}
    )
  `;
  const [rad] = (await sql`
    SELECT id
    FROM reading_texts
    WHERE date = ${dato}
      AND language = ${'nb'}
  `) as unknown as { id: number }[];
  // Nøyaktig raden fallbacken skriver: hele kapittelet, ett vers, ingen slutt.
  await sql`
    INSERT INTO reading_text_refs
      (reading_text_id, slot_index, option_index, part_index, title, display_ref,
       book_id, chapter, verse_start, verse_end, part_start, part_end, sort_order)
    VALUES (
      ${rad!.id}, 0, 0, 0, ${'#100'}, ${markup},
      ${bookId}, ${chapter}, 1, ${null}, ${null}, ${null}, 0
    )
  `;
}

async function radeneFor(dato: string): Promise<{ display_ref: string; chapter: number; verse_start: number; verse_end: number | null }[]> {
  return (await getSql()`
    SELECT r.display_ref, r.chapter, r.verse_start, r.verse_end
    FROM reading_text_refs r
    JOIN reading_texts t ON t.id = r.reading_text_id
    WHERE t.date = ${dato}
    ORDER BY r.sort_order
  `) as unknown as { display_ref: string; chapter: number; verse_start: number; verse_end: number | null }[];
}

afterAll(async () => {
  await slettLesedag(DATO_UKJENT);
  await slettLesedag(DATO_EKTE);
});

describe('DEPLOYEN: én ulesbar adresse feller ikke ensureSchema()', () => {
  test('reparasjonen bærer raden videre, og retter fortsatt den ekte', async () => {
    await seedFallbackRad(DATO_UKJENT, MARKUP_UKJENT, 19, 1);
    await seedFallbackRad(DATO_EKTE, MARKUP_EKTE, 23, 63);

    // Selve saken: dette kastet ENOENT og tok hele migreringen med seg.
    const rapport = await repairWholeChapterReadingRefs(getSql());

    // Raden vi ikke kan lese står uendret — reparasjonen gjetter ikke (#61).
    expect(await radeneFor(DATO_UKJENT)).toEqual([
      { display_ref: MARKUP_UKJENT, chapter: 1, verse_start: 1, verse_end: null },
    ]);

    // …og den vi KAN lese er fortsatt rettet.
    expect(await radeneFor(DATO_EKTE)).toEqual([
      { display_ref: MARKUP_EKTE, chapter: 64, verse_start: 6, verse_end: 11 },
      { display_ref: MARKUP_EKTE, chapter: 65, verse_start: 1, verse_end: 2 },
    ]);
    expect(rapport.repaired.some((r) => r.displayRef === MARKUP_EKTE)).toBe(true);
  });

  test('RAPPORTEN navngir adressen og nummereringen — en stille skip er usynlig', async () => {
    await seedFallbackRad(DATO_UKJENT, MARKUP_UKJENT, 19, 1);

    const rapport = await repairWholeChapterReadingRefs(getSql());
    expect(readingRefRepairIsEmpty(rapport)).toBe(false);
    expect(rapport.unreadable).toContainEqual({ displayRef: MARKUP_UKJENT, system: DØD_ID });

    const tekst = formatReadingRefRepair(rapport);
    expect(tekst).toContain(MARKUP_UKJENT);
    expect(tekst).toContain(DØD_ID);
  });
});

// ── DATA ───────────────────────────────────────────────────────────────────
// Den stående invarianten: ingen lesetekst i basen er skrevet i en nummerering
// vi ikke har. Blir den rød, har free-bible døpt om eller fjernet en mapping —
// og da mister nettopp de lesningene versene sine, stille (200, ingen loggrad).

describe('DATA: hver adresse i basen navngir en nummerering vi har', () => {
  test('ingen display_ref peker på en mappingfil som ikke finnes', async () => {
    // Vaktens egne seedede rader holdes utenfor: de er defekten, ikke innhold.
    const refs = ((await getSql()`
      SELECT DISTINCT r.display_ref
      FROM reading_text_refs r
      JOIN reading_texts t ON t.id = r.reading_text_id
      WHERE t.name <> ${'#100-vakt'}
    `) as unknown as { display_ref: string }[]).map((r) => r.display_ref);
    expect(refs.length).toBeGreaterThan(0);

    const ulesbare = refs.filter((markup) => {
      // Bare de som NAVNGIR et system; boka kan være ukjent av andre grunner.
      if (!/@/.test(markup)) return false;
      return parseReadingRefMarkup(markup) === null;
    });
    expect(ulesbare).toEqual([]);
  });
});
