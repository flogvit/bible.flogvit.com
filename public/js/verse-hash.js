// Adressen til et vers ELLER en versrekke i et kapittel (#91).
//
// Lenkene våre bar bare startverset: «Romerne 12:14-15» i Dagens vers pekte på
// `#v14`, og leseren landet midt i kapittelet uten noe som sa hvilke vers
// referansen egentlig gjaldt. Etiketten lovte to vers, adressen kunne bare
// uttrykke ett — altså kunne heller ikke lesesiden markere dem.
//
// Modulen deles med serveren (link-byggerne i `src/routes/pages/`), på samme
// måte som `reading-progress.js`: FORMEN finnes ett sted, så den som BYGGER
// adressen og den som LESER den ikke kan drive fra hverandre.
//
// Den gamle formen (`#v14`) er publisert — den ligger i delte lenker, bokmerker
// og søkeindekser — så den parses fortsatt, som ett enkelt vers.

/**
 * Hash for et vers eller en versrekke: `#v14`, `#v14-15`.
 *
 * Sluttverset utelates når det ikke legger til noe (mangler, likt startverset,
 * eller mindre enn det): en adresse skal ikke påstå en rekke den ikke har.
 */
export function verseHash(start, end) {
  const from = Number(start);
  if (!Number.isInteger(from) || from < 1) return '';
  const to = Number(end);
  return Number.isInteger(to) && to > from ? `#v${from}-${to}` : `#v${from}`;
}

/**
 * Motstykket: `#v14-15` → `{ start: 14, end: 15 }`, `#v14` → `{ start: 14,
 * end: 14 }`. Alt annet gir null — en hash vi ikke kjenner skal ikke bli et
 * halvt svar som markerer feil vers.
 */
export function parseVerseHash(hash) {
  const m = /^#?v(\d+)(?:-(\d+))?$/.exec(String(hash ?? ''));
  if (!m) return null;
  const start = Number(m[1]);
  if (start < 1) return null;
  const end = m[2] === undefined ? start : Number(m[2]);
  return { start, end: end > start ? end : start };
}
