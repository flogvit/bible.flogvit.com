// Kjernelogikken for lesesporing (GitHub #16) — ren, uten DOM og uten DB.
//
// Modulen deles med serveren (src/routes/sync.ts importerer mergeProgress), så
// terskler og flettregler finnes ÉN gang. Legg aldri DOM-oppslag eller
// localStorage her; det bor i reading.js.
//
// Datamodellen per kapittel (én sync-oppføring, itemId = `${bookId}-${chapter}`):
//
//   { firstAt, lastAt, count, opens, verses? }
//
// Lesing er en HENDELSE, ikke en tilstand: `count` teller fullførte lesinger, så
// gjenlesing av en bok du leste for to år siden gir framdrift i stedet for
// «allerede lest». `firstAt`/`lastAt` kan være null = «lest, tidspunkt ukjent»
// (bulk-markert historikk). `verses` finnes bare mens et kapittel er UNDERVEIS,
// og forsvinner når det fullføres.

/** Bevisst RASK leser: terskelen skal ikke straffe den som faktisk leser fort. */
export const FAST_WPM = 550;

/** Andel av versene som må være lest før kapittelet regnes som fullført. */
export const READ_COVERAGE = 0.9;

/** Gulv for svært korte vers, så «Jesus gråt» ikke passerer på et blunk. */
const MIN_DWELL_MS = 400;

/** Hvor lenge et vers må ha vært synlig for å telle som lest. */
export function dwellFloorMs(wordCount) {
  const words = Number(wordCount) || 0;
  return Math.max(MIN_DWELL_MS, Math.round((words / FAST_WPM) * 60000));
}

/**
 * Tak for hvor mye tid ett vers kan samle opp. Uten dette ville en side som blir
 * stående åpen bygge opp kreditt for de versene som tilfeldigvis er på skjermen.
 */
export function dwellCapMs(wordCount) {
  return dwellFloorMs(wordCount) * 3;
}

/** Er kapittelet lest? Dekning, ikke perfeksjon — de siste versene kan skummes. */
export function chapterComplete(readVerses, totalVerses) {
  if (!totalVerses || totalVerses <= 0) return false;
  return readVerses / totalVerses >= READ_COVERAGE;
}

// ── Range-koding ────────────────────────────────────────────────────
// Delvis leste kapitler lagres kompakt («1-3,7») så Salme 119 med sine 176 vers
// ikke blir en diger array i hver sync-oppføring.

export function versesToRanges(verses) {
  const sorted = [...new Set((verses ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort(
    (a, b) => a - b,
  );
  const parts = [];
  let start = null;
  let prev = null;
  for (const n of sorted) {
    if (start === null) {
      start = n;
    } else if (n !== prev + 1) {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = n;
    }
    prev = n;
  }
  if (start !== null) parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(',');
}

export function rangesToVerses(ranges) {
  if (!ranges) return [];
  const out = [];
  for (const part of String(ranges).split(',')) {
    if (!part) continue;
    const [a, b] = part.split('-').map((x) => parseInt(x, 10));
    if (!Number.isFinite(a)) continue;
    const end = Number.isFinite(b) ? b : a;
    for (let n = a; n <= end; n++) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// ── Tilstand og fletting ────────────────────────────────────────────

export function emptyProgress() {
  return { firstAt: null, lastAt: null, count: 0, opens: 0 };
}

function minAt(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxAt(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * Kommutativ og idempotent fletting av to versjoner av samme kapittel.
 *
 * Sync-laget flettet opprinnelig record-typer med last-write-wins, som kunne la
 * én enhet overskrive en annens framgang. Her vinner ALDRI en tom tilstand:
 * tellere tar maks, tidspunkt tar ytterpunktene, delvis leste vers unioneres.
 * `count` kan i teorien drifte med én hvis samme kapittel gjenleses offline på
 * to enheter samtidig — det er kosmetisk, og aldri tap av «dette er lest».
 */
export function mergeProgress(a, b) {
  const x = a ?? emptyProgress();
  const y = b ?? emptyProgress();
  const merged = {
    firstAt: minAt(x.firstAt ?? null, y.firstAt ?? null),
    lastAt: maxAt(x.lastAt ?? null, y.lastAt ?? null),
    count: Math.max(x.count ?? 0, y.count ?? 0),
    opens: Math.max(x.opens ?? 0, y.opens ?? 0),
  };
  const verses = versesToRanges([...rangesToVerses(x.verses), ...rangesToVerses(y.verses)]);
  if (verses) merged.verses = verses;
  return merged;
}

/**
 * Registrer en fullført lesing. `at = null` betyr «lest, tidspunkt ukjent»
 * (bulk-markert historikk). `verses` utelates bevisst: kapittelet er fullført,
 * så delvis-tilstanden har gjort jobben sin.
 */
export function recordRead(entry, at) {
  const cur = entry ?? emptyProgress();
  return {
    firstAt: at == null ? (cur.firstAt ?? null) : minAt(cur.firstAt ?? null, at),
    lastAt: at == null ? (cur.lastAt ?? null) : maxAt(cur.lastAt ?? null, at),
    count: (cur.count ?? 0) + 1,
    opens: cur.opens ?? 0,
  };
}

/** Antall intensitetsnivåer i varmekartet (1 = lest én gang, HEAT_LEVELS = ofte). */
export const HEAT_LEVELS = 4;

/**
 * Intensitet for én kapittelcelle: 0 ulest, 0.5 delvis lest, 1..HEAT_LEVELS
 * etter antall lesinger. Delt av SSR-en (reading-map.ts) og klient-hydreringen
 * (user.js), så en nymarkert celle får nøyaktig samme farge som en synket.
 */
export function heatLevel(entry) {
  if (!entry) return 0;
  const count = entry.count ?? 0;
  if (count > 0) return Math.min(HEAT_LEVELS, 1 + Math.floor(Math.log2(count)));
  return rangesToVerses(entry.verses).length > 0 ? 0.5 : 0;
}

/** Registrer at kapittelet ble åpnet. Teller ikke som lest, og setter ingen lesetid. */
export function recordOpen(entry) {
  const cur = entry ?? emptyProgress();
  return { ...cur, opens: (cur.opens ?? 0) + 1 };
}
