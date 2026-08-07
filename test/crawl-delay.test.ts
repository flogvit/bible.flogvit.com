// FARTEN til én navngitt crawler (#86).
//
// 60 × 503 fra lastvernet i vaktvinduet 2026-08-07, og ALLE 60 lå innenfor
// 32,7 sekunder — én byge, ikke et utfall. PerplexityBot sto for 92 av 117
// ankomster i bygen (79 %) og fikk 47 av de 60 avvisningene, med toppfart målt
// til 7 forespørsler i sekundet fra sju sammenhengende adresser. Over hele
// vinduet på 11,4 timer er den 1,1 % av volumet: den er ikke stor, den er rask.
//
// Aktøren gjør ingenting galt. Den henter `/robots.txt`, og 0 av 204
// forespørsler gikk mot en `Disallow`-sti — men robots.txt vår har aldri hatt
// en `Crawl-delay` eller en eneste agent-seksjon, så vi har heller ALDRI bedt
// den om å senke farten. Det er motsatt av den udeklarerte farmen i
// flogvit-com-server#12, som ingen signatur når.
//
// FELLA denne vakta finnes for: en navngitt gruppe ERSTATTER `*`-gruppa for
// den crawleren (RFC 9309 §2.2.1) — den arver ingenting. En
// `User-agent: PerplexityBot`-seksjon med bare en `Crawl-delay` ville derfor
// åpnet hele handlingsflata fra #60 (498 672 adresser) for nettopp den
// crawleren som går fortest. Symptomet ville vært stille: robots.txt ser mer
// forsiktig ut enn før, og flata blir større.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { crawlDelayFor, namedAgents, parseRobots } from './robots.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

/**
 * User-Agent-strengen slik den står uavkortet i Caddys access-logg i
 * bygevinduet. Produkt-tokenet vi skriver i robots.txt må finnes i den —
 * «Perplexity» eller «PerplexityBot/1.0» matcher ingen gruppe, og da er
 * seksjonen en stille no-op.
 */
const MÅLT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)';
const BYGEAKTØREN = 'PerplexityBot';

/**
 * Taket for ÉN aktør, i forespørsler per sekund.
 *
 * `#19` målte at 1,8 req/s velter siden på én delt vCPU, og `586a38e` satte
 * `RENDER_MAX_CONCURRENT` til 6 — som 7 req/s fra én aktør fylte alene. En
 * enkelt crawler skal derfor ligge godt under sidens samlede kapasitet, ikke
 * så vidt under den: 0,5 req/s er under en tredel, og lar de øvrige aktørene
 * (Amazonbot, Applebot, meta-externalagent, den udeklarerte farmen) dele
 * resten uten at semaforen står og venter på én av dem.
 */
const MAKS_REQ_PER_S = 0.5;

let robots: string;

beforeAll(async () => {
  await initBooks();
  robots = await (await app.request('/robots.txt')).text();
});

/** Adressene fra #60 — handlingsflata og visningsvariantene, alle prefikser. */
const FORBUDTE = [
  ...LOCALES.flatMap((l) => [
    `/${l}/bidra?vers=sal-94-1`,
    `/${l}/manuskripter/ny?vers=sal-94-1`,
    `/${l}/bidra?kap=sal-94`,
    `/${l}/bidra?bok=sal`,
    `/${l}/manuskripter/ny?ref=Sal%2094%2C1`,
  ]),
  '/en/sal/94?bible=osnn',
  '/en/sal/94?secondary=original',
  '/en/sal/94?mapping=amharic2000',
];

describe('crawl-delay (#86)', () => {
  // 1. REGELEN — ren logikk mot en syntetisk robots.txt. Halvdelen finnes for
  //    å bevise at matcheren SER fella: uten gruppevalget ville vaktene under
  //    målt `*`-gruppa uansett hvilken agent de spurte om, og bestått på en
  //    seksjon som opphever alle forbudene.
  describe('en navngitt gruppe erstatter `*` — den arver ingenting', () => {
    const bare_delay = ['User-agent: *', 'Disallow: /*?vers=', '', 'User-agent: Rask', 'Crawl-delay: 2', ''].join('\n');
    const med_forbud = [
      'User-agent: *',
      'Disallow: /*?vers=',
      '',
      'User-agent: Rask',
      'Disallow: /*?vers=',
      'Crawl-delay: 2',
      '',
    ].join('\n');

    test('en seksjon med bare Crawl-delay åpner det `*` stengte', () => {
      expect(parseRobots(bare_delay, 'Rask')('/en/bidra?vers=sal-94-1')).toBe(true);
      expect(parseRobots(bare_delay)('/en/bidra?vers=sal-94-1')).toBe(false);
    });

    test('gjentas forbudene i seksjonen, står de', () => {
      expect(parseRobots(med_forbud, 'Rask')('/en/bidra?vers=sal-94-1')).toBe(false);
      expect(parseRobots(med_forbud, 'Rask')('/en/sal/94')).toBe(true);
    });

    test('tokenet matches uten hensyn til store bokstaver, og ukjent agent faller til `*`', () => {
      expect(crawlDelayFor(med_forbud, 'rask')).toBe(2);
      expect(crawlDelayFor(med_forbud, 'Amazonbot')).toBeUndefined();
      expect(parseRobots(med_forbud, 'Amazonbot')('/en/bidra?vers=sal-94-1')).toBe(false);
    });
  });

  // 2. AKTØREN — bygeaktøren fra målingen er faktisk navngitt, og tokenet er
  //    det hun kaller seg i loggen. Uten denne ville «fjern seksjonen helt»
  //    bestått alt det andre i stillhet.
  test('bygeaktøren har sin egen seksjon, med tokenet fra loggen', () => {
    expect(namedAgents(robots)).toContain(BYGEAKTØREN);
    expect(MÅLT_UA.toLowerCase()).toContain(BYGEAKTØREN.toLowerCase());
  });

  test('det FINNES en navngitt seksjon — ellers måler de to under ingenting', () => {
    expect(namedAgents(robots).length).toBeGreaterThan(0);
  });

  // 3. FORBUDENE — hver navngitt seksjon stenger ALT `*` stenger. Formulert på
  //    URL-ene, ikke på linjene: en seksjon skrevet med et forbud som ser
  //    riktig ut uten å treffe består ikke.
  describe('en navngitt seksjon stenger alt `*` stenger', () => {
    test('handlingsflata og visningsvariantene (#60)', () => {
      const åpne = namedAgents(robots).flatMap((agent) => {
        const tillater = parseRobots(robots, agent);
        return FORBUDTE.filter(tillater).map((u) => `${agent}: ${u}`);
      });
      expect(åpne).toEqual([]);
    });

    // Og motsatt vei: en seksjon som stenger for MYE tar siden ut av indeksen
    // for nettopp den crawleren, uten at noe annet enn dette ville sett det.
    test('ingen URL i sitemapene er forbudt for en navngitt agent', async () => {
      const agenter = namedAgents(robots).map((a) => [a, parseRobots(robots, a)] as const);
      for (const locale of LOCALES) {
        const xml = await (await app.request(`/sitemap-${locale}.xml`)).text();
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
        const forbudt = agenter.flatMap(([agent, tillater]) =>
          locs.filter((u) => !tillater(u)).slice(0, 2).map((u) => `${agent}: ${u}`),
        );
        expect({ locale, forbudt }).toEqual({ locale, forbudt: [] });
      }
    });
  });

  // 4. FARTEN — tallet er en fart, ikke pynt. En `Crawl-delay: 0` eller en
  //    seksjon uten tall ber ikke om noe.
  test('hver navngitt agent er bedt om en fart under det én vCPU tåler', () => {
    const for_raske = namedAgents(robots)
      .map((agent) => ({ agent, delay: crawlDelayFor(robots, agent) }))
      .filter(({ delay }) => !(typeof delay === 'number' && delay > 0 && 1 / delay <= MAKS_REQ_PER_S));
    expect(for_raske).toEqual([]);
  });

  test('Crawl-delay er et helt tall — desimaler tolkes ulikt fra crawler til crawler', () => {
    const brøk = namedAgents(robots)
      .map((agent) => ({ agent, delay: crawlDelayFor(robots, agent) }))
      .filter(({ delay }) => !Number.isInteger(delay));
    expect(brøk).toEqual([]);
  });
});
