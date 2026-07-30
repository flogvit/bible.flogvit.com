// Delingslenker for manuskripter (GitHub #15, del 1).
//
// LENKEN ER TILGANGEN: en capability-URL med et ugjettbart token, som leses
// UTEN innlogging eller konto. Det gir tre krav som styrer alt her:
//
//   1. Tokenet må ikke kunne gjettes eller telles opp — 32 tilfeldige byte fra
//      crypto, base64url. Ingen løpenummer, ingen bruker-id i URL-en.
//   2. Oppslaget går KUN på tokenet (primærnøkkel). Det finnes ingen liste over
//      delte manuskripter og ingen annen vei inn.
//   3. Å trekke tilbake må virke UMIDDELBART. Derfor: ett levende token per
//      manuskript (regenerering erstatter), og delesiden holdes utenfor
//      mikrocachen — se page-cache.ts.
//
// Persistens av manuskripter er plus (husking=plus), altså er det å OPPRETTE en
// delingslenke plus-gated. Å LESE en delt lenke er gratis og krever ingen konto.

import { getSql } from './db.ts';

export interface ShareRow {
  token: string;
  itemId: string;
  createdAt: number;
}

/** 32 byte crypto-tilfeldighet, base64url (43 tegn) — ingen padding i URL-er. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Manuskriptet slik det ligger i sync_items (`data` fra klienten). */
export interface SharedDevotional {
  id?: string;
  slug?: string;
  title?: string;
  type?: string;
  date?: string;
  updatedAt?: number;
  versions?: { content?: string; locked?: boolean }[];
}

function parse<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

/** Delingslenkene brukeren har i dag, nyeste først. */
export async function listShares(userId: number): Promise<ShareRow[]> {
  const rows = (await getSql()`
    SELECT token, item_id, created_at FROM devotional_shares
    WHERE user_id = ${userId} ORDER BY created_at DESC
  `) as { token: string; item_id: string; created_at: number | bigint }[];
  return rows.map((r) => ({ token: r.token, itemId: r.item_id, createdAt: Number(r.created_at) }));
}

/**
 * Oppretter en lenke, eller gir den eksisterende tilbake.
 *
 * Idempotent med vilje: «Del» to ganger skal ikke gi to gyldige lenker til
 * samme tekst — da ville «trekk tilbake» bare truffet den ene. Vil man bytte
 * lenke, er det `regenerateShare()`, som TREKKER TILBAKE den gamle.
 *
 * Returnerer null om manuskriptet ikke finnes hos brukeren: man skal ikke kunne
 * opprette en lenke til noe man ikke eier, eller til et slettet manuskript.
 */
export async function createShare(userId: number, itemId: string): Promise<ShareRow | null> {
  const sql = getSql();
  if (!(await ownsDevotional(userId, itemId))) return null;

  const existing = (await sql`
    SELECT token, item_id, created_at FROM devotional_shares
    WHERE user_id = ${userId} AND item_id = ${itemId}
  `) as { token: string; item_id: string; created_at: number | bigint }[];
  const found = existing[0];
  if (found) return { token: found.token, itemId: found.item_id, createdAt: Number(found.created_at) };

  const token = newToken();
  const createdAt = Date.now();
  await sql`
    INSERT INTO devotional_shares (token, user_id, item_id, created_at)
    VALUES (${token}, ${userId}, ${itemId}, ${createdAt})
  `;
  return { token, itemId, createdAt };
}

/** Nytt token, gammelt ugyldig fra samme øyeblikk. */
export async function regenerateShare(userId: number, itemId: string): Promise<ShareRow | null> {
  await revokeShare(userId, itemId);
  return createShare(userId, itemId);
}

/** Trekker tilbake lenken. `true` om det faktisk fantes en. */
export async function revokeShare(userId: number, itemId: string): Promise<boolean> {
  const sql = getSql();
  const before = (await sql`
    SELECT token FROM devotional_shares WHERE user_id = ${userId} AND item_id = ${itemId}
  `) as { token: string }[];
  if (before.length === 0) return false;
  await sql`DELETE FROM devotional_shares WHERE user_id = ${userId} AND item_id = ${itemId}`;
  return true;
}

async function ownsDevotional(userId: number, itemId: string): Promise<boolean> {
  const rows = (await getSql()`
    SELECT 1 AS n FROM sync_items
    WHERE user_id = ${userId} AND data_type = 'devotionals' AND item_id = ${itemId} AND deleted = 0
  `) as { n: number }[];
  return rows.length > 0;
}

/**
 * Slår opp et token og gir manuskriptet.
 *
 * Sletter eieren manuskriptet, blir raden i sync_items `deleted = 1` — og da
 * skal lenken være død. Filteret er derfor en del av tilgangskontrollen, ikke
 * en opprydding.
 */
export async function resolveShare(token: string): Promise<SharedDevotional | null> {
  if (!token) return null;
  const rows = (await getSql()`
    SELECT i.data FROM devotional_shares s
    JOIN sync_items i
      ON i.user_id = s.user_id AND i.item_id = s.item_id AND i.data_type = 'devotionals'
    WHERE s.token = ${token} AND i.deleted = 0
  `) as { data: unknown }[];
  return rows[0] ? parse<SharedDevotional>(rows[0].data) : null;
}

/** Innholdet som skal vises: utkastet, ellers første versjon. */
export function sharedContent(dev: SharedDevotional): string {
  const versions = dev.versions ?? [];
  const draft = versions.find((v) => !v.locked) ?? versions[0];
  return draft?.content ?? '';
}
