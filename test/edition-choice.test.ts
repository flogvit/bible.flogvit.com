// A translation the reader has chosen applies whatever language the interface
// is in (#182). The owner: «jeg har satt opp OSEN som oversettelse på
// bible.flogvit.com, men den viser nb oversettelsen». The interface language
// only decides when nothing is chosen.
//
// The choice is `bible.edition` in the `fv-prefs` cookie, as the settings page
// writes it. Every surface that quotes Bible text is held to it: the chapter
// page, verse of the day, the verse API the previews use — and the microcache,
// which must never hand one reader's edition to the next.
//
// The texts compared are read from the database, so a new import moves the
// test with it.
//
// Requires the local DB (DBngin :3326) with imported content.

import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { kontoUser, startMockKonto, type MockKontoPut } from './mock-konto.ts';
import { createApp } from '../src/app.ts';
import { getDailyVerse, getVerses } from '../src/lib/bible.ts';
import { chosenEditionFrom } from '../src/lib/edition-choice.ts';
import { resetPageCache } from '../src/lib/page-cache.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

/** The cookie the settings page writes (public/js/prefs.js). */
const chose = (edition: string, extra: Record<string, string> = {}) =>
  `fv-prefs=${encodeURIComponent(JSON.stringify({ lang: 'nb', ...extra, 'bible.edition': edition }))}`;

const get = (path: string, cookie?: string) => app.request(`http://x${path}`, cookie ? { headers: { cookie } } : {});

/** HTML escapes quotes and apostrophes; compare on a stretch of plain words. */
const words = (text: string) => text.replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ');

/**
 * The text the chapter page shows for verse 16, and nothing else: the study
 * notes on the same page quote the verse in the interface language, which says
 * nothing about the edition.
 */
const verse16 = (html: string) => plain(html.match(/data-verse-num="16"[\s\S]*?<span data-verse-plain="true"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
const chapter = async (path: string, cookie?: string) => {
  const res = await get(path, cookie);
  expect(res.status).toBe(200);
  return { res, verse: verse16(await res.text()) };
};

const text = { osen: '', osnb: '', osnn: '' };

beforeAll(async () => {
  resetPageCache();
  for (const id of ['osen', 'osnb', 'osnn'] as const) {
    const verse = (await getVerses(43, 3, id)).find((v) => v.verse === 16);
    expect(verse, `John 3:16 in ${id}`).toBeDefined();
    text[id] = words(verse!.text);
  }
  expect(new Set(Object.values(text)).size).toBe(3);
});

describe('the chapter page', () => {
  test('an nb interface with OSEN chosen shows the OSEN text', async () => {
    const res = await get('/nb/joh/3', chose('osen'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(verse16(html)).toContain(text.osen);
    // Not "this chapter is not translated yet": the reader chose English.
    expect(html).not.toContain('data-untranslated');
  });

  test('with nothing chosen, the interface language decides as before', async () => {
    expect((await chapter('/nb/joh/3')).verse).toContain(text.osnb);
    expect((await chapter('/en/joh/3')).verse).toContain(text.osen);
  });

  test('the other way round: an en interface with OSNB chosen shows OSNB', async () => {
    expect((await chapter('/en/joh/3', chose('osnb'))).verse).toContain(text.osnb);
  });

  test('an edition named in the address still wins over the choice', async () => {
    expect((await chapter('/nb/joh/3?bible=osnn', chose('osen'))).verse).toContain(text.osnn);
  });

  test('"follow the interface language" and an unknown edition are no choice', async () => {
    expect((await chapter('/nb/joh/3', chose(''))).verse).toContain(text.osnb);
    expect((await chapter('/nb/joh/3', chose('kjv1611'))).verse).toContain(text.osnb);
    expect(chosenEditionFrom(encodeURIComponent('{"bible.edition":"user:abc"}'))).toBeUndefined();
    expect(chosenEditionFrom('not json')).toBeUndefined();
    expect(chosenEditionFrom(encodeURIComponent('{"bible.edition":"osnb2"}'))).toBe('osnb');
  });
});

describe('a logged-in reader without Plus', () => {
  // The combination that failed for admin@flogvit.com (2026-10-28): logged in,
  // no Plus, so no settings synced by bibel. The account in konto keeps the
  // choice (`bible.edition` in its prefs) and is the truth for a logged-in
  // reader (PREFS.md), so a choice made on one device counts on the next.
  const admin = { id: 38, plus: false, email: 'admin@flogvit.com' };
  const session = (value: string) => `; fv-session=${value}`;
  let konto: ReturnType<typeof startMockKonto>;
  const puts: MockKontoPut[] = [];
  const accountBefore = process.env.ACCOUNT_API_URL;
  beforeAll(() => {
    konto = startMockKonto(
      {
        'chose-osen': () => kontoUser(admin, 'tok-38', { lang: 'nb', theme: 'system', units: 'metric', 'bible.edition': 'osen' }),
        'chose-language': () => kontoUser(admin, 'tok-38', { lang: 'nb', theme: 'system', units: 'metric', 'bible.edition': '' }),
        'chose-nothing': () => kontoUser(admin, 'tok-38', { lang: 'nb', theme: 'system', units: 'metric' }),
      },
      undefined,
      puts,
    );
  });
  beforeEach(() => {
    puts.length = 0;
  });
  afterAll(() => {
    konto.stop(true);
    if (accountBefore === undefined) delete process.env.ACCOUNT_API_URL;
    else process.env.ACCOUNT_API_URL = accountBefore;
  });
  const setPrefs = (res: Response) =>
    res.headers.getSetCookie().find((c) => c.startsWith('fv-prefs=')) ?? null;

  test('a choice on the account counts on another device, where the cookie has none', async () => {
    const cookie = `fv-prefs=${encodeURIComponent(JSON.stringify({ lang: 'nb', theme: 'dark' }))}${session('chose-osen')}`;
    const { res, verse } = await chapter('/nb/joh/3', cookie);
    expect(res.headers.get('x-cache')).toBeNull();
    expect(verse).toContain(text.osen);
    // ...and this browser's cookie gets it, keeping what it had.
    const line = setPrefs(res);
    expect(line, 'fv-prefs is refreshed from the account').not.toBeNull();
    expect(JSON.parse(decodeURIComponent(line!.split(';')[0]!.slice('fv-prefs='.length)))).toEqual({
      lang: 'nb',
      theme: 'dark',
      'bible.edition': 'osen',
    });
  });

  test('the account beats an old cookie: "follow the language" on the account wins', async () => {
    const { res, verse } = await chapter('/nb/joh/3', `${chose('osen')}${session('chose-language')}`);
    expect(verse).toContain(text.osnb);
    expect(setPrefs(res)).toContain(encodeURIComponent('"bible.edition":""'));
    // The account had a choice, so nothing from this browser goes to it.
    expect(puts).toEqual([]);
  });

  // Both of the owner's accounts on 2026-10-28: OSEN chosen in the browser
  // before the account could keep it, and nothing on the account.
  test('a choice only this browser has is saved on the account, with the reader\'s session and token', async () => {
    const cookie = `${chose('osen')}${session('chose-nothing')}`;
    const { res, verse } = await chapter('/nb/joh/3', cookie);
    expect(verse).toContain(text.osen);
    expect(puts).toEqual([{ cookie, csrf: 'tok-38', body: { prefs: { 'bible.edition': 'osen' } } }]);
    // The cookie already says the same, so it is left alone.
    expect(setPrefs(res)).toBeNull();
  });

  test('"follow the language" in the browser is a choice the account gets too', async () => {
    await chapter('/nb/joh/3', `${chose('')}${session('chose-nothing')}`);
    expect(puts.map((p) => p.body)).toEqual([{ prefs: { 'bible.edition': '' } }]);
  });

  test('no choice in the browser and none on the account: nothing to save', async () => {
    const cookie = `fv-prefs=${encodeURIComponent(JSON.stringify({ lang: 'nb' }))}${session('chose-nothing')}`;
    const { verse } = await chapter('/nb/joh/3', cookie);
    expect(verse).toContain(text.osnb);
    expect(puts).toEqual([]);
  });

  test('the page carries konto\'s CSRF token, so the browser can save a choice on the account', async () => {
    const res = await get('/nb/innstillinger', `${chose('osen')}${session('chose-nothing')}`);
    expect(await res.text()).toMatch(/class="account-chip account-chip-in"[^>]*data-csrf="tok-38"/);
  });

  test('konto out of reach: the reader is anonymous, and the cookie still decides', async () => {
    const cookie = `${chose('osen', { theme: 'system', units: 'metric' })}; fv-session=not-a-real-session`;
    const { verse } = await chapter('/nb/joh/3', cookie);
    expect(verse).toContain(text.osen);
  });
});

describe('every surface that quotes the text', () => {
  test('the verse of the day on the front page', async () => {
    const osen = await getDailyVerse('osen', 'nb');
    const osnb = await getDailyVerse('osnb', 'nb');
    expect(osen, 'a verse of the day for today').not.toBeNull();
    const page = plain(await (await get('/nb', chose('osen'))).text());
    expect(page).toContain(words(osen!.text));
    expect(page).not.toContain(words(osnb!.text));
  });

  test('the verse API the previews and the front page use', async () => {
    const res = await get('/api/verses?ref=Joh+3,16', chose('osen'));
    const rows = (await res.json()) as { verse: { text: string } }[];
    expect(words(rows[0]!.verse.text)).toBe(text.osen);
    // The answer depends on the cookie, so a cached copy must not outlive a change.
    expect(res.headers.get('vary')).toBe('Cookie');
    const named = await get('/api/verses?ref=Joh+3,16&bible=osnb', chose('osen'));
    expect(named.headers.get('vary')).toBeNull();
  });
});

describe('the microcache never hands one reader\'s edition to the next', () => {
  test('the same address, cached, gives each reader their own edition', async () => {
    resetPageCache();
    const path = '/nb/joh/3';
    for (let round = 0; round < 2; round++) {
      // Round two is served from the cache; the edition must still follow the cookie.
      const withChoice = await get(path, chose('osen'));
      const without = await get(path);
      if (round === 1) {
        expect(withChoice.headers.get('x-cache')).toBe('hit');
        expect(without.headers.get('x-cache')).toBe('hit');
      }
      expect(verse16(await withChoice.text())).toContain(text.osen);
      expect(verse16(await without.text())).toContain(text.osnb);
      expect(withChoice.headers.get('vary')).toBe('Cookie');
    }
  });
});

describe('the settings page', () => {
  test('offers "follow the interface language" as a choice', async () => {
    const html = await (await get('/nb/innstillinger')).text();
    const select = html.match(/<select data-setting="bible"[\s\S]*?<\/select>/)?.[0] ?? '';
    expect(select).toContain(`<option value="">${DICTIONARIES.nb['u.editionFollowsLanguage']}</option>`);
    expect(select).toContain('value="osen"');
  });
});
