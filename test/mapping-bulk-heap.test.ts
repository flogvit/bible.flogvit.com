// ET SVAR SOM ER STØRRE ENN HEAPEN VÅR MÅ BYGGES STYKKEVIS (#104)
//
// `/api/mappings/kvn/all` deler ut alle 1158 KVN-mappingfilene — 73 MB JSON.
// Bygget som ett objekt tok den ene anonyme forespørselen prosessen fra 1 MB
// til 305 MB topp-heap og 1057 MB RSS, og la ALLE filene permanent i
// fil-cachen. I en container med et minnetak er det ordrett signaturen saken
// er meldt på:
//
//     FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
//
// Prisen er ikke et dårlig svar til én klient — det er HELE appen for alle
// lesere, til containeren er oppe igjen. Ruta ligger dessuten under `/api/`,
// altså utenfor lastvernet (`page-cache.ts`), så to samtidige kall er to ganger
// så mye, og ingenting avviser dem.
//
// Vakta er formulert på UTFALLET, ikke på at det ble en `ReadableStream`: den
// måler hva forespørselen KOSTER, og krever samtidig at svaret fortsatt bærer
// alt det bar før. En fiks som løser det på en annen måte består like gjerne —
// men en som «løser» det ved å dele ut mindre, stryker.
//
// Målingen kjøres som et EKTE UNDERPROSESS (`mapping-bulk-probe.ts`), og det er
// ikke pynt: `bun test` kjører alle testfilene i samme prosess, så et minnetall
// målt her inne er summen av alt som har kjørt før — et tak på det ville vært
// et tak på suiten, ikke på ruta.

import { describe, expect, test } from 'bun:test';

// `.pathname` er PROSENTKODET: i et arbeidstre under `trær/` blir katalogen
// `tr%C3%A6r`, og `Bun.spawn` melder da ENOENT på «bun» framfor på cwd-en.
const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));

/**
 * Takene, med de MÅLTE tallene ved siden av (MB):
 *
 *                     før fiksen      etter
 *   topp heap             305           52
 *   heap etter GC          88           36
 *   RSS                  1057          169
 *
 * Takene ligger midt imellom, ikke like over det grønne: tallene er avhengige
 * av når GC-en velger å gå, og en vakt som er rød av en travel maskin blir
 * skrudd av. Forskjellen på de to tilstandene er 6× og 20×, så det er god plass
 * til begge deler.
 */
const TAK = { toppHeapMB: 150, heapEtterGcMB: 60, rssMB: 450 };

/** Ruta målingen går på. */
const MÅLT = 'GET /kvn/all';

/**
 * Rutene under `/api/mappings` som IKKE måles, med grunnen.
 *
 * Halvdelen finnes for at en NY bulk-rute ikke skal kunne legges til i
 * stillhet: da er den hverken målt eller ført opp her, og vakta blir rød uten
 * at noen har tenkt på det. Samme grep som `IKKE_MÅLT` i
 * `hreflang-detail-pages.test.ts` (#45).
 */
const IKKE_MÅLT: Record<string, string> = {
  'GET /': 'listen fra databasen — noen titalls rader, ingen mapping-filer',
  'GET /kvn': 'navn og antall per mapping, memoisert én gang per prosess (#19)',
  'GET /kvn/:id': 'ÉN mapping; bare de 14 som resolver, og de caches med vilje',
  'GET /:id': 'én rad fra databasen',
};

interface Måling {
  ruter: string[];
  status: number;
  contentType: string | null;
  bytes: number;
  første: string;
  siste: string;
  forventetAntall: number;
  manglerIder: string[];
  nålId: string;
  nålFunnet: boolean;
  heapFørMB: number;
  heapToppMB: number;
  heapEtterMB: number;
  heapEtterGcMB: number;
  rssFørMB: number;
  rssEtterMB: number;
}

const proc = Bun.spawn(['bun', 'test/mapping-bulk-probe.ts'], {
  cwd: ROOT,
  stdout: 'pipe',
  stderr: 'pipe',
});
const [ut, feil] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
]);
const kode = await proc.exited;
const linje = ut.split('\n').find((l) => l.startsWith('MÅLING '));
if (!linje) throw new Error(`Måleprogrammet ga ingen måling (exit ${kode}):\n${ut}\n${feil}`);
const m = JSON.parse(linje.slice('MÅLING '.length)) as Måling;

describe('bulk-mappingene bygges stykkevis (#104)', () => {
  // MINNET: det saken faktisk handler om.
  test('én forespørsel tar ikke prosessen over minnetaket', () => {
    expect(m.status).toBe(200);
    expect(m.heapToppMB).toBeLessThan(TAK.toppHeapMB);
    expect(m.rssEtterMB).toBeLessThan(TAK.rssMB);
  });

  // RETENSJONEN: filene skal ikke bli LIGGENDE etterpå. Uten denne ville en
  // fiks som strømmet svaret, men fortsatt la hver fil i cachen på veien,
  // bestått — og prosessen ville dødd på neste forespørsel i stedet.
  test('filene blir ikke liggende i minnet etterpå', () => {
    expect(m.heapEtterGcMB).toBeLessThan(TAK.heapEtterGcMB);
  });

  // ALT SKAL MED: uten denne ville «svar {} » vært den billigste fiksen.
  test('svaret bærer fortsatt alle mappingene, med innholdet i behold', () => {
    expect(m.forventetAntall).toBeGreaterThan(1000);
    expect(m.manglerIder).toEqual([]);
    expect(m.nålFunnet).toBe(true);
    expect(m.bytes).toBeGreaterThan(50_000_000);
    expect(m.contentType).toContain('application/json');
  });

  test('svaret er gyldig JSON fra ende til ende', () => {
    expect(m.første).toBe('{');
    expect(m.siste).toBe('}');
  });

  // FORMEN: en ny rute under `/api/mappings` må klassifiseres.
  test('hver rute er enten målt eller ført opp med en grunn', () => {
    const uklassifiserte = m.ruter.filter((r) => r !== MÅLT && !(r in IKKE_MÅLT));
    expect(uklassifiserte).toEqual([]);
  });

  test('rutene som er ført opp finnes fortsatt', () => {
    const døde = Object.keys(IKKE_MÅLT).filter((r) => !m.ruter.includes(r));
    expect(døde).toEqual([]);
    expect(m.ruter).toContain(MÅLT);
  });
});
