// EN ID API-ET DELER UT SKAL API-ET KUNNE SERVERE (#61).
//
// Saken er meldt på .no og har én setning som overskrift: «API-ets egne svar
// peker på id-er API-et selv 404-er.» Persongrafen — beviset i saken — er
// ryddet på .com av `prunePersonRefs()`, og adressene med ø/æ/å 301-er nå til
// personen. Den TREDJE formen i sakens egen tabell er en annen:
//
//   404  /api/reading-texts/165   <- /lesetekster/165
//
// altså en rad-id delt ut som om den var en adresse. #40 tok den formen ut av
// URL-ene våre; den sto igjen i API-svarene, og der er den fortsatt:
//
//   GET /api/stories            -> [{ "id": 6453, "slug": "abimelek-…", … }]
//   GET /api/stories/6453       -> 404      (adressen er `slug`)
//   GET /api/themes             -> [{ "id": 70, "name": "abraham", … }]
//   GET /api/themes/70          -> 404      (adressen er `name`)
//   GET /api/number-symbolism   -> [{ "id": 351, "number": 1, … }]
//   GET /api/number-symbolism/351 -> 404    (adressen er `number`)
//
// Tre av samlingene gjorde `SELECT *` og sendte raden ut som den lå, med
// auto_increment-kolonnen i behold. En klient som gjør det åpenbare —
// `GET /api/<samling>/<element.id>` — får 404 på hvert eneste element, mens
// `/api/persons`, `/api/days` og `/api/reading-plans` i samme API deler ut
// nettopp adressen som `id`. Samme app, samme felt, to betydninger.
//
// Verre enn 404: rad-id-en RENUMMERERES ved hver innholdsimport (#40 —
// importen sletter og setter inn på nytt), så en klient som lagret den peker
// på en annen historie etter neste innholdsrunde. En død adresse er synlig; en
// som stille bytter innhold er ikke det.
//
// REGELEN: `id` ER ADRESSEN.
// -------------------------
// `withApiIds()` setter `id` til feltet detaljruta faktisk slår opp på, og
// samlingene står ETT sted — `API_COLLECTIONS` — brukt både av rutene og av
// vakta (`test/api-id-graph.test.ts`). Ville rutene hatt hver sin literal,
// ville vakta målt at ruta er enig med seg selv.
//
// Rad-id-en forsvinner dermed ut av svaret framfor å bli liggende ved siden av
// adressen. Den er ikke et alternativ klienten kan velge: den finnes bare i vår
// egen base, den er ustabil, og en klient som ser to id-lignende felter velger
// før eller siden feil. Se `test/api-id-graph.test.ts` for hva som måles.

/** En samling i API-et: en liste, og en detaljrute som serverer elementene. */
export interface ApiCollection {
  /** Stien lista ligger på, altså også prefikset detaljruta har. */
  path: string;
  /**
   * Nøkkelen lista ligger under i svaret, eller `null` når svaret ER lista.
   */
  listKey: string | null;
  /** Feltet i elementet som detaljruta slår opp på — altså ADRESSEN. */
  addressKey: string;
  /** Satt når samlingen kan være tom i en gyldig base, med grunnen. */
  mayBeEmpty?: string;
  /** Notat vakta ikke leser, men neste leser gjør. */
  note?: string;
}

export const API_COLLECTIONS: ApiCollection[] = [
  { path: '/api/persons', listKey: null, addressKey: 'id' },
  { path: '/api/stories', listKey: 'stories', addressKey: 'slug' },
  { path: '/api/themes', listKey: 'themes', addressKey: 'name' },
  { path: '/api/number-symbolism', listKey: 'symbolisms', addressKey: 'number' },
  { path: '/api/days', listKey: 'days', addressKey: 'id' },
  { path: '/api/reading-plans', listKey: null, addressKey: 'id' },
  {
    path: '/api/parallels',
    listKey: 'parallels',
    addressKey: 'id',
    note:
      '`sections` i samme svar er en GRUPPERINGSNØKKEL (`parallels[].section_id`), ikke en adresse — ' +
      'det finnes ingen detaljrute for en seksjon, og en id derfra er ikke ment å hentes.',
  },
  {
    path: '/api/reading-texts',
    listKey: 'readingTexts',
    addressKey: 'id',
    note:
      'DATOEN er den stabile adressen for DAGEN (#40), men flere lesetekster kan dele dato ' +
      '(Julenatt og Juledag), så den adresserer ikke RADEN. Lista bærer `date` ved siden av, og ' +
      'det er den en klient skal lagre. At rad-id-en er ustabil er #40s sak, ikke denne.',
  },
  {
    path: '/api/mappings',
    listKey: 'mappings',
    addressKey: 'id',
    mayBeEmpty: '`verse_mappings` fylles av KVN-importen og er tom i en fersk base',
  },
];

/** En rute med både liste og detalj som IKKE er en adresserbar samling. */
export interface UnaddressedRoute {
  collection: string;
  why: string;
}

export const UNADDRESSED_ROUTES: UnaddressedRoute[] = [
  {
    collection: 'daily-verse',
    why: '`GET /` er dagens vers, ikke en liste — og `/:date` er et oppslag på dato, ikke på en id svaret delte ut',
  },
];

const BY_PATH = new Map(API_COLLECTIONS.map((c) => [c.path, c]));

export function apiCollection(path: string): ApiCollection {
  const collection = BY_PATH.get(path);
  // En samling som ikke er deklarert har ingen kjent adresse, og da ville
  // hjelperen bare flyttet gjetningen ett hakk inn.
  if (!collection) throw new Error(`Ukjent API-samling: ${path} — legg den i API_COLLECTIONS`);
  return collection;
}

/**
 * Setter `id` til adressen detaljruta serverer, og lar resten av raden stå.
 *
 * Raden bæres uendret videre bortsett fra `id`: samme avveining som «lenka
 * faller, navnet blir stående» i #61 — vi kaster ikke innhold vi har for å bli
 * kvitt en id vi ikke kan servere.
 */
export function withApiIds<T extends object>(path: string, rows: T[]): (Omit<T, 'id'> & { id: unknown })[] {
  return rows.map((row) => withApiId(path, row));
}

/** Samme regel for ETT element — detaljsvaret deler ut sin egen id. */
export function withApiId<T extends object>(path: string, row: T): Omit<T, 'id'> & { id: unknown } {
  const { addressKey } = apiCollection(path);
  const address = (row as Record<string, unknown>)[addressKey];
  // En rad uten adresse er en deklarasjon som ikke stemmer med spørringen.
  // Stille ville den blitt til `id: undefined`, altså den samme døde adressen
  // saken handler om — bare uten et tall å kjenne den igjen på.
  if (address === undefined || address === null || address === '') {
    throw new Error(`${path}: raden mangler adressefeltet «${addressKey}»`);
  }
  return { ...row, id: address };
}
