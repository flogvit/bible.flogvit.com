// Felles for skriptene som leser free-bible: kildestien, og hash-hjelperne for
// inkrementell import (port av bibel/scripts/import-utils.ts fra better-sqlite3
// til Bun.sql/MySQL). content_hashes-tabellen opprettes av
// ensureSchema() i src/lib/schema.ts — ingen DDL her.

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { SQL } from 'bun';
import { DEFAULT_CONTENT_LANGUAGE } from '../src/lib/lang.ts';

/**
 * free-bible-klonen skriptene leser fra og skriver til. Standard er
 * søsterkatalogen `../free-bible` relativt til cwd (skriptene kjøres fra
 * bibel/); FREE_BIBLE_DIR overstyrer. deploy-bibel-data.sh setter den til den
 * resolverte stien, slik at importen aldri leser en tilfeldig/stale klon ved
 * feil cwd.
 */
export const FREE_BIBLE_DIR = process.env.FREE_BIBLE_DIR
  ? path.resolve(process.env.FREE_BIBLE_DIR)
  : path.join(process.cwd(), '..', 'free-bible');

// Alle oppslag er scopet på språk (se schema.ts): samme content_key finnes én
// gang per språk. Språknøytralt innhold (kapitler, word4word, vers-mappinger)
// føres på gulvet, som også er defaulten her.

/**
 * Compute SHA256 hash of content
 */
export function computeHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Update the content hash in database
 */
export async function updateContentHash(
  sql: SQL,
  contentType: string,
  contentKey: string,
  hash: string,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): Promise<void> {
  await sql`
    REPLACE INTO content_hashes (content_type, content_key, content_hash, updated_at, language)
    VALUES (${contentType}, ${contentKey}, ${hash}, ${new Date().toISOString()}, ${language})
  `;
}

/**
 * Get sync version from database
 */
export async function getSyncVersion(sql: SQL): Promise<number> {
  const rows = (await sql`
    SELECT value FROM db_meta WHERE \`key\` = 'sync_version'
  `) as { value: string }[];
  const row = rows[0];
  return row ? parseInt(row.value, 10) : 0;
}

/**
 * Increment sync version
 */
export async function incrementSyncVersion(sql: SQL): Promise<number> {
  const currentVersion = await getSyncVersion(sql);
  const newVersion = currentVersion + 1;
  await sql`
    REPLACE INTO db_meta (\`key\`, value) VALUES ('sync_version', ${String(newVersion)})
  `;
  return newVersion;
}
