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
// Lista over innholdstabeller med en JSON-blob har ÉN eier (#61), og den er
// fullstendighets-sikret av `person-refs.test.ts`: en ny tabell med en blob må
// enten stå der eller unntas med en begrunnelse. Å føre opp de samme sju her
// ville vært et andre sted å glemme neste tabell.
import { CONTENT_SOURCES } from './person-refs.ts';

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

// ===========================================================================
// SAMME KLASSE, ANNEN LAGRING: versadressen ligger i en JSON-BLOB
// ===========================================================================
//
// Sveipen over leser KOLONNER, og vaktas FORM-halvdel leter etter `book_id` +
// `chapter` i DDL-en. Seks innholdstabeller har ingen slik kolonne — de bærer
// adressen inne i en JSON-blob — så de har aldri vært med, og løftet om at
// «skjemaet ikke kan vokse fra vakta i stillhet» gjaldt bare halve lagringen.
//
// Målt i basen da dette ble skrevet: 282 døde adresser, 276 i `persons` og 6 i
// `stories`. Utslaget er todelt, og begge sidene er verifisert i prod:
//
//   - `persons.references[]` bygger en `<a href>` DIREKTE, uten å slå opp om
//     verset finnes (`persons.tsx`). En død adresse der er #46 om igjen,
//     ordrett — 404 fra en helt vanlig lesesside. Den er tom i dag, men
//     ingenting fanget den om den ble det.
//   - Resten går gjennom `getVersesWithOriginal()`, som `continue`-r på et vers
//     som ikke finnes. Da faller innholdet BORT i stillhet: 128 nøkkelhendelser
//     rendres som overskrift og beskrivelse uten ett eneste vers
//     (`/nb/personer/epainetos` — fire hendelser, null vers), og
//     `/nb/historier/susanna-frikjennes-av-daniel` er en `<h2>Daniel 13,1-64</h2>`
//     over ingenting, fordi osnb følger den protestantiske kanon med 12
//     kapitler i Daniel.
//
// At den STILLE varianten er den vanligste, er nettopp derfor den trengte en
// vakt: en side som mangler innhold svarer 200 og skriver ingen loggrad. Samme
// lærdom som #61 — en adresse som bor i en blob er usynlig for en vakt som er
// formulert på kolonner.
//
// REGELEN ER DEN SAMME: start slettes, slutt klippes.
// Et dødt STARTVERS (eller en bok/et kapittel vi ikke har) feller adressen —
// den peker på ingenting. Et SLUTTVERS eller SLUTTKAPITTEL forbi slutten
// klippes i stedet, og døde vers i en `verses`-liste filtreres bort mens de
// levende blir. Adressen er alltid et element i en liste, så «feller» betyr at
// elementet forsvinner; raden og alt annet i den bæres uendret videre.
//
// Merk `days.references[]`, som bærer sin egen `reason`-prosa ved siden av
// adressen. Faller adressen, faller begrunnelsen med — den er skrevet OM det
// versområdet, og appen rendrer allerede ingenting for det. Ingen døde i dag.

/** Nøklene en versadresse i en JSON-blob kan være bygget av. */
export interface AddressKeyVocabulary {
  book: readonly string[];
  chapter: readonly string[];
  chapterEnd: readonly string[];
  verseStart: readonly string[];
  verseList: readonly string[];
  verseEnd: readonly string[];
}

/**
 * Målt ut av innholdet, ikke gjettet: sju objektformer i de sju blob-tabellene
 * bruker til sammen disse nøklene. Vakta finner en udeklarert tall-nøkkel på et
 * adresseobjekt av seg selv, så lista kan ikke bli stale i stillhet.
 */
export const JSON_ADDRESS_KEYS: AddressKeyVocabulary = {
  book: ['bookId'],
  chapter: ['chapter', 'chapterId', 'startChapter'],
  chapterEnd: ['endChapter'],
  verseStart: ['verse', 'verseId', 'fromVerseId', 'startVerse'],
  verseList: ['verses'],
  verseEnd: ['toVerseId', 'endVerse'],
};

export function allAddressKeys(): string[] {
  return Object.values(JSON_ADDRESS_KEYS).flat();
}

/** En tall-nøkkel som sitter på et adresseobjekt uten å være del av adressen. */
export interface ExemptAddressKey {
  key: string;
  why: string;
}

/**
 * Tom i dag, og det er meningen. Som `NORDIC_PROPER` og `PROPER_CRUMBS` er hver
 * oppføring her en PÅSTAND om at nøkkelen ikke adresserer noe — ikke et sted å
 * gjemme en adresse ingen har rukket å sveipe.
 */
export const EXEMPT_ADDRESS_KEYS: ExemptAddressKey[] = [];

/** Hvor langt den kanoniske versifiseringen rekker. */
export interface VerseExtent {
  /** Siste vers i kapittelet, eller `null` når boka/kapittelet ikke finnes. */
  maxVerse(bookId: number, chapter: number): number | null;
  /** Siste kapittel i boka, eller `null` når boka ikke finnes. */
  maxChapter(bookId: number): number | null;
}

export function verseExtentFrom(rows: { book_id: number; chapter: number; mx: number }[]): VerseExtent {
  const verses = new Map<string, number>();
  const chapters = new Map<number, number>();
  for (const row of rows) {
    const book = Number(row.book_id);
    const chapter = Number(row.chapter);
    verses.set(`${book}:${chapter}`, Number(row.mx));
    chapters.set(book, Math.max(chapters.get(book) ?? 0, chapter));
  }
  return {
    maxVerse: (bookId, chapter) => verses.get(`${bookId}:${chapter}`) ?? null,
    maxChapter: (bookId) => chapters.get(bookId) ?? null,
  };
}

/** Leser den kanoniske utstrekningen. `null` når basen ikke har osnb-vers. */
export async function loadVerseExtent(sql: SQL): Promise<VerseExtent | null> {
  const rows = (await sql`
    SELECT book_id, chapter, MAX(verse) AS mx FROM verses WHERE bible = ${CANONICAL_BIBLE}
    GROUP BY book_id, chapter
  `) as { book_id: number; chapter: number; mx: number }[];
  return rows.length === 0 ? null : verseExtentFrom(rows);
}

/** Hva som skjedde med en adresse. */
export type AddressFix = 'fjernet' | 'klippet';

const firstNumberKey = (obj: Record<string, unknown>, keys: readonly string[]): string | null => {
  for (const key of keys) if (typeof obj[key] === 'number') return key;
  return null;
};

/**
 * Går gjennom JSON-en og rydder hver versadresse som ikke holder.
 *
 * Returnerer `null` når ingenting ble endret, slik at kalleren slipper å skrive
 * tilbake en rad som er lik.
 */
export function stripDanglingJsonVerseRefs(
  content: unknown,
  extent: VerseExtent,
  onChanged: (key: string, address: string, fix: AddressFix) => void,
): unknown | null {
  let changed = false;

  /** `null` = adressen faller. Ellers objektet, ryddet. */
  const evaluate = (obj: Record<string, unknown>): Record<string, unknown> | null => {
    const bookKey = firstNumberKey(obj, JSON_ADDRESS_KEYS.book);
    const chapterKey = firstNumberKey(obj, JSON_ADDRESS_KEYS.chapter);
    if (!bookKey || !chapterKey) return obj;

    const book = obj[bookKey] as number;
    const chapter = obj[chapterKey] as number;
    const addr = `${book}:${chapter}`;

    // Boka eller kapittelet finnes ikke — adressen peker på ingenting.
    const maxVerse = extent.maxVerse(book, chapter);
    if (maxVerse === null) {
      onChanged(chapterKey, addr, 'fjernet');
      changed = true;
      return null;
    }

    const next: Record<string, unknown> = { ...obj };

    // Et dødt STARTVERS feller adressen på samme måte.
    for (const key of JSON_ADDRESS_KEYS.verseStart) {
      const value = next[key];
      if (typeof value !== 'number') continue;
      if (value < 1 || value > maxVerse) {
        onChanged(key, `${addr}:${value}`, 'fjernet');
        changed = true;
        return null;
      }
    }

    // Døde vers i en liste filtreres bort; de levende blir. Tømmes lista helt,
    // er det ingenting igjen å peke på.
    for (const key of JSON_ADDRESS_KEYS.verseList) {
      const value = next[key];
      if (!Array.isArray(value)) continue;
      const numbers = value.filter((v): v is number => typeof v === 'number');
      if (numbers.length === 0) continue;
      const alive = numbers.filter((v) => v >= 1 && v <= maxVerse);
      if (alive.length === numbers.length) continue;
      for (const dead of numbers.filter((v) => v < 1 || v > maxVerse)) {
        onChanged(key, `${addr}:${dead}`, alive.length === 0 ? 'fjernet' : 'klippet');
      }
      changed = true;
      if (alive.length === 0) return null;
      next[key] = alive;
    }

    // SLUTTEN klippes framfor å felle raden.
    let endChapter = chapter;
    for (const key of JSON_ADDRESS_KEYS.chapterEnd) {
      const value = next[key];
      if (typeof value !== 'number') continue;
      const maxChapter = extent.maxChapter(book) ?? chapter;
      const clamped = Math.min(Math.max(value, chapter), maxChapter);
      if (clamped !== value) {
        onChanged(key, `${addr}-${value}`, 'klippet');
        changed = true;
        next[key] = clamped;
      }
      endChapter = clamped;
    }

    const endBound = extent.maxVerse(book, endChapter) ?? maxVerse;
    for (const key of JSON_ADDRESS_KEYS.verseEnd) {
      const value = next[key];
      if (typeof value !== 'number') continue;
      // Gulvet er startverset i SAMME kapittel; over et kapittelspenn gir det
      // ingen mening å klippe slutten opp til en start i et tidligere kapittel.
      const floor = endChapter === chapter ? (firstNumberKey(next, JSON_ADDRESS_KEYS.verseStart) ?? '') : '';
      const start = floor ? (next[floor] as number) : 1;
      const clamped = Math.min(Math.max(value, start), endBound);
      if (clamped !== value) {
        onChanged(key, `${addr}:${value}`, 'klippet');
        changed = true;
        next[key] = clamped;
      }
    }

    return next;
  };

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      for (const item of node) {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const kept = evaluate(item as Record<string, unknown>);
          // Adressen falt — elementet forsvinner ut av lista.
          if (kept === null) continue;
          out.push(walk(kept));
          continue;
        }
        out.push(walk(item));
      }
      return out;
    }
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = walk(value);
      return out;
    }
    return node;
  };

  const next = walk(content);
  return changed ? next : null;
}

/** En død versadresse i en JSON-blob, slik den rapporteres. */
export interface DanglingJsonRef {
  table: string;
  key: string;
  address: string;
  fix: AddressFix;
  languages: string[];
  hits: number;
}

function collector(table: string) {
  const found = new Map<string, DanglingJsonRef>();
  return {
    add(key: string, address: string, fix: AddressFix, language: string) {
      const mapKey = `${key} ${address} ${fix}`;
      const entry = found.get(mapKey);
      if (entry) {
        entry.hits++;
        if (!entry.languages.includes(language)) entry.languages.push(language);
        return;
      }
      found.set(mapKey, { table, key, address, fix, languages: [language], hits: 1 });
    },
    values: () => [...found.values()].sort((a, b) => b.hits - a.hits),
  };
}

/** Leser bare. Brukes av vakta og av importens rapport. */
export async function findDanglingJsonVerseRefs(sql: SQL): Promise<DanglingJsonRef[]> {
  const extent = await loadVerseExtent(sql);
  if (!extent) return [];
  const findings: DanglingJsonRef[] = [];
  for (const source of CONTENT_SOURCES) {
    const rows = (await sql.unsafe(`SELECT ${source.column} AS content, language FROM ${source.table}`)) as {
      content: string;
      language: string;
    }[];
    const found = collector(source.table);
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.content);
      } catch {
        continue;
      }
      stripDanglingJsonVerseRefs(parsed, extent, (key, address, fix) => found.add(key, address, fix, row.language));
    }
    findings.push(...found.values());
  }
  return findings;
}

export interface JsonPruneReport {
  removed: DanglingJsonRef[];
  /** Antall rader som ble skrevet tilbake. */
  rows: number;
  /** Sant når basen manglet osnb-vers og ingenting kunne valideres. */
  skipped: boolean;
}

export function jsonPruneReportIsEmpty(r: JsonPruneReport): boolean {
  return r.removed.length === 0;
}

export function formatJsonPruneReport(r: JsonPruneReport): string {
  if (r.skipped) return 'Versadresser i JSON: ingen osnb-vers i basen — hoppet over.';
  if (jsonPruneReportIsEmpty(r)) return 'Versadresser i JSON: ingen døde adresser.';
  const lines = r.removed.map(
    (f) => `  ${f.table}.${f.key}: ${f.fix} ${f.hits} adresse(r) ${f.address} (${f.languages.join(', ')})`,
  );
  return `Versadresser i JSON ryddet i ${r.rows} rad(er):\n${lines.join('\n')}`;
}

/**
 * Rydder døde versadresser i hver innholdstabell med en JSON-blob.
 * Idempotent — andre kjøring rapporterer null.
 */
export async function pruneDanglingJsonVerseRefs(sql: SQL): Promise<JsonPruneReport> {
  const report: JsonPruneReport = { removed: [], rows: 0, skipped: false };
  const extent = await loadVerseExtent(sql);
  if (!extent) {
    report.skipped = true;
    return report;
  }

  for (const source of CONTENT_SOURCES) {
    const rows = (await sql.unsafe(
      `SELECT id, language, ${source.column} AS content FROM ${source.table}`,
    )) as { id: string | number; language: string; content: string }[];
    const found = collector(source.table);

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.content);
      } catch {
        continue;
      }
      const next = stripDanglingJsonVerseRefs(parsed, extent, (key, address, fix) =>
        found.add(key, address, fix, row.language),
      );
      if (next === null) continue;
      await sql.unsafe(`UPDATE ${source.table} SET ${source.column} = ? WHERE id = ? AND language = ?`, [
        JSON.stringify(next),
        row.id,
        row.language,
      ]);
      report.rows++;
    }
    report.removed.push(...found.values());
  }

  report.removed.sort((a, b) => b.hits - a.hits);
  return report;
}
