// Boknavn og forkortelser per språk — VISNING, aldri nøkkel (GitHub #69).
//
// `name_no`/`short_name` i `books-data.ts` er NØKLER: URL-slugene, begge
// referanseparserne, `data-ref` og brukernes lagrede referanser slår opp på
// dem. De ligger derfor fortsatt der, og norsk bokmål er ikke duplisert hit —
// tabellene under dekker de sju ANDRE locale-ene i `LOCALES`.
//
// **Hvorfor navnene bor her og ikke i free-bible.** De ser ut som innhold, og
// free-bible eier resten av innholdsoversettelsene. Men free-bible HAR dem
// ikke: `generate/constants.ts` har fulle navn for `nb`, `nn` og `es` (en
// intern hjelper for prompten, ikke en publisert kilde), ingen forkortelser for
// noe språk, og ingen `generate/<type>/<språk>/`-katalog å importere fra. Der
// pipelinen «har» franske boknavn, er det modellen som skriver dem fra en
// promptlinje (`translate.ts`: «Use standard ${language} Bible book names»),
// uverifisert og ikke lagret noe sted. Å vente på en kilde som ikke finnes
// ville latt fem språk stå på engelsk på det ordet leseren ser oftest.
//
// **Hvorfor ikke i ordboka.** `dictionaries.ts` er «KUN grensesnittet», og
// dette er en LUKKET oppregning på 66 verdier adressert av en id fra dataene —
// samme klasse som språknavnene, der `langName()` bevisst valgte en egen
// mekanisme framfor ~700 ordboksnøkler. 66 × 7 × 2 nøkler i åtte ordbøker ville
// dessuten drukne resten av dem.
//
// **Kilden per språk er én navngitt oversettelse**, så navn og forkortelse
// hører sammen framfor å bli plukket fra hver sin tradisjon:
//
//   nn  Bibelselskapets nynorskutgave (navnene ordrett fra free-bible sin
//       `generate/constants.ts`, som er den samme utgaven)
//   en  KJV/NKJV-tradisjonen, forkortelsene SBL-nære
//   de  Lutherbibel 2017
//   fr  Louis Segond
//   es  Reina-Valera (navnene ordrett fra free-bible sin `constants.ts`, så
//       katalogen og det importerte es-innholdet staver bøkene likt)
//   sv  Bibel 2000
//   fi  Kirkkoraamattu 1992
//
// De fire uten en in-house kilde (de, fr, sv, fi) er ført opp herfra og bør
// leses over av en som har språket som morsmål. Vakta i `test/book-names.test.ts`
// ser at et navn FINNES og at det ikke er engelsk — den kan ikke se at det er
// riktig.
//
// Et nytt språk i `LOCALES` er ren data her: legg til en blokk i begge
// tabellene, så gjør vakta resten. Uten blokken blir den rød.

/** Bok-id (1–66) → navn, per språkkode. */
export type BookNameTable = Record<string, Record<number, string>>;

/** Boknavnene slik de skal VISES. Norsk bokmål bor i `books-data.ts`. */
export const BOOK_NAMES: BookNameTable = {
  en: {
    1: 'Genesis', 2: 'Exodus', 3: 'Leviticus', 4: 'Numbers', 5: 'Deuteronomy',
    6: 'Joshua', 7: 'Judges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
    11: '1 Kings', 12: '2 Kings', 13: '1 Chronicles', 14: '2 Chronicles',
    15: 'Ezra', 16: 'Nehemiah', 17: 'Esther', 18: 'Job', 19: 'Psalms',
    20: 'Proverbs', 21: 'Ecclesiastes', 22: 'Song of Solomon', 23: 'Isaiah',
    24: 'Jeremiah', 25: 'Lamentations', 26: 'Ezekiel', 27: 'Daniel', 28: 'Hosea',
    29: 'Joel', 30: 'Amos', 31: 'Obadiah', 32: 'Jonah', 33: 'Micah', 34: 'Nahum',
    35: 'Habakkuk', 36: 'Zephaniah', 37: 'Haggai', 38: 'Zechariah', 39: 'Malachi',
    40: 'Matthew', 41: 'Mark', 42: 'Luke', 43: 'John', 44: 'Acts', 45: 'Romans',
    46: '1 Corinthians', 47: '2 Corinthians', 48: 'Galatians', 49: 'Ephesians',
    50: 'Philippians', 51: 'Colossians', 52: '1 Thessalonians',
    53: '2 Thessalonians', 54: '1 Timothy', 55: '2 Timothy', 56: 'Titus',
    57: 'Philemon', 58: 'Hebrews', 59: 'James', 60: '1 Peter', 61: '2 Peter',
    62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude', 66: 'Revelation',
  },

  nn: {
    1: '1. Mosebok', 2: '2. Mosebok', 3: '3. Mosebok', 4: '4. Mosebok',
    5: '5. Mosebok', 6: 'Josva', 7: 'Domarane', 8: 'Rut', 9: '1. Samuel',
    10: '2. Samuel', 11: '1. Kongebok', 12: '2. Kongebok', 13: '1. Krønikebok',
    14: '2. Krønikebok', 15: 'Esra', 16: 'Nehemja', 17: 'Ester', 18: 'Job',
    19: 'Salmane', 20: 'Ordtøka', 21: 'Forkynnaren', 22: 'Høgsongen',
    23: 'Jesaja', 24: 'Jeremia', 25: 'Klagesongane', 26: 'Esekiel', 27: 'Daniel',
    28: 'Hosea', 29: 'Joel', 30: 'Amos', 31: 'Obadja', 32: 'Jona', 33: 'Mika',
    34: 'Nahum', 35: 'Habakkuk', 36: 'Sefanja', 37: 'Haggai', 38: 'Sakarja',
    39: 'Malaki', 40: 'Matteus', 41: 'Markus', 42: 'Lukas', 43: 'Johannes',
    44: 'Apostelgjerningane', 45: 'Romarane', 46: '1. Korintarane',
    47: '2. Korintarane', 48: 'Galatarane', 49: 'Efesarane', 50: 'Filipparane',
    51: 'Kolossarane', 52: '1. Tessalonikarane', 53: '2. Tessalonikarane',
    54: '1. Timoteus', 55: '2. Timoteus', 56: 'Titus', 57: 'Filemon',
    58: 'Hebrearane', 59: 'Jakob', 60: '1. Peter', 61: '2. Peter',
    62: '1. Johannes', 63: '2. Johannes', 64: '3. Johannes', 65: 'Judas',
    66: 'Openberringa',
  },

  de: {
    1: '1. Mose', 2: '2. Mose', 3: '3. Mose', 4: '4. Mose', 5: '5. Mose',
    6: 'Josua', 7: 'Richter', 8: 'Rut', 9: '1. Samuel', 10: '2. Samuel',
    11: '1. Könige', 12: '2. Könige', 13: '1. Chronik', 14: '2. Chronik',
    15: 'Esra', 16: 'Nehemia', 17: 'Ester', 18: 'Hiob', 19: 'Psalmen',
    20: 'Sprüche', 21: 'Prediger', 22: 'Hoheslied', 23: 'Jesaja', 24: 'Jeremia',
    25: 'Klagelieder', 26: 'Hesekiel', 27: 'Daniel', 28: 'Hosea', 29: 'Joel',
    30: 'Amos', 31: 'Obadja', 32: 'Jona', 33: 'Micha', 34: 'Nahum',
    35: 'Habakuk', 36: 'Zefanja', 37: 'Haggai', 38: 'Sacharja', 39: 'Maleachi',
    40: 'Matthäus', 41: 'Markus', 42: 'Lukas', 43: 'Johannes',
    44: 'Apostelgeschichte', 45: 'Römer', 46: '1. Korinther', 47: '2. Korinther',
    48: 'Galater', 49: 'Epheser', 50: 'Philipper', 51: 'Kolosser',
    52: '1. Thessalonicher', 53: '2. Thessalonicher', 54: '1. Timotheus',
    55: '2. Timotheus', 56: 'Titus', 57: 'Philemon', 58: 'Hebräer',
    59: 'Jakobus', 60: '1. Petrus', 61: '2. Petrus', 62: '1. Johannes',
    63: '2. Johannes', 64: '3. Johannes', 65: 'Judas', 66: 'Offenbarung',
  },

  fr: {
    1: 'Genèse', 2: 'Exode', 3: 'Lévitique', 4: 'Nombres', 5: 'Deutéronome',
    6: 'Josué', 7: 'Juges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
    11: '1 Rois', 12: '2 Rois', 13: '1 Chroniques', 14: '2 Chroniques',
    15: 'Esdras', 16: 'Néhémie', 17: 'Esther', 18: 'Job', 19: 'Psaumes',
    20: 'Proverbes', 21: 'Ecclésiaste', 22: 'Cantique des cantiques',
    23: 'Ésaïe', 24: 'Jérémie', 25: 'Lamentations', 26: 'Ézéchiel',
    27: 'Daniel', 28: 'Osée', 29: 'Joël', 30: 'Amos', 31: 'Abdias', 32: 'Jonas',
    33: 'Michée', 34: 'Nahum', 35: 'Habacuc', 36: 'Sophonie', 37: 'Aggée',
    38: 'Zacharie', 39: 'Malachie', 40: 'Matthieu', 41: 'Marc', 42: 'Luc',
    43: 'Jean', 44: 'Actes', 45: 'Romains', 46: '1 Corinthiens',
    47: '2 Corinthiens', 48: 'Galates', 49: 'Éphésiens', 50: 'Philippiens',
    51: 'Colossiens', 52: '1 Thessaloniciens', 53: '2 Thessaloniciens',
    54: '1 Timothée', 55: '2 Timothée', 56: 'Tite', 57: 'Philémon',
    58: 'Hébreux', 59: 'Jacques', 60: '1 Pierre', 61: '2 Pierre', 62: '1 Jean',
    63: '2 Jean', 64: '3 Jean', 65: 'Jude', 66: 'Apocalypse',
  },

  es: {
    1: 'Génesis', 2: 'Éxodo', 3: 'Levítico', 4: 'Números', 5: 'Deuteronomio',
    6: 'Josué', 7: 'Jueces', 8: 'Rut', 9: '1 Samuel', 10: '2 Samuel',
    11: '1 Reyes', 12: '2 Reyes', 13: '1 Crónicas', 14: '2 Crónicas',
    15: 'Esdras', 16: 'Nehemías', 17: 'Ester', 18: 'Job', 19: 'Salmos',
    20: 'Proverbios', 21: 'Eclesiastés', 22: 'Cantares', 23: 'Isaías',
    24: 'Jeremías', 25: 'Lamentaciones', 26: 'Ezequiel', 27: 'Daniel',
    28: 'Oseas', 29: 'Joel', 30: 'Amós', 31: 'Abdías', 32: 'Jonás',
    33: 'Miqueas', 34: 'Nahúm', 35: 'Habacuc', 36: 'Sofonías', 37: 'Hageo',
    38: 'Zacarías', 39: 'Malaquías', 40: 'Mateo', 41: 'Marcos', 42: 'Lucas',
    43: 'Juan', 44: 'Hechos', 45: 'Romanos', 46: '1 Corintios',
    47: '2 Corintios', 48: 'Gálatas', 49: 'Efesios', 50: 'Filipenses',
    51: 'Colosenses', 52: '1 Tesalonicenses', 53: '2 Tesalonicenses',
    54: '1 Timoteo', 55: '2 Timoteo', 56: 'Tito', 57: 'Filemón',
    58: 'Hebreos', 59: 'Santiago', 60: '1 Pedro', 61: '2 Pedro', 62: '1 Juan',
    63: '2 Juan', 64: '3 Juan', 65: 'Judas', 66: 'Apocalipsis',
  },

  sv: {
    1: 'Första Moseboken', 2: 'Andra Moseboken', 3: 'Tredje Moseboken',
    4: 'Fjärde Moseboken', 5: 'Femte Moseboken', 6: 'Josua', 7: 'Domarboken',
    8: 'Rut', 9: 'Första Samuelsboken', 10: 'Andra Samuelsboken',
    11: 'Första Kungaboken', 12: 'Andra Kungaboken', 13: 'Första Krönikeboken',
    14: 'Andra Krönikeboken', 15: 'Esra', 16: 'Nehemja', 17: 'Ester', 18: 'Job',
    19: 'Psaltaren', 20: 'Ordspråksboken', 21: 'Predikaren', 22: 'Höga visan',
    23: 'Jesaja', 24: 'Jeremia', 25: 'Klagovisorna', 26: 'Hesekiel',
    27: 'Daniel', 28: 'Hosea', 29: 'Joel', 30: 'Amos', 31: 'Obadja', 32: 'Jona',
    33: 'Mika', 34: 'Nahum', 35: 'Habackuk', 36: 'Sefanja', 37: 'Haggai',
    38: 'Sakarja', 39: 'Malaki', 40: 'Matteusevangeliet',
    41: 'Markusevangeliet', 42: 'Lukasevangeliet', 43: 'Johannesevangeliet',
    44: 'Apostlagärningarna', 45: 'Romarbrevet', 46: 'Första Korinthierbrevet',
    47: 'Andra Korinthierbrevet', 48: 'Galaterbrevet', 49: 'Efesierbrevet',
    50: 'Filipperbrevet', 51: 'Kolosserbrevet',
    52: 'Första Thessalonikerbrevet', 53: 'Andra Thessalonikerbrevet',
    54: 'Första Timotheosbrevet', 55: 'Andra Timotheosbrevet',
    56: 'Titusbrevet', 57: 'Filemonbrevet', 58: 'Hebreerbrevet',
    59: 'Jakobsbrevet', 60: 'Första Petrusbrevet', 61: 'Andra Petrusbrevet',
    62: 'Första Johannesbrevet', 63: 'Andra Johannesbrevet',
    64: 'Tredje Johannesbrevet', 65: 'Judasbrevet', 66: 'Uppenbarelseboken',
  },

  fi: {
    1: '1. Mooseksen kirja', 2: '2. Mooseksen kirja', 3: '3. Mooseksen kirja',
    4: '4. Mooseksen kirja', 5: '5. Mooseksen kirja', 6: 'Joosuan kirja',
    7: 'Tuomarien kirja', 8: 'Ruutin kirja', 9: '1. Samuelin kirja',
    10: '2. Samuelin kirja', 11: '1. Kuningasten kirja',
    12: '2. Kuningasten kirja', 13: '1. Aikakirja', 14: '2. Aikakirja',
    15: 'Esran kirja', 16: 'Nehemian kirja', 17: 'Esterin kirja',
    18: 'Jobin kirja', 19: 'Psalmit', 20: 'Sananlaskut', 21: 'Saarnaaja',
    22: 'Laulujen laulu', 23: 'Jesaja', 24: 'Jeremia', 25: 'Valitusvirret',
    26: 'Hesekiel', 27: 'Daniel', 28: 'Hoosea', 29: 'Joel', 30: 'Aamos',
    31: 'Obadja', 32: 'Joona', 33: 'Miika', 34: 'Nahum', 35: 'Habakuk',
    36: 'Sefanja', 37: 'Haggai', 38: 'Sakarja', 39: 'Malakia',
    40: 'Matteuksen evankeliumi', 41: 'Markuksen evankeliumi',
    42: 'Luukkaan evankeliumi', 43: 'Johanneksen evankeliumi',
    44: 'Apostolien teot', 45: 'Roomalaiskirje', 46: '1. Korinttilaiskirje',
    47: '2. Korinttilaiskirje', 48: 'Galatalaiskirje', 49: 'Efesolaiskirje',
    50: 'Filippiläiskirje', 51: 'Kolossalaiskirje',
    52: '1. Tessalonikalaiskirje', 53: '2. Tessalonikalaiskirje',
    54: '1. Timoteuskirje', 55: '2. Timoteuskirje', 56: 'Kirje Titukselle',
    57: 'Kirje Filemonille', 58: 'Heprealaiskirje', 59: 'Jaakobin kirje',
    60: '1. Pietarin kirje', 61: '2. Pietarin kirje', 62: '1. Johanneksen kirje',
    63: '2. Johanneksen kirje', 64: '3. Johanneksen kirje',
    65: 'Juudaksen kirje', 66: 'Johanneksen ilmestys',
  },
};

/**
 * Forkortelsene slik de skal VISES (referansechips, kompakte lister).
 *
 * Standardforkortelsen i samme utgave som navnet over — ikke en avkorting av
 * navnet. Nynorsk deler bokmålsformene, unntatt der stammen faktisk er en
 * annen (Ordtøka, Høgsongen, Openberringa).
 */
export const BOOK_ABBRS: BookNameTable = {
  en: {
    1: 'Gen', 2: 'Exod', 3: 'Lev', 4: 'Num', 5: 'Deut', 6: 'Josh', 7: 'Judg',
    8: 'Ruth', 9: '1 Sam', 10: '2 Sam', 11: '1 Kgs', 12: '2 Kgs', 13: '1 Chr',
    14: '2 Chr', 15: 'Ezra', 16: 'Neh', 17: 'Esth', 18: 'Job', 19: 'Ps',
    20: 'Prov', 21: 'Eccl', 22: 'Song', 23: 'Isa', 24: 'Jer', 25: 'Lam',
    26: 'Ezek', 27: 'Dan', 28: 'Hos', 29: 'Joel', 30: 'Amos', 31: 'Obad',
    32: 'Jonah', 33: 'Mic', 34: 'Nah', 35: 'Hab', 36: 'Zeph', 37: 'Hag',
    38: 'Zech', 39: 'Mal', 40: 'Matt', 41: 'Mark', 42: 'Luke', 43: 'John',
    44: 'Acts', 45: 'Rom', 46: '1 Cor', 47: '2 Cor', 48: 'Gal', 49: 'Eph',
    50: 'Phil', 51: 'Col', 52: '1 Thess', 53: '2 Thess', 54: '1 Tim',
    55: '2 Tim', 56: 'Titus', 57: 'Phlm', 58: 'Heb', 59: 'Jas', 60: '1 Pet',
    61: '2 Pet', 62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude',
    66: 'Rev',
  },

  nn: {
    1: '1Mos', 2: '2Mos', 3: '3Mos', 4: '4Mos', 5: '5Mos', 6: 'Jos', 7: 'Dom',
    8: 'Rut', 9: '1Sam', 10: '2Sam', 11: '1Kong', 12: '2Kong', 13: '1Krøn',
    14: '2Krøn', 15: 'Esra', 16: 'Neh', 17: 'Est', 18: 'Job', 19: 'Sal',
    20: 'Ordt', 21: 'Fork', 22: 'Høgs', 23: 'Jes', 24: 'Jer', 25: 'Klag',
    26: 'Esek', 27: 'Dan', 28: 'Hos', 29: 'Joel', 30: 'Amos', 31: 'Ob',
    32: 'Jona', 33: 'Mika', 34: 'Nah', 35: 'Hab', 36: 'Sef', 37: 'Hag',
    38: 'Sak', 39: 'Mal', 40: 'Matt', 41: 'Mark', 42: 'Luk', 43: 'Joh',
    44: 'Apg', 45: 'Rom', 46: '1Kor', 47: '2Kor', 48: 'Gal', 49: 'Ef',
    50: 'Fil', 51: 'Kol', 52: '1Tess', 53: '2Tess', 54: '1Tim', 55: '2Tim',
    56: 'Tit', 57: 'Filem', 58: 'Hebr', 59: 'Jak', 60: '1Pet', 61: '2Pet',
    62: '1Joh', 63: '2Joh', 64: '3Joh', 65: 'Jud', 66: 'Op',
  },

  de: {
    1: '1Mo', 2: '2Mo', 3: '3Mo', 4: '4Mo', 5: '5Mo', 6: 'Jos', 7: 'Ri',
    8: 'Rut', 9: '1Sam', 10: '2Sam', 11: '1Kön', 12: '2Kön', 13: '1Chr',
    14: '2Chr', 15: 'Esr', 16: 'Neh', 17: 'Est', 18: 'Hi', 19: 'Ps',
    20: 'Spr', 21: 'Pred', 22: 'Hld', 23: 'Jes', 24: 'Jer', 25: 'Klgl',
    26: 'Hes', 27: 'Dan', 28: 'Hos', 29: 'Joel', 30: 'Am', 31: 'Obd',
    32: 'Jona', 33: 'Mi', 34: 'Nah', 35: 'Hab', 36: 'Zef', 37: 'Hag',
    38: 'Sach', 39: 'Mal', 40: 'Mt', 41: 'Mk', 42: 'Lk', 43: 'Joh', 44: 'Apg',
    45: 'Röm', 46: '1Kor', 47: '2Kor', 48: 'Gal', 49: 'Eph', 50: 'Phil',
    51: 'Kol', 52: '1Thess', 53: '2Thess', 54: '1Tim', 55: '2Tim', 56: 'Tit',
    57: 'Phlm', 58: 'Hebr', 59: 'Jak', 60: '1Petr', 61: '2Petr', 62: '1Joh',
    63: '2Joh', 64: '3Joh', 65: 'Jud', 66: 'Offb',
  },

  fr: {
    1: 'Gn', 2: 'Ex', 3: 'Lv', 4: 'Nb', 5: 'Dt', 6: 'Jos', 7: 'Jg', 8: 'Rt',
    9: '1 S', 10: '2 S', 11: '1 R', 12: '2 R', 13: '1 Ch', 14: '2 Ch',
    15: 'Esd', 16: 'Né', 17: 'Est', 18: 'Jb', 19: 'Ps', 20: 'Pr', 21: 'Ec',
    22: 'Ct', 23: 'Es', 24: 'Jr', 25: 'Lm', 26: 'Ez', 27: 'Dn', 28: 'Os',
    29: 'Jl', 30: 'Am', 31: 'Ab', 32: 'Jon', 33: 'Mi', 34: 'Na', 35: 'Ha',
    36: 'So', 37: 'Ag', 38: 'Za', 39: 'Ml', 40: 'Mt', 41: 'Mc', 42: 'Lc',
    43: 'Jn', 44: 'Ac', 45: 'Rm', 46: '1 Co', 47: '2 Co', 48: 'Ga', 49: 'Ep',
    50: 'Ph', 51: 'Col', 52: '1 Th', 53: '2 Th', 54: '1 Tm', 55: '2 Tm',
    56: 'Tt', 57: 'Phm', 58: 'He', 59: 'Jc', 60: '1 P', 61: '2 P', 62: '1 Jn',
    63: '2 Jn', 64: '3 Jn', 65: 'Jude', 66: 'Ap',
  },

  es: {
    1: 'Gn', 2: 'Éx', 3: 'Lv', 4: 'Nm', 5: 'Dt', 6: 'Jos', 7: 'Jue', 8: 'Rt',
    9: '1 S', 10: '2 S', 11: '1 R', 12: '2 R', 13: '1 Cr', 14: '2 Cr',
    15: 'Esd', 16: 'Neh', 17: 'Est', 18: 'Job', 19: 'Sal', 20: 'Pr', 21: 'Ec',
    22: 'Cnt', 23: 'Is', 24: 'Jer', 25: 'Lm', 26: 'Ez', 27: 'Dn', 28: 'Os',
    29: 'Jl', 30: 'Am', 31: 'Abd', 32: 'Jon', 33: 'Mi', 34: 'Nah', 35: 'Hab',
    36: 'Sof', 37: 'Hag', 38: 'Zac', 39: 'Mal', 40: 'Mt', 41: 'Mr', 42: 'Lc',
    43: 'Jn', 44: 'Hch', 45: 'Ro', 46: '1 Co', 47: '2 Co', 48: 'Gá', 49: 'Ef',
    50: 'Fil', 51: 'Col', 52: '1 Ts', 53: '2 Ts', 54: '1 Ti', 55: '2 Ti',
    56: 'Tit', 57: 'Flm', 58: 'He', 59: 'Stg', 60: '1 P', 61: '2 P', 62: '1 Jn',
    63: '2 Jn', 64: '3 Jn', 65: 'Jud', 66: 'Ap',
  },

  sv: {
    1: '1 Mos', 2: '2 Mos', 3: '3 Mos', 4: '4 Mos', 5: '5 Mos', 6: 'Jos',
    7: 'Dom', 8: 'Rut', 9: '1 Sam', 10: '2 Sam', 11: '1 Kung', 12: '2 Kung',
    13: '1 Krön', 14: '2 Krön', 15: 'Esr', 16: 'Neh', 17: 'Est', 18: 'Job',
    19: 'Ps', 20: 'Ords', 21: 'Pred', 22: 'HV', 23: 'Jes', 24: 'Jer',
    25: 'Klag', 26: 'Hes', 27: 'Dan', 28: 'Hos', 29: 'Joel', 30: 'Am',
    31: 'Ob', 32: 'Jona', 33: 'Mik', 34: 'Nah', 35: 'Hab', 36: 'Sef',
    37: 'Hagg', 38: 'Sak', 39: 'Mal', 40: 'Matt', 41: 'Mark', 42: 'Luk',
    43: 'Joh', 44: 'Apg', 45: 'Rom', 46: '1 Kor', 47: '2 Kor', 48: 'Gal',
    49: 'Ef', 50: 'Fil', 51: 'Kol', 52: '1 Thess', 53: '2 Thess', 54: '1 Tim',
    55: '2 Tim', 56: 'Tit', 57: 'Filem', 58: 'Heb', 59: 'Jak', 60: '1 Petr',
    61: '2 Petr', 62: '1 Joh', 63: '2 Joh', 64: '3 Joh', 65: 'Jud', 66: 'Upp',
  },

  fi: {
    1: '1. Moos.', 2: '2. Moos.', 3: '3. Moos.', 4: '4. Moos.', 5: '5. Moos.',
    6: 'Joos.', 7: 'Tuom.', 8: 'Ruut', 9: '1. Sam.', 10: '2. Sam.',
    11: '1. Kun.', 12: '2. Kun.', 13: '1. Aik.', 14: '2. Aik.', 15: 'Esra',
    16: 'Neh.', 17: 'Est.', 18: 'Job', 19: 'Ps.', 20: 'Sananl.', 21: 'Saarn.',
    22: 'Laul. l.', 23: 'Jes.', 24: 'Jer.', 25: 'Val.', 26: 'Hes.', 27: 'Dan.',
    28: 'Hoos.', 29: 'Joel', 30: 'Aam.', 31: 'Ob.', 32: 'Joona', 33: 'Miika',
    34: 'Nah.', 35: 'Hab.', 36: 'Sef.', 37: 'Hagg.', 38: 'Sak.', 39: 'Mal.',
    40: 'Matt.', 41: 'Mark.', 42: 'Luuk.', 43: 'Joh.', 44: 'Ap. t.',
    45: 'Room.', 46: '1. Kor.', 47: '2. Kor.', 48: 'Gal.', 49: 'Ef.',
    50: 'Fil.', 51: 'Kol.', 52: '1. Tess.', 53: '2. Tess.', 54: '1. Tim.',
    55: '2. Tim.', 56: 'Tit.', 57: 'Filem.', 58: 'Hepr.', 59: 'Jaak.',
    60: '1. Piet.', 61: '2. Piet.', 62: '1. Joh.', 63: '2. Joh.',
    64: '3. Joh.', 65: 'Juud.', 66: 'Ilm.',
  },
};
