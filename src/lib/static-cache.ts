// Cache-headere for CSS og JS.
//
// `serveStatic` fra hono/bun sender hverken `Cache-Control`, `ETag` eller
// `Last-Modified`. HTML-en har `max-age=300` (page-cache.ts), så etter en deploy
// får en tilbakevendende leser NY HTML med GAMMEL CSS — et halvt design, med
// tomrom der oppsettet er endret. Nettleseren kunne ikke engang spørre om fila
// var endret, for det fantes ingen validator å spørre med.
//
// Løsningen er den konservative: `no-cache` betyr «bruk gjerne kopien din, men
// SPØR først». Med en sterk ETag koster det ett betinget kall som svarer 304 med
// tom kropp — noen hundre byte — i stedet for hele fila. Vi kan legge til
// innholdshash i filnavnene senere og skru på `immutable`; det krever at
// modulimportene i `public/js/` også omskrives, og korrekthet går først.

import type { MiddlewareHandler } from 'hono';

interface Entry {
  etag: string;
  mtimeMs: number;
  size: number;
}

const etags = new Map<string, Entry>();

/**
 * Sterk ETag fra innholdet. Cachet på (mtime, size) slik at fila leses én gang
 * per versjon — i prod endrer den seg bare når et nytt image rulles ut.
 */
async function etagFor(path: string): Promise<string | null> {
  const file = Bun.file(path);
  const stat = await file.stat().catch(() => null);
  if (!stat) return null;

  const cached = etags.get(path);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.etag;

  const hash = Bun.hash(await file.arrayBuffer()).toString(16);
  const etag = `"${hash}"`;
  etags.set(path, { etag, mtimeMs: stat.mtimeMs, size: stat.size });
  return etag;
}

/**
 * Legges FØR `serveStatic`. Svarer 304 selv når leserens kopi er gyldig, og
 * merker ellers svaret slik at neste forespørsel kan gjøre det samme.
 */
export function staticCache(prefixes: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (!prefixes.some((p) => path.startsWith(p))) return next();
    // Ingen stier ut av public/ — `..` skal aldri nå filsystemet.
    if (path.includes('..')) return next();

    const etag = await etagFor(`./public${path}`);
    if (!etag) return next();

    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304, { ETag: etag, 'Cache-Control': 'public, no-cache' });
    }

    await next();
    c.header('ETag', etag);
    c.header('Cache-Control', 'public, no-cache');
  };
}
