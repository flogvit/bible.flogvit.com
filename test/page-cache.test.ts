import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import {
  clearPageCache,
  configurePageCache,
  setContentVersionReader,
  withPageCache,
} from '../src/lib/page-cache.ts';

// Mikrocachen (GitHub #4): anonyme GET-HTML-sider caches og får Cache-Control;
// innloggede forespørsler og /api/* går alltid gjennom.

function buildApp() {
  let renders = 0;
  const app = new Hono();
  app.use('*', withPageCache);
  app.get('/side', (c) => {
    renders++;
    return c.html(`<html><body>render ${renders}</body></html>`);
  });
  app.get('/api/data', (c) => c.json({ renders: ++renders }));
  app.get('/borte', (c) => c.html('<html>404</html>', 404));
  return { app, getRenders: () => renders };
}

describe('withPageCache', () => {
  beforeEach(() => clearPageCache());

  test('anonym side caches: andre kall rendrer ikke på nytt', async () => {
    const { app, getRenders } = buildApp();
    const first = await app.request('/side');
    expect(first.headers.get('cache-control')).toContain('public');
    expect(await first.text()).toContain('render 1');

    const second = await app.request('/side');
    expect(second.headers.get('x-cache')).toBe('hit');
    expect(await second.text()).toContain('render 1');
    expect(getRenders()).toBe(1);
  });

  test('fv-session-cookie omgår cachen', async () => {
    const { app, getRenders } = buildApp();
    await app.request('/side');
    const res = await app.request('/side', { headers: { cookie: 'fv-session=abc' } });
    expect(res.headers.get('x-cache')).toBeNull();
    expect(res.headers.get('cache-control')).toBeNull();
    expect(getRenders()).toBe(2);
  });

  test('/api/* caches aldri', async () => {
    const { app } = buildApp();
    const a = await (await app.request('/api/data')).json();
    const b = await (await app.request('/api/data')).json();
    expect(a.renders).not.toBe(b.renders);
  });

  test('ikke-200 caches ikke', async () => {
    const { app } = buildApp();
    await app.request('/borte');
    const res = await app.request('/borte');
    expect(res.headers.get('x-cache')).toBeNull();
    expect(res.status).toBe(404);
  });

  test('query-strenger caches separat', async () => {
    const { app, getRenders } = buildApp();
    await app.request('/side?a=1');
    await app.request('/side?a=2');
    expect(getRenders()).toBe(2);
    const hit = await app.request('/side?a=1');
    expect(hit.headers.get('x-cache')).toBe('hit');
  });

  test('Cache-Control følger TTL-en, ikke en fast verdi', async () => {
    configurePageCache({ ttlMs: 60 * 60 * 1000 });
    const { app } = buildApp();
    const res = await app.request('/side');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    configurePageCache({});
  });
});

// Innholdsversjon (#19): TTL-en er en time, så en import må tømme cachen framfor
// at leseren venter den ut. Hele poenget med den lange TTL-en er at crawlernes
// gjentak blir gratis — uten invalidering ville prisen vært en time gammelt
// innhold etter hvert innholdsdeploy.
describe('invalidering på innholdsversjon', () => {
  beforeEach(() => {
    clearPageCache();
    configurePageCache({ versionCheckMs: 0 });
  });

  test('ny sync-versjon tømmer cachen ved neste forespørsel', async () => {
    let version = '7';
    setContentVersionReader(async () => version);
    const { app, getRenders } = buildApp();

    await app.request('/side');
    expect((await app.request('/side')).headers.get('x-cache')).toBe('hit');

    version = '8'; // import kjørt
    const after = await app.request('/side');
    expect(after.headers.get('x-cache')).toBeNull();
    expect(getRenders()).toBe(2);
    setContentVersionReader(null);
  });

  test('uendret versjon rører ikke cachen', async () => {
    setContentVersionReader(async () => '7');
    const { app, getRenders } = buildApp();
    await app.request('/side');
    await app.request('/side');
    expect(getRenders()).toBe(1);
    setContentVersionReader(null);
  });

  test('DB nede beholder cachen — den er det eneste som kan svare', async () => {
    setContentVersionReader(async () => {
      throw new Error('DB nede');
    });
    const { app, getRenders } = buildApp();
    await app.request('/side');
    expect((await app.request('/side')).headers.get('x-cache')).toBe('hit');
    expect(getRenders()).toBe(1);
    setContentVersionReader(null);
  });

  test('versjonen slås opp høyst én gang per intervall', async () => {
    let reads = 0;
    configurePageCache({ versionCheckMs: 60 * 1000 });
    setContentVersionReader(async () => {
      reads++;
      return '7';
    });
    const { app } = buildApp();
    await app.request('/side?a=1');
    await app.request('/side?a=2');
    await app.request('/side?a=3');
    expect(reads).toBe(1);
    setContentVersionReader(null);
  });
});

// Lastavvisning (GitHub #14): anonyme render over taket får 503 + Retry-After
// i stedet for å stå i kø til Caddy kutter med 502. Utløpt cache-innhold
// serveres ved overlast (stale-while-shedding). Innloggede berøres aldri.

/** App der hver render venter på en port vi åpner fra testen. */
function buildGatedApp() {
  let renders = 0;
  const gates: Array<() => void> = [];
  const app = new Hono();
  app.use('*', withPageCache);
  app.get('/side', async (c) => {
    renders++;
    await new Promise<void>((resolve) => gates.push(resolve));
    return c.html(`<html><body>render ${renders}</body></html>`);
  });
  return { app, gates, getRenders: () => renders };
}

describe('lastavvisning', () => {
  beforeEach(() => {
    clearPageCache();
    configurePageCache({ maxConcurrentRenders: 1, queueWaitMs: 30, ttlMs: 5 * 60 * 1000 });
  });

  // `config` er modulnivå-tilstand, og `bun test` kjører alle filene i SAMME
  // prosess: uten dette ser hver senere fil et lastvern med ETT render-spor og
  // 30 ms køtid. To samtidige sidehentinger i en helt annen test ble da 503,
  // og feilmeldingen pekte på feil fil (#72). `load-shedding.test.ts` rydder
  // allerede slik.
  afterAll(() => {
    configurePageCache({});
    clearPageCache();
  });

  test('over taket uten stale: 503 med Retry-After', async () => {
    const { app, gates } = buildGatedApp();
    const first = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);

    const shed = await app.request('/side?a=2');
    expect(shed.status).toBe(503);
    expect(shed.headers.get('retry-after')).toBe('30');

    gates.shift()!();
    expect((await first).status).toBe(200);
  });

  test('kø: venter på ledig plass og rendrer når den frigjøres', async () => {
    configurePageCache({ maxConcurrentRenders: 1, queueWaitMs: 2000, ttlMs: 5 * 60 * 1000 });
    const { app, gates, getRenders } = buildGatedApp();
    const first = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);

    const queued = app.request('/side?a=2');
    await Bun.sleep(5);
    expect(getRenders()).toBe(1); // står i kø, har ikke fått slippe til

    gates.shift()!();
    await first;
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await queued).status).toBe(200);
    expect(getRenders()).toBe(2);
  });

  test('utløpt cache serveres ved overlast (stale-while-shedding)', async () => {
    configurePageCache({ maxConcurrentRenders: 1, queueWaitMs: 30, ttlMs: 1 });
    const { app, gates } = buildGatedApp();
    const prime = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await prime).status).toBe(200);
    await Bun.sleep(5); // entry utløpt

    const blocker = app.request('/side?a=2');
    while (gates.length === 0) await Bun.sleep(1);

    const stale = await app.request('/side?a=1');
    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-cache')).toBe('stale');
    expect(await stale.text()).toContain('render 1');

    gates.shift()!();
    await blocker;
  });

  test('innloggede går utenom semaforen', async () => {
    const { app, gates, getRenders } = buildGatedApp();
    const first = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);

    const loggedIn = app.request('/side?a=2', { headers: { cookie: 'fv-session=abc' } });
    while (gates.length < 2) await Bun.sleep(1);
    expect(getRenders()).toBe(2);

    gates.shift()!();
    gates.shift()!();
    expect((await loggedIn).status).toBe(200);
    await first;
  });
});
