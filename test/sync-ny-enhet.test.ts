// EN ENHET SOM ALDRI HAR HATT EN VERDI, KAN IKKE SLETTE DEN (#132)
//
// Første fulle synk på en ny enhet pushet ALLE MAP-nøklene. For en singleton
// den ikke hadde lokalt ble det `data: null, updatedAt: now` — og `now` er
// nyere enn serverens tidsstempel, så serveren skrev null over brukerens emner
// og innstillinger. Neste fulle synk på den gamle enheten kjørte så
// `localStorage.removeItem`, og dataene var borte overalt. Målt i prod-koden
// 2026-10-10 med to Chrome-profiler mot samme bruker.
//
// To halvdeler, fordi feilen har to ledd og begge skal holde alene:
//
// 1. SERVEREN (forsvar i dybden): en `null`-singleton over ekte data godtas bare
//    fra en klient som oppgir at den har SETT versjonen den sletter
//    (`baseUpdatedAt`). Det verner også mot gamle klienter som ligger igjen i
//    service worker-cachen og fortsatt sender null uten base.
// 2. KLIENTEN, i ekte Chrome med to profiler: emner og innstillinger lagd på A,
//    B åpnes for første gang, A lastes på nytt — begge har dem. Og en BEVISST
//    sletting på A synkes fortsatt (B mister verdien), så rettelsen ikke er
//    «slett aldri».

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { kontoUser, startMockKonto } from './mock-konto.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Egne bruker-id-er, så testen aldri deler rader med sync.test.ts.
const API_USER = 990132;
const CHROME_USER = 990133;
const USERS = [API_USER, CHROME_USER];

const AUTH = { cookie: 'fv-session=ny-enhet-api', 'content-type': 'application/json' };

let mock: ReturnType<typeof Bun.serve>;
let server: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;

async function cleanup() {
  const sql = getSql();
  for (const id of USERS) {
    await sql`DELETE FROM sync_items WHERE user_id = ${id}`;
    await sql`DELETE FROM sync_cursors WHERE user_id = ${id}`;
  }
}

beforeAll(async () => {
  mock = startMockKonto({
    'ny-enhet-api': () => kontoUser({ id: API_USER, plus: true, plusUntil: '2099-01-01T00:00:00.000Z' }),
    'ny-enhet-chrome': () => kontoUser({ id: CHROME_USER, plus: true, plusUntil: '2099-01-01T00:00:00.000Z' }),
  });
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
  server = Bun.serve({ port: 0, fetch: app.fetch });
}, 60_000);

afterAll(async () => {
  await cleanup();
  server?.stop(true);
  await closeSql();
  mock.stop(true);
});

interface Change {
  dataType: string;
  itemId: string;
  data: unknown;
  updatedAt: number;
  deleted?: boolean;
  baseUpdatedAt?: number;
}

async function post(deviceId: string, changes: Change[], lastSyncAt = 0) {
  const res = await app.request('/api/sync', {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({ deviceId, lastSyncAt, changes }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { syncedAt: number; changes: Change[] };
}

async function serverSingleton(userId: number, dataType: string) {
  const [row] = (await getSql()`
    SELECT data, updated_at, deleted FROM sync_items
    WHERE user_id = ${userId} AND data_type = ${dataType} AND item_id = '_singleton'
  `) as { data: unknown; updated_at: number | bigint; deleted: number }[];
  if (!row) return undefined;
  return {
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    updatedAt: Number(row.updated_at),
    deleted: !!row.deleted,
  };
}

const TOPICS = { topics: [{ id: 't1', name: 'Nåde' }], verseTopics: [], itemTopics: [] };

describe('serveren: null over ekte data krever at klienten har sett versjonen', () => {
  test('en ny enhet som sender null UTEN base, sletter ingenting — og får serverversjonen tilbake', async () => {
    await post('enhet-a', [{ dataType: 'topics', itemId: '_singleton', data: TOPICS, updatedAt: 1000 }]);

    // Nøyaktig det gamle sync.js sendte fra en ny enhet: null, nyere tidsstempel.
    const svar = await post('enhet-b', [{ dataType: 'topics', itemId: '_singleton', data: null, updatedAt: 5000 }]);

    const rad = await serverSingleton(API_USER, 'topics');
    expect(rad?.data).toEqual(TOPICS);
    expect(rad?.updatedAt).toBe(1000);
    // Klienten må få vite at serveren har noe — ellers står den med et hull.
    const tilbake = svar.changes.find((c) => c.dataType === 'topics');
    expect(tilbake?.data).toEqual(TOPICS);
  });

  test('null med en base som er ELDRE enn serverens versjon, avvises også', async () => {
    await post('enhet-b', [
      { dataType: 'topics', itemId: '_singleton', data: null, deleted: true, updatedAt: 6000, baseUpdatedAt: 999 },
    ]);
    expect((await serverSingleton(API_USER, 'topics'))?.data).toEqual(TOPICS);
  });

  test('en BEVISST sletting fra en enhet som har sett versjonen, godtas', async () => {
    await post('enhet-a', [
      { dataType: 'topics', itemId: '_singleton', data: null, deleted: true, updatedAt: 7000, baseUpdatedAt: 1000 },
    ]);
    const rad = await serverSingleton(API_USER, 'topics');
    expect(rad?.deleted).toBe(true);
    expect(rad?.updatedAt).toBe(7000);
  });

  test('null over en allerede slettet verdi er ingen konflikt', async () => {
    const svar = await post('enhet-b', [{ dataType: 'topics', itemId: '_singleton', data: null, updatedAt: 8000 }]);
    expect((await serverSingleton(API_USER, 'topics'))?.data).toBeNull();
    expect(svar.changes.find((c) => c.dataType === 'topics')).toBeUndefined();
  });

  test('en vanlig skriving (ikke null) følger fortsatt nyeste-vinner', async () => {
    await post('enhet-b', [{ dataType: 'settings', itemId: '_singleton', data: { fontSize: 18 }, updatedAt: 1000 }]);
    await post('enhet-a', [{ dataType: 'settings', itemId: '_singleton', data: { fontSize: 20 }, updatedAt: 2000 }]);
    expect((await serverSingleton(API_USER, 'settings'))?.data).toEqual({ fontSize: 20 });
  });
});

// ── To nettleserprofiler mot samme bruker ─────────────────────────────

const base = () => `http://localhost:${server.port}`;

/** Logger profilen inn og åpner `path`. Cookien må settes på opprinnelsen først. */
async function openSignedIn(chrome: Chrome, path: string): Promise<Page> {
  const page = await chrome.open(`${base()}/nb/om`);
  await page.evaluate(() => {
    document.cookie = 'fv-session=ny-enhet-chrome; path=/';
  });
  await page.navigate(`${base()}${path}`);
  return page;
}

/**
 * Venter til en synk som STARTET etter `after` er ferdig og utboksen er tom.
 * `bible-last-sync` er serverens `syncedAt` og skrives først når svaret er
 * anvendt, så den er det eneste merket som sier at hele runden — også
 * gjenoppbyggingen — er over. `after` er et `Date.now()` tatt FØR handlingen:
 * en profil som har synket før, har alt et merke, og å vente på «større enn
 * null» ville målt forrige sidelast. Server og test går på samme klokke.
 */
async function waitForSync(page: Page, after: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const done = await page.evaluate((a: number) => {
      const last = Number(JSON.parse(localStorage.getItem('bible-last-sync') || '0'));
      const pending = JSON.parse(localStorage.getItem('bible-sync-pending') || '[]');
      return last > a && pending.length === 0;
    }, after);
    if (done) return;
    await Bun.sleep(100);
  }
  throw new Error('Synken ble aldri ferdig');
}

const local = (page: Page, key: string) =>
  page.evaluate((k: string) => JSON.parse(localStorage.getItem(k) || 'null'), key);

describe('to enheter, samme bruker, i ekte Chrome', () => {
  let a: Chrome;
  let b: Chrome;

  beforeAll(async () => {
    await cleanup();
    a = await Chrome.launch();
    b = await Chrome.launch();
  }, 90_000);

  afterAll(async () => {
    await a?.close();
    await b?.close();
  });

  const SETTINGS = { fontSize: 21, layoutMode: 'reading' };

  test('emner og innstillinger fra A overlever at B åpnes første gang', async () => {
    let t0 = Date.now();
    const pageA = await openSignedIn(a, '/nb/emner');
    await waitForSync(pageA, t0);

    // Brukeren lager et emne og endrer en innstilling på A (gjennom de
    // patchede setItem-ene, akkurat som øyene gjør).
    t0 = Date.now();
    await pageA.evaluate(
      (t: unknown, s: unknown) => {
        localStorage.setItem('bible-topics', JSON.stringify(t));
        localStorage.setItem('bible-settings', JSON.stringify(s));
      },
      TOPICS,
      SETTINGS,
    );
    await waitForSync(pageA, t0);
    expect((await serverSingleton(CHROME_USER, 'topics'))?.data).toEqual(TOPICS);

    // B: en helt ny profil, aldri synket.
    t0 = Date.now();
    const pageB = await openSignedIn(b, '/nb/emner');
    await waitForSync(pageB, t0);
    expect(await local(pageB, 'bible-topics')).toEqual(TOPICS);
    expect(await local(pageB, 'bible-settings')).toEqual(SETTINGS);

    // Serveren har dem fortsatt …
    expect((await serverSingleton(CHROME_USER, 'topics'))?.data).toEqual(TOPICS);
    expect((await serverSingleton(CHROME_USER, 'settings'))?.data).toEqual(SETTINGS);

    // … og A, lastet på nytt, har dem også.
    t0 = Date.now();
    await pageA.navigate(`${base()}/nb/emner`);
    await waitForSync(pageA, t0);
    expect(await local(pageA, 'bible-topics')).toEqual(TOPICS);
    expect(await local(pageA, 'bible-settings')).toEqual(SETTINGS);
    // Og emnet står i lista brukeren ser, ikke bare i lagringen.
    await pageA.navigate(`${base()}/nb/emner`);
    expect(await pageA.evaluate(() => document.body.textContent?.includes('Nåde') ?? false)).toBe(true);

    await pageA.close();
    await pageB.close();
  });

  test('en BEVISST sletting på A synkes fortsatt til B', async () => {
    // Leseposisjonen er singletonen med en ekte slett-knapp (home.js: ×).
    const POS = { bookSlug: '1-mosebok', chapter: 3, verse: 1 };
    let t0 = Date.now();
    const pageA = await openSignedIn(a, '/nb/emner');
    await waitForSync(pageA, t0);
    t0 = Date.now();
    await pageA.evaluate((p: unknown) => localStorage.setItem('bible-reading-position', JSON.stringify(p)), POS);
    await waitForSync(pageA, t0);

    t0 = Date.now();
    const pageB = await openSignedIn(b, '/nb/emner');
    await waitForSync(pageB, t0);
    expect(await local(pageB, 'bible-reading-position')).toEqual(POS);

    // Slett på A, som knappen gjør, og last siden på nytt (knappen gjør det også).
    t0 = Date.now();
    await pageA.evaluate(() => localStorage.removeItem('bible-reading-position'));
    await pageA.navigate(`${base()}/nb/emner`);
    await waitForSync(pageA, t0);
    expect((await serverSingleton(CHROME_USER, 'readingPosition'))?.deleted).toBe(true);
    expect(await local(pageA, 'bible-reading-position')).toBeNull();

    t0 = Date.now();
    await pageB.navigate(`${base()}/nb/emner`);
    await waitForSync(pageB, t0);
    expect(await local(pageB, 'bible-reading-position')).toBeNull();

    // Emnene ble ikke tatt med i dragsuget.
    expect(await local(pageB, 'bible-topics')).toEqual(TOPICS);

    await pageA.close();
    await pageB.close();
  });
});
