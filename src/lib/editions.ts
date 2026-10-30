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

export const IMPORTED_BIBLES = ['osnb', 'osnn', 'osen', 'sblgnt', 'tanach'] as const;

// De som alt er nummerert som osnb, og lagres som de er. Alle andre flyttes til
// osnb-adresser gjennom sin KVN-mapping ved import (edition-import.ts, #200).
// Dette er også våre EGNE utgaver, og de går foran de høstede i språkets
// rekkefølge (readableBibleCandidates): en engelsk leser skal få OSEN, ikke den
// første engelske i alfabetet.
export const OSNB_NUMBERED = ['osnb', 'osnn', 'osen', 'sblgnt', 'tanach'] as const;

/** Våre egne oversettelser, som står først for sitt språk. */
export const OWN_EDITIONS = ['osnb', 'osnn', 'osen', 'oses'] as const;
