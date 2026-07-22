// Mikrocache for anonyme HTML-sidevisninger (GitHub #4).
//
// Kapittelsidene er tung SSR (opptil ~1MB HTML), og uten cache ga et titalls
// samtidige forespørsler (bot-crawling) 502. Innholdet endres bare ved import,
// så anonyme GET-sider caches kort i minnet og får Cache-Control. Innloggede
// forespørsler (fv-session-cookie) går alltid rett gjennom — de kan rendre
// brukerspesifikt innhold (/innstillinger).

import type { Context, Next } from 'hono';

const TTL_MS = 5 * 60 * 1000;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1.5 * 1024 * 1024;
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

interface CacheEntry {
  body: string;
  contentType: string;
  expires: number;
  bytes: number;
}

const cache = new Map<string, CacheEntry>();
let totalBytes = 0;

function evictUntilRoom(needed: number): void {
  for (const [key, entry] of cache) {
    if (totalBytes + needed <= MAX_TOTAL_BYTES) break;
    cache.delete(key);
    totalBytes -= entry.bytes;
  }
}

/** Kun for tester. */
export function clearPageCache(): void {
  cache.clear();
  totalBytes = 0;
}

export async function withPageCache(c: Context, next: Next): Promise<Response | void> {
  const anonymous = !(c.req.header('cookie') ?? '').includes('fv-session=');
  if (c.req.method !== 'GET' || !anonymous || c.req.path.startsWith('/api/')) {
    return next();
  }

  const url = new URL(c.req.url);
  const key = url.pathname + url.search;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return c.body(hit.body, 200, {
      'content-type': hit.contentType,
      'cache-control': CACHE_CONTROL,
      'x-cache': 'hit',
    });
  }
  if (hit) {
    cache.delete(key);
    totalBytes -= hit.bytes;
  }

  await next();

  const res = c.res;
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !contentType.includes('text/html')) return;
  // Sider som satte sin egen Set-Cookie skal ikke deles på tvers.
  if (res.headers.get('set-cookie')) return;

  const body = await res.clone().text();
  const bytes = body.length;
  c.res.headers.set('cache-control', CACHE_CONTROL);
  if (bytes > MAX_ENTRY_BYTES) return;
  evictUntilRoom(bytes);
  if (totalBytes + bytes > MAX_TOTAL_BYTES) return;
  cache.set(key, { body, contentType, expires: Date.now() + TTL_MS, bytes });
  totalBytes += bytes;
}
