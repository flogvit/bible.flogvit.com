// VAKT: sitemapen har en SPRÅKAKSE — en side annonseres bare der den har
// innhold (GitHub #77).
//
// `STATIC_PATHS` er uprefikset, og seo.ts sendte HVER sti under HVERT språk med
// en full `xhtml:link`-klynge over alle åtte. Sitemapen kunne dermed ikke si
// «denne stien finnes på nb og nn, ikke på de seks andre», og `/lesetekster` —
// en ekte, offentlig side med 236 lesedager bak seg — sto derfor helt UTENFOR
// alle åtte sitemaps. En side søkemotorene bare finner hvis de følger en
// intern lenke, altså nøyaktig hullet #47 fantes for å stenge.
//
// Vaktene er formulert på UTFALLET, ikke på `/lesetekster`:
//
//   1. Siden ligger i sitemapen NØYAKTIG der den har innholdet — målt på siden
//      selv (peker den leseren videre til et annet språk, har DETTE språket
//      ingen lesetekster, og da er adressen ikke et svar på et søk).
//   2. `xhtml:link`-klyngen bygges av den samme lista — ellers annonserer vi
//      seks tomme adresser i klyngen for å slippe å annonsere dem i `<loc>`,
//      som er #45 om igjen én etasje ned.
//   3. Alt som annonseres svarer 200.
//
// Invariant 2 og 3 kjenner ingen sti: de leser språkaksen ut av sitemapene
// selv, så neste innholdsslag uten alle åtte språk arver dem gratis.
//
// Krever lokal DB (DBngin :3326) med importert innhold.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES, href, type Locale } from '../src/lib/i18n.ts';
import { STATIC_PATHS } from '../src/lib/sitemap-paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

const SITE = 'https://bible.flogvit.com';

/** `<url>`-blokkene i en locale-sitemap, slått opp på `<loc>`. */
async function sitemapBlocks(locale: Locale): Promise<Map<string, string>> {
  const xml = await (await app.request(`/sitemap-${locale}.xml`)).text();
  const blocks = new Map<string, string>();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(m[1]!)?.[1];
    if (loc) blocks.set(loc, m[1]!);
  }
  return blocks;
}

const blocks = new Map<Locale, Map<string, string>>();
const url = (locale: Locale, path: string) => SITE + href(locale, path);

beforeAll(async () => {
  await initBooks();
  for (const locale of LOCALES) blocks.set(locale, await sitemapBlocks(locale));
});

/** Locale-ene stien faktisk er annonsert under, lest ut av sitemapene. */
const announcedIn = (path: string): Locale[] =>
  LOCALES.filter((l) => blocks.get(l)!.has(url(l, path)));

describe('sitemapen har en språkakse (#77)', () => {
  // DET MÅLTE TILFELLET, formulert på SIDEN og ikke på en språkliste: peker
  // `/lesetekster` leseren videre til et annet språk, er lista tom fordi DETTE
  // språket mangler innholdet (#76) — og en tom side er ikke et svar på et
  // søk. Gjør den ikke det, har språket lesedagene, og da skal adressen stå i
  // sitemapen. Måles av dataene, så en import på flere språk flytter målingen
  // selv.
  test('/lesetekster ligger i sitemapen nøyaktig der siden har lesetekstene', async () => {
    const medInnhold: Locale[] = [];
    const feil: string[] = [];
    for (const locale of LOCALES) {
      const res = await app.request(href(locale, '/lesetekster'));
      expect({ locale, status: res.status }).toEqual({ locale, status: 200 });
      const html = await res.text();
      // Den relative lenken til et ANNET språks liste finnes bare i «denne
      // utgaven har dem»-blokka; hreflang-klyngen er absolutt og matcher ikke.
      const pekerVidere = [...html.matchAll(/href="\/([a-z]{2})\/lesetekster"/g)]
        .map((m) => m[1]!)
        .some((l) => l !== locale);
      const harInnhold = !pekerVidere;
      if (harInnhold) medInnhold.push(locale);
      const iSitemap = blocks.get(locale)!.has(url(locale, '/lesetekster'));
      if (harInnhold !== iSitemap) {
        feil.push(`${locale}: innhold=${harInnhold}, i sitemapen=${iSitemap}`);
      }
    }
    expect(feil).toEqual([]);
    // En tom base ville gjort invarianten over sann uten å måle noe.
    expect(medInnhold.length).toBeGreaterThan(0);
  });

  // Uten denne måler de to under ingenting: er hver sti annonsert under alle
  // åtte, er «klyngen = lista» og «LOCALES» det samme svaret.
  test('det finnes en fast sti med en språkakse', () => {
    const scopede = STATIC_PATHS.filter((p) => announcedIn(p).length !== LOCALES.length);
    expect(scopede.length).toBeGreaterThan(0);
  });

  // KLYNGEN. `xhtml:link` er samme løfte som `<link rel="alternate">` i HTML-en
  // (#45): den skal aldri annonsere en adresse som ikke svarer. Bygges den av
  // `LOCALES` mens `<loc>` bygges av språkaksen, har vi flyttet feilen i stedet
  // for å fikse den.
  test('klyngen oppgir nøyaktig språkene stien er annonsert under', () => {
    const feil: string[] = [];
    for (const path of STATIC_PATHS) {
      const annonsert = announcedIn(path);
      for (const locale of annonsert) {
        const block = blocks.get(locale)!.get(url(locale, path))!;
        const alts = [...block.matchAll(/hreflang="([^"]+)"\s+href="([^"]+)"/g)];
        const språk = alts.filter(([, l]) => l !== 'x-default').map(([, l]) => l);
        if (språk.join(',') !== annonsert.join(',')) {
          feil.push(`${locale}${path}: klynge [${språk}] mot annonsert [${annonsert}]`);
        }
        // x-default er adressen Google velger når ingen språkvariant passer —
        // den må ligge INNENFOR settet, ellers sender vi hver uplasserbar
        // leser til en side vi selv ikke regner som et svar.
        const fallback = alts.find(([, l]) => l === 'x-default')?.[2];
        if (!fallback || !annonsert.some((l) => fallback === url(l, path))) {
          feil.push(`${locale}${path}: x-default ${fallback} utenfor [${annonsert}]`);
        }
      }
    }
    expect(feil).toEqual([]);
  });

  // …og adressen skal svare. Sveipen i `sitemap-coverage.test.ts` går på nb og
  // en; her er det stiene med en språkakse, altså de eneste der settet kan
  // være galt uten at noen av de to ser det.
  test('hver språk-scopet URL som annonseres svarer 200', async () => {
    const feil: { url: string; status: number }[] = [];
    for (const path of STATIC_PATHS) {
      const annonsert = announcedIn(path);
      if (annonsert.length === LOCALES.length) continue;
      for (const locale of annonsert) {
        const res = await app.request(href(locale, path));
        if (res.status !== 200) feil.push({ url: href(locale, path), status: res.status });
      }
    }
    expect(feil).toEqual([]);
  });
});
