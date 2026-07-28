// Server-først husking: serveren (sync_items, keyed på konto-bruker) er
// sannhetskilden for brukerdata. Disse leserne brukes til SSR av brukersidene
// for innloggede plus-brukere; klienten (sync.js) holder lokal kopi i synk.

import { getSql } from './db.ts';

function parseData<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

/** Alle levende items av en type (favorites, notes, verseLists, devotionals …). */
export async function getUserItems<T>(userId: number, dataType: string): Promise<T[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT data FROM sync_items
    WHERE user_id = ${userId} AND data_type = ${dataType} AND deleted = 0
  `) as { data: unknown }[];
  return rows.map((r) => parseData<T>(r.data)).filter((x): x is T => x != null);
}

export interface ChapterProgress {
  bookId: number;
  chapter: number;
  firstAt: number | null;
  lastAt: number | null;
  count: number;
  opens: number;
  verses?: string;
}

/**
 * Lesefremdrift per kapittel (GitHub #16). Én rad per kapittel med
 * `item_id = "<bookId>-<chapter>"`; ugyldige nøkler hoppes over framfor å
 * velte lesekartet.
 */
export async function getReadingProgress(userId: number): Promise<ChapterProgress[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT item_id, data FROM sync_items
    WHERE user_id = ${userId} AND data_type = 'readingProgress' AND deleted = 0
  `) as { item_id: string; data: unknown }[];

  const out: ChapterProgress[] = [];
  for (const row of rows) {
    const [bookRaw, chapterRaw] = String(row.item_id).split('-');
    const bookId = Number(bookRaw);
    const chapter = Number(chapterRaw);
    if (!Number.isInteger(bookId) || !Number.isInteger(chapter)) continue;
    const data = parseData<Partial<ChapterProgress>>(row.data);
    if (!data) continue;
    out.push({
      bookId,
      chapter,
      firstAt: data.firstAt ?? null,
      lastAt: data.lastAt ?? null,
      count: data.count ?? 0,
      opens: data.opens ?? 0,
      ...(data.verses ? { verses: data.verses } : {}),
    });
  }
  return out;
}

/** Singleton-typer (topics, activePlan, readingPosition …). */
export async function getUserSingleton<T>(userId: number, dataType: string): Promise<T | null> {
  const sql = getSql();
  const [row] = (await sql`
    SELECT data FROM sync_items
    WHERE user_id = ${userId} AND data_type = ${dataType} AND item_id = '_singleton' AND deleted = 0
  `) as { data: unknown }[];
  return row ? parseData<T>(row.data) : null;
}
