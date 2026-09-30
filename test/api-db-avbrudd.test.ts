/**
 * VAKT: en API-rute som mister basen midt i svaret gir 503 med `Retry-After`,
 * ikke 500 (#123).
 *
 * #108 koblet DB-avbruddet til 503 i `app.onError`. Men hver rute under `/api/`
 * fanger sitt EGET kast og svarer selv, så kastet når aldri dit: et avbrudd på
 * et halvminutt ble «Internal server error» — «noe er galt for godt» — der
 * sidene sa «prøv igjen om litt». Restansen står i #109 (33 av 55 ruter).
 *
 * Tre halvdeler:
 *
 * REGELEN — `internFeil()` alene, BEGGE veier: en forbindelsesfeil gir 503 med
 * `Retry-After`, en defekt hos oss gir fortsatt 500 uten. Uten den andre ville
 * «503 på alt» bestått, og hver bug i API-et var gjemt bak et løfte om at det
 * går over.
 *
 * SVEIPEN — hele /api-RUTETABELLEN med basen nede. Formulert på kontrakten, ikke
 * på kallstedene: ingen rute får svare 500 mens basen er borte, så en ny rute
 * som svarer sin egen 500 blir rød uten at noen fører den opp.
 *
 * INGEN STILLE SKIP — sveipen må faktisk treffe 503-er, ellers ville en sveip
 * der ingen rute kom fram til basen bestått uansett hva den svarer.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { Hono } from 'hono';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { DB_NEDE_RETRY_AFTER_S } from '../src/lib/error-handler.ts';
import { clearPageCache } from '../src/lib/page-cache.ts';
import { internFeil } from '../src/routes/api/util.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Ordrett formen Bun kaster når forbindelsen er borte. */
const dbNede = () =>
  Object.assign(new Error('Connection closed'), { code: 'ERR_MYSQL_CONNECTION_CLOSED' });

/** En defekt hos OSS. Den skal aldri bli en beskjed om å prøve igjen senere. */
const ektefeil = () => new Error("Table 'flogvit_bibel.finnesikke' doesn't exist");

/** Loggen er #109s sak; her skal den bare ikke drukne testutskriften. */
async function stille<T>(fn: () => Promise<T> | T): Promise<T> {
  const ekte = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = ekte;
  }
}

describe('REGELEN: internFeil skiller avbrudd fra defekt (#123)', () => {
  const app = new Hono();
  app.get('/nede', (c) => internFeil(c, 'test', dbNede()));
  app.get('/bug', (c) => internFeil(c, 'test', ektefeil()));
  app.get('/nede-egen-kropp', (c) => internFeil(c, 'test', dbNede(), { version: 'x' }));

  test('en forbindelsesfeil gir 503 med Retry-After', async () => {
    const res = await stille(() => app.request('http://localhost/nede'));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe(String(DB_NEDE_RETRY_AFTER_S));
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });

  // Mutasjonen «503 på alt» stryker her.
  test('en ekte feil er fortsatt 500, og lover ingen ny sjanse', async () => {
    const res = await stille(() => app.request('http://localhost/bug'));
    expect(res.status).toBe(500);
    expect(res.headers.get('retry-after')).toBeNull();
  });

  // En rute med en egen feilkropp (`/api/version` svarer en fallback-versjon)
  // skal ikke miste 503-en fordi den har valgt sin egen form.
  test('en rute med egen feilkropp får også 503', async () => {
    const res = await stille(() => app.request('http://localhost/nede-egen-kropp'));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe(String(DB_NEDE_RETRY_AFTER_S));
    expect(await res.json()).toEqual({ version: 'x' });
  });
});

describe('SVEIPEN: ingen /api-rute svarer 500 når basen er nede (#123)', () => {
  const før: Record<string, string | undefined> = {};
  const sett = (k: string, v: string) => {
    før[k] = process.env[k];
    process.env[k] = v;
  };

  beforeAll(async () => {
    // Bok-metadataen lastes FØRST mot den ekte basen — den vanlige formen i prod
    // er en container som har stått en stund og får en blipp under seg. Uten
    // den stopper `medBokdata` (#109) forespørselen med 503 før rutene kjører,
    // og sveipen måler middlewaren i stedet for rutene.
    await initBooks();

    const server = Bun.serve({ port: 0, fetch: () => new Response('') });
    const stengtPort = server.port;
    await server.stop(true);
    sett('DB_HOST', '127.0.0.1');
    sett('DB_PORT', String(stengtPort));
    sett('DB_CONNECT_TIMEOUT', '1');
    // Budsjettet leses PER KALL (#107).
    sett('DB_RETRY_BUDGET_MS', '200');
    await closeSql();
    clearPageCache();
  });

  afterAll(async () => {
    await closeSql();
    for (const [k, v] of Object.entries(før)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearPageCache();
  });

  /** Rutetabellen er lista — ikke en håndskrevet oppregning. */
  const stier = () =>
    createApp()
      .routes.filter((r) => r.method === 'GET' && r.path.startsWith('/api/'))
      .map((r) => r.path)
      // `/api/mappings/kvn/all` strømmer 73 MB fra disk uten å spørre basen (#104).
      .filter((p) => p !== '/api/mappings/kvn/all')
      .map((p) =>
        p.replace(/:([a-zA-Z]+)(\{(?:[^{}]|\{[^{}]*\})*\})?/g, (_m, navn: string) =>
          navn === 'date' ? '2026-01-01' : navn === 'slug' ? 'x' : '1',
        ),
      )
      .filter((p, i, alle) => alle.indexOf(p) === i);

  let svar: { sti: string; status: number; retryAfter: string | null }[] = [];

  beforeAll(async () => {
    const app = createApp();
    svar = await stille(async () => {
      const ut: typeof svar = [];
      for (const sti of stier()) {
        const res = await app.request(`http://localhost${sti}`);
        ut.push({ sti, status: res.status, retryAfter: res.headers.get('retry-after') });
      }
      return ut;
    });
  });

  test('ingen rute svarer 500 på et avbrudd', () => {
    expect(
      svar.filter((s) => s.status === 500).map((s) => s.sti),
      'disse rutene melder et midlertidig DB-avbrudd som en varig feil',
    ).toEqual([]);
  });

  test('hver 503 bærer Retry-After', () => {
    for (const s of svar.filter((x) => x.status === 503)) {
      expect(`${s.sti}: ${s.retryAfter}`).toBe(`${s.sti}: ${DB_NEDE_RETRY_AFTER_S}`);
    }
  });

  // INGEN STILLE SKIP: uten denne ville en sveip der ingen rute nådde basen
  // bestått de to over.
  test('sveipen treffer faktisk avbruddet', () => {
    expect(svar.length).toBeGreaterThan(30);
    expect(svar.filter((s) => s.status === 503).length).toBeGreaterThan(20);
  });
});
