/**
 * VAKT: retry-budsjettet tilhører FORESPØRSELEN, ikke spørringen (#107).
 *
 * Saken: 2026-08-30T20:01:22–20:02:16Z timet nye MySQL-forbindelser fra
 * bibel-hono ut (2 s connect). `/sv/historier/…` brukte 24,67 s og ble 500,
 * mens `/en/historier/daniel-i-lovehulen` brukte 24,8 s og ble **200**. Den
 * siste er beviset: ÉN spørring som spiser hele budsjettet kaster ved ~23 s og
 * blir en 500 — et svar på 24,8 s som lykkes, er flere spørringer som HVER
 * brukte sin del av hvert sitt budsjett.
 *
 * Blokka øverst i `db.ts` lover at «brukeren venter litt i stedet for å få en
 * feilside». Den lovnaden var ikke innløst: deadlinen ble regnet ut på nytt
 * inne i hvert eneste `sql`-kall, og en side gjør mange. `/personer/:id` slår
 * opp far, mor, ektefelle, hvert søsken, hvert barn og hver relatert person —
 * ett kall hver, i tur. Under en blipp som varer et minutt er taket for en slik
 * side ikke ett budsjett, men ANTALL SPØRRINGER × budsjettet. Med dagens 25 s
 * og tjue oppslag er det over åtte minutter, og Caddy har ingen
 * response-timeout som stopper det.
 *
 * Prisen er dessuten mer enn den ene leserens tid: den som venter, holder en
 * render-plass i semaforen hele veien (#19), så en blipp som rammer noen få
 * forespørsler kan stanse flata for alle.
 *
 * Vakta har fire halvdeler. BUDSJETTET (flere spørringer i én forespørsel deler
 * ett budsjett — mutasjon: deadline per spørring). DELINGEN (er budsjettet
 * brukt opp, får neste spørring nei MED EN GANG framfor å sove en runde til —
 * ellers ville «budsjett/N per spørring» bestått). RETRYEN (den lever fortsatt;
 * ellers ville «aldri prøv på nytt» vært det billigste svaret, og da er
 * DB-restarten fra 2026-07-28 tilbake). SKRIPTENE (utenfor en forespørsel har
 * hvert kall sitt eget budsjett, så `init-db`/`import-bible` fortsatt rir av en
 * restart). Og RUTA: hver forespørsel kjøres faktisk inne i et budsjett —
 * ellers er fiksen usynlig for leseren.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { SQL } from 'bun';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../src/app.ts';
import { clearPageCache, setContentVersionReader } from '../src/lib/page-cache.ts';
import { retryBudgetRemainingMs, withRetry, withRetryBudget } from '../src/lib/db.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Feilen fra saken, ordrett slik Bun leverer den. */
const tidsavbrudd = () =>
  Object.assign(new Error('Connection timeout after 2s'), {
    code: 'ERR_MYSQL_CONNECTION_TIMEOUT',
  });

/**
 * En «pool» som bare er svaret sitt. Vakta måler REGELEN i retry-løkka, og en
 * ekte forbindelse ville gjort tallene avhengige av en database som er nede.
 */
function fakePool(svar: () => Promise<unknown>): SQL {
  const base = ((..._args: unknown[]) => svar()) as unknown as SQL;
  return withRetry(base);
}

/**
 * Budsjettet vakta måler mot. Med backoffen i `db.ts` (200 → 400 → …) rekker én
 * spørring to søvner innenfor 800 ms og gir opp etter ~600 ms; fire spørringer
 * med hvert sitt budsjett blir da ~2400 ms. Terskelen ligger mellom.
 */
const BUDSJETT = 800;

describe('retry-budsjettet er forespørselens (#107)', () => {
  // BUDSJETTET — sakens eget symptom, i tallform.
  test('flere spørringer i ÉN forespørsel deler ett budsjett', async () => {
    let kall = 0;
    const sql = fakePool(() => {
      kall++;
      return Promise.reject(tidsavbrudd());
    });

    const t0 = Date.now();
    await withRetryBudget(async () => {
      for (let i = 0; i < 4; i++) {
        try {
          await sql`SELECT ${i}`;
        } catch {
          /* forventet — poolen er nede hele veien */
        }
      }
    }, BUDSJETT);
    const brukt = Date.now() - t0;

    expect(kall).toBeGreaterThan(4); // det ble faktisk prøvd på nytt
    expect(brukt).toBeLessThan(BUDSJETT * 2);
  });

  // DELINGEN — ett delt budsjett, ikke ett lite budsjett hver.
  test('er budsjettet brukt opp, får neste spørring nei MED EN GANG', async () => {
    const sql = fakePool(() => Promise.reject(tidsavbrudd()));

    await withRetryBudget(async () => {
      try {
        await sql`SELECT 1`;
      } catch {
        /* spiser budsjettet */
      }

      const t0 = Date.now();
      let feilet = false;
      try {
        await sql`SELECT 2`;
      } catch {
        feilet = true;
      }
      expect(feilet).toBe(true);
      expect(Date.now() - t0).toBeLessThan(100);
    }, BUDSJETT);
  });

  // RETRYEN — uten den er DB-restarten fra 2026-07-28 tilbake.
  test('en forbindelsesfeil gjentas fortsatt innenfor budsjettet', async () => {
    let kall = 0;
    const sql = fakePool(() => {
      kall++;
      return kall < 3 ? Promise.reject(tidsavbrudd()) : Promise.resolve([{ ok: 1 }]);
    });

    const rader = await withRetryBudget(() => sql`SELECT 1`, BUDSJETT);
    expect(rader).toEqual([{ ok: 1 }]);
    expect(kall).toBe(3);
  });

  // SKRIPTENE — `init-db.ts` og `import-bible.ts` er ingen forespørsel.
  test('utenfor en forespørsel har hvert kall sitt eget budsjett', async () => {
    const før = process.env.DB_RETRY_BUDGET_MS;
    process.env.DB_RETRY_BUDGET_MS = String(BUDSJETT);
    try {
      const dødPool = fakePool(() => Promise.reject(tidsavbrudd()));
      try {
        await dødPool`SELECT 1`;
      } catch {
        /* bruker opp ett helt budsjett */
      }

      let kall = 0;
      const sql = fakePool(() => {
        kall++;
        return kall < 2 ? Promise.reject(tidsavbrudd()) : Promise.resolve([{ ok: 1 }]);
      });
      expect(await (sql`SELECT 2` as unknown as Promise<unknown>)).toEqual([{ ok: 1 }]);
    } finally {
      if (før === undefined) delete process.env.DB_RETRY_BUDGET_MS;
      else process.env.DB_RETRY_BUDGET_MS = før;
    }
  });
});

describe('VERSJONSSJEKKEN bruker ikke leserens budsjett (#107)', () => {
  // Mikrocachens versjonssjekk kjører INNE i forespørselen. Med ett budsjett
  // per forespørsel ville en sjekk som ventet ut en DB-restart brukt det opp
  // før siden begynte å rendre — altså byttet «treg side» mot «feilside», og
  // det for den ene forespørselen i hvert 30-sekundersvindu som gjør sjekken.
  test('et eget budsjett på null venter ikke, og lar forespørselens stå igjen', async () => {
    const sql = fakePool(() => Promise.reject(tidsavbrudd()));

    await withRetryBudget(async () => {
      const t0 = Date.now();
      try {
        await withRetryBudget(async () => {
          await sql`SELECT value FROM db_meta`;
        }, 0);
      } catch {
        /* forventet — cachen beholder innholdet sitt */
      }
      expect(Date.now() - t0).toBeLessThan(100);
      // Leserens eget budsjett er urørt.
      expect(retryBudgetRemainingMs()!).toBeGreaterThan(BUDSJETT - 200);
    }, BUDSJETT);
  });

  // SØMMEN: `index.ts` starter en server ved import og kan ikke kalles fra en
  // test, så registreringen leses. Uten denne halvdelen er regelen over en
  // egenskap ingen bruker — samme grep som at `og-chapter-card` leser
  // Dockerfilen for at artefaktene faktisk blir med i imaget (#68).
  test('index.ts registrerer versjonsleseren med sitt eget budsjett', () => {
    const src = readFileSync(resolve(import.meta.dir, '../src/index.ts'), 'utf8');
    const kall = src.slice(src.indexOf('setContentVersionReader('));
    expect(kall).toContain('withRetryBudget(');
    expect(kall).toMatch(/\}, 0\)/);
  });
});

describe('RUTA: hver forespørsel kjøres inne i et budsjett (#107)', () => {
  test('en sidevisning har et budsjett når den rører databasen', async () => {
    const app = createApp();
    let sett: number | null = null;
    // Versjonsleseren er det første i forespørselen som rører basen, og den er
    // injisert — altså et målepunkt som ikke krever en testrute i appen.
    setContentVersionReader(async () => {
      sett = retryBudgetRemainingMs();
      return 'v107';
    });
    try {
      await app.request('http://localhost/nb/finnes-ikke-107');
      expect(typeof sett).toBe('number');
      expect(sett!).toBeGreaterThan(0);
    } finally {
      setContentVersionReader(null);
      clearPageCache();
    }
  });
});
