// Klassifiseringen bak DB-retryen (se blokka øverst i db.ts). Testes begge
// veier: en ekte spørrefeil som ble tolket som «forbindelse» ville blitt
// gjentatt i 25 sekunder, og en skriving tolket som lesning ville kunne
// telt noe to ganger.

import { expect, test, describe } from 'bun:test';
import { isConnectionError, isReadOnly } from './db.ts';

describe('isConnectionError', () => {
  test('kjenner igjen feilene fra prod-utfallet 2026-07-28', () => {
    for (const m of [
      'Server shutdown in progress',
      'Connection timeout after 30s',
      'Connection closed',
      'Too many connections',
      'connect ECONNREFUSED 172.16.16.2:3306',
      // Vår EGEN maxLifetime — Bun kaster den til kalleren (prod, /en/2kong/18).
      'Max lifetime timeout reached after 15m',
    ]) expect(isConnectionError(new Error(m))).toBe(true);
  });

  test('leser err.code, som er der Bun legger prod-koden', () => {
    expect(isConnectionError(
      Object.assign(new Error('query failed'), { code: 'ERR_MYSQL_CONNECTION_CLOSED' })
    )).toBe(true);
  });

  test('gjentar IKKE ekte spørrefeil', () => {
    for (const m of [
      "Table 'flogvit_bibel.verses' doesn't exist",
      'You have an error in your SQL syntax',
      'Access denied for user',
    ]) expect(isConnectionError(new Error(m))).toBe(false);
  });
});

describe('isReadOnly', () => {
  test('lesninger gjentas', () => {
    expect(isReadOnly('SELECT * FROM verses')).toBe(true);
    expect(isReadOnly('\n    SELECT id FROM books')).toBe(true);
    expect(isReadOnly('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
  });

  test('skrivinger gjentas ALDRI', () => {
    expect(isReadOnly('INSERT INTO user_data VALUES (1)')).toBe(false);
    expect(isReadOnly('UPDATE users SET n = 1')).toBe(false);
    expect(isReadOnly('DELETE FROM sessions')).toBe(false);
    expect(isReadOnly('INSERT INTO t SELECT * FROM u')).toBe(false);
  });
});
