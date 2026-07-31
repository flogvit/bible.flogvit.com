// CRAWL-FLATA — hvor mange adresser vi ber verden hente (#60).
//
// 12 × 503 på én time. Ikke nedetid: lastvernet i page-cache.ts gjorde jobben
// sin. Det som dyttet semaforen over kanten var vår EGEN HTML. Hver
// kapittelside lenket to sider per vers uten `rel="nofollow"`:
//
//     /en/bidra?vers=sal-94-1        /en/manuskripter/ny?vers=sal-94-1
//
// 31 167 vers × 2 familier × 8 språkprefikser = 498 672 crawlbare URL-er, mot
// 1 189 kapittelsider. Flata var ~420 ganger større enn innholdet, og INGEN av
// de 498 672 er innhold. Hver av dem er dessuten unik, altså cache-miss, altså
// en render-plass: GPTBot alene sto for 68 % av all trafikk i vinduet, 72 % av
// den mot `/bidra?vers=`, på 1,7 req/s — permanent rett under de 1,8 req/s #19
// slo fast at velter siden. Googlebot fikk 6,7 s på /en/2kor/11.
//
// Sveipen i `page-contract.test.ts` (invariant 6 og 7) er hovedvakta: den
// gjelder HVER side i PAGES og fanger en ny handlingslenke ingen har ført opp.
// Her står det sveipen ikke kan se — at robots.txt og sitemapen er enige, og at
// de query-løse sidene fortsatt er velkomne.

import { beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { anchors, parseRobots } from './robots.ts';
import { L } from './paths.ts';

const app = createApp();

let robots: string;
let allows: (url: string) => boolean;

beforeAll(async () => {
  await initBooks();
  robots = await (await app.request('/robots.txt')).text();
  allows = parseRobots(robots);
});

describe('crawl-flata (#60)', () => {
  describe('robots.txt', () => {
    // public/robots.txt lå igjen som en STATISK kopi. seoRoutes monteres før
    // serveStatic (app.ts), så ruta vinner — men to kilder til samme sannhet
    // er nøyaktig fella fra #42. Denne feiler hvis den statiske skulle vinne.
    test('serveres fra ruta, ikke fra en statisk fil ved siden av', () => {
      expect(robots).toContain('Disallow:');
    });

    test('avviser handlingsflata fra #60 — alle åtte språkprefikser', () => {
      const åpne = LOCALES.flatMap((l) => [
        `/${l}/bidra?vers=sal-94-1`,
        `/${l}/manuskripter/ny?vers=sal-94-1`,
        `/${l}/bidra?kap=sal-94`,
        `/${l}/bidra?bok=sal`,
        `/${l}/manuskripter/ny?ref=Sal%2094%2C1`,
      ]).filter(allows);
      expect(åpne).toEqual([]);
    });

    test('avviser visningsvariantene av kapittelsiden', () => {
      // Skinnebryterne lenker kapittelet til seg selv med andre visningsvalg,
      // og prev/neste bærer valget videre. Uten forbud går crawleren gjennom
      // hele Bibelen én gang per kombinasjon — og en kapittelrender er den
      // DYRE (det var en kapittelside som ga Googlebot 6,7 s).
      const åpne = [
        '/en/sal/94?bible=osnn',
        '/en/sal/94?secondary=original',
        '/en/sal/94?bible=osnn&secondary=osnb',
        '/en/sal/94?mapping=amharic2000',
      ].filter(allows);
      expect(åpne).toEqual([]);
    });

    test('slipper gjennom innholdet — og de query-løse handlingssidene', () => {
      const stengte = [
        '/',
        '/en',
        '/en/sal/94',
        '/en/bidra',
        '/en/manuskripter/katalog',
        // Slugen på et publisert manuskript kan begynne på «ny». Et forbud
        // skrevet som `Disallow: /*manuskripter/ny` er prefiksmatch og ville
        // stengt hele katalogen ut av indeksen i stillhet.
        '/en/manuskripter/nytt-liv-a1b2c3',
        '/sitemap.xml',
        '/en/sok',
      ].filter((u) => !allows(u));
      expect(stengte).toEqual([]);
    });

    test('peker fortsatt på sitemap-indeksen', () => {
      expect(robots).toContain('https://bible.flogvit.com/sitemap.xml');
    });
  });

  // Den mest sannsynlige feilfiksen på #60 er `Disallow: /bidra`, og den er
  // gal: /bidra STÅR i sitemapen (STATIC_PATHS) på alle åtte språk. Å levere en
  // sitemap med adresser vår egen robots.txt forbyr er å be Google om en
  // feilmelding — og siden forsvinner ut av indeksen uten at noen ville det.
  test('ingen URL i sitemapene er forbudt av robots.txt', async () => {
    for (const locale of LOCALES) {
      const xml = await (await app.request(`/sitemap-${locale}.xml`)).text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
      expect({ locale, forbudt: locs.filter((u) => !allows(u)).slice(0, 3) }).toEqual({ locale, forbudt: [] });
    }
  });

  describe('kapittelsiden lenker ingen crawlbar handlingsflate', () => {
    // Sal 94 er kapittelet fra loggen. 1 Mos 1 ligger i PAGES og går gjennom
    // hovedsveipen; denne holder på det MÅLTE tilfellet.
    test('/sal/94', async () => {
      const html = await (await app.request(L('/sal/94'))).text();
      const query = anchors(html).filter((a) => a.href.includes('?'));
      expect(query.length).toBeGreaterThan(0); // ellers måler testen ingenting

      const følges = [...new Set(query.filter((a) => !a.rel.split(/\s+/).includes('nofollow')).map((a) => a.href))];
      expect(følges).toEqual([]);

      const hentbare = [...new Set(query.map((a) => a.href))].filter(allows);
      expect(hentbare).toEqual([]);
    });

    // Bæres valget videre av prev/neste, er kapittelsiden en felle som
    // multipliserer seg selv: crawleren går hele Bibelen på nytt i hver modus.
    test('/sal/94?secondary=original bærer ikke valget videre uten nofollow', async () => {
      const html = await (await app.request(`${L('/sal/94')}?secondary=original`)).text();
      const følges = [
        ...new Set(
          anchors(html)
            .filter((a) => a.href.includes('?') && !a.rel.split(/\s+/).includes('nofollow'))
            .map((a) => a.href),
        ),
      ];
      expect(følges).toEqual([]);
    });
  });

  describe('handlingssidene står utenfor indeksen, den query-løse står i den', () => {
    const noindexRe = /name="robots" content="noindex,follow"/;
    const canonicalOf = (html: string) => /rel="canonical" href="([^"]+)"/.exec(html)?.[1];

    test('/bidra?vers=… er noindex og kanoniserer til /bidra', async () => {
      const html = await (await app.request(`${L('/bidra')}?vers=1mos-1-3`)).text();
      expect(noindexRe.test(html)).toBe(true);
      expect(canonicalOf(html)).toBe(`https://bible.flogvit.com${L('/bidra')}`);
    });

    test('/bidra uten query er en ekte side — indekserbar', async () => {
      const html = await (await app.request(L('/bidra'))).text();
      expect(noindexRe.test(html)).toBe(false);
      expect(canonicalOf(html)).toBe(`https://bible.flogvit.com${L('/bidra')}`);
    });

    test('/manuskripter/ny er en tom skriveflate bak innlogging — noindex', async () => {
      const html = await (await app.request(L('/manuskripter/ny'))).text();
      expect(noindexRe.test(html)).toBe(true);
    });
  });
});
