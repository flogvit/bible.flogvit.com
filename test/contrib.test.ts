// Integrasjonstester for contrib-API-et og -sidene: ekte lokal MySQL
// (DBngin :3312, .env) + mock-konto. Bidrag krever innlogging men IKKE plus —
// testene kjører derfor som gratis-bruker. Rydder etter seg på user_id.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { L } from './paths.ts';

const TEST_USER_ID = 990101;
let mock: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;

const AUTH = { cookie: 'fv-session=contrib-test', 'content-type': 'application/json' };
const TOKEN = 'test-contrib-token';

const VALID_BODY = {
  kind: 'article_verse_refs',
  target: { doi: '10.4102/hts.v57i3/4.1889' },
  context_translation: 'osnb',
  refs: [{ raw: 'Esra 3,1', kind: 'discusses', confirmed: true, where: { page: 4 } }],
  comment: 'Testbidrag',
};

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM contrib_submissions WHERE user_id = ${TEST_USER_ID}`;
}

beforeAll(async () => {
  mock = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      if (cookie.includes('fv-session=contrib-test')) {
        return Response.json({
          user: {
            id: TEST_USER_ID,
            email: 'contrib-test@flogvit.com',
            displayName: 'Contrib-test',
            verified: true,
            plus: false, // bidrag er IKKE plus-gated
            plusUntil: null,
          },
          csrf: 'csrf',
        });
      }
      return Response.json({ user: null });
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${mock.port}`;
  process.env.CONTRIB_TOKEN = TOKEN;
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  mock.stop(true);
  delete process.env.CONTRIB_TOKEN;
});

async function createOne(): Promise<number> {
  const res = await app.request('/api/contrib', {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify(VALID_BODY),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as { id: number };
  return data.id;
}

describe('contrib-API', () => {
  test('krever innlogging', async () => {
    const res = await app.request('/api/contrib', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });

  test('gyldig innsending lagres med pending-status og server-bygget payload', async () => {
    const id = await createOne();
    const sql = getSql();
    const rows = (await sql`
      SELECT status, payload FROM contrib_submissions WHERE id = ${id}
    `) as { status: string; payload: unknown }[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.status).toBe('pending');
    const payload =
      typeof rows[0]!.payload === 'string' ? JSON.parse(rows[0]!.payload as string) : rows[0]!.payload;
    expect(payload.schema).toBe('free-bible-contrib/1');
    expect(payload.review.status).toBe('pending');
    expect(payload.submitted.by.user_id).toBe(String(TEST_USER_ID));
    expect(payload.submitted.by.name).toBeUndefined(); // credit ikke satt
  });

  test('innsending uten refs gir 400', async () => {
    const res = await app.request('/api/contrib', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ ...VALID_BODY, refs: [] }),
    });
    expect(res.status).toBe(400);
  });

  test('GET /mine viser kun egne innsendinger', async () => {
    const id = await createOne();
    const res = await app.request('/api/contrib/mine', { headers: AUTH });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { submissions: { id: number; status: string }[] };
    expect(data.submissions.some((s) => s.id === id)).toBe(true);
    expect(data.submissions.every((s) => s.status !== undefined)).toBe(true);
  });

  test('needs_info-runden: svar setter status tilbake til pending og appender kommentar', async () => {
    const id = await createOne();
    const sql = getSql();
    await sql`UPDATE contrib_submissions SET status = 'needs_info' WHERE id = ${id}`;
    const res = await app.request(`/api/contrib/${id}/respond`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ message: 'Ja, det er riktig vers.' }),
    });
    expect(res.status).toBe(200);
    const rows = (await sql`
      SELECT status, payload FROM contrib_submissions WHERE id = ${id}
    `) as { status: string; payload: unknown }[];
    expect(rows[0]!.status).toBe('pending');
    const payload =
      typeof rows[0]!.payload === 'string' ? JSON.parse(rows[0]!.payload as string) : rows[0]!.payload;
    expect(payload.comment).toContain('Ja, det er riktig vers.');
    expect(payload.comment).toContain('Testbidrag');
    expect(payload.review.status).toBe('pending');
  });

  test('respond på rad som ikke er needs_info gir 404', async () => {
    const id = await createOne();
    const res = await app.request(`/api/contrib/${id}/respond`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ message: 'Hei' }),
    });
    expect(res.status).toBe(404);
  });

  test('admin-endepunktene gates av CONTRIB_TOKEN', async () => {
    const id = await createOne();

    // Feil token → 403.
    const forbidden = await app.request('/api/contrib/pending', {
      headers: { 'x-contrib-token': 'feil' },
    });
    expect(forbidden.status).toBe(403);

    // Riktig token → raden er med.
    const res = await app.request('/api/contrib/pending', { headers: { 'x-contrib-token': TOKEN } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { submissions: { id: number; payload: any }[] };
    const mine = data.submissions.find((s) => s.id === id);
    expect(mine?.payload.schema).toBe('free-bible-contrib/1');

    // Uten env-variabel → 404 (endepunktet finnes ikke).
    delete process.env.CONTRIB_TOKEN;
    const gone = await app.request('/api/contrib/pending', { headers: { 'x-contrib-token': TOKEN } });
    expect(gone.status).toBe(404);
    process.env.CONTRIB_TOKEN = TOKEN;
  });

  test('apply skriver reviewet payload tilbake', async () => {
    const id = await createOne();
    const pending = await app.request('/api/contrib/pending', { headers: { 'x-contrib-token': TOKEN } });
    const { submissions } = (await pending.json()) as { submissions: { id: number; payload: any }[] };
    const payload = submissions.find((s) => s.id === id)!.payload;
    payload.refs[0].kvnFrom = 15740944; // Esra 3:1 (bit-shift encode)
    payload.refs[0].kvnTo = 15740944;
    payload.refs[0].resolved_by = 'pipeline';
    payload.review = { status: 'approved', reviewer: 'flogvit', at: new Date().toISOString(), note: 'OK' };

    const res = await app.request('/api/contrib/apply', {
      method: 'POST',
      headers: { 'x-contrib-token': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ updates: [{ id, payload }, { id: 99999999, payload }] }),
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { applied: number; failed: number[] };
    expect(result.applied).toBe(1);
    expect(result.failed).toEqual([99999999]);

    const sql = getSql();
    const rows = (await sql`
      SELECT status, review_note, reviewed_at FROM contrib_submissions WHERE id = ${id}
    `) as { status: string; review_note: string | null; reviewed_at: number | bigint | null }[];
    expect(rows[0]!.status).toBe('approved');
    expect(rows[0]!.review_note).toBe('OK');
    expect(rows[0]!.reviewed_at).not.toBeNull();
  });
});

describe('contrib-sider', () => {
  test('/bidra anonymt viser login-oppfordring, ikke skjema', async () => {
    const res = await app.request(L('/bidra'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('/logg-inn');
    expect(html).not.toContain('data-ref-template');
  });

  test('/bidra innlogget viser skjemaet', async () => {
    const res = await app.request(L('/bidra'), { headers: { cookie: AUTH.cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-ref-template');
    expect(html).toContain('data-contrib-form');
  });

  test('/mine-bidrag innlogget viser innsendingen med statusbadge', async () => {
    const id = await createOne();
    const res = await app.request(L('/mine-bidrag'), { headers: { cookie: AUTH.cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`data-contrib-id="${id}"`);
    expect(html).toContain('badge-pending');
  });
});

// Sist i fila: spiser opp resten av minutt-kvoten for testbrukeren.
describe('contrib rate limit', () => {
  test('rate limit slår inn', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.request('/api/contrib', {
        method: 'POST',
        headers: AUTH,
        body: JSON.stringify(VALID_BODY),
      });
      last = res.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
