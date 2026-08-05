/**
 * VAKT: en testfil som skrur ned lastvernet setter det tilbake (#72).
 *
 * Saken: `page-cache.test.ts` sin `lastavvisning` satte taket til ETT
 * render-spor og 30 ms køtid i en `beforeEach`, og fila satte det aldri
 * tilbake. `bun test` kjører alle filene i SAMME prosess, så alt som kjørte
 * etterpå målte mot et lastvern vi ikke ruller ut:
 *
 *   bun test test/page-cache.test.ts test/mobile-layout.test.ts   → 21 fail
 *   bun test test/mobile-layout.test.ts test/page-cache.test.ts   →  0 fail
 *
 * Samme tester, motsatt rekkefølge. Feilmeldingen peker på feil fil, og det
 * koster en økt hver gang noen går i fella. Verre: en vakt som stille måler en
 * 503-side i stedet for sida består, og da måler den ingenting.
 *
 * Vakta har to halvdeler, og begge trengs.
 *
 * STRUKTUREN er formulert på hva filen GJØR, ikke på en liste over filnavn: den
 * som kaller `configurePageCache(` har skrudd på en global knapp, og må erklære
 * `afterAll(resetPageCache);` på TOPPNIVÅ — da fyrer den etter siste describe,
 * uansett hvilken describe noen legger til nederst i fila. Neste fil som måler
 * lastavvisning fanges dermed uten at noen har ført den opp. Begge retninger
 * måles: uten den andre ville «sett linja i alle filene» bestått.
 *
 * RESETTEN måler at linja faktisk gjør jobben — både knappene og SEMAFOREN. Det
 * siste er det `configurePageCache({})` ikke kunne: en render som aldri ble
 * ferdig holdt plassen sin ut prosessen, og kapasiteten var da lavere enn det
 * som sto i konfigurasjonen, uten at noe så galt ut.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Hono } from 'hono';
import {
  PAGE_CACHE_DEFAULTS,
  configurePageCache,
  resetPageCache,
  withPageCache,
} from '../src/lib/page-cache.ts';

afterAll(resetPageCache);

const ROOT = resolve(import.meta.dir, '..');

/** Kallet som skrur på en global knapp i lastvernet. */
const KONFIGURERER = /\bconfigurePageCache\(/;
/** Linja filen skal bære. Ett skjema, på toppnivå — ellers fyrer den for tidlig. */
const ERKLÆRING = /^afterAll\(resetPageCache\);$/m;

describe('testfiler som skrur på lastvernet setter det tilbake (#72)', () => {
  const filer = readdirSync(resolve(ROOT, 'test'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => resolve(ROOT, 'test', f));
  const kilde = new Map(filer.map((f) => [f, readFileSync(f, 'utf8')]));
  const skruende = filer.filter((f) => KONFIGURERER.test(kilde.get(f)!));
  const øvrige = filer.filter((f) => !skruende.includes(f));

  test('filene som skrur på lastvernet finnes — ellers måler vakta ingenting', () => {
    expect(skruende.length).toBeGreaterThanOrEqual(2);
    expect(øvrige.length).toBeGreaterThan(0);
  });

  test('hver av dem erklærer afterAll(resetPageCache); på toppnivå', () => {
    const manglende = skruende
      .filter((f) => !ERKLÆRING.test(kilde.get(f)!))
      .map((f) => relative(ROOT, f));
    expect(manglende).toEqual([]);
  });

  test('en fil som ikke rører lastvernet erklærer det ikke', () => {
    const overflødige = øvrige
      .filter((f) => ERKLÆRING.test(kilde.get(f)!))
      .map((f) => relative(ROOT, f));
    expect(overflødige).toEqual([]);
  });
});

/** App der hver render venter på en port vi åpner fra testen. */
function buildGatedApp() {
  let renders = 0;
  const gates: Array<() => void> = [];
  const app = new Hono();
  app.use('*', withPageCache);
  app.get('/side', async (c) => {
    renders++;
    await new Promise<void>((resolve) => gates.push(resolve));
    return c.html(`<html><body>render ${renders}</body></html>`);
  });
  return { app, gates, getRenders: () => renders };
}

async function ventPå(vilkår: () => boolean, ms = 500): Promise<void> {
  const frist = Date.now() + ms;
  while (!vilkår() && Date.now() < frist) await Bun.sleep(1);
}

// Kapasiteten leses fra standarden framfor å skrives av: en kopi her ville
// fortsatt vært grønn etter at taket ble endret.
const TAK = PAGE_CACHE_DEFAULTS.maxConcurrentRenders;

describe('resetPageCache() setter modulen tilbake til det vi ruller ut', () => {
  beforeEach(resetPageCache);

  test('taket er høyere enn ett spor — ellers beviser målingene under ingenting', () => {
    expect(TAK).toBeGreaterThan(1);
  });

  // KNAPPENE: dette er sakens eget symptom, målt i én prosess.
  test('et tak satt for en måling gjelder ikke etterpå', async () => {
    configurePageCache({ maxConcurrentRenders: 1, queueWaitMs: 10, ttlMs: 5 * 60 * 1000 });
    resetPageCache();

    const { app, gates, getRenders } = buildGatedApp();
    const svar = Array.from({ length: TAK }, (_, i) => app.request(`/side?knapp=${i}`));
    await ventPå(() => gates.length === TAK);
    expect(getRenders()).toBe(TAK);

    for (const åpne of gates.splice(0)) åpne();
    expect((await Promise.all(svar)).map((r) => r.status)).toEqual(Array(TAK).fill(200));
  });

  // PLASSENE: det `configurePageCache({})` aldri kunne sette tilbake. En render
  // som ikke ble ferdig — en test som røk på taket, en port som aldri ble
  // åpnet — holdt plassen sin ut prosessen, og porten blir aldri åpnet, så
  // ingen release kommer og rydder opp for oss. Derfor forlates den her også.
  test('en render som aldri ble ferdig holder ikke plassen etterpå', async () => {
    const { app, gates } = buildGatedApp();
    void app.request('/side?forlatt=1');
    await ventPå(() => gates.length === 1);
    expect(gates.length).toBe(1);

    resetPageCache(); // porten åpnes ALDRI: plassen må frigjøres av nullstillingen

    const { app: app2, gates: gates2, getRenders } = buildGatedApp();
    const svar = Array.from({ length: TAK }, (_, i) => app2.request(`/side?plass=${i}`));
    await ventPå(() => gates2.length === TAK);
    expect(getRenders()).toBe(TAK);

    for (const åpne of gates2.splice(0)) åpne();
    expect((await Promise.all(svar)).map((r) => r.status)).toEqual(Array(TAK).fill(200));
  });

  // …og kapasiteten skal være tilbake, ikke HØYERE. En render som fullfører
  // etter nullstillingen slipper en plass hun ikke lenger holder; uten gulvet
  // på null blir taket permanent større enn det konfigurerte — like stille som
  // at det var mindre.
  test('en render som fullfører etter nullstillingen hever ikke taket', async () => {
    const { app, gates } = buildGatedApp();
    const forlatt = app.request('/side?sen=1');
    await ventPå(() => gates.length === 1);
    expect(gates.length).toBe(1);

    resetPageCache();
    gates.shift()!();
    await forlatt;

    configurePageCache({ queueWaitMs: 20 }); // ellers står den avviste i kø i 3 s
    const { app: app2, gates: gates2, getRenders } = buildGatedApp();
    const svar = Array.from({ length: TAK + 1 }, (_, i) => app2.request(`/side?tak=${i}`));
    await Bun.sleep(60); // køtiden + slakk: den som ikke fikk plass er avvist nå
    expect(getRenders()).toBe(TAK);

    for (const åpne of gates2.splice(0)) åpne();
    const statuser = (await Promise.all(svar)).map((r) => r.status).sort();
    expect(statuser).toEqual([...Array(TAK).fill(200), 503].sort());
  });
});
