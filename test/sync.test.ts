// Integrasjonstester for sync-API-et: ekte lokal MySQL (DBngin :3312, .env) +
// mock-konto for sesjonen. Bruker en egen test-bruker-id og rydder etter seg.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';

const TEST_USER_ID = 990001;
let mock: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;

const AUTH = { cookie: 'fv-session=gyldig', 'content-type': 'application/json' };

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM sync_items WHERE user_id = ${TEST_USER_ID}`;
  await sql`DELETE FROM sync_cursors WHERE user_id = ${TEST_USER_ID}`;
  await sql`DELETE FROM user_bibles WHERE user_id = ${TEST_USER_ID}`;
}

beforeAll(async () => {
  mock = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      if (cookie.includes('fv-session=gyldig')) {
        return Response.json({
          user: {
            id: TEST_USER_ID,
            email: 'sync-test@flogvit.com',
            displayName: 'Sync-test',
            verified: true,
            plus: true, // husking (sync) er plus-gated — sync-testene kjører som plus-bruker
            plusUntil: '2099-01-01T00:00:00.000Z',
          },
          csrf: 'csrf',
        });
      }
      if (cookie.includes('fv-session=uten-plus')) {
        return Response.json({
          user: {
            id: TEST_USER_ID + 1,
            email: 'gratis@flogvit.com',
            displayName: 'Gratis',
            verified: true,
            plus: false,
            plusUntil: null,
          },
          csrf: 'csrf',
        });
      }
      return Response.json({ user: null });
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${mock.port}`;
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  mock.stop(true);
});

describe('sync-API', () => {
  test('krever innlogging', async () => {
    const res = await app.request('/api/sync', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  test('innlogget uten plus får 402 (husking er plus-gated)', async () => {
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { cookie: 'fv-session=uten-plus', 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: 'x', lastSyncAt: 0, changes: [] }),
    });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('plus_required');
  });

  test('krever deviceId', async () => {
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('push + pull roundtrip', async () => {
    const push = await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        deviceId: 'enhet-a',
        lastSyncAt: 0,
        changes: [
          { dataType: 'favorites', itemId: 'f1', data: { ref: '1-1-1' }, updatedAt: 1000 },
        ],
      }),
    });
    expect(push.status).toBe(200);
    const pushBody = (await push.json()) as { syncedAt: number; changes: unknown[] };
    expect(pushBody.changes).toHaveLength(0);
    expect(pushBody.syncedAt).toBeGreaterThan(0);

    // Annen enhet puller og får endringen.
    const pull = await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ deviceId: 'enhet-b', lastSyncAt: 0, changes: [] }),
    });
    const pullBody = (await pull.json()) as {
      changes: { dataType: string; itemId: string; data: { ref: string }; updatedAt: number }[];
    };
    expect(pullBody.changes).toHaveLength(1);
    expect(pullBody.changes[0]!.itemId).toBe('f1');
    expect(pullBody.changes[0]!.data.ref).toBe('1-1-1');
    expect(pullBody.changes[0]!.updatedAt).toBe(1000);
  });

  test('server nyere enn klient → serverversjonen tilbake', async () => {
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        deviceId: 'enhet-a',
        lastSyncAt: 2000,
        changes: [
          { dataType: 'favorites', itemId: 'f1', data: { ref: 'gammel' }, updatedAt: 500 },
        ],
      }),
    });
    const body = (await res.json()) as { changes: { data: { ref: string } }[] };
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]!.data.ref).toBe('1-1-1');
  });

  test('planProgress merges som union av completedDays', async () => {
    await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        deviceId: 'enhet-a',
        lastSyncAt: 0,
        changes: [
          { dataType: 'planProgress', itemId: 'p1', data: { completedDays: [1, 2] }, updatedAt: 1000 },
        ],
      }),
    });
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        deviceId: 'enhet-b',
        lastSyncAt: 5000,
        changes: [
          { dataType: 'planProgress', itemId: 'p1', data: { completedDays: [2, 3] }, updatedAt: 500 },
        ],
      }),
    });
    const body = (await res.json()) as { changes: { data: { completedDays: number[] } }[] };
    expect(body.changes[0]!.data.completedDays).toEqual([1, 2, 3]);
  });

  test('user-bibles + kapittel-opplasting og -nedlasting', async () => {
    const up = await app.request('/api/sync/user-bibles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        bibles: [
          { id: 'ub-test-1', name: 'Testbibel', mappingId: 'osnb', uploadedAt: 1000 },
        ],
      }),
    });
    expect(up.status).toBe(200);
    const upBody = (await up.json()) as { bibles: { id: string; mappingId: string }[] };
    expect(upBody.bibles[0]!.mappingId).toBe('osnb');

    const chUp = await app.request('/api/sync/user-bible-chapters/ub-test-1', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        chapters: [{ bookId: 1, chapter: 1, data: { verses: ['I begynnelsen'] } }],
      }),
    });
    expect(chUp.status).toBe(200);

    const chDown = await app.request('/api/sync/user-bible-chapters/ub-test-1', {
      headers: AUTH,
    });
    const downBody = (await chDown.json()) as {
      chapters: { bookId: number; data: { verses: string[] } }[];
    };
    expect(downBody.chapters).toHaveLength(1);
    expect(downBody.chapters[0]!.data.verses[0]).toBe('I begynnelsen');

    // Fremmed bibel-id → 404.
    const notFound = await app.request('/api/sync/user-bible-chapters/finnes-ikke', {
      headers: AUTH,
    });
    expect(notFound.status).toBe(404);
  });
});
