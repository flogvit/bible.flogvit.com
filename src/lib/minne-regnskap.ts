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
// OG DET FØRSTE SVARET ER ET NEI (#110). Regnskapet talte OPPFØRINGER, og det
// var halve spørsmålet: en cache med null oppføringer forklarer ingenting om
// de 228 MB-ene. Den andre halvdelen er om minnet i det hele tatt er VÅRT —
// altså om live-settet vokser (noe holdes i live) eller bare `rss` gjør det
// (allokatoren gir ikke tilbake). Det skillet krevde ssh og `memory.stat` i et
// annet repo; nå står `heap` og `heapGulv` her, og `minne-vekst.test.ts` måler
// det samme fra innsiden: 240 unike kapittelrender flytter live-settet 1 MB og
// residenten 75.
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
 * Hvor stor JS-heapen er NÅ. Injiserbar, så gulvet under kan måles av en vakt
 * uten å vente på at en GC tilfeldigvis inntreffer.
 */
let lesHeap: () => number = () => process.memoryUsage().heapUsed;

/**
 * DET LAVESTE heapen har vært, over avlesningene som er gjort.
 *
 * Det er kolonnen saken navnga som avgjørende, og den kan ikke leses av ett
 * øyeblikksbilde: `heapUsed` inneholder søppel som ennå ikke er samlet, og
 * svinger derfor mellom to og seks ganger det som faktisk er levende (målt
 * 21–140 MB i den samme kjøringen, mens live-settet lå i ro på ~25 MB). To
 * avlesninger med timer imellom sammenlikner da GC-faser, ikke minne.
 *
 * GULVET er immunt mot det: rett etter en samling ER heapUsed live-settet, og
 * en poller som spør hvert minutt treffer den tilstanden mange ganger i timen.
 * Stiger gulvet, holdes noe i live — det er en lekkasje. Står gulvet stille
 * mens `rss` klatrer, er det allokatoren som ikke gir tilbake, og da er ingen
 * cache skyldig. Det er nøyaktig det skillet #110 ba om og ikke kunne gjøre.
 *
 * Prisen er én sammenlikning per avlesning. Vi tvinger ALDRI fram en GC for å
 * få tallet: en samling midt i en forespørsel er en pause for en leser, og
 * `/api/minne` er offentlig.
 */
let heapGulv = Infinity;

/** Kun for tester: injiser heap-avlesningen og nullstill gulvet. */
export function settHeapleser(fn: (() => number) | null): void {
  lesHeap = fn ?? (() => process.memoryUsage().heapUsed);
  heapGulv = Infinity;
}

/**
 * Hele regnskapet, lest NÅ.
 *
 * `rss` er tallet cgruppa teller når den bestemmer seg for å drepe containeren
 * (#106), så det er det de andre tallene skal leses mot. Summen av kildene vil
 * ALDRI bli rss: kode, stack, JIT og alt annet ligger utenfor. Poenget er
 * differansen over tid — hvilken post som flytter seg når rss gjør det.
 *
 * `heap` og `heapGulv` er den andre halvdelen av det svaret, og de er nye i
 * #110: uten dem sier regnskapet hvor mye som er brukt, men ikke om det er VÅRT
 * — og det var nettopp det spørsmålet som krevde ssh og `memory.stat` i et
 * annet repo for å bli besvart.
 */
export function minneRegnskap(): {
  rss: number;
  heap: number;
  heapGulv: number;
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
  const heap = lesHeap();
  if (heap < heapGulv) heapGulv = heap;
  return { rss: process.memoryUsage.rss(), heap, heapGulv, kilder: ut };
}
