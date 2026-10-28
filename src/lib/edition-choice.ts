// The edition the reader has chosen (#182). The interface language only decides
// the edition when the reader has not chosen one: OSEN chosen on an nb
// interface is OSEN, on every surface that shows Bible text.
//
// The choice is the product preference `bible.edition` (portal/PREFS.md), which
// the settings page writes to the family cookie `fv-prefs` and, for a logged-in
// reader, to the account in konto. It is read here and nowhere else, from the
// request in `contextStorage()`, so the default getter
// (`defaultBibleForLanguage`) and the microcache's key read the same value.

import { getContext } from 'hono/context-storage';
import { IMPORTED_BIBLES } from './editions.ts';
import type { AppEnv } from './session.ts';

export const EDITION_PREF = 'bible.edition';

/** Legacy ids still found in old settings (bible.ts `normalizeBibleId`). */
const LEGACY: Record<string, string> = { osnb2: 'osnb', osnn1: 'osnn' };

/**
 * The chosen edition in a `fv-prefs` cookie value, or undefined when there is
 * none or it is not an edition we serve. An uploaded edition of the reader's own
 * (`user:<id>`) lives only in the browser and is never here.
 */
export function chosenEditionFrom(prefsCookie: string | undefined): string | undefined {
  return editionIn(parsePrefs(prefsCookie)[EDITION_PREF]);
}

/** A `bible.edition` value as an edition we serve, or undefined ('' = none). */
function editionIn(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const id = LEGACY[raw] ?? raw;
  return (IMPORTED_BIBLES as readonly string[]).includes(id) ? id : undefined;
}

function parsePrefs(prefsCookie: string | undefined): Record<string, unknown> {
  if (!prefsCookie) return {};
  try {
    const prefs: unknown = JSON.parse(decodeURIComponent(prefsCookie));
    return prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The `fv-prefs` value in a Cookie header. */
export function prefsCookieIn(cookieHeader: string | undefined): string | undefined {
  return cookieHeader?.match(/(?:^|;\s*)fv-prefs=([^;]+)/)?.[1];
}

/**
 * The chosen edition for the request being served; undefined outside a request.
 * For a logged-in reader the account is the truth (PREFS.md), with or without
 * plus: a choice made on another device counts here at once. The cookie decides
 * only when the account has made no choice.
 */
export function currentChosenEdition(): string | undefined {
  let c;
  try {
    c = getContext<AppEnv>();
  } catch {
    // getContext() throws outside a request (scripts, the MCP server).
    return undefined;
  }
  const account = c.var.user?.prefs;
  if (account && EDITION_PREF in account) return editionIn(account[EDITION_PREF]);
  return chosenEditionFrom(prefsCookieIn(c.req.header('cookie')));
}

/**
 * A choice in this browser's cookie that the account has not got, to be saved
 * there: a reader who chose before the account could keep it (#182) still
 * has it only on this device. undefined when the account already has a choice,
 * or the cookie has none. '' ("follow the interface language") is a choice.
 */
export function cookieChoiceForAccount(
  cookieHeader: string | undefined,
  accountPrefs: Record<string, string>,
): string | undefined {
  if (EDITION_PREF in accountPrefs) return undefined;
  const raw = parsePrefs(prefsCookieIn(cookieHeader))[EDITION_PREF];
  if (raw === '') return '';
  return editionIn(raw);
}

/**
 * The Set-Cookie line that brings the account's choice into this browser's
 * `fv-prefs`, or null when the cookie already says the same (or the account has
 * made no choice). Keeps every other key in the cookie.
 */
export function refreshedPrefsCookie(
  cookieHeader: string | undefined,
  accountPrefs: Record<string, string>,
  hostname: string,
): string | null {
  if (!(EDITION_PREF in accountPrefs)) return null;
  const prefs = parsePrefs(prefsCookieIn(cookieHeader));
  if (prefs[EDITION_PREF] === accountPrefs[EDITION_PREF]) return null;
  prefs[EDITION_PREF] = accountPrefs[EDITION_PREF];
  // The family cookie lives on .flogvit.com (PREFS.md); on localhost it is host-only.
  const family = hostname === 'flogvit.com' || hostname.endsWith('.flogvit.com');
  return (
    `fv-prefs=${encodeURIComponent(JSON.stringify(prefs))}; Path=/; Max-Age=31536000; SameSite=Lax` +
    (family ? '; Domain=.flogvit.com; Secure' : '')
  );
}
