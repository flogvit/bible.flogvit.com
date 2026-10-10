// Verslister (#133): en liste kunne opprettes og navnet synkes, men det eneste
// som skrev en liste var `refs: []` — og det fantes ingen `/lister/:id`. Plus
// lover «verslister … synkronisert mellom enheter», og hver liste var tom.
//
// Vakta følger HELE kjeden, slik en leser går den:
//   1. VERSET  — på den EKTE kapittelsida (SSR fra appen, ikke en håndbygd DOM)
//                legger reading.js verset i lista, og fjerner det igjen.
//   2. SERVEREN — lista slik øya skrev den synkes, og `/lister/<id>` viser
//                verset med tekst, mens `/lister` lenker dit.
//   3. KLIENTEN — en liste som bare finnes lokalt (ikke synket ennå) rendres av
//                user.js på den samme sida, med verstekst og en vei ut.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { getVerse } from '../src/lib/bible.ts';
import { kontoUser, startMockKonto } from './mock-konto.ts';
// @ts-expect-error — delt klient-modul uten typer
import { parseVerseListRef, verseListRef } from '../public/js/verse-list.js';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const TEST_USER_ID = 990133;
const LIST_ID = 'list-133';
const REF = 'joh-3-16';
const AUTH = { cookie: 'fv-session=plus-133', 'content-type': 'application/json' };

let mock: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;
let chapterBody = '';
let joh316 = '';

let bust = 0;
// Egen nøkkel: `bun test` deler modul-cachen mellom filene, og `?t=0` er alt
// islands.test.ts sin — da får vi en øy som kjørte mot en annen DOM.
const loadIsland = (name: string) => import(`../public/js/${name}.js?verslister=${bust++}`);

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function bodyOf(html: string): string {
  const m = /<body[^>]*>([\s\S]*)<\/body>/.exec(html);
  if (!m) throw new Error('ingen <body> i svaret');
  // Øyene lastes av testen selv; happy-dom skal ikke prøve å hente dem.
  return m[1]!.replace(/<script\b[\s\S]*?<\/script>/g, '');
}

function bodyAttrs(html: string): Record<string, string> {
  const tag = /<body([^>]*)>/.exec(html)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const [, k, v] of tag.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
    out[k!.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v ?? '';
  }
  return out;
}

async function cleanup() {
  const sql = getSql();
  await sql.unsafe('DELETE FROM sync_items WHERE user_id = ?', [TEST_USER_ID]);
  await sql.unsafe('DELETE FROM sync_cursors WHERE user_id = ?', [TEST_USER_ID]);
}

beforeAll(async () => {
  mock = startMockKonto({
    'plus-133': () => kontoUser({ id: TEST_USER_ID, plus: true, plusUntil: '2099-01-01T00:00:00.000Z' }),
  });
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
  const res = await app.request('/nb/joh/3');
  expect(res.status).toBe(200);
  chapterBody = await res.text();
  joh316 = (await getVerse(43, 3, 16, 'osnb'))?.text ?? '';
  expect(joh316.length).toBeGreaterThan(0);
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  mock.stop(true);
});

describe('REGELEN: adressen i en verslist', () => {
  test('bygg og les er hverandres motstykke, og en rekke leses', () => {
    expect(verseListRef('joh', 3, 16)).toBe(REF);
    expect(parseVerseListRef(REF)).toEqual({ slug: 'joh', chapter: 3, start: 16, end: 16 });
    // Gamle appen lagret rekker som `joh-3-16-18`.
    expect(parseVerseListRef('joh-3-16-18')).toEqual({ slug: 'joh', chapter: 3, start: 16, end: 18 });
    expect(parseVerseListRef('1mos-1-1')).toEqual({ slug: '1mos', chapter: 1, start: 1, end: 1 });
    expect(parseVerseListRef('høys-2-1')?.slug).toBe('høys');
    expect(parseVerseListRef('tull')).toBeNull();
    expect(parseVerseListRef('joh-0-1')).toBeNull();
  });
});

/** Lista slik øya etterlot den — brukes videre av server-halvdelen. */
let writtenList: { id: string; name: string; refs: string[]; updatedAt: number } | null = null;

describe('VERSET: fra kapittelsida legges verset i en liste', () => {
  test('reading.js tilbyr lista i versdetaljen, og avkryssing skriver verset inn — og ut', async () => {
    GlobalRegistrator.register({ url: 'https://bible.flogvit.com/nb/joh/3' });
    try {
      document.documentElement.lang = 'nb';
      Object.assign(document.body.dataset, bodyAttrs(chapterBody));
      document.body.innerHTML = bodyOf(chapterBody);
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NoopIntersectionObserver;
      (window as unknown as { fvPlus: unknown }).fvPlus = { has: () => true, gate: () => true, cta: () => {} };
      localStorage.clear();
      localStorage.setItem(
        'bible-verse-lists',
        JSON.stringify([{ id: LIST_ID, name: 'Nåde', refs: [], createdAt: 1, updatedAt: 1 }]),
      );

      await loadIsland('reading');

      const verse = document.querySelector('.verse[data-verse-num="16"]') as HTMLElement;
      expect(verse).not.toBeNull();
      (verse.querySelector('[data-verse-toggle]') as HTMLElement).click();
      const box = verse.querySelector('[data-verse-lists]') as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.dataset.verseRef).toBe(REF);

      const options = [...box.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
      const option = options[0]!;
      expect(options.map((o) => o.closest('label')?.textContent?.trim())).toEqual(['Nåde']);
      expect(option.checked).toBe(false);

      option.checked = true;
      option.dispatchEvent(new Event('change'));
      const after = JSON.parse(localStorage.getItem('bible-verse-lists') ?? '[]');
      expect(after[0].refs).toEqual([REF]);
      expect(after[0].updatedAt).toBeGreaterThan(1);
      writtenList = after[0];

      // Samme vers to ganger er ett vers.
      option.dispatchEvent(new Event('change'));
      expect(JSON.parse(localStorage.getItem('bible-verse-lists') ?? '[]')[0].refs).toEqual([REF]);

      option.checked = false;
      option.dispatchEvent(new Event('change'));
      expect(JSON.parse(localStorage.getItem('bible-verse-lists') ?? '[]')[0].refs).toEqual([]);
    } finally {
      await GlobalRegistrator.unregister();
    }
  });

  test('uten lister peker versdetaljen til /lister framfor å være tom', () => {
    const detail = /<div[^>]*data-verse-lists-empty[^>]*>[\s\S]*?<\/div>/.exec(chapterBody)?.[0] ?? '';
    expect(detail).toContain('href="/nb/lister"');
  });
});

describe('SERVEREN: lista viser versene sine', () => {
  test('lista øya skrev synkes, og /lister/<id> viser verset med tekst', async () => {
    expect(writtenList).not.toBeNull();
    const push = await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        deviceId: 'enhet-133',
        lastSyncAt: 0,
        changes: [{ dataType: 'verseLists', itemId: LIST_ID, data: writtenList, updatedAt: writtenList!.updatedAt }],
      }),
    });
    expect(push.status).toBe(200);

    const res = await app.request(`/nb/lister/${LIST_ID}`, { headers: AUTH });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Nåde');
    expect(html).toContain(joh316);
    expect(html).toContain('href="/nb/joh/3#v16"');
    expect(html).toContain('Johannes 3:16');
    expect(html).toContain('noindex');
  });

  test('/lister lenker til lista', async () => {
    const res = await app.request('/nb/lister', { headers: AUTH });
    const html = await res.text();
    expect(html).toContain(`href="/nb/lister/${LIST_ID}"`);
  });

  test('en tom liste sier det, og forklarer veien inn', async () => {
    await app.request('/api/sync', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({
        deviceId: 'enhet-133',
        lastSyncAt: 0,
        changes: [{ dataType: 'verseLists', itemId: 'list-tom', data: { id: 'list-tom', name: 'Tom', refs: [], createdAt: 1, updatedAt: 2 }, updatedAt: 2 }],
      }),
    });
    const html = await (await app.request('/nb/lister/list-tom', { headers: AUTH })).text();
    expect(/<p[^>]*data-empty(?![^>]*hidden)[^>]*>/.test(html)).toBe(true);
  });
});

describe('KLIENTEN: en liste som bare finnes på enheten rendres likevel', () => {
  test('user.js henter verstekst og viser verset, og kan fjerne det', async () => {
    // Siden rendres som for en leser serveren ikke kjenner lista til.
    const page = await (await app.request(`/nb/lister/${LIST_ID}-lokal`)).text();
    const verses = await (
      await app.request('/api/verses?lang=nb', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refs: [{ bookId: 43, chapter: 3, verses: [16] }] }),
      })
    ).text();

    GlobalRegistrator.register({ url: `https://bible.flogvit.com/nb/lister/${LIST_ID}-lokal` });
    try {
      document.documentElement.lang = 'nb';
      document.body.innerHTML = bodyOf(page);
      localStorage.clear();
      localStorage.setItem(
        'bible-verse-lists',
        JSON.stringify([{ id: `${LIST_ID}-lokal`, name: 'Lokal', refs: [REF], createdAt: 1, updatedAt: 1 }]),
      );
      const sent: unknown[] = [];
      (globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: { body?: string }) => {
        expect(String(url)).toStartWith('/api/verses');
        sent.push(JSON.parse(init?.body ?? 'null'));
        return new Response(verses, { headers: { 'content-type': 'application/json' } });
      };

      await loadIsland('user');
      await new Promise((r) => setTimeout(r, 20));

      expect(sent).toEqual([{ refs: [{ bookId: 43, chapter: 3, verses: [16] }] }]);
      expect(document.querySelector('h1')?.textContent).toBe('Lokal');
      const card = document.querySelector('[data-list] .user-card') as HTMLElement;
      expect(card.querySelector('a')?.getAttribute('href')).toBe('/nb/joh/3#v16');
      expect(card.textContent).toContain(joh316);

      (card.querySelector('button') as HTMLElement).click();
      expect(JSON.parse(localStorage.getItem('bible-verse-lists') ?? '[]')[0].refs).toEqual([]);
      expect(document.querySelectorAll('[data-list] .user-card').length).toBe(0);
      expect((document.querySelector('[data-empty]') as HTMLElement).hidden).toBe(false);
    } finally {
      await GlobalRegistrator.unregister();
    }
  });
});
