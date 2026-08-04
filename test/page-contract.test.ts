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
import { getAllReadingTexts, initBooks } from '../src/lib/bible.ts';
import { DEFAULT_LOCALE, LOCALES, missingKeys } from '../src/lib/i18n.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';
import { PAGES } from './pages.ts';
import { anchors, parseRobots } from './robots.ts';

const app = createApp();

/**
 * Sidene som skal stå UTENFOR søkeindeksen, som mønstre mot stien i PAGES.
 *
 * `?q=` er søkeresultatet (#41): URL-en bærer brukerens egen tekst.
 * Resten er handlings- og editorflater (#60) — en tom skriveflate bak
 * innlogging er aldri svaret på et søk, og `/bidra?vers=…` er 31 167 varianter
 * av én side som allerede står i sitemapen på sin query-løse adresse.
 */
const NOINDEX_PAGES = [/\?q=/, /^\/bidra\?/, /^\/manuskripter\/ny$/, /^\/manuskripter\/[^/]+\/rediger$/];

// Bok-tabellen caches i minnet ved oppstart (src/index.ts). Uten dette kaster
// verse-display på sider som slår opp bøker — og testen ville bare bestått når
// en annen testfil tilfeldigvis kjørte først.
let robotsAllows: (url: string) => boolean;

beforeAll(async () => {
  await initBooks();
  robotsAllows = parseRobots(await (await app.request('/robots.txt')).text());
});


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
        const expectStatus = page.status ?? 200;
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

        // 5. `noindex` KUN der URL-en IKKE er en side å finne i et søk.
        //
        // To slag: flater der URL-en bærer brukerens egen tekst (søk, #41), og
        // handlings-/editorflater som aldri er et svar på et søk (#60).
        //
        // Begge retninger er verdt å vakte: uten noindex er søkeresultatsiden
        // en forgiftningsvektor (den reflekterer vilkårlig tekst inn i
        // <title> og svarer 200), og med noindex på feil side har vi stille
        // fjernet en ekte side fra indeksen.
        const skalVæreNoindex = NOINDEX_PAGES.some((re) => re.test(page.path));
        expect({ side: page.path, noindex: /name="robots" content="noindex,follow"/.test(html) }).toEqual({
          side: page.path,
          noindex: skalVæreNoindex,
        });

        // 6. En intern lenke med QUERY er en handling eller en visningsvariant
        //    — aldri en ny side (#60).
        //
        // Kapittelsiden lenket to sider per vers (`/bidra?vers=…`,
        // `/manuskripter/ny?vers=…`) uten `rel="nofollow"`, og med åtte
        // språkprefikser ga det 498 672 crawlbare URL-er mot 1 189
        // kapittelsider. Hver av dem er unik, altså cache-miss, altså en
        // render-plass — og semaforen svarte 12 × 503 på én time.
        //
        // Invarianten er lenken, ikke lenkefamilien: en NY handlingslenke
        // noen legger inn senere fanges uten at noen har ført den opp.
        const følges = anchors(html)
          .filter((a) => a.href.includes('?'))
          .filter((a) => !a.rel.split(/\s+/).includes('nofollow'))
          .map((a) => a.href);
        expect({ side: page.path, følges: [...new Set(følges)] }).toEqual({ side: page.path, følges: [] });

        // 7. …og robots.txt avviser den, så en crawler som ALLEREDE kjenner
        //    URL-en slutter å hente den. `nofollow` stopper bare oppdagelse;
        //    GPTBot hadde 498 672 adresser den fant før vi merket lenkene.
        //
        //    Unntak: `?q=` (søk). Den skal deindekseres, og et robots-forbud
        //    ville hindret crawleren i å SE `noindex`-direktivet (#41).
        //    `nofollow` over gjelder likevel, så nye søke-URL-er oppdages ikke.
        const hentbare = [
          ...new Set(
            anchors(html)
              .map((a) => a.href)
              .filter((h) => h.includes('?') && !h.includes('?q=') && !h.includes('&q=')),
          ),
        ].filter((h) => robotsAllows(h));
        expect({ side: page.path, hentbare }).toEqual({ side: page.path, hentbare: [] });

        // 8. Delekortet (#65). Uten `og:image` blir en delt lenke et kort med
        //    bare tittel og beskrivelse — på Facebook, LinkedIn, Slack,
        //    iMessage og Discord.
        //
        //    Kortet hører i SIDEMALEN, ikke per rute: legges det per side,
        //    mangler det på den ruta noen legger til i morgen. Derfor er dette
        //    en sveip over hele matrisen framfor én test mot forsiden — det er
        //    nettopp den forskjellen som gjør at neste side arver kortet uten
        //    at noen har tenkt på det.
        //
        //    Målene må STÅ i taggene: uten dem må skraperen hente bildet før
        //    den vet om det kan vises bredt, og den FØRSTE delingen av en URL
        //    blir uten bilde. Adressen må være absolutt — en relativ sti
        //    resolves ikke av alle skrapere.
        //
        //    `twitter:image` kreves IKKE: X faller tilbake på `og:image`, så
        //    taggen ville vært duplisering med to steder å glemme å oppdatere.
        const ogMeta = (prop: string) =>
          new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1];
        const kort = {
          bilde: ogMeta('og:image')?.startsWith('https://') ? 'absolutt' : ogMeta('og:image') ?? 'mangler',
          bredde: ogMeta('og:image:width'),
          høyde: ogMeta('og:image:height'),
          alt: ogMeta('og:image:alt')?.trim() ? 'satt' : 'mangler',
          twitter: /<meta name="twitter:card" content="([^"]*)"/.exec(html)?.[1],
        };
        expect({ side: page.path, ...kort }).toEqual({
          side: page.path,
          bilde: 'absolutt',
          bredde: '1200',
          høyde: '630',
          alt: 'satt',
          twitter: 'summary_large_image',
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
    // Delekortets alt-tekst (#65) er tekst en skjermleser leser opp og står i
    // hver eneste delte lenke — men den er et attributt på en <meta>, altså
    // usynlig for både brødteksten under og attributt-sveipen (som leser
    // `alt="…"`, ikke `content="…"`).
    const alt = /<meta property="og:image:alt" content="([^"]*)"/.exec(html)?.[1] ?? '';
    return `${title}\n${desc}\n${alt}`;
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

  // ── Hver brødsmule gikk gjennom ordboka (GitHub #63) ──────────────────
  //
  // Siste ledd på kapittelsiden sto som «Kap. 1» på alle åtte språk, og INGEN
  // av de tre sveipene over kunne se det: «Kap.» står ikke i ordlista, har
  // ingen æ/ø/å, og er ikke verdien til noen nøkkel — den gikk aldri gjennom
  // ordboka i det hele tatt. Kapittelsiden er den mest besøkte sida vi har.
  //
  // Invarianten er derfor ikke et ord, men en STRUKTURELL egenskap ved en
  // oversatt etikett: den SER FORSKJELLIG UT på to språk. Renderes en
  // brødsmule ordrett likt under /en/ og /nb/, gikk den enten aldri gjennom
  // `t()` — eller ordboka har SAMME verdi for samme nøkkel på begge språk
  // (`nav.offline` er «Offline» i begge, og det er ikke en feil).
  //
  // Den fanger dermed NESTE literal av samme slag uten at noen har ført opp
  // ordet, og uansett hvilket språk literalen tilfeldigvis er skrevet på: en
  // hardkodet «Chapter 1» ville vært like lik på tvers og like avslørt.
  describe('ingen brødsmule er den samme strengen på /en/ og /nb/', () => {
    const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

    /** Etikettene i brødsmulestien, i rekkefølge — både lenker og siste ledd. */
    function crumbs(html: string): string[] {
      return [...html.matchAll(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/g)].flatMap((nav) =>
        [...nav[0].matchAll(/<(a|span)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) =>
          m[2]!
            .replace(/<[^>]+>/g, '')
            .replace(/&([a-z]+|#\d+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
            .trim(),
        ),
      );
    }

    /**
     * Nøklene hvis verdi på DETTE språket er nøyaktig denne teksten. Nøkler med
     * `{plassholder}` sammenlignes som mønster — «Ch. {n}» må godta «Ch. 1»,
     * ellers ville vakta krevd at fiksen på denne saken ikke fantes.
     *
     * Et mønster uten bokstaver av eget («{a} – {b}») matcher hva som helst og
     * ville gjort vakta blind; det holdes utenfor.
     */
    function keysFor(locale: 'en' | 'nb'): (text: string) => Set<string> {
      const exact = new Map<string, string[]>();
      const patterns: { key: string; re: RegExp }[] = [];
      for (const [key, val] of Object.entries(DICTIONARIES[locale])) {
        const s = String(val).trim();
        if (!s) continue;
        if (!s.includes('{')) {
          exact.set(s, [...(exact.get(s) ?? []), key]);
          continue;
        }
        const parts = s.split(/\{[^}]*\}/);
        if (parts.join('').replace(/[^\p{L}]/gu, '').length < 3) continue;
        patterns.push({
          key,
          re: new RegExp(`^${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`),
        });
      }
      return (text: string) =>
        new Set([...(exact.get(text) ?? []), ...patterns.filter((p) => p.re.test(text)).map((p) => p.key)]);
    }
    const enKeys = keysFor('en');
    const nbKeys = keysFor('nb');

    /**
     * En etikett som er lik på begge språk er bare grei hvis ORDBOKA er enig:
     * det må finnes en nøkkel som har nettopp denne teksten på BEGGE språk.
     * «Offline» er `nav.offline` i både en og nb, og er dermed ikke en feil.
     *
     * At teksten bare finnes i den ENGELSKE ordboka holder ikke — da ville en
     * hardkodet «Ch. 1» (samme literal, skrevet på engelsk i stedet) sluppet
     * gjennom mens de sju andre språkene fortsatt sto på engelsk.
     */
    const oversattLikt = (text: string) => [...enKeys(text)].some((key) => nbKeys(text).has(key));

    /**
     * Etiketter som ER den samme strengen på begge språk fordi de kommer fra
     * DATAENE og er egennavn — et personnavn, en manuskripttittel.
     *
     * Lista skal være nesten tom, som `NORDIC_PROPER`: hver oppføring er en
     * påstand om at strengen ikke skal oversettes, ikke et sted å gjemme en
     * glemt oversettelse.
     */
    const PROPER_CRUMBS: string[] = [];

    for (const page of PAGES) {
      test(page.name, async () => {
        const en = crumbs((await fetchPage('en', page.path)).html);
        const nb = crumbs((await fetchPage('nb', page.path)).html);
        // Ulikt antall ledd på to språk er i seg selv en defekt — og uten
        // denne ville sammenligningen under stille gått på feil ledd.
        expect({ side: page.path, ledd: en.length }).toEqual({ side: page.path, ledd: nb.length });

        const funn = en.filter(
          (label, i) => label === nb[i] && !oversattLikt(label) && !PROPER_CRUMBS.includes(label),
        );
        expect({ side: page.path, uoversatte: [...new Set(funn)] }).toEqual({ side: page.path, uoversatte: [] });
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

  // ── Hreflang annonserer ALDRI en adresse som ikke finnes (GitHub #45) ──
  //
  // Klyngen ble generert generisk fra STIEN, uavhengig av om innholdet fantes i
  // språket. `reading_texts` er norsk-spesifikt og ligger bare på `nb`, så hver
  // lesedag annonserte sju 404-er — og `x-default`, adressen Google velger når
  // ingen språkvariant passer, pekte på en av dem. Feilloggen i prod gikk fra
  // ~50 rader i timen til 1542, hvorav 1228 var nettopp disse.
  //
  // Vakta sjekker det som faktisk er invarianten: hver annonserte URL svarer
  // 200. Derfor fanger den også neste innholdsslag som mangler et språk, uten at
  // noen må huske denne saken.
  describe('hreflang peker bare på sider som svarer 200', () => {
    /** Klyngen som HTML-en faktisk annonserer: hreflang → sti uten domenet. */
    function cluster(html: string): { lang: string; path: string }[] {
      return [...html.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => ({
        lang: m[1]!,
        path: m[2]!.replace(SITE, ''),
      }));
    }

    async function expectAllAlive(locale: string, path: string) {
      const { html } = await fetchPage(locale, path);
      const døde: string[] = [];
      for (const alt of cluster(html)) {
        const res = await app.request(alt.path);
        if (res.status !== 200) døde.push(`${alt.lang} → ${alt.path} (${res.status})`);
      }
      expect({ side: path, døde }).toEqual({ side: path, døde: [] });
    }

    test('kapittelsiden — alle åtte finnes', async () => {
      await expectAllAlive('de', '/1mos/1');
    });

    test('lesetekst-oversikten — 200 på alle åtte, også der lista er tom', async () => {
      await expectAllAlive('de', '/lesetekster');
    });

    test('lesedagen oppgir BARE nb + nn, og x-default peker dit', async () => {
      // Datoen hentes fra basen framfor å hardkodes: settet importeres på nytt
      // ved hver innholdsoppdatering, og en tom base skal gi rødt, ikke grønt.
      const texts = await getAllReadingTexts('nb');
      expect(texts.length).toBeGreaterThan(0);
      const date = texts[0]!.date;

      const { res, html } = await fetchPage('nb', `/lesetekster/${date}`);
      expect(res.status).toBe(200);

      const klynge = cluster(html);
      expect(klynge.map((a) => a.lang)).toEqual(['nb', 'nn', 'x-default']);
      // x-default må ligge INNENFOR settet — engelsk er 404 for denne siden.
      expect(klynge.find((a) => a.lang === 'x-default')!.path).toBe(`/nb/lesetekster/${date}`);

      await expectAllAlive('nb', `/lesetekster/${date}`);

      // Og de seks andre er fortsatt 404 — klyngen ble smalere fordi sidene
      // MANGLER, ikke fordi noen begynte å svare på dem.
      for (const locale of ['en', 'de', 'sv', 'fr', 'es', 'fi']) {
        const dead = await app.request(`/${locale}/lesetekster/${date}`);
        expect({ locale, status: dead.status }).toEqual({ locale, status: 404 });
      }
    });
  });
});
