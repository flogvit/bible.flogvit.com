// Lesekart-siden for en INNLOGGET plus-bruker (GitHub #16): SSR-en skal lese
// ekte readingProgress-rader og vise dem som tall og varmekart. Gratisbrukere
// får siden, men uten data (husking = plus).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';

const TEST_USER_ID = 990002;
let mock: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;

const PLUS = { cookie: 'fv-session=plus' };
const FREE = { cookie: 'fv-session=gratis' };

function userJson(plus: boolean) {
  return Response.json({
    user: {
      id: TEST_USER_ID,
      email: 'kart-test@flogvit.com',
      displayName: 'Kart-test',
      verified: true,
      plus,
      plusUntil: plus ? '2099-01-01T00:00:00.000Z' : null,
    },
    csrf: 'csrf',
  });
}

async function seed(itemId: string, data: unknown) {
  const sql = getSql();
  await sql`
    INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
    VALUES (${TEST_USER_ID}, 'readingProgress', ${itemId}, ${JSON.stringify(data)}, ${Date.now()}, 0)
  `;
}

beforeAll(async () => {
  mock = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      if (cookie.includes('fv-session=plus')) return userJson(true);
      if (cookie.includes('fv-session=gratis')) return userJson(false);
      return new Response('unauthorized', { status: 401 });
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${mock.port}`;
  await ensureSchema(getSql());
  const sql = getSql();
  await sql`DELETE FROM sync_items WHERE user_id = ${TEST_USER_ID}`;

  // 1 Mos 1-2 lest, 1 Mos 3 lest fem ganger, Matt 1 lest uten tidspunkt,
  // Matt 2 kun delvis (skal ikke telle som lest).
  await seed('1-1', { firstAt: 1000, lastAt: 1000, count: 1, opens: 2 });
  await seed('1-2', { firstAt: 1000, lastAt: 2000, count: 1, opens: 1 });
  await seed('1-3', { firstAt: 1000, lastAt: 3000, count: 5, opens: 9 });
  await seed('40-1', { firstAt: null, lastAt: null, count: 1, opens: 1 });
  await seed('40-2', { firstAt: null, lastAt: null, count: 0, opens: 3, verses: '1-4' });

  app = createApp();
});

afterAll(async () => {
  const sql = getSql();
  await sql`DELETE FROM sync_items WHERE user_id = ${TEST_USER_ID}`;
  mock.stop(true);
  await closeSql();
});

describe('/lesekart', () => {
  test('plus-bruker ser antall leste kapitler (delvis lest teller ikke)', async () => {
    const html = await (await app.request('/nb/lesekart', { headers: PLUS })).text();
    expect(html).toContain('data-stat-chapters="true">4<');
  });

  test('GT/NT-fordelingen stemmer', async () => {
    const html = await (await app.request('/nb/lesekart', { headers: PLUS })).text();
    // 3 i GT (1 Mos 1-3), 1 i NT (Matt 1).
    expect(html).toMatch(/<strong>3<\/strong>\s*<span>GT<\/span>/);
    expect(html).toMatch(/<strong>1<\/strong>\s*<span>NT<\/span>/);
  });

  test('kapitler uten tidspunkt vises som egen opplysning', async () => {
    const html = await (await app.request('/nb/lesekart', { headers: PLUS })).text();
    expect(html).toContain('uten tidspunkt');
  });

  test('gjenlest kapittel får høyere intensitet enn engangslest', async () => {
    const html = await (await app.request('/nb/lesekart', { headers: PLUS })).text();
    const cells = [...html.matchAll(/data-level="([\d.]+)" data-chapter="(\d+)" title="1\. Mosebok /g)];
    const level = (ch: string) => cells.find((m) => m[2] === ch)?.[1];
    expect(level('1')).toBe('1');
    expect(level('3')).toBe('3');
    expect(level('4')).toBe('0');
  });

  test('delvis lest kapittel har sitt eget nivå', async () => {
    const html = await (await app.request('/nb/lesekart', { headers: PLUS })).text();
    expect(html).toContain('data-level="0.5" data-chapter="2" title="Matteus 2"');
  });

  test('gratisbruker får siden, men uten framdrift', async () => {
    const res = await app.request('/nb/lesekart', { headers: FREE });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-stat-chapters="true">0<');
  });

  // «En leseplan blir bare et spørsmål mot kartet» (#16): forslagene utledes av
  // dekningen, og planene gjenbrukes som kapittelsett.
  describe('forslag fra leseplanene', () => {
    test('plus-bruker med framdrift får påbegynte planer, med antall som mangler', async () => {
      const html = await (await app.request('/nb/lesekart', { headers: PLUS })).text();
      expect(html).toContain('class="map-suggest"');
      const missing = [...html.matchAll(/class="map-suggest-missing">([^<]+)</g)].map((m) => m[1]!);
      expect(missing.length).toBeGreaterThan(0);
      // Hvert forslag sier hvor mye som gjenstår, og aldri null — en fullført
      // plan er ikke et forslag.
      for (const label of missing) expect(label).toMatch(/du mangler (\d+ kapitler|1 kapittel)/);
      expect(missing.some((l) => l.includes('mangler 0'))).toBe(false);
    });

    test('gratisbruker har ingen framdrift, og dermed ingen forslag', async () => {
      const html = await (await app.request('/nb/lesekart', { headers: FREE })).text();
      expect(html).not.toContain('class="map-suggest"');
    });
  });
});

// Motsatt vei av samme kobling: planen forteller hva du alt har lest, uten å
// røre sitt eget dag-regnskap.
describe('/leseplan viser dekning fra kartet', () => {
  test('plus-bruker ser hvor mye av planen som er lest fra før', async () => {
    const html = await (await app.request('/nb/leseplan', { headers: PLUS })).text();
    const covered = [...html.matchAll(/class="plan-covered">([^<]+)</g)].map((m) => m[1]!);
    expect(covered.length).toBeGreaterThan(0);
    for (const label of covered) expect(label).toMatch(/^\d+ av \d+ kapitler er lest fra før$/);
  });

  test('gratisbruker ser ingen dekning — husking er plus', async () => {
    const html = await (await app.request('/nb/leseplan', { headers: FREE })).text();
    expect(html).not.toContain('class="plan-covered"');
  });
});
