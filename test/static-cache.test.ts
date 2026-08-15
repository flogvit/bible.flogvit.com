// Vakt mot at CSS/JS igjen serveres uten cache-headere.
//
// Feilen var stille og traff bare TILBAKEVENDENDE lesere: HTML-en har
// max-age=300, mens CSS-en hadde hverken freshness eller validator. Etter en
// deploy fikk de ny HTML med gammel CSS, altså et halvt design — og ingenting
// i logg eller røyktest sa fra, fordi begge svarte 200.

import { beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { Hono } from 'hono';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { STATIC_MOUNTS, staticCache, staticMountNotFound } from '../src/lib/static-cache.ts';

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

// En KATALOG under en statisk montering er ikke en fil og ikke en side (#95).
// `etagFor()` stat-et den uten å klage og kastet EISDIR på lesingen, så `/js/`
// og `/css/` svarte 500 — en 5xx-rad i `usage_errors` som eskalerer i
// vaktbriefen, vekket av en hvilken som helst skanner som sonderer
// katalogindekser. Ingen av våre egne lenker peker på en monteringsrot, så
// hverken regresjonssveipene eller røyktesten spurte noen gang om den.
describe('kataloger under en statisk montering', () => {
  const DIRS = STATIC_MOUNTS.filter((m) => m.endsWith('/'));

  it('det FINNES en katalogmontering å måle', () => {
    expect(DIRS.length).toBeGreaterThan(0);
  });

  // REGELEN: middlewaren alene. En katalog skal falle gjennom til `next()`
  // framfor å kaste — men en ekte fil skal fortsatt merkes, ellers ville
  // «returner alltid null» bestått.
  for (const dir of DIRS) {
    it(`${dir} faller gjennom til neste handler`, async () => {
      const app = new Hono();
      app.use('/*', staticCache(STATIC_MOUNTS));
      app.all('/*', (c) => c.text('videre', 404));
      const res = await app.request(`http://x${dir}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('videre');
      expect(res.headers.get('etag')).toBeNull();
    });
  }

  it('en ekte fil merkes fortsatt', async () => {
    const app = new Hono();
    app.use('/*', staticCache(STATIC_MOUNTS));
    app.all('/*', (c) => c.text('videre', 404));
    const res = await app.request('http://x/css/home.css');
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]+"$/);
  });

  // FLATA: katalogene velges av DATAENE — hver katalog under `public/`, så en
  // ny underkatalog måles uten at noen fører den opp. Ingen av dem får svares
  // som en side: `/js/` er ingen adresse i side-navnerommet, og en
  // locale-forhandling ville lovet `/en/js/`, som heller ikke finnes.
  it('hver katalog under public/ svarer 404, uten omvei', async () => {
    const entries = await readdir('./public', { withFileTypes: true, recursive: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => `${e.parentPath.replace(/^\.?\/?public/, '')}/${e.name}/`);
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      const res = await app.request(dir);
      expect(`${dir} -> ${res.status}`).toBe(`${dir} -> 404`);
      expect(res.headers.get('content-type') ?? '').not.toContain('html');
    }
  });

  // MONTERINGSROTEN UTEN SKRÅSTREK (#96). `/js` er formen en skanner — og et
  // menneske — faktisk skriver, og den falt utenfor `startsWith('/js/')`.
  // Stien har ikke punktum, så `NOT_A_PAGE` (#64) ser ingen fil:
  // locale-forhandlingen lovte `/en/js`, altså 302 → 404-SIDE. Det er de to
  // samme prisene #95 tok bort for `/js/` — en omvei og en render-plass bak
  // semaforen — for et svar som uansett er «her er ingenting».
  for (const dir of DIRS) {
    const root = dir.slice(0, -1);
    it(`${root} svarer 404 uten omvei`, async () => {
      const res = await app.request(root);
      expect(`${root} -> ${res.status}`).toBe(`${root} -> 404`);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('content-type') ?? '').not.toContain('html');
    });
  }

  // REGELEN: middlewaren alene. Roten svares her, men en adresse som bare
  // BEGYNNER med den er en helt annen sti og skal gå videre — ellers ville
  // «404 på alt» bestått, og en side kunne blitt slukt av en montering.
  it('REGELEN: roten svares, en sideadresse går videre', async () => {
    const mw = new Hono();
    mw.use('/*', staticMountNotFound(STATIC_MOUNTS));
    mw.all('/*', (c) => c.text('side', 200));
    for (const dir of DIRS) {
      expect((await mw.request(`http://x${dir}`)).status).toBe(404);
      expect((await mw.request(`http://x${dir.slice(0, -1)}`)).status).toBe(404);
      // `/jsonfil` deler bare bokstavene med `/js` — den er en sideadresse.
      const nabo = await mw.request(`http://x${dir.slice(0, -1)}onfil`);
      expect(`${dir.slice(0, -1)}onfil -> ${nabo.status}`).toBe(`${dir.slice(0, -1)}onfil -> 200`);
    }
    const page = await mw.request('http://x/nb/matt/5');
    expect(await page.text()).toBe('side');
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
