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
  // Med TREFF, ikke uten: treffteksten («2 matches (Hebrew).») er egen kode som
  // aldri rendres på en tom søkeside, og der lå det hardkodet norsk igjen.
  { path: '/sok/original?q=%D0%B0%D0%BB', name: 'søk i grunnteksten (uten treff)' },
  { path: '/sok/original?q=%D7%91%D7%A8%D7%90', name: 'søk i grunnteksten (med treff)' },
  // Editoren og redigeringsvisningen manglet, og der lå det hardkodet norsk
  // (#43). En side som ikke står her, står utenfor ALLE invariantene.
  { path: '/tekst', name: 'bibelpassasjer (/tekst, tom tilstand)' },
  { path: '/manuskripter/ny', name: 'manuskript-editor (ny)' },
  { path: '/manuskripter/et-manuskript/rediger', name: 'manuskript-editor (rediger)' },
  { path: '/tilgjengelighet', name: 'tilgjengelighet' },
  { path: '/changes', name: 'endringslogg' },
  { path: '/finnes-ikke', name: '404-siden' },
];

/** Stier som med rette står uten språkprefiks: statiske filer og API. */
const UNPREFIXED_OK = [
  /^\/js\//,
  /^\/css\//,
  /^\/api\//,
  /^\/\.well-known\//,
  // Rot-filer, med eller uten cache-buster (`/styles.css?v=<hash>`).
  /^\/[^/?]+\.(css|js|svg|png|ico|json|xml|txt|webmanifest)(\?|$)/,
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

        // 5. `noindex` KUN der URL-en bærer brukerens egen tekst (#41).
        //
        // Begge retninger er verdt å vakte: uten noindex er søkeresultatsiden
        // en forgiftningsvektor (den reflekterer vilkårlig tekst inn i
        // <title> og svarer 200), og med noindex på feil side har vi stille
        // fjernet en ekte side fra indeksen.
        const skalVæreNoindex = page.path.includes('?q=');
        expect({ side: page.path, noindex: /name="robots" content="noindex,follow"/.test(html) }).toEqual({
          side: page.path,
          noindex: skalVæreNoindex,
        });
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

    // #42: stiene tok en runde gjennom en KODET representasjon (den genererte
    // public/sitemap.xml) og ble dermed prosentkodet TO ganger. `%C3%B8` ble
    // `%25C3%25B8`, som aldri blir `ø`, og alle 95 kapitlene i de fire bøkene
    // med ø/å døde i alle åtte sitemaps — 760 URL-er.
    //
    // Den avgjørende detaljen for testen: `encodeURI` er idempotent for rene
    // ASCII-stier, så 62 av 66 bøker overlevde uendret. En sjekk på /1mos/1
    // kan ALDRI se dette. Bøkene med ø/å må være med eksplisitt.
    test('ingen <loc> er dobbeltkodet, og ø/å-URL-ene svarer 200', async () => {
      // Én sitemap er nok til å dekke alle åtte språkene: hver <url> bærer
      // hreflang-alternativene for samtlige locales, så alle 8 prefiksene
      // finnes her.
      const xml = await (await app.request('/sitemap-nb.xml')).text();
      const urls = [...xml.matchAll(/(?:<loc>|href=")([^<"]+)/g)].map((m) => m[1]!);
      const doble = urls.filter((u) => /%25[0-9A-F]{2}/i.test(u));
      expect(doble.slice(0, 3)).toEqual([]);
      expect(new Set(urls.map((u) => u.replace(SITE, '').split('/')[1]))).toEqual(new Set(LOCALES));

      const encoded = new Set(urls.filter((u) => u.includes('%')).map((u) => u.replace(SITE, '')));

      // Minst de fire bøkene med ikke-ASCII slug: åp, 1krøn, 2krøn, høys.
      expect(encoded.size).toBeGreaterThan(0);
      for (const slug of ['%C3%A5p', '1kr%C3%B8n', '2kr%C3%B8n', 'h%C3%B8ys']) {
        expect([...encoded].some((u) => u.includes(slug))).toBe(true);
      }

      // Og de svarer faktisk 200 — én per bok er nok, feilen er per slug.
      for (const path of [`/nb/1kr%C3%B8n/1`, `/en/%C3%A5p/1`, `/nb/h%C3%B8ys/1`, `/en/2kr%C3%B8n/1`]) {
        const res = await app.request(path);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
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
    // Treffteksten i grunntekstsøket sto hardkodet på norsk (#41-runden).
    'treff', 'hebraisk', 'gresk',
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
  /**
   * Metadata er tekst leseren SER — i fanen, i søkeresultatet, i en delt
   * lenke — men den står utenfor `<main>` og var derfor usynlig for sveipen
   * under. En hardkodet «Tematisk bibelstudie: …» i en description er samme
   * defekt som en hardkodet overskrift (#43).
   */
  function metaText(html: string): string {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
    const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    return `${title}\n${desc}`;
  }

  function visibleText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<([a-z]+)[^>]*\blang="(?:nb|nn)"[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<([a-z]+)[^>]*\bdata-proper-names[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ');
  }

  // Ordlista over kan bare fange ord noen HAR TENKT PÅ. «Mørk», «støttes» og
  // «søkesiden» sto der i månedsvis fordi ingen la dem inn.
  //
  // æ/ø/å er derimot STRUKTURELT: engelsk bruker dem ikke, så en slik bokstav i
  // synlig tekst på /en/ er alltid norsk som ikke gikk gjennom ordboka. Vakta
  // trenger ingen vedlikeholdt liste, og den fanger ord vi ikke har sett ennå.
  //
  // Unntakene er de samme som for ordlista, uttrykt i HTML-en der de gjelder:
  // `lang="nb"`/`lang="nn"` (sitert norsk) og `data-proper-names` (egennavn fra
  // dataene — utgavenavn som «OSNB (bokmål)»).
  /**
   * Ord som beholder æ/ø/å på ALLE språk. Lista skal være nesten tom — hver
   * oppføring er en påstand om at ordet er et EGENNAVN, ikke en oversettelse
   * noen har glemt.
   *
   * `bokmål` er navnet på en norsk skriftstandard og skrives slik også på
   * engelsk («Norwegian Bokmål»); det står i utgavenavnene OSNB/OSNN, som er
   * titler på faktiske bibelutgaver.
   */
  const NORDIC_PROPER = ['bokmål'];

  describe('ingen æ/ø/å i synlig tekst under /en/', () => {
    for (const page of PAGES) {
      test(page.name, async () => {
        const { html } = await fetchPage('en', page.path);
        const ord = new Set<string>();
        for (const line of `${visibleText(html)}\n${metaText(html)}`.split('\n')) {
          for (const w of line.trim().split(/[^\p{L}]+/u)) {
            if (/[æøåÆØÅ]/.test(w) && !NORDIC_PROPER.includes(w.toLowerCase())) ord.add(w);
          }
        }
        expect({ side: page.path, norske: [...ord].slice(0, 6) }).toEqual({ side: page.path, norske: [] });
      });
    }
  });

  /**
   * Strengene som ER den norske oversettelsen.
   *
   * Dette er den sterkeste av vaktene her, og den trenger ingen ordliste: en
   * tekst som står ORDRETT som i den norske ordboka, og som er noe ANNET på
   * engelsk, er den norske verdien — altså en streng som aldri gikk gjennom
   * `t()`. «Tittel» har verken æ/ø/å eller noe ord en liste ville hatt, men den
   * er `u.titleLabel` på norsk og «Title» på engelsk, og dermed avslørt.
   *
   * Nøkler der de to språkene har SAMME verdi («Pause», «System») utelates —
   * der finnes det ingen forskjell å oppdage, og de er ikke feil.
   */
  const NB_ONLY_VALUES = new Map<string, string>();
  for (const [key, nbVal] of Object.entries(DICTIONARIES.nb)) {
    const enVal = (DICTIONARIES.en as Record<string, string>)[key];
    const nb = String(nbVal).trim();
    if (!enVal || String(enVal).trim() === nb) continue;
    if (nb.length < 3 || nb.includes('{')) continue; // plassholdere fylles ulikt
    NB_ONLY_VALUES.set(nb.toLowerCase(), key);
  }

  // Tekstbærende ATTRIBUTTER: `aria-label="Tittel"` er tekst en skjermleser
  // leser opp, men den forsvinner når taggene strippes — derfor sto «Søk»,
  // «Tittel», «Innhold» og «Tema» igjen på engelske sider. Samme lærdom som
  // island-strings-vakta: sjekk HVOR strengen havner, ikke bare brødteksten.
  describe('ingen norsk i aria-label/placeholder/title under /en/', () => {
    const ATTR_RE = /(?:aria-label|placeholder|title|alt)="([^"]+)"/g;
    for (const page of PAGES) {
      test(page.name, async () => {
        const { html } = await fetchPage('en', page.path);
        const funn: string[] = [];
        for (const m of html.matchAll(ATTR_RE)) {
          const v = m[1]!;
          const nordic = v.split(/[^\p{L}]+/u).filter((w) => /[æøåÆØÅ]/.test(w));
          if (nordic.some((w) => !NORDIC_PROPER.includes(w.toLowerCase()))) funn.push(v);
          else if (NB_ONLY_VALUES.has(v.trim().toLowerCase())) funn.push(v);
          else if (NORWEGIAN_RE.test(v)) funn.push(v);
          NORWEGIAN_RE.lastIndex = 0;
        }
        expect({ side: page.path, attributter: [...new Set(funn)].slice(0, 6) }).toEqual({
          side: page.path,
          attributter: [],
        });
      });
    }
  });

  // Samme sjekk på SYNLIG tekst: en etikett som står ordrett som i den norske
  // ordboka er den norske verdien, uansett om ordet finnes i noen liste.
  describe('ingen norsk ordboksverdi som synlig tekst under /en/', () => {
    for (const page of PAGES) {
      test(page.name, async () => {
        const { html } = await fetchPage('en', page.path);
        const funn: string[] = [];
        for (const line of `${visibleText(html)}\n${metaText(html)}`.split('\n')) {
          const txt = line.trim();
          const key = NB_ONLY_VALUES.get(txt.toLowerCase());
          if (key) funn.push(`${txt} (${key})`);
        }
        expect({ side: page.path, norske: [...new Set(funn)].slice(0, 6) }).toEqual({
          side: page.path,
          norske: [],
        });
      });
    }
  });

  describe('ingen norsk tekst under /en/', () => {
    for (const page of PAGES) {
      test(page.name, async () => {
        const { html } = await fetchPage('en', page.path);
        const funn: string[] = [];
        for (const line of `${visibleText(html)}\n${metaText(html)}`.split('\n')) {
          const text = line.trim();
          // Gulvet var 4 tegn og slapp dermed «Søk» (3) gjennom i brødsmulestien
          // på /sok/original — ordet STO i lista, men linja ble aldri sjekket.
          if (text.length < 3) continue;
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
