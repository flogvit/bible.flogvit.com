import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';

const app = createApp();

describe('skjelett', () => {
  test('health svarer ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('forsiden rendrer med wordmark og norsk lang', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="nb"');
    expect(html).toContain('FLOGVIT');
    expect(html).toContain('bibel');
    expect(html).toContain('/styles.css');
  });

  test('ukjent side gir 404', async () => {
    const res = await app.request('/finnes-ikke');
    expect(res.status).toBe(404);
  });
});
