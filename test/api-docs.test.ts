// EN REFERANSE SOM KAN LYVE, ER VERRE ENN INGEN (#114)
//
// API-et har 74 endepunkter og hadde ingen beskrivelse noe sted. Nå har det to
// flater — `/api/openapi.json` og `/api/docs` — og begge er bygget av
// `API_OPERATIONS`. Det flytter risikoen ett hakk: en spesifikasjon er en
// PÅSTAND om hva tjenesten gjør, og en påstand ingen måler, driver. Utslaget er
// stille på den verste måten vi kjenner (#45, #65, #69): den som leser
// dokumentet er ikke oss, og feilen viser seg i deres kode, ikke i vår logg.
//
// FEM HALVDELER
// -------------
// FORMEN     — går RUTETABELLEN og spesifikasjonen mot hverandre BEGGE veier:
//              en rute uten operasjon er rød, en operasjon uten rute likeså.
//              En ny rute i `src/routes/api/` blir dermed dokumentert eller
//              rød — den kan ikke bli usynlig i stillhet, som skjemaet i #46.
// DOKUMENTET — OpenAPI-formen: hver operasjon har oppsummering og svar, hver
//              sti-parameter er deklarert (og motsatt), hver etikett finnes,
//              og hver port peker på en sikkerhetsordning som er definert.
// EKSEMPLENE — sakens egen risiko: hver `prove.url` HENTES, og statusen må
//              være en av de dokumenterte. Et eksempel ingen har kjørt er en
//              gjetning med vår signatur på.
// SIDA       — `/api/docs` viser HVER operasjon, og fila den ber om finnes.
//              Uten den kunne dokumentet vært komplett mens sida viste halve.
// BREDDEN    — ekte Chrome på 320/390 px ved 100/150 % tekst. #50 er en klasse
//              som ikke bryr seg om hvem sida er skrevet for, og en referanse
//              er full av `/api/search/chapter-resources` og `x-contrib-token`.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import {
  API_OPERATIONS,
  API_TAGS,
  LANG_PARAM,
  openapiDocument,
  openapiPath,
  operationKey,
  UDOKUMENTERTE_RUTER,
  type ApiOperation,
} from '../src/lib/openapi.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

beforeAll(async () => {
  // Uten bokcachen svarer hver rute 500, og «eksempelet virker ikke» ville vært
  // umulig å skille fra «appen er ødelagt» (samme grunn som i #61s vakt).
  await initBooks();
});

/**
 * Rutene appen faktisk har under `/api`.
 *
 * `ALL /api/*` og søsknene er MIDDLEWARE (locale, bokdata, `requirePlus`), ikke
 * endepunkter — de har ingen egen kontrakt å dokumentere.
 */
function apiRoutes(): string[] {
  const routes = (app as unknown as { routes: { method: string; path: string }[] }).routes;
  const nøkler = new Set<string>();
  for (const rute of routes) {
    if (!rute.path.startsWith('/api')) continue;
    if (rute.method === 'ALL') continue;
    nøkler.add(operationKey(rute.method, rute.path));
  }
  return [...nøkler].sort();
}

const RUTER = apiRoutes();
const DOKUMENTERT = new Set(API_OPERATIONS.map((op) => operationKey(op.method, op.route)));

describe('FORMEN', () => {
  test('det finnes ruter og operasjoner å måle', () => {
    // Uten dette ville de to sveipene under bestått av en tom rutetabell —
    // altså målt ingenting, og sagt grønt om det.
    expect(RUTER.length).toBeGreaterThan(50);
    expect(API_OPERATIONS.length).toBeGreaterThan(50);
  });

  test('hver rute under /api er dokumentert', () => {
    const unntatt = new Set(UDOKUMENTERTE_RUTER.map((u) => operationKey(u.method, u.route)));
    const udokumenterte = RUTER.filter((n) => !DOKUMENTERT.has(n) && !unntatt.has(n));
    expect(udokumenterte).toEqual([]);
  });

  test('hver dokumentert operasjon er en ekte rute', () => {
    const finnes = new Set(RUTER);
    const spøkelser = [...DOKUMENTERT].filter((n) => !finnes.has(n)).sort();
    expect(spøkelser).toEqual([]);
  });

  test('hvert unntak er en ekte rute, med en grunn', () => {
    const finnes = new Set(RUTER);
    for (const unntak of UDOKUMENTERTE_RUTER) {
      expect(finnes.has(operationKey(unntak.method, unntak.route))).toBe(true);
      expect(unntak.why.length).toBeGreaterThan(20);
    }
  });

  test('ingen operasjon står oppført to ganger', () => {
    expect(DOKUMENTERT.size).toBe(API_OPERATIONS.length);
  });
});

describe('DOKUMENTET', () => {
  const doc = openapiDocument() as {
    openapi: string;
    info: { title: string; version: string; description: string };
    servers: { url: string }[];
    tags: { name: string }[];
    paths: Record<string, Record<string, Record<string, unknown>>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  test('er et OpenAPI 3.1-dokument med opphav og etiketter', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title.length).toBeGreaterThan(0);
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Opphavet bygges av `absoluteUrl()` (#80) — ikke av en literal i denne fila.
    expect(doc.servers[0]!.url).toMatch(/^https:\/\//);
    expect(doc.tags.length).toBe(API_TAGS.length);
  });

  test('hver operasjon i tabellen står i dokumentet', () => {
    for (const op of API_OPERATIONS) {
      const sti = openapiPath(op.route);
      expect(`${sti} ${op.method}`).toBe(`${sti} ${doc.paths[sti]?.[op.method] ? op.method : 'MANGLER'}`);
    }
  });

  test('stiene er OpenAPI-form, ikke hono-form', () => {
    for (const sti of Object.keys(doc.paths)) {
      // `:id{[0-9]+}` skal være `{id}`: en klientgenerator leser den rå formen
      // som en del av adressen og bygger `/api/reading-texts/:id%7B...%7D`.
      expect(`${sti} ${sti.includes(':') ? 'RÅ' : 'ok'}`).toBe(`${sti} ok`);
      expect(`${sti} ${/\{[^}]*[[\]]/.test(sti) ? 'REGEX' : 'ok'}`).toBe(`${sti} ok`);
    }
  });

  test('hver operasjon har oppsummering, svar og en kjent etikett', () => {
    const etiketter = new Set(API_TAGS.map((t) => t.name));
    for (const op of API_OPERATIONS) {
      const navn = operationKey(op.method, op.route);
      expect(`${navn}: ${op.summary.length > 0}`).toBe(`${navn}: true`);
      expect(`${navn}: ${Object.keys(op.responses).length > 0}`).toBe(`${navn}: true`);
      expect(`${navn}: ${etiketter.has(op.tag)}`).toBe(`${navn}: true`);
      for (const [status, tekst] of Object.entries(op.responses)) {
        expect(`${navn} ${status}: ${/^[1-5]\d\d$/.test(status)}`).toBe(`${navn} ${status}: true`);
        expect(`${navn} ${status}: ${tekst.length > 5}`).toBe(`${navn} ${status}: true`);
      }
    }
  });

  test('hver sti-parameter er deklarert, og hver deklarert finnes i stien', () => {
    for (const op of API_OPERATIONS) {
      const navn = operationKey(op.method, op.route);
      const iStien = [...openapiPath(op.route).matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!).sort();
      const deklarert = (op.params ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => p.name)
        .sort();
      expect(`${navn}: ${deklarert.join(',')}`).toBe(`${navn}: ${iStien.join(',')}`);
    }
  });

  test('hvert query-parameter er navngitt én gang og beskrevet', () => {
    for (const op of API_OPERATIONS) {
      const navn = operationKey(op.method, op.route);
      const params = [...(op.params ?? []), ...(op.lang ? [LANG_PARAM] : [])];
      const sett = new Set(params.map((p) => p.name));
      expect(`${navn}: ${sett.size}`).toBe(`${navn}: ${params.length}`);
      for (const p of params) {
        expect(`${navn}/${p.name}: ${p.description.length > 5}`).toBe(`${navn}/${p.name}: true`);
      }
    }
  });

  test('hver port peker på en definert sikkerhetsordning', () => {
    const ordninger = new Set(Object.keys(doc.components.securitySchemes));
    for (const op of API_OPERATIONS) {
      if (!op.auth) continue;
      expect(`${operationKey(op.method, op.route)}: ${ordninger.has(op.auth)}`).toBe(
        `${operationKey(op.method, op.route)}: true`,
      );
    }
  });
});

/** Hono-ruta som et mønster, så en `prove.url` ikke kan peke på et ANNET endepunkt. */
function ruteMønster(route: string): RegExp {
  const deler = route.split('/').map((del) => {
    const m = /^:([A-Za-z0-9_]+)(\{((?:[^{}]|\{[^{}]*\})*)\})?$/.exec(del);
    if (!m) return del.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return m[3] ?? '[^/]+';
  });
  return new RegExp(`^${deler.join('/')}$`);
}

describe('EKSEMPLENE', () => {
  const medProve = API_OPERATIONS.filter((op) => op.prove);

  test('en operasjon uten eksempel har en skreven grunn', () => {
    for (const op of API_OPERATIONS) {
      if (op.prove) continue;
      const navn = operationKey(op.method, op.route);
      expect(`${navn}: ${(op.ikkeProvd ?? '').length > 30}`).toBe(`${navn}: true`);
    }
    // Og de fleste MÅ ha ett: uten dette ville «fjern alle prove-feltene»
    // gjort hele halvdelen til en tom påstand.
    expect(medProve.length).toBeGreaterThan(API_OPERATIONS.length - 5);
  });

  test('hvert eksempel peker på operasjonens egen rute', () => {
    for (const op of medProve) {
      const sti = new URL(op.prove!.url, 'http://x').pathname;
      const navn = operationKey(op.method, op.route);
      expect(`${navn}: ${ruteMønster(op.route).test(sti) ? 'ok' : sti}`).toBe(`${navn}: ok`);
    }
  });

  test('hver forventet status er dokumentert', () => {
    for (const op of medProve) {
      const navn = operationKey(op.method, op.route);
      for (const status of op.prove!.forventet) {
        expect(`${navn} ${status}: ${op.responses[status] ? 'dokumentert' : 'udokumentert'}`).toBe(
          `${navn} ${status}: dokumentert`,
        );
      }
    }
  });

  test('hvert eksempel HENTES, og svarer det dokumentet lover', async () => {
    const avvik: string[] = [];
    for (const op of medProve) {
      const { url, body, forventet } = op.prove!;
      const init: RequestInit =
        op.method === 'get'
          ? { method: 'GET' }
          : {
              method: op.method.toUpperCase(),
              ...(body !== undefined && {
                body: JSON.stringify(body),
                headers: { 'content-type': 'application/json' },
              }),
            };
      const res = await app.request(url, init);
      const navn = `${op.method.toUpperCase()} ${url}`;
      if (!forventet.includes(res.status)) {
        avvik.push(`${navn} → ${res.status}, ventet ${forventet.join('/')}`);
        continue;
      }
      // Medietypen er også en påstand: et JSON-endepunkt som svarer HTML er
      // like ødelagt for en klient som en 500.
      if (res.status === 200) {
        const type = res.headers.get('content-type') ?? '';
        const forventetType = op.produces ?? 'application/json';
        if (!type.includes(forventetType.split(';')[0]!)) {
          avvik.push(`${navn} → content-type ${type}, ventet ${forventetType}`);
        }
      }
    }
    expect(avvik).toEqual([]);
  });
});

describe('SIDA', () => {
  let html = '';

  beforeAll(async () => {
    const res = await app.request('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    html = await res.text();
  });

  test('viser hver operasjon i tabellen', () => {
    const blokker = html.split('class="doc-op"').slice(1);
    const mangler = API_OPERATIONS.filter((op: ApiOperation) => {
      const sti = openapiPath(op.route);
      // Metoden OG stien i SAMME blokk: `GET /api/verses` og `POST /api/verses`
      // er to kontrakter, og en side som bare viste stiene ville skjult den ene.
      return !blokker.some((blokk) => blokk.includes(`>${sti}<`) && blokk.includes(`>${op.method.toUpperCase()}<`));
    });
    expect(mangler.map((op) => operationKey(op.method, op.route))).toEqual([]);
  });

  test('peker på spesifikasjonen, og den svarer', async () => {
    expect(html).toContain('/api/openapi.json');
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { openapi: string }).openapi).toBe('3.1.0');
  });

  test('hver fil sida ber om serveres faktisk', async () => {
    const filer = [...html.matchAll(/(?:href|src)="(\/(?:css|js)\/[^"]+)"/g)].map((m) => m[1]!);
    // Uten dette ville halvdelen bestått av en side uten stil og uten øy.
    expect(filer.length).toBeGreaterThan(1);
    for (const fil of filer) {
      const res = await app.request(fil);
      expect(`${fil} → ${res.status}`).toBe(`${fil} → 200`);
    }
  });

  /** Attributtverdien slik den STÅR i HTML-en — `&` er `&amp;` i en `value=`. */
  const attr = (verdi: string) =>
    verdi.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  test('«Send» sender operasjonens eget eksempel', () => {
    for (const op of API_OPERATIONS) {
      if (!op.prove) continue;
      // Adressen leseren kan kjøre er den vakta over nettopp hentet — ikke et
      // eksempel som aldri er prøvd.
      const navn = operationKey(op.method, op.route);
      expect(`${navn}: ${html.includes(`value="${attr(op.prove.url)}"`)}`).toBe(`${navn}: true`);
    }
  });
});

/**
 * BREDDEN — i ekte Chrome, av samme grunn som `mobile-layout.test.ts`: SSR-HTML
 * har ingen layout, og happy-dom gir nuller fra `getBoundingClientRect()`.
 *
 * Sida står ikke i `PAGES` (den er ett engelsk dokument utenfor
 * språkprefiksene), så uten denne halvdelen ville den vært den ene sida ingen
 * måler — og en referanse er nettopp full av ord som ikke får plass på 320 px.
 */
describe('BREDDEN', () => {
  let server: ReturnType<typeof Bun.serve>;
  let chrome: Chrome;
  let page: Page;

  beforeAll(async () => {
    server = Bun.serve({ port: 0, fetch: createApp().fetch });
    chrome = await Chrome.launch();
    page = await chrome.open('about:blank');
  }, 60_000);

  afterAll(async () => {
    await page?.close();
    await chrome?.close();
    server?.stop(true);
  }, 30_000);

  function measure(scale: number) {
    const de = document.documentElement;
    const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    const original = els.map((el) => el.style.fontSize);
    if (scale !== 1) {
      const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
      els.forEach((el, i) => {
        if (sizes[i]) el.style.fontSize = `${sizes[i]! * scale}px`;
      });
    }
    const inScroller = (el: Element | null) => {
      for (let n = el?.parentElement ?? null; n && n !== de; n = n.parentElement) {
        if (getComputedStyle(n).overflowX !== 'visible') return true;
      }
      return false;
    };
    const offenders: string[] = [];
    if (de.scrollWidth > de.clientWidth) {
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || !r.height || r.right <= de.clientWidth + 1 || inScroller(el)) continue;
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} @${Math.round(r.right)}`);
      }
      // Et for langt ORD har ingen element-rect å måle: boksen er smal nok, og
      // teksten stikker ut av den. Uten dette svarer vakta «for bred» og peker
      // på ingenting — og det er da man begynner å gjette (#50).
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue?.trim() || inScroller(n.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.right <= de.clientWidth + 1) continue;
        offenders.push(`«${n.nodeValue.trim().slice(0, 30)}» @${Math.round(r.right)}`);
      }
    }
    const result = { clientWidth: de.clientWidth, scrollWidth: de.scrollWidth, offenders: offenders.slice(0, 5) };
    if (scale !== 1) els.forEach((el, i) => (el.style.fontSize = original[i]!));
    return result;
  }

  for (const width of [320, 390]) {
    for (const scale of [1, 1.5]) {
      test(`/api/docs er ikke bredere enn ${width} px ved ${scale * 100} % tekst`, async () => {
        await page.setViewport({ width, height: 800 });
        await page.navigate(`http://localhost:${server.port}/api/docs`);
        const { clientWidth, scrollWidth, offenders } = await page.evaluate(measure, scale);
        // 1 px slingring er Chromes avrunding, ikke overflyt (som #50s vakt).
        const overflyt = scrollWidth - clientWidth;
        expect(overflyt > 1 ? `${overflyt} px for bred: ${offenders.join(', ')}` : 'ok').toBe('ok');
      });
    }
  }
});
