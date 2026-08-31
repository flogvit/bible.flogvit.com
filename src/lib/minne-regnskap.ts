// APPEN SKAL KUNNE SI HVA DEN HOLDER PÅ.
//
// Fire ganger har det samme spørsmålet kostet en produksjonssak, og hver gang
// er det blitt besvart med en gjetning:
//
//   #19   mapping-filene ble liggende gjennom fil-cachen — 93 MB heap, 409 MB
//         RSS målt, og det ble oppdaget først da containeren ble drept
//   #105  sidene ble budsjettert med `body.length`, altså TEGN, mens hebraisk
//         og gresk tvinger UTF-16 — cachen fylte seg til det dobbelte av
//         tallet i koden, og en vanlig oppfylling så ut som en lekkasje
//   #106  «grunnlast rett etter start er 162 MB» sto i saken som noe ingen
//         hadde undersøkt; 54 av dem var ÉN funksjon
//   #216  `minnevekst:` meldte 111 → 228 MB anonymt på sju timer, og
//         driftsrepoets egen commit skrev det rett ut: «hvor mye av dette har
//         vi BEDT den om å holde? — det kunne ikke besvares herfra i det hele
//         tatt»
//
// Fellesnevneren er ikke at cachene er dårlige. Den er at INGEN AV DEM
// RAPPORTERER NOE. `pageCacheStats()` har eksistert siden #105 og er aldri
// blitt lest utenfor en test, så i drift er svaret på «hva vokser?» et
// `memory.stat` som sier «168 MB anonymt» og ikke ett ord om hvem som holder
// det. Da blir neste steg alltid en hypotese, og tre av dem har vært feil.
//
// Dette er regnskapet. Hver cache som kan vokse melder seg inn med ETT navn og
// en avlesning, og `/api/minne` gir tallene ut. Det retter ingen lekkasje — det
// gjør neste lekkasje mulig å navngi uten å gjette.
//
// TALLENE ER OPPFØRINGER, IKKE BYTE, der byte ikke måles. En Map med 900
// mapping-filer i seg sier mer enn et anslag på hva de veier: antallet er
// eksakt, og veksten i det er det som skal leses mot RSS. Der en cache FØRER
// byteregnskap selv — page-cachen gjør det, fordi den har et budsjett å holde —
// tas tallet med, og da er det cachens eget regnskap som vises, ikke et nytt.
//
// Se bible.flogvit.com#110.

/** Én avlesning fra én kilde. `byte` er med bare når kilden fører det selv. */
export interface Minnemaaling {
  oppforinger: number;
  byte?: number;
}

/**
 * Kildene, i innmeldingsrekkefølge.
 *
 * Registeret er selv en modulnivå-Map, og det er den ene som ikke kan vokse
 * med trafikk: den får én oppføring per `registrerMinnekilde()` i kildekoden,
 * og de kjøres ved import.
 */
const kilder = new Map<string, () => Minnemaaling>();

/**
 * Melder en cache inn i regnskapet.
 *
 * Navnet er det som står i svaret og i en vaktlinje, så det skal være det
 * leseren kjenner igjen fra koden: `verse-mapper/mappingData`, ikke `md`.
 *
 * To innmeldinger med samme navn er en feil, ikke en overskriving — ellers
 * forsvinner den ene stille, og et regnskap som mangler en post uten å si fra
 * er verre enn ingen.
 */
export function registrerMinnekilde(navn: string, les: () => Minnemaaling): void {
  if (kilder.has(navn)) throw new Error(`minnekilden «${navn}» er meldt inn to ganger`);
  kilder.set(navn, les);
}

/** Navnene som er meldt inn. Vakta i `minne-regnskap.test.ts` leser den. */
export function minnekilder(): string[] {
  return [...kilder.keys()];
}

/**
 * Hele regnskapet, lest NÅ.
 *
 * `rss` er tallet cgruppa teller når den bestemmer seg for å drepe containeren
 * (#106), så det er det de andre tallene skal leses mot. Summen av kildene vil
 * ALDRI bli rss: kode, stack, JIT og alt annet ligger utenfor. Poenget er
 * differansen over tid — hvilken post som flytter seg når rss gjør det.
 */
export function minneRegnskap(): {
  rss: number;
  kilder: Record<string, Minnemaaling>;
} {
  const ut: Record<string, Minnemaaling> = {};
  for (const [navn, les] of kilder) {
    try {
      ut[navn] = les();
    } catch {
      // En kilde som kaster skal ikke kunne ta ned målingen av de andre. Den
      // meldes som -1, altså «finnes, men svarte ikke» — som er noe annet enn
      // 0, og noe annet enn å mangle.
      ut[navn] = { oppforinger: -1 };
    }
  }
  return { rss: process.memoryUsage.rss(), kilder: ut };
}
