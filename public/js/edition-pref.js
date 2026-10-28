// The Bible edition the reader has chosen (#182). It lives in `fv-prefs` as
// `bible.edition`, and for a logged-in reader also on the account in konto,
// where the server reads it (src/lib/edition-choice.ts) and shows it on every
// page, whatever the interface language. An empty value is
// "follow the interface language". An uploaded edition of the reader's own
// (`user:<id>`) lives only in this browser, so the server never sees it and the
// reading page keeps its own path for it (reading.js).
//
// `bible-settings.bible` in localStorage is kept equal to the cookie: the
// offline reader and the settings page read it.

import { persistPref, readPrefs, setPref, writePrefCookie } from './prefs.js';
import { readJSON, writeJSON } from './store.js';

export const EDITION_PREF = 'bible.edition';
const SETTINGS = 'bible-settings';
const SERVED = /^[a-z0-9]{2,16}$/;

/** The chosen edition: the cookie first, then this browser's settings. '' = none. */
export function chosenEdition() {
  const prefs = readPrefs();
  if (typeof prefs[EDITION_PREF] === 'string') return prefs[EDITION_PREF];
  return (readJSON(SETTINGS, {}) || {}).bible || '';
}

/** Choose an edition ('' follows the interface language). */
export function chooseEdition(id) {
  const settings = readJSON(SETTINGS, {}) || {};
  if (id) settings.bible = id;
  else delete settings.bible;
  writeJSON(SETTINGS, settings);
  setPref(EDITION_PREF, SERVED.test(id) ? id : '');
}

/**
 * A choice saved before #182 is only in localStorage, which the server cannot
 * see. Move it to the cookie once and reload, so the page shows it. Only when
 * the cookie has no choice at all — a choice in the cookie (from the account, or
 * "follow the language") is the truth, and this browser's copy follows it.
 * A logged-in reader's choice goes to the account too, before the reload, so
 * the server (which reads the account first) shows it on the reloaded page.
 * Resolves when done.
 */
export function moveSavedChoiceToCookie() {
  const prefs = readPrefs();
  const saved = (readJSON(SETTINGS, {}) || {}).bible;
  if (EDITION_PREF in prefs) {
    const target = prefs[EDITION_PREF];
    if (String(saved).startsWith('user:') || (saved || '') === target) return Promise.resolve();
    const settings = readJSON(SETTINGS, {}) || {};
    if (target) settings.bible = target;
    else delete settings.bible;
    writeJSON(SETTINGS, settings);
    return Promise.resolve();
  }
  if (!saved || !SERVED.test(saved)) return Promise.resolve();
  // Should the cookie not stick (another domain), the page must not reload for
  // ever: remember the cookie this left behind, and move again only when
  // someone else has rewritten it since.
  const before = JSON.stringify(prefs);
  try {
    if (sessionStorage.getItem(MOVED) === before) return Promise.resolve();
  } catch {
    return Promise.resolve();
  }
  writePrefCookie(EDITION_PREF, saved);
  const saving = persistPref(EDITION_PREF, saved);
  try {
    sessionStorage.setItem(MOVED, before);
  } catch {}
  if (!(EDITION_PREF in readPrefs())) return saving;
  return saving.then(() => location.reload());
}

const MOVED = 'bible-edition-moved';
