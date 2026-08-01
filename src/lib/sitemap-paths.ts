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
  '/kjente-vers',
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
  // Utgavesidene (#30). De er ferdig oversatt til alle åtte språk med hreflang
  // og canonical, og beskriver akkurat det en ny leser søker etter.
  '/oversettelser',
  ...IMPORTED_BIBLES.map((id) => `/oversettelser/${id}`),
];

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
