// Bun.sql-pool mot managed db-flogvit (ALDRI DB i Docker). Samme env-konvensjon
// som konto (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME). Lokal utvikling går
// mot lokal MySQL (DBngin).

import { SQL } from 'bun';

export const DB_NAME = process.env.DB_NAME || 'flogvit_bibel';

let pool: SQL | null = null;

export function getSql(): SQL {
  if (!pool) {
    pool = new SQL({
      adapter: 'mysql',
      hostname: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: DB_NAME,
      max: Number(process.env.DB_POOL_MAX || 5),
      // Feil RASKT naar basen er borte. Bun sin standard er 30 s, altsaa
      // lenger enn Caddys 10 s proxy-timeout: forespoerselen hang til Caddy
      // kuttet og ga 502, i stedet for at vi rakk aa svare selv. Scaleway-basen
      // ligger paa «Cost Optimized» (delte ressurser, EKSPLISITT unntatt SLA)
      // og faar ordnede SIGTERM-er; selve avbruddet er kort (maalt 28 s og 12 s
      // 2026-07-28), men uten dette ble et kvarters utfall av det.
      connectionTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 2),
      // Resirkuler tilkoblinger, saa poolen ikke blir staaende med forbindelser
      // til en server som forsvant.
      maxLifetime: Number(process.env.DB_MAX_LIFETIME || 900),
    });
  }
  return pool;
}

export async function closeSql(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
