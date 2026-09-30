// Småhjelpere for API-rutene — samme oppførsel som Express-utgaven:
// tallparametre parses med parseInt (NaN → 400 hos kalleren), og
// innholdsruter svarer med Cache-Control: no-cache.

import type { Context } from 'hono';
import { loggFeil } from '../../lib/error-handler.ts';

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
 * skrives gjennom `loggFeil()`, og klienten får 500.
 *
 * Ett sted framfor ~40 kopier av de samme to linjene. Det er også stedet
 * RESTANSEN i #109 (CLAUDE.md) må løses: et DB-avbrudd svarer 500 her, der
 * `app.onError` ville svart 503 + `Retry-After`.
 */
export function internFeil(c: Context, hva: string, err: unknown): Response {
  loggFeil(hva, err);
  return c.json({ error: 'Internal server error' }, 500);
}
