// SIDEKONTRAKTEN — invariantene enhver SSR-side i bibel må oppfylle.
//
// Dette er en SVEIP, ikke en samling enkelttester: hver invariant sjekkes mot
// ALLE sidene i matrisen. Poenget er å fange feil vi ikke tenkte på da vi skrev
// testen. To ekte funn står bak fila:
//
//   #18  Alle interne lenker manglet språkprefiks, så leseren mistet språket
//        sitt ved hvert klikk. Et grep etter `href="/` fant det ikke, fordi
//        noen lenker bygges i en variabel først — den rendrede HTML-en gjorde.
//   #16  Jeg la til ~24 ordboksnøkler på 8 språk i én omgang. `makeT` faller
//        tilbake til å returnere NØKKELEN, så en glipp ville vist «rd.markRead»
//        i UI-et uten at noe feilet noe sted.
//
// Legger du til en ny side: sett den i PAGES. Legger du til en ny invariant:
// den gjelder umiddelbart for alle sidene.

import { beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { DEFAULT_LOCALE, LOCALES, missingKeys } from '../src/lib/i18n.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';

const app = createApp();

// Bok-tabellen caches i minnet ved oppstart (src/index.ts). Uten dette kaster
// verse-display på sider som slår opp bøker — og testen ville bare bestått når
// en annen testfil tilfeldigvis kjørte først.
beforeAll(async () => {
  await initBooks();
});

/**
 * Representative sider. Målet er DEKNING AV KOMPONENTER, ikke av URL-er: hver
 * oppføring skal dra inn minst én komponent de andre ikke rører.
 */
const PAGES: { path: string; name: string }[] = [
  { path: '/', name: 'forsiden' },
  { path: '/1mos/1', name: 'kapittelsiden (TOC, skinne, versdetaljer, referanser)' },
  // 1 Mos 1 har INGEN personer, så studieblokka for personer rendres ikke der.
  // Mutasjonstesting avslørte det: en uprefikset lenke i den blokka slapp
  // gjennom kontrakten. Disse to drar inn de betingede blokkene.
  { path: '/1mos/12', name: 'kapittel med personer og profetier' },
  { path: '/matt/1', name: 'kapittel med evangelieparalleller' },
  { path: '/profetier', name: 'profetier' },
  { path: '/paralleller', name: 'evangelieparalleller' },
  { path: '/statistikk', name: 'statistikk' },
  { path: '/tall', name: 'tallsymbolikk' },
  { path: '/lesetekster', name: 'lesetekster' },
  { path: '/personer', name: 'personer (verse-display)' },
  { path: '/temaer', name: 'temaer (studiekort)' },
  { path: '/historier', name: 'historier' },
  { path: '/tidslinje', name: 'tidslinje' },
  { path: '/dager', name: 'dager' },
  { path: '/kjente-vers', name: 'kjente vers' },
  { path: '/oversettelser', name: 'oversettelser' },
  { path: '/leseplan', name: 'leseplan' },
  { path: '/lesekart', name: 'lesekart (heatmap)' },
  { path: '/innstillinger', name: 'innstillinger' },
  { path: '/favoritter', name: 'favoritter' },
  { path: '/manuskripter', name: 'manuskripter' },
  { path: '/om', name: 'om' },
  { path: '/sok?q=gud', name: 'søk med treff' },
  // Brukersidene og detaljsidene manglet i matrisen, og der lå det norsk igjen
  // som sveipen ikke kunne se — den sjekker bare sidene som STÅR her. Ny side
  // ⇒ legg den til, ellers er den utenfor alle invariantene.
  { path: '/emner', name: 'emner' },
  { path: '/notater', name: 'notater' },
  { path: '/lister', name: 'verslister' },
  { path: '/offline', name: 'offline' },
  { path: '/bidra', name: 'bidra' },
  { path: '/sok/original?q=chesed', name: 'søk i grunnteksten' },
  { path: '/tilgjengelighet', name: 'tilgjengelighet' },
  { path: '/finnes-ikke', name: '404-siden' },
];

/** Stier som med rette står uten språkprefiks: statiske filer og API. */
const UNPREFIXED_OK = [
  /^\/js\//,
  /^\/css\//,
  /^\/api\//,
  /^\/\.well-known\//,
  /^\/[^/]+\.(css|js|svg|png|ico|json|xml|txt|webmanifest)$/,
];

const localeRe = new RegExp(`^/(${LOCALES.join('|')})(/|$)`);
const SITE = 'https://bible.flogvit.com';

function lhrefOf(locale: string, path: string): string {
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

async function fetchPage(locale: string, path: string) {
  const [p, q] = path.split('?');
  const url = lhrefOf(locale, p!) + (q ? `?${q}` : '');
  const res = await app.request(url);
  return { url, res, html: await res.text() };
}

const attrs = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]!);

describe('sidekontrakt', () => {
  // Full matrise på ett språk som IKKE er basespråket — da avsløres alt som er
  // hardkodet til engelsk. Basespråket ville skjult nettopp de feilene.
  describe('alle sider (de)', () => {
    for (const page of PAGES) {
      test(page.name, async () => {
        const { url, res, html } = await fetchPage('de', page.path);
        const expectStatus = page.path === '/finnes-ikke' ? 404 : 200;
        expect({ url, status: res.status }).toEqual({ url, status: expectStatus });

        // 1. Alle interne lenker bærer språkprefiks (#18).
        const bad = [
          ...new Set(
            attrs(html, /href="([^"]+)"/g).filter(
              (h) => h.startsWith('/') && !UNPREFIXED_OK.some((re) => re.test(h)) && !localeRe.test(h),
            ),
          ),
        ];
        expect({ page: page.name, uprefiksede: bad }).toEqual({ page: page.name, uprefiksede: [] });

        // 2. <html lang> følger locale-en, ikke nettleseren eller en default.
        expect(html).toContain('<html lang="de"');

        // 3. Full hreflang-klynge: 8 språk + x-default (I18N.md §3).
        const hreflangs = attrs(html, /hreflang="([^"]+)"/g);
        expect(new Set(hreflangs)).toEqual(new Set([...LOCALES, 'x-default']));

        // 4. Canonical peker på DENNE siden på DETTE språket.
        const canonical = attrs(html, /rel="canonical" href="([^"]+)"/g)[0];
        expect(canonical?.startsWith(`${SITE}/de`)).toBe(true);
      });
    }
  });

  // Alle språk mot én tung side: fanger locale-spesifikke ordbokshull og at
  // prefikset faktisk følger monteringen.
  describe('alle språk (kapittelsiden)', () => {
    for (const locale of LOCALES) {
      test(locale, async () => {
        const { res, html } = await fetchPage(locale, '/1mos/1');
        expect(res.status).toBe(200);
        expect(html).toContain(`<html lang="${locale}"`);
        const foreign = [
          ...new Set(attrs(html, /href="(\/[a-z]{2}\/[^"]*)"/g).filter((h) => !h.startsWith(`/${locale}/`))),
        ];
        expect(foreign).toEqual([]);
      });
    }
  });

  // `makeT` returnerer NØKKELEN når en oversettelse mangler, så en glemt nøkkel
  // blir synlig tekst i UI-et uten å feile noe sted.
  describe('ordbøkene er komplette', () => {
    for (const locale of LOCALES) {
      test(`${locale} mangler ingen nøkler`, () => {
        expect({ locale, mangler: missingKeys(locale) }).toEqual({ locale, mangler: [] });
      });
    }

    test('ingen nøkkel er tom eller kun mellomrom', () => {
      const tomme: string[] = [];
      for (const locale of LOCALES) {
        for (const [key, val] of Object.entries(DICTIONARIES[locale])) {
          if (!String(val).trim()) tomme.push(`${locale}:${key}`);
        }
      }
      expect(tomme).toEqual([]);
    });

    test('ingen rå nøkkel lekker ut som synlig tekst', async () => {
      // En manglende oversettelse gir bokstavelig «rd.markRead» i HTML-en.
      const keys = Object.keys(DICTIONARIES.en);
      const { html } = await fetchPage('de', '/1mos/1');
      const text = html.replace(/<[^>]*>/g, ' ');
      expect(keys.filter((k) => text.includes(k))).toEqual([]);
    });
  });

  describe('uprefiksede stier forhandler, prefiksede gjør ikke', () => {
    test('uprefikset sti redirecter til forhandlet språk', async () => {
      const res = await app.request('/1mos/1', { headers: { 'accept-language': 'de-DE,de' } });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/de/1mos/1');
    });

    test('prefikset sti IGNORERER Accept-Language — URL-en vinner (I18N.md §2)', async () => {
      const res = await app.request('/en/1mos/1', { headers: { 'accept-language': 'de-DE,de' } });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<html lang="en"');
    });

    test('ukjent side under et gyldig prefiks gir 404, ikke ny redirect', async () => {
      const res = await app.request('/de/finnes-ikke');
      expect(res.status).toBe(404);
    });
  });

  describe('crawler-flater', () => {
    test('robots.txt peker på sitemap-indeksen', async () => {
      const html = await (await app.request('/robots.txt')).text();
      expect(html).toContain(`${SITE}/sitemap.xml`);
    });

    test('hver locale har sin egen sitemap med kun prefiksede URL-er', async () => {
      for (const locale of LOCALES) {
        const res = await app.request(`/sitemap-${locale}.xml`);
        expect({ locale, status: res.status }).toEqual({ locale, status: 200 });
        const xml = await res.text();
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
        const wrong = locs.filter((l) => !l.startsWith(`${SITE}/${locale}`));
        expect({ locale, feil: wrong.slice(0, 3) }).toEqual({ locale, feil: [] });
      }
    });
  });

  // ── Ingen norsk tekst på en ikke-norsk side (GitHub #23) ───────────
  //
  // Sidekontrakten fanget lenge NULL av dette, og grunnen er verdt å merke
  // seg: den sveiper etter MANGLENDE ordboksnøkler, og en hardkodet
  // «Grunntekst» er ikke en nøkkel som mangler — den er tekst som aldri gikk
  // gjennom ordboka. En glemt oversettelse ser derfor helt normal ut.
  //
  // Etter #26 er engelsk gulvet i innholdskjeden, så innhold som MANGLER på
  // engelsk vises ikke i det hele tatt framfor å falle til norsk. Norsk tekst
  // på en engelsk side er dermed alltid en feil — ikke en fallback.
  //
  // Ordlista er bevisst KORT og inneholder bare funksjonsord som ikke også er
  // engelske. «her», «men», «last» og «bare» er utelatt nettopp fordi de
  // finnes i begge språk: en vakt med falske positive blir slått av.
  //
  // Den må derimot dekke KORTE etiketter eksplisitt. Første utgave hadde bare
  // «oversettelse», og slapp da gjennom «Oversettelser» i en <title>, «skrift
  // Latn», «GT:» og et enslig «Nei» — fire ord som ikke lignet nok på noe i
  // lista. Legger du til en etikett, legg ordet her også.
  const NORWEGIAN_ONLY = [
    'ikke', 'som', 'dette', 'denne', 'disse', 'ingen', 'alle', 'andre',
    'hvor', 'hva', 'hvis', 'når', 'fordi', 'eller', 'også',
    'være', 'har', 'kan', 'vil', 'skal', 'blir', 'ble', 'gjør',
    'med', 'til', 'fra', 'etter', 'før', 'ved', 'uten', 'mellom', 'gjennom',
    'din', 'dine', 'ditt', 'hans', 'hennes', 'deres', 'vår', 'våre',
    'vers', 'kapittel', 'bibelen', 'oversettelse', 'oversettelser', 'oversetter',
    'oversettere', 'grunntekst', 'søk', 'lukk', 'velg', 'skriv', 'legg', 'hopp',
    'innhold', 'kategorier', 'kontekst', 'skrift', 'nei', 'gt',
  ];
  const NORWEGIAN_RE = new RegExp(
    `(?:^|[^\\p{L}])(${NORWEGIAN_ONLY.join('|')})(?![\\p{L}])`,
    'giu',
  );

  /**
   * Den synlige teksten, uten det som med rette står på norsk:
   *
   * - `lang="nb"`/`lang="nn"` — sitert norsk i dokumentasjonen på /om.
   * - `data-proper-names` — lister over EGENNAVN fra dataene (navnene på
   *   bibeloversettelser og versnummereringer). «Bibelen Guds Ord» er tittelen
   *   på en faktisk utgave og skal ikke oversettes.
   */
  function visibleText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<([a-z]+)[^>]*\blang="(?:nb|nn)"[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<([a-z]+)[^>]*\bdata-proper-names[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ');
  }

  describe('ingen norsk tekst under /en/', () => {
    for (const page of PAGES) {
      test(page.name, async () => {
        const { html } = await fetchPage('en', page.path);
        const funn: string[] = [];
        for (const line of visibleText(html).split('\n')) {
          const text = line.trim();
          if (text.length < 4) continue;
          if (NORWEGIAN_RE.test(text)) funn.push(text.slice(0, 90));
          NORWEGIAN_RE.lastIndex = 0;
        }
        expect({ side: page.path, norsk: funn.slice(0, 5) }).toEqual({ side: page.path, norsk: [] });
      });
    }
  });

  test('basespråket er x-default i hreflang-klyngen', async () => {
    const { html } = await fetchPage('de', '/1mos/1');
    expect(html).toContain(`hreflang="x-default" href="${SITE}/${DEFAULT_LOCALE}/1mos/1"`);
  });
});
