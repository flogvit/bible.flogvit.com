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
