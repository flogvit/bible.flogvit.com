// Hash-hjelpere for inkrementell import (port av bibel/scripts/import-utils.ts
// fra better-sqlite3 til Bun.sql/MySQL). content_hashes-tabellen opprettes av
// ensureSchema() i src/lib/schema.ts — ingen DDL her.

import { createHash } from 'node:crypto';
import type { SQL } from 'bun';
import { DEFAULT_CONTENT_LANGUAGE } from '../src/lib/lang.ts';

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
 * Check if content has changed by comparing hashes
 */
export async function hasContentChanged(
  sql: SQL,
  contentType: string,
  contentKey: string,
  newHash: string,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): Promise<boolean> {
  const rows = (await sql`
    SELECT content_hash FROM content_hashes
    WHERE content_type = ${contentType} AND content_key = ${contentKey} AND language = ${language}
  `) as { content_hash: string }[];
  const existing = rows[0];
  return !existing || existing.content_hash !== newHash;
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
 * Get all content hashes of a specific type
 */
export async function getContentHashes(
  sql: SQL,
  contentType: string,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): Promise<Map<string, { hash: string; updatedAt: string }>> {
  const rows = (await sql`
    SELECT content_key, content_hash, updated_at FROM content_hashes
    WHERE content_type = ${contentType} AND language = ${language}
  `) as { content_key: string; content_hash: string; updated_at: string }[];

  const map = new Map<string, { hash: string; updatedAt: string }>();
  for (const row of rows) {
    map.set(row.content_key, { hash: row.content_hash, updatedAt: row.updated_at });
  }
  return map;
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

/**
 * Get changed content keys since a given sync version
 * Returns content that was updated after the version was set
 */
export async function getChangedContentSince(
  sql: SQL,
  contentType: string,
  sinceVersion: number,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): Promise<string[]> {
  // Get the timestamp when the sinceVersion was set
  // If sinceVersion is 0, return all content
  if (sinceVersion === 0) {
    const rows = (await sql`
      SELECT content_key FROM content_hashes WHERE content_type = ${contentType} AND language = ${language}
    `) as { content_key: string }[];
    return rows.map((r) => r.content_key);
  }

  // Find content updated after the sync version was incremented
  const versionRows = (await sql`
    SELECT value FROM db_meta WHERE \`key\` = CONCAT('version_', ${String(sinceVersion)})
  `) as { value: string }[];
  const versionRow = versionRows[0];

  if (!versionRow) {
    // Version not found, return all content updated
    const rows = (await sql`
      SELECT content_key FROM content_hashes WHERE content_type = ${contentType} AND language = ${language}
    `) as { content_key: string }[];
    return rows.map((r) => r.content_key);
  }

  const sinceTimestamp = versionRow.value;
  const rows = (await sql`
    SELECT content_key FROM content_hashes
    WHERE content_type = ${contentType} AND language = ${language} AND updated_at > ${sinceTimestamp}
  `) as { content_key: string }[];
  return rows.map((r) => r.content_key);
}
