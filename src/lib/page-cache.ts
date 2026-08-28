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
//
// TAKET BESKYTTER RESPONSTIDEN, ikke bare mot kollaps (#19). 24 samtidige render
// på én delt vCPU betyr at hver enkelt tar 24× så lang tid: natt til 2026-07-29
// svarte vanlige kapittelsider på 8–29 sekunder mens semaforen «holdt». Riktig
// utfall under overlast er raske 503-er til noen få, ikke 20-sekunders svar til
// alle. Derfor er standarden lav (6) og skal måles, ikke gjettes oppover.
//
// Taket verner SSR-RENDEREN og ingenting annet. robots.txt, sitemapene og de
// statiske filene sto bak det og fikk 503 under last — se NOT_A_PAGE (#64).

import type { Context, Next } from 'hono';

/**
 * Hva en cachet side KOSTER — og enheten er BYTE, ikke tegn (#105).
 *
 * Sidene ble lagret som JS-strenger og budsjettert med `body.length`, altså
 * antall TEGN. En JS-streng koster én byte per tegn bare når HVERT tegn er
 * under 256; ett eneste tegn utenfor latin1 tvinger hele strengen til UTF-16,
 * og en kapittelside bærer hebraisk og gresk. Målt over 100 ekte kapittelsider:
 * 1,97 byte beholdt heap per tegn — altså et 48 MB-tak som i virkeligheten var
 * ~96 MB, og betydelig mer i RSS, som er det cgroup-en teller.
 *
 * Fiksen er ikke å gange med to. Kroppen LAGRES nå som byte: det er formen den
 * sendes i uansett, den er én flat allokering på nøyaktig den størrelsen vi
 * fører i regnskapet, og et anslag som kan drive fra virkeligheten er byttet
 * mot et tall som ER virkeligheten. Sidebonus: en treffende forespørsel slipper
 * å kode strengen til byte på nytt, og en bom slipper å dekode dem til en
 * streng bare for å telle dem.
 */
export function entryBytes(body: Uint8Array): number {
  return body.byteLength;
}

/** Taket, lest én gang: køens standardlengde er det samme tallet (under). */
const MAX_CONCURRENT_RENDERS = Number(process.env.RENDER_MAX_CONCURRENT || 6);

/**
 * Verdiene modulen STARTER i — altså det lastvernet vi faktisk ruller ut.
 *
 * Eksportert med vilje: en vakt som skal måle at knappene er satt tilbake, må
 * måle mot standarden framfor å skrive av tallene. En kopi i testen ville
 * fortsatt vært grønn etter at standarden ble endret — samme grunn som at
 * `NOT_A_PAGE` importeres framfor å gjentas i `load-shedding.test.ts` (#64).
 */
export const PAGE_CACHE_DEFAULTS = Object.freeze({
  // 5 minutter var unødvendig kort (#19). Innholdet endres BARE ved import, og
  // en crawler som går gjennom Bibelen kommer tilbake til samme URL flere ganger
  // i timen — 5289 forespørsler over 1068 unike stier i hendelsen. Med en time
  // blir de gjentakelsene gratis, og en import tømmer cachen umiddelbart
  // (contentVersion under), så lengre TTL koster ikke ferskhet.
  ttlMs: Number(process.env.PAGE_CACHE_TTL_MS || 60 * 60 * 1000),
  // 24 samtidige render på én delt vCPU ga 8–29 sekunders svar framfor raske
  // 503-er: semaforen beskyttet mot kollaps, men taket var satt for høyt til å
  // beskytte RESPONSTIDEN. 1,8 req/s holdt til å velte siden (#19).
  maxConcurrentRenders: MAX_CONCURRENT_RENDERS,
  // Hvor mange som får VENTE på en plass. Uten en lengde er køen et løfte vi
  // ikke kan holde: hver forespørsel over taket parkerte hele `queueWaitMs` før
  // den fikk høre nei, selv om vi visste det med en gang (#19).
  maxQueuedRenders: Number(process.env.RENDER_QUEUE_MAX || MAX_CONCURRENT_RENDERS),
  queueWaitMs: Number(process.env.RENDER_QUEUE_WAIT_MS || 3000),
  /** Hvor sjelden innholdsversjonen sjekkes (én liten spørring per intervall). */
  versionCheckMs: Number(process.env.PAGE_CACHE_VERSION_CHECK_MS || 30 * 1000),
  /**
   * Minnet cachen får bruke — og fra #105 er det EKTE byte, ikke tegn.
   *
   * Tallet er uendret (48 MB), men det betyr nå det det alltid sa: før holdt
   * cachen 48 M TEGN, altså ~96 MB, på en container med 288 MiB.
   *
   * ENV-styrt fordi det må kunne settes mot containerens minnetak uten en
   * kodeendring — minnebudsjettet i driftsrepoet er oppbrukt, så den dagen
   * dette må ned igjen, skal det ikke kreve en deploy av appen.
   */
  maxTotalBytes: Number(process.env.PAGE_CACHE_MAX_BYTES || 48 * 1024 * 1024),
  /**
   * Taket for ÉN side. Sal 119 er den største vi serverer — 1,20 MB målt
   * 2026-08-28 — og den skal fortsatt få plass: en side som er dyr å rendre er
   * nettopp den cachen finnes for, og en side som stille faller ut av cachen
   * ser helt lik ut i loggen.
   */
  maxEntryBytes: Number(process.env.PAGE_CACHE_MAX_ENTRY_BYTES || 2 * 1024 * 1024),
});

let config = { ...PAGE_CACHE_DEFAULTS };

/** Kun for tester. */
export function configurePageCache(next: Partial<typeof PAGE_CACHE_DEFAULTS>): void {
  config = { ...PAGE_CACHE_DEFAULTS, ...next };
}

const cacheControl = () =>
  `public, max-age=${Math.round(config.ttlMs / 1000)}, stale-while-revalidate=86400`;

// --- Innholdsversjon: én import skal tømme cachen, ikke vente ut TTL-en ------
//
// Leseren injiseres framfor at cachen slår opp i basen selv: den skal kunne
// brukes uten DB (testene), og en feilende spørring skal ikke kunne ta ned
// nettopp det laget som holder siden oppe under last. Registreres i index.ts.
type VersionReader = () => Promise<string | undefined>;
let readContentVersion: VersionReader | null = null;
let seenVersion: string | undefined;
let versionCheckedAt = 0;

export function setContentVersionReader(fn: VersionReader | null): void {
  readContentVersion = fn;
  seenVersion = undefined;
  versionCheckedAt = 0;
}

async function invalidateOnContentChange(): Promise<void> {
  if (!readContentVersion) return;
  const now = Date.now();
  if (now - versionCheckedAt < config.versionCheckMs) return;
  // FØR await: ellers fyrer alle samtidige forespørsler sin egen spørring.
  versionCheckedAt = now;
  try {
    const version = await readContentVersion();
    if (version === undefined) return;
    if (seenVersion !== undefined && version !== seenVersion) clearPageCache();
    seenVersion = version;
  } catch {
    // DB nede: behold cachen. Den er det eneste som fortsatt kan svare.
  }
}

interface CacheEntry {
  body: Uint8Array;
  contentType: string;
  expires: number;
  bytes: number;
}

const cache = new Map<string, CacheEntry>();
let totalBytes = 0;

function evictUntilRoom(needed: number): void {
  for (const [key, entry] of cache) {
    if (totalBytes + needed <= config.maxTotalBytes) break;
    cache.delete(key);
    totalBytes -= entry.bytes;
  }
}

/**
 * Hva cachen MENER den bruker, og på hvor mange sider.
 *
 * Eksportert for vakta i `page-cache-memory-budget.test.ts`: den skal måle
 * regnskapet mot det som faktisk beholdes, og et regnskap ingen kan lese er et
 * regnskap ingen kan motsi (#105).
 */
export function pageCacheStats(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: totalBytes };
}

/** Kun for tester. */
export function clearPageCache(): void {
  cache.clear();
  totalBytes = 0;
}

// Semafor for samtidige anonyme render. Køen er BEGRENSET og betjenes med den
// FERSKESTE først; den som verken får plass eller kø-plass får false med en
// gang (→ stale eller 503), og den som venter forgjeves gir opp etter
// queueWaitMs.
//
// Begge delene er samme lærdom fra #19, målt 2026-08-05 med taket allerede nede
// på 6: bare 2 forespørsler fikk 503 — men 12 fikk 3–9 sekunder, og de to
// 503-ene kom etter nøyaktig 3,003 s. «Raske 503-er til noen få» var hele
// poenget med taket, og det var ikke det som skjedde.
//
// UBEGRENSET KØ er det ene: over taket vet vi med en gang at vi ikke kan
// betjene alle, og brukte likevel opp hele fristen før vi sa nei. Verre for den
// som spurte om en side vi HAR en utløpt kopi av — den lå i minnet mens leseren
// ventet tre sekunder på å få høre at vi var opptatt. Køen er derfor like lang
// som taket: står du bakerst i en lengre kø, rekker du uansett ikke fram innen
// fristen når rendrene er trege, og da er ventingen bare ventetid.
//
// FIFO er det andre: plassen gikk til den som hadde ventet LENGST, altså den
// som er nærmest å gi opp — og køtiden ble dermed lagt oppå rendertiden for
// alle. Med den ferskeste først får den som nettopp klikket svar på rendertiden
// sin, framfor å stille bakerst i en byge fra én crawler. Antallet vi rekker å
// betjene er det samme; det er fordelingen av ventetid som endres, og under
// overlast er det den som er problemet. Er det ikke overlast, er køen tom eller
// én lang, og de to rekkefølgene er samme sak.
let active = 0;
const waiters: Array<(ok: boolean) => void> = [];

function acquireRenderSlot(): Promise<boolean> {
  if (active < config.maxConcurrentRenders) {
    active++;
    return Promise.resolve(true);
  }
  if (waiters.length >= config.maxQueuedRenders) return Promise.resolve(false);
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
  const next = waiters.pop(); // ferskest først, se begrunnelsen over
  if (next) {
    next(true); // plassen går videre, active står
  } else if (active > 0) {
    // Gulvet på null er ikke pynt: `resetPageCache()` nuller telleren mens en
    // render kan være i gang, og uten gulvet ville dens release tatt `active`
    // til -1 — altså et STØRRE tak enn det som er konfigurert, permanent og
    // stille. En teller som beskriver kapasiteten kan ikke være negativ.
    active--;
  }
}

/**
 * Kun for tester: setter modulen tilbake til den tilstanden den STARTET i.
 *
 * `bun test` kjører alle filene i SAMME prosess, og både knappene, cachen,
 * semaforen og versjonsleseren er modulnivå-tilstand. En fil som skrur taket
 * ned til ett spor for å måle lastavvisning, måler alt som kjører etterpå mot
 * en app vi ikke ruller ut — feilmeldingen peker da på feil fil, og i verste
 * fall består en vakt fordi den stille målte en 503-side (#72).
 *
 * `configurePageCache({})` setter bare knappene tilbake. SEMAFOREN er også
 * tilstand, og den er det ingenting som kunne nullstille: en render som aldri
 * ble ferdig — en test som røk på taket, en port som aldri ble åpnet — holder
 * plassen sin ut prosessen, og kapasiteten er dermed lavere enn den som står i
 * konfigurasjonen. Venterne får nei framfor plassen: de holder ingen plass, så
 * ingen av dem slipper en de ikke har.
 */
export function resetPageCache(): void {
  config = { ...PAGE_CACHE_DEFAULTS };
  clearPageCache();
  setContentVersionReader(null);
  active = 0;
  for (const waiter of waiters.splice(0)) waiter(false);
}

function serveEntry(c: Context, entry: CacheEntry, xCache: 'hit' | 'stale'): Response {
  // Kroppen ligger som byte (#105) — samme form `og.ts` serverer kortene i.
  return c.body(entry.body as unknown as ArrayBuffer, 200, {
    'content-type': entry.contentType,
    'cache-control': cacheControl(),
    'x-cache': xCache,
  });
}

/**
 * Stier som ALDRI caches, selv anonymt.
 *
 * `/delt/<token>` er en capability-URL til et manuskript (#15): en cachet kopi
 * ville overlevd at eieren trakk tilbake lenken — med den nye TTL-en i opptil
 * en time. «Trekk tilbake» må virke i samme øyeblikk, så siden rendres alltid.
 * Den er dessuten unik per token, så cachen ville ikke gitt treff uansett.
 */
const NEVER_CACHED = [
  /^\/(?:[a-z]{2}\/)?delt\//,
  // Katalogen (#15, del 2): trekkes en oppføring — av forfatteren eller etter
  // en rapport — skal den være borte med en gang, også fra LISTA. En tittel er
  // tekst den som rapporterte kan ha reagert på, så «teksten er borte, men
  // overskriften står i en time» er ikke moderering. Prisen er liten: lista er
  // én spørring mot en tabell med hundre rader, ikke 1189 kapittelsider.
  /^\/(?:[a-z]{2}\/)?manuskripter\/katalog(?:\/|$)/,
];

/**
 * Stier som ALDRI når SSR-renderen, og som derfor ikke skal kunne ta en plass i
 * semaforen: `/robots.txt`, sitemapene og alt i `public/` (#64).
 *
 * `/robots.txt` fikk 503 av vårt eget lastvern natt til 2026-08-02 — 1 av 7
 * hentinger, `Retry-After: 30`, varighet nøyaktig 3,003 s (= `queueWaitMs`).
 * Det er selvopphevende: robots.txt er BREMSEN på lasten som utløste
 * avvisningen. #60 la `Disallow: /*?vers=` der nettopp for å få crawlerne bort
 * fra handlingsflata, og den regelen virker bare hvis crawleren får LESE fila.
 * Alle de store behandler 5xx på robots.txt som «stopp crawlingen av hele siten
 * en stund», og vedvarende 5xx (Google: over ~30 dager) som `Disallow: /`. Jo
 * hardere crawlen presser oss, desto mindre sannsynlig er det at den som
 * presser får se at vi ba den la være. En brems bak sin egen port er ingen
 * brems. En 503 på en sitemap er mildere: en indekseringsrunde som går tapt.
 *
 * Samme regel tar de statiske filene, og der var utslaget verre enn i saken:
 * `/styles.css` og `/js/*` sto også bak semaforen, så en leser som fikk sida fra
 * CACHEN (`x-cache: hit`, ingen plass brukt) kunne få 503 på stilarket rett
 * etterpå. Å skjære bort en filutlevering for å berge en SSR-render er nøyaktig
 * baklengs.
 *
 * Felles for dem: de kan aldri fylle cachen — bare `text/html` caches (nederst
 * i fila) — så de KOSTER en plass og GIR ingenting tilbake. Ren kostnad i
 * akkurat det øyeblikket kapasiteten er knapp. Og de er billige, målt: 0,02 ms
 * for robots.txt og 0,35 ms for `/styles.css`, 3,3 ms for den dyreste sitemapen
 * (ren strengbygging, ingen DB), mot ~47 ms + DB for en kapittelside. Det finnes
 * dessuten 9 sitemap-URL-er mot 1 189 kapittelsider — ingen crawl-flate (#60).
 *
 * Regelen er FILNAVNET, ikke en liste over ruter: en ny SEO-rute eller en ny fil
 * i `public/` arver den gratis. Det er samme skille `app.ts` allerede bruker for
 * å avgjøre at en sti med punktum ikke er en side (den 404-er framfor å bli
 * forhandlet inn i et språk), og ingen siderute har punktum i stien —
 * `test/load-shedding.test.ts` holder på begge deler.
 *
 * Det ene som følger med: en ukjent sti MED punktum (`/foo.php`) rendrer
 * 404-siden, og den går nå utenom taket. Den koster 1,15 ms uten DB, og den ble
 * uansett aldri cachet (status ≠ 200) — altså samme regnestykke som over.
 */
export const NOT_A_PAGE = /\.[^./]+$/;

export async function withPageCache(c: Context, next: Next): Promise<Response | void> {
  const anonymous = !(c.req.header('cookie') ?? '').includes('fv-session=');
  if (
    c.req.method !== 'GET' ||
    !anonymous ||
    c.req.path.startsWith('/api/') ||
    NOT_A_PAGE.test(c.req.path) ||
    NEVER_CACHED.some((re) => re.test(c.req.path))
  ) {
    return next();
  }

  await invalidateOnContentChange();

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

  // `arrayBuffer()` framfor `text()`: kroppen skal ligge som byte, og en
  // omvei om en JS-streng ville både doblet minnet og kostet en dekoding.
  const body = new Uint8Array(await res.clone().arrayBuffer());
  const bytes = entryBytes(body);
  c.res.headers.set('cache-control', cacheControl());
  if (bytes > config.maxEntryBytes) return;
  if (hit) {
    cache.delete(key);
    totalBytes -= hit.bytes;
  }
  evictUntilRoom(bytes);
  if (totalBytes + bytes > config.maxTotalBytes) return;
  cache.set(key, { body, contentType, expires: Date.now() + config.ttlMs, bytes });
  totalBytes += bytes;
}
