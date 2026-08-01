// PORTEN MOT SITEMAPEN — hver offentlig side er enten i sitemapen eller
// eksplisitt holdt utenfor (GitHub #47).
//
// `STATIC_PATHS` er en HÅNDHOLDT liste, og fram til nå hadde den ingen port mot
// rutetabellen. Fem offentlige studie-oversikter (`/historier`, `/tall`,
// `/dager`, `/paralleller` — og `/statistikk`, som ingen hadde lagt merke til)
// ble registrert som ruter uten å komme inn i lista. Ingenting feilet: en
// manglende URL i en sitemap gir ingen 404 og ingen logglinje, og er dermed
// usynlig i drift per definisjon. Nøyaktig samme klasse som #30
// (utgavesidene), og begge ble funnet ved at noen så etter.
//
// Vakta er derfor STRUKTURELL: den leser rutene fra ruteren selv, ikke fra en
// liste noen må huske å oppdatere. En ny side må klassifiseres — inn i
// sitemapen, eller inn i `NOT_IN_SITEMAP` med en begrunnelse. Å utelate den er
// ikke lenger et alternativ, og det er hele poenget: unntaket blir en bevisst
// oppføring framfor en stille utelatelse.
//
// GRENSEN: bare PARAMETERLØSE ruter. Detaljsidene (`/historier/:slug`,
// `/personer/:personId`, …) er en egen beslutning som fortjener sitt eget svar
// — sluggene er stabile for historier og personer, men #40 viste at
// lesetekst-adresser kan renummereres av en import, og `/manuskripter/katalog`
// har en skreven begrunnelse for å holde en volatil detaljliste ute. En ny
// OVERSIKT er parameterløs og fanges her; en ny detaljfamilie er en større
// avgjørelse som kommer med sitt eget issue.

import { beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { STATIC_PATHS } from '../src/lib/sitemap-paths.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import pages from '../src/routes/pages.tsx';

const app = createApp();

beforeAll(async () => {
  await initBooks();
});

/**
 * Sidene som med RETTE står utenfor sitemapen, med grunnen.
 *
 * Hver oppføring er en påstand om at siden ikke er et svar på et søk. Lista er
 * ikke et sted å gjemme en glemt oversikt: står en side her, skal det stå
 * hvorfor, og testen under krever at nøkkelen faktisk er en registrert rute —
 * så en fjernet rute ikke blir liggende som en stille løgn.
 */
const NOT_IN_SITEMAP: Record<string, string> = {
  // Brukerens EGNE data. Alt innholdet bor i localStorage/sync og rendres av
  // øyene; for en anonym leser (og for en crawler) er sida et tomt skall.
  // `/emner` hører hjemme her og ikke blant studie-oversiktene: navnet lyder
  // som `/temaer`, men det er brukerens egne emneknagger, plus-gatet, i
  // «Mine»-gruppa i navigasjonen sammen med /favoritter og /notater.
  '/favoritter': 'brukerens egne data — tomt skall for alle andre',
  '/emner': 'brukerens EGNE emneknagger (plus), ikke studie-temaene på /temaer',
  '/notater': 'brukerens egne data — tomt skall for alle andre',
  '/lister': 'brukerens egne data — tomt skall for alle andre',
  '/lesekart': 'brukerens egen lesehistorikk — tomt skall for alle andre',
  '/manuskripter': 'brukerens egne manuskripter; den OFFENTLIGE lista er /manuskripter/katalog',
  '/mine-bidrag': 'brukerens egne innsendinger',
  '/innstillinger': 'brukerens egne innstillinger',

  // Handlings- og editorflater (#60). En tom skriveflate bak innlogging er
  // aldri svaret på et søk — de er `noindex`, og da hører de ikke i sitemapen.
  '/manuskripter/ny': 'tom skriveflate bak innlogging — noindex (#60)',
  // `/tekst` er et VERKTØY: uten `?refs=` er den tom, og med query er den en
  // handling, ikke en side. Selve queryen er dessuten crawl-sperret (#60).
  '/tekst': 'verktøy som krever ?refs= — tom uten query, og queryen er sperret (#60)',

  // FJERNET side som fortsatt har en rute, med vilje: `/kjente-vers` svarer 410
  // Gone (#58). Ruta finnes nettopp for å SI at siden er borte — å annonsere den
  // i sitemapen ville vært det motsatte. `removed-pages.test.ts` holder på at
  // svaret faktisk er 410, så unntaket her kan ikke bli et gjemmested for en
  // side som stille sluttet å virke.
  '/kjente-vers': 'fjernet (#58) — ruta svarer 410 Gone, kilden finnes ikke lenger',

  // Teknisk flate for service workeren, ikke en side noen leser.
  '/offline': 'nedlastingsflate for offline-bruk, bak innlogging',
  '/offline-fallback': 'service worker-fallback, ikke en leserside',

  // Offentlig og ekte, men kan ikke annonseres likt på alle åtte språk:
  // `reading_texts` ligger bare på `nb` (med vilje — se språkdimensjonen i
  // CLAUDE.md), så `/en/lesetekster` er 168 kort fattigere enn `/nb/lesetekster`
  // og i praksis tom. Sitemapen har ingen språkakse i dag: `STATIC_PATHS` er
  // uprefikset og seo.ts sender HVER sti under HVERT språk. Å legge den inn
  // ville derfor annonsert seks tomme sider for å få med én ekte — samme feil
  // som #45, bare i sitemapen framfor i hreflang-klynga. Riktig fiks er den
  // samme mekanikken som #45 (`localesWithContent()`), og den er sitt eget
  // issue.
  '/lesetekster': 'ligger bare på nb; sitemapen har ingen språkakse ennå (#45)',
};

/** GET-ruter uten parameter, lest ut av ruteren selv. */
function parameterlessRoutes(): string[] {
  const paths = new Set<string>();
  for (const route of pages.routes) {
    if (route.method !== 'GET') continue;
    if (route.path.includes(':')) continue;
    paths.add(route.path);
  }
  return [...paths].sort();
}

describe('sitemap-dekning (#47)', () => {
  // DEN STRUKTURELLE INVARIANTEN. En ny offentlig rute som ingen fører opp noe
  // sted gjør denne rød — det er det `STATIC_PATHS` manglet.
  test('hver parameterløse siderute er enten i sitemapen eller eksplisitt unntatt', () => {
    const uklassifiserte = parameterlessRoutes().filter(
      (p) => !STATIC_PATHS.includes(p) && !(p in NOT_IN_SITEMAP),
    );
    expect({ uklassifiserte }).toEqual({ uklassifiserte: [] });
  });

  // Unntakslista skal ikke kunne råtne: en oppføring som ikke lenger er en rute
  // ser ut som en bevisst beslutning, men er en rest.
  test('unntakslista har ingen døde oppføringer', () => {
    const ruter = new Set(parameterlessRoutes());
    const døde = Object.keys(NOT_IN_SITEMAP).filter((p) => !ruter.has(p));
    expect({ døde }).toEqual({ døde: [] });
  });

  // …og ingen side kan stå BEGGE steder. Da ville unntaket vært en påstand
  // ingen kunne lest ut av oppførselen.
  test('ingen side står både i sitemapen og i unntakslista', () => {
    const begge = STATIC_PATHS.filter((p) => p in NOT_IN_SITEMAP);
    expect({ begge }).toEqual({ begge: [] });
  });

  test('hvert unntak har en begrunnelse', () => {
    const uten = Object.entries(NOT_IN_SITEMAP)
      .filter(([, grunn]) => !grunn.trim())
      .map(([p]) => p);
    expect({ uten }).toEqual({ uten: [] });
  });

  // DET MÅLTE TILFELLET (#47). Sveipen over ville bestått på en liste der noen
  // hadde ført opp de fem som «unntak» — dette er påstanden om at de er INNE.
  test('studie-oversiktene ligger i sitemapen', () => {
    const skalInn = ['/historier', '/tall', '/dager', '/paralleller', '/statistikk'];
    const mangler = skalInn.filter((p) => !STATIC_PATHS.includes(p));
    expect({ mangler }).toEqual({ mangler: [] });
  });

  // …og faktisk kommer ut i XML-en, på alle åtte språk. `STATIC_PATHS` er
  // uprefikset; det er seo.ts som legger på språket, og #42 viste at veien fra
  // liste til utsendt URL kan ødelegge adressen underveis.
  test('de nye stiene står i hver locale-sitemap, prefikset', async () => {
    for (const locale of LOCALES) {
      const xml = await (await app.request(`/sitemap-${locale}.xml`)).text();
      const locs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!));
      const mangler = ['/historier', '/tall', '/dager', '/paralleller', '/statistikk', '/changes'].filter(
        (p) => !locs.has(`https://bible.flogvit.com/${locale}${p}`),
      );
      expect({ locale, mangler }).toEqual({ locale, mangler: [] });
    }
  });

  // En sitemap skal ikke inneholde en adresse som ikke svarer. Kapitlene er
  // dekket av #42-testen i sidekontrakten; her er det de faste sidene som er
  // håndholdte, altså de som kan bli stående etter at en rute er fjernet.
  test('hver fast sti svarer 200', async () => {
    const feil: { path: string; status: number }[] = [];
    for (const path of STATIC_PATHS) {
      for (const locale of ['nb', 'en']) {
        const url = path === '/' ? `/${locale}` : `/${locale}${path}`;
        const res = await app.request(url);
        if (res.status !== 200) feil.push({ path: url, status: res.status });
      }
    }
    expect(feil).toEqual([]);
  });
});
