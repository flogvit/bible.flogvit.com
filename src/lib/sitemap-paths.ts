// Stiene sitemapene består av — ÉN kilde, og formatet er RÅTT (udekodet).
//
// Tidligere gikk stiene en runde gjennom public/sitemap.xml: generatoren skrev
// dem `encodeURI`-et, seo.ts leste dem tilbake med et regex og kodet dem på
// nytt ved utsending. `%C3%B8` ble da `%25C3%25B8`, og alle 95 kapitlene i de
// fire bøkene med ø/å (`åp`, `1krøn`, `2krøn`, `høys`) svarte 404 i alle åtte
// sitemaps (GitHub #42). Det var usynlig fordi `encodeURI` er idempotent for
// rene ASCII-stier — 62 av 66 bøker overlevde den doble kodingen uendret.
//
// Derfor: stiene finnes bare i én representasjon (rå, med ø og å som seg selv),
// og kodingen skjer på ETT sted — der URL-en skrives ut i seo.ts.
import { booksData, getBookInfoBySlug } from './books-data.ts';
import { toUrlSlug } from './url-utils.ts';
import { IMPORTED_BIBLES } from './editions.ts';
import { getReadingTextContentLanguages } from './bible.ts';
import { LOCALES, type Locale } from './i18n.ts';
import { localesWithContent } from './lang.ts';

/**
 * Sider utenom kapitlene. Uprefiksede — seo.ts legger på språket.
 *
 * Lista er håndholdt, og det er nettopp derfor `test/sitemap-coverage.test.ts`
 * finnes: den krysser rutetabellen mot denne lista og krever at HVER
 * parameterløse siderute er enten her eller eksplisitt unntatt med en grunn
 * (#47). En rute som ble registrert uten å komme hit var usynlig i drift —
 * ingen 404, ingen logglinje, bare en side søkemotorene bare fant hvis de
 * fulgte en intern lenke.
 */
export const STATIC_PATHS: readonly string[] = [
  '/',
  '/om',
  '/sok',
  '/sok/original',
  '/tidslinje',
  '/profetier',
  '/personer',
  '/temaer',
  '/leseplan',
  '/bidra',
  // Studie- og oversiktssidene (#47). De sto i navigasjonens «Studier»- og
  // «Oversikt»-grupper ved siden av /temaer og /personer, som lå inne — det
  // var altså ingen beslutning om å holde dem ute, bare fem oppføringer som
  // aldri ble skrevet. Alle rendrer det samme innholdet på alle åtte språk
  // (tysk faller til engelsk, som er terminalt).
  '/historier',
  '/tall',
  '/dager',
  '/paralleller',
  '/statistikk',
  // Endringsloggen. Samme slag som /om og /tilgjengelighet: en fast,
  // offentlig side med ekte innhold på alle åtte språk, lenket fra bunnteksten.
  '/changes',
  // Den åpne manuskriptkatalogen (#15, del 2). LISTA står her; de enkelte
  // oppføringene gjør ikke — de kommer og går med review og tilbaketrekking,
  // og en sitemap full av adresser som forsvinner er verre enn ingen.
  '/manuskripter/katalog',
  '/tilgjengelighet',
  // Lesetekstene (#77). Den er IKKE en side på alle åtte språk — se
  // `LANGUAGE_SCOPED_PATHS` under, som avgjør hvilke sitemaps den havner i.
  '/lesetekster',
  // Utgavesidene (#30). De er ferdig oversatt til alle åtte språk med hreflang
  // og canonical, og beskriver akkurat det en ny leser søker etter.
  '/oversettelser',
  ...IMPORTED_BIBLES.map((id) => `/oversettelser/${id}`),
];

/**
 * Stier som ikke finnes på alle åtte språk — med KILDEN til språkaksen, aldri
 * lista (GitHub #77).
 *
 * `STATIC_PATHS` er uprefikset, og seo.ts sendte hver sti under hvert språk.
 * Sitemapen kunne dermed ikke uttrykke «denne stien finnes på nb og nn, ikke på
 * de seks andre», og `/lesetekster` — en ekte, offentlig side med 236 lesedager
 * bak seg — ble stående helt utenfor alle åtte framfor å annonsere seks tomme
 * sider for å få med én ekte. Begge er feil: det siste er #45 om igjen, det
 * første er en side søkemotorene bare finner ved å følge en intern lenke (#47).
 *
 * Verdien er en spørring mot BASEN, ikke en liste noen vedlikeholder: samme
 * mekanikk som hreflang-klyngen (#45), så et importert språk slår gjennom uten
 * kodeendring — og et språk som forsvinner gjør det samme.
 */
const LANGUAGE_SCOPED_PATHS: Record<string, () => Promise<readonly string[]>> = {
  '/lesetekster': getReadingTextContentLanguages,
};

/**
 * Språkaksen for stiene som har en, slått opp på sti (#77).
 *
 * Bare de scopede stiene står i kartet; alt som ikke er der gjelder alle åtte.
 * Det holder spørringene nede på antallet unntak framfor på antallet stier —
 * i dag er `reading_texts` den eneste innholdstabellen uten engelske rader.
 */
export async function sitemapLocales(): Promise<Map<string, readonly Locale[]>> {
  const scoped = new Map<string, readonly Locale[]>();
  for (const [path, languages] of Object.entries(LANGUAGE_SCOPED_PATHS)) {
    scoped.set(path, localesWithContent(await languages()));
  }
  return scoped;
}

/** Locale-ene en sti skal annonseres under. Uten språkakse: alle åtte. */
export function localesForPath(path: string, scoped: Map<string, readonly Locale[]>): readonly Locale[] {
  return scoped.get(path) ?? LOCALES;
}

/**
 * Alle stier i sitemapen, uprefikset og UDEKODET.
 *
 * Kapittel-slugene er de samme som canonical på lesesidene
 * (`toUrlSlug(short_name)`, altså norske slugs som `/1mos/1` og `/1krøn/1`) —
 * tidligere genererte vi fra `books.name` (engelsk, mellomrom→bindestrek), som
 * ga 237 URL-er appen ikke løste opp (#1).
 */
export function sitemapPaths(): string[] {
  const paths = [...STATIC_PATHS];
  for (const book of booksData) {
    const slug = toUrlSlug(book.short_name);
    if (!getBookInfoBySlug(slug)) throw new Error(`Slug løses ikke opp av appen: ${slug}`);
    for (let chapter = 1; chapter <= book.chapters; chapter++) paths.push(`/${slug}/${chapter}`);
  }
  return paths;
}
