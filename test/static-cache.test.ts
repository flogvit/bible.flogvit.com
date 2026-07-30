// Vakt mot at CSS/JS igjen serveres uten cache-headere.
//
// Feilen var stille og traff bare TILBAKEVENDENDE lesere: HTML-en har
// max-age=300, mens CSS-en hadde hverken freshness eller validator. Etter en
// deploy fikk de ny HTML med gammel CSS, altså et halvt design — og ingenting
// i logg eller røyktest sa fra, fordi begge svarte 200.

import { beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';

const app = createApp();

beforeAll(async () => {
  await initBooks();
});

const ASSETS = ['/css/home.css', '/css/changes.css', '/js/home.js', '/js/locale.js'];

describe('statiske filer', () => {
  for (const path of ASSETS) {
    it(`${path} har ETag og Cache-Control`, async () => {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]+"$/);
      expect(res.headers.get('cache-control')).toContain('no-cache');
    });
  }

  it('svarer 304 på en gyldig ETag, uten kropp', async () => {
    const first = await app.request('/css/home.css');
    const etag = first.headers.get('etag')!;
    const second = await app.request('/css/home.css', { headers: { 'if-none-match': etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('svarer 200 når ETag-en er utdatert', async () => {
    const res = await app.request('/css/home.css', { headers: { 'if-none-match': '"utdatert"' } });
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(0);
  });

  it('ETag-en følger INNHOLDET — to ulike filer deler den ikke', async () => {
    const a = await app.request('/css/home.css');
    const b = await app.request('/css/changes.css');
    expect(a.headers.get('etag')).not.toBe(b.headers.get('etag'));
  });

  it('rører ikke HTML-sidene, som har sin egen mikrocache', async () => {
    const res = await app.request('/nb');
    expect(res.headers.get('cache-control')).toContain('max-age=300');
  });
});
