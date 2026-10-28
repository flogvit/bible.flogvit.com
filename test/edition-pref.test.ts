// The browser side of the edition choice (#182): the settings page writes it to
// `fv-prefs` where the server reads it, and a choice saved before the fix — only
// in localStorage, as the owner's OSEN was — moves to the cookie once.
//
// happy-dom on bible.flogvit.com, so the cookie on .flogvit.com sticks. fetch
// (konto's PUT /api/prefs) and location.reload are stubbed and counted.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

let bust = 0;
let reloads = 0;
let puts: unknown[] = [];

async function load() {
  return import(`../public/js/edition-pref.js?t=${bust++}`) as Promise<{
    chooseEdition: (id: string) => void;
    chosenEdition: () => string;
    moveSavedChoiceToCookie: () => void;
  }>;
}

const prefs = () => {
  const m = document.cookie.match(/(?:^|;\s*)fv-prefs=([^;]+)/);
  return m ? JSON.parse(decodeURIComponent(m[1]!)) : {};
};
const saved = () => JSON.parse(localStorage.getItem('bible-settings') ?? '{}');
const setCookie = (p: Record<string, string>) => {
  document.cookie = `fv-prefs=${encodeURIComponent(JSON.stringify(p))};domain=.flogvit.com;path=/`;
};

beforeEach(() => {
  GlobalRegistrator.register({ url: 'https://bible.flogvit.com/nb/joh/3' });
  localStorage.clear();
  sessionStorage.clear();
  reloads = 0;
  puts = [];
  Object.defineProperty(window.location, 'reload', { value: () => reloads++, configurable: true });
  (globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
    puts.push(JSON.parse(init.body));
    return new Response(null, { status: 401 });
  };
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

describe('a choice saved before the fix', () => {
  test('moves from localStorage to the cookie and reloads, once', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen', fontSize: 'large' }));
    setCookie({ lang: 'nb', theme: 'dark' });
    const m = await load();
    m.moveSavedChoiceToCookie();
    expect(prefs()).toEqual({ lang: 'nb', theme: 'dark', 'bible.edition': 'osen' });
    expect(reloads).toBe(1);
    // konto gets it too, for a logged-in reader (PREFS.md's write snippet).
    expect(puts).toEqual([{ prefs: { 'bible.edition': 'osen' } }]);
    // The next page in the session has it in the cookie, and does nothing.
    m.moveSavedChoiceToCookie();
    expect(reloads).toBe(1);
  });

  test('a cookie that will not stick does not reload for ever', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen' }));
    const m = await load();
    sessionStorage.setItem('bible-edition-moved', '1');
    m.moveSavedChoiceToCookie();
    expect(reloads).toBe(0);
  });

  test('an uploaded edition of the reader\'s own stays in the browser', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'user:abc' }));
    (await load()).moveSavedChoiceToCookie();
    expect('bible.edition' in prefs()).toBe(false);
    expect(reloads).toBe(0);
  });
});

describe('the cookie is the truth when it has a choice', () => {
  test('a choice from the account replaces this browser\'s old copy, without a reload', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osnb' }));
    setCookie({ 'bible.edition': 'osen' });
    const m = await load();
    m.moveSavedChoiceToCookie();
    expect(saved().bible).toBe('osen');
    expect(m.chosenEdition()).toBe('osen');
    expect(reloads).toBe(0);
  });

  test('"follow the interface language" in the cookie clears the old copy', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen' }));
    setCookie({ 'bible.edition': '' });
    const m = await load();
    m.moveSavedChoiceToCookie();
    expect(saved().bible).toBeUndefined();
    expect(m.chosenEdition()).toBe('');
  });
});

describe('choosing on the settings page', () => {
  test('writes the cookie and this browser\'s copy', async () => {
    const m = await load();
    m.chooseEdition('osen');
    expect(prefs()['bible.edition']).toBe('osen');
    expect(saved().bible).toBe('osen');
    m.chooseEdition('');
    expect(prefs()['bible.edition']).toBe('');
    expect(saved().bible).toBeUndefined();
  });

  test('an uploaded edition is kept in the browser, and the cookie follows the language', async () => {
    const m = await load();
    m.chooseEdition('user:abc');
    expect(saved().bible).toBe('user:abc');
    expect(prefs()['bible.edition']).toBe('');
  });
});
