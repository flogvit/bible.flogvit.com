/**
 * Person-id-er som ble rettet 2026-07-30 (free-bible#25), og som må 301-e.
 *
 * `nameToId()` i free-bible SLETTET `ø` og `æ` framfor å translitterere dem, så
 * id-en — som ER den offentlige URL-en — ble `akabs-snn`, `jakobs-sster` og
 * `fbe` (Føbe). Fem id-er hadde til og med et ordrett `ø` i seg, og to hadde
 * understrek. Alle adressene svarte 200, så dette er ikke et brudd som ble
 * rettet; det er dårlige adresser som virket, og som nå har blitt gode.
 *
 * Derfor 301 og ikke 404: adressene har vært indeksert og bokmerket. Samme
 * hensyn som for lesetekstene i #40 — en URL som har svart 200 skal ikke bare
 * forsvinne.
 *
 * Kartet er ENDELIG. Nye id-er kan ikke havne her, fordi feilen er rettet i
 * kilden — `nameToId` translittererer nå før NFD. Listen skal altså aldri vokse.
 */
export const PERSON_ID_ALIASES: Record<string, string> = {
  'abed-negoasarja': 'abed-nego-asarja',
  'abinadab-isais-snn-bror-av-david': 'abinadab-isais-sonn-bror-av-david',
  'adoramadoniram': 'adoram-adoniram',
  'ahasverusxerxes': 'ahasverus-xerxes',
  'akasja-akabs-snn-konge-av-israel': 'akasja-akabs-sonn-konge-av-israel',
  'amon-amon-byens-verste-i-samaria-under-kong-akab': 'amon-amon-byens-overste-i-samaria-under-kong-akab',
  'ananias-øversteprest': 'ananias-oversteprest',
  'baruk-sakkais-snn-gjenoppbygger-av-jerusalems-mur': 'baruk-sakkais-sonn-gjenoppbygger-av-jerusalems-mur',
  'benjamin_bilhan': 'benjamin-bilhan',
  'demosdemas': 'demos-demas',
  'den-blindfdte-mannen': 'den-blindfodte-mannen',
  'ehud_bilhan': 'ehud-bilhan',
  'ela-edomittisk-hvding-etterkommer-av-esau': 'ela-edomittisk-hovding-etterkommer-av-esau',
  'eleazar-sønn-av-annas': 'eleazar-sonn-av-annas',
  'eliab-eliab-snn-av-helon-leder-fra-sebulon-stamme': 'eliab-eliab-sonn-av-helon-leder-fra-sebulon-stamme',
  'elkana-snn-av-korah-korahittisk-levitt': 'elkana-sonn-av-korah-korahittisk-levitt',
  'enkens-snn-fra-nain': 'enkens-sonn-fra-nain',
  'er-snn-av-sjela-judas-snn-far-til-leka': 'er-sonn-av-sjela-judas-sonn-far-til-leka',
  'fbe': 'fobe',
  'filips-fire-dtre': 'filips-fire-dotre',
  'gomer-jafets-snn-stamfar-i-frste-mosebok-10': 'gomer-jafets-sonn-stamfar-i-forste-mosebok-10',
  'hananja-snn-av-serubabel-etterkomner-av-david': 'hananja-sonn-av-serubabel-etterkomner-av-david',
  'hiram-hiram-handverkeren-fra-tyros-bronsestperen-som-arbeidet-for-salomo': 'hiram-hiram-handverkeren-fra-tyros-bronsestoperen-som-arbeidet-for-salomo',
  'jair-snn-av-manasse-inntok-landsbyer-i-gilead': 'jair-sonn-av-manasse-inntok-landsbyer-i-gilead',
  'jesjua-oversteprest': 'jesjua-josva',
  'jetroreuel': 'jetro-reuel',
  'jeusj-snn-av-esau': 'jeusj-sonn-av-esau',
  'jonasjohannes': 'jonas-johannes',
  'jonatan-sønn-av-annas': 'jonatan-sonn-av-annas',
  'joram-snn-av-kong-toi-av-hamat-sendt-til-david': 'joram-sonn-av-kong-toi-av-hamat-sendt-til-david',
  'josef-barsabbasjustus': 'josef-barsabbas-justus',
  'josef-josef-i-jesu-ttetavle-lukas-3-25': 'josef-josef-i-jesu-aettetavle-lukas-3-25',
  'josesjosef': 'joses-josef',
  'jotam-jerubbaals-yngste-snn-som-overlevde-abimeleks-massakre': 'jotam-jerubbaals-yngste-sonn-som-overlevde-abimeleks-massakre',
  'judas-judas-jakobs-snn-stamfar-til-juda-stamme': 'judas-judas-jakobs-sonn-stamfar-til-juda-stamme',
  'kilabdaniel': 'kilab-daniel',
  'klopaskleopas': 'klopas-kleopas',
  'korah-esaus-snn-med-oholibama': 'korah-esaus-sonn-med-oholibama',
  'kvinnen-ved-brnnen': 'kvinnen-ved-bronnen',
  'lamek-metusaels-snn-etterkommer-av-kain': 'lamek-metusaels-sonn-etterkommer-av-kain',
  'levi-levi-snn-av-alfeus-tolleren-som-ble-kalt-av-jesus': 'levi-levi-sonn-av-alfeus-tolleren-som-ble-kalt-av-jesus',
  'maaka-snn-av-nahor-og-hans-medhustru-reuma': 'maaka-sonn-av-nahor-og-hans-medhustru-reuma',
  'maaseja-far-til-asarja-som-arbeidet-pa-muren-i-nehemja-323-snn-av-ananja': 'maaseja-far-til-asarja-som-arbeidet-pa-muren-i-nehemja-323-sonn-av-ananja',
  'mattatias-mattatias-i-jesu-ttetavle-snn-av-amos': 'mattatias-mattatias-i-jesu-aettetavle-sonn-av-amos',
  'mattias-sønn-av-annas': 'mattias-sonn-av-annas',
  'mesjachmisjael': 'mesjach-misjael',
  'naaman-snn-av-benjamin': 'naaman-sonn-av-benjamin',
  'nadab-jeroboams-snn-konge-over-israel': 'nadab-jeroboams-sonn-konge-over-israel',
  'neas': 'aeneas',
  'nereus-og-hans-sster': 'nereus-og-hans-soster',
  'netanel-snn-av-suar-leder-fra-jissakars-stamme': 'netanel-sonn-av-suar-leder-fra-jissakars-stamme',
  'reuel-snn-av-esau-og-basemat': 'reuel-sonn-av-esau-og-basemat',
  'sakarja-sønn-av-jeberekja': 'sakarja-sonn-av-jeberekja',
  'sidkia-snn-av-kenaana-profet-under-akab': 'sidkia-sonn-av-kenaana-profet-under-akab',
  'silassilvanus': 'silas-silvanus',
  'simon-jakobs-snn-med-lea-stamfar-til-simeons-stamme': 'simon-jakobs-sonn-med-lea-stamfar-til-simeons-stamme',
  'sjadrachhananja': 'sjadrach-hananja',
  'sjamma-snn-av-reuel-snnesnn-av-esau-og-basmat': 'sjamma-sonn-av-reuel-sonnesonn-av-esau-og-basmat',
  'sjammua-sakkurs-snn-spion-fra-rubens-stamme': 'sjammua-sakkurs-sonn-spion-fra-rubens-stamme',
  'sjetar-en-av-de-syv-fyrstene-fra-persia-og-media-som-sto-kong-ahasverus-nrmest': 'sjetar-en-av-de-syv-fyrstene-fra-persia-og-media-som-sto-kong-ahasverus-naermest',
  'sjobab-snn-av-kaleb-og-asuba': 'sjobab-sonn-av-kaleb-og-asuba',
  'tabitadorkas': 'tabita-dorkas',
  'tamar-absaloms-sster-davids-datter': 'tamar-absaloms-soster-davids-datter',
  'teofilus-sønn-av-annas': 'teofilus-sonn-av-annas',
  'tubal-snn-av-jafet': 'tubal-sonn-av-jafet',
  'ussiaasarja': 'ussia-asarja',
};

/**
 * Samme translitterering free-bible sin RETTEDE `nameToId()` gjør
 * (`generate/lib.ts`): små bokstaver, `æ`→`ae`, `ø`→`o`, `å`→`a`, NFD-stripping
 * av diakritiske tegn, og alt annet enn `[a-z0-9]` blir bindestrek.
 *
 * Brukt til å RETTE en peker som bærer den gamle formen, ikke til å lage nye
 * id-er — dem eier free-bible. Derfor er ett ledd i originalen med vilje utelatt:
 * `nameToId` fjerner også parenteser, fordi den får et VISNINGSNAVN inn. Her
 * kommer det en id inn, og å fjerne noe fra den ville endret hvem den peker på
 * framfor bare hvordan den staves.
 *
 * Rettingen er ikke en gjetning: den er bare gyldig når resultatet slår opp
 * EKSAKT i `persons` (se `personResolverFrom` i `person-refs.ts`).
 */
export function normalizePersonId(id: string): string {
  return id
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Adressen en person-id skal PRØVES som når den ikke slår opp — eller `null`
 * når det ikke finnes noen annen form å prøve.
 *
 * `PERSON_ID_ALIASES` over er et ENDELIG kart over 68 håndverifiserte former.
 * Det dekker ikke klassen saken er meldt på: en adresse som bærer et ordrett
 * `ø`/`æ`/`å` der basen har den translittererte id-en
 * (`jisreel-hoseas-sønn` → `jisreel-hoseas-sonn`, `johannes-døperen` →
 * `johannes-doperen`). De adressene er publisert — `.no` lenker dem fra 1184 av
 * sine personsider, og `johannes-døperen` er dessuten formen et menneske
 * skriver — så de skal 301-e, ikke 404-e. Samme argument kartet selv står på.
 *
 * `null` når id-en alt er kanonisk: uten det ville hvert oppslag hatt en
 * kandidat å prøve, og «finnes ikke» blitt en runde til mot basen for ingenting.
 *
 * **Den gjetter aldri.** Kandidaten er én deterministisk omstaving, og kalleren
 * skal kreve et EKSAKT treff i `persons` før den sender leseren dit — samme
 * krav `personResolverFrom()` stiller i ryddingen. `josef` normaliserer til seg
 * selv, og blir derfor aldri til en av de elleve `josef-*`.
 */
export function normalizedPersonId(id: string): string | null {
  const normalized = normalizePersonId(id);
  return normalized !== '' && normalized !== id ? normalized : null;
}
