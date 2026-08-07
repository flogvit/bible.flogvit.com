// DETALJSIDENE ER DER KLYNGEN KAN LYVE (GitHub #45)
//
// Hreflang-klyngen ble generert generisk fra STIEN: hver norsk lesedag
// annonserte alle åtte språk, og sju av dem var 404 — 1228 av 1542 feillinjer på
// én time. `Layout` tar nå `locales`, og lesedagen utleder settet av basen.
//
// Sveipen som holder på det (invariant 9 i `page-contract.test.ts`) måler
// `PAGES`, og der ligger bare parameterløse sider. **Sidene saken handlet om kan
// per konstruksjon ikke ligge der:** matrisen rendres under `/de/`, og en side
// som ikke finnes på tysk er nettopp den som ikke svarer 200 der. Sagt på en
// annen måte: vakta dekker alt UNNTATT klassen defekten tilhørte.
//
// Denne fila er den halvdelen. Invarianten er formulert på UTFALLET og går
// begge veier:
//
//   annonsert  ⊆ det som svarer 200   ellers lokker vi en crawler til en 404
//   annonsert  ⊇ det som svarer 200   ellers har vi skjult en ekte side
//
// Begge trengs. Den første alene består av å oppgi ÉN locale på hver side, som
// ville tatt sju ekte adresser ut av søk; den andre alene er dagens feil.
//
// Sidene velges av DATAENE, som i #70 og #80: for hver innholdstype måles den
// oppføringen som finnes på FÆRREST språk — altså den som først blir en lesedag
// om igjen. En ny innholdsrunde flytter dermed målingen selv, uten at noen
// oppdaterer en liste med id-er.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { getSql } from '../src/lib/db.ts';
import { IMPORTED_BIBLES } from '../src/lib/editions.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import pages from '../src/routes/pages.tsx';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const SITE = 'https://bible.flogvit.com';

beforeAll(async () => {
  await initBooks();
});

/**
 * Adressen som er MEST utsatt for hver detaljfamilie, hentet ut av basen.
 *
 * Nøkkelen er ruta slik ruteren kjenner den, så den strukturelle halvdelen under
 * kan krysse kartet mot rutetabellen. Verdien er en spørring, ikke en id: en
 * hardkodet `/personer/abaddon` ville målt en tilfeldig person som finnes på
 * alle språk, altså ingenting.
 *
 * `COUNT(DISTINCT language)` stigende gir oppføringen med smalest språkakse.
 * Er alt komplett (som i dag), er svaret vilkårlig og målingen er en vakt mot
 * det neste tilfellet; blir én person liggende igjen på bare `nb` etter en
 * import, er det NØYAKTIG den sida som måles.
 */
const SMALEST_FØRST: Record<string, { sti: (nøkkel: string) => string; tabell: string; nøkkel: string }> = {
  '/personer/:personId': { sti: (k) => `/personer/${k}`, tabell: 'persons', nøkkel: 'name' },
  '/temaer/:tema': { sti: (k) => `/temaer/${k}`, tabell: 'themes', nøkkel: 'name' },
  '/historier/:slug': { sti: (k) => `/historier/${k}`, tabell: 'stories', nøkkel: 'slug' },
  '/tall/:number': { sti: (k) => `/tall/${k}`, tabell: 'number_symbolism', nøkkel: 'number' },
  '/dager/:dayId': { sti: (k) => `/dager/${k}`, tabell: 'days', nøkkel: 'id' },
  // Lesedagen — sakens egen side. Datoen er adressen (#40), og settet importeres
  // på nytt ved hver innholdsoppdatering, så den hentes ut av basen som resten.
  '/lesetekster/:date{[0-9]{4}-[0-9]{2}-[0-9]{2}}': {
    sti: (k) => `/lesetekster/${k}`,
    tabell: 'reading_texts',
    nøkkel: 'date',
  },
};

/** Detaljsider uten språkakse i DATAENE — adressen finnes overalt eller ingen steder. */
const FAST_ADRESSE: Record<string, string> = {
  // Utgavesidene er én rad per oversettelse, ikke per språk: chromet oversettes,
  // adressen er den samme på alle åtte.
  '/oversettelser/:id': `/oversettelser/${IMPORTED_BIBLES[0]}`,
  // Kapittelsiden er den tyngste flata vi har, og teksten er edition-scopet
  // (`verses.bible`), ikke språk-scopet.
  '/:book/:chapter': '/1mos/1',
};

/**
 * Detaljruter som IKKE måles, med grunnen. Hver oppføring er en påstand om at
 * klyngen ikke KAN lyve om innholdsspråk der — ikke et sted å gjemme en side.
 */
const IKKE_MÅLT: Record<string, string> = {
  // Brukerinnsendt tekst i ett språk, uten språkakse i basen: den samme
  // adressen rendrer på alle åtte, og oversetting er ikke aktuelt.
  '/manuskripter/katalog/:slug': 'brukerinnsendt tekst — én rad, ingen språkakse',
  '/manuskripter/:slug': 'brukerens eget manuskript, rendres av øya — tomt skall for andre',
  '/manuskripter/:slug/rediger': 'skriveflate bak innlogging — noindex (#60)',
  // Sidetallet finnes bare når katalogen er stor nok (#75), og innholdet er det
  // samme på alle åtte språk.
  '/manuskripter/katalog/side/:page': 'paginering av katalogen (#75) — ingen språkakse',
  // Capability-URL: lenken ER tilgangen, sida er `noindex` og utenfor sitemapen.
  '/delt/:token': 'delt manuskript (#15) — noindex, capability-URL uten token å teste med',
  // Bare en 301 til datoadressen (#40) — den rendrer ingen klynge.
  '/lesetekster/:id{[0-9]+}': 'gammel numerisk adresse — 301 til datoen (#40), rendrer ingen HTML',
};

/** GET-ruter MED parameter, lest ut av ruteren selv. */
function detaljruter(): string[] {
  const paths = new Set<string>();
  for (const route of pages.routes) {
    if (route.method !== 'GET') continue;
    if (!route.path.includes(':')) continue;
    paths.add(route.path);
  }
  return [...paths].sort();
}

/** Adressen som skal måles for hver detaljfamilie vi måler. */
async function måltAdresse(rute: string): Promise<string> {
  const fast = FAST_ADRESSE[rute];
  if (fast) return fast;
  const { sti, tabell, nøkkel } = SMALEST_FØRST[rute]!;
  const sql = getSql();
  const rader = (await sql.unsafe(
    `SELECT ${nøkkel} k FROM ${tabell} GROUP BY ${nøkkel} ORDER BY COUNT(DISTINCT language) ASC, ${nøkkel} ASC LIMIT 1`,
  )) as { k: string }[];
  expect({ rute, rader: rader.length }).toEqual({ rute, rader: 1 });
  return sti(String(rader[0]!.k));
}

/** Klyngen HTML-en faktisk annonserer: hreflang → sti uten domenet. */
function klynge(html: string): { lang: string; path: string }[] {
  return [...html.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => ({
    lang: m[1]!,
    path: m[2]!.replace(SITE, ''),
  }));
}

/** Locale-ene adressen faktisk ER en side på — målt, ikke utledet. */
async function levende(sti: string): Promise<string[]> {
  const live: string[] = [];
  for (const locale of LOCALES) {
    const res = await app.request(encodeURI(`/${locale}${sti}`));
    if (res.status === 200) live.push(locale);
  }
  return live;
}

describe('hreflang på detaljsidene (#45)', () => {
  // ── DEN STRUKTURELLE HALVDELEN ──
  //
  // En ny detaljfamilie må klassifiseres. `sitemap-coverage.test.ts` trekker
  // grensa si ved de parameterløse rutene og sier eksplisitt at detaljsidene er
  // «en egen beslutning som fortjener sitt eget svar» — dette er det svaret.
  test('hver detaljrute er enten målt eller eksplisitt unntatt', () => {
    const uklassifiserte = detaljruter().filter(
      (p) => !(p in SMALEST_FØRST) && !(p in FAST_ADRESSE) && !(p in IKKE_MÅLT),
    );
    expect({ uklassifiserte }).toEqual({ uklassifiserte: [] });
  });

  // Kartene skal ikke kunne råtne: en oppføring som ikke lenger er en rute ser
  // ut som en beslutning, men er en rest — og da måler vi en side som er borte.
  test('kartene har ingen døde oppføringer', () => {
    const ruter = new Set(detaljruter());
    const døde = [...Object.keys(SMALEST_FØRST), ...Object.keys(FAST_ADRESSE), ...Object.keys(IKKE_MÅLT)].filter(
      (p) => !ruter.has(p),
    );
    expect({ døde }).toEqual({ døde: [] });
  });

  test('hvert unntak har en begrunnelse', () => {
    const uten = Object.entries(IKKE_MÅLT)
      .filter(([, grunn]) => !grunn.trim())
      .map(([p]) => p);
    expect({ uten }).toEqual({ uten: [] });
  });

  // ── DEN MÅLTE HALVDELEN ──
  for (const rute of [...Object.keys(SMALEST_FØRST), ...Object.keys(FAST_ADRESSE)]) {
    test(rute, async () => {
      const sti = await måltAdresse(rute);
      const live = await levende(sti);

      // Uten en levende adresse måler resten ingenting — en tom tabell eller en
      // rute som er lagt om skal gi rødt, ikke en stille bestått test.
      expect({ sti, levende: live.length > 0 }).toEqual({ sti, levende: true });

      const { html, status } = await (async () => {
        const res = await app.request(encodeURI(`/${live[0]}${sti}`));
        return { html: await res.text(), status: res.status };
      })();
      expect({ sti, status }).toEqual({ sti, status: 200 });

      const alternativer = klynge(html);
      const annonsert = alternativer.filter((a) => a.lang !== 'x-default').map((a) => a.lang);

      // 1. Klyngen er NØYAKTIG de locale-ene adressen er en side på. Begge
      //    retninger: en død adresse lokker en crawler dit siden ikke finnes, en
      //    utelatt locale tar en ekte side ut av søk.
      expect({ sti, annonsert: [...annonsert].sort() }).toEqual({ sti, annonsert: [...live].sort() });

      // 2. `x-default` ligger INNENFOR settet. Det er adressen Google velger når
      //    ingen språkvariant passer; pekte den på engelsk for en norsk-bare
      //    side, sendte vi hver uplasserbar leser til en 404.
      const fallback = alternativer.find((a) => a.lang === 'x-default');
      const innenfor = alternativer.filter((a) => a.lang !== 'x-default').map((a) => a.path);
      expect({ sti, xDefault: fallback?.path, innenfor: innenfor.includes(fallback?.path ?? '') }).toEqual({
        sti,
        xDefault: fallback?.path,
        innenfor: true,
      });

      // 3. …og hver annonsert adresse svarer faktisk 200, slik den står i
      //    HTML-en — prosentkodingen inkludert (#80).
      const døde: string[] = [];
      for (const alt of alternativer) {
        const res = await app.request(alt.path);
        if (res.status !== 200) døde.push(`${alt.lang} → ${alt.path} (${res.status})`);
      }
      expect({ sti, døde }).toEqual({ sti, døde: [] });
    });
  }
});
