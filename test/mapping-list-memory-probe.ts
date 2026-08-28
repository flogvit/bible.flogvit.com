// Måleprogrammet for `mapping-list-memory.test.ts` (#106).
//
// Eget PROGRAM av samme grunn som `mapping-bulk-probe.ts` (#104) og
// `page-cache-memory-probe.ts` (#105): `bun test` kjører alle testfilene i
// samme prosess, så et minnetall målt der inne er summen av alt som har kjørt
// før — og `getAvailableMappings()` er dessuten memoisert, altså målbar
// nøyaktig ÉN gang i en prosess.
//
// Måleenheten er RSS, ikke heapUsed. Det er RSS cgroup-en teller når den
// bestemmer seg for å OOM-drepe containeren, og det er nettopp forskjellen som
// er defekten: 1158 filer × ~94 kB JSON churnes gjennom allokatoren, heapen
// slipper dem igjen, men høyvannsmerket i RSS gis aldri tilbake til OS-et.
// En måling på heapUsed ville sagt at alt var i orden.

export {};

const { getAvailableMappings, listMappingIds } = await import('../src/lib/verse-mapper.ts');

// Varm opp alt som IKKE er selve listebyggingen: modulgrafen er lastet, og
// katalogen er lest én gang. Ellers ville importens egen kostnad ligget i
// tallet vi måler.
const ider = listMappingIds();

Bun.gc(true);
Bun.gc(true);
const før = process.memoryUsage.rss();

const t0 = performance.now();
const liste = getAvailableMappings();
const ms = performance.now() - t0;

Bun.gc(true);
Bun.gc(true);
const etter = process.memoryUsage.rss();

console.log(
  JSON.stringify({
    vekst: etter - før,
    før,
    etter,
    ms,
    oppforinger: liste.length,
    ider: ider.length,
  }),
);
