// HVILKEN KODE KJØRER FANEN? (flogvit-com#339, portal/VERSJON.md)
//
// En fane som står åpen etter en deploy kjører klientkoden vi har erstattet, og
// ingen sa fra. Siden bærer id-en den ble rendret fra (`<meta name="fv-versjon">`
// i layout), `/versjon.json` svarer id-en som serveres nå, og
// `public/js/ny-versjon.js` (portalens kopi) viser linja når de er ulike.
//
// Id-en er en hash av det NETTLESEREN kjører — ikke av prosessen. En restart
// med samme kode gir samme id, og en deploy som bare endrer serverkode ber
// ingen laste på nytt. Hele katalogene hashes, ikke bare inngangspunktene
// layout skriver ut: modulene importerer hverandre (`./locale.js`, `./dom.js`
// …) uten `?v=`, så en endring i én av dem er like mye en ny versjon.
// `sw.js` er med fordi service workeren også er klientkode.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Repo-roten — der `public/` ligger, uansett hvor prosessen startet. */
const ROOT = resolve(import.meta.dir, '../..');

/** Det som rulles ut til nettleseren. En katalog tas med i sin helhet. */
export const WATCHED = ['public/js', 'public/css', 'public/styles.css', 'public/sw.js'] as const;

/** Filene under en sti, sortert — en fil er seg selv. */
function filesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { recursive: true, encoding: 'utf8' })
    .map((name) => join(path, name))
    .filter((p) => statSync(p).isFile())
    .sort();
}

/**
 * Id-en for `entries` under `root`. Hver fil bidrar med stien OG innholdet, så
 * en omdøpt fil er en ny versjon. En sti som mangler (et `bun test` i en utsjekk
 * uten den) hashes som navnet sitt: id-en blir stabil, aldri tilfeldig.
 */
export function computeBuildId(root: string = ROOT, entries: readonly string[] = WATCHED): string {
  const hash = createHash('sha256');
  for (const entry of entries) {
    let files: string[];
    try {
      files = filesUnder(join(root, entry));
    } catch {
      hash.update(entry);
      continue;
    }
    for (const file of files) {
      hash.update(relative(root, file));
      try {
        hash.update(readFileSync(file));
      } catch {
        // Forsvant mellom listingen og lesingen — navnet alene, som over.
      }
    }
  }
  return hash.digest('hex').slice(0, 12);
}

let cached: string | null = null;

/**
 * Lest én gang, ved første spørsmål. Filene er bygget inn i imaget og kan ikke
 * endre seg under en kjørende prosess, og hver sidevisning spør.
 */
export function buildId(): string {
  if (cached === null) cached = computeBuildId();
  return cached;
}
