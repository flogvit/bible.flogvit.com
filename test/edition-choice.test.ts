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

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getDailyVerse, getVerses } from '../src/lib/bible.ts';
import { chosenEditionFrom } from '../src/lib/edition-choice.ts';
import { resetPageCache } from '../src/lib/page-cache.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);
afterAll(resetPageCache);

const app = createApp();

/** The cookie the settings page writes (public/js/prefs.js). */
const chose = (edition: string, extra: Record<string, string> = {}) =>
  `fv-prefs=${encodeURIComponent(JSON.stringify({ lang: 'nb', ...extra, 'bible.edition': edition }))}`;

const get = (path: string, cookie?: string) => app.request(`http://x${path}`, cookie ? { headers: { cookie } } : {});

/** HTML escapes quotes and apostrophes; compare on a stretch of plain words. */
const words = (text: string) => text.replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ');

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
    const page = plain(await res.text());
    expect(page).toContain(text.osen);
    expect(page).not.toContain(text.osnb);
    // Not "this chapter is not translated yet": the reader chose English.
    expect(page).not.toContain(plain(DICTIONARIES.nb['rd.untranslated']).trim());
  });

  test('with nothing chosen, the interface language decides as before', async () => {
    expect(plain(await (await get('/nb/joh/3')).text())).toContain(text.osnb);
    expect(plain(await (await get('/en/joh/3')).text())).toContain(text.osen);
  });

  test('the other way round: an en interface with OSNB chosen shows OSNB', async () => {
    const page = plain(await (await get('/en/joh/3', chose('osnb'))).text());
    expect(page).toContain(text.osnb);
    expect(page).not.toContain(text.osen);
  });

  test('an edition named in the address still wins over the choice', async () => {
    expect(plain(await (await get('/nb/joh/3?bible=osnn', chose('osen'))).text())).toContain(text.osnn);
  });

  test('"follow the interface language" and an unknown edition are no choice', async () => {
    expect(plain(await (await get('/nb/joh/3', chose(''))).text())).toContain(text.osnb);
    expect(plain(await (await get('/nb/joh/3', chose('kjv1611'))).text())).toContain(text.osnb);
    expect(chosenEditionFrom(encodeURIComponent('{"bible.edition":"user:abc"}'))).toBeUndefined();
    expect(chosenEditionFrom('not json')).toBeUndefined();
    expect(chosenEditionFrom(encodeURIComponent('{"bible.edition":"osnb2"}'))).toBe('osnb');
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
    expect(JSON.stringify(await res.json())).toContain(text.osen.split(' ')[0]!);
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
      expect(plain(await withChoice.text())).toContain(text.osen);
      expect(plain(await without.text())).toContain(text.osnb);
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
