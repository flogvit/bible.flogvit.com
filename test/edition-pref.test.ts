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
let puts: { body: unknown; csrf: string | undefined; answered: boolean }[] = [];
/** Reloads that happened while a PUT to konto was still unanswered. */
let reloadsBeforeAnswer = 0;

async function load() {
  return import(`../public/js/edition-pref.js?t=${bust++}`) as Promise<{
    chooseEdition: (id: string) => void;
    chosenEdition: () => string;
    moveSavedChoiceToCookie: () => Promise<void>;
  }>;
}

/** Logged in: the server puts konto's CSRF token on the account chip (layout.tsx). */
const logIn = (csrf = 'tok-123') => {
  document.body.innerHTML = `<a class="account-chip account-chip-in" data-csrf="${csrf}">Vegard</a>`;
};

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
  reloadsBeforeAnswer = 0;
  puts = [];
  Object.defineProperty(window.location, 'reload', {
    value: () => {
      reloads++;
      if (puts.some((p) => !p.answered)) reloadsBeforeAnswer++;
    },
    configurable: true,
  });
  // konto answers a moment later, as over a network.
  (globalThis as unknown as { fetch: unknown }).fetch = async (
    _url: string,
    init: { body: string; headers: Record<string, string> },
  ) => {
    const put = { body: JSON.parse(init.body), csrf: init.headers['x-csrf'], answered: false };
    puts.push(put);
    await new Promise((r) => setTimeout(r, 5));
    put.answered = true;
    return new Response('{}', { status: 200 });
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
    await m.moveSavedChoiceToCookie();
    expect(prefs()).toEqual({ lang: 'nb', theme: 'dark', 'bible.edition': 'osen' });
    expect(reloads).toBe(1);
    // Anonymous: no account to save it on, so no call to konto.
    expect(puts).toEqual([]);
    // The next page in the session has it in the cookie, and does nothing.
    await m.moveSavedChoiceToCookie();
    expect(reloads).toBe(1);
  });

  // The admin@flogvit.com case: logged in, no plus. The choice must reach the
  // account, with konto's CSRF token (without it konto answers 403), and BEFORE
  // the reload, since the server reads the account first.
  test('logged in: saved on the account with the CSRF token, then reloaded', async () => {
    logIn();
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen' }));
    setCookie({ lang: 'nb' });
    await (await load()).moveSavedChoiceToCookie();
    expect(puts).toEqual([{ body: { prefs: { 'bible.edition': 'osen' } }, csrf: 'tok-123', answered: true }]);
    expect(reloads).toBe(1);
    expect(reloadsBeforeAnswer).toBe(0);
  });

  test('a cookie that will not stick does not reload for ever', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen' }));
    const m = await load();
    // The move already ran in this session and left this cookie behind
    // ({} — nothing stuck): no second move, no second reload.
    sessionStorage.setItem('bible-edition-moved', '{}');
    await m.moveSavedChoiceToCookie();
    expect(reloads).toBe(0);
  });

  test('a login that rewrote the cookie in the same session gets the choice back', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen' }));
    setCookie({ lang: 'nb' });
    const m = await load();
    await m.moveSavedChoiceToCookie();
    expect(reloads).toBe(1);
    // An older konto at login: the cookie from the account, without the product key.
    setCookie({ lang: 'nb', theme: 'system', units: 'metric' });
    await m.moveSavedChoiceToCookie();
    expect(prefs()['bible.edition']).toBe('osen');
    expect(reloads).toBe(2);
  });

  test('an uploaded edition of the reader\'s own stays in the browser', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'user:abc' }));
    await (await load()).moveSavedChoiceToCookie();
    expect('bible.edition' in prefs()).toBe(false);
    expect(reloads).toBe(0);
  });
});

describe('the cookie is the truth when it has a choice', () => {
  test('a choice from the account replaces this browser\'s old copy, without a reload', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osnb' }));
    setCookie({ 'bible.edition': 'osen' });
    const m = await load();
    await m.moveSavedChoiceToCookie();
    expect(saved().bible).toBe('osen');
    expect(m.chosenEdition()).toBe('osen');
    expect(reloads).toBe(0);
  });

  test('"follow the interface language" in the cookie clears the old copy', async () => {
    localStorage.setItem('bible-settings', JSON.stringify({ bible: 'osen' }));
    setCookie({ 'bible.edition': '' });
    const m = await load();
    await m.moveSavedChoiceToCookie();
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

  test('logged in: the choice is saved on the account, with the CSRF token', async () => {
    logIn('tok-9');
    (await load()).chooseEdition('osen');
    expect(puts.map(({ body, csrf }) => ({ body, csrf }))).toEqual([
      { body: { prefs: { 'bible.edition': 'osen' } }, csrf: 'tok-9' },
    ]);
  });

  test('an uploaded edition is kept in the browser, and the cookie follows the language', async () => {
    const m = await load();
    m.chooseEdition('user:abc');
    expect(saved().bible).toBe('user:abc');
    expect(prefs()['bible.edition']).toBe('');
  });
});
