// Hvilke bibeloversettelser vi henter TEKST for.
//
// Dette er en bevisst, kort liste — ikke alt som ligger i free-bibles
// `bibles_raw` (82 moduler, de fleste med lisenser vi ikke kan publisere
// under). Lista styrer importen av både verstekst og `bible_editions`, så en
// ny oversettelse i free-bible er usynlig for appen til den står her.
//
// Den bor i `src/lib/` framfor i importskriptet fordi to steder trenger den og
// bare det ene har database: importøren fyller `bible_editions`, mens
// `lib/sitemap-paths.ts` må kjenne de samme utgavene UTEN å slå opp i basen
// (sitemapen bygges uten DB). To lister ville drevet fra hverandre, og
// symptomet ville vært stille — en utgave med infoside som ikke er indeksert.

export const IMPORTED_BIBLES = ['osnb', 'osnn', 'osen', 'sblgnt', 'tanach'] as const;

export type ImportedBible = (typeof IMPORTED_BIBLES)[number];
