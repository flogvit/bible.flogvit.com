// TILGJENGELIGHET — erklæringen og WCAG 2.1 AA-sjekken (#163,
// flogvit-com#341, kontrakten er portal/TILGJENGELIGHET.md).
//
// Fellesdelen eies av portalen: `src/lib/tilgjengelighet.ts` (siden, strengene,
// `kontroller()`) og `test/tilgjengelighet-sjekk.ts` (axe-core, fokus og
// tekstforstørrelse i vår egen Chrome-side). Begge er kopier byte for byte, og
// fellesdelens OPPFØRSEL testes i portalen. Her holdes bibels del, i fem ting:
//
//   KOPIENE    er portalens filer på origin/main.
//   DATAENE    `kontroller(ERKLAERING)` er tom — den blir rød når erklæringen
//              er mer enn et år gammel, og det er den årlige gjennomgangen som
//              melder seg selv.
//   SIDEN      `/<lang>/tilgjengelighet` svarer på alle åtte språk med
//              fellessiden i vår layout, og de gamle strengene er borte.
//   FOOTEREN   lenker erklæringen på hver side i matrisen, på hvert språk —
//              også 404- og 410-siden.
//   CHROME     axe-core (WCAG 2.0/2.1 A+AA), synlig fokus (2.4.7) og `lang`
//              på hebraisk/gresk (3.1.2) på hver sidetype, i lys og mørk
//              modus; de språkfølsomme på alle åtte språk, de som endrer seg
//              for en innlogget leser også med Plus (se MATRISEN) — og
//              sjekken finner et plantet brudd, så grønt betyr noe.
//
// Kjøres med én nettleser og høyst to faner (eierens tak for maskinen).
//
// Bredden ved 150 % tekst (1.4.4/1.4.10) måles av `mobile-layout.test.ts`, som
// gjør det samme som `tekstForstørret()` og mer (#50, #70). Den er ikke kopiert
// hit.
//
// Ingen unntaksliste. Et brudd som ikke kan rettes nå, står i erklæringens
// `brudd` — og en side tas da ut av sjekken HER, med en kommentar som peker på
// saken og bruddet.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { href, LOCALES, makeT, type Locale } from '../src/lib/i18n.ts';
import { ERKLAERING } from '../src/lib/tilgjengelighet-erklaering.ts';
import { LANGS as A11Y_LANGS, STI, kontroller, lenketekst, side, tittel } from '../src/lib/tilgjengelighet.ts';
import { axeKilde, beskriv, finnPortal, fokusUsynlig, kjørAxe, plantBrudd, portalfil } from './tilgjengelighet-sjekk.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { kontoUser, startMockKonto } from './mock-konto.ts';
import { PAGES } from './pages.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));

/* ---------------------------------------------------------------- kopiene --- */

describe('KOPIENE er portalens filer', () => {
  const PORTAL = finnPortal(ROOT);

  test('portal-utsjekken finnes, ellers kan kopiene ikke sammenlignes', () => {
    expect(PORTAL).not.toBeNull();
  });

  for (const [kopi, sti] of [
    ['src/lib/tilgjengelighet.ts', 'design/tilgjengelighet.ts'],
    ['test/tilgjengelighet-sjekk.ts', 'design/tilgjengelighet-sjekk.ts'],
  ] as const) {
    test(`${kopi} = portal/${sti} (skriv den med \`bun tilgjengelighetkopi.ts --skriv\` i meta-repoet)`, () => {
      const fasit = portalfil(PORTAL!, sti);
      expect(fasit).not.toBeNull();
      expect(readFileSync(resolve(ROOT, kopi), 'utf8').trimEnd()).toBe(fasit!.trimEnd());
    });
  }

  test('språklista i kopien er bibels', () => {
    expect([...A11Y_LANGS]).toEqual([...LOCALES]);
  });
});

/* ---------------------------------------------------------------- dataene --- */

describe('DATAENE holder', () => {
  test('kontroller(ERKLAERING) er tom', () => {
    expect(kontroller(ERKLAERING)).toEqual([]);
  });
});

/* ------------------------------------------------- server + Chrome (felles) --- */

let server: ReturnType<typeof Bun.serve>;
let konto: ReturnType<typeof Bun.serve>;
let chrome: Chrome;
let sider: Page[] = [];
let kilde: string;
/** Eierens tak for porteføljens nettlesertester: én nettleser, høyst to faner. */
const PARALLELT = 2;

/** Cookie-verdien den falske kontoen kjenner igjen som en Plus-leser. */
const PLUS = 'a11y-plus';

type Tema = 'lys' | 'mørk';
type Jobb = { url: string; navn: string; tema: Tema; plus: boolean };

const url = (locale: Locale, p: string) => {
  // `/api/docs` har sin egen layout og står utenfor språkprefikset.
  if (p.startsWith('/api/')) return `http://localhost:${server.port}${p}`;
  const [path, query] = p.split('?');
  return `http://localhost:${server.port}${href(locale, path!)}${query ? `?${query}` : ''}`;
};

/**
 * Detaljsidene står ikke i `PAGES` (sidekontrakten og breddevakta måler dem
 * gjennom oversiktene). Her er de egne sidetyper med egne komponenter, så hver
 * får én representant — funnet i oversiktens egne lenker, så id-en er en som
 * finnes i dataene.
 */
const DETALJER: { name: string; oversikt: string; mønster: RegExp }[] = [
  { name: 'person (detalj)', oversikt: '/personer', mønster: /\/personer\/[^"/?#]+/ },
  { name: 'tema (detalj)', oversikt: '/temaer', mønster: /\/temaer\/[^"/?#]+/ },
  { name: 'historie (detalj)', oversikt: '/historier', mønster: /\/historier\/[^"/?#]+/ },
  { name: 'dag (detalj)', oversikt: '/dager', mønster: /\/dager\/[^"/?#]+/ },
  { name: 'oversettelse (detalj)', oversikt: '/oversettelser', mønster: /\/oversettelser\/[^"/?#]+/ },
];

/** Sidetypene som måles: hele matrisen, detaljsidene, og grunnteksten. */
const SIDETYPER: { path: string; name: string }[] = [];

beforeAll(async () => {
  kilde = axeKilde(ROOT);
  await initBooks();
  konto = startMockKonto({ [PLUS]: () => kontoUser({ id: 9_163, plus: true, displayName: 'Kari Nordmann-Eksempelsen' }) });
  server = Bun.serve({ port: 0, fetch: createApp().fetch });

  SIDETYPER.push(...PAGES.map(({ path, name }) => ({ path, name })));
  // Grunnteksten: hebraisk og gresk tekst skal bære `lang` (3.1.2).
  SIDETYPER.push({ path: '/1mos/1?bible=tanach', name: 'kapittel på hebraisk (Tanach)' });
  SIDETYPER.push({ path: '/joh/1?bible=sblgnt', name: 'kapittel på gresk (SBLGNT)' });
  SIDETYPER.push({ path: '/tekst?refs=1mo-1-1-5,joh-3-16', name: 'versreferanser (/tekst med vers)' });
  // Lesetekstene er norsk kirkeinnhold (#76): de andre språkene sendes til /nb/.
  SIDETYPER.push({ path: '/lesetekster/2026-12-24', name: 'lesetekst (dato)' });
  SIDETYPER.push({ path: '/mine-bidrag', name: 'mine bidrag' });
  SIDETYPER.push({ path: '/offline-fallback', name: 'offline-reserven (service workeren)' });
  SIDETYPER.push({ path: '/api/docs', name: 'API-dokumentasjonen (egen layout, engelsk)' });
  for (const d of DETALJER) {
    const html = await (await fetch(url('en', d.oversikt))).text();
    const funnet = html.match(d.mønster)?.[0];
    if (!funnet) throw new Error(`fant ingen lenke til ${d.name} på ${d.oversikt}`);
    SIDETYPER.push({ path: funnet.replace(/^\/en(?=\/)/, ''), name: d.name });
  }

  chrome = await Chrome.launch();
  for (let i = 0; i < PARALLELT; i++) {
    const page = await chrome.open('about:blank');
    // Én gang per fane: bredden endres ikke mellom jobbene.
    await page.emulateFocus();
    await page.setViewport({ width: 1280, height: 900, mobile: false });
    sider.push(page);
  }
}, 120_000);

afterAll(async () => {
  for (const p of sider) await p.close();
  await chrome?.close();
  server?.stop(true);
  konto?.stop(true);
}, 30_000);

/* ------------------------------------------------------------------ siden --- */

describe('SIDEN svarer på alle språk, med fellessiden i vår layout', () => {
  for (const locale of LOCALES) {
    test(`/${locale}${STI}`, async () => {
      const res = await fetch(url(locale, STI));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<article class="fv-a11y"');
      expect(html).toContain(`<title>${tittel(locale)}`);
      // Fellessiden ER innholdet: ingen rester av den gamle erklæringen.
      expect(html.replace(/&amp;/g, '&')).toContain(side(locale, ERKLAERING).match(/<h1>([^<]*)<\/h1>/)![1]!.replace(/&amp;/g, '&'));
      expect(html).not.toContain('WCAG 2.2');
      expect(html).not.toMatch(/a11y\.[a-zA-Z]/);
    });
  }
});

/* ---------------------------------------------------------------- footeren --- */

describe('FOOTEREN lenker erklæringen på hver side, på hvert språk', () => {
  test('hele matrisen × alle språk', async () => {
    const mangler: string[] = [];
    for (const p of PAGES) {
      for (const locale of LOCALES) {
        const html = await (await fetch(url(locale, p.path))).text();
        const footer = html.slice(html.lastIndexOf('<footer'));
        if (!footer.includes(`href="/${locale}${STI}">${lenketekst(locale)}</a>`)) mangler.push(`/${locale}${p.path}`);
      }
    }
    expect(mangler).toEqual([]);
  }, 120_000);

  test('/api/docs, som har sin egen layout', async () => {
    const html = await (await fetch(url('en', '/api/docs'))).text();
    expect(html.slice(html.lastIndexOf('<footer'))).toContain(`href="/en${STI}">${lenketekst('en')}</a>`);
  });

  test('kommandopalettens «foot.a11y» er fellesdelens lenketekst på hvert språk', () => {
    // Paletten (cmdk.js) får strengen fra ordboka; footeren fra fellesdelen.
    // Én tekst for samme side — denne holder dem like.
    expect(LOCALES.filter((l) => makeT(l)('foot.a11y') !== lenketekst(l))).toEqual([]);
  });
});

/* ----------------------------------------------------------------- Chrome --- */

/**
 * Temaet settes slik leseren setter det: `fv-prefs`-cookien (portal/PREFS.md),
 * som layoutens blokkerende snutt leser FØR første maling — og EKSPLISITT i
 * begge retninger. Uten den følger siden `prefers-color-scheme`, og hva den er,
 * avhenger av maskinen (headless Chrome på en Mac i mørk modus svarer «dark»).
 * Å bytte `data-fv-theme` etter lasting målte fargene MIDT i overgangen
 * (`transition: color`), altså farger ingen ser. Systemets mørke modus bruker
 * de samme fargene som `dark`.
 */
function settTilstand(theme: string, sesjon: string) {
  document.cookie = `fv-prefs=${encodeURIComponent(JSON.stringify({ theme }))}; path=/`;
  document.cookie = sesjon ? `fv-session=${sesjon}; path=/` : 'fv-session=; path=/; max-age=0';
}

/**
 * WCAG 3.1.2: hebraisk og gresk tekst skal stå i et element med riktig `lang`
 * — ellers leser skjermleseren grunnteksten med sidens uttale. axe ser ikke
 * dette (den vet ikke hvilket språk en tekst ER), så det måles her: hver
 * tekstnode som er REN grunnskrift — hebraiske eller greske bokstaver og ingen
 * latinske (versteksten i Tanach/SBLGNT, parallellene, grunntekststripa,
 * ordlistene) — skal ha `lang` he/hbo eller el/grc på seg selv eller en
 * forelder.
 *
 * Enkeltord INNE I prosa på et annet språk («Abaddon (Hebrew: אֲבַדּוֹן) …» i
 * fotnoter, personkort, studieblokker) er et KJENT BRUDD: det står i
 * erklæringens `brudd` (3.1.2) og rettes i #166. Derfor teller ikke en node som
 * også har latinske bokstaver — og den grensen er det #166 skal fjerne.
 */
function grunnspråkUtenLang(): string[] {
  const ut: string[] = [];
  const gå = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = gå.nextNode(); n; n = gå.nextNode()) {
    const tekst = n.textContent ?? '';
    const hebraisk = (tekst.match(/[\u05D0-\u05EA]/g) ?? []).length;
    const gresk = (tekst.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) ?? []).length;
    const latin = (tekst.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length;
    if (!hebraisk && !gresk) continue;
    if (latin > 0) continue; // #166: ord inne i prosa (erklæringens brudd på 3.1.2)
    const el = n.parentElement;
    if (!el || el.closest('script, style, template, [aria-hidden="true"]')) continue;
    const lang = (el.closest('[lang]')?.getAttribute('lang') ?? '').toLowerCase().split('-')[0];
    const riktig = hebraisk > gresk ? ['he', 'hbo'] : ['el', 'grc'];
    if (!riktig.includes(lang!)) ut.push(`<${el.tagName.toLowerCase()}${el.className ? ` class="${el.className}"` : ''}> «${tekst.trim().slice(0, 30)}» har lang="${lang}"`);
  }
  return [...new Set(ut)].slice(0, 10);
}

async function kjør(page: Page, j: Jobb): Promise<string[]> {
  const hvor = `${j.navn} (${j.tema}${j.plus ? ', Plus' : ''})`;
  await page.navigate(j.url);
  const funn = await kjørAxe(page, kilde);
  const feil = funn.length ? [beskriv(hvor, funn)] : [];
  const usynlig = await fokusUsynlig(page);
  if (usynlig.length) feil.push(`${hvor}: fokus vises ikke (2.4.7) på\n    ${usynlig.join('\n    ')}`);
  const utenLang = await page.evaluate(grunnspråkUtenLang);
  if (utenLang.length) feil.push(`${hvor}: grunntekst uten riktig lang (3.1.2):\n    ${utenLang.join('\n    ')}`);
  return feil;
}

/**
 * Fordeler jobbene på fanene. Tema og innlogging er cookies, og fanene deler
 * nettleser — derfor kjøres hver tilstand (tema × innlogget) for seg, og
 * cookiene settes én gang før jobbene i den.
 */
async function kjørAlle(jobber: Jobb[]): Promise<string[]> {
  const feil: string[] = [];
  for (const tema of ['lys', 'mørk'] as const) {
    for (const plus of [false, true]) {
      const gruppe = jobber.filter((j) => j.tema === tema && j.plus === plus);
      if (!gruppe.length) continue;
      const page0 = sider[0]!;
      await page0.navigate(url('en', '/om')); // cookiene kan bare settes fra vår egen opprinnelse
      await page0.evaluate(settTilstand, tema === 'mørk' ? 'dark' : 'light', plus ? PLUS : '');
      let neste = 0;
      await Promise.all(
        sider.map(async (page) => {
          while (neste < gruppe.length) {
            const j = gruppe[neste++]!;
            // Ett nytt forsøk når NETTLESEREN svikter (CDP-tidsavbrudd på en
            // travel maskin) — aldri når siden har brudd. Svikter den to
            // ganger, er det en rød test, ikke et stille hopp.
            try {
              feil.push(...(await kjør(page, j)));
            } catch {
              try {
                feil.push(...(await kjør(page, j)));
              } catch (e) {
                feil.push(`${j.navn} (${j.tema}): kunne ikke måles — ${(e as Error).message}`);
              }
            }
          }
        }),
      );
    }
  }
  return feil;
}

describe('axe-sjekken måler faktisk noe', () => {
  test('finner det plantede bruddet (1.1.1, image-alt), og ikke uten', async () => {
    const page = sider[0]!;
    await page.navigate(url('en', '/om'));
    expect((await kjørAxe(page, kilde)).map((f) => f.regel)).toEqual([]);
    await plantBrudd(page);
    expect((await kjørAxe(page, kilde)).map((f) => f.regel)).toContain('image-alt');
  }, 60_000);

  test('fokussjekken ser en lenke uten synlig fokus', async () => {
    const page = sider[0]!;
    await page.navigate(url('en', '/om'));
    await page.evaluate(() => {
      document.querySelector('main')!.insertAdjacentHTML(
        'beforeend',
        '<style>main a.a11y-uten,main a.a11y-uten:focus,main a.a11y-uten:focus-visible{outline:none!important;box-shadow:none!important;background:none!important;color:inherit!important;text-decoration:none!important;border:0!important;transition:none!important}</style><a class="a11y-uten" href="#x">uten</a>',
      );
    });
    expect((await fokusUsynlig(page)).some((u) => u.includes('a.a11y-uten'))).toBe(true);
  }, 60_000);
});

/**
 * MATRISEN. Hver sidetype måles på engelsk i lys og mørk modus. Sidene der
 * SPRÅKET kan gjøre en forskjell — chromen alle sider deler, lesesida med
 * grunnteksten, søket, skjemaene, feilsidene og erklæringen selv — måles på
 * alle åtte. Sidene som ser annerledes ut for en innlogget Plus-leser, måles
 * også slik, på engelsk og bokmål. Alle 55 × 8 × 2 × 2 ville vært over 1700
 * målinger; dette er omtrent 300, med hver komponent dekket.
 */
const ALLE_SPRÅK = ['/', '/1mos/1', '/1mos/12', '/1mos/1?bible=tanach', '/sok?q=gud', '/innstillinger', '/om', '/offline', '/tilgjengelighet', '/finnes-ikke'];
const INNLOGGET = ['/', '/1mos/1', '/favoritter', '/notater', '/emner', '/lister', '/innstillinger', '/lesekart', '/leseplan', '/manuskripter', '/mine-bidrag', '/bidra', '/oversettelser', '/offline'];

function jobberFor(plus: boolean): Jobb[] {
  const jobber: Jobb[] = [];
  const sett = new Set<string>();
  for (const s of SIDETYPER) {
    if (plus && !INNLOGGET.includes(s.path)) continue;
    const språk: readonly Locale[] = plus ? ['en', 'nb'] : ALLE_SPRÅK.includes(s.path) ? LOCALES : ['en'];
    for (const locale of språk) {
      for (const tema of ['lys', 'mørk'] as const) {
        const u = url(locale, s.path);
        if (sett.has(`${u} ${tema}`)) continue;
        sett.add(`${u} ${tema}`);
        jobber.push({ url: u, navn: `${new URL(u).pathname}${new URL(u).search} — ${s.name}`, tema, plus });
      }
    }
  }
  return jobber;
}

describe('ingen sidetype har A/AA-brudd — lys og mørk, utlogget og innlogget', () => {
  test('matrisen dekker det den lover', () => {
    for (const p of [...ALLE_SPRÅK, ...INNLOGGET]) expect(SIDETYPER.map((s) => s.path)).toContain(p);
  });

  for (const plus of [false, true]) {
    test(plus ? 'innlogget med Plus (en, nb)' : 'utlogget', async () => {
      const feil = await kjørAlle(jobberFor(plus));
      if (feil.length) throw new Error(`${feil.length} side(r) med brudd:\n\n${feil.join('\n\n')}`);
      expect(feil).toEqual([]);
    }, 1_200_000);
  }
});
