// Småhjelpere for API-rutene — samme oppførsel som Express-utgaven:
// tallparametre parses med parseInt (NaN → 400 hos kalleren), og
// innholdsruter svarer med Cache-Control: no-cache.

import type { Context } from 'hono';
import { isConnectionError } from '../../lib/db.ts';
import { DB_NEDE_RETRY_AFTER_S, loggFeil } from '../../lib/error-handler.ts';

export function intParam(c: Context, name: string): number {
  return parseInt(c.req.query(name) ?? '', 10);
}

/**
 * `?bookId=&chapter=&verse=` — versadressen tre av rutene tar imot. `null` når
 * ett av tallene mangler eller ikke er et tall; kalleren svarer 400.
 */
export function verseQuery(c: Context): { bookId: number; chapter: number; verse: number } | null {
  const bookId = intParam(c, 'bookId');
  const chapter = intParam(c, 'chapter');
  const verse = intParam(c, 'verse');
  if (isNaN(bookId) || isNaN(chapter) || isNaN(verse)) return null;
  return { bookId, chapter, verse };
}

export const NO_CACHE = { 'Cache-Control': 'no-cache' };

/**
 * Svaret en API-rute gir når den har fanget sitt EGET kast (#109): feilen
 * skrives gjennom `loggFeil()`, og klienten får 500 — eller 503 med
 * `Retry-After` når feilen er et DB-avbrudd (#123).
 *
 * Rutene fanger kastet selv, så det når aldri `app.onError`; skillet må derfor
 * gjøres her, med SAMME regel og samme sekundtall som `feilsvar` (#108). En
 * defekt hos oss er fortsatt 500. `kropp` lar en rute beholde sin egen
 * feilform (`/api/version` svarer en fallback-versjon) uten å miste 503-en.
 */
export function internFeil(c: Context, hva: string, err: unknown, kropp?: object): Response {
  loggFeil(hva, err);
  if (isConnectionError(err)) {
    return c.json(kropp ?? { error: 'Service unavailable' }, 503, {
      'retry-after': String(DB_NEDE_RETRY_AFTER_S),
    });
  }
  return c.json(kropp ?? { error: 'Internal server error' }, 500);
}
