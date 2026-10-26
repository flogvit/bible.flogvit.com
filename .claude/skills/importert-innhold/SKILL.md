---
name: importert-innhold
description: Sakene om importert innhold som peker på vers, kapitler eller kilder som ikke finnes (#46, #73, #58, kapittelantall, #92, #100, #111, #40). Les før du endrer import-bible.ts, schema.ts/ensureSchema, verse-refs.ts, reading-ref.ts, content-sources.ts eller sidene som viser importert innhold.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

### Importert innhold får ikke peke på et vers som ikke finnes (#46)

Kryssreferansene lenket til kapitler som ikke eksisterer: `Sal 119:36` sto som
`Ordsp 119:36`, og siden `reading.tsx` bygger BÅDE lenka og etiketten av samme
rad, så leseren «Ordsp 119:36» og fikk 404 på `/nn/ord/119`. 560 rader pekte
forbi siste kapittel, 182 unike døde mål lenket fra 136 kapittelsider — og med
språk-fallbacken serveres de under alle åtte prefiksene, altså ~1400 døde
URL-er en crawler når fra vanlige lesesider. GPTBot ga 400 404-er på én time.

Appen er uskyldig. Rotårsaken er generatoren i free-bible, som skriver
modellens svar uten å sjekke måladressen (flogvit/free-bible#26). Her ligger
porten som gjør at det ikke når prod uansett.

- **`src/lib/verse-refs.ts` eier lista og regelen.** `VERSE_REF_TABLES` og
  `CHAPTER_REF_TABLES` er ett sted, brukt både av ryddingen og av vakta.
- **Sannheten er `verses` med `bible = 'osnb'`** — den kanoniske
  versifiseringen `/nb/<bok>/<kapittel>` serveres fra, ikke leserens valgte
  utgave.
- **Start slettes, slutt klippes.** Finnes ikke STARTVERSET, peker raden på
  ingenting og slettes. Et SLUTTVERS som stikker forbi kapittelslutten
  («Sal 11:1-10» der Salme 11 har 7 vers) klippes i stedet til siste vers: det
  er en slurvete hale på en ellers riktig referanse, og å slette raden ville
  kastet innhold vi har.
- **Ett etter-pass, ikke femten porter.** Femten insert-løkker i
  `import-bible.ts` adresserer vers. Femten håndplasserte sjekker er femten
  steder å glemme neste gang. `pruneDanglingRefs()` kjører i stedet fra to
  steder: `ensureSchema()` (altså **hver deploy** — det er dette som rydder
  prod uten å vente på neste innholdsimport) og slutten av importen.
- **Ryddingen teller som en endring** og løfter sync-versjonen. Uten det ville
  mikrocachen servert den døde lenka i inntil en time til.
- **Importen rapporterer alltid det den kaster.** En import som stille dropper
  rader ser ut som en import uten problemer, og da er generatorfeilen usynlig
  for den som kjører den.
- **Vakta er `test/verse-integrity.test.ts`, og den har to halvdeler.** DATA:
  ingen rad peker utenfor `verses`. FORM: hver tabell i skjemaet som HAR en
  versadresse står i lista — lest ut av DDL-en i `TABLES`, ikke ført opp for
  hånd, så skjemaet ikke kan vokse fra vakta i stillhet. Unntak må ha en
  begrunnelse i `UNCHECKED_TABLES`. Alle fire vaktene er mutasjonstestet.

#### Adressen kan ligge i en JSON-BLOB, der kolonnesveipen ikke ser (#46)

Sveipen over leser KOLONNER, og FORM-halvdelen leter etter `book_id` +
`chapter` i DDL-en. Seks innholdstabeller har ingen slik kolonne — `persons`,
`stories`, `themes`, `reading_plans`, `number_symbolism`, `days` bærer adressen
inne i en JSON-blob — så de har aldri vært med, og løftet om at «skjemaet ikke
kan vokse fra vakta i stillhet» gjaldt bare halve lagringen. **282 døde
adresser** lå der: 276 i `persons`, 6 i `stories`.

- **Utslaget er todelt, og den STILLE varianten er den vanligste.**
  `persons.references[]` bygger en `<a href>` DIREKTE uten å slå opp om verset
  finnes, altså 404-stormen om igjen — den er tom i dag, men ingenting fanget
  den om den ble det. Resten går gjennom `getVersesWithOriginal()`, som
  `continue`-r på et vers som ikke finnes, så innholdet faller bort uten at noe
  ser galt ut: 128 nøkkelhendelser rendret som overskrift og beskrivelse uten
  ett eneste vers (`/nb/personer/epainetos` — fire hendelser, null vers), og
  `/nb/historier/susanna-frikjennes-av-daniel` var en `<h2>Daniel 13,1-64</h2>`
  over ingenting, fordi osnb følger protestantisk kanon med 12 kapitler.
  **En side som mangler innhold svarer 200 og skriver ingen loggrad** — derfor
  kunne bare en vakt formulert på KONTRAKTEN finne den. Samme klasse hull som
  #45, #65 og #69.
- **Samme regel som for kolonnene: start slettes, slutt klippes.** Et dødt
  startvers, eller en bok/et kapittel vi ikke har, feller adressen; et sluttvers
  eller sluttkapittel forbi slutten klippes; døde vers i en `verses`-liste
  filtreres bort mens de levende blir. Adressen er alltid et element i en liste,
  så «feller» betyr at elementet forsvinner — raden ellers bæres uendret videre.
  Susanna-sida beholder tittel og beskrivelse, og har bare ikke lenger en
  overskrift som lover en tekst vi ikke kan vise.
- **Tabellista er IKKE en ny liste.** Den er `CONTENT_SOURCES` fra #61, som
  allerede er fullstendighets-sikret av `person-refs.test.ts`, så en ny
  blob-tabell arver BEGGE sveipene gratis. To lister ville vært to steder å
  glemme den.
- **Kjøres fra de samme to stedene** — `ensureSchema()` (hver deploy, som rydder
  prod) og slutten av importen, som rapporterer det den kaster med peker til
  free-bible#26.
- **Vakta har tre halvdeler:** REGELEN (ren logikk, ti tilfeller), DATA (ingen
  blob peker på et vers som ikke finnes) og NØKLENE, som ikke kjenner et eneste
  nøkkelnavn — den finner objektene som bærer en bok-nøkkel og krever at hver
  TALL-nøkkel på dem er deklarert i `JSON_ADDRESS_KEYS`, så en ny `endVerseId`
  fra free-bible dukker opp av seg selv. `EXEMPT_ADDRESS_KEYS` er tom, og som
  `NORDIC_PROPER` er hver framtidig oppføring en påstand, ikke et gjemmested.
  Seks mutasjoner kjørt, inkludert hele veien injisert → rød → `init-db` → grønn.
- **Rendringen av en slik hendelse er tatt i #73 under.** Ryddingen gjør
  DATAENE ærlige; hva sida VISER når adressen er borte er en egen avgjørelse.

#### En blokk skal ikke love et skriftsted den ikke leverer (#73)

Ryddingen over etterlot `event.verses` tom framfor å peke dødt, og blokka
rendret like tom: `/nb/personer/epainetos` ga fire `class="event"` og null
`class="verse-group"`. 156 hendelser på 52 personsider (nb+en) mistet ALLE
versene sine.

- **Løftet lå i STILEN, ikke i teksten.** `.event-description` har en
  `border-bottom` og 16 px `padding-bottom` — en skillelinje som sier «under her
  kommer skriftstedet». Uten vers åpner den mot ingenting. `.event-no-verses`
  fjerner linja og lufta; markupen setter klassen når hendelsen ikke leverte et
  eneste vers.
- **Hendelsen SKJULES IKKE.** Beskrivelsen er ekte, kuratert innhold vi har
  («Epainetos beskrives som den første som ble omvendt til Kristus i provinsen
  Asia»), og på Epainetos ville alle fire forsvunnet — da hadde vi byttet ett
  tomt løfte mot et større. Samme avveining som «start slettes, slutt klippes» i
  #46 og «lenka faller, navnet blir stående» i #61: kast aldri innhold vi HAR
  for å bli kvitt en adresse vi ikke har. Leseren når dessuten teksten: samme
  side lister «Nevnt i Bibelen (1) → Romerne 16:5» fra `persons.references`,
  som har adressen i behold.
- **Vi skriver ikke «finnes ikke i denne utgaven».** For den STØRSTE klassen er
  det usant — Rom 16:5 ligger i utgaven vår, det er adressen som er borte fordi
  kilden staver den som bok 52 = 1 Tess (free-bible#26). En forklaring vi ikke
  kan belegge er en gjetning, og #61 gjetter aldri. Etter ryddingen kan vi
  uansett ikke skille «kanon har den ikke» (Tobias, Judas Makkabeus, Rafael —
  osnb er protestantisk) fra «vi mistet adressen»; å kunne det ville krevd at
  #46 beholdt den døde adressen.
- **Seksjonen var det STØRRE hullet, og lå utenfor det saken målte.** 97
  nb-personer har ingen nøkkelhendelser i det hele tatt og fikk
  `<h2>Nøkkelhendelser</h2>` over en tom `<div class="event-list"></div>`.
  Seksjonen rendres nå bare når det finnes hendelser — samme betingelse de
  andre seksjonene på sida alt har.
- **Vakta er `test/key-event-promise.test.ts`** og har fire halvdeler. REGELEN
  (ren markup: uten vers merkes, MED vers merkes ikke, og en hendelse der bare
  NOEN vers falt bort beholder de levende og merkes ikke). SEKSJONEN (ingen
  overskrift uten innhold — og motsatt, ellers ville «fjern seksjonen helt»
  bestått). DATA (hver hendelsesblokk på hver personside som faktisk har en
  slik hendelse har enten vers ELLER merket, aldri begge og aldri ingen; sidene
  velges av DATAENE som i #70, så en ny innholdsrunde flytter målingen selv).
  FLATA måler i ekte Chrome at merket faktisk VIRKER: beregnet
  `border-bottom-width` og `padding-bottom` er 0 uten vers og større enn 0 med.
  Den halvdelen finnes fordi #55 er nettopp fella — en klasse stilarket ikke
  honorerer ser riktig ut i en HTML-sammenligning og endrer ingenting for
  leseren. Seks mutasjoner kjørt.

### En innholdstabell hvis KILDE er borte skal ikke bli stående (#58)

Samme klasse som #46 og #61, men én etasje opp: der handler det om en ADRESSE
som ikke finnes, her om at hele KILDEN til et innholdsslag er borte.
`syncDeletions` rydder rader som forsvinner fra en kildekatalog, men når
katalogen selv forsvinner gir `contentLanguages()` bare `[]`, løkka hopper over,
og radene blir stående. free-bible slettet `generate/important_verses`
2026-07-29, og 62 rader drev `/kjente-vers` i månedsvis etterpå — med nøyaktig de
feilene kilden ble slettet for (`Sal 46:1` ga overskriften «Til kordirigenten»
framfor «Gud er vår tilflukt», fordi fila brukte europeisk versnummerering der
osnb følger hebraisk). Importen sa «ingen endringer» hver gang: en manglende
katalog ser ut som ingenting nytt.

- **`src/lib/content-sources.ts` eier koblingen tabell → kildekatalog.**
  `CONTENT_TABLES` bor der og ikke i importskriptet, som ikke kan importeres av
  en test (det EKSEKVERER). Hver eid tabell må ha enten en kilde eller en
  begrunnet plass i `SOURCELESS_TABLES` — en ny innholdstype arver sjekken
  gratis.
- **Rapport, ikke rydding.** En feilsatt `FREE_BIBLE_DIR` ser ut som «alle
  kildene er borte», og automatisk sletting ville da tømt basen.
- **Mangler HELE kildetreet, er diagnosen en annen.** Kjørt i et arbeidstre
  peker standard `FREE_BIBLE_DIR` (`../free-bible` fra cwd) på ingenting:
  importen leste null filer, skrev null rader og sa «Ingen endringer … Ferdig!»
  med exit 0. Da navngir rapporten katalogen og `FREE_BIBLE_DIR` framfor å liste
  33 tabeller, og skriptet avslutter med 1. **Sett `FREE_BIBLE_DIR` eksplisitt
  når du importerer fra et arbeidstre.**
- **`/kjente-vers` gikk UT framfor å bli skrevet om.** «Kjent vers» er et
  kulturfaktum, ikke en egenskap ved teksten, og free-bible#22 målte at
  referansegrafen ikke kan erstatte lista (null overlapp mellom topp-100
  innkommende referanser og de 49). Å plukke 62 vers på nytt her ville vært den
  samme kildeløse lista én gang til. Kravene til en gjeninnføring — egen tekst,
  hebraisk nummerering, per språk, kildeangivelse — står i free-bible#22.
- **410, ikke 404.** Adressen sto i navigasjonen og i sitemapen, altså er den
  indeksert og bokmerket. 404 sier «ikke her nå» og blir prøvd igjen; 410 sier
  «fjernet med vilje». `GonePage` (`misc.tsx`) forklarer det for leseren som kom
  fra et bokmerke; ingen `noindex`, for statuskoden er allerede direktivet.
- **Tabellen droppes av `dropRemovedTables()` i `runMigrations()`**, altså ved
  HVER deploy — samme plassering som ryddingen i #46 og #61.
  `CREATE TABLE IF NOT EXISTS` kan bare legge til, så en tabell som bare fjernes
  fra `TABLES` blir stående med alle radene i hver eksisterende base.
- **Å fjerne en side er mer enn å slette en rute.** Sida lå i navigasjonen, i
  kommandopaletten, på hurtigtast K, blant oppdagelseskortene, i verktøylista på
  /om, i sitemapen og i åtte ordbøker. `test/removed-pages.test.ts` er vakta, og
  invariantene er formulert på SIDEN (410 på alle åtte prefikser, ute av
  sitemapen, ingen side i `PAGES` lenker dit, ingen klient-øy navigerer dit,
  ingen ordboksnøkler igjen, tabellen borte etter `ensureSchema()`) — en ny
  oppføring i `REMOVED_PAGES` arver alle seks.
- **410-siden står i `PAGES`** med `status: 410`. En side som ikke står i
  matrisen står utenfor alle invariantene (#63), og en fjernet side rendrer
  fortsatt HTML.

### Kapittelantall har ÉN sannhet: `books-data.ts` (#46, bifunn)

Kapittelantallet lå i to hardkodede lister som var uenige om Joel — 3 i
importens egen bokliste, 4 i `books-data.ts` — og de leses fra hver sin kant:
`sitemap-paths.ts` og kapittelruta går på `books-data.ts` (så `/nb/joel/4`
svarer 200 og ligger i sitemapen), mens `reference-parser.ts` går på
`books`-TABELLEN og avviste «Joel 4:1» med «Joel har 3 kapitler». En
bidragsyter på `/bidra` fikk altså nei på en referanse siden serverte.

Den norske versifiseringen følger hebraisk (Joel 4 kapitler, Malaki 3), og
`verses` er enig. Importens liste bærer derfor ikke lenger `chapters` —
`books-data.ts` er kilden, og `syncBookChapters()` i `runMigrations()` holder
`books.chapters` i takt ved hver deploy (importen kjøres bare ved
innholdsoppdatering, så den alene ville latt prod ligge med feil tall).
`verse-integrity.test.ts` låser de tre — `books-data.ts`, `books.chapters` og
`verses` — til hverandre, og sjekker at det genererte `verse-counts.ts` ikke
har drevet fra basen.

### En lesning som KRYSSER et kapittelskille er ikke to halve (#92)

`/nb/lesetekster/2026-08-09` sa «Jes 64,6b-65,2@dnb2024» og viste ETT vers —
Jes 63,1, «Hvem er dette som kommer fra Edom». Versparseren i importen leste
bare endepunkter UTEN kapittel, så «6b-65:2» ga null spenn, og fallbacken «ingen
versspesifikasjon = hele kapittelet» slo inn og satte inn vers 1 av kapittelet
startverset havnet i. **11 lesedager sto slik**, blant dem hele
lidelsesfortellingen langfredag (Matt 26,30-27,50, Mark 14,26-15,37,
Joh 18,1-19,42). Utslaget er stille som i #45, #65 og #73: sida svarer 200,
blokka er full av tekst, ingen loggrad — bare den som slår opp i tekstrekka ser
at det er FEIL tekst.

- **`src/lib/reading-ref.ts` eier adressen.** Den lå i `import-bible.ts`, som
  EKSEKVERER og derfor ikke kan importeres av en test (samme grunn som
  `content-sources.ts`, #58) — og den samme regelen trengs to steder til.
- **REGELEN har to former, og det er ikke pynt.** Innenfor ETT kapittel
  oversettes lesningen VERS FOR VERS som før: en mapping kan flytte enkeltvers
  ulikt inne i et kapittel, og en utgave som bare oversatte ENDENE ga et annet
  svar for 4 av de 626 lesningene — Rom 9,20-24 krympet fra fem vers til ett.
  KRYSSER den et kapittelskille, kan den ikke telles vers for vers: vi vet ikke
  hvor KILDENS kapittel slutter, bare vårt eget. Da oversettes endene, og
  spennet fylles ut mot `verse-counts.ts`, altså den kanoniske versifiseringen
  `pruneDanglingRefs()` alt klipper mot (#46).
- **Reparasjonen kjøres fra `ensureSchema()`**, altså hver deploy — samme
  plassering og samme grunn som #46 og #61. En fiks bare i importen ville aldri
  nådd leseren: `reading_texts` importeres på nytt bare når KILDEFILENE endrer
  seg, og tekstrekkene ligger fast i årevis.
- **Den er SMAL med vilje:** bare rader som bærer fallbacken (`verse_end IS
  NULL`) mens adressen NAVNGIR vers. En bredere regel — «skriv om alt som ikke
  stemmer med dagens mapping» — ville i tillegg flyttet seks lesninger som er
  importert med en eldre mappingfil, og det er et annet spørsmål enn dette.
- **Etiketten bygges av VERSENE, ikke av markupen.** Referanselinja sto som
  `Jes 64,6b-65,2@dnb2024`: mapping-id-en er en intern nøkkel leseren verken
  trenger eller kan tolke. Å bare STRIPPE den ville gjort etiketten pen og
  fortsatt gal — versene rendres i leserens valgte nummerering, så en etikett i
  kildens lover et annet sted enn blokka viser. `formatVerseRefLabel()` bygger
  den av de samme versene som står under den, og kan da ikke lyve (#73).
  Kapittelskillet slås sammen bare når forrige vers ER kapittelets siste, ellers
  ville «Rom 9,2-5» + «Rom 10,1-4» blitt til «Rom 9,2-10,4».
- **Vakta er `test/reading-ref-cross-chapter.test.ts` og har fire halvdeler.**
  REGELEN (adressene leses ut av BASEN som i #70 og #80: ingen adresse som
  navngir vers får falle til «hele kapittelet», og en kryssende må dekke begge
  kapitlene uten hull). REPARASJONEN (defekten seedes og rettes, den er
  idempotent, og en adresse som VIRKELIG er hele kapittelet røres ikke). SIDA
  (sveip over hver lesningsblokk: etiketten bærer ingen `@`, og den navngir
  nøyaktig det første og siste verset blokka leverer — lest som ADRESSER, ikke
  som delstrenger, siden «10,1-4» ikke inneholder teksten «10,4»). DEPLOYEN
  (`runMigrations` kaller reparasjonen — ellers kjøres den aldri i prod, og
  fiksen er usynlig for leseren uten at noe blir rødt). Åtte mutasjoner kjørt.
- **En RESTANSE, ikke løst her:** `sliceVersePart` gir tom streng for 8 av 29
  del-adresser (`64,6b`, `Matt 1,20b`, `Rom 10,8b` …), og verset forsvinner da
  stille fra lesningen. Derfor begynner denne lesningen på 64,7 og ikke på 64,6b.
  Det gjelder også lesninger innenfor ett kapittel og er en egen sak.

#### En nummerering vi ikke HAR feller ikke deployen (#100)

`parseReadingRefMarkup()` gjorde `resolveMappingId(system) || system` og rakte
systemnavnet fra kilden rått videre til `loadUkvnMapping()`, som er
`readFileSync` uten fallback. En id vi ikke har en fil for ble derfor et
ubehandlet ENOENT-kast midt i parsingen — ordrett signaturen saken er meldt på,
`open '<sti>/mappings/osnb2.ukvn.json'`.

- **Prisen er en DEPLOY, ikke en side.** `repairWholeChapterReadingRefs()`
  kjøres fra `ensureSchema()` ved hver deploy (#92) og har ingen `try`. Én slik
  rad feller `bun scripts/init-db.ts`, som deployen kjører fra det nye imaget
  FØR restart — da står hele appen uten utrulling til noen finner raden.
  Importen fanger sitt eget kast per referanse, så der er prisen bare at
  lesningen mister versene sine.
- **Triggeren er en omdøping i KILDEN.** free-bible døpte `osnb2`→`osnb`
  2026-07-26 (se «Bibel-ID-er»); `main` fulgte med for bibel-id-ene, men
  systemnavnet i `display_ref` leses fortsatt rått. Den neste omdøpingen
  trenger ingen kodeendring hos oss for å bli et kast.
- **Null, ikke en gjetning.** Fila lover selv null når markupen ikke lar seg
  lese (#61), og en nummerering vi ikke har ER en markup vi ikke kan lese:
  hvert vers måtte oversettes gjennom nettopp den mappingen.
- **Katalogen leses ÉN gang** (1158 filnavn, 1,5 ms) — bare navnene, ikke
  filene, så dette er ikke `getAvailableMappings()`-fella fra #19.
- **Reparasjonen RAPPORTERER det den lot stå**, med systemnavnet, og importen
  navngir det samme. En stille skip ser ut som «ingenting å rette», og da er
  omdøpingen usynlig til lesningen står uten vers — samme regel som i #46.
- **Vakta er `test/reading-ref-unknown-mapping.test.ts`** og har tre halvdeler.
  REGELEN (id-ene velges av FILKATALOGEN, ikke av strengen «osnb2», og en id vi
  HAR leses fortsatt — ellers ville «alltid null» bestått). DEPLOYEN
  (reparasjonen kaster ikke, lar raden stå, retter fortsatt den ekte, og
  rapporten navngir systemet UTENFOR adressen). DATA (ingen `display_ref` i
  basen peker på en mappingfil som ikke finnes). Sju mutasjoner kjørt.
- **Dette flytter ikke `.no`.** Symptomet i saken er målt på
  `bibel.flogvit.no`, som serveres fra `bibel-no` — der står `osnb2` hardkodet i
  ~20 filer, og hva flata skal være er avgjørelsen i #98.
- **Svaret for `.no` ER skrevet, og det ligger på `origin/bibel-no`.** To
  commits fra 2026-08-24: `59f5cb4` retter de fire MAPPING-id-ene bak
  `OSNB_MAPPING_ID`, `915e2f6` legger vakta `api/lib/verse-mapper.test.ts`. De
  ~20 andre `osnb2`-stedene er BIBEL-id-en og skal bli stående — de to aksene
  delte en streng, ikke en betydning. **Ikke skriv fiksen på nytt.** Den er
  rullet ut 2026-10-23 med Node 22-bumpen (#145, tagg `20261023-160240-6bba96f`).
  Hva som skal skje med den frosne flata videre er avgjørelsen i #98.

#### En fiks som bare finnes på ÉN disk er ikke levert (#111)

De to commitene over lå sju døgn i den lokale `bibel-no` uten å finnes på noen
remote — skrevet, testet og meldt som bygget, mens `git branch -r --contains`
ga tomt. Ingenting sa fra: treet var rent, `bun test` var grønt, og CLAUDE.md
pekte på dem som om de var levert. En disk som ryker, eller en `reset` på feil
gren, tar dem med seg.

- **Ingen automatikk så dit.** Orkesterets `bergning` sveiper `smie/*` og
  `testsmie/*`; en `bibel-no`-utsjekk faller utenfor begge. Det hullet ligger i
  orkesterrepoet — her ligger porten som gjør at bibel selv oppdager det.
- **Vakta er `test/upushet-arbeid.test.ts`** og har fire halvdeler. REGELEN
  (ren logikk: en commit uten remote OG uten plass i HEAD er alene — begge
  veier, og en SHA som ikke resolver er et ANNET repos commit, ikke vår å
  svare for). GRENA (hver lokal gren som ikke er en arbeidsgren finnes på en
  remote). DOKUMENTASJONEN (hver commit-SHA CLAUDE.md peker på likeså — det er
  slik disse to ble funnet). INGEN STILLE SKIP (det må finnes grener og SHA-er
  å måle, ellers ville «returner tom liste» bestått). Seks mutasjoner kjørt.
- **Unntaket er ARBEIDSGRENEN (`smie/*`, `testsmie/*`), ikke HEAD.** Det er
  arbeid under utførelse, som skallet leverer — uten unntaket ville vakta vært
  rød i hver eneste kjøring, altså ingen vakt. Men et HEAD-unntak ville gjort
  den blind for nettopp denne saken: en `bibel-no`-utsjekk er sin egen HEAD.
- **Den leser LOKALE remote-refs, ikke nettet.** En vakt som må ut på nettet er
  treg og flakete i en merge-port. Prisen er at en foreldet ref kan gi falsk
  rødt (branchen ER pushet, refen er gammel — `git fetch` retter det); den
  motsatte, farlige retningen krever at noen sletter grenen på GitHub.

### En offentlig URL skal ALDRI bære en auto_increment-id (#40)

Importen sletter og setter inn på nytt, og MySQL fortsetter tellingen der den
slapp. `/lesetekster/<id>` flyttet derfor HELE settet ved hver
innholdsoppdatering: bokmerker, delte lenker og indekserte adresser døde i takt
med innholdet (103 distinkte døde ID-er på én time i loggen, i et sammenhengende
område en crawler gikk gjennom).

- **Lesedagen adresseres av datoen** — `/lesetekster/2026-12-25`. Flere
  lesetekster kan dele en dato (Julenatt og Juledag); siden viser dem alle, og
  lista har ett kort per dato.
- Gamle numeriske adresser 301-er til datoen så lenge raden finnes. Bare DENNE
  generasjonen kan løses opp — en gjetning ville sendt leseren til en tilfeldig
  annen lesedag.
- **`uq_reading_texts` (dato, navn, serie, språk)** er den naturlige nøkkelen.
  Kildefilene dekker KIRKEÅR og overlapper med kalenderåret (`2025-2026.json`
  går ut 2026, `2026-2027.json` starter i november 2026), så 18 lesedager lå
  doble i basen og ble vist som doble kort. Importen dedupliserer på samme
  nøkkel med SENERE fil som vinner, og `dedupeReadingTexts()` i `schema.ts`
  rydder eksisterende baser før nøkkelen legges på.
- Legger du til en ny detaljside for importert innhold: adresser den med noe
  kilden eier (dato, slug), aldri med rad-id-en.
