// Mikrocache + lastavvisning for anonyme HTML-sidevisninger (GitHub #4, #14).
//
// Kapittelsidene er tung SSR (opptil ~1MB HTML), og uten cache ga et titalls
// samtidige forespørsler (bot-crawling) 502. Innholdet endres bare ved import,
// så anonyme GET-sider caches kort i minnet og får Cache-Control. Innloggede
// forespørsler (fv-session-cookie) går alltid rett gjennom — de kan rendre
// brukerspesifikt innhold (/innstillinger).
//
// Cachen alene hjelper ikke mot crawl over mange UNIKE stier (2026-07-28:
// 1068 unike stier → alt cache-miss → alt i kø på DB-poolen → 502 fra Caddy
// etter 10 s). Derfor en semafor rundt anonyme render: over taket serveres
// utløpt cache-innhold om det finnes (stale-while-shedding), ellers ærlig
// 503 med Retry-After etter kort køventetid. Innloggede berøres aldri.

import type { Context, Next } from 'hono';

const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1.5 * 1024 * 1024;
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

const DEFAULTS = {
  ttlMs: 5 * 60 * 1000,
  maxConcurrentRenders: Number(process.env.RENDER_MAX_CONCURRENT || 24),
  queueWaitMs: Number(process.env.RENDER_QUEUE_WAIT_MS || 3000),
};

let config = { ...DEFAULTS };

/** Kun for tester. */
export function configurePageCache(next: Partial<typeof DEFAULTS>): void {
  config = { ...DEFAULTS, ...next };
}

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

// Semafor for samtidige anonyme render. Venterne får plass i FIFO-rekkefølge;
// den som ikke får plass innen queueWaitMs får false (→ stale eller 503).
let active = 0;
const waiters: Array<(ok: boolean) => void> = [];

function acquireRenderSlot(): Promise<boolean> {
  if (active < config.maxConcurrentRenders) {
    active++;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const waiter = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      const i = waiters.indexOf(waiter);
      if (i !== -1) waiters.splice(i, 1);
      resolve(false);
    }, config.queueWaitMs);
    waiters.push(waiter);
  });
}

function releaseRenderSlot(): void {
  const next = waiters.shift();
  if (next) {
    next(true); // plassen går videre, active står
  } else {
    active--;
  }
}

function serveEntry(c: Context, entry: CacheEntry, xCache: 'hit' | 'stale'): Response {
  return c.body(entry.body, 200, {
    'content-type': entry.contentType,
    'cache-control': CACHE_CONTROL,
    'x-cache': xCache,
  });
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
    return serveEntry(c, hit, 'hit');
  }
  // Utløpte entries beholdes til de re-rendres eller evictes på plass —
  // ved overlast er en stale side bedre enn 503.

  if (!(await acquireRenderSlot())) {
    if (hit) return serveEntry(c, hit, 'stale');
    return c.body('Service overloaded, try again shortly.\n', 503, {
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': '30',
    });
  }

  try {
    await next();
  } finally {
    releaseRenderSlot();
  }

  const res = c.res;
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !contentType.includes('text/html')) return;
  // Sider som satte sin egen Set-Cookie skal ikke deles på tvers.
  if (res.headers.get('set-cookie')) return;

  const body = await res.clone().text();
  const bytes = body.length;
  c.res.headers.set('cache-control', CACHE_CONTROL);
  if (bytes > MAX_ENTRY_BYTES) return;
  if (hit) {
    cache.delete(key);
    totalBytes -= hit.bytes;
  }
  evictUntilRoom(bytes);
  if (totalBytes + bytes > MAX_TOTAL_BYTES) return;
  cache.set(key, { body, contentType, expires: Date.now() + config.ttlMs, bytes });
  totalBytes += bytes;
}
