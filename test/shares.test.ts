// Delingslenker for manuskripter (GitHub #15, del 1) — ekte lokal MySQL
// (DBngin :3312, .env) + mock-konto. Rydder etter seg på user_id.
//
// Kontrakten som testes er en TILGANGSKONTRAKT, ikke bare et CRUD-API:
//
//   - Lenken er tilgangen: mottakeren har ingen konto og ingen sesjon.
//   - Å trekke tilbake virker UMIDDELBART — også for en side som nettopp ble
//     hentet, altså må delesiden stå utenfor mikrocachen (#19 ga den en times
//     TTL, og en cachet kopi ville overlevd tilbaketrekkingen).
//   - Ukjent, tilbaketrukket og slettet gir SAMME svar: 404. Et eget «trukket
//     tilbake» ville bekreftet at tokenet en gang var gyldig.
//   - Å opprette krever plus (husking=plus); å lese er gratis.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const PLUS_USER = 990201;
const FREE_USER = 990202;
const ITEM_ID = 'dev-share-test';

let mock: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;

const PLUS = { cookie: 'fv-session=share-plus', 'content-type': 'application/json' };
const FREE = { cookie: 'fv-session=share-free', 'content-type': 'application/json' };

const DEVOTIONAL = {
  id: ITEM_ID,
  slug: 'delt-andakt-test',
  title: 'Om håpet',
  type: 'andakt',
  updatedAt: 1,
  versions: [{ id: 'v1', content: '# Overskrift\n\nEn delt andakt om [ref:Joh 3,16].', locked: false }],
};

async function cleanup() {
  const sql = getSql();
  for (const id of [PLUS_USER, FREE_USER]) {
    await sql`DELETE FROM devotional_shares WHERE user_id = ${id}`;
    await sql`DELETE FROM sync_items WHERE user_id = ${id}`;
  }
}

/** Manuskriptet slik sync ville lagt det inn. */
async function seedDevotional(userId: number, deleted = false) {
  await getSql()`
    INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
    VALUES (${userId}, 'devotionals', ${ITEM_ID}, ${JSON.stringify(DEVOTIONAL)}, ${Date.now()}, ${deleted})
    ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = VALUES(deleted)
  `;
}

async function createLink(headers = PLUS): Promise<string> {
  const res = await app.request('/api/shares', {
    method: 'POST',
    headers,
    body: JSON.stringify({ itemId: ITEM_ID }),
  });
  expect(res.status).toBe(200);
  const { share } = (await res.json()) as { share: { token: string } };
  return share.token;
}

beforeAll(async () => {
  mock = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      const user = (id: number, plus: boolean) =>
        Response.json({
          user: { id, email: `share-${id}@flogvit.com`, displayName: 'Del-test', verified: true, plus, plusUntil: null },
          csrf: 'csrf',
        });
      if (cookie.includes('fv-session=share-plus')) return user(PLUS_USER, true);
      if (cookie.includes('fv-session=share-free')) return user(FREE_USER, false);
      return Response.json({ user: null });
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${mock.port}`;
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
  await seedDevotional(PLUS_USER);
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  mock.stop(true);
});

describe('/api/shares', () => {
  test('krever innlogging', async () => {
    const res = await app.request('/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: ITEM_ID }),
    });
    expect(res.status).toBe(401);
  });

  test('krever plus — deling forutsetter at manuskriptet er lagret', async () => {
    await seedDevotional(FREE_USER);
    const res = await app.request('/api/shares', {
      method: 'POST',
      headers: FREE,
      body: JSON.stringify({ itemId: ITEM_ID }),
    });
    expect(res.status).toBe(402);
  });

  test('to kall gir SAMME lenke — ellers ville «trekk tilbake» bare truffet én', async () => {
    const first = await createLink();
    expect(await createLink()).toBe(first);
  });

  test('tokenet er langt og ugjettbart', async () => {
    const token = await createLink();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, trygg i en URL
  });

  test('et manuskript brukeren ikke har gir 404, ikke en lenke', async () => {
    const res = await app.request('/api/shares', {
      method: 'POST',
      headers: PLUS,
      body: JSON.stringify({ itemId: 'dev-finnes-ikke' }),
    });
    expect(res.status).toBe(404);
  });

  test('itemId er påkrevd', async () => {
    const res = await app.request('/api/shares', { method: 'POST', headers: PLUS, body: '{}' });
    expect(res.status).toBe(400);
  });

  test('egne lenker kan listes, så UI-et ikke lager en ny hver gang', async () => {
    const token = await createLink();
    const res = await app.request('/api/shares', { headers: PLUS });
    const { shares } = (await res.json()) as { shares: { token: string; itemId: string }[] };
    expect(shares.find((s) => s.itemId === ITEM_ID)?.token).toBe(token);
  });
});

describe('/delt/<token>', () => {
  test('leses UTEN innlogging, med tittel og innhold', async () => {
    const token = await createLink();
    const res = await app.request(L(`/delt/${token}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Om håpet');
    expect(html).toContain('En delt andakt om');
  });

  test('markdown og versreferanser rendres som lenke, ikke som rå tekst', async () => {
    const token = await createLink();
    const html = await (await app.request(L(`/delt/${token}`))).text();
    // Markdown-nivåene ligger under sidens h1 (tittelen), så `#` blir <h2>.
    expect(html).toContain('<h2>Overskrift</h2>');
    expect(html).toContain('/joh/3');
  });

  test('noindex — en hemmelig lenke skal ikke i søkeindeksen', async () => {
    const token = await createLink();
    const html = await (await app.request(L(`/delt/${token}`))).text();
    expect(html).toContain('name="robots" content="noindex,follow"');
  });

  test('IKKE cachet: tilbaketrekking virker i samme øyeblikk', async () => {
    const token = await createLink();
    const path = L(`/delt/${token}`);
    // Første henting ville lagt siden i mikrocachen om den var med der.
    expect((await app.request(path)).status).toBe(200);
    const res = await app.request(path);
    expect(res.headers.get('x-cache')).toBeNull();
    // Og leseren skal ikke beholde en kopi heller — en tilbaketrukket lenke må
    // ikke kunne vises fra nettleserens egen cache.
    expect(res.headers.get('cache-control')).toBe('private, no-store');

    await app.request(`/api/shares/${ITEM_ID}`, { method: 'DELETE', headers: PLUS });
    expect((await app.request(path)).status).toBe(404);
  });

  test('ukjent token gir 404', async () => {
    expect((await app.request(L('/delt/finnes-ikke-i-det-hele-tatt'))).status).toBe(404);
  });

  test('ny lenke gjør den gamle ugyldig', async () => {
    const old = await createLink();
    const res = await app.request('/api/shares', {
      method: 'POST',
      headers: PLUS,
      body: JSON.stringify({ itemId: ITEM_ID, regenerate: true }),
    });
    const { share } = (await res.json()) as { share: { token: string } };
    expect(share.token).not.toBe(old);
    expect((await app.request(L(`/delt/${old}`))).status).toBe(404);
    expect((await app.request(L(`/delt/${share.token}`))).status).toBe(200);
  });

  test('sletter eieren manuskriptet, dør lenken', async () => {
    const token = await createLink();
    await seedDevotional(PLUS_USER, true); // deleted = 1, som sync gjør
    expect((await app.request(L(`/delt/${token}`))).status).toBe(404);
    await seedDevotional(PLUS_USER);
  });

  test('står ikke i noen sitemap', async () => {
    const token = await createLink();
    const xml = await (await app.request('/sitemap-nb.xml')).text();
    expect(xml).not.toContain('/delt/');
    expect(xml).not.toContain(token);
  });
});
