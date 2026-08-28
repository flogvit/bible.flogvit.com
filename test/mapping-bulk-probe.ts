// Måleprogrammet bak `mapping-bulk-heap.test.ts` (#104).
//
// Det er et EGET PROGRAM med vilje: `bun test` kjører alle testfilene i SAMME
// prosess, og et minnetall målt der er summen av alt som har kjørt før — altså
// ikke et tall noen kan sette et tak på. Her er prosessen tom bortsett fra
// appen, så tallet er det forespørselen faktisk kostet.
//
// To gjennomløp, og det skillet er ikke pynt: MÅLINGEN kaster hver bit med en
// gang, ellers måler vakta sin egen scanning framfor appen (første utgave
// leste 245 MB — 200 av dem var vindusstrengene i INNHOLD-løpet under).
//
// Skriver én linje JSON på stdout, prefikset `MÅLING `.

import { createApp } from '../src/app.ts';
import { listMappingIds, loadRawMappingUncached } from '../src/lib/verse-mapper.ts';
import mappingsRoutes from '../src/routes/api/mappings.ts';

const RUTE = '/api/mappings/kvn/all';
const MB = (n: number) => Math.round(n / 1048576);

const app = createApp();
const ids = listMappingIds();

// --- 1. MÅLINGEN: hent hele svaret, behold ingenting -------------------------
Bun.gc(true);
const før = process.memoryUsage();

const res = await app.request(RUTE);
const leser = res.body!.getReader();
let bytes = 0;
let toppHeap = 0;
for (;;) {
  const { done, value } = await leser.read();
  if (done) break;
  bytes += value.length;
  const h = process.memoryUsage().heapUsed;
  if (h > toppHeap) toppHeap = h;
}

const etter = process.memoryUsage();
Bun.gc(true);
const etterGc = process.memoryUsage();

// --- 2. INNHOLDET: er alt fortsatt med, og er det det samme? -----------------
//
// Nålen er den MINSTE mappingen blant de første tjue — en hel fil, ordrett, så
// «alt skal med» måles på innholdet og ikke bare på en nøkkel. Liten med vilje:
// vinduet under må romme den, og et 600 kB vindu ville gjort vakta til det
// tyngste i suiten.
let nålId = ids[0]!;
let nål = JSON.stringify(loadRawMappingUncached(nålId));
for (const id of ids.slice(1, 20)) {
  const json = JSON.stringify(loadRawMappingUncached(id));
  if (json.length < nål.length) {
    nålId = id;
    nål = json;
  }
}

const res2 = await app.request(RUTE);
const leser2 = res2.body!.getReader();
const dekoder = new TextDecoder();
const sett = new Set<string>();
let nålFunnet = false;
let første = '';
let siste = '';
// En id — eller nålen — kan være delt av et bitskille, så halen bæres med.
const HALE = nål.length;
let rest = '';
for (;;) {
  const { done, value } = await leser2.read();
  if (done) break;
  const tekst = dekoder.decode(value, { stream: true });
  if (!første && tekst) første = tekst.slice(0, 1);
  if (tekst) siste = tekst.slice(-1);
  const vindu = rest + tekst;
  for (const m of vindu.matchAll(/[{,]"([^"]+)":\{/g)) sett.add(m[1]!);
  if (!nålFunnet && vindu.includes(nål)) nålFunnet = true;
  rest = vindu.slice(-HALE);
}

console.log(
  'MÅLING ' +
    JSON.stringify({
      ruter: mappingsRoutes.routes.map((r) => `${r.method} ${r.path}`),
      status: res.status,
      contentType: res.headers.get('content-type'),
      bytes,
      første,
      siste,
      forventetAntall: ids.length,
      // Sveipen kjenner ikke JSON-dybde, så et nestet objekt inne i en fil kan
      // også treffe mønsteret. Den brukes derfor bare til å påvise at NOE
      // mangler — aldri til å telle.
      manglerIder: ids.filter((id) => !sett.has(id)).slice(0, 5),
      nålId,
      nålFunnet,
      heapFørMB: MB(før.heapUsed),
      heapToppMB: MB(toppHeap),
      heapEtterMB: MB(etter.heapUsed),
      heapEtterGcMB: MB(etterGc.heapUsed),
      rssFørMB: MB(før.rss),
      rssEtterMB: MB(etter.rss),
    }),
);
