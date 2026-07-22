// Service worker for FLOGVIT.bible (#14).
//
// - Statiske filer: stale-while-revalidate (rask fra cache, oppdateres i
//   bakgrunnen så deploys når klientene ved neste last).
// - HTML-navigasjon: network-first; offline serveres sist sette versjon fra
//   cache, ellers /offline-fallback (offline-leseren rendrer da kapitler fra
//   IndexedDB på klientsiden — SW-en rører aldri IndexedDB selv).
// - Utvalgte GET-API-er: network-first med cache-fallback; øvrige API-kall går
//   alltid på nett.

const VERSION = 'v1';
const STATIC_CACHE = `bibel-static-${VERSION}`;
const DYNAMIC_CACHE = `bibel-dynamic-${VERSION}`;
const API_CACHE = `bibel-api-${VERSION}`;

const PRECACHE = ['/offline-fallback', '/styles.css', '/favicon.svg', '/manifest.json'];

const CACHED_API = ['/api/chapter', '/api/books', '/api/timeline', '/api/prophecies', '/api/persons', '/api/reading-plans', '/api/mappings'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('bibel-') && ![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('bibel-')).map((k) => caches.delete(k)))),
    );
  }
});

function isStatic(url) {
  return (
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/css/') ||
    /\.(css|js|svg|png|ico|woff2?)$/.test(url.pathname) ||
    url.pathname === '/manifest.json'
  );
}

// Stale-while-revalidate: svar fra cache med en gang, men hent ny versjon i
// bakgrunnen — ellers når deploys aldri klienter som alt har cachet filene.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || refresh.then((res) => res || new Response('', { status: 504 }));
}

async function networkFirstPage(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    // Offline-leseren rendrer nedlastet innhold for original-URL-en.
    const fallback = await caches.match('/offline-fallback');
    if (fallback) return fallback;
    return new Response('<h1>Offline</h1>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
}

async function networkFirstApi(request) {
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) {
      const withHeader = new Response(hit.body, hit);
      withHeader.headers.set('X-From-Cache', 'true');
      return withHeader;
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (CACHED_API.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`) || url.pathname.startsWith(`${p}?`))) {
      event.respondWith(networkFirstApi(request));
    }
    return; // øvrige API-er: nett, urørt
  }
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstPage(request));
  }
});
