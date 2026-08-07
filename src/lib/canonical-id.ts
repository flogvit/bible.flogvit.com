// ÉN PERSON, ÉN ADRESSE — DER KOLLASJONEN GODTAR FLERE (#49)
//
// `persons.name` og `stories.slug` har kollasjonen `utf8mb4_danish_ci`, altså
// både case- og aksent-insensitiv. Oppslaget svarer derfor 200 på skrivemåter
// id-en aldri har hatt (`/personer/Oholibama`, `/personer/óholibama`), mens ALT
// ANNET i ruta behandler id-en som eksakt små bokstaver. Det ga to utslag med
// samme rot:
//
//   1. 339 duplikat-URL-er i ett døgn, hver med sin EGEN canonical — altså tre
//      crawlere som indekserer samme side flere ganger og splitter signalene.
//   2. `PERSON_ID_ALIASES` er et JS-objektoppslag, altså case-SENSITIVT. En
//      versal variant av en VANLIG person svarte 200, mens en versal variant av
//      en ALIAS-id svarte 404 — nøyaktig de adressene kartet ble skrevet for å
//      redde (#61).
//
// SANNHETEN ER RADEN, IKKE EN OMSKRIVING
// --------------------------------------
// Vi normaliserer ikke adressen i JS for å GJETTE hva leseren mente. Basen har
// alt slått opp raden, og raden bærer sin egen skrivemåte — `persons.name`,
// kolonnen #61 utpekte som sannheten. Er den forespurte skrivemåten en annen,
// er det raden som avgjør, og leseren sendes dit. Da kan en redirect per
// konstruksjon aldri peke på en 404, og vi trenger ingen kopi av MySQLs
// kollasjonsregler for å svare riktig.
//
// `foldId()` finnes derfor bare til det ene stedet der basen IKKE har slått opp
// noe: alias-kartet. Den folder som `danish_ci` gjør — case og latinske
// aksenter — men lar `æ`, `ø` og `å` stå, fordi de er EGNE bokstaver i dansk
// sortering. Det er samme skillet #61 måtte håndtere med en egen
// translitterering: basen matcher ikke `jisreel-hoseas-sønn` mot
// `jisreel-hoseas-sonn`, og gjør det aldri.

/**
 * Nøkkelen et id-oppslag i et JS-kart skal gjøres på, slik at kartet svarer på
 * de samme skrivemåtene som basen gjør.
 *
 * Ikke en normalisering av adressen: den sier ingenting om hva den KANONISKE
 * formen er, bare at to skrivemåter er den samme id-en. Den kanoniske formen
 * kommer alltid fra raden.
 */
export function foldId(id: string): string {
  return (
    id
      .toLowerCase()
      // NFC først: en adresse kan komme inn dekomponert (`a` + ring), og `å`
      // skal behandles som bokstaven den er, ikke som en `a` med et tegn på.
      .normalize('NFC')
      // De tre bokstavene deles UT av strengen framfor å bli strippet med
      // resten. `æ` og `ø` har ingen dekomponering og ville overlevd uansett;
      // `å` ville ikke, og en `å` som ble til `a` er nettopp forvekslingen #61
      // måtte rette opp med en egen translitterering.
      .split(/([æøå])/)
      .map((part) =>
        part === 'æ' || part === 'ø' || part === 'å'
          ? part
          : part.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      )
      .join('')
  );
}

/** Utfallet av et id-oppslag der basen godtar flere skrivemåter enn én. */
export type IdResolution<T> =
  | { kind: 'found'; row: T }
  /** Adressen leseren skal sendes videre til, uten språkprefiks eller query. */
  | { kind: 'redirect'; to: string }
  | { kind: 'missing' };

/**
 * Slår en id opp og sier hva ruta skal gjøre: rendre, 301-e eller lete videre.
 *
 * Rekkefølgen er alias → basen, som før (#61): en gammel id finnes ikke i basen
 * lenger, så et oppslag først ville falt rett til `missing`. Det NYE er at
 * kartet slås opp på den foldede nøkkelen — ellers svarer basen på en
 * skrivemåte kartet ikke gjør, og en versal alias-id 404-er der en versal
 * vanlig id svarer 200.
 *
 * `missing` er kallerens sak. Persondetaljen har ett trinn til (#61s
 * translitterering av ø/æ/å), og det trinnet krever sitt eget oppslag.
 */
export async function resolveId<T>(
  requested: string,
  opts: {
    aliases?: Record<string, string>;
    lookup: (id: string) => Promise<T | undefined | null>;
    idOf: (row: T) => string;
  },
): Promise<IdResolution<T>> {
  const alias = opts.aliases?.[foldId(requested)];
  if (alias) return { kind: 'redirect', to: alias };

  const row = await opts.lookup(requested);
  if (!row) return { kind: 'missing' };

  // Raden bærer sin egen skrivemåte, og det er den offentlige adressen. Ba
  // leseren om en annen, er det et duplikat — og et duplikat skal ikke bli
  // stående som en side med sin egen canonical.
  const canonical = opts.idOf(row);
  return canonical === requested ? { kind: 'found', row } : { kind: 'redirect', to: canonical };
}
