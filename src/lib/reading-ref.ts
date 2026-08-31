// Lesetekstenes referanser: markup → versadresser i osmain-koordinater (#92).
//
// Kilden er DNKs tekstrekker, der én lesning er ett `[ref:Bok kap,vers@system]`.
// Adressen står i utgavens EGEN nummerering (`@dnb2024`), mens vi lagrer og
// serverer osmain — så oversettelsen mellom de to hører i ett ledd, ikke i hvert
// kallsted.
//
// Den lå i `scripts/import-bible.ts`, som EKSEKVERER og derfor ikke kan
// importeres av en test — samme grunn som `content-sources.ts` (#58). Og den
// hadde en blindsone: en lesning som KRYSSER et kapittelskille
// («Jes 64,6b-65,2») endte i `endMatch === null`, altså null adresser, og
// fallbacken «ingen versspesifikasjon = hele kapittelet» satte inn ETT vers —
// vers 1 av kapittelet startverset havnet i. Leseren fikk da Jes 63,1 («Hvem er
// dette som kommer fra Edom») der teksten skulle vært Jes 64,6b-65,2. Utslaget
// er stille: sida svarer 200, blokka er full av tekst, og bare den som slår opp
// i tekstrekka ser at det er feil tekst. 11 lesedager sto slik, blant dem hele
// lidelsesfortellingen langfredag (Matt 26,30-27,50, Mark 14,26-15,37,
// Joh 18,1-19,42).
//
// REGELEN har to former, og det er ikke pynt. Holder lesningen seg innenfor ett
// kapittel, oversettes den VERS FOR VERS som før: mappingen kan flytte
// enkeltvers ulikt inne i et kapittel, og en utgave som bare oversatte ENDENE
// ga et annet svar for 4 av de 626 lesningene — blant dem Rom 9,20-24, som
// krympet fra fem vers til ett. Krysser lesningen et
// kapittelskille, KAN den ikke telles vers for vers — vi vet ikke hvor kildens
// kapittel slutter, bare vårt eget — så da oversettes ENDENE og spennet fylles
// ut mot `verse-counts.ts`, altså den KANONISKE versifiseringen (`verses` med
// `bible = 'osnb'`, #46) som `pruneDanglingRefs()` alt klipper mot.

import type { SQL } from 'bun';
import { UkvnMapper, loadUkvnMapping, listUkvnMappings, ukvnEncode, ukvnDecode, resolveMappingId } from '@free-bible/kvn';
import { BOOK_IDS } from '@free-bible/kvn/types';
import { getChapterVerseCount } from './verse-counts.ts';
import { registrerMinnekilde } from './minne-regnskap.ts';

/** Én rad i `reading_text_refs` — osmain-koordinater. */
export interface ReadingRefRow {
  chapter: number;
  verseStart: number;
  /** `null` = hele kapittelet (referansen hadde ingen versspesifikasjon). */
  verseEnd: number | null;
  partStart: string | null;
  partEnd: string | null;
}

export interface ParsedReadingRef {
  bookId: number;
  /** Mapping-id-en adressen er skrevet i, oppløst (`dnb2024` → `dnb2024_nb`). */
  mappingId: string;
  rows: ReadingRefRow[];
}

/**
 * Har vi en mappingfil for denne id-en? (#100)
 *
 * `loadUkvnMapping()` gjør `readFileSync` uten fallback, så en id vi ikke har
 * blir et ubehandlet ENOENT-kast midt i parsingen. Systemnavnet kommer fra
 * KILDEN — `@dnb2024` i markupen — og kildens id-er endrer seg: free-bible
 * omdøpte `osnb2`→`osnb` 2026-07-26, og det er nettopp den omdøpingen som
 * feller hvert kall på `bibel.flogvit.no` i dag.
 *
 * Kastet er dyrest i `repairWholeChapterReadingRefs()`, som kjøres fra
 * `ensureSchema()` ved HVER deploy (#92): én slik rad feller `init-db`, og da
 * står hele appen uten utrulling til noen finner den.
 *
 * Katalogen leses ÉN gang (1158 filnavn, 1,5 ms målt) — ikke filene, bare
 * navnene, så dette er ikke `getAvailableMappings()`-fella fra #19.
 */
let mappingIdsOnDisk: Set<string> | null = null;
function haveMappingFile(mappingId: string): boolean {
  mappingIdsOnDisk ??= new Set(listUkvnMappings());
  return mappingIdsOnDisk.has(mappingId);
}

/**
 * Nummereringen adressen er skrevet i, NÅR det er den vi mangler.
 *
 * `parseReadingRefMarkup()` gir null av flere grunner (ukjent bok, markup som
 * ikke lar seg lese), og en rapport som ikke skiller dem sier ikke hva som må
 * rettes. Returnerer systemnavnet slik KILDEN skrev det, så meldingen kan
 * navngi det free-bible må rette.
 */
export function unknownMappingSystem(markup: string): string | null {
  const m = markup.trim().match(/^\[ref:([^\]]+)\]$/);
  if (!m) return null;
  const refPart = m[1]!.split('|')[0]!.trim();
  const atIdx = refPart.lastIndexOf('@');
  if (atIdx === -1) return null;
  const system = refPart.slice(atIdx + 1).trim();
  return haveMappingFile(resolveMappingId(system) || system) ? null : system;
}

const mappers = new Map<string, UkvnMapper>();
registrerMinnekilde('reading-ref/mappers', () => ({ oppforinger: mappers.size }));
// Katalogen, ikke filene: 1158 filnavn lest én gang. Den er med fordi et
// regnskap som bare viser de dyre postene ikke kan brukes til å utelukke noe.
registrerMinnekilde('reading-ref/mappingIdsOnDisk', () => ({ oppforinger: mappingIdsOnDisk?.size ?? 0 }));
function mapper(mappingId: string): UkvnMapper {
  let m = mappers.get(mappingId);
  if (!m) {
    m = new UkvnMapper(loadUkvnMapping(mappingId));
    mappers.set(mappingId, m);
  }
  return m;
}

/** Ett vers fra utgavens egen nummerering til osmain. */
function toOsmain(bookId: number, chapter: number, verse: number, mappingId: string): { chapter: number; verse: number } {
  const decoded = ukvnDecode(mapper(mappingId).toKvn(ukvnEncode(bookId, chapter, verse)));
  return { chapter: decoded.chapter, verse: decoded.verse };
}

/** Ett endepunkt i en versspesifikasjon: «6», «6b», «65:2», «65:2a». */
const ENDPOINT = /^(?:(\d+):)?(\d+)([a-c])?$/;

interface SpecRange {
  startChapter: number;
  start: number;
  endChapter: number;
  end: number;
  partStart: string | null;
  partEnd: string | null;
}

/**
 * Versspesifikasjon → spenn, i utgavens EGEN nummerering.
 *
 * Punktum skiller usammenhengende spenn («13-15a.17-18»); bindestrek skiller
 * endene. Et endepunkt kan bære sitt eget kapittel etter at kommanotasjonen er
 * normalisert til kolon («6b-65:2»), og det er nettopp den formen som falt ut
 * før. Uten eget kapittel arver slutten startens.
 */
export function parseVerseSpec(spec: string, baseChapter: number): SpecRange[] {
  if (!spec) return [];
  const out: SpecRange[] = [];
  for (const part of spec.replace(/[–—]/g, '-').split('.')) {
    const dashIdx = part.indexOf('-');
    const startMatch = (dashIdx === -1 ? part : part.slice(0, dashIdx)).match(ENDPOINT);
    if (!startMatch) continue;
    const startChapter = startMatch[1] ? parseInt(startMatch[1], 10) : baseChapter;
    const start = parseInt(startMatch[2]!, 10);
    if (dashIdx === -1) {
      out.push({ startChapter, start, endChapter: startChapter, end: start, partStart: startMatch[3] || null, partEnd: startMatch[3] || null });
      continue;
    }
    const endMatch = part.slice(dashIdx + 1).match(ENDPOINT);
    if (!endMatch) continue;
    out.push({
      startChapter,
      start,
      endChapter: endMatch[1] ? parseInt(endMatch[1], 10) : startChapter,
      end: parseInt(endMatch[2]!, 10),
      partStart: startMatch[3] || null,
      partEnd: endMatch[3] || null,
    });
  }
  return out;
}

/**
 * Ett spenn innenfor ETT kildekapittel — hvert vers oversettes for seg.
 *
 * Uendret fra importen: en mapping kan flytte enkeltvers ulikt inne i et
 * kapittel (og kan flytte dem ut i nabokapittelet, som amharic2000 gjør med
 * Sal 51), så radene grupperes etter hvor versene FAKTISK havnet.
 */
function versewiseRows(bookId: number, range: SpecRange, mappingId: string): ReadingRefRow[] {
  const mapped: { chapter: number; verse: number }[] = [];
  for (let v = range.start; v <= range.end; v++) mapped.push(toOsmain(bookId, range.startChapter, v, mappingId));

  const rows: ReadingRefRow[] = [];
  let current: ReadingRefRow | null = null;
  for (const mv of mapped) {
    if (!current || mv.chapter !== current.chapter || mv.verse !== (current.verseEnd as number) + 1) {
      if (current) rows.push(current);
      current = { chapter: mv.chapter, verseStart: mv.verse, verseEnd: mv.verse, partStart: null, partEnd: null };
    } else {
      current.verseEnd = mv.verse;
    }
  }
  if (current) rows.push(current);
  if (rows.length > 0) {
    rows[0]!.partStart = range.partStart;
    rows[rows.length - 1]!.partEnd = range.partEnd;
  }
  return rows;
}

/** Et spenn som KRYSSER et kapittelskille — endene oversettes, resten fylles ut. */
function crossChapterRows(bookId: number, range: SpecRange, mappingId: string): ReadingRefRow[] {
  const from = toOsmain(bookId, range.startChapter, range.start, mappingId);
  let to = toOsmain(bookId, range.endChapter, range.end, mappingId);
  // En slutt som havner FØR starten er en adresse vi ikke kan tolke; da bærer
  // startverset alene framfor at spennet blir tomt eller går baklengs.
  if (to.chapter < from.chapter || (to.chapter === from.chapter && to.verse < from.verse)) to = from;

  const rows: ReadingRefRow[] = [];
  for (let chapter = from.chapter; chapter <= to.chapter; chapter++) {
    const verseStart = chapter === from.chapter ? from.verse : 1;
    // Mellomliggende kapitler leses ut til slutten sin — kapittellengden er
    // den kanoniske versifiseringen, ikke et tall i kilden.
    const verseEnd = chapter === to.chapter ? to.verse : getChapterVerseCount(bookId, chapter);
    if (verseEnd < verseStart) continue;
    rows.push({
      chapter,
      verseStart,
      verseEnd,
      partStart: chapter === from.chapter ? range.partStart : null,
      partEnd: chapter === to.chapter ? range.partEnd : null,
    });
  }
  return rows;
}

/**
 * `[ref:Jes 64,6b-65,2@dnb2024]` → boka og radene, i osmain.
 *
 * Returnerer `null` når boka er ukjent eller markupen ikke lar seg lese — en
 * gjettet adresse er verre enn ingen (#61).
 */
export function parseReadingRefMarkup(markup: string): ParsedReadingRef | null {
  const m = markup.trim().match(/^\[ref:([^\]]+)\]$/);
  if (!m) return null;
  // Visningsteksten etter `|` er ikke en del av adressen.
  let refPart = m[1]!.split('|')[0]!.trim();

  let system: string | undefined;
  const atIdx = refPart.lastIndexOf('@');
  if (atIdx !== -1) {
    system = refPart.slice(atIdx + 1).trim();
    refPart = refPart.slice(0, atIdx).trim();
  }
  // KVN skriver kapittel,vers med komma. Hvert komma normaliseres, ikke bare
  // det første: en kryssende adresse har ett i hver ende («64,6b-65,2»).
  refPart = refPart.replace(/(\d+),(\d)/g, '$1:$2');

  const bookMatch = refPart.match(/^(.+?)\s+(\d.*)$/);
  if (!bookMatch) return null;
  const bookId = BOOK_IDS[bookMatch[1]!.trim()];
  if (bookId === undefined) return null;

  const chapterVerse = bookMatch[2]!.trim();
  const colonIdx = chapterVerse.indexOf(':');
  const chapter = parseInt(colonIdx === -1 ? chapterVerse : chapterVerse.slice(0, colonIdx), 10);
  if (isNaN(chapter)) return null;
  const spec = colonIdx === -1 ? '' : chapterVerse.slice(colonIdx + 1).trim();

  const mappingId = system ? (resolveMappingId(system) || system) : 'osnb';
  // En nummerering vi ikke har en fil for er en markup vi ikke kan lese: hvert
  // vers måtte oversettes gjennom nettopp den mappingen, så alternativet til
  // null er å gjette (#61) — eller, slik det sto, å kaste ENOENT (#100).
  if (!haveMappingFile(mappingId)) return null;
  const ranges = parseVerseSpec(spec, chapter);

  if (ranges.length === 0) {
    // Hele kapittelet: bare kapittelnummeret oversettes, og raden bærer ingen
    // slutt. Den grenen gjaldt tidligere OGSÅ en kryssende adresse, og det var
    // hele feilen — nå kommer man bare hit når kilden virkelig ikke oppga vers.
    const os = toOsmain(bookId, chapter, 1, mappingId);
    return { bookId, mappingId, rows: [{ chapter: os.chapter, verseStart: 1, verseEnd: null, partStart: null, partEnd: null }] };
  }

  const rows = ranges.flatMap((r) =>
    r.endChapter === r.startChapter ? versewiseRows(bookId, r, mappingId) : crossChapterRows(bookId, r, mappingId),
  );
  return { bookId, mappingId, rows };
}

// ── Reparasjon av rader som alt ligger i basen ──────────────────────────────
//
// En fiks i importen når ikke leseren: `reading_texts` importeres bare når
// kildefilene endrer seg, og tekstrekkene ligger fast i årevis. De 11 radene
// ville altså blitt stående med feil tekst på ubestemt tid. Reparasjonen kjøres
// derfor fra `ensureSchema()`, altså ved HVER deploy — samme plassering som
// ryddingen i #46 og #61, og av samme grunn.
//
// Den er SMAL med vilje: bare rader som bærer fallbacken «hele kapittelet»
// (`verse_end IS NULL`) mens adressen deres NAVNGIR vers. Det er nøyaktig
// defekten, og den kan ikke røre en rad som står riktig. En bredere regel —
// «skriv om alt som ikke stemmer med dagens mapping» — ville i tillegg flyttet
// seks lesninger som er importert med en eldre mappingfil, og det er et annet
// spørsmål enn dette.

export interface ReadingRefRepairReport {
  /** Én oppføring per rad som ble skrevet om, med hva den ble til. */
  repaired: { displayRef: string; rows: number }[];
  /**
   * Rader vi lot stå fordi adressen er skrevet i en nummerering vi ikke har
   * (#100). En stille skip her ser ut som «ingenting å rette», og da er
   * omdøpingen i kilden usynlig helt til lesningen står uten vers — samme
   * regel som «importen rapporterer alltid det den kaster» (#46).
   */
  unreadable: { displayRef: string; system: string }[];
}

export function readingRefRepairIsEmpty(report: ReadingRefRepairReport): boolean {
  return report.repaired.length === 0 && report.unreadable.length === 0;
}

export function formatReadingRefRepair(report: ReadingRefRepairReport): string {
  const deler: string[] = [];
  if (report.repaired.length > 0) {
    deler.push(
      `Rettet ${report.repaired.length} lesetekst-referanse(r) som sto som «hele kapittelet» (#92):`,
      ...report.repaired.map((r) => `  ${r.displayRef} → ${r.rows} versspenn`),
    );
  }
  if (report.unreadable.length > 0) {
    deler.push(
      `${report.unreadable.length} lesetekst-referanse(r) står i en nummerering vi ikke har (#100) — lesningen viser ingen vers:`,
      ...report.unreadable.map((r) => `  ${r.displayRef} → ukjent system «${r.system}»`),
      '  Mappingen er trolig omdøpt eller fjernet i free-bible; adressen må rettes der.',
    );
  }
  return deler.join('\n');
}

interface FallbackRow {
  reading_text_id: number;
  slot_index: number;
  option_index: number;
  part_index: number;
  title: string | null;
  display_ref: string;
  sort_order: number;
}

export async function repairWholeChapterReadingRefs(sql: SQL): Promise<ReadingRefRepairReport> {
  const report: ReadingRefRepairReport = { repaired: [], unreadable: [] };

  const rows = (await sql`
    SELECT reading_text_id, slot_index, option_index, part_index, title, display_ref, sort_order
    FROM reading_text_refs WHERE verse_end IS NULL
  `) as unknown as FallbackRow[];

  for (const row of rows) {
    const parsed = parseReadingRefMarkup(row.display_ref);
    // Ingen adresse å lese, eller adressen NAVNGIR virkelig et helt kapittel:
    // raden står som den skal, og reparasjonen gjetter ikke.
    if (!parsed || parsed.rows.length === 0) {
      // …men er grunnen at nummereringen er borte fra kilden, er det ikke en
      // rad som «står som den skal» — den er et hull ingen ser (#100).
      const system = unknownMappingSystem(row.display_ref);
      if (system && !report.unreadable.some((u) => u.displayRef === row.display_ref)) {
        report.unreadable.push({ displayRef: row.display_ref, system });
      }
      continue;
    }
    if (parsed.rows.length === 1 && parsed.rows[0]!.verseEnd === null) continue;

    await sql`
      DELETE FROM reading_text_refs
      WHERE reading_text_id = ${row.reading_text_id} AND slot_index = ${row.slot_index}
        AND option_index = ${row.option_index} AND part_index = ${row.part_index}
        AND display_ref = ${row.display_ref}
    `;
    for (let i = 0; i < parsed.rows.length; i++) {
      const r = parsed.rows[i]!;
      await sql`
        INSERT INTO reading_text_refs (reading_text_id, slot_index, option_index, part_index, title, display_ref, book_id, chapter, verse_start, verse_end, part_start, part_end, sort_order)
        VALUES (${row.reading_text_id}, ${row.slot_index}, ${row.option_index}, ${row.part_index}, ${row.title}, ${row.display_ref}, ${parsed.bookId}, ${r.chapter}, ${r.verseStart}, ${r.verseEnd}, ${r.partStart}, ${r.partEnd}, ${row.sort_order + i})
      `;
    }
    report.repaired.push({ displayRef: row.display_ref, rows: parsed.rows.length });
  }

  return report;
}
