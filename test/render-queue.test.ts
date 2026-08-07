/**
 * VAKT: under overlast skal svaret komme RASKT — også når svaret er nei (#19).
 *
 * Taket ble senket til 6 og TTL-en hevet til en time, og det virket: hendelsen
 * 2026-08-05 ga bare 2 × 503 i stedet for at alle sto i kø. Men målingen i
 * saken sier hva som IKKE ble bedre:
 *
 *   12 forespørsler fikk 3–9 s, og begge 503-ene kom etter nøyaktig 3,003 s.
 *
 * «Raske 503-er til noen få» var hele poenget med taket, og det er ikke det som
 * skjer. Grunnen er KØEN, ikke taket: den er ubegrenset og FIFO. Ubegrenset
 * betyr at hver eneste forespørsel over taket parkerer i `queueWaitMs` (3 s) før
 * den får høre nei — vi vet med en gang at vi ikke kan betjene den, og bruker
 * likevel opp fristen først. FIFO betyr at plassen som blir ledig går til den
 * som har ventet LENGST, altså den som er nærmest å gi opp: køtiden legges på
 * toppen av rendertiden for alle, og en leser som nettopp klikket står bakerst
 * bak en byge med crawler-forespørsler. Å senke taket videre flytter grensen,
 * det fjerner den ikke.
 *
 * Halvdelene er formulert på TIDEN og på HVEM som blir betjent, ikke på tallene
 * i konfigurasjonen — en fiks som løser det på en annen måte enn denne består
 * like gjerne, så lenge ingen venter ut fristen på et nei og den ferskeste
 * forespørselen ikke stiller bakerst.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import {
  PAGE_CACHE_DEFAULTS,
  clearPageCache,
  configurePageCache,
  resetPageCache,
  withPageCache,
} from '../src/lib/page-cache.ts';

afterAll(resetPageCache);

/** Fristen slik den faktisk står i prod. Et nei skal komme LANGT før den. */
const FRIST_MS = 3000;
/** Takhøyde for «med en gang». Rikelig over planleggeren, langt under fristen. */
const STRAKS_MS = 400;

/** App der hver render venter på en port vi åpner fra testen. */
function buildGatedApp() {
  const gates: Array<() => void> = [];
  const rendered: string[] = [];
  const app = new Hono();
  app.use('*', withPageCache);
  app.get('/side', async (c) => {
    const id = new URL(c.req.url).searchParams.get('a') ?? '';
    rendered.push(id);
    await new Promise<void>((resolve) => gates.push(resolve));
    return c.html(`<html><body>render ${id}</body></html>`);
  });
  return { app, gates, rendered };
}

/** Åpner porter til alle påbegynte render er ferdige, så ingen plass blir stående. */
async function drain(gates: Array<() => void>, pending: Array<Promise<Response>>): Promise<void> {
  while (pending.length) {
    while (gates.length) gates.shift()!();
    await pending.shift();
    await Bun.sleep(1);
  }
  while (gates.length) gates.shift()!();
}

describe('køen er begrenset — et nei venter ikke ut fristen (#19)', () => {
  beforeEach(() => {
    clearPageCache();
    configurePageCache({
      maxConcurrentRenders: 1,
      maxQueuedRenders: 1,
      queueWaitMs: FRIST_MS,
      ttlMs: 60 * 60 * 1000,
    });
  });

  test('over taket OG over køen: 503 med en gang, ikke etter 3 s', async () => {
    const { app, gates } = buildGatedApp();
    const rendering = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);
    const queued = app.request('/side?a=2'); // fyller køen
    await Bun.sleep(5);

    const t0 = performance.now();
    const shed = await app.request('/side?a=3');
    const ms = performance.now() - t0;

    expect(shed.status).toBe(503);
    expect(shed.headers.get('retry-after')).toBe('30');
    expect(ms).toBeLessThan(STRAKS_MS);

    await drain(gates, [rendering, queued]);
  });

  test('stale-kopien vi ALLEREDE har holdes ikke tilbake i 3 s', async () => {
    configurePageCache({
      maxConcurrentRenders: 1,
      maxQueuedRenders: 1,
      queueWaitMs: FRIST_MS,
      ttlMs: 1,
    });
    const { app, gates } = buildGatedApp();
    const prime = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await prime).status).toBe(200);
    await Bun.sleep(5); // entryen er utløpt

    const rendering = app.request('/side?a=2');
    while (gates.length === 0) await Bun.sleep(1);
    const queued = app.request('/side?a=3'); // fyller køen
    await Bun.sleep(5);

    const t0 = performance.now();
    const stale = await app.request('/side?a=1');
    const ms = performance.now() - t0;

    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-cache')).toBe('stale');
    expect(ms).toBeLessThan(STRAKS_MS);

    await drain(gates, [rendering, queued]);
  });

  test('køen slipper fortsatt til når en plass blir ledig', async () => {
    // Uten denne ville «avvis alt» bestått de to over. Er det plass i køen, er
    // det å vente riktig: forespørselen blir betjent.
    const { app, gates, rendered } = buildGatedApp();
    const rendering = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);
    const queued = app.request('/side?a=2');
    await Bun.sleep(5);
    expect(rendered).toEqual(['1']);

    gates.shift()!(); // plassen frigjøres
    expect((await rendering).status).toBe(200);
    while (gates.length === 0) await Bun.sleep(1);
    gates.shift()!();
    expect((await queued).status).toBe(200);
    expect(rendered).toEqual(['1', '2']);
  });
});

describe('plassen går til den FERSKESTE forespørselen (#19)', () => {
  beforeEach(() => {
    clearPageCache();
    configurePageCache({
      maxConcurrentRenders: 1,
      maxQueuedRenders: 4,
      queueWaitMs: FRIST_MS,
      ttlMs: 60 * 60 * 1000,
    });
  });

  test('den som nettopp kom slipper til før den som snart gir opp', async () => {
    const { app, gates, rendered } = buildGatedApp();
    const rendering = app.request('/side?a=1');
    while (gates.length === 0) await Bun.sleep(1);

    const eldst = app.request('/side?a=2');
    await Bun.sleep(5);
    const ferskest = app.request('/side?a=3');
    await Bun.sleep(5);
    expect(rendered).toEqual(['1']);

    gates.shift()!(); // én plass blir ledig
    expect((await rendering).status).toBe(200);
    while (gates.length === 0) await Bun.sleep(1);

    // FIFO ga plassen til «2», som har ventet lengst og er nærmest fristen.
    expect(rendered).toEqual(['1', '3']);

    await drain(gates, [ferskest, eldst]);
  });
});

describe('standarden vi ruller ut', () => {
  test('køen har en lengde, og den følger taket', () => {
    expect(PAGE_CACHE_DEFAULTS.maxQueuedRenders).toBeGreaterThanOrEqual(1);
    if (!process.env.RENDER_QUEUE_MAX) {
      // En kø som er lengre enn taket er bare ventetid: den som står bakerst
      // rekker uansett ikke fram innen fristen når rendrene er trege.
      expect(PAGE_CACHE_DEFAULTS.maxQueuedRenders).toBe(PAGE_CACHE_DEFAULTS.maxConcurrentRenders);
    }
  });
});
