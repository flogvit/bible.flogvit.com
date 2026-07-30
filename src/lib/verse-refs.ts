// VERSADRESSER I IMPORTERT INNHOLD — én liste, én regel (#46).
//
// Generatoren i free-bible skriver modellens svar uten å sjekke at måladressen
// finnes. Resultatet nådde prod: 182 unike døde (bok, kapittel)-mål lenket fra
// 136 kapittelsider, servert under alle åtte språkprefikser, og en crawler som
// ga 400 404-er på én time. Verste enkelttilfelle var `Sal 119:36` skrevet som
// `Ordsp 119:36` — Ordspråkene har 31 kapitler, så både lenka OG etiketten ble
// konsekvent feil, fordi begge bygges av samme rad.
//
// Appen var uskyldig, så fiksen hører her: **feil data skal ikke kunne nå prod
// uansett hva generatoren gjør.**
//
// HVORFOR ETTER-PASS OG IKKE EN PORT PER INSERT
// ---------------------------------------------
// Femten steder i `import-bible.ts` setter inn en versadresse. Femten
// håndplasserte porter er femten steder å glemme neste gang noen legger til et
// innholdsslag. `pruneDanglingRefs()` kjører i stedet ÉN gang, over lista under,
// og kalles fra to steder:
//
//   - `ensureSchema()` (schema.ts)     — altså hver deploy, som rydder prod.
//   - slutten av `import-bible.ts`     — altså hver innholdsoppdatering.
//
// Da finnes det ikke en vei inn i basen som går utenom, og `verse-integrity.test.ts`
// feiler hvis en ny tabell med versadresse ikke står i lista.
//
// REGELEN
// -------
// STARTVERSET må finnes i `verses` — en rad uten det peker på ingenting, og
// raden slettes. SLUTTVERSET klippes til kapittelets siste vers i stedet: et
// spenn som stikker for langt («Sal 11:1-10» der Salme 11 har 7 vers) er en
// slurvete hale på en referanse som ellers er riktig, og å slette hele raden
// ville kastet innhold vi har. Samme skille for kapittelspenn.
//
// SANNHETEN ER `verses` med `bible = 'osnb'`. Referanser adresserer den
// kanoniske versifiseringen — det er den `/nb/<bok>/<kapittel>` serveres fra —
// ikke oversettelsen leseren tilfeldigvis har valgt.

import type { SQL } from 'bun';

/** Oversettelsen som definerer hvilke versadresser som finnes. */
export const CANONICAL_BIBLE = 'osnb';

/** En tabell som adresserer ett vers eller et versspenn. */
export interface VerseRefTable {
  table: string;
  book: string;
  chapter: string;
  /** Startverset. Finnes det ikke, slettes raden. */
  start: string;
  /** Sluttverset, om tabellen har spenn. Klippes til kapittelets siste vers. */
  end?: string;
}

/** En tabell som adresserer et helt kapittel. */
export interface ChapterRefTable {
  table: string;
  book: string;
  chapter: string;
  /** Sluttkapittel i et spenn. Klippes til bokas siste kapittel. */
  chapterEnd?: string;
}

/** En tabell vakta med vilje IKKE sveiper, med grunnen. */
export interface UncheckedTable {
  table: string;
  why: string;
}

export const VERSE_REF_TABLES: VerseRefTable[] = [
  // Kryssreferansene — tabellen saken handler om. Merk navnene: `to_verse_start`
  // bærer kildens `fromVerseId`, `to_verse_end` bærer `toVerseId`.
  { table: 'references_', book: 'to_book_id', chapter: 'to_chapter', start: 'to_verse_start', end: 'to_verse_end' },
  { table: 'important_verses', book: 'book_id', chapter: 'chapter', start: 'verse' },
  { table: 'verse_prayers', book: 'book_id', chapter: 'chapter', start: 'verse' },
  { table: 'verse_sermons', book: 'book_id', chapter: 'chapter', start: 'verse' },
  { table: 'timeline_references', book: 'book_id', chapter: 'chapter', start: 'verse_start', end: 'verse_end' },
  {
    table: 'prophecies',
    book: 'prophecy_book_id',
    chapter: 'prophecy_chapter',
    start: 'prophecy_verse_start',
    end: 'prophecy_verse_end',
  },
  { table: 'prophecy_fulfillments', book: 'book_id', chapter: 'chapter', start: 'verse_start', end: 'verse_end' },
  { table: 'daily_verses', book: 'book_id', chapter: 'chapter', start: 'verse_start', end: 'verse_end' },
  { table: 'gospel_parallel_passages', book: 'book_id', chapter: 'chapter', start: 'verse_start', end: 'verse_end' },
  { table: 'reading_text_refs', book: 'book_id', chapter: 'chapter', start: 'verse_start', end: 'verse_end' },
];

export const CHAPTER_REF_TABLES: ChapterRefTable[] = [
  { table: 'chapter_summaries', book: 'book_id', chapter: 'chapter' },
  { table: 'chapter_context', book: 'book_id', chapter: 'chapter' },
  { table: 'important_words', book: 'book_id', chapter: 'chapter' },
  { table: 'chapter_insights', book: 'book_id', chapter: 'chapter' },
  { table: 'timeline_book_sections', book: 'book_id', chapter: 'chapter_start', chapterEnd: 'chapter_end' },
];

export const UNCHECKED_TABLES: UncheckedTable[] = [
  { table: 'verses', why: 'ER sannheten sveipen måler mot' },
  { table: 'word4word', why: 'scopet av `bible`, ikke av den kanoniske versifiseringen — følger sin egen utgave' },
  {
    table: 'work_verse_refs',
    why: 'adresserer med KVN (bit-shiftet bok/kapittel/vers), ikke med kolonner — egen akse, se contrib-runbooken',
  },
  { table: 'user_bible_chapters', why: 'brukerdata, ikke importert innhold — eierens egne kapitler i egen utgave' },
];

export interface DanglingFinding {
  table: string;
  column: string;
  /** Antall rader med død adresse. */
  rows: number;
  /** Noen konkrete `bok:kapittel:vers` til feilmeldingen. */
  examples: string[];
}

const EXTENT = `(SELECT book_id, chapter, MAX(verse) AS mx FROM verses WHERE bible = '${CANONICAL_BIBLE}' GROUP BY book_id, chapter)`;

/** Sant når det finnes osnb-vers å måle mot. Uten dem kan ingenting valideres. */
async function hasCanonicalVerses(sql: SQL): Promise<boolean> {
  const [row] = (await sql`
    SELECT 1 AS n FROM verses WHERE bible = ${CANONICAL_BIBLE} LIMIT 1
  `) as { n: number }[];
  return row != null;
}

/**
 * Finner alle rader med en adresse som ikke finnes. Leser bare — brukes av
 * `verse-integrity.test.ts` og av rapporteringen i importen.
 */
export async function findDanglingRefs(sql: SQL): Promise<DanglingFinding[]> {
  if (!(await hasCanonicalVerses(sql))) return [];
  const findings: DanglingFinding[] = [];

  // Grupperingen hentes UTEN LIMIT og summeres her. Med `LIMIT 20` i SQL-en ble
  // totalen summen av de tjue verste adressene — 250 der sannheten var 1472 —
  // og en rapport som underdriver er verre enn ingen.
  const collect = async (table: string, column: string, query: string) => {
    const rows = (await sql.unsafe(query)) as { addr: string; n: number }[];
    if (rows.length === 0) return;
    const total = rows.reduce((s, r) => s + Number(r.n), 0);
    const examples = rows.slice(0, 5).map((r) => r.addr);
    if (rows.length > examples.length) examples.push(`… ${rows.length - examples.length} adresser til`);
    findings.push({ table, column, rows: total, examples });
  };

  for (const t of VERSE_REF_TABLES) {
    await collect(
      t.table,
      t.start,
      `SELECT CONCAT(t.${t.book}, ':', t.${t.chapter}, ':', t.${t.start}) AS addr, COUNT(*) AS n
       FROM ${t.table} t
       LEFT JOIN verses v ON v.bible = '${CANONICAL_BIBLE}' AND v.book_id = t.${t.book}
                         AND v.chapter = t.${t.chapter} AND v.verse = t.${t.start}
       WHERE v.id IS NULL
       GROUP BY 1 ORDER BY n DESC`,
    );
    if (!t.end) continue;
    // Kun rader der STARTEN er i orden — ellers ville hver slettekandidat blitt
    // rapportert to ganger, og rapporten sagt at problemet er dobbelt så stort.
    await collect(
      t.table,
      t.end,
      `SELECT CONCAT(t.${t.book}, ':', t.${t.chapter}, ':', t.${t.end}) AS addr, COUNT(*) AS n
       FROM ${t.table} t
       JOIN ${EXTENT} e ON e.book_id = t.${t.book} AND e.chapter = t.${t.chapter}
       WHERE t.${t.start} BETWEEN 1 AND e.mx AND t.${t.end} IS NOT NULL AND t.${t.end} > e.mx
       GROUP BY 1 ORDER BY n DESC`,
    );
  }

  for (const t of CHAPTER_REF_TABLES) {
    await collect(
      t.table,
      t.chapter,
      `SELECT CONCAT(t.${t.book}, ':', t.${t.chapter}) AS addr, COUNT(*) AS n
       FROM ${t.table} t
       LEFT JOIN ${EXTENT} e ON e.book_id = t.${t.book} AND e.chapter = t.${t.chapter}
       WHERE e.book_id IS NULL
       GROUP BY 1 ORDER BY n DESC`,
    );
    if (!t.chapterEnd) continue;
    await collect(
      t.table,
      t.chapterEnd,
      `SELECT CONCAT(t.${t.book}, ':', t.${t.chapterEnd}) AS addr, COUNT(*) AS n
       FROM ${t.table} t
       JOIN (SELECT book_id, MAX(chapter) AS mx FROM verses WHERE bible = '${CANONICAL_BIBLE}' GROUP BY book_id) b
         ON b.book_id = t.${t.book}
       WHERE t.${t.chapter} BETWEEN 1 AND b.mx AND t.${t.chapterEnd} IS NOT NULL AND t.${t.chapterEnd} > b.mx
       GROUP BY 1 ORDER BY n DESC`,
    );
  }

  return findings;
}

export interface PruneReport {
  /** `tabell` → antall slettede rader (bare tabeller der noe ble slettet). */
  deleted: Record<string, number>;
  /** `tabell.kolonne` → antall klippede spenn. */
  clamped: Record<string, number>;
  /** Sant når basen manglet osnb-vers og ingenting kunne valideres. */
  skipped: boolean;
}

export function pruneReportIsEmpty(r: PruneReport): boolean {
  return Object.keys(r.deleted).length === 0 && Object.keys(r.clamped).length === 0;
}

export function formatPruneReport(r: PruneReport): string {
  if (r.skipped) return 'Versadresser: ingen osnb-vers i basen — hoppet over.';
  if (pruneReportIsEmpty(r)) return 'Versadresser: ingen døde adresser.';
  const lines: string[] = [];
  for (const [table, n] of Object.entries(r.deleted)) lines.push(`  slettet ${n} rad(er) i ${table} med død adresse`);
  for (const [col, n] of Object.entries(r.clamped)) lines.push(`  klippet ${n} spenn i ${col} til siste vers/kapittel`);
  return `Versadresser ryddet:\n${lines.join('\n')}`;
}

/**
 * Sletter rader med død adresse og klipper spenn som stikker forbi slutten.
 * Idempotent — andre kjøring rapporterer null.
 */
export async function pruneDanglingRefs(sql: SQL): Promise<PruneReport> {
  const report: PruneReport = { deleted: {}, clamped: {}, skipped: false };
  if (!(await hasCanonicalVerses(sql))) {
    report.skipped = true;
    return report;
  }

  const run = async (query: string): Promise<number> => {
    const res = (await sql.unsafe(query)) as unknown as { affectedRows?: number };
    return Number(res?.affectedRows ?? 0);
  };
  const note = (bucket: Record<string, number>, key: string, n: number) => {
    if (n > 0) bucket[key] = (bucket[key] ?? 0) + n;
  };

  for (const t of VERSE_REF_TABLES) {
    // Startverset finnes ikke → adressen peker på ingenting.
    note(
      report.deleted,
      t.table,
      await run(
        `DELETE t FROM ${t.table} t
         LEFT JOIN verses v ON v.bible = '${CANONICAL_BIBLE}' AND v.book_id = t.${t.book}
                           AND v.chapter = t.${t.chapter} AND v.verse = t.${t.start}
         WHERE v.id IS NULL`,
      ),
    );
    if (!t.end) continue;
    // Klipp FØR spennet snus: en rad kan ha både for høy slutt og slutt < start.
    note(
      report.clamped,
      `${t.table}.${t.end}`,
      await run(
        `UPDATE ${t.table} t
         JOIN ${EXTENT} e ON e.book_id = t.${t.book} AND e.chapter = t.${t.chapter}
         SET t.${t.end} = e.mx
         WHERE t.${t.end} IS NOT NULL AND t.${t.end} > e.mx`,
      ),
    );
    note(
      report.clamped,
      `${t.table}.${t.end}`,
      await run(`UPDATE ${t.table} SET ${t.end} = ${t.start} WHERE ${t.end} IS NOT NULL AND ${t.end} < ${t.start}`),
    );
  }

  for (const t of CHAPTER_REF_TABLES) {
    note(
      report.deleted,
      t.table,
      await run(
        `DELETE t FROM ${t.table} t
         LEFT JOIN ${EXTENT} e ON e.book_id = t.${t.book} AND e.chapter = t.${t.chapter}
         WHERE e.book_id IS NULL`,
      ),
    );
    if (!t.chapterEnd) continue;
    note(
      report.clamped,
      `${t.table}.${t.chapterEnd}`,
      await run(
        `UPDATE ${t.table} t
         JOIN (SELECT book_id, MAX(chapter) AS mx FROM verses WHERE bible = '${CANONICAL_BIBLE}' GROUP BY book_id) b
           ON b.book_id = t.${t.book}
         SET t.${t.chapterEnd} = b.mx
         WHERE t.${t.chapterEnd} IS NOT NULL AND t.${t.chapterEnd} > b.mx`,
      ),
    );
    note(
      report.clamped,
      `${t.table}.${t.chapterEnd}`,
      await run(
        `UPDATE ${t.table} SET ${t.chapterEnd} = ${t.chapter} WHERE ${t.chapterEnd} IS NOT NULL AND ${t.chapterEnd} < ${t.chapter}`,
      ),
    );
  }

  return report;
}
