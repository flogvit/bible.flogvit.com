import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { Hono } from 'hono';
import type { AppEnv } from '../src/lib/session.ts';
import { requireUser, withSession } from '../src/lib/session.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Mock-konto: svarer som kontoens /api/auth/session. Oppførselen styres av
// hvilken fv-session-verdi som sendes inn.
let mock: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  mock = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      if (cookie.includes('fv-session=gyldig')) {
        return Response.json({
          user: {
            id: 42,
            email: 'test@flogvit.com',
            displayName: 'Test',
            verified: true,
            plus: false,
            plusUntil: null,
          },
          csrf: 'csrf-token',
        });
      }
      if (cookie.includes('fv-session=nede')) {
        return new Response('boom', { status: 500 });
      }
      return Response.json({ user: null });
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${mock.port}`;
});

afterAll(() => {
  mock.stop(true);
});

function testApp() {
  const app = new Hono<AppEnv>();
  app.use('*', withSession);
  app.get('/hvem', (c) => c.json({ user: c.var.user }));
  app.get('/beskyttet', requireUser, (c) => c.json({ id: c.var.user!.id }));
  return app;
}

describe('konto-sesjon', () => {
  test('gyldig cookie gir bruker', async () => {
    const res = await testApp().request('/hvem', { headers: { cookie: 'fv-session=gyldig' } });
    const body = (await res.json()) as { user: { id: number; email: string; csrf: string } };
    expect(body.user.id).toBe(42);
    expect(body.user.email).toBe('test@flogvit.com');
    expect(body.user.csrf).toBe('csrf-token');
  });

  test('ingen cookie gir anonym uten konto-kall', async () => {
    const res = await testApp().request('/hvem');
    expect(((await res.json()) as { user: null }).user).toBeNull();
  });

  test('ukjent sesjon gir anonym', async () => {
    const res = await testApp().request('/hvem', { headers: { cookie: 'fv-session=ukjent' } });
    expect(((await res.json()) as { user: null }).user).toBeNull();
  });

  test('konto nede gir anonym (fail-open), ikke feil', async () => {
    const res = await testApp().request('/hvem', { headers: { cookie: 'fv-session=nede' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: null }).user).toBeNull();
  });

  test('requireUser gir 401 for anonym og 200 for innlogget', async () => {
    const anon = await testApp().request('/beskyttet');
    expect(anon.status).toBe(401);
    const inn = await testApp().request('/beskyttet', { headers: { cookie: 'fv-session=gyldig' } });
    expect(inn.status).toBe(200);
    expect(((await inn.json()) as { id: number }).id).toBe(42);
  });

  test('/logg-inn og /konto redirecter til kontotjenesten', async () => {
    const app = createApp();
    for (const path of ['/logg-inn', '/konto']) {
      const res = await app.request(path);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('https://flogvit.com/konto/');
    }
  });
});
