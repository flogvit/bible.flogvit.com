// Leser kontos slettestrøm og sletter det bibel har under hver slettet uid
// (#140). Konto sletter bare sine EGNE tabeller; det vi lagrer under konto-uid-en
// står igjen til vi rydder selv, mens personvernerklæringen lover at kontoen
// slettes «med all tilhørende fremgang». Kontrakten står i konto README →
// «Slettestrømmen», og formen er portet fra lab (`kontosletting.ts`):
//
//   GET <konto>/api/account/deletions?after=<markør>
//   Authorization: Bearer <DELETIONS_SECRET>
//   → {"deletions": [{"seq", "uid", "deletedAt"}], "latestSeq"}
//
// Markøren flyttes først når en side er behandlet ferdig — `after` er
// kvitteringen konto bokfører, og en uid som slettes to ganger etter en krasj
// er ufarlig. Hemmeligheten er DELETIONS_SECRET_BIBEL i konto.env og
// DELETIONS_SECRET her (provisjoneres av flogvit-com-server#293).

import type { SQL } from 'bun';
import { getSql } from './db.ts';
import { loggFeil } from './error-handler.ts';
import { accountApiUrl } from './session.ts';

/**
 * Hver tabell som bærer en `user_id`. `test/kontosletting.test.ts` leser
 * DDL-en i `TABLES` og krever at lista er nøyaktig de tabellene, så en ny
 * brukertabell blir rød framfor å bli glemt av slettingen.
 *
 * `user_bible_chapters` har ingen `user_id` — den henger på `user_bibles` og
 * slettes gjennom den (se `slettBrukerdata`).
 */
export const KONTO_TABELLER = [
  'sync_items',
  'sync_cursors',
  'user_bibles',
  'contrib_submissions',
  'devotional_shares',
  'devotional_publications',
] as const;

/**
 * Alt bibel har under uid-en, i én transaksjon. Idempotent: en uid kan komme
 * to ganger, og DELETE på en uid uten rader er en no-op.
 *
 * Publiserte manuskripter SLETTES, de anonymiseres ikke. Teksten er
 * forfatterens, og tilbaketrekking er det eneste vernet katalogen gir
 * forfatteren: en anonymisert oppføring ville stått offentlig uten noen konto
 * som kunne trekke den tilbake, altså en tekst ingen lenger rår over. Den ville
 * uansett ikke vært synlig — katalogen JOIN-er mot en levende rad i
 * `sync_items`, og den slettes her — så å beholde raden ville bare holdt på
 * innhold leseren aldri får se.
 *
 * Kapitlene i en opplastet bibel slettes eksplisitt framfor å stole på
 * `ON DELETE CASCADE`: en base der FK-en aldri ble lagt på (eldre skjema,
 * en annen motor) ville ellers beholdt hele teksten uten eier.
 */
export async function slettBrukerdata(uid: number, sql: SQL = getSql()): Promise<void> {
  await sql.begin(async (tx: SQL) => {
    await tx`
      DELETE c FROM user_bible_chapters c
      JOIN user_bibles b ON b.id = c.bible_id
      WHERE b.user_id = ${uid}
    `;
    await tx`DELETE FROM user_bibles WHERE user_id = ${uid}`;
    await tx`DELETE FROM sync_items WHERE user_id = ${uid}`;
    await tx`DELETE FROM sync_cursors WHERE user_id = ${uid}`;
    await tx`DELETE FROM contrib_submissions WHERE user_id = ${uid}`;
    await tx`DELETE FROM devotional_shares WHERE user_id = ${uid}`;
    await tx`DELETE FROM devotional_publications WHERE user_id = ${uid}`;
  });
}

/** Siste seq bibel har behandlet ferdig. 0 før første runde. */
export async function hentMarkør(sql: SQL = getSql()): Promise<number> {
  const rows = (await sql`SELECT last_seq FROM deletion_cursor WHERE id = 1`) as {
    last_seq: number | string;
  }[];
  return Number(rows[0]?.last_seq ?? 0);
}

/** Markøren går aldri bakover — en sen runde skal ikke angre en nyere. */
export async function settMarkør(seq: number, sql: SQL = getSql()): Promise<void> {
  await sql`
    INSERT INTO deletion_cursor (id, last_seq) VALUES (1, ${seq})
    ON DUPLICATE KEY UPDATE last_seq = GREATEST(last_seq, VALUES(last_seq))
  `;
}

// «Hvert 10. minutt holder» (konto README). Personvernerklæringen sier
// «umiddelbart»; ti minutter er det nærmeste en strøm kommer.
const INTERVALL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10_000;
// Vern mot en konto som svarer med samme side om og om igjen.
const MAKS_SIDER = 1000;

interface Sletting {
  seq: number;
  uid: number;
}
interface Side {
  deletions: Sletting[];
  latestSeq: number;
}

export interface Strøm {
  url: string;
  secret: string;
  fetch?: typeof fetch;
}

async function hentSide(s: Strøm, after: number): Promise<Side> {
  const res = await (s.fetch ?? fetch)(`${s.url}?after=${after}`, {
    headers: { authorization: `Bearer ${s.secret}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`slettestrømmen svarte ${res.status}`);
  const side = (await res.json()) as Side;
  if (!Array.isArray(side?.deletions) || !Number.isFinite(side.latestSeq)) {
    throw new Error('slettestrømmen svarte med noe som ikke er en side');
  }
  return side;
}

/**
 * Én runde: les fra markøren til `latestSeq`, slett hver uid, flytt markøren
 * etter hver side. Kaster ved første feil; markøren står da på siste side som
 * ble ferdig, og neste runde tar resten.
 */
export async function lesSlettestrømmen(s: Strøm): Promise<{ slettet: number; markør: number }> {
  let markør = await hentMarkør();
  let slettet = 0;
  for (let i = 0; i < MAKS_SIDER; i++) {
    const side = await hentSide(s, markør);
    if (side.deletions.length === 0) break;
    let sist = markør;
    for (const d of side.deletions) {
      await slettBrukerdata(Number(d.uid));
      slettet++;
      sist = Math.max(sist, Number(d.seq));
    }
    if (sist <= markør) break;
    await settMarkør(sist);
    markør = sist;
    if (markør >= side.latestSeq) break;
  }
  return { slettet, markør };
}

export interface StartValg {
  secret?: string;
  url?: string;
  fetch?: typeof fetch;
  logg?: (melding: string) => void;
}

/**
 * Starter den jevnlige lesingen. Uten hemmelighet sier den fra i loggen og lar
 * være — da får bibel aldri vite om en sletting, og det skal synes.
 */
export function startSlettestrømmen(v: StartValg = {}): boolean {
  const logg = v.logg ?? ((m: string) => console.error(m));
  const secret = v.secret ?? process.env.DELETIONS_SECRET ?? '';
  if (!secret) {
    logg(
      'kontosletting: DELETIONS_SECRET mangler — bibel leser ikke slettestrømmen, ' +
        'og synkdata til slettede kontoer blir liggende (#140).',
    );
    return false;
  }
  const strøm: Strøm = {
    url: v.url ?? `${accountApiUrl()}/api/account/deletions`,
    secret,
    fetch: v.fetch,
  };
  let pågår = false;
  const runde = async () => {
    if (pågår) return;
    pågår = true;
    try {
      const { slettet, markør } = await lesSlettestrømmen(strøm);
      if (slettet > 0) console.log(`kontosletting: ${slettet} konto(er) ryddet, markør ${markør}`);
    } catch (err) {
      loggFeil(`kontosletting: prøver igjen om ${INTERVALL_MS / 60000} min`, err);
    } finally {
      pågår = false;
    }
  };
  void runde();
  setInterval(runde, INTERVALL_MS).unref();
  return true;
}
