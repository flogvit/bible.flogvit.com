/**
 * VAKT: `sql.unsafe(…)` er OGSÅ en lesning, og den gjentas som en (#117).
 *
 * Saken: `/nn/mark/10` fikk 503 «Database unavailable» på 0,030 s mens basen
 * var frisk. Feilen var vår egen `maxLifetime` (15 min), som `isConnectionError`
 * kjenner igjen og sier skal gjentas — men retryen fanget bare `apply`, altså
 * tagged-template-kallene. `sql.unsafe(…)` er et property-oppslag og gikk rett
 * til poolen, og den brukes til lesninger på kapittelsida (`blob-forfilter.ts`,
 * `bible.ts`). Første backoff er 200 ms, så retryen kjørte aldri.
 *
 * Fire halvdeler. LESNINGEN (sakens egen verifisering: en `SELECT` gjennom
 * `unsafe` som møter max lifetime, prøves på nytt). SKRIVINGEN (en `UPDATE`
 * gjennom `unsafe` prøves IKKE på nytt, og kalleren får poolens eget
 * spørreobjekt tilbake — `schema.ts` kaller `.simple()` på det). BUDSJETTET
 * (`unsafe` deler forespørselens budsjett som resten, #107). Og ALT ANNET
 * (andre property-oppslag treffer poolen uendret).
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { SQL } from 'bun';
import { withRetry, withRetryBudget } from '../src/lib/db.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Feilen fra containerloggen, ordrett. */
const maxLifetime = () => new Error('Max lifetime timeout reached after 15m');

/** En «pool» der bare `unsafe` er interessant; svaret styres per kall. */
function fakePool(unsafe: (query: string, params?: unknown[]) => unknown): { sql: SQL; base: SQL } {
  const base = Object.assign(() => Promise.resolve([]), {
    unsafe,
    marker: 'poolens egen',
  }) as unknown as SQL;
  return { sql: withRetry(base), base };
}

describe('sql.unsafe gjentas som en lesning (#117)', () => {
  test('en SELECT som møter max lifetime prøves på nytt', async () => {
    let kall = 0;
    const { sql } = fakePool(() => {
      kall++;
      return kall === 1 ? Promise.reject(maxLifetime()) : Promise.resolve([{ ok: 1 }]);
    });
    const rader = await sql.unsafe('SELECT 1');
    expect(kall).toBe(2);
    expect(rader).toEqual([{ ok: 1 }]);
  });

  test('parametrene bæres med på hvert forsøk', async () => {
    const sett: unknown[][] = [];
    let kall = 0;
    const { sql } = fakePool((_q, params) => {
      sett.push(params ?? []);
      return ++kall === 1 ? Promise.reject(maxLifetime()) : Promise.resolve([]);
    });
    await sql.unsafe('SELECT * FROM persons WHERE language = ?', ['nn']);
    expect(sett).toEqual([['nn'], ['nn']]);
  });

  test('en ekte spørrefeil gjentas ikke', async () => {
    let kall = 0;
    const { sql } = fakePool(() => {
      kall++;
      return Promise.reject(new Error("Table 'bibel.nope' doesn't exist"));
    });
    await expect(sql.unsafe('SELECT * FROM nope')).rejects.toThrow('nope');
    expect(kall).toBe(1);
  });

  test('en SKRIVING gjentas ikke, og kalleren får poolens eget objekt', async () => {
    let kall = 0;
    const objekt = { simple: () => Promise.reject(maxLifetime()) };
    const { sql } = fakePool(() => {
      kall++;
      return objekt;
    });
    const svar = sql.unsafe('UPDATE persons SET ref_books = ? WHERE 1', ['x']);
    expect(svar as unknown).toBe(objekt);
    await expect((svar as unknown as typeof objekt).simple()).rejects.toThrow('Max lifetime');
    expect(kall).toBe(1);
  });

  test('unsafe deler forespørselens budsjett (#107)', async () => {
    let kall = 0;
    const { sql } = fakePool(() => {
      kall++;
      return Promise.reject(maxLifetime());
    });
    await withRetryBudget(async () => {
      await expect(sql.unsafe('SELECT 1')).rejects.toThrow('Max lifetime');
    }, 0);
    expect(kall).toBe(1);
  });

  test('andre property-oppslag treffer poolen uendret', () => {
    const { sql, base } = fakePool(() => Promise.resolve([]));
    expect((sql as unknown as { marker: string }).marker).toBe('poolens egen');
    expect(sql.unsafe).not.toBe(base.unsafe);
  });
});
