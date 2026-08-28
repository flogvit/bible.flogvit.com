// Lista over versnummereringer skal ikke koste 54 MB å bygge (#106).
//
// bible.flogvit.com ble OOM-drept hvert ~20. minutt av sitt eget 288 MiB-tak,
// og «grunnlast rett etter start er 162 MB» sto i saken som noe som ikke var
// undersøkt. Målt herfra: 54 MB av de 162 er ÉN funksjon.
//
// `getAvailableMappings()` bygger nedtrekket «Versnummerering» i verktøylinja
// på hver kapittelside og på /innstillinger. Den leste ALLE 1158 vendrede
// mappingfilene — ~109 MB JSON — og hentet ut tre felter per fil. Filene
// slippes igjen med en gang, og heapen viser da ingenting galt; men RSS gjør
// det, og RSS er tallet cgroup-en teller når den bestemmer seg for å drepe
// containeren. Høyvannsmerket fra 109 MB churn gis aldri tilbake til OS-et.
//
// Vaktene er formulert på UTFALLET — hva lista KOSTER og at den fortsatt er
// komplett — ikke på hvordan den bygges. En fiks som løser det på en annen måte
// (et generert manifest, en strøm, en annen loader) består like gjerne, så
// lenge alle 1158 fortsatt er der med navnet sitt.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { MAPPING_META } from '@free-bible/kvn';
import { createApp } from '../src/app.ts';
import { getAvailableMappings, listMappingIds } from '../src/lib/verse-mapper.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const MB = 1024 * 1024;

/**
 * Taket for hva det får koste å bygge lista, PERMANENT, i RSS.
 *
 * Målt før fiksen: 54,1 MB. Etter: under 1 MB. Taket ligger mellom, med god
 * klaring til begge sider — det skal ikke kunne flakke på en travel maskin, og
 * det skal ikke kunne bestås av en fiks som bare halverer kostnaden.
 */
const TAK_BYTES = 16 * MB;

/**
 * Og en tid: 109 MB JSON kan ikke leses og parses på under et kvart sekund.
 * Kostnaden lå på den FØRSTE kapittelrenderen etter hver restart — altså på en
 * leser, hver eneste gang containeren hadde startet på nytt.
 */
const TAK_MS = 250;

interface Måling {
  vekst: number;
  ms: number;
  oppforinger: number;
  ider: number;
}

let cachetMåling: Promise<Måling> | null = null;

/**
 * Minnet måles i et EGET PROGRAM (#104, #105): `bun test` deler prosess, og
 * lista er dessuten memoisert — den kan bare bygges én gang per prosess.
 */
function måling(): Promise<Måling> {
  return (cachetMåling ??= (async () => {
    // `Bun.fileURLToPath` framfor `.pathname`: arbeidstrærne bor under
    // `.flogvit-orkester/trær/`, og en prosentkodet cwd gir ENOENT på «bun».
    const rot = Bun.fileURLToPath(new URL('..', import.meta.url));
    const proc = Bun.spawn(['bun', 'test/mapping-list-memory-probe.ts'], {
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

describe('versnummerering-lista koster ikke minne (#106)', () => {
  test('MINNET: å bygge lista hever ikke RSS permanent', async () => {
    const m = await måling();

    // Forutsetningen: lista må faktisk ha blitt bygget, og komplett. Uten
    // dette ville «returner en tom liste» vært den billigste fiksen som finnes.
    expect(m.ider).toBeGreaterThan(1000);
    expect(m.oppforinger).toBe(m.ider);

    expect(m.vekst).toBeLessThan(TAK_BYTES);
    expect(m.ms).toBeLessThan(TAK_MS);
  }, 180_000);

  test('ALT SKAL MED: hver eneste mapping i katalogen står i lista', () => {
    // Sannheten er KATALOGEN, ikke en liste noen har ført opp: en ny vendret
    // mappingfil skal dukke opp av seg selv, som før.
    expect(getAvailableMappings().map((m) => m.id)).toEqual(listMappingIds());
  });

  test('NAVNET: de navngitte utgavene beholder sitt, resten heter id-en sin', () => {
    const liste = getAvailableMappings();
    const etter = new Map(liste.map((m) => [m.id, m]));

    // De 13 med et menneskelig navn er ikke tapt i fiksen.
    for (const [id, meta] of Object.entries(MAPPING_META)) {
      expect(etter.get(id)?.displayName).toBe(meta.displayName);
      expect(etter.get(id)?.shortname).toBe(meta.shortname);
    }

    // Ingen oppføring får et tomt navn — nedtrekket rendrer displayName rått,
    // og en tom `<option>` er en rad leseren ikke kan velge fra.
    for (const m of liste) expect(m.displayName.length).toBeGreaterThan(0);
  });

  test('DATA: filens eget `name` er id-en — for hver av dem, ikke for et utvalg', async () => {
    // Dette er PÅSTANDEN fiksen hviler på: navnet som lå i fila, og som kostet
    // 109 MB å hente, er den samme strengen som filnavnet allerede ga oss.
    // Skulle free-bible en dag sende en fil der de to er forskjellige, blir
    // denne rød, og avgjørelsen tas på nytt framfor at et navn stille byttes ut.
    //
    // Bare HODET av hver fil leses (400 byte × 1158 ≈ 0,5 MB), ellers ville
    // vakta kostet nettopp det den er skrevet for å fjerne.
    const dir = Bun.fileURLToPath(new URL('../kvn-package/mappings/', import.meta.url));
    const ider = listMappingIds();
    expect(ider.length).toBeGreaterThan(1000);

    const avvik: string[] = [];
    for (const id of ider) {
      const hode = await Bun.file(`${dir}${id}.ukvn.json`).slice(0, 400).text();
      const navn = /"name"\s*:\s*"([^"]*)"/.exec(hode)?.[1];
      if (navn !== id) avvik.push(`${id} -> ${navn ?? '(ikke funnet i hodet)'}`);
    }
    expect(avvik).toEqual([]);
  }, 180_000);

  test('FLATA: API-et og kapittelsida deler fortsatt ut hele lista', async () => {
    const app = createApp();
    const ider = listMappingIds();

    // Klienten (`public/js/translations.js`) leser `id` og
    // `displayName || name`. Ruta er den ene flata som ser HELE oppføringen,
    // så det er her en felt-endring kan gå stille galt.
    const res = await app.request('http://x/api/mappings/kvn');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mappings: { id: string; name: string; displayName: string }[] };
    expect(data.mappings.map((m) => m.id)).toEqual(ider);
    for (const m of data.mappings) {
      expect((m.displayName || m.name).length).toBeGreaterThan(0);
    }

    // Og nedtrekket på kapittelsida: lista er bygget FOR den, så en liste som
    // ikke lenger når leseren er ingen fiks.
    const side = await app.request('http://x/nb/1mos/1');
    expect(side.status).toBe(200);
    const html = await side.text();
    const select = /<select[^>]*data-mapping-select[\s\S]*?<\/select>/.exec(html)?.[0];
    expect(select).toBeDefined();
    expect([...select!.matchAll(/<option\b/g)].length).toBe(ider.length);
  }, 180_000);
});
