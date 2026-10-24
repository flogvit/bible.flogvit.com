/**
 * Vakta for #148: `kvn-mappings.txt` er lista over nummereringer denne flata
 * er bygget for, og den ENESTE deploy-bibel.sh kopierer inn i imaget.
 *
 * Uten lista kopierte deployen hele free-bible/kvn/mappings — over tusen filer
 * etter at .no ble frosset — og `/api/mappings/kvn/all` lastet hver av dem inn
 * i minnet og sendte alle på hver sidelasting. Prosessen lå på ~280 MB for to
 * forespørsler i minuttet og ble OOM-drept to ganger på fire timer.
 *
 * Testene sier to ting: hver nummerering appen VISER (`MAPPING_META`) står i
 * lista, og lista er liten. Den andre er ikke pynt — den feller en endring som
 * legger tilbake «alt i katalogen».
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAPPING_META } from '@free-bible/kvn';

const LISTE = join(import.meta.dir, '..', '..', 'kvn-mappings.txt');

const filer = readFileSync(LISTE, 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

test('hver nummerering appen viser, står i kvn-mappings.txt', () => {
  const mangler = Object.keys(MAPPING_META).filter((id) => !filer.includes(`${id}.ukvn.json`));
  expect(mangler).toEqual([]);
});

test('lista er de nummereringene appen er bygget for, ikke hele katalogen', () => {
  expect(filer.length).toBeLessThanOrEqual(Object.keys(MAPPING_META).length + 5);
  expect(new Set(filer).size).toBe(filer.length);
});
