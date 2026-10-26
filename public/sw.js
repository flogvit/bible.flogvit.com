// Service worker for FLOGVIT.bible (#14).
//
// - Statiske filer: stale-while-revalidate (rask fra cache, oppdateres i
//   bakgrunnen så deploys når klientene ved neste last).
// - HTML-navigasjon: network-first; offline serveres sist sette versjon fra
//   cache, ellers /<lang>/offline-fallback (offline-leseren rendrer da kapitler
//   fra IndexedDB på klientsiden — SW-en rører aldri IndexedDB selv).
// - Utvalgte GET-API-er: network-first med cache-fallback; øvrige API-kall går
//   alltid på nett.
// - `/versjon.json` (flogvit-com#339): alltid nett, aldri cache. En ny worker
//   venter til leseren ber om den — se install-handleren.

const VERSION = 'v1';
const STATIC_CACHE = `bibel-static-${VERSION}`;
const DYNAMIC_CACHE = `bibel-dynamic-${VERSION}`;
const API_CACHE = `bibel-api-${VERSION}`;

// Uten '/offline-fallback' (#136): den uprefiksede adressen svarer 302 til
// /<lang>/offline-fallback, og en omdirigert respons kan ikke besvare en
// navigasjon — Chrome viste sin egen feilside for hvert kapittel som ikke lå i
// cachen, også etter en full nedlasting. Skallet caches nå per språk av
// `cacheOfflineShell()` under.
const PRECACHE = ['/favicon.svg', '/manifest.json'];

const CACHED_API = ['/api/chapter', '/api/books', '/api/timeline', '/api/prophecies', '/api/persons', '/api/reading-plans', '/api/mappings'];

/**
 * Forespørsler offline-nedlastingen gjør (#136). De går rett på nett: dataene
 * lagres i IndexedDB, og å legge en kopi i API-cachen i tillegg ga dobbel
 * lagring — målt 68 MB i IndexedDB og 147 MB i SW-cachen for samme innhold.
 */
const BYPASS_HEADER = 'x-bibel-offline';

// ── Offline-skallet per språk (#136) ─────────────────────────────────
//
// Språket leses av STIEN, ikke av en liste: lista har én sannhet
// (portal/design/locales.json), og SW-en skal ikke ha en kopi. En sti som ikke
// er et språk, gir et svar som ikke er 200 (eller en omdirigering), og caches
// ikke.
const SHELL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STAMP_HEADER = 'x-bibel-cached-at';

function langOf(pathname) {
  const m = pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  return m ? m[1] : null;
}

const shellUrl = (lang) => `/${lang}/offline-fallback`;

/** En kopi uten `redirected`-flagget og med tidsstempel — trygg å svare en navigasjon med. */
async function storable(res) {
  const headers = new Headers(res.headers);
  headers.set(STAMP_HEADER, String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

/**
 * Skallet og ALT det trenger for å tegne seg uten nett: stilark og skript fra
 * HTML-en, og modulene skriptene importerer (`./offline-db.js` osv.), fulgt
 * rekursivt. Det holder ikke at filene «pleier» å ligge i den statiske cachen:
 * offline-reader.js lastes bare av skallet, så den har aldri vært hentet før
 * nettet er borte.
 */
async function cacheOfflineShell(lang, force = false) {
  if (!lang) return false;
  const cache = await caches.open(STATIC_CACHE);
  const url = shellUrl(lang);
  const hit = await cache.match(url);
  const age = hit ? Date.now() - Number(hit.headers.get(STAMP_HEADER) || 0) : Infinity;
  if (hit && !force && age < SHELL_MAX_AGE_MS) return true;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok || res.redirected) return false;
  const html = await res.clone().text();
  const assets = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/(?!\/)[^"]+?\.(?:js|css|svg|json)(?:\?[^"]*)?)"/g)) {
    assets.add(m[1].replace(/&amp;/g, '&'));
  }
  const seen = new Set();
  async function cacheAsset(path) {
    if (seen.has(path)) return;
    seen.add(path);
    const r = await fetch(path).catch(() => null);
    if (!r || !r.ok) return;
    await cache.put(path, r.clone());
    if (!/\.js(?:\?|$)/.test(path)) return;
    const src = await r.text();
    const base = new URL(path, self.location.origin);
    const imports = [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map(
      (m) => new URL(m[1], base).pathname,
    );
    await Promise.all(imports.map(cacheAsset));
  }
  await Promise.all([...assets].map(cacheAsset));
  await cache.put(url, await storable(res));
  return true;
}

// Ingen skipWaiting() her (flogvit-com#339): en ny worker VENTER til leseren
// trykker «Last inn på nytt» på felles linje (pwa.js sender SKIP_WAITING), eller
// til alle fanene er lukket. Tok den over av seg selv, lastet siden seg på nytt
// midt i lesingen — og knappen hadde ingen ventende worker å ta i bruk.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
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
  // Offline-nedlastingen ber om skallet for sitt språk og venter på svaret,
  // så «ferdig» betyr at et ubesøkt kapittel faktisk kan åpnes uten nett.
  if (type === 'CACHE_OFFLINE_SHELL') {
    const port = event.ports && event.ports[0];
    event.waitUntil(
      cacheOfflineShell(event.data.lang, true).then(
        (ok) => port?.postMessage({ ok }),
        () => port?.postMessage({ ok: false }),
      ),
    );
  }
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

async function networkFirstPage(request, event) {
  const lang = langOf(new URL(request.url).pathname);
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, res.clone());
      // Hver side under et språk sørger for at språkets skall ligger klart
      // (#136) — i bakgrunnen, og bare når det mangler eller er gammelt.
      if (lang) event.waitUntil(cacheOfflineShell(lang).catch(() => {}));
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    // Offline-leseren rendrer nedlastet innhold for original-URL-en. Skallet
    // på stiens språk; finnes det ikke, et hvilket som helst annet språks
    // skall framfor nettleserens feilside.
    const cache = await caches.open(STATIC_CACHE);
    let fallback = lang ? await cache.match(shellUrl(lang)) : undefined;
    if (!fallback) {
      const any = (await cache.keys()).find((req) => /^\/[a-z]{2}\/offline-fallback$/.test(new URL(req.url).pathname));
      if (any) fallback = await cache.match(any);
    }
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
  if (request.headers.has(BYPASS_HEADER)) return; // nedlastingen: rett på nett, ingen kopi
  // Bygget som serveres NÅ (flogvit-com#339). Et svar fra cache ville sagt at
  // fanen er oppdatert når den ikke er det — alltid rett på nett.
  if (url.pathname === '/versjon.json') return;

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
    event.respondWith(networkFirstPage(request, event));
  }
});
