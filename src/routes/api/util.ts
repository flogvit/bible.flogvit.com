// Småhjelpere for API-rutene — samme oppførsel som Express-utgaven:
// tallparametre parses med parseInt (NaN → 400 hos kalleren), og
// innholdsruter svarer med Cache-Control: no-cache.

import type { Context } from 'hono';

export function intParam(c: Context, name: string): number {
  return parseInt(c.req.query(name) ?? '', 10);
}

export const NO_CACHE = { 'Cache-Control': 'no-cache' };
