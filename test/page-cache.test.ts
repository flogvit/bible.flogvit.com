import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import {
  PAGE_CACHE_DEFAULTS,
  clearPageCache,
  configurePageCache,
  resetPageCache,
  setContentVersionReader,
  withPageCache,
} from '../src/lib/page-cache.ts';

// Mikrocachen (GitHub #4): anonyme GET-HTML-sider caches og får Cache-Control;
// innloggede forespørsler og /api/* går alltid gjennom.

// Lastvernet er modulnivå-tilstand, og `bun test` kjører alle filene i samme
// prosess: `lastavvisning` nedenfor skrur taket ned til ETT render-spor, og uten
// denne linja hadde hver etterfølgende fil målt mot det (#72). Den står på
// toppnivå med vilje — da fyrer den etter siste describe, uansett hvilken
// describe noen legger til nederst i fila.
afterAll(resetPageCache);

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

// Per-avsender-tak (#126): lastvernet talte samtidige render uten å se HVEM, så
// én adresse (13.140.37.198, fire roterende nettleserstrenger, ingen
// UA-signatur) fylte alle plassene alene og ga 503 til alle andre i sju
// sekunder. Forespørsel N+1 fra SAMME avsender skal avvises før noen andre.
// Avsenderen er adressen kanten (Caddy, `(klientip)`) skriver i
// X-Forwarded-For — HØYRE ledd, så et ledd klienten setter selv ikke gir en
// fersk bøtte.
describe('per-avsender-tak (#126)', () => {
  const fra = (ip: string) => ({ headers: { 'x-forwarded-for': ip } });

  beforeEach(() => {
    // Hele tilstanden, ikke bare cachen: en test som røk mens en render sto
    // åpen skal ikke holde plassene for de neste.
    resetPageCache();
    configurePageCache({
      maxConcurrentRenders: 2,
      maxQueuedRenders: 2,
      maxRendersPerSender: 1,
      queueWaitMs: 2000,
      ttlMs: 5 * 60 * 1000,
    });
  });

  test('én avsender over sitt tak avvises straks, mens en annen fortsatt slipper til', async () => {
    const { app, gates } = buildGatedApp();
    const a1 = app.request('/side?a=1', fra('13.140.37.198'));
    while (gates.length === 0) await Bun.sleep(1);

    const t0 = performance.now();
    const a2 = await app.request('/side?a=2', fra('13.140.37.198'));
    expect(a2.status).toBe(503);
    expect(a2.headers.get('retry-after')).toBe('30');
    expect(performance.now() - t0).toBeLessThan(500); // ikke etter fristen

    const b = app.request('/side?a=3', fra('84.208.1.1'));
    while (gates.length < 2) await Bun.sleep(1); // B fikk en plass

    gates.shift()!();
    gates.shift()!();
    expect((await a1).status).toBe(200);
    expect((await b).status).toBe(200);
  });

  test('avsenderen tar heller ikke køen — den som kommer etter får plassen', async () => {
    configurePageCache({
      maxConcurrentRenders: 1,
      maxQueuedRenders: 1,
      maxRendersPerSender: 1,
      queueWaitMs: 2000,
      ttlMs: 5 * 60 * 1000,
    });
    const { app, gates, getRenders } = buildGatedApp();
    const a1 = app.request('/side?a=1', fra('13.140.37.198'));
    while (gates.length === 0) await Bun.sleep(1);

    // Uten taket hadde A2 stått i den ene kø-plassen, og B fått 503 med en gang.
    const t0 = performance.now();
    const a2 = await app.request('/side?a=2', fra('13.140.37.198'));
    expect(a2.status).toBe(503);
    expect(performance.now() - t0).toBeLessThan(500);
    const b = app.request('/side?a=3', fra('84.208.1.1'));
    await Bun.sleep(5);
    expect(getRenders()).toBe(1); // B står i kø, ikke avvist

    gates.shift()!();
    expect((await a1).status).toBe(200);
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await b).status).toBe(200);
    expect(getRenders()).toBe(2);
  });

  test('avsenderen er HØYRE ledd i X-Forwarded-For — et ledd klienten setter selv hjelper ikke', async () => {
    const { app, gates } = buildGatedApp();
    const a1 = app.request('/side?a=1', fra('10.0.0.1, 13.140.37.198'));
    while (gates.length === 0) await Bun.sleep(1);

    const a2 = await app.request('/side?a=2', fra('10.0.0.2, 13.140.37.198'));
    expect(a2.status).toBe(503);

    gates.shift()!();
    await a1;
  });

  test('plassen gis tilbake: etter en ferdig render, og etter en kø-plass som gikk ut', async () => {
    configurePageCache({
      maxConcurrentRenders: 1,
      maxQueuedRenders: 1,
      maxRendersPerSender: 1,
      queueWaitMs: 30,
      ttlMs: 5 * 60 * 1000,
    });
    const { app, gates } = buildGatedApp();

    // Ferdig render → samme avsender slipper til igjen.
    const a1 = app.request('/side?a=1', fra('13.140.37.198'));
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await a1).status).toBe(200);
    const a2 = app.request('/side?a=2', fra('13.140.37.198'));
    while (gates.length === 0) await Bun.sleep(1);

    // B står i kø og gir opp etter fristen — da skal B ikke stå som opptatt.
    expect((await app.request('/side?a=3', fra('84.208.1.1'))).status).toBe(503);
    gates.shift()!();
    expect((await a2).status).toBe(200);
    const b2 = app.request('/side?a=4', fra('84.208.1.1'));
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await b2).status).toBe(200);
  });

  test('en avsender under taket merker ingenting', async () => {
    configurePageCache({
      maxConcurrentRenders: 2,
      maxQueuedRenders: 2,
      maxRendersPerSender: 2,
      queueWaitMs: 2000,
      ttlMs: 5 * 60 * 1000,
    });
    const { app, gates } = buildGatedApp();
    const a1 = app.request('/side?a=1', fra('13.140.37.198'));
    const a2 = app.request('/side?a=2', fra('13.140.37.198'));
    while (gates.length < 2) await Bun.sleep(1);
    gates.shift()!();
    gates.shift()!();
    expect((await a1).status).toBe(200);
    expect((await a2).status).toBe(200);
  });

  test('uten adresse gjelder bare det felles taket — ukjente deler ikke én bøtte', async () => {
    const { app, gates } = buildGatedApp();
    const x1 = app.request('/side?a=1');
    const x2 = app.request('/side?a=2');
    while (gates.length < 2) await Bun.sleep(1);
    gates.shift()!();
    gates.shift()!();
    expect((await x1).status).toBe(200);
    expect((await x2).status).toBe(200);
  });

  test('standarden: én avsender kan aldri ta alle plassene', () => {
    expect(PAGE_CACHE_DEFAULTS.maxRendersPerSender).toBeGreaterThanOrEqual(1);
    expect(PAGE_CACHE_DEFAULTS.maxRendersPerSender).toBeLessThan(
      PAGE_CACHE_DEFAULTS.maxConcurrentRenders,
    );
  });
});
