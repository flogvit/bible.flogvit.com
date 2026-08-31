// Måleprogrammet for `minne-vekst.test.ts` (#110).
//
// Et EGET PROGRAM av samme grunn som `mapping-bulk-probe.ts` (#104) og
// `page-cache-memory-probe.ts` (#105): `bun test` kjører alle testfilene i
// samme prosess, så et minnetall målt der inne er summen av alt som har kjørt
// før — og et tak på det ville vært et tak på suiten, ikke på appen.
//
// Det måler ÉN ting: vokser LIVE-SETTET med antall UNIKE kapittelrender?
// Det er formen en lekkasje har, og det er den saken påsto: «to tredeler av alt
// ligger i én region … formen en voksende heap har». Mikrocachen skrus av med
// vilje — den har alt et tak og et regnskap (#105), og et tall som inkluderer
// den ville målt budsjettet framfor det som eventuelt holdes i live.
//
// GULVET, ikke øyeblikksbildet. `heapUsed` bærer søppel som ennå ikke er
// samlet, og svinger mellom to og seks ganger live-settet i den SAMME
// kjøringen. Derfor samles det flere ganger og laveste avlesning tas — samme
// regel som `heapGulv` i `minne-regnskap.ts`.

import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { configurePageCache, resetPageCache } from '../src/lib/page-cache.ts';

/** Bøker × språk gir unike sider uten å måtte gå gjennom hele Bibelen. */
const BØKER = ['1mos', 'sal', 'matt', 'joh', 'rom'];
const SPRÅK = ['nb', 'en', 'de', 'fr', 'es', 'sv', 'fi', 'nn'];
const PER_PASS = Number(process.env.MINNE_PROBE_PASS || 20);
const PASS = Number(process.env.MINNE_PROBE_RUNDER || 3);

function sti(n: number): string {
  const språk = SPRÅK[n % SPRÅK.length]!;
  const bok = BØKER[Math.floor(n / SPRÅK.length) % BØKER.length]!;
  const kapittel = 1 + (Math.floor(n / (SPRÅK.length * BØKER.length)) % 20);
  return `/${språk}/${bok}/${kapittel}`;
}

await initBooks();
resetPageCache();
// Cachen HELT av: ett byte er under enhver sides størrelse, så ingenting
// legges igjen der, og hver eneste forespørsel er en ekte render.
configurePageCache({
  maxTotalBytes: 1,
  maxEntryBytes: 1,
  maxConcurrentRenders: 1000,
  versionCheckMs: 10 ** 9,
});
const app = createApp();

let bytes = 0;
let avvik = 0;
let n = 0;

async function crawl(antall: number): Promise<void> {
  for (let i = 0; i < antall; i++) {
    const res = await app.request(`http://x${sti(n++)}`);
    const kropp = await res.arrayBuffer();
    if (res.status !== 200 || kropp.byteLength < 1000) avvik++;
    bytes += kropp.byteLength;
  }
}

/**
 * Live-settet: laveste heapUsed over flere samlinger, med luft imellom.
 *
 * Én `Bun.gc(true)` er ikke nok, og det er ikke en detalj: JSC frigjør en del
 * objekter forsinket, så en samling uten en tur innom hendelsesløkka etterlot
 * målt 22–50 MB for det samme live-settet. Med pauser imellom lander de fire
 * avlesningene på det samme tallet.
 */
async function gulv(): Promise<number> {
  let lavest = Infinity;
  for (let i = 0; i < 6; i++) {
    Bun.gc(true);
    await Bun.sleep(25);
    lavest = Math.min(lavest, process.memoryUsage().heapUsed);
  }
  return lavest;
}

// Oppvarming: moduler, JIT og alt annet engangsarbeid skal ligge under
// utgangspunktet, ellers måler vi oppstart og ikke vekst.
await crawl(PER_PASS);
const før = await gulv();
const rssFør = process.memoryUsage.rss();

for (let r = 0; r < PASS; r++) await crawl(PER_PASS);
const etter = await gulv();
const mem = process.memoryUsage();

console.log(
  JSON.stringify({
    // Renderne som ble målt (oppvarmingen ikke medregnet).
    render: PER_PASS * PASS,
    oppvarming: PER_PASS,
    // Live-settet før og etter. Vokser det med antall unike sider, holdes noe
    // i live — det er lekkasjen saken beskriver.
    heapFør: før,
    heapEtter: etter,
    // Residenten til sammenlikning: den er tallet cgruppa dreper på, og
    // poenget er at den kan klatre uten at live-settet gjør det.
    rssFør,
    rssEtter: mem.rss,
    bytes,
    avvik,
  }),
);
