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
// tom kropp — noen hundre byte — i stedet for hele fila.
//
// I TILLEGG versjoneres URL-ene layout skriver ut (`assetUrl`), fordi ETag-en
// alene bare løser framtidig foreldelse: en kopi som ALLEREDE ligger i en
// nettleser uten validator blir liggende. Med `?v=<innholdshash>` er den gamle
// oppføringen irrelevant fra første sidevisning — og siden URL-en da er
// innholdsadressert, kan den caches hardt.

import { readFileSync } from 'node:fs';
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
  // En KATALOG stat-er helt fint — det er `arrayBuffer()` under som kaster
  // EISDIR, altså forbi et `!stat`-vern (#95). `isFile()` er det som skiller
  // dem, og alt som ikke er en vanlig fil har ingen ETag å gi.
  if (!stat || !stat.isFile()) return null;

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
/**
 * `/css/home.css` → `/css/home.css?v=<hash>`.
 *
 * ETag-en over løser bare FRAMTIDIG foreldelse. En kopi som allerede ligger i
 * en nettleser uten validator blir liggende til den tilfeldigvis utløper, så
 * lesere som var innom før fiksen ville fortsatt sett gammelt design. Endrer vi
 * URL-en, er den gamle oppføringen irrelevant fra første sidevisning.
 *
 * Hashen er av INNHOLDET, så den endrer seg bare når fila gjør det — en deploy
 * som ikke rører CSS-en beholder cachen.
 *
 * Merk: dette dekker inngangspunktene layout skriver ut. Modulimportene inne i
 * `public/js/` (`./locale.js`) er uendret og lener seg på ETag-en.
 */
const versioned = new Map<string, string>();

export function assetUrl(path: string): string {
  const known = versioned.get(path);
  if (known) return known;
  let url = path;
  try {
    // Synkron lesing: layout rendres synkront, filene er små, og hver fil leses
    // nøyaktig én gang per prosess.
    url = `${path}?v=${Bun.hash(readFileSync(`./public${path}`)).toString(16).slice(0, 8)}`;
  } catch {
    // Fila finnes ikke (eller er uleselig) — uversjonert URL er riktigere enn
    // å ta ned sida for en manglende stilfil.
  }
  versioned.set(path, url);
  return url;
}

/**
 * Stiene appen serverer fra `public/`. ÉN sannhet, delt av cache-middlewaren,
 * fall-gjennom-svaret under og vakta — to lister ville vært to steder å glemme
 * en ny montering.
 */
export const STATIC_MOUNTS = ['/css/', '/js/', '/styles.css', '/og.png'] as const;

/**
 * Legges ETTER `serveStatic`: under en statisk montering svares det aldri som
 * en SIDE. `/js/` er ingen adresse i side-navnerommet, så locale-forhandlingen
 * lovte `/en/js/` — som heller ikke finnes (302 → 301 → 404), altså to hopp og
 * en render-plass for et svar som uansett er «her er ingenting». Samme regel
 * som under `/og/` (#84). Bare KATALOG-monteringene: en fil-montering som
 * mangler (`/og.png`) har alt punktum i stien og 404-er av seg selv.
 */
export function staticMountNotFound(prefixes: readonly string[]): MiddlewareHandler {
  const dirs = prefixes.filter((p) => p.endsWith('/'));
  return async (c, next) => {
    if (!dirs.some((p) => c.req.path.startsWith(p))) return next();
    return c.text('Not Found', 404);
  };
}

export function staticCache(prefixes: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if (!prefixes.some((p) => path.startsWith(p))) return next();
    // Ingen stier ut av public/ — `..` skal aldri nå filsystemet.
    if (path.includes('..')) return next();

    const etag = await etagFor(`./public${path}`);
    if (!etag) return next();

    // Med `?v=<innholdshash>` er URL-en innholdsadressert: endres fila, endres
    // URL-en. Da kan den caches hardt. Uten `v` er `no-cache` riktig — da må
    // leseren spørre, og ETag-en gjør svaret billig (304, tom kropp).
    const cacheControl = c.req.query('v')
      ? 'public, max-age=31536000, immutable'
      : 'public, no-cache';

    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304, { ETag: etag, 'Cache-Control': cacheControl });
    }

    await next();
    c.header('ETag', etag);
    c.header('Cache-Control', cacheControl);
  };
}
