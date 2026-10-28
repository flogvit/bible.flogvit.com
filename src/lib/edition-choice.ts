// The edition the reader has chosen (#182). The interface language only decides
// the edition when the reader has not chosen one: OSEN chosen on an nb
// interface is OSEN, on every surface that shows Bible text.
//
// The choice is the product preference `bible.edition` in the family cookie
// `fv-prefs` (portal/PREFS.md: product override, `fv.<produkt>.<key>`), which
// the settings page writes. It is read here and nowhere else, from the request
// in `contextStorage()`, so the default getter (`defaultBibleForLanguage`) and
// the microcache's key read the same value.

import { getContext } from 'hono/context-storage';
import { IMPORTED_BIBLES } from './editions.ts';

export const EDITION_PREF = 'bible.edition';

/** Legacy ids still found in old settings (bible.ts `normalizeBibleId`). */
const LEGACY: Record<string, string> = { osnb2: 'osnb', osnn1: 'osnn' };

/**
 * The chosen edition in a `fv-prefs` cookie value, or undefined when there is
 * none or it is not an edition we serve. An uploaded edition of the reader's own
 * (`user:<id>`) lives only in the browser and is never here.
 */
export function chosenEditionFrom(prefsCookie: string | undefined): string | undefined {
  if (!prefsCookie) return undefined;
  let prefs: unknown;
  try {
    prefs = JSON.parse(decodeURIComponent(prefsCookie));
  } catch {
    return undefined;
  }
  const raw = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>)[EDITION_PREF] : undefined;
  if (typeof raw !== 'string') return undefined;
  const id = LEGACY[raw] ?? raw;
  return (IMPORTED_BIBLES as readonly string[]).includes(id) ? id : undefined;
}

/** The `fv-prefs` value in a Cookie header. */
export function prefsCookieIn(cookieHeader: string | undefined): string | undefined {
  return cookieHeader?.match(/(?:^|;\s*)fv-prefs=([^;]+)/)?.[1];
}

/** The chosen edition for the request being served; undefined outside a request. */
export function currentChosenEdition(): string | undefined {
  try {
    return chosenEditionFrom(prefsCookieIn(getContext().req.header('cookie')));
  } catch {
    // getContext() throws outside a request (scripts, the MCP server).
    return undefined;
  }
}
