// EN KAPITTELSIDE SKAL IKKE HENTE OG PARSE HELE PERSONREGISTERET FOR Å FINNE
// ÉN PERSON.
//
// Fire av getterne i `bible.ts` er skrevet slik: hent HELE tabellen for
// språket, `JSON.parse` hver eneste rad, og la JS-et kaste alt som ikke
// adresserer dette kapittelet. Kommentaren over dem sier hvorfor —
// «SQLite brukte json_each/json_extract; i MySQL filtrerer vi i JS i stedet» —
// og den er riktig så langt den rekker: MySQL kan ikke slå opp inne i en
// MEDIUMTEXT-blob uten å lese og skanne den selv, og det er MÅLT dyrere enn å
// sende blobben (`LIKE` 38,8 ms og `REGEXP` 54,2 ms mot 23,3 ms for å hente og
// parse alt), fordi skanningen skjer uansett.
//
// Det den ikke sier, er hva det koster oss per sidevisning. Målt mot den lokale
// basen, `/en/rom/8` — en ferdig side på 232 kB:
//
//   getPersonsByChapter          2029 rader, 8,1 MB tekst   +36,1 MB rss   36 ms
//   getStoriesByChapter          1357 rader, 1,1 MB          +3,7 MB rss    8 ms
//   getNumberSymbolismByChapter   326 rader, 1,7 MB          +2,8 MB rss    5 ms
//   getThemesByChapter             37 rader, 0,1 MB          +3,3 MB rss    1 ms
//
// ~43 MB flyktig allokering per kapittelrender, på den mest besøkte flata vi
// har (1189 kapitler × 8 språk). Det er dette #110 måler enden av: residenten
// klatrer 15 MB/t og flater aldri ut, mens live-settet står stille på ~8 MB.
// Ingenting holdes i live — `heapGulv` i `minne-regnskap.ts` beviser det — så
// det er TOPPEN per render som må ned. Allokatoren gir ikke tilbake det den én
// gang har hatt bruk for, og containerens tak er 288 MiB.
//
// TO GREP, OG DE ER IKKE DET SAMME. Hvilket som er riktig følger av hvor
// kostnaden ligger, og det er målt for hver av de fire.
//
// 1) DE TRE SMÅ: forfilteret er en STRENGTEST framfor en parsing.
//
// Adressen står i blobben som tekst, og hvert av de fire predikatene krever at
// et objekt et sted i blobben har `"bookId": <boka vi står i>`. Finnes ikke den
// teksten, kan raden umulig bestå det EKSAKTE filteret — så den kan hoppes over
// uten å parses. Radene krysser fortsatt nettet, men de er små (0,1–1,7 MB), og
// etter forfilteret koster de en brøkdel å tolke.
//
// 2) PERSONS: radene er 8,1 MB, og da er det HENTINGEN som koster.
//
// Et forfilter i JS får aldri bort radstrengene selv. Målt over fem
// kapitteloppslag i hver sin ferske prosess:
//
//   hent alt og parse alt        rss +101 MB
//   hent alt, strengtest først   rss  +88 MB      <- nesten ingen gevinst
//   la BASEN holde blobben       rss  +14 MB
//
// Derfor bærer `persons` en avledet kolonne, `ref_books`, med bok-id-ene raden
// adresserer — `,1,45,`, ~200 byte mot blobbens ~4 kB. Spørringen returnerer
// fortsatt én rad per person i språket, men `content` er NULL for alle som
// ikke kan treffe, så de 8,1 MB krysser ikke nettet: 2029 rader inn, 63
// blobber ut på `/en/rom/8`.
//
// KOLONNEN ER EN OPTIMALISERING, ALDRI EN SANNHET. `NULL` betyr «ikke beregnet»
// og gir blobben ut som før, så en base der `syncPersonRefBooks()` aldri har
// kjørt oppfører seg nøyaktig som før — bare like tregt som før. Det er med
// vilje: en avledet kolonne som kan bli hengende etter innholdet ville ellers
// vært en stille tapt person på en kapittelside, altså samme klasse hull som
// #45, #65 og #69. Kolonnen er en SUPERSET, og det EKSAKTE JS-predikatet står
// uendret etter den.
//
// SQL-ENS FORM ER URØRT, og det er ikke en detalj. `inLanguage()` avgjør
// språket på «har tabellen rader i det hele tatt for dette språket», ikke på om
// KAPITTELET har noe. Flyttet vi kapittelfilteret ned i `WHERE`, ville en
// nb-side uten personer falt tilbake til de ENGELSKE personene (#26).
// Spørringen returnerer derfor fortsatt én rad per person i språket — det er
// bare blobben som holdes tilbake.
//
// SPØRRINGENE ER FASTE STRENGER MED `?`-PARAMETRE, ikke satt sammen. Hver av
// dem har et fast antall parametre, også synken: den grupperer på VERDI og
// sender id-ene som ett `FIND_IN_SET`-argument, framfor å bygge en
// `IN (…)`-liste av variabel lengde. Da finnes det ingen streng her som er satt
// sammen av data i det hele tatt.
//
// Se bible.flogvit.com#110.

import type { SQL } from 'bun';

/**
 * Nøkkelen adressen bæres av, i alle fire blobbene.
 *
 * `persons.references[]`, `number_symbolism.references[]`,
 * `stories.references[]` og `themes.sections[].verses[]` staver den likt, og
 * det er ikke tilfeldig: det er samme adresseform `JSON_ADDRESS_KEYS` i #46
 * allerede kjenner. Én nøkkel gir ett forfilter for alle fire.
 */
export const BOOK_KEY = 'bookId';

/**
 * En test for «nevner denne blobben boka i det hele tatt?».
 *
 * Bygges ÉN gang per getterkall og brukes på hver rad — ikke en modulnivå-cache
 * per bok-id, som ville vært nok en beholdning å måtte melde inn i
 * `minne-regnskap.ts` for å spare 66 små regexer.
 *
 * `(?!\d)` er det som skiller `45` fra `450` og `456`. Uten den ville
 * forfilteret vært en bredere superset — fortsatt trygt, men unødig dyrt.
 * `\s*` gjør den blind for formateringen: `persons` og `number_symbolism`
 * ligger pen-printet i basen (`"bookId": 45`), `stories` kompakt
 * (`"bookId":45`), og begge former er den samme adressen.
 */
export function bookMentionTest(bookId: number): (content: string) => boolean {
  const re = new RegExp(`"${BOOK_KEY}"\\s*:\\s*${bookId}(?!\\d)`);
  return (content: string) => re.test(content);
}

/** Bøkene i Bibelen. En id utenfor dette er ingen kapittelside, altså intet treff. */
const MAX_BOOK_ID = 66;

/**
 * `[45, 1, 45]` → `,1,45,`.
 *
 * Komma i BEGGE ender, så `,45,` er et eksakt oppslag og ikke et prefiks av
 * `,450,`. Tom mengde er `,` og ikke tom streng: en tom streng ville ikke latt
 * seg skille fra «ikke beregnet» i en kolonne som også kan være NULL, og de to
 * betyr motsatte ting.
 *
 * Sortert og unik, så to like mengder gir SAMME streng — ellers ville
 * `syncPersonRefBooks()` skrevet rader om igjen ved hver deploy fordi den
 * sammenlikner strenger, og «idempotent» hadde vært en påstand uten dekning.
 */
export function formatRefBooks(bookIds: number[]): string {
  if (bookIds.length === 0) return ',';
  return `,${[...new Set(bookIds)].sort((a, b) => a - b).join(',')},`;
}

/**
 * Bok-id-ene en personblobb adresserer, slik de LAGRES.
 *
 * En blobb som ikke lar seg parse gir `,` — den ville uansett falt ut av
 * `parsePersonContent()`, som svarer null.
 */
export function personRefBooks(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return ',';
  }
  const refs = (parsed as { references?: unknown })?.references;
  if (!Array.isArray(refs)) return ',';
  const bøker = new Set<number>();
  for (const ref of refs) {
    const id = (ref as { bookId?: unknown })?.bookId;
    // Bare TALL. Det eksakte predikatet er `ref.bookId === bookId`, altså
    // streng likhet mot et tall — en id lagret som streng treffer aldri, og å
    // ta den med ville gjort kolonnen bredere uten å dekke noe.
    if (typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= MAX_BOOK_ID) {
      bøker.add(id);
    }
  }
  return formatRefBooks([...bøker]);
}

/**
 * Det basen leter etter i `ref_books` for å avgjøre om blobben skal sendes.
 *
 * Kommaene i begge ender er hele poenget, og de er den samme regelen
 * `formatRefBooks()` skriver: `,45,` finnes ikke i `,450,`.
 */
export function refBooksNeedle(bookId: number): string {
  return `,${bookId},`;
}

/**
 * Kan denne raden treffe boka? JS-tvillingen til predikatet i spørringen under.
 *
 * `null` er «ikke beregnet» og svarer JA — kolonnen er en optimalisering, og en
 * base uten den skal gi samme svar som før, ikke færre personer.
 */
export function refBooksMayMatch(refBooks: string | null | undefined, bookId: number): boolean {
  if (refBooks === null || refBooks === undefined) return true;
  return refBooks.includes(refBooksNeedle(bookId));
}

// Fast streng, to `?`-parametre. `IF(...)` framfor `WHERE`: raden BLIR med, det
// er bare blobben som holdes tilbake — se «SQL-ENS FORM ER URØRT» over.
const PERSON_KANDIDAT_SQL =
  'SELECT IF(ref_books IS NULL OR LOCATE(?, ref_books) > 0, content, NULL) AS content FROM persons WHERE language = ?';

/**
 * Én rad per person i språket; `content` bare for dem som kan adressere boka.
 *
 * Returnerer NULL-radene også — `inLanguage()` avgjør språkvalget på antallet
 * rader, og et filter her ville flyttet et nb-kapittel uten personer over på de
 * engelske personene (#26).
 */
export function personChapterCandidates(
  sql: SQL,
  language: string,
  bookId: number,
): Promise<{ content: string | null }[]> {
  return sql.unsafe(PERSON_KANDIDAT_SQL, [refBooksNeedle(bookId), language]) as unknown as Promise<
    { content: string | null }[]
  >;
}

// Faste strenger. Synken grupperer på VERDI og sender id-ene som ETT argument,
// så antallet parametre er to uansett hvor mange rader gruppa har.
const ALLE_PERSONRADER_SQL = 'SELECT id, content, ref_books FROM persons';
const SETT_REF_BOOKS_SQL = 'UPDATE persons SET ref_books = ? WHERE FIND_IN_SET(id, ?)';

/** Rader som ble skrevet om, og hvor mange de var. */
export interface RefBooksSync {
  oppdatert: number;
  totalt: number;
}

export function refBooksSyncIsEmpty(r: RefBooksSync): boolean {
  return r.oppdatert === 0;
}

export function formatRefBooksSync(r: RefBooksSync): string {
  return `persons.ref_books: ${r.oppdatert} av ${r.totalt} rader oppdatert (#110)`;
}

/**
 * Regner ut `ref_books` på nytt for hver personrad.
 *
 * Kjøres fra `runMigrations()` — altså ved HVER deploy — og fra slutten av
 * importen, samme to steder som ryddingene i #46, #61 og #92, og av samme
 * grunn: kolonnen er avledet av `content`, og `content` kan endres av begge.
 * Den må komme ETTER `prunePersonRefs()`, ellers indekserer den adresser
 * ryddingen er i ferd med å fjerne.
 *
 * Bare rader som faktisk har endret seg skrives. En vanlig deploy uten
 * innholdsimport gjør derfor null skrivinger, og kostnaden er lesningen —
 * den samme lesningen `prunePersonRefs()` alt gjør. Målt lokalt: 4058 rader
 * fordelt på 438 verdier, 1,6 s første gang og 44 ms hver gang etterpå.
 */
export async function syncPersonRefBooks(sql: SQL): Promise<RefBooksSync> {
  const rader = (await sql.unsafe(ALLE_PERSONRADER_SQL)) as unknown as {
    id: number;
    content: string;
    ref_books: string | null;
  }[];

  // Gruppert på VERDI, ikke én UPDATE per rad: 4058 rundturer mot en managed
  // base ved hver deploy er en kostnad ingen ba om, og de fleste personene
  // deler noen få mengder.
  const perVerdi = new Map<string, number[]>();
  for (const rad of rader) {
    const ønsket = personRefBooks(rad.content);
    if (rad.ref_books === ønsket) continue;
    const ider = perVerdi.get(ønsket);
    if (ider) ider.push(rad.id);
    else perVerdi.set(ønsket, [rad.id]);
  }

  let oppdatert = 0;
  for (const [verdi, ider] of perVerdi) {
    for (let i = 0; i < ider.length; i += 500) {
      const del = ider.slice(i, i + 500);
      await sql.unsafe(SETT_REF_BOOKS_SQL, [verdi, del.join(',')]);
      oppdatert += del.length;
    }
  }
  return { oppdatert, totalt: rader.length };
}
