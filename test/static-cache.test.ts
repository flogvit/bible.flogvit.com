// Vakt mot at CSS/JS igjen serveres uten cache-headere.
//
// Feilen var stille og traff bare TILBAKEVENDENDE lesere: HTML-en har
// max-age=300, mens CSS-en hadde hverken freshness eller validator. Etter en
// deploy fikk de ny HTML med gammel CSS, altså et halvt design — og ingenting
// i logg eller røyktest sa fra, fordi begge svarte 200.

import { beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

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
    // Mikrocachens signatur, ikke et tall: TTL-en er env-styrt (#19), så en
    // hardkodet max-age gjorde denne testen rød av en ren konfigendring.
    // `stale-while-revalidate` settes bare av page-cache, og staticCache ville
    // dessuten satt en ETag.
    expect(res.headers.get('cache-control')).toContain('stale-while-revalidate');
    expect(res.headers.get('etag')).toBeNull();
  });
});

describe('cache-busting', () => {
  it('layout peker på versjonerte URL-er', async () => {
    const html = await (await app.request('/nb')).text();
    const assets = [...html.matchAll(/(?:href|src)="(\/(?:css|js)\/[^"]+|\/styles\.css[^"]*)"/g)].map((m) => m[1]!);
    expect(assets.length).toBeGreaterThan(5);
    // Hver stil- og skriptfil layout skriver ut skal bære innholdshashen. Uten
    // den blir en kopi som alt ligger i nettleseren liggende etter en deploy.
    expect(assets.filter((a) => !/\?v=[0-9a-f]+$/.test(a))).toEqual([]);
  });

  it('versjonert URL caches hardt, uversjonert må revalideres', async () => {
    const versioned = await app.request('/css/home.css?v=abc12345');
    expect(versioned.headers.get('cache-control')).toContain('immutable');
    const plain = await app.request('/css/home.css');
    expect(plain.headers.get('cache-control')).toBe('public, no-cache');
  });

  it('hashen følger innholdet, ikke filnavnet', async () => {
    const html = await (await app.request('/nb')).text();
    const hash = (name: string) =>
      html.match(new RegExp(`${name.replace('.', '\\.')}\\?v=([0-9a-f]+)`))?.[1];
    expect(hash('home.css')).toBeDefined();
    expect(hash('home.css')).not.toBe(hash('styles.css'));
  });
});
