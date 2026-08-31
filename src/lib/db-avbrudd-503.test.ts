/**
 * VAKT: et DB-avbrudd som varer lenger enn retry-budsjettet blir 503 med
 * `Retry-After`, ikke en naken 500 (#108).
 *
 * Saken: 2026-08-31T01:45:37–01:45:47Z svarte bible.flogvit.com 500 til to
 * bingbot-hentinger og én SemrushBot, etter 22,0 / 25,7 / 22,6 sekunder — altså
 * nøyaktig der retry-budsjettet fra #107 (25 s) løper ut og `db.ts` kaster.
 * Appen hadde ingen `app.onError`, så kastet ble Honos standardsvar.
 *
 * **Statuskoden er hele utfallet her.** Sida er ikke i stykker; basen var borte
 * i et halvminutt (delt node uten SLA — forventet drift, og ikke saken). 500
 * sier «denne adressen er i stykker» og tar den ut av indeksen om det gjentar
 * seg; 503 + `Retry-After` sier «midlertidig». Lastvernet i `page-cache.ts`
 * svarer allerede nettopp det under overlast — den veien var bare ikke koblet
 * til DB-avbruddet.
 *
 * Vakta har to halvdeler.
 *
 * REGELEN: hva slags kast gir hvilket svar. Den måler BEGGE veier, for uten den
 * andre ville «503 på alt» bestått — og da er hver eneste bug hos oss gjemt bak
 * en beskjed om å prøve igjen senere.
 *
 * FLATA: sakens eget bevis. Appen bootes med en DB som ikke svarer (en port
 * ingen lytter på), og de tre adressene fra loggen må svare 503 med
 * `Retry-After` — ikke 500. En adresse som ikke rører basen må fortsatt svare
 * 200 i samme tilstand, ellers ville «503 på alt» bestått også her.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createApp } from '../app.ts';
import { closeSql } from './db.ts';
import { DB_NEDE_RETRY_AFTER_S, feilsvar } from './error-handler.ts';
import { clearPageCache } from './page-cache.ts';
import type { AppEnv } from './session.ts';
import { DB_TEST_TIMEOUT_MS } from '../../test/db-timeout.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Feilen budsjettet slipper videre — ordrett formen Bun kaster i prod. */
const dbNede = () =>
  Object.assign(new Error('Connection closed'), { code: 'ERR_MYSQL_CONNECTION_CLOSED' });

/** En defekt hos OSS. Den skal aldri bli en beskjed om å prøve igjen senere. */
const ektefeil = () => new Error("Table 'flogvit_bibel.finnesikke' doesn't exist");

describe('REGELEN: DB nede er 503, en bug er 500 (#108)', () => {
  const app = new Hono<AppEnv>();
  app.onError(feilsvar);
  app.get('/nede', () => {
    throw dbNede();
  });
  app.get('/bug', () => {
    throw ektefeil();
  });
  app.get('/api/nede', () => {
    throw dbNede();
  });
  app.get('/http-exception', () => {
    throw new HTTPException(429, { message: 'Slow down' });
  });

  test('en forbindelsesfeil gir 503 med Retry-After', async () => {
    const res = await app.request('http://localhost/nede');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe(String(DB_NEDE_RETRY_AFTER_S));
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  // Mutasjonen «503 på alt» stryker her, og det er halvdelens eneste jobb.
  test('en ekte feil er fortsatt 500, og lover ingen ny sjanse', async () => {
    const res = await app.request('http://localhost/bug');
    expect(res.status).toBe(500);
    expect(res.headers.get('retry-after')).toBeNull();
  });

  // En HTTPException har alt valgt sitt eget svar. Uten denne halvdelen ville
  // et bevisst 4xx fra en middleware blitt vår 500 — altså en defekt vi ikke
  // har, meldt til crawleren som en defekt vi har.
  test('en HTTPException beholder sitt eget svar', async () => {
    const res = await app.request('http://localhost/http-exception');
    expect(res.status).toBe(429);
  });

  test('en API-sti svarer JSON, som app.notFound() alt gjør', async () => {
    const res = await app.request('http://localhost/api/nede');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe(String(DB_NEDE_RETRY_AFTER_S));
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toHaveProperty('error');
  });
});

describe('FLATA: appen med en DB som ikke svarer (#108)', () => {
  const før: Record<string, string | undefined> = {};
  const sett = (k: string, v: string) => {
    før[k] = process.env[k];
    process.env[k] = v;
  };

  beforeAll(async () => {
    // En port ingen lytter på: ECONNREFUSED med en gang, framfor et tidsavbrudd
    // som ville gjort vakta treg og avhengig av nettverket.
    const server = Bun.serve({ port: 0, fetch: () => new Response('') });
    const stengtPort = server.port;
    await server.stop(true);

    sett('DB_HOST', '127.0.0.1');
    sett('DB_PORT', String(stengtPort));
    sett('DB_CONNECT_TIMEOUT', '1');
    // Budsjettet leses PER KALL (#107), så vakta trenger ikke vente 25 s for å
    // måle hva som skjer når det er brukt opp.
    sett('DB_RETRY_BUDGET_MS', '300');
    // Poolen er lat, men en annen testfil kan ha opprettet den mot den ekte
    // basen allerede — den må bygges på nytt mot den stengte porten.
    await closeSql();
  });

  afterAll(async () => {
    await closeSql();
    for (const [k, v] of Object.entries(før)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearPageCache();
  });

  // Adressene er de tre fra Caddy-loggen i saken.
  for (const sti of [
    '/en/1krøn/1',
    '/en/historier/daniel-i-lovehulen',
    '/es/historier/babels-tarn',
  ]) {
    test(`${sti} svarer 503 med Retry-After, ikke 500`, async () => {
      const res = await createApp().request(`http://localhost${sti}`);
      expect(res.status).toBe(503);
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    });
  }

  // Uten denne ville «503 på alt» bestått halvdelen over — og da hadde vi tatt
  // ned robots.txt, som er selve bremsen på lasten (#64).
  test('en adresse som ikke rører basen svarer fortsatt 200', async () => {
    const res = await createApp().request('http://localhost/robots.txt');
    expect(res.status).toBe(200);
  });
});
