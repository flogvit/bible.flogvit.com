// EGNE OVERSETTELSER PÅ ALLE ENHETER (#134)
//
// Plus lover «egne opplastede bibeloversettelser, tilgjengelige overalt». Synken
// fantes, men bodde i translations.js og kjørte bare på /oversettelser. På en ny
// enhet viste lesesiden derfor OSNB med «har ikke dette kapittelet», og velgeren
// manglet den egne bibelen — helt til leseren tilfeldigvis var innom den sida.
// Og en sletting på A nådde aldri B: løkka hoppet over `deleted` fra serveren og
// lot den lokale kopien stå.
//
// Målt med TO Chrome-profiler (to enheter) og samme Pluss-bruker, fordi begge
// halvdelene er egenskaper ved samspillet mellom IndexedDB på hver enhet og
// kontoen — ingen av dem finnes i SSR-HTML-en eller i happy-dom.

import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql, getSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { kontoUser, startMockKonto } from './mock-konto.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const TEST_USER_ID = 990134;
const NAME = 'Testbibel 134';
const VERSE_1 = 'I opphavet laget Gud himmel og jord, sa testbibelen.';
const TEXT = [`1 Mos 1,1 ${VERSE_1}`, '1 Mos 1,2 Og jorda var tom.'].join('\n');

let server: ReturnType<typeof Bun.serve>;
let mock: ReturnType<typeof Bun.serve>;
const chromes: Chrome[] = [];

async function cleanup() {
  const sql = getSql();
  // Kapitlene går med på kjøpet (FK med ON DELETE CASCADE).
  await sql`DELETE FROM user_bibles WHERE user_id = ${TEST_USER_ID}`;
}

beforeAll(async () => {
  mock = startMockKonto({
    plus134: () => kontoUser({ id: TEST_USER_ID, plus: true, plusUntil: '2099-01-01T00:00:00.000Z' }),
  });
  await ensureSchema(getSql());
  await initBooks();
  await cleanup();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
}, 60_000);

afterAll(async () => {
  for (const c of chromes) await c.close();
  server?.stop(true);
  mock?.stop(true);
  await cleanup();
  await closeSql();
});

const base = () => `http://localhost:${server.port}`;

/** En «enhet»: egen Chrome-profil, innlogget som samme Pluss-bruker. */
async function device(): Promise<Page> {
  const chrome = await Chrome.launch();
  chromes.push(chrome);
  const page = await chrome.open(`${base()}/nb/om`);
  await page.evaluate(() => {
    document.cookie = 'fv-session=plus134; path=/';
  });
  // Andre last: serveren ser sesjonen og setter Pluss-markøren (fv-auth=2).
  await page.navigate(`${base()}/nb/om`);
  return page;
}

async function waitFor(page: Page, what: string, fn: () => boolean | Promise<boolean>, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(fn)) return;
    } catch {
      // siden byttes — prøv igjen
    }
    await Bun.sleep(100);
  }
  throw new Error(`Ventet forgjeves på: ${what}`);
}

async function serverRow() {
  const rows = (await getSql()`
    SELECT id, deleted FROM user_bibles WHERE user_id = ${TEST_USER_ID}
  `) as { id: string; deleted: number }[];
  return rows[0];
}

async function chapterCount(id: string) {
  const rows = (await getSql()`SELECT COUNT(*) AS n FROM user_bible_chapters WHERE bible_id = ${id}`) as { n: number }[];
  return Number(rows[0]!.n);
}

async function waitForServer(what: string, fn: (row: { id: string; deleted: number } | undefined) => boolean) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (fn(await serverRow())) return;
    await Bun.sleep(100);
  }
  throw new Error(`Kontoen nådde aldri: ${what}`);
}

/** Bibelens metadata og antall kapitler i enhetens EGEN IndexedDB. */
function localCopy(page: Page, id: string) {
  return page.evaluate(
    (bibleId: string) =>
      new Promise<{ deleted: boolean | null; chapters: number }>((resolve, reject) => {
        const req = indexedDB.open('bibel-offline');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('userBibles')) return resolve({ deleted: null, chapters: 0 });
          const tx = db.transaction(['userBibles', 'chapters']);
          const meta = tx.objectStore('userBibles').get(bibleId);
          const count = tx.objectStore('chapters').index('by-bible').count(bibleId);
          tx.oncomplete = () =>
            resolve({ deleted: meta.result ? !!meta.result.deleted : null, chapters: count.result });
        };
      }),
    id,
  );
}

test('lastet opp på A kan velges på lesesiden på B uten /oversettelser, og slettingen på A når B', async () => {
  // ── A laster opp ────────────────────────────────────────────────────
  const a = await device();
  await a.navigate(`${base()}/nb/oversettelser`);
  await waitFor(a, 'nummereringene er lastet', () =>
    [...document.querySelectorAll<HTMLOptionElement>('[data-trans-mapping] option')].some((o) => o.value === 'osnb'),
  );
  await a.evaluate(
    (text: string, name: string) => {
      document.querySelector<HTMLSelectElement>('[data-trans-mapping]')!.value = 'osnb';
      document.querySelector<HTMLInputElement>('[data-trans-name]')!.value = name;
      document.querySelector<HTMLTextAreaElement>('[data-trans-text]')!.value = text;
      document.querySelector<HTMLButtonElement>('[data-trans-parse]')!.click();
    },
    TEXT,
    NAME,
  );
  await waitFor(a, 'teksten er analysert', () => !document.querySelector<HTMLElement>('[data-trans-import]')!.hidden);
  await a.evaluate(() => document.querySelector<HTMLButtonElement>('[data-trans-import]')!.click());
  await waitForServer('oversettelsen ligger på kontoen', (row) => !!row && !row.deleted);
  const id = (await serverRow())!.id;
  const deadlineUp = Date.now() + 20_000;
  while (Date.now() < deadlineUp && (await chapterCount(id)) === 0) await Bun.sleep(100);
  expect(await chapterCount(id)).toBeGreaterThan(0);

  // ── B har aldri sett /oversettelser — bare lesesiden ───────────────
  const b = await device();
  await b.navigate(`${base()}/nb/1mos/1`);
  await waitFor(b, `velgeren på lesesiden tilbyr «${NAME}»`, () =>
    [...document.querySelectorAll('.tools-bible-button')].some((el) => el.textContent === 'Testbibel 134'),
  );
  const href = await b.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('.tools-bible-button')]
      .find((el) => el.textContent === 'Testbibel 134')!
      .getAttribute('href'),
  );
  expect(href).toContain(`bible=${encodeURIComponent(id)}`);
  await b.navigate(`${base()}${href}`);
  await waitFor(b, 'vers 1 vises i den egne oversettelsen', () =>
    document.querySelector('#v1 [data-verse-plain]')?.textContent === 'I opphavet laget Gud himmel og jord, sa testbibelen.',
  );
  expect((await localCopy(b, id)).chapters).toBeGreaterThan(0);

  // ── A sletter ───────────────────────────────────────────────────────
  await a.navigate(`${base()}/nb/oversettelser`);
  await waitFor(a, 'lista viser oversettelsen', () => !!document.querySelector('[data-trans-list] .trans-row button'));
  await a.evaluate(() => {
    window.confirm = () => true;
    document.querySelector<HTMLButtonElement>('[data-trans-list] .trans-row button')!.click();
  });
  await waitForServer('slettingen er på kontoen', (row) => !!row && !!row.deleted);
  // Teksten er brukerens innhold: en tombstone trenger den ikke.
  expect(await chapterCount(id)).toBe(0);

  // ── B åpner lesesiden igjen, og kopien er borte ────────────────────
  await b.navigate(`${base()}/nb/1mos/2`);
  const deadline = Date.now() + 20_000;
  let copy = await localCopy(b, id);
  while (Date.now() < deadline && (copy.deleted !== true || copy.chapters !== 0)) {
    await Bun.sleep(100);
    copy = await localCopy(b, id);
  }
  expect(copy).toEqual({ deleted: true, chapters: 0 });
  expect(
    await b.evaluate(() =>
      [...document.querySelectorAll('.tools-bible-button')].some((el) => el.textContent === 'Testbibel 134'),
    ),
  ).toBe(false);
}, 180_000);
