// Hvilke bibeloversettelser vi henter TEKST for.
//
// Dette er en bevisst, kort liste — ikke alt som ligger i free-bibles
// `bibles_raw` (83 oversettelser, de fleste med lisenser vi ikke kan publisere
// under). Lista styrer importen av både verstekst og `bible_editions`, så en
// ny oversettelse i free-bible er usynlig for appen til den står her.
//
// Den bor i `src/lib/` framfor i importskriptet fordi to steder trenger den og
// bare det ene har database: importøren fyller `bible_editions`, mens
// `lib/sitemap-paths.ts` må kjenne de samme utgavene UTEN å slå opp i basen
// (sitemapen bygges uten DB). To lister ville drevet fra hverandre, og
// symptomet ville vært stille — en utgave med infoside som ikke er indeksert.

export const IMPORTED_BIBLES = [
  'osnb', 'osnn', 'osen', 'oses', 'sblgnt', 'tanach',
  // #170, first group: licence confirmed (#199), KVN verified against the text (#201).
  'kjv', 'web', 'bsb', 'asv', 'luther_1912', 'segond_1910', 'rv_1909',
] as const;

// De som alt er nummerert som osnb, og lagres som de er. Alle andre flyttes til
// osnb-adresser gjennom sin KVN-mapping ved import (edition-import.ts, #200).
// Dette er også våre EGNE utgaver, og de går foran de høstede i språkets
// rekkefølge (readableBibleCandidates): en engelsk leser skal få OSEN, ikke den
// første engelske i alfabetet.
export const OSNB_NUMBERED = ['osnb', 'osnn', 'osen', 'oses', 'sblgnt', 'tanach'] as const;

/** Våre egne oversettelser, som står først for sitt språk. */
export const OWN_EDITIONS = ['osnb', 'osnn', 'osen', 'oses'] as const;

export type ImportedBible = (typeof IMPORTED_BIBLES)[number];

/** The source texts; every other edition is a translation a reader reads. */
export const SOURCE_TEXTS = ['sblgnt', 'tanach'] as const satisfies readonly ImportedBible[];

export const READABLE_BIBLES = IMPORTED_BIBLES.filter(
  (id): id is Exclude<ImportedBible, (typeof SOURCE_TEXTS)[number]> => !(SOURCE_TEXTS as readonly string[]).includes(id),
) as [Exclude<ImportedBible, (typeof SOURCE_TEXTS)[number]>, ...Exclude<ImportedBible, (typeof SOURCE_TEXTS)[number]>[]];

/** What each edition is, in a few English words: the MCP names every edition by it. */
export const EDITION_LABELS: Record<ImportedBible, string> = {
  osnb: 'Norwegian Bokmål',
  osnn: 'Norwegian Nynorsk',
  osen: 'English',
  oses: 'Spanish',
  sblgnt: 'Greek New Testament',
  tanach: 'Hebrew Old Testament',
  kjv: 'King James Version, English',
  web: 'World English Bible',
  bsb: 'Berean Standard Bible, English',
  asv: 'American Standard Version, English',
  luther_1912: 'Luther 1912, German',
  segond_1910: 'Louis Segond 1910, French',
  rv_1909: 'Reina-Valera 1909, Spanish',
};

/** "osnb (Norwegian Bokmål), osnn (Norwegian Nynorsk), …" for the given editions. */
export const editionList = (ids: readonly ImportedBible[]): string => ids.map((id) => `${id} (${EDITION_LABELS[id]})`).join(', ');

/** One sentence naming every edition by kind: our own, the source texts, and the harvested ones. */
export function editionsByKind(): string {
  const own = OWN_EDITIONS as readonly ImportedBible[];
  const harvested = IMPORTED_BIBLES.filter((id) => !own.includes(id) && !(SOURCE_TEXTS as readonly string[]).includes(id));
  return (
    `${editionList(own)} are open CC BY 4.0 translations made by the free-bible project directly from the Hebrew and Greek; ` +
    `${editionList(SOURCE_TEXTS)} are the source texts` +
    (harvested.length ? `; ${editionList(harvested)} are public-domain translations.` : '.')
  );
}
