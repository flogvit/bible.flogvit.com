// Hvilke bibeloversettelser vi henter TEKST for.
//
// Dette er en bevisst, kort liste — ikke alt som ligger i free-bibles
// `bibles_raw` (83 oversettelser, de fleste med lisenser vi ikke kan publisere
// under). Lista styrer importen av både verstekst og `bible_editions`, så en
// ny oversettelse i free-bible er usynlig for appen til den står her.
//
// Den bor i `src/lib/` framfor i importskriptet fordi appen også trenger den
// (utgavevalget, rekkefølgen). Sitemapen gjør IKKE: den følger `bible_editions`,
// fordi koden ruller ut før dataene og lista da lover sider som ikke finnes
// ennå (#229).

export const IMPORTED_BIBLES = [
  'osnb', 'osnn', 'osen', 'oses', 'sblgnt', 'tanach',
  // #170, first group: licence confirmed (#199), KVN verified against the text (#201).
  'kjv', 'web', 'bsb', 'asv', 'luther_1912', 'segond_1910', 'rv_1909',
  // #170, second group (#216): the same two answers from free-bible.
  'akjv', 'albanian', 'bungo', 'cadman', 'chinese_union_simp', 'chinese_union_trad',
  // #170, third group, first half (#220).
  'cpdv', 'dbt', 'diodati', 'drb', 'elberfelder_1905',
  // #220, second half: text read again with its notes in footnotes (free-bible#147).
  'elberfelder_1871',
  // #220: text read again from CrossWire's Norsk (free-bible#146).
  'dnb30',
  // #170, fourth group (#221).
  'erv', 'finn', 'geneva', 'hcv', 'he_modern', 'jps',
  // #170, fifth group (#222).
  'kougo', 'lv_gluck_8', 'martin', 'opt', 'rv_1858', 'sagradas',
  // #170, sixth group (#223).
  'slt', 'swahili', 'synodal', 'tagab', 'wbt',
  // #170, seventh group (#224); the CC BY-SA ones carry their credits.
  'weymouth', 'ylt', 'bn_irv', 'gu_irv', 'irv', 'ha_con', 'ha_lit',
  // #170, eighth group (#225), CC BY-SA with credits.
  'kn_irv', 'mr_irv', 'pa_irv', 'ta_irv', 'te_irv',
  // #220: its own verse division in the Psalms aligned to kjv by text (free-bible#150).
  'coverdale',
  // #223: offered only on the chapters it has (#238): Gen-Deut, Jonah, the NT.
  'tyndale',
  // #223: text repaired from eBible's arb-vd (free-bible#154); right to left.
  'svd',
  // #222: text read again from CrossWire's BurJudson (free-bible#152).
  'my_judson',
  // #202: the source texts as editions of their own (the owner's choice 18.11),
  // and the first edition with Strong's numbers beside the words.
  'hebrew', 'wlc', 'tr', 'asvs',
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
export const SOURCE_TEXTS = ['sblgnt', 'tanach', 'hebrew', 'wlc', 'tr'] as const satisfies readonly ImportedBible[];

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
  akjv: 'American King James Version, English',
  albanian: 'Albanian Bible',
  bungo: 'Bungo-yaku, classical Japanese',
  cadman: 'Cadman 1926, Vietnamese',
  chinese_union_simp: 'Chinese Union Version, simplified',
  chinese_union_trad: 'Chinese Union Version, traditional',
  cpdv: 'Catholic Public Domain Version, English',
  dbt: 'Darby Translation, English',
  diodati: 'Diodati, Italian',
  drb: 'Douay-Rheims (Challoner), English',
  elberfelder_1905: 'Elberfelder 1905, German',
  elberfelder_1871: 'Elberfelder 1871, German',
  dnb30: 'Bibelselskapet 1930, Norwegian Bokmål',
  erv: 'English Revised Version',
  finn: 'Finnish 1776',
  geneva: 'Geneva Bible, English',
  hcv: 'Haitian Creole Bible (1985)',
  he_modern: 'Modern Hebrew Bible (Delitzsch NT)',
  jps: 'JPS Tanakh 1917, English',
  kougo: 'Kougo-yaku 1954/55, Japanese',
  lv_gluck_8: 'Glück Bible, Latvian',
  martin: 'Martin 1744, French',
  opt: 'Old Persian Version, Persian',
  rv_1858: 'Reina-Valera 1858 New Testament, Spanish',
  sagradas: 'Sagradas Escrituras 1569, Spanish',
  slt: "Smith's Literal Translation, English",
  swahili: 'Swahili New Testament',
  synodal: 'Synodal Translation 1876, Russian',
  tagab: 'Ang Biblia 1905, Tagalog',
  wbt: 'Webster Bible 1833, English',
  weymouth: 'Weymouth New Testament 1903, English',
  ylt: "Young's Literal Translation, English",
  bn_irv: 'Indian Revised Version, Bengali',
  gu_irv: 'Indian Revised Version, Gujarati',
  irv: 'Indian Revised Version, Hindi',
  ha_con: 'Open Hausa Contemporary Bible',
  ha_lit: 'Litafi Mai-tsarki, Hausa New Testament',
  kn_irv: 'Indian Revised Version, Kannada',
  mr_irv: 'Indian Revised Version, Marathi',
  pa_irv: 'Indian Revised Version, Punjabi',
  ta_irv: 'Indian Revised Version, Tamil',
  te_irv: 'Indian Revised Version, Telugu',
  coverdale: 'Coverdale Bible 1535, English',
  tyndale: 'Tyndale Bible 1526/1534, English',
  svd: 'Smith-Van Dyck 1865, Arabic',
  my_judson: 'Judson Bible 1840, Burmese',
  hebrew: 'Unicode/XML Leningrad Codex (UXLC), Hebrew Old Testament',
  wlc: 'Westminster Leningrad Codex, Hebrew Old Testament',
  tr: 'Textus Receptus 1550/1894, Greek New Testament',
  asvs: "American Standard Version with Strong's numbers, English",
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
    // Not «public domain»: since #224/#225 some are CC BY-SA and ask for a
    // credit (#246). The licence and credit of each are in list_editions.
    (harvested.length
      ? `; ${editionList(harvested)} are open translations, public domain or CC BY-SA — list_editions gives each one's licence and the credit it requires.`
      : '.')
  );
}
