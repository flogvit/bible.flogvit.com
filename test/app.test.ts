import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

describe('skjelett', () => {
  test('health svarer ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('forsiden rendrer med wordmark og basespråkets lang', async () => {
    const res = await app.request(L('/'));
    expect(res.status).toBe(200);
    const html = await res.text();
    // Basespråket er engelsk (I18N.md §1), og L() treffer nettopp det.
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('FLOGVIT');
        // Wordmarket er «FLOGVIT.bible» — produktnavnet oversettes ikke.
    expect(html).toContain('bible');
    expect(html).toContain('/styles.css');
  });

  test('ukjent side gir 404', async () => {
    const res = await app.request(L('/finnes-ikke'));
    expect(res.status).toBe(404);
  });
});
