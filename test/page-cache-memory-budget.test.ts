// Mikrocachen skal koste det den SIER at den koster (#105).
//
// bible.flogvit.com ble OOM-drept hvert ~14. minutt av sitt eget 288 MiB-tak,
// og minnet vokste ~5 MiB/min uten å flate ut. Det så ut som en lekkasje, og
// det er det ikke: mikrocachen fyller seg gradvis mens en crawler går over
// UNIKE adresser, og taket den fylles til var dobbelt så høyt som tallet i
// koden. Sidene ble lagret som JS-strenger og budsjettert med `body.length`,
// altså antall TEGN — men en JS-streng koster én byte per tegn bare når hvert
// eneste tegn er under 256, og en kapittelside bærer hebraisk og gresk. Ett
// slikt tegn tvinger hele strengen til UTF-16. Prosessen ble drept før cachen
// var full, og da ser en helt vanlig oppfylling ut som en lekkasje.
//
// Vaktene er formulert på UTFALLET — hva cachen KOSTER, målt mot budsjettet den
// er satt til — ikke på at kroppen lagres som `Uint8Array`. En fiks som løser
// det på en annen måte (komprimering, kortere TTL, et lavere tak) består like
// gjerne, så lenge regnskapet og virkeligheten er det samme tallet.

import { test, expect, describe, afterAll } from 'bun:test';
import { Hono } from 'hono';
import {
  PAGE_CACHE_DEFAULTS,
  clearPageCache,
  configurePageCache,
  pageCacheStats,
  resetPageCache,
  withPageCache,
} from '../src/lib/page-cache.ts';

// Denne filen skrur på lastvernets knapper, og `bun test` deler prosess (#72).
afterAll(resetPageCache);

const MB = 1024 * 1024;

/** Den største sida vi serverer: /nb/sal/119, 1,20 MB målt 2026-08-28. */
const STØRSTE_SIDE = 1.2 * MB;

interface Måling {
  budsjett: number;
  regnskap: number;
  oppforinger: number;
  vekst: number;
  sideTegn: number;
  sideUtf8: number;
  sider: number;
}

let cachetMåling: Promise<Måling> | null = null;

/**
 * Minnet måles i et EGET PROGRAM (#104): `bun test` kjører alle filene i samme
 * prosess, så et tall målt her inne er summen av alt som har kjørt før.
 */
function måling(): Promise<Måling> {
  return (cachetMåling ??= (async () => {
    // `Bun.fileURLToPath` framfor `.pathname`: arbeidstrærne bor under
    // `.flogvit-orkester/trær/`, og en prosentkodet cwd gir ENOENT på «bun».
    const rot = Bun.fileURLToPath(new URL('..', import.meta.url));
    const proc = Bun.spawn(['bun', 'test/page-cache-memory-probe.ts'], {
      cwd: rot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [ut, feil] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const kode = await proc.exited;
    if (kode !== 0) throw new Error(`måleprogrammet feilet (${kode}):\n${feil}\n${ut}`);
    return JSON.parse(ut.trim().split('\n').at(-1)!) as Måling;
  })());
}

/** En side der tegnantallet og byteantallet er TYDELIG forskjellige. */
function hebraiskSide(): string {
  return `<!doctype html><html><body>${'<p>בראשית ברא אלהים</p>'.repeat(500)}</body></html>`;
}

function app(kropp: () => string): Hono {
  const a = new Hono();
  a.use('*', withPageCache);
  a.get('/side', (c) => c.body(kropp(), 200, { 'content-type': 'text/html; charset=UTF-8' }));
  return a;
}

describe('mikrocachens minnebudsjett (#105)', () => {
  test('REGNSKAPET: budsjettet føres i BYTE, ikke i tegn', async () => {
    resetPageCache();
    const kropp = hebraiskSide();
    // Forutsetningen for målingen: de to tallene må være til å skille fra
    // hverandre, ellers kan halvdelen ikke se forskjell på dem.
    expect(Buffer.byteLength(kropp)).toBeGreaterThan(kropp.length * 1.5);

    const a = app(() => kropp);
    await (await a.request('http://x/side')).text();
    expect(pageCacheStats().entries).toBe(1);

    // Sida leveres nå fra cachen. Regnskapet skal aldri være LAVERE enn
    // minnet sida faktisk opptar, og en kropp kan ikke ligge i mindre enn
    // antallet byte den leveres som. Formulert som et gulv framfor et likhets-
    // tegn med vilje: en fiks som beholder JS-strengen og fører opp to byte per
    // tegn er også ærlig, og består her — det er UNDER-tellingen som er #105.
    const treff = await a.request('http://x/side');
    expect(treff.headers.get('x-cache')).toBe('hit');
    const levert = (await treff.arrayBuffer()).byteLength;
    expect(pageCacheStats().bytes).toBeGreaterThanOrEqual(levert);
    // Og et tak, ellers ville «gang med hundre» bestått ved å gjøre cachen
    // ubrukelig liten. To byte per tegn er det dyreste en JS-streng kan koste.
    expect(pageCacheStats().bytes).toBeLessThanOrEqual(kropp.length * 2);

    resetPageCache();
  });

  test('BUDSJETTET: en crawl over unike adresser koster det budsjettet lover', async () => {
    const m = await måling();

    // Cachen skal ha fylt seg — ellers måler halvdelen ingenting, og «cache
    // ingenting» ville vært den billigste fiksen.
    expect(m.regnskap).toBeGreaterThan(m.budsjett * 0.8);
    expect(m.regnskap).toBeLessThanOrEqual(m.budsjett);
    expect(m.oppforinger).toBeGreaterThan(1);

    // Veksten bærer også allokeringsstøy fra sidene som ble rendret og kastet,
    // så taket er romslig. Det er likevel målt og mutasjonstestet: med
    // regnskapet i TEGN vokser den samme kjøringen til 161 MB mot 64 MB, altså
    // 6,4x budsjettet mot 2,6x. Antall oppføringer er identisk i de to — det er
    // ikke hvor MANGE sider cachen holder som er forskjellen, det er hva hver
    // av dem koster.
    expect(m.vekst).toBeLessThan(m.budsjett * 4);
  }, 180_000);

  test('TAKET PER SIDE står i samme enhet — den STØRSTE sida vi har caches fortsatt', () => {
    // Regnes budsjettet om til byte uten at taket per oppføring følger med,
    // faller nettopp de dyreste sidene stille ut av cachen: de svarer 200 som
    // før, bare uten cache, og ingenting i loggen sier fra. Det er den motsatte
    // skaden av #105, gjort mens man fikser #105.
    expect(PAGE_CACHE_DEFAULTS.maxEntryBytes).toBeGreaterThan(STØRSTE_SIDE);
  });

  test('REGELEN: en side over taket per oppføring caches ikke i det hele tatt', async () => {
    resetPageCache();
    configurePageCache({ maxEntryBytes: 4096 });
    const a = app(() => 'ב'.repeat(8192));

    await (await a.request('http://x/side')).text();
    expect(pageCacheStats().entries).toBe(0);
    expect(pageCacheStats().bytes).toBe(0);

    clearPageCache();
    resetPageCache();
  });
});
