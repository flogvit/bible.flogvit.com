// En slettet konto tar med seg det bibel har under uid-en (#140) — ekte lokal
// MySQL (.env) og en slettestrøm som bare er svaret sitt (injisert fetch).
//
// Fire halvdeler:
//   FORMEN    hver tabell i skjemaet med `user_id` står i KONTO_TABELLER, og
//             omvendt — lest ut av DDL-en, så en ny brukertabell blir rød
//             framfor å bli glemt av slettingen.
//   DATAENE   alt under den slettede uid-en er borte (også kapitlene i en
//             opplastet bibel, og den publiserte teksten i katalogen), mens en
//             annen brukers rader står urørt — ellers ville «tøm tabellene»
//             bestått.
//   MARKØREN  konto får `after=<markør>` og hemmeligheten, markøren flyttes
//             til siste seq, sidene blas, og en runde som feiler flytter den
//             IKKE (da tar neste runde resten).
//   OPPSTARTEN uten hemmelighet sier den fra høyt og lar være.

import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema, TABLES } from '../src/lib/schema.ts';
import {
  KONTO_TABELLER,
  hentMarkør,
  lesSlettestrømmen,
  slettBrukerdata,
  startSlettestrømmen,
} from '../src/lib/kontosletting.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const SLETTET = 991401;
const ANNEN = 991402;
const SLUG = (uid: number) => `kontosletting-${uid}`;
const BIBEL = (uid: number) => `kontosletting-bibel-${uid}`;
const SECRET = 'slettestrom-test';

let opprinneligMarkør: number | null = null;

async function seed(uid: number) {
  const sql = getSql();
  const now = Date.now();
  const manus = JSON.stringify({ id: 'dev-ks', title: 'Andakt', versions: [{ id: 'v1', content: 'tekst' }] });
  await sql`
    INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
    VALUES (${uid}, 'devotionals', 'dev-ks', ${manus}, ${now}, 0),
           (${uid}, 'settings', 'settings', ${'{"theme":"dark"}'}, ${now}, 0)
  `;
  await sql`INSERT INTO sync_cursors (user_id, device_id, last_sync_at) VALUES (${uid}, 'enhet', ${now})`;
  await sql`
    INSERT INTO user_bibles (id, user_id, name, mapping_id, verse_counts, uploaded_at)
    VALUES (${BIBEL(uid)}, ${uid}, 'Min bibel', 'osnb', ${'{}'}, ${now})
  `;
  await sql`
    INSERT INTO user_bible_chapters (bible_id, book_id, chapter, data)
    VALUES (${BIBEL(uid)}, 1, 1, ${'{"1":"I begynnelsen"}'})
  `;
  await sql`
    INSERT INTO contrib_submissions (user_id, kind, payload, created_at, updated_at)
    VALUES (${uid}, 'work', ${'{}'}, ${now}, ${now})
  `;
  await sql`
    INSERT INTO devotional_shares (token, user_id, item_id, created_at)
    VALUES (${`ks-token-${uid}`}, ${uid}, 'dev-ks', ${now})
  `;
  await sql`
    INSERT INTO devotional_publications
      (slug, user_id, item_id, author_name, title, content, status, submitted_at, decided_at)
    VALUES (${SLUG(uid)}, ${uid}, 'dev-ks', 'Forfatter', 'Andakt', 'tekst', 'approved', ${now}, ${now})
  `;
}

async function rydd() {
  for (const uid of [SLETTET, ANNEN]) await slettBrukerdata(uid);
}

/** Rader per tabell for uid-en, kapitlene i bibelen dens inkludert. */
async function rader(uid: number): Promise<Record<string, number>> {
  const sql = getSql();
  const ut: Record<string, number> = {};
  for (const t of KONTO_TABELLER) {
    const r = (await sql.unsafe(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`, [uid])) as { n: number }[];
    ut[t] = Number(r[0].n);
  }
  const k = (await sql`SELECT COUNT(*) AS n FROM user_bible_chapters WHERE bible_id = ${BIBEL(uid)}`) as {
    n: number;
  }[];
  ut.user_bible_chapters = Number(k[0].n);
  return ut;
}

async function settMarkørRå(seq: number) {
  await getSql()`
    INSERT INTO deletion_cursor (id, last_seq) VALUES (1, ${seq})
    ON DUPLICATE KEY UPDATE last_seq = VALUES(last_seq)
  `;
}

/** En slettestrøm som bare er svaret sitt, og som husker hva den ble spurt om. */
function strøm(svar: (after: number) => Response) {
  const kall: { after: number; auth: string | null }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const after = Number(new URL(String(url)).searchParams.get('after'));
    kall.push({ after, auth: new Headers(init?.headers).get('authorization') });
    return svar(after);
  }) as typeof fetch;
  return { kall, s: { url: 'http://konto.test/api/account/deletions', secret: SECRET, fetch: f } };
}

beforeAll(async () => {
  await ensureSchema(getSql());
  const r = (await getSql()`SELECT last_seq FROM deletion_cursor WHERE id = 1`) as { last_seq: number }[];
  opprinneligMarkør = r.length ? Number(r[0].last_seq) : null;
});

beforeEach(async () => {
  await rydd();
  await seed(SLETTET);
  await seed(ANNEN);
  await settMarkørRå(0);
});

afterAll(async () => {
  await rydd();
  if (opprinneligMarkør === null) await getSql()`DELETE FROM deletion_cursor WHERE id = 1`;
  else await settMarkørRå(opprinneligMarkør);
  await closeSql();
});

describe('FORMEN: slettingen kjenner hver brukertabell', () => {
  test('tabellene med user_id i skjemaet er nøyaktig KONTO_TABELLER', () => {
    const medUserId = TABLES.filter((ddl) => /^\s*user_id\s+INT\b/im.test(ddl))
      .map((ddl) => ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1])
      .sort();
    expect(medUserId.length).toBeGreaterThan(0);
    expect(medUserId).toEqual([...KONTO_TABELLER].sort());
  });
});

describe('DATAENE: alt under den slettede uid-en er borte, ingenting annet', () => {
  test('hver brukertabell er tom for uid-en etter én runde', async () => {
    const før = await rader(SLETTET);
    for (const [t, n] of Object.entries(før)) expect({ t, n: n > 0 }).toEqual({ t, n: true });

    const { s } = strøm(() =>
      Response.json({ deletions: [{ seq: 7, uid: SLETTET, deletedAt: new Date().toISOString() }], latestSeq: 7 }),
    );
    expect(await lesSlettestrømmen(s)).toEqual({ slettet: 1, markør: 7 });

    for (const [t, n] of Object.entries(await rader(SLETTET))) expect({ t, n }).toEqual({ t, n: 0 });
    expect(await rader(ANNEN)).toEqual(før);
  });

  test('den publiserte teksten forsvinner fra katalogen', async () => {
    const app = createApp();
    expect((await app.request(L(`/manuskripter/katalog/${SLUG(SLETTET)}`))).status).toBe(200);
    await slettBrukerdata(SLETTET);
    expect((await app.request(L(`/manuskripter/katalog/${SLUG(SLETTET)}`))).status).toBe(404);
    expect((await app.request(L(`/manuskripter/katalog/${SLUG(ANNEN)}`))).status).toBe(200);
  });

  test('idempotent: samme uid to ganger er ingen feil', async () => {
    await slettBrukerdata(SLETTET);
    await slettBrukerdata(SLETTET);
    expect(Object.values(await rader(SLETTET)).every((n) => n === 0)).toBe(true);
  });
});

describe('MARKØREN: kvitteringen konto bokfører', () => {
  test('spør fra markøren med hemmeligheten, og blar til latestSeq', async () => {
    await settMarkørRå(40);
    const { kall, s } = strøm((after) =>
      after < 41
        ? Response.json({ deletions: [{ seq: 41, uid: SLETTET }], latestSeq: 42 })
        : Response.json({ deletions: [{ seq: 42, uid: 991499 }], latestSeq: 42 }),
    );
    expect(await lesSlettestrømmen(s)).toEqual({ slettet: 2, markør: 42 });
    expect(kall).toEqual([
      { after: 40, auth: `Bearer ${SECRET}` },
      { after: 41, auth: `Bearer ${SECRET}` },
    ]);
    expect(await hentMarkør()).toBe(42);
    expect((await rader(SLETTET)).sync_items).toBe(0);
  });

  test('ingen nye slettinger: markøren står', async () => {
    await settMarkørRå(57);
    const { s } = strøm(() => Response.json({ deletions: [], latestSeq: 57 }));
    expect(await lesSlettestrømmen(s)).toEqual({ slettet: 0, markør: 57 });
    expect(await hentMarkør()).toBe(57);
  });

  test('en runde som feiler flytter IKKE markøren', async () => {
    await settMarkørRå(10);
    const { s } = strøm(() => new Response('nei', { status: 401 }));
    await expect(lesSlettestrømmen(s)).rejects.toThrow('401');
    expect(await hentMarkør()).toBe(10);
    expect((await rader(SLETTET)).sync_items).toBeGreaterThan(0);
  });
});

describe('OPPSTARTEN', () => {
  test('uten DELETIONS_SECRET sier den fra og starter ikke', () => {
    const meldinger: string[] = [];
    expect(startSlettestrømmen({ secret: '', logg: (m) => meldinger.push(m) })).toBe(false);
    expect(meldinger.join('\n')).toContain('DELETIONS_SECRET');
  });

  test('index.ts starter lesingen', async () => {
    const kilde = await Bun.file(new URL('../src/index.ts', import.meta.url)).text();
    expect(kilde).toMatch(/^startSlettestrømmen\(\);/m);
  });
});
