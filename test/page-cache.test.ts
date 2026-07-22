import { beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { clearPageCache, withPageCache } from '../src/lib/page-cache.ts';

// Mikrocachen (GitHub #4): anonyme GET-HTML-sider caches og får Cache-Control;
// innloggede forespørsler og /api/* går alltid gjennom.

function buildApp() {
  let renders = 0;
  const app = new Hono();
  app.use('*', withPageCache);
  app.get('/side', (c) => {
    renders++;
    return c.html(`<html><body>render ${renders}</body></html>`);
  });
  app.get('/api/data', (c) => c.json({ renders: ++renders }));
  app.get('/borte', (c) => c.html('<html>404</html>', 404));
  return { app, getRenders: () => renders };
}

describe('withPageCache', () => {
  beforeEach(() => clearPageCache());

  test('anonym side caches: andre kall rendrer ikke på nytt', async () => {
    const { app, getRenders } = buildApp();
    const first = await app.request('/side');
    expect(first.headers.get('cache-control')).toContain('public');
    expect(await first.text()).toContain('render 1');

    const second = await app.request('/side');
    expect(second.headers.get('x-cache')).toBe('hit');
    expect(await second.text()).toContain('render 1');
    expect(getRenders()).toBe(1);
  });

  test('fv-session-cookie omgår cachen', async () => {
    const { app, getRenders } = buildApp();
    await app.request('/side');
    const res = await app.request('/side', { headers: { cookie: 'fv-session=abc' } });
    expect(res.headers.get('x-cache')).toBeNull();
    expect(res.headers.get('cache-control')).toBeNull();
    expect(getRenders()).toBe(2);
  });

  test('/api/* caches aldri', async () => {
    const { app } = buildApp();
    const a = await (await app.request('/api/data')).json();
    const b = await (await app.request('/api/data')).json();
    expect(a.renders).not.toBe(b.renders);
  });

  test('ikke-200 caches ikke', async () => {
    const { app } = buildApp();
    await app.request('/borte');
    const res = await app.request('/borte');
    expect(res.headers.get('x-cache')).toBeNull();
    expect(res.status).toBe(404);
  });

  test('query-strenger caches separat', async () => {
    const { app, getRenders } = buildApp();
    await app.request('/side?a=1');
    await app.request('/side?a=2');
    expect(getRenders()).toBe(2);
    const hit = await app.request('/side?a=1');
    expect(hit.headers.get('x-cache')).toBe('hit');
  });
});
