// Sync-API — port av gamle api/routes/sync.ts (Express/mysql2) til Hono +
// Bun.sql, med EKSAKT samme JSON-kontrakt. user_id er nå konto-bruker-id
// (requirePlus fra session.ts — husking er plus-gated); bibels egen users-tabell finnes ikke lenger.
// ÅPEN BESLUTNING (ISSUES.md #6): ev. plus-gating — da legges én
// entitlement-sjekk (c.var.user.plus) i middleware her.

import { Hono } from 'hono';
import type { SQL } from 'bun';
import { getSql } from '../lib/db.ts';
import type { AppEnv } from '../lib/session.ts';
import { requirePlus } from '../lib/session.ts';

// Enkel rate-limit per bruker i minnet (som originalen).
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

interface SyncChange {
  dataType: string;
  itemId: string;
  data: unknown;
  updatedAt: number;
  deleted?: boolean;
}

interface SyncItemRow {
  data_type?: string;
  item_id?: string;
  data: unknown;
  updated_at: number | bigint;
  deleted: number | boolean;
}

function parseData(raw: unknown): unknown {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

interface PlanProgress {
  completedDays?: number[];
  [key: string]: unknown;
}

/** Leseplan-progresjon merges: completedDays som union av begge sider. */
function mergeReadingPlanProgress(clientData: unknown, serverData: unknown): PlanProgress {
  const client = (clientData ?? {}) as PlanProgress;
  const server = (serverData ?? {}) as PlanProgress;
  const merged = [...new Set([...(client.completedDays ?? []), ...(server.completedDays ?? [])])].sort(
    (a, b) => a - b,
  );
  return { ...server, ...client, completedDays: merged };
}

const sync = new Hono<AppEnv>();

// Husking (skylagring/sync) er en del av FLOGVIT.plus (2026-07-22).
sync.use('*', requirePlus);

/** POST / — hovedsync: push klientendringer, pull serverendringer. */
sync.post('/', async (c) => {
  const userId = c.var.user!.id;
  if (!checkRateLimit(userId)) return c.json({ error: 'Too many requests' }, 429);

  const body = await c.req.json().catch(() => null);
  const { deviceId, lastSyncAt, changes } = (body ?? {}) as {
    deviceId?: string;
    lastSyncAt?: number;
    changes?: SyncChange[];
  };
  if (!deviceId) return c.json({ error: 'Missing deviceId' }, 400);

  const sql = getSql();
  try {
    const result = await sql.begin(async (tx: SQL) => {
      const serverChanges: SyncChange[] = [];
      const now = Date.now();

      for (const change of changes ?? []) {
        const { dataType, itemId, data, updatedAt, deleted } = change;
        const [existing] = (await tx`
          SELECT data, updated_at, deleted FROM sync_items
          WHERE user_id = ${userId} AND data_type = ${dataType} AND item_id = ${itemId}
        `) as SyncItemRow[];

        if (!existing) {
          await tx`
            INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
            VALUES (${userId}, ${dataType}, ${itemId}, ${JSON.stringify(data)}, ${updatedAt}, ${deleted ? 1 : 0})
          `;
        } else if (updatedAt > Number(existing.updated_at)) {
          // Klienten er nyest — oppdater serveren.
          const payload =
            dataType === 'planProgress'
              ? mergeReadingPlanProgress(data, parseData(existing.data))
              : data;
          await tx`
            UPDATE sync_items
            SET data = ${JSON.stringify(payload)}, updated_at = ${updatedAt}, deleted = ${deleted ? 1 : 0}
            WHERE user_id = ${userId} AND data_type = ${dataType} AND item_id = ${itemId}
          `;
        } else if (Number(existing.updated_at) > updatedAt) {
          // Serveren er nyest — send serverversjonen tilbake.
          const serverData = parseData(existing.data);
          if (dataType === 'planProgress') {
            const merged = mergeReadingPlanProgress(data, serverData);
            serverChanges.push({
              dataType,
              itemId,
              data: merged,
              updatedAt: Number(existing.updated_at),
              deleted: !!existing.deleted,
            });
            await tx`
              UPDATE sync_items SET data = ${JSON.stringify(merged)}
              WHERE user_id = ${userId} AND data_type = ${dataType} AND item_id = ${itemId}
            `;
          } else {
            serverChanges.push({
              dataType,
              itemId,
              data: serverData,
              updatedAt: Number(existing.updated_at),
              deleted: !!existing.deleted,
            });
          }
        }
        // Like tidsstempler = ingenting å gjøre.
      }

      // Pull: serverendringer siden forrige sync som ikke alt er håndtert over.
      const serverRows = (await tx`
        SELECT data_type, item_id, data, updated_at, deleted FROM sync_items
        WHERE user_id = ${userId} AND updated_at > ${lastSyncAt ?? 0}
      `) as SyncItemRow[];

      const processedKeys = new Set((changes ?? []).map((ch) => `${ch.dataType}:${ch.itemId}`));
      for (const row of serverRows) {
        const key = `${row.data_type}:${row.item_id}`;
        if (processedKeys.has(key)) continue;
        serverChanges.push({
          dataType: row.data_type!,
          itemId: row.item_id!,
          data: parseData(row.data),
          updatedAt: Number(row.updated_at),
          deleted: !!row.deleted,
        });
      }

      await tx`
        INSERT INTO sync_cursors (user_id, device_id, last_sync_at)
        VALUES (${userId}, ${deviceId}, ${now})
        ON DUPLICATE KEY UPDATE last_sync_at = ${now}
      `;

      return { syncedAt: now, changes: serverChanges };
    });
    return c.json(result);
  } catch (err) {
    console.error('Sync error:', err);
    return c.json({ error: 'Sync failed' }, 500);
  }
});

interface UserBibleIn {
  id: string;
  name: string;
  mappingId: string;
  verseCounts?: unknown;
  uploadedAt: number;
  deleted?: boolean;
}

interface UserBibleRow {
  id: string;
  name: string;
  mapping_id: string;
  verse_counts: unknown;
  uploaded_at: number | bigint;
  deleted: number | boolean;
}

/** POST /user-bibles — sync av bibel-metadata (ikke kapitteldata). */
sync.post('/user-bibles', async (c) => {
  const userId = c.var.user!.id;
  const body = await c.req.json().catch(() => null);
  const { bibles } = (body ?? {}) as { bibles?: UserBibleIn[] };

  const sql = getSql();
  try {
    const serverBibles = await sql.begin(async (tx: SQL) => {
      const existingRows = (await tx`
        SELECT id, name, mapping_id, verse_counts, uploaded_at, deleted
        FROM user_bibles WHERE user_id = ${userId}
      `) as UserBibleRow[];
      const existingMap = new Map(existingRows.map((r) => [r.id, r]));

      for (const bible of bibles ?? []) {
        const existing = existingMap.get(bible.id);
        if (!existing) {
          await tx`
            INSERT INTO user_bibles (id, user_id, name, mapping_id, verse_counts, uploaded_at, deleted)
            VALUES (${bible.id}, ${userId}, ${bible.name}, ${bible.mappingId},
                    ${JSON.stringify(bible.verseCounts ?? null)}, ${bible.uploadedAt}, ${bible.deleted ? 1 : 0})
          `;
        } else if (bible.uploadedAt > Number(existing.uploaded_at)) {
          await tx`
            UPDATE user_bibles
            SET name = ${bible.name}, mapping_id = ${bible.mappingId},
                verse_counts = ${JSON.stringify(bible.verseCounts ?? null)},
                uploaded_at = ${bible.uploadedAt}, deleted = ${bible.deleted ? 1 : 0}
            WHERE id = ${bible.id}
          `;
        }
      }

      const allRows = (await tx`
        SELECT id, name, mapping_id, verse_counts, uploaded_at, deleted
        FROM user_bibles WHERE user_id = ${userId}
      `) as UserBibleRow[];
      return allRows.map((row) => ({
        id: row.id,
        name: row.name,
        mappingId: row.mapping_id,
        verseCounts: parseData(row.verse_counts),
        uploadedAt: Number(row.uploaded_at),
        deleted: !!row.deleted,
      }));
    });
    return c.json({ bibles: serverBibles });
  } catch (err) {
    console.error('User bible sync error:', err);
    return c.json({ error: 'User bible sync failed' }, 500);
  }
});

async function ownsBible(sql: SQL, bibleId: string, userId: number): Promise<boolean> {
  const rows = (await sql`
    SELECT id FROM user_bibles WHERE id = ${bibleId} AND user_id = ${userId}
  `) as { id: string }[];
  return rows.length > 0;
}

/** POST /user-bible-chapters/:id — last opp kapitler (chunket). */
sync.post('/user-bible-chapters/:id', async (c) => {
  const userId = c.var.user!.id;
  const bibleId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const { chapters } = (body ?? {}) as {
    chapters?: Array<{ bookId: number; chapter: number; data: unknown }>;
  };

  const sql = getSql();
  try {
    if (!(await ownsBible(sql, bibleId, userId))) {
      return c.json({ error: 'Bible not found' }, 404);
    }
    await sql.begin(async (tx: SQL) => {
      for (const ch of chapters ?? []) {
        await tx`
          INSERT INTO user_bible_chapters (bible_id, book_id, chapter, data)
          VALUES (${bibleId}, ${ch.bookId}, ${ch.chapter}, ${JSON.stringify(ch.data)})
          ON DUPLICATE KEY UPDATE data = VALUES(data)
        `;
      }
    });
    return c.json({ ok: true, count: chapters?.length ?? 0 });
  } catch (err) {
    console.error('Upload chapters error:', err);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

/** GET /user-bible-chapters/:id — last ned alle kapitler for en bibel. */
sync.get('/user-bible-chapters/:id', async (c) => {
  const userId = c.var.user!.id;
  const bibleId = c.req.param('id');

  const sql = getSql();
  try {
    if (!(await ownsBible(sql, bibleId, userId))) {
      return c.json({ error: 'Bible not found' }, 404);
    }
    const rows = (await sql`
      SELECT book_id, chapter, data FROM user_bible_chapters
      WHERE bible_id = ${bibleId} ORDER BY book_id, chapter
    `) as { book_id: number; chapter: number; data: unknown }[];
    return c.json({
      chapters: rows.map((row) => ({
        bookId: row.book_id,
        chapter: row.chapter,
        data: parseData(row.data),
      })),
    });
  } catch (err) {
    console.error('Download chapters error:', err);
    return c.json({ error: 'Download failed' }, 500);
  }
});

export default sync;
