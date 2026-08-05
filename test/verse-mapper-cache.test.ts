// KVN-mappingene leses ÉN gang per prosess (GitHub #19).
//
// `getAvailableMappings()` kalte `loadUkvnMapping` for hver mapping ved HVERT
// kall — 1158 filer, ~109 MB JSON — og den kalles fra verktøylinja på hver
// kapittelside og fra /innstillinger. En CPU-profil av kapittelrenderen viste
// at 85 % av tiden gikk til readFileSync + JSON.parse i den løkka: ~300 ms av
// ~350 ms, uavhengig av hvor mange vers kapittelet hadde. Etter memoiseringen
// er en kapittelrender ~47 ms.
//
// To krav som trekker i hver sin retning, og som begge må holde:
//   1. Listen bygges én gang (ellers er vi tilbake til 300 ms per sidevisning).
//   2. Filene BLIR IKKE liggende. Gjennom fil-cachen ville alle 1158 blitt
//      værende i minnet (93 MB heap, 409 MB RSS målt) for en liste som bare
//      trenger navn og antall oppføringer.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import {
  getAvailableMappings,
  getKvnMappingData,
  getKvnMappingRaw,
} from '../src/lib/verse-mapper.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

describe('mapping-filene leses én gang', () => {
  test('getAvailableMappings gir SAMME liste tilbake', () => {
    const first = getAvailableMappings();
    expect(getAvailableMappings()).toBe(first);
    expect(first.length).toBeGreaterThan(0);
  });

  test('andre kall er praktisk talt gratis', () => {
    getAvailableMappings(); // varm
    const t = performance.now();
    for (let i = 0; i < 50; i++) getAvailableMappings();
    // Ett eneste ucachet gjennomløp tar ~300 ms; 50 cachede tar under ett.
    expect(performance.now() - t).toBeLessThan(50);
  });

  test('getKvnMappingRaw gir samme objekt for samme id', () => {
    expect(getKvnMappingRaw('osnb')).toBe(getKvnMappingRaw('osnb'));
  });

  test('getKvnMappingData bygges én gang per id', () => {
    const first = getKvnMappingData('dnb2024');
    expect(first).not.toBeNull();
    expect(getKvnMappingData('dnb2024')).toBe(first);
    expect(Object.keys(first!.verseMap).length).toBeGreaterThan(0);
  });

  test('ukjent mapping gir null', () => {
    expect(getKvnMappingData('finnes-ikke')).toBeNull();
  });

  // Strukturell vakt: kalles `loadUkvnMapping` fra et NYTT sted, er 300 ms per
  // sidevisning tilbake uten at noen test over blir rød — de sjekker bare
  // stedene som allerede går gjennom cachen.
  test('loadUkvnMapping kalles bare fra fil-cachen og listebyggingen', async () => {
    const src = await Bun.file('src/lib/verse-mapper.ts').text();
    const calls = [...src.matchAll(/^(?!\s*(?:\/\/|\*)).*\bloadUkvnMapping\(/gm)].map((m) =>
      m[0].trim(),
    );
    // Nøyaktig to: mappingFile() (cachen) og getAvailableMappings() (bevisst
    // ucachet, se kommentaren der). Import-linja treffer ikke `(`.
    expect(calls.length).toBe(2);
  });
});
