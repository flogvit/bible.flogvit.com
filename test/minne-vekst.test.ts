// VOKSER DET FORDI VI HOLDER PÅ NOE? (#110)
//
// Saken meldte 111 → 228 MB anonymt minne på sju timer og leste kurven som en
// lekkasje: «to tredeler ligger i én region … formen en voksende heap har, ikke
// formen fragmentering har». Den navnga selv målingen som avgjør — «vokser den
// ene store regionen, eller vokser ANTALLET kartlegginger?» — og la den i
// server-repoet, altså bak ssh og `memory.stat`, der ingen vakt og ingen test
// kan nå den.
//
// Den målingen hører hjemme her, og den er billig: LIVE-SETTET, målt fra
// innsiden, mot antall UNIKE kapittelrender. Vokser live-settet med renderne,
// holdes noe i live og cache-sporet er riktig. Står det stille mens `rss`
// klatrer, er det allokatoren som ikke gir tilbake — og da er ingen av cachene
// skyldig, uansett hvor godt hypotesen leste.
//
// MÅLT HER, 2026-08-31, med mikrocachen skrudd av (den har alt et tak, #105):
//
//    60 unike render   live-sett  8,1 → 10,0 MB     rss +48 MB
//   120 unike render   live-sett  8,1 →  8,6 MB     rss +15 MB
//   240 unike render   live-sett  8,1 →  9,1 MB     rss +75 MB
//
// Live-settet skalerer ikke med renderne — det står på ~8–10 MB uansett — mens
// residenten klatrer i sprang. Det er ikke en lekkasje, og de fire mapping-
// cachene saken mistenkte kan per konstruksjon ikke være den heller: hver
// eneste vei inn til dem går gjennom `resolveMappingId()`, som svarer på 14 av
// de 1158 filene i katalogen. En crawler som går nedtrekket ovenfra og ned
// legger derfor ikke igjen én eneste oppføring.
//
// Vakta er de to påstandene, i den formen som blir RØD hvis noen av dem
// slutter å holde: en fiks som begynner å cache på en RÅ id, eller en render
// som legger igjen noen kilobyte per side.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { configurePageCache, resetPageCache } from '../src/lib/page-cache.ts';
import { minneRegnskap, settHeapleser } from '../src/lib/minne-regnskap.ts';
import { listMappingIds, resolveMappingId } from '../src/lib/verse-mapper.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

// `createApp()` når `src/lib/db.ts` (#74).
setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Filen skrur på lastvernets knapper, og `bun test` deler prosess (#72).
afterAll(resetPageCache);
// Samme grunn, for den injiserte heap-avlesningen: ryker en test midtveis, skal
// ikke resten av suiten måle mot et tall denne filen fant på.
afterAll(() => settHeapleser(null));

const MB = 1024 * 1024;

/**
 * Hvor mye live-settet får vokse over målingens render.
 *
 * Målt 0,55–1,9 MB, og tallet flytter seg IKKE med antall render — det er
 * moduler og JIT fra sider oppvarmingen ikke rakk. Taket ligger godt over det
 * og godt under enhver ekte retensjon: den letteste kapittelsida vi måler er
 * 140 kB, så selv én beholdt side per tiende render ville sprengt det.
 */
const TAK_VEKST = 4 * MB;

interface Måling {
  render: number;
  oppvarming: number;
  heapFør: number;
  heapEtter: number;
  rssFør: number;
  rssEtter: number;
  bytes: number;
  avvik: number;
}

let cachetMåling: Promise<Måling> | null = null;

/**
 * Minnet måles i et EGET PROGRAM (#104, #105, #106): `bun test` kjører alle
 * filene i samme prosess, så et tall målt her inne er summen av alt som har
 * kjørt før — et tak på det ville vært et tak på suiten, ikke på appen.
 */
function måling(): Promise<Måling> {
  return (cachetMåling ??= (async () => {
    // `Bun.fileURLToPath` framfor `.pathname`: arbeidstrærne bor under
    // `.flogvit-orkester/trær/`, og en prosentkodet cwd gir ENOENT på «bun».
    const rot = Bun.fileURLToPath(new URL('..', import.meta.url));
    const proc = Bun.spawn(['bun', 'test/minne-vekst-probe.ts'], {
      cwd: rot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, MINNE_PROBE_PASS: '20', MINNE_PROBE_RUNDER: '12' },
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

describe('LIVE-SETTET vokser ikke med antall render (#110)', () => {
  test('240 unike kapittelrender legger ikke igjen minne', async () => {
    const m = await måling();

    // INGEN STILLE SKIP. En måling der sidene 404-et, eller der det ikke ble
    // rendret noe i det hele tatt, ville bestått taket med glans og målt
    // ingenting — nøyaktig den formen «grønt av stillhet» har.
    expect(m.avvik, 'hver måleside skal ha svart 200 med en ekte kropp').toBe(0);
    expect(m.render).toBeGreaterThanOrEqual(200);
    expect(m.bytes, 'renderne skal ha produsert ekte sider').toBeGreaterThan(50 * MB);
    expect(m.heapFør).toBeGreaterThan(0);

    expect(
      m.heapEtter - m.heapFør,
      `live-settet vokste ${((m.heapEtter - m.heapFør) / MB).toFixed(1)} MB over ${m.render} unike render ` +
        `(rss ${((m.rssEtter - m.rssFør) / MB).toFixed(1)} MB) — da holdes noe i live`,
    ).toBeLessThan(TAK_VEKST);
  }, 300_000);
});

describe('HYPOTESEN: mapping-cachene kan ikke vokse med det en klient sender', () => {
  /** De fire ubundne cachene saken pekte på. */
  const CACHER = [
    'verse-mapper/mappingFiles',
    'verse-mapper/mappers',
    'verse-mapper/crossMappers',
    'verse-mapper/mappingData',
  ] as const;

  const oppforinger = () => {
    const k = minneRegnskap().kilder;
    return Object.fromEntries(CACHER.map((n) => [n, k[n]!.oppforinger]));
  };

  /** Id-er katalogen HAR en fil for, men som ingen kan slå opp. */
  const uoppløselige = listMappingIds().filter((id) => !resolveMappingId(id));

  test('katalogen er mye større enn det som lar seg slå opp', () => {
    // Uten dette måler halvdelene under ingenting: er alt oppløselig, finnes
    // det ingen id å sende som IKKE skal legge igjen noe.
    expect(listMappingIds().length).toBeGreaterThan(1000);
    expect(uoppløselige.length).toBeGreaterThan(1000);
  });

  test('en crawler som går nedtrekket ovenfra og ned legger ikke igjen noe', async () => {
    resetPageCache();
    // Cachen av: hver forespørsel skal være en ekte render, og de unike
    // query-strengene skal ikke fylle en cache denne testen ikke måler.
    configurePageCache({ maxTotalBytes: 1, maxEntryBytes: 1, maxConcurrentRenders: 100 });
    const app = createApp();

    const før = oppforinger();
    for (const id of uoppløselige.slice(0, 40)) {
      const side = await app.request(`http://x/nb/sal/1?mapping=${encodeURIComponent(id)}`);
      expect(side.status, `nedtrekksvalget «${id}» skal fortsatt gi en side`).toBe(200);
      await side.arrayBuffer();
      const api = await app.request(`http://x/api/chapter?book=19&chapter=1&mapping=${encodeURIComponent(id)}`);
      await api.arrayBuffer();
    }
    expect(oppforinger(), 'en id ingen kan slå opp skal ikke få en plass i noen cache').toEqual(før);
    resetPageCache();
  }, 300_000);

  test('men en id som VIRKELIG finnes lastes fortsatt', async () => {
    // Ellers ville «cache aldri noe» bestått halvdelen over, og da måler den
    // at funksjonen er ødelagt framfor at den er bundet.
    resetPageCache();
    configurePageCache({ maxTotalBytes: 1, maxEntryBytes: 1, maxConcurrentRenders: 100 });
    const app = createApp();

    const id = listMappingIds().find((i) => resolveMappingId(i) && i !== 'osnb')!;
    expect(id).toBeDefined();
    const res = await app.request(`http://x/nb/sal/1?mapping=${encodeURIComponent(id)}`);
    expect(res.status).toBe(200);
    await res.arrayBuffer();

    expect(oppforinger()['verse-mapper/mappingFiles']).toBeGreaterThan(0);
    resetPageCache();
  }, 300_000);

  test('taket er ANTALL OPPLØSELIGE, uansett hva som er sendt inn', () => {
    // Formulert på regelen og ikke på tallet 14: en ny navngitt utgave i
    // free-bible hever taket av seg selv, mens en cache som begynner å ta imot
    // en rå id blir rød.
    const tak = new Set(listMappingIds().map((i) => resolveMappingId(i)).filter(Boolean)).size;
    for (const [navn, n] of Object.entries(oppforinger())) {
      expect(n, `${navn} har flere oppføringer enn det finnes id-er å slå opp`).toBeLessThanOrEqual(tak);
    }
  });
});

describe('GULVET er kolonnen som avgjør, og /api/minne gir den ut', () => {
  test('heapGulv er det LAVESTE av avlesningene, aldri det siste', () => {
    // Regelen måles mot en injisert avlesning: den skal kunne motsies uten å
    // vente på at en GC tilfeldigvis inntreffer.
    const tall = [40, 25, 60, 25, 90];
    let i = 0;
    settHeapleser(() => tall[i++]!);

    expect(minneRegnskap().heapGulv).toBe(40);
    expect(minneRegnskap().heapGulv).toBe(25);
    const tredje = minneRegnskap();
    expect(tredje.heap, 'heap skal være avlesningen NÅ').toBe(60);
    expect(tredje.heapGulv, 'gulvet skal ikke stige').toBe(25);
    expect(minneRegnskap().heapGulv).toBe(25);
    expect(minneRegnskap().heapGulv).toBe(25);

    settHeapleser(null);
  });

  test('gulvet følger heapen NED — ellers er det en konstant, ikke en måling', () => {
    let v = 100;
    settHeapleser(() => v);
    expect(minneRegnskap().heapGulv).toBe(100);
    v = 30;
    expect(minneRegnskap().heapGulv).toBe(30);
    settHeapleser(null);
  });

  test('/api/minne bærer heap og heapGulv ved siden av rss', async () => {
    const res = await createApp().request('/api/minne');
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReturnType<typeof minneRegnskap>;
    expect(json.rss).toBeGreaterThan(0);
    expect(json.heap, 'uten JS-heapen kan ingen skille en lekkasje fra allokatoren').toBeGreaterThan(0);
    expect(json.heapGulv).toBeGreaterThan(0);
    expect(json.heapGulv).toBeLessThanOrEqual(json.heap);
  });
});
