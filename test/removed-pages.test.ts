// EN FJERNET SIDE ER FJERNET HELE VEIEN (GitHub #58).
//
// `/kjente-vers` ble drevet av `important_verses`, og KILDEN til den tabellen
// ble slettet i free-bible 2026-07-29 (`0afddcdb8`) — blant annet fordi tre av
// referansene pekte på feil vers (fila brukte europeisk versnummerering, osnb
// følger hebraisk). Importøren har ingen slettesti når en KILDEKATALOG
// forsvinner: `contentLanguages()` gir `[]`, løkka hopper over, og de 62 radene
// ble stående. Siden serverte altså i månedsvis nøyaktig de feilene kilden ble
// slettet for, og ingen kunne regenerere den.
//
// Å fjerne en side er mer enn å slette en rute. Sida sto i navigasjonen, i
// kommandopaletten, på hurtigtast K, blant oppdagelseskortene på forsiden, i
// verktøylista på /om, i sitemapen og i åtte ordbøker. Hver av dem er en egen
// måte å nå en side som ikke finnes, og et halvt fjernet innslag er verre enn
// et helt: leseren klikker og får 404, og ingen logglinje sier hvorfor.
//
// Derfor er invariantene formulert på SIDEN, ikke på kjente-vers: en ny
// oppføring i `REMOVED_PAGES` arver alle seks gratis.
//
// GRENSEN: dette er vakta for at siden er BORTE. At tabellen ikke kan bli
// stående foreldreløs igjen — for et hvilket som helst innholdsslag — er en
// annen invariant, og den bor i `content-sources.test.ts`.

import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { getSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { STATIC_PATHS } from '../src/lib/sitemap-paths.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';
import { LOCALES, href } from '../src/lib/i18n.ts';
import { PAGES } from './pages.ts';

const app = createApp();

beforeAll(async () => {
  await initBooks();
});

interface RemovedPage {
  /** Stien slik den sto i navigasjonen. */
  path: string;
  /** Tabellen som drev sida, hvis den også skal være borte. */
  table?: string;
  /**
   * Ordboksnøklene sida eide. Prefiks (`kv.`) dekker en hel familie.
   * En nøkkel som blir liggende er ikke en feil leseren ser — den er en
   * invitasjon til å ta siden inn igjen uten å ha løst hvorfor den gikk ut.
   */
  keys: string[];
}

const REMOVED_PAGES: RemovedPage[] = [
  {
    path: '/kjente-vers',
    table: 'important_verses',
    keys: ['kv.', 'nav.knownVerses', 'disc.knownVerses', 'about.tool.knownVerses'],
  },
];

const JS_DIR = join(import.meta.dir, '..', 'public', 'js');

describe.each(REMOVED_PAGES)('fjernet side: $path', (removed) => {
  // 410 GONE, ikke 404. Adressen har stått i sitemapen og i navigasjonen i
  // månedsvis, altså er den indeksert og bokmerket. 404 sier «finnes ikke her
  // nå» og blir prøvd igjen; 410 sier «fjernet med vilje» og tas ut av indeksen.
  test('svarer 410 på alle åtte språkprefikser', async () => {
    const feil: { url: string; status: number }[] = [];
    for (const locale of LOCALES) {
      const url = href(locale, removed.path);
      const status = (await app.request(url)).status;
      if (status !== 410) feil.push({ url, status });
    }
    expect(feil).toEqual([]);
  });

  // …og den uprefiksede adressen skal fortsatt forhandle språk framfor å 404-e,
  // ellers ville leseren fått to forskjellige svar på samme fjernede side.
  test('den uprefiksede adressen forhandles fram til 410-svaret', async () => {
    const res = await app.request(removed.path);
    expect(res.status).toBe(302);
    const target = res.headers.get('location')!;
    expect((await app.request(target)).status).toBe(410);
  });

  test('står ikke i sitemapen', async () => {
    expect(STATIC_PATHS).not.toContain(removed.path);
    for (const locale of LOCALES) {
      const xml = await (await app.request(`/sitemap-${locale}.xml`)).text();
      expect(xml).not.toContain(`${removed.path}<`);
    }
  });

  // Sveipen over HELE `PAGES`, ikke bare forsiden: lenka lå i chrome-navigasjonen
  // (hver side), blant oppdagelseskortene (forsiden) og i verktøylista (/om).
  // En invariant som bare så på ett av stedene ville bestått mens de to andre
  // fortsatt sendte leseren til en fjernet side.
  test('ingen side lenker dit', async () => {
    const funnet: string[] = [];
    for (const page of PAGES) {
      const html = await (await app.request(href('nb', page.path))).text();
      if (html.includes(`href="/nb${removed.path}"`)) funnet.push(page.path);
    }
    expect(funnet).toEqual([]);
  });

  // Klient-øyene bygger DOM i nettleseren og er usynlige for sveipen over (#33).
  // Kommandopaletten og hurtigtast-hjelpen navigerte begge hit.
  test('ingen klient-øy navigerer dit', () => {
    const funnet: string[] = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
      const code = readFileSync(join(JS_DIR, file), 'utf8');
      if (code.includes(removed.path)) funnet.push(file);
      for (const key of removed.keys) {
        if (code.includes(key)) funnet.push(`${file} (${key})`);
      }
    }
    expect(funnet).toEqual([]);
  });

  test('ordbøkene har ingen nøkler igjen for sida', () => {
    const rester: string[] = [];
    for (const [locale, dict] of Object.entries(DICTIONARIES)) {
      for (const key of Object.keys(dict)) {
        if (removed.keys.some((k) => (k.endsWith('.') ? key.startsWith(k) : key === k))) {
          rester.push(`${locale}: ${key}`);
        }
      }
    }
    expect(rester).toEqual([]);
  });

  // PROD-RYDDINGEN. Radene lever i databasen, ikke i imaget, så en fjernet rute
  // alene lar 62 foreldreløse rader ligge igjen. `ensureSchema()` kjøres ved
  // HVER deploy (samme sted som #46 og #61 rydder fra), og det er dette kallet
  // som gjør at prod faktisk blir rydda uten å vente på en innholdsimport.
  test('tabellen finnes ikke i basen etter ensureSchema()', async () => {
    if (!removed.table) return;
    await ensureSchema(getSql());
    const rows = (await getSql()`
      SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ${removed.table}
    `) as { n: number }[];
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
