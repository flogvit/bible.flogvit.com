# Bibel — Bun + Hono (main)

Full omskriving av bibel-appen: Bun + Hono + hono/jsx SSR + vanilla JS-øyer, Bun.sql
(mysql-adapter) mot MySQL. FLOGVITs egen instans kjører på **bible.flogvit.com**.

> Dette repoet inneholder APPEN, ikke hvordan FLOGVIT deployer den. Miljøspesifikke
> skript (VM, registry, env-filer) bor i driftsrepoet vårt og er bevisst holdt utenfor.

## Endringslogg — `RELEASE.md`

`RELEASE.md` er en lesbar logg over hva som faktisk kom ut til brukerne, på
**engelsk**, med fire kategorier: `New features`, `Polish`, `Bug fixes`,
`Behind the scenes`. Nyeste post øverst, datert — ingen versjonsnummer.

**Den skrives som en del av deploy, aldri etterpå.** Rangen er
`git log $(git describe --tags --abbrev=0)..HEAD` — deploy-taggen er ankeret.
Kuratér: les diffene og skriv hva brukeren *ser*, ikke commit-emnene. De fleste
commitene i en runde hører hjemme i én ærlig linje under `Behind the scenes`.

Hele sekvensen (rekkefølge, tagging, hva som skjer ved feilet deploy) står under
«deploy <navn>» i driftsrepoets README.

## Oppsett
- **`bun run oppsett`** — fersk klone eller nytt arbeidstre. Stager kvn-pakken og
  kjører `bun install`. `bun install` ALENE er ikke nok, se neste avsnitt.
- Eneste runtime-dependency er `hono` + lokal `@free-bible/kvn`.
- `.env` (gitignort): `DB_PORT=3326` for lokal DBngin-MySQL (instansen «generic»,
  som ALLE produkter deler siden 2026-07-30 — se `flogvit.com/lokal-db.sh`).
  Uten `.env` faller testene tilbake til 3306 og 33 DB-tester feiler på «Access
  denied»; et ferskt arbeidstre trenger derfor en `.env` (den er gitignort og
  følger ikke med).
- Prod-DB: managed MySQL (db-flogvit) via `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.

### kvn-package/ er en VENDRET kopi — hvitlista eier hva som er i den (#62)

`@free-bible/kvn` er en `file:`-avhengighet. Katalogen er gitignort (`mappings/`
alene er 109 MB) og må fylles fra `../free-bible/kvn` før `bun install`.

**Det sto som en setning her før — «stages fra `../free-bible/kvn/`» — og det er
for lite til å handle på.** En agent i et ferskt arbeidstre leste den som
«kopier hele kvn-repoet» og fikk med `tests/`, `data/`, `scripts/`, `research/`
og `node_modules/`. `bun test` fra bibel-roten går inn i `kvn-package/` og kjørte
da free-bibles 17 egne testfiler, som leser et råkorpus
(`kvn/../../generate/bibles_raw/osnb`) som ikke finnes her og aldri skal finnes
her. Ingen så det hjemme, for der er katalogen riktig staget:

```
bibel/       bun run test  ->     568 tester,  0 fail, 31 filer
arbeidstre/  bun run test  ->  360 859 tester, 36 fail, 48 filer
```

36 røde tester ingen kunne fikse fra bibel. **Smia bygde hver sak ferdig,
forkastet den med «RØDT», og gjorde den om igjen neste runde** — i repoet med
flest issues i køen.

- **`scripts/kvn-staging.ts` eier hvitlista**: `src`, `mappings`, `package.json`,
  `tsconfig.json`. En HVITLISTE, ikke en svarteliste — en ny katalog i free-bible
  blir holdt ute gratis, mens en svarteliste måtte utvides hver gang.
- **`bun run oppsett`** = `stage-kvn.ts` + `bun install`. Stagingen **river** alt
  som ikke står i hvitlista, så en tidligere full kopi ryddes framfor å bli
  liggende ved siden av den nye — og den sier høyt hva den fjernet.
- **`test`, `typecheck` og `dev` kjører `ensure-kvn.ts` først.** Det er ikke
  pynt: `bun install` klarer ikke å bootstrappe en `file:`-avhengighet som ikke
  ligger der ennå, og **avslutter med 0** mens den sier «Failed to install 1
  package». `preinstall` redder det ikke — bun resolver `file:`-stier før
  livssyklusskriptene — og bun KOPIERER pakka inn i `node_modules` (109 MB, ikke
  symlink), så det holder ikke å fylle katalogen etterpå. `ensure-kvn` sjekker
  både at pakka er installert OG at inventaret er rent, og reparerer begge.
- **Ikke legg stagingen i `preinstall`.** Dockerfilen kjører `bun install` før
  `COPY scripts ./scripts`, i et lag der free-bible uansett ikke finnes.
- **Vakta er `test/kvn-staging.test.ts`**, og den er strukturell: inventaret må
  være nøyaktig hvitlista, og ingen `*.test.ts` får ligge der `bun test` går inn.
  Mutasjonstestet ved å kopiere inn `tests/` og `data/` på nytt.
- Deployen (`server/deploy-bibel-hono.sh`) kaller samme skript framfor å ha sin
  egen kopiliste. Gamle `.no`-appen (branch `bibel-no`) har fortsatt sine egne
  `cp`-linjer — den branchen har ikke skriptet.
- Porten på orkester-siden er `flogvit-com#40`: smias `finnTestporter` regnet
  `kvn-package/` som en komponent i bibel og krevde free-bibles suite grønn. En
  vendret `file:`-avhengighet er ikke en komponent, og telles ikke lenger.

## Kommandoer
```bash
bun run oppsett        # fersk klone/arbeidstre: stager kvn + bun install
bun run dev            # utviklingsserver (--watch)
bun test               # tester
bun run typecheck      # tsc --noEmit
bun scripts/init-db.ts        # opprett skjema
bun scripts/import-bible.ts   # importer innhold fra ../free-bible/generate/ (inkrementell, --full for alt)
bun scripts/generate-verse-counts.ts  # regenerer src/lib/verse-counts.ts fra DB
bun scripts/enrich-story-references.ts # berik historier i free-bible med evangelieparalleller
```

## Lokal innlogging (konto uten DB)
konto kan kjøres lokalt med in-memory store — full login/sync-flyt uten å røre noen DB:
```bash
cd ../konto && DB_DISABLED=1 PORT=3020 bun src/index.ts   # kontoer forsvinner ved restart
```
bibel-dev peker allerede på http://localhost:3020 (session.ts). Registrer en bruker med
`POST http://localhost:3020/api/auth/register {email, password}` (eller via UI-et) —
fv-session-cookien deles på localhost på tvers av porter, så bibel ser innloggingen og
sync mot lokal MySQL virker.

## Innholdsoppdatering

Bibeldata er DERIVERT og regenererbart — det ligger aldri i imaget, og importeres
separat mot databasen:

```bash
bun scripts/init-db.ts        # opprett/løft skjema
bun scripts/import-bible.ts   # importer innhold fra free-bible (inkrementell, --full for alt)
```

Kun import-eide innholdstabeller røres — aldri brukertabeller. Kilden resolveres via
`FREE_BIBLE_DIR` (default: søsterkatalogen `free-bible`).

> Hvordan FLOGVIT ruller dette ut til sin egen prod er miljøspesifikt og bor i
> driftsrepoet, ikke her.

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

### Importert innhold får ikke peke på en PERSON som ikke finnes (#61)

Samme klasse som #46, én akse over. Beviset kom fra .no-appen, som henter
familien over API-et: `/api/persons/gomer` svarte 200 med
`children: ["jisreel-hoseas-sønn", …]`, og `/api/persons/jisreel-hoseas-sønn`
svarte 404 — **API-ets eget svar annonserte en id API-et selv ikke kunne
servere**. Sju av sju API-404-er i loggvinduet hadde vår egen side som referer.

.com har samme rot, med to ulike utslag. Persondetaljen slår opp familien
server-side og hopper STILLE over det som ikke finnes, så leseren mister et
familiemedlem uten at noe ser galt ut. Ættetavlene i `chapter_insights` lenker
derimot rett ut: `/nb/matt/1` lenket «Tamar» til `/personer/tamar`, som er 404.
Personen finnes — hun heter `tamar-juda`. Åtte språkprefikser, fra en av de
tettest personlenkede sidene vi har.

- **`src/lib/person-refs.ts` eier lista og regelen.** `PERSON_REF_KEYS` er
  NØKKELEN, ikke stien: `personId` ligger på fire dybder i insight-JSON-en
  (`sections[].persons[]`, `footer.links[]`, `persons[]`, `heroes[]`), og en ny
  insight-type med samme nøkkel arver regelen gratis.
- **Sannheten er `persons.name`** — kolonnen `/personer/<id>` slår opp i — lest
  gjennom SAMME fallback-kjede som spørringen (`contentLanguageChain`). En
  nb-rad som peker på en person vi bare har på engelsk er derfor ikke død.
- **Kan adressen RETTES, rettes den — sletting er siste utvei.** Første utgave
  hadde bare ett svar, «fjern», og det er feil for den største klassen: av 90
  døde peker-id-er målt på .no var 16 slike vi HAR, bare stavet på den gamle
  måten (`jisreel-hoseas-sønn` mot rada `jisreel-hoseas-sonn`, `na'ama` mot
  `naama`). Der slettet ryddingen en ekte familierelasjon for å bli kvitt en
  adresse den kunne rettet. `personResolverFrom` gir derfor den KANONISKE
  id-en framfor ja/nei, i tre trinn som alle krever et EKSAKT treff i
  `persons`: id-en som den står → `PERSON_ID_ALIASES` (de 68 håndverifiserte
  fra free-bible#25, altså formene translitterering ikke kan redde —
  `akabs-snn` mangler bokstaven helt) → `normalizePersonId()`, som gjør
  nøyaktig det free-bible sin rettede `nameToId` gjør (ø→o, æ→ae, å→a).
  Rapporten skiller rettet fra fjernet: «fjernet 16 lenker» der den rettet dem
  beskriver en annen hendelse enn den som skjedde.
- **Lenka faller, navnet blir stående** — når den ikke kan rettes. En død
  adresse nulles (skalar) eller filtreres ut (liste); raden bæres uendret
  videre. «Tamar» står fortsatt i ættetavlen, bare ikke som lenke —
  `PersonLink` uten id gir ren tekst, en form dataene alt bruker («Peres»,
  «Hesron»). Samme avveining som «start slettes, slutt klippes» i #46: kast
  aldri innhold vi HAR for å bli kvitt en adresse vi ikke har.
- **Den gjetter aldri.** `tamar` kunne vært `tamar-juda`,
  `tamar-absaloms-datter` eller `tamar-absaloms-soster-davids-datter`. Samme
  grunn som at bare ÉN generasjon leseteksts-id-er kunne løses opp i #40.
  Rettingen bryter ikke med dette: den er en deterministisk omstaving med
  eksakt treff, ikke et valg mellom kandidater. `josef` normaliserer til seg
  selv, vi har elleve `josef-*`, og ingen av dem velges — den adressen dør.
- **Begge personflatene honorerer samme alias-kart.** Kartet lå bare på
  `/personer/:personId`, så `/api/persons/:id` slo opp rått: de 68 rettede
  id-ene 301-et for en leser som klikket og 404-et for en klient som hentet
  dem — samme adresse, samme app, to svar. Seks av dem har et ordrett `ø` og
  kommer inn som `%C3%B8`, altså nøyaktig formen saken er meldt på. Queryen
  bæres over redirecten, ellers svarer neste kall på gulvspråket (#24).
- **Ett etter-pass, fra to steder** — `ensureSchema()` (altså hver deploy, som
  rydder prod) og slutten av `import-bible.ts`. Sveipen går over ALLE
  innholdstabellene med en JSON-blob, ikke bare de to som har adresser i dag.
- **Ryddingen teller som en endring** og løfter sync-versjonen, ellers ville
  mikrocachen servert den døde lenka i inntil en time til.
- **Vakta er `test/person-refs.test.ts` og har fem halvdeler.** REGELEN (ren
  logikk: skalar nulles, liste filtreres, alt annet står), RETTINGEN (en
  ø-adresse rettes framfor å forsvinne, en uredelig id slettes fortsatt, og
  rapporten skiller de to), DATA (ingen rad i noen innholdstabell peker på en
  person som ikke finnes — hele basen, ikke bare `PAGES`), FORM (ny tabell med
  JSON-blob og ny adressenøkkel må deklareres) og SIDA (`/nb/matt/1` og
  `/en/matt/1` rendret, hver personlenke svarer 200). API-flata har sin egen i
  `person-id-aliases.test.ts`: ingen gammel id får 404-e over API-et når sida
  sender den videre. Nøkkel-halvdelen kjenner ingen nøkkelnavn: den finner
  nøkler hvis verdier stort sett slår opp i `persons`, så en ny adressenøkkel
  oppdages uten at noen har ført den opp. Alle vaktene er mutasjonstestet —
  også de to grenene i resolveren, hver for seg.

> **`bibel.flogvit.no` får IKKE disse fiksene, og det er ikke en forglemmelse.**
> Saken over er meldt på .no, som er frosset på branch `bibel-no`. Alt her ligger
> på `main`, altså hono-appen bak `bible.flogvit.com`. En fiks på `main` kan
> ikke nå .no — den ble merget og saken lukket 2026-07-31 på nettopp den
> misforståelsen, og gjenåpnet av prod-vakten 2026-08-02 med beviset fortsatt
> rødt på .no. Hva som skal skje med den frosne flata (301 til .com, tine opp
> branchen, eller la den stå) er en avgjørelse, ikke en kodeoppgave — den bærer
> merket `beslutning` sammen med søskensakene #48 og #49. **Lukk den ikke fra
> en commit på `main`.**

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

## Språkdimensjon (innhold)

Alt derivert innhold ligger i basen med en **`language`-kolonne som er del av
unik-nøkkelen**, så flere språk kan ligge side om side. Kontrakten bor i
`src/lib/lang.ts`; les den før du rører språk.

- **Kilde på disk:** `free-bible/generate/<type>/<språk>/`. Importøren *oppdager*
  språk ved å lese katalogene (`contentLanguages()`), så **et nytt språk krever
  ingen kodeendring** — bare en ny katalog. free-bibles `translate.ts` skriver
  nøyaktig denne strukturen (kildespråk `nb` → `<språk>`).
- **To akser, ikke bland dem:** UI-locale (URL-prefiks, der norsk er `no`, se
  `portal/I18N.md`) vs innholdsspråk (`nb`/`nn`/`en`, katalognavn og kolonneverdi).
  Bruk `localeToContentLanguage()` i overgangen.
- **Fallback:** `contentLanguageChain()` — forespurt → nabospråk → **engelsk,
  som er terminalt** (#26, endret fra `nb` 2026-07-29). `nn`→`nb`→`en`, altså
  nabospråk før basespråket. Mangler noe også på engelsk, vises INGENTING
  framfor norsk tekst på en side som ikke er norsk; norsk-spesifikt innhold
  (`important_verses`, `reading_texts`) blir dermed tomt på andre språk, og det
  er riktig. `bible.ts` sin
  `inLanguage()` kjører spørringen per ledd og tar første som gir treff, altså
  fallback per SPØRRING (mangler et innholdsslag språket helt, får leseren hele
  settet på fallback-språket framfor en tom side).
- **Enhver spørring mot en språk-scopet tabell MÅ filtrere på språk.** Uten
  filter plukker den en tilfeldig rad blant språkene. Getterne i `bible.ts`
  defaulter til **`currentContentLanguage()`**, som leser locale fra
  `contextStorage()` — samme mekanisme som `lhref()`. En getter som defaultet
  til et FAST språk gjorde «glemte å sende lang» til et usynlig valg: siden
  rendret fint, bare på feil språk. Det var nøyaktig det som skjedde — kun
  `reading.tsx` sendte språk videre, så alle de andre sidene serverte norsk
  innhold under `/en/` selv om det engelske lå i basen.
- **Skriv aldri rå SQL mot en innholdstabell i en rute.** `/leseplan` gjorde
  det og hadde ikke noe språkfilter i det hele tatt. Bruk getterne.
- **Unntak (med vilje):** `books`/`verse_mappings` har egne språkakser;
  `verses`/`word4word` er scopet av `bible` (oversettelses-id, som koder språk);
  `reading_text_refs` arver språk fra forelderraden (surrogat-nøkkel).
- **`content_hashes`** har også `language`, med `nb` som default. Derfor beholder
  eksisterende rader nøkkelen sin, og språknøytralt innhold (kapitler, word4word)
  føres på gulvet — en ny språkkolonne utløser altså ingen full reimport.
- **Migrering:** `ensureSchema()` kjører `runMigrations()` etter CREATE-ene, som
  legger til kolonnen og bytter nøklene idempotent. `CREATE TABLE IF NOT EXISTS`
  treffer bare nye baser, så skjemaendringer på eksisterende tabeller MÅ uttrykkes
  der. Kjør `bun scripts/init-db.ts` for å løfte en base.

### En side som ikke finnes på et språk skal ikke annonseres der (#45)

Hreflang-klyngen ble generert generisk fra STIEN, uavhengig av om innholdet
fantes i språket. `reading_texts` ligger bare på `nb` — med vilje, se over — så
hver norsk lesedag annonserte alle åtte språk, og **sju av dem var 404**.
Feilloggen gikk fra ~50 rader i timen til 1542, hvorav 1228 var nettopp disse
(168 datoer × 7 språk = 1176). Vi *lenket* dem ikke i navigasjonen, men en
crawler trenger ingen lenke når `<link rel="alternate">` sier at siden finnes.

- **`Layout` tar `locales`** — språkene siden faktisk finnes på. Utelatt = alle
  åtte, som er sant for alt annet.
- **Lista utledes, ikke vedlikeholdes:** `localesWithContent()` (`lang.ts`)
  krysser innholdsspråkene i basen mot `contentLanguageChain()`, altså samme
  regel spørringen følger. `['nb']` → `nb` + `nn` (nabospråk før basespråket).
  Et nytt importert språk slår gjennom uten kodeendring.
- **`x-default` må ligge INNENFOR settet.** Det er adressen Google velger når
  ingen språkvariant passer; pekte den på engelsk for en norsk-bare side, sendte
  vi hver uplasserbar leser til en 404.
- Vakta i `page-contract.test.ts` sjekker invarianten, ikke tilfellet: **hver
  annonserte URL svarer 200.** Den fanger dermed neste innholdsslag som mangler
  et språk. Detaljsiden kan ikke ligge i `PAGES` — den 404-er under `/de/`, som
  er hele poenget — så den har sin egen oppføring.
- Ikke gjort, bevisst: `/en/lesetekster/<dato>` 302-er IKKE til `/nb/…`, og
  `/lesetekster`-OVERSIKTEN oppgir fortsatt alle åtte (den svarer 200 overalt,
  bare med tom liste). Begge er produktbeslutninger, ikke SEO-feil.

### Bibel-ID-er: `osnb`/`osnn` (omdøpt fra `osnb2`/`osnn1` 2026-07-26)

free-bible omdøpte de to norske grunntekstene. ID-en er ikke bare en streng i
koden — den ligger i `verses.bible`, `word4word.bible`, `bible_editions.id`,
`verse_mappings.id`, `user_bibles.mapping_id`, som prefiks i
`content_hashes.content_key` (`osnb-1-1`), og i brukerens synkede innstillinger.

- **Basen migreres** av `renameBibleIds()` i `schema.ts` (idempotent, kjøres av
  `ensureSchema`). `UPDATE IGNORE` + `DELETE`: finnes målraden alt, er den nye
  autoritativ.
- **De gamle ID-ene lever videre utenfor basen** — i bokmerker, delte lenker og
  eldre klienters localStorage. Alt som kommer utenfra går derfor gjennom
  `normalizeBibleId()` (`bible.ts`); `public/js/sync.js` migrerer den lokale
  cachen tilsvarende. **Ikke fjern aliasene** uten å vite at ingen lenker igjen.
- **Rekkefølge ved utrulling:** kode FØR data. Skjemamigreringen og
  ID-renamingen må kjøre før restart; ruller du data først, får basen nye ID-er
  mens gammel kode spør etter de gamle → blank side.

### KILDE: pass på riktig free-bible
Import leser `$FREE_BIBLE_DIR` (default: `flogvit.com/free-bible`, som er en **symlink**
→ det ekte `../free-bible`-repoet). Historisk felle: `flogvit.com/free-bible` var en
egen, stale klon — standard-importen leste da feil data og rapporterte «0 endringer».
Symlinken fikser dette; sett `FREE_BIBLE_DIR` eksplisitt om du er i tvil.

## Contrib (bruker-innsendte artikler/bøker)

Brukere melder inn verk med versreferanser på `/bidra` (krever konto, IKKE
plus); innsendinger lagres i **brukertabellen** `contrib_submissions` og
reviewes via free-bibles filbaserte skript. Full runbook:
`../free-bible/contrib/README.md` (pull → check → review → export → apply →
import). Nøkkelregler:

- **KVN-regelen:** bidragsyter oppgir kun `raw` + `context_translation`;
  kvnFrom/kvnTo (bit-shift-`encode()`, Esra 3:1 = 15740944 — ALDRI
  `ukvnEncode`) fylles av free-bibles pipeline/reviewer.
- Transport mot DB-en er `scripts/contrib-pull.ts`/`contrib-apply.ts` over
  de token-gatede endepunktene `/api/contrib/pending|apply` —
  `CONTRIB_TOKEN` må ligge i `bibel.env` (prod) / `.env` (dev). Uten env
  finnes ikke endepunktene.
- Godkjente bidrag blir `free-bible/generate/verse_works/<workId>.json`,
  importeres til innholdstabellene `works`/`work_verse_refs`, og vises som
  «Litteratur» i versdetaljen (presise treff) og studium-blokka
  (kapittel-/bok-nivå).

## Deling av manuskripter (GitHub #15, del 1)

`/delt/<token>` viser ett manuskript til hvem som helst — **ingen konto, ingen
sesjon**. Lenken ER tilgangen (capability-URL), og det styrer alt:

- **Tokenet lages på serveren** (32 byte `crypto`, base64url) og bor i
  `devotional_shares`. Ikke i localStorage: en delt lenke må virke for en
  mottaker uten konto, altså kan den ikke bo hos avsenderen.
- **Ett levende token per manuskript** (UNIQUE på `user_id, item_id`). «Del» er
  idempotent; «Ny lenke» ERSTATTER og trekker dermed tilbake den gamle. To
  gyldige lenker til samme tekst ville gjort «trekk tilbake» til en løgn.
- **Nøkkelen er sync-item-id-en** (`dev-<ts>`), ikke slugen — slugen er avledet
  av tittelen, og en delt lenke skal ikke dø av at noen endrer overskriften.
- **Tilbaketrekking må virke UMIDDELBART.** Derfor står siden utenfor
  mikrocachen (`NEVER_CACHED` i `page-cache.ts` — med en times TTL ville en
  cachet kopi overlevd tilbaketrekkingen) og sendes med `private, no-store`.
- **Ukjent, tilbaketrukket og slettet gir samme svar: 404.** Et eget «trukket
  tilbake» ville bekreftet at tokenet en gang var gyldig. Slettet manuskript =
  `sync_items.deleted = 1`, og det filteret er en del av tilgangskontrollen.
- **`noindex`**, og ikke i sitemapen (`sitemap-paths.ts` lister bare faste
  sider).
- **Å DELE er plus** (husking=plus, altså må teksten være lagret i skyen); **å
  LESE er gratis**. Samme akse som resten av appen.

## Åpen katalog for manuskripter (#15, del 2)

`/manuskripter/katalog` er motstykket til den skjulte lenken: alt er listbart,
offentlig og indekserbart. Det er nettopp derfor det er review — alt som er
listbart, er verdt å spamme. Logikken bor i `lib/publications.ts`.

**Runbook: `REVIEW.md`** — kommandoene, hva du faktisk vurderer, og hva hver
avgjørelse gjør med katalogen og med forfatteren. Under her står bare hvorfor
modellen ser slik ut.

**Review-modellen er manuell godkjenning av hver publisering.** Minst å bygge,
og den kan VOKSE uten å rives: «betrodd konto etter N godkjente» er et spørsmål
mot de samme radene, og etterhånds-moderering er rapportknappen som allerede står
der. Kø og avgjørelse går over token-gatede endepunkter (`REVIEW_TOKEN`, uten
env FINNES de ikke) og `scripts/publications-review.ts` — samme mønster som
contrib, aldri direkte DB-tilgang og aldri engangscontainere på VM-en.

- **Teksten fryses ved innsending** (`title`/`content` i tabellen). Reviewen
  godkjenner en TEKST, ikke et løfte: leses manuskriptet live fra `sync_items`,
  kan en godkjent forfatter bytte det ut med reklame etterpå, og godkjenningen
  blir en vaskeritjeneste. Redigering endrer derfor ikke katalogen — ny
  innsending gjør, og den går tilbake til `pending`.
- **Sletting virker likevel.** Både lista og detaljen JOIN-er mot `sync_items` og
  krever `deleted = 0`. Øyeblikksbildet er for integritet, ikke for å holde på
  noe eieren har fjernet.
- **Adressen er `slug` = tittel-slug + seks tilfeldige tegn**, og er
  primærnøkkelen. Ingen auto_increment i en offentlig URL (#40), ingen bruker-id
  å telle bakover fra, og adressen overlever at tittelen endres. Ny innsending
  BEHOLDER slugen, så en delt lenke ikke dør av en retting.
- **Rapporter skjuler ingenting av seg selv** — tallet er et signal til den som
  reviewer. Auto-skjuling ved N rapporter ville vært et nedtakingsvåpen for hvem
  som helst. Rapportering krever ingen konto: den som ser noe galt er sjelden
  innlogget.
- **HELE katalogen står utenfor mikrocachen** (`NEVER_CACHED`), ikke bare
  detaljen. En tittel er også tekst noen kan ha reagert på, så «teksten er borte,
  men overskriften står i en time» er ikke moderering. Prisen er liten: én
  spørring mot en liten tabell, ikke 1189 kapittelsider.
- **Ruterekkefølge:** `catalog.tsx` monteres FØR `user.tsx` i `pages.tsx`, ellers
  sluker `/manuskripter/:slug` katalogen. `test/publications.test.ts` pinner det.
- Bare LISTA ligger i sitemapen. Enkeltoppføringer kommer og går med review og
  tilbaketrekking, og en sitemap full av adresser som forsvinner er verre enn
  ingen (#42-lærdommen).
- **Å PUBLISERE er plus** (teksten må være lagret i skyen), **å LESE er gratis**.

### En URL med QUERY er en handling, ikke en side (#60)

12 × 503 på én time. Ikke nedetid — lastvernet under gjorde jobben sin. Det som
dyttet semaforen over kanten var vår EGEN HTML: hver kapittelside lenket to
sider per vers uten `rel="nofollow"`, `/bidra?vers=sal-94-1` og
`/manuskripter/ny?vers=sal-94-1`. 31 167 vers × 2 familier × 8 språkprefikser =
**498 672 crawlbare URL-er mot 1 189 kapittelsider** — en flate ~420 ganger
større enn innholdet, der ingen av adressene ER innhold. Hver er unik, altså
cache-miss, altså en render-plass. GPTBot sto for 68 % av all trafikk i vinduet,
72 % av den mot `/bidra?vers=`, på 1,7 req/s — permanent rett under de 1,8 req/s
#19 slo fast at velter siden. Googlebot fikk 6,7 s på `/en/2kor/11`.

- **Regelen er lenken, ikke lenkefamilien.** `relFor(path)` (`lib/crawl.ts`)
  tar hele STIEN og gir `nofollow` når den bærer query. Da avgjør stien selv, og
  en bryter som peker query-løst når valget er default («skru av undertekst» →
  `/sal/94`) blir fortsatt fulgt — det er den kanoniske adressen. `Breadcrumbs`
  kaller den selv framfor å ta imot et prop, så en ny smule arver regelen.
- **`nofollow` og `robots.txt` er to forskjellige jobber.** `nofollow` stopper
  OPPDAGELSE; robots stopper HENTING av det crawleren allerede kjenner — og
  GPTBot hadde et halvt million adresser fra før. Begge trengs.
- **Forby QUERYEN, ikke stien.** `Disallow: /*?vers=` treffer alle åtte
  prefiksene i én linje. Sti-varianten har to feller, begge mutasjonstestet:
  `Disallow: /bidra` er et rent no-op (prefiksmatch, og alle ekte adresser er
  prefikset), mens `Disallow: /*bidra` treffer — og tar `/bidra` selv med seg,
  en side som STÅR i sitemapen. Samme for `/*manuskripter/ny`, som ville stengt
  `/manuskripter/nytt-liv-a1b2c3` ute av den åpne katalogen (#15).
- **`?q=` er bevisst UTELATT fra robots.** Søkesiden skal deindekseres, og der
  er `noindex` direktivet (#41) — et robots-forbud ville hindret crawleren i å
  SE det. Lenkene dit er `nofollow`, så nye søke-URL-er oppdages ikke uansett.
- **Visningsvalgene teller også.** `?bible=`/`?secondary=`/`?mapping=` lenker
  kapittelet til seg selv, og prev/neste bærer valget videre: uten merking går
  crawleren hele Bibelen på nytt per kombinasjon, i den DYRESTE renderen vi har.
- **`noindex` på `/bidra?…`, ikke på `/bidra`.** Betingelsen er queryen, ikke
  den enkelte parameteren, så en ny måte å åpne siden på arver regelen.
  Canonical peker query-løst av seg selv (`Layout` bruker `path`), men canonical
  er et hint — `noindex` er direktivet. Manuskript-editoren er `noindex` uansett:
  en tom skriveflate bak innlogging er aldri svaret på et søk.
- **`public/robots.txt` er SLETTET.** `seoRoutes` monteres før `serveStatic`, så
  ruta har vunnet hele tiden; to kilder til samme sannhet er fella fra #42.

**Vakta er todelt.** Sidekontrakten (invariant 6 og 7) gjelder HVER side i
`PAGES`: en intern lenke med query må bære `nofollow`, og robots.txt må avvise
den. Formulert på lenken, så en ny handlingslenke fanges uten at noen fører den
opp. `crawl-surface.test.ts` holder på det målte tilfellet (Sal 94, også rendret
MED query så prev/neste-fella fanges) og på det sveipen ikke kan se: **ingen URL
i sitemapene er forbudt av vår egen robots.txt.** `test/robots.ts` er en ekte
RFC 9309-matcher (`*`, `$`, lengste treff vinner) — en vakt som bare lette etter
en STRENG ville bestått på en regel som ser riktig ut uten å treffe.

**Ikke gjort, med vilje:** ingen Caddy-blokk av GPTBot. Den er en beslutning om
en navngitt tredjepart og hører hos Vegard — og punkt over løser årsaken framfor
symptomet: flata var for stor for Googlebot også.

## Delekortet — hva en delt lenke faktisk viser (#65)

Flata deklarerte ingen `og:image` i det hele tatt, så hver lenke noen delte på
Facebook, LinkedIn, Slack, iMessage eller Discord ble et kort med tittel og
beskrivelse **uten bilde**. Målt i prod på forsiden og på `/en/matt/5`.

**Ingen kunne se det innenfra, og det er sakens egentlige lærdom.** Siden svarer
200 og ser riktig ut; en manglende meta-tagg gir verken 404, 5xx eller en
logglinje. Prod-vakten kunne per konstruksjon aldri fanget det — `usage_errors`
inneholder bare FEIL. Hullet finnes utelukkende utenfor produktet, hos noen som
ennå ikke har klikket. Samme klasse hull som #45 og #60: skaden skjer der vi
ikke ser den, og bare en vakt som er formulert på KONTRAKTEN finner den.
Tverrgående sak med målingen for alle åtte flatene: `flogvit-com#74`.

- **Kortet står i SIDEMALEN, ikke per rute.** `layout.tsx` deklarerer det som
  standard for alle sider. Legges det per side, mangler det på den ruta noen
  legger til i morgen — og da er vi tilbake til å oppdage det utenfra.
- **`src/lib/share-card.ts` eier adressen og målene.** Målene er en del av
  kontrakten, ikke pynt: uten `og:image:width`/`:height` må skraperen HENTE
  bildet før den vet om det kan vises bredt, og den FØRSTE delingen av en URL —
  den som betyr noe — blir uten bilde.
- **Adressen er absolutt.** En relativ sti resolves ikke av alle skrapere.
- **`twitter:image` er bevisst utelatt.** X faller tilbake på `og:image`, så
  taggen ville vært duplisering med to steder å glemme å oppdatere. `twitter:card`
  må derimot stå — uten `summary_large_image` vises et 1200x630-bilde som en
  liten firkant ved siden av teksten.
- **`og:image:alt` går gjennom ordboka.** Den er tekst en skjermleser leser opp,
  altså brukervendt tekst. Den leses dessuten av norsk-sveipene i
  sidekontrakten, som nå tar den sammen med `<title>` og description — et
  attributt på en `<meta>` var usynlig for begge de gamle sveipene.
- **KILDEN til bildet er HTML**, `assets/og/card.html`, rastrert av
  `bun scripts/generate-og-card.ts` i samme headless Chrome som layout-vakta.
  En binær fil noen laget i et bilderedigeringsprogram kan ikke diffes, og da
  er neste endring en ny fil ingen kan sammenligne med den forrige. Runbooken
  er `assets/og/README.md`.
- **Kortet ligger i `public/`, ikke i objektlagring — og det er en RESTANSE,
  ikke et valg.** Porteføljeregelen er at bilder hører i objektlagring, også
  systeminnhold. Bøtta `bibel` finnes ikke, og en bøtte er en beslutning om
  skyprosjekt, region og kostnad (`flogvit.com/CLAUDE.md`), ikke noe en
  kodeendring kan ta. `OG_IMAGE_URL` er flyttelasset: last opp bildet, sett
  variabelen i `bibel.env`, ferdig. Ingen kodeendring — og testen holder
  knappen i live så den virker den dagen den brukes.
- **Per-side-kort er et eget og senere steg.** Ingen ubrukt `shareCard`-prop
  ligger og venter på det; generisk kort først, ellers venter hele flata på den
  mest arbeidskrevende varianten.

**Vakta er todelt.** Sidekontraktens invariant 8 sveiper HVER side i `PAGES` —
absolutt `og:image`, målene 1200x630, en alt-tekst, og `twitter:card` — så en ny
side arver kortet uten at noen har tenkt på det. `test/share-card.test.ts` tar
det sveipen ikke kan se: at bildet FINNES, at det er en PNG med nøyaktig de
målene sidemalen deklarerer (lest ut av IHDR-chunken, ikke antatt), at appen
serverer det med validator, og at `OG_IMAGE_URL` faktisk flytter det. Alt-testen
er strukturell som brødsmulevakta i #63 — en hardkodet literal rendres ordrett
likt på fire ubeslektede språk. Alle vaktene er mutasjonstestet.

## Lastvern (anonyme sidevisninger)

`src/lib/page-cache.ts` er både mikrocache OG lastavvisning (#4, #14): anonyme
GET-HTML-sider caches, og render over semafor-taket får utløpt cache-innhold
(stale) eller 503 + `Retry-After: 30` etter kort kø. Innloggede går alltid
utenom. Env: `RENDER_MAX_CONCURRENT` (6), `RENDER_QUEUE_WAIT_MS` (3000),
`PAGE_CACHE_TTL_MS` (1 time), `PAGE_CACHE_VERSION_CHECK_MS` (30 s) og
`DB_POOL_MAX` (default 5 — sett den etter hva databasen din tåler; en for liten
pool var nettopp det som ga 502 under samtidighet).

**Taket beskytter RESPONSTIDEN, ikke bare mot kollaps (#19).** 24 samtidige
render på én delt vCPU betyr at hver enkelt tar 24× så lang tid: natt til
2026-07-29 svarte vanlige kapittelsider på 8–29 sekunder mens semaforen «holdt».
Riktig utfall under overlast er raske 503-er til noen få, ikke 20-sekunders svar
til alle. Standarden er derfor lav og skal MÅLES, ikke gjettes oppover.

**TTL-en er en time, med invalidering på innholdsversjon.** Innholdet endres bare
ved import, og en crawler går gjennom samme URL flere ganger i timen (5289
forespørsler over 1068 unike stier i hendelsen). Cachen leser `db_meta.sync_version`
med jevne mellomrom gjennom en INJISERT leser (`setContentVersionReader`, satt i
`index.ts`, ikke i `createApp()` — cachen skal kunne testes uten DB) og tømmer seg
selv når versjonen endres. Feiler spørringen, BEHOLDES cachen: den er det eneste
som fortsatt kan svare.

### Taket verner RENDEREN — ikke alt som passerer middlewaren (#64)

`withPageCache` er montert på `*`, så `/robots.txt` sto bak semaforen som alle
andre og fikk **503** natt til 2026-08-02: 1 av 7 hentinger, `Retry-After: 30`,
varighet nøyaktig 3,003 s (= `queueWaitMs`).

Det er selvopphevende. robots.txt er **bremsen** på lasten som utløste
avvisningen: `#60` la `Disallow: /*?vers=` der nettopp for å få crawlerne bort
fra handlingsflata, og den regelen virker bare hvis crawleren får LESE fila.
Kortvarig 5xx på robots.txt får de store til å stanse crawlingen av hele siten
en stund; vedvarende 5xx (Google: over ~30 dager) tolkes som `Disallow: /`. **Jo
hardere crawlen presser oss, desto mindre sannsynlig er det at den som presser
får se at vi ba den la være.**

- **Utslaget var større enn saken beskrev.** Målt sto også alle 50 filene i
  `public/` bak semaforen: en leser som fikk sida fra CACHEN (`x-cache: hit` —
  som ikke bruker en plass) kunne få 503 på `/styles.css` rett etterpå. Å skjære
  bort en filutlevering for å berge en SSR-render er nøyaktig baklengs.
- **Felles for dem: de kan aldri fylle cachen.** Bare `text/html` caches, så de
  KOSTER en plass og GIR ingenting tilbake — ren kostnad i akkurat det øyeblikket
  kapasiteten er knapp. Og de er billige, målt: 0,02 ms (robots.txt), 0,35 ms
  (`/styles.css`), 3,3 ms for den dyreste sitemapen (ren strengbygging, ingen DB)
  mot ~47 ms + DB for en kapittelside. Sitemapene er heller ingen crawl-flate:
  9 URL-er mot 1 189 kapittelsider (`#60`).
- **Regelen er FILNAVNET, ikke en liste over ruter.** `NOT_A_PAGE` i
  `page-cache.ts` er samme skille `app.ts` allerede bruker for å avgjøre at en
  sti med punktum ikke er en side (den 404-er framfor å bli forhandlet inn i et
  språk). En ny SEO-rute eller en ny fil i `public/` arver omgåelsen gratis —
  en `ALWAYS_THROUGH`-liste ville vært ett sted til å glemme.
- **Ingen siderute har punktum i stien**, og det er en forutsetning for regelen,
  ikke en tilfeldighet: manuskript-slugene er `[a-z0-9-]`, lesedagene er datoer,
  kapitlene er `/<bok>/<n>`. Adresserer du en ny detaljside, hold den punktumfri.
- **Det ene som følger med:** en ukjent sti MED punktum (`/foo.php`) rendrer
  404-siden utenom taket. Den koster 1,15 ms uten DB og ble uansett aldri cachet
  (status ≠ 200), altså samme regnestykke.
- **Ikke gjort:** ingen memoisering av sitemap-XML-en. 1,09 MB × 8 språk = ~8,7 MB
  permanent heap for noe som hentes en håndfull ganger i døgnet — samme avveining
  som det bevisste unntaket i `getAvailableMappings()` (`#19`).

**Vakta er `test/load-shedding.test.ts`** og har fire halvdeler. Den setter
`maxConcurrentRenders: 0` — semaforen alltid full — og spør hva som kommer
gjennom. De to første kjenner ingen sti-liste: de leser **rutetabellen**
(`seoRoutes.routes`) og **katalogen** `public/`. Den tredje krever at en ekte
side fortsatt skjæres bort, ellers ville «fjern hele lastvernet» bestått. Den
fjerde importerer `NOT_A_PAGE` og krever at ingen sti i sitemapen eller i `PAGES`
ser ut som en fil. Alle fire er mutasjonstestet, også mot den smale fiksen som
bare slipper `/robots.txt` gjennom.

### Kapasitet: profilér før du skrur på tak (#19)

En CPU-profil av kapittelrenderen (`bun --cpu-prof --cpu-prof-md`) viste at **85 %
av tiden gikk til `readFileSync` + `JSON.parse`** — ikke til SSR og ikke til
databasen. `getAvailableMappings()` (verktøylinja på hver kapittelside,
`/innstillinger`) leste ALLE 1158 KVN-mappingfilene, ~109 MB JSON, ved hvert
kall. Kapittelrender: **~350 ms → ~47 ms**.

- Mapping-filene går nå gjennom `mappingFile()` i `verse-mapper.ts`, som cacher
  per id. **Kall aldri `loadUkvnMapping` direkte** — `test/verse-mapper-cache.test.ts`
  har en strukturell vakt mot nettopp det.
- **Ett unntak, med vilje:** listebyggingen i `getAvailableMappings()` bruker den
  ucachede loaderen, fordi den bare trenger navn og antall oppføringer. Gjennom
  fil-cachen ville alle 1158 blitt liggende (93 MB heap, 409 MB RSS målt).
- **Per-vers-dataene hentes PER KAPITTEL** (grunntekst, undertekst, ord-for-ord,
  kryssreferanser). Løkka i `loadChapterData` gjorde fire spørringer per vers —
  704 rundturer på Sal 119. Lokalt målte de 8–33 ms og var altså ikke
  flaskehalsen, men mot en managed database over nett er latensen en annen, og
  da er antallet rundturer selve kostnaden. Bruk `getReferencesByVerse()` /
  `getOriginalWord4WordByVerse()`; per-vers-getterne lever videre for API-ene.
  - Nøkkelen er **osnb-kapittelet**, ikke det viste: med en KVN-mapping kan ett
    visningskapittel spenne over to osnb-kapitler (amharic2000, Sal 51 → 51+52),
    så batchingen går per distinkt osnb-kapittel.
  - Bivirkning som er en forbedring: referanse-fallbacken gjelder nå per
    kapittel, ikke per vers. Før kunne ett vers uten norske referanser falle til
    de ENGELSKE mens resten av kapittelet sto på norsk.
  - `test/chapter-batching.test.ts` holder de to formene like rad for rad, og
    har en strukturell vakt mot at et per-vers-kall sniker seg inn i løkka igjen.

## Lesesporing (GitHub #16)

`/lesekart` viser hvor i Bibelen brukeren faktisk leser. **Lesing er en HENDELSE,
ikke en tilstand** — `{ firstAt, lastAt, count, opens, verses? }` per kapittel, så
gjenlesing gir framdrift i stedet for «allerede lest», og varmekartet kan vise
intensitet. `firstAt`/`lastAt = null` betyr «lest, tidspunkt ukjent» (bulk-markert
historikk) og holdes utenfor tidslinje/ferskhet framfor å gjettes inn.

- **Kjernelogikken bor i `public/js/reading-progress.js`** — en ren ES-modul som
  IMPORTERES BÅDE av klienten (`reading.js`, `user.js`, `sync.js`) og av serveren
  (`routes/sync.ts`, `lib/reading-map.ts`). Terskler og flettregler finnes ett sted;
  ikke dupliser dem.
- **`sync.ts` har `MERGERS`** — datatyper som må flettes framfor å overskrives.
  `readingProgress` bruker en kommutativ merge (maks på tellere, ytterpunkter på
  tidspunkt, union på delvis leste vers), fordi nyeste-vinner ville latt én enhet
  slette en annens framdrift. Klienten fletter med SAMME funksjon (`spec.merge` i
  `sync.js` MAP).
- **Måling: tid per VERS, ikke per side.** Total tid + total dekning som
  uavhengige betingelser kan oppfylles hver for seg (parker fanen, scroll til
  bunns). Per-vers-attribusjon + Page Visibility + tak per vers fjerner begge
  hullene. Gulvet er kalibrert mot en rask leser (~550 wpm): falske negativer
  er dyrere enn falske positive, fordi kartet er brukerens eget.
- **`readTracking`-innstillingen** (`suggest` standard / `auto` / `manual`):
  `manual` måler INGENTING — verken lesing eller åpning. Det er en
  personvern-kontroll, ikke bare en preferanse.
- **Alt er pull.** Statistikken bor på en side brukeren oppsøker. Ingen varsler,
  ingen påminnelser. Gamification (streaks/merker/nivåer) er et bevisst
  NON-GOAL — vil man presses, velger man en leseplan.
- **En leseplan er et SPØRSMÅL MOT KARTET.** `/lesekart` foreslår påbegynte
  planer («Romerbrevet — du mangler 3») og `/leseplan` viser hvor mye av hver
  plan som alt er lest. Begge går gjennom `planCoverage()`/`suggestedPlans()` i
  `reading-map.ts`, som tar kapittelsettet inn STRUKTURELT — modulen er ren og
  testes uten database.
  - **Planene gjenbrukes som lister** (`getReadingPlanChapterSets()`), framfor en
    egen kuratert datafil: `reading_plans.content` bærer allerede eksplisitte
    `{bookId, chapter}`, er kuratert og importeres per språk. En parallell fil
    ville duplisert kurateringen, lagt til enda en ting å oversette, og drevet
    fra planene over tid. Dag-inndelingen kastes: planen er en RUTE, kartet
    spør om DEKNING.
  - **Dekningen endrer ikke planens eget dag-regnskap.** Den er en opplysning
    («12 av 16 lest fra før»), ikke en avkryssing brukeren ikke har gjort —
    fri lesing teller dermed uten at «hvor langt er jeg i planen» blir tvetydig.
  - Upåbegynte planer foreslås ikke: forslaget skal si «du er nesten i mål»,
    ikke gjengi katalogen — den står på `/leseplan`.

## Testene — fire nivåer og hva hvert av dem faktisk fanger

Kjør `bun test` og `bun run typecheck` før du ruller ut. FLOGVITs eget deploy-skript
gjør dette automatisk og avbryter ved rødt.

1. **Ren logikk** — `reading-progress.test.ts`, `lang.test.ts` osv. Rask, ingen DB.
2. **Sidekontrakt** — `page-contract.test.ts`. En SVEIP: hver invariant sjekkes mot
   ALLE sidene i `PAGES`. Dekker prefiksede lenker, `<html lang>`, hreflang-klynge,
   canonical, ordboks-fullstendighet og sitemap. **Ny side ⇒ legg den i `PAGES`; ny
   invariant ⇒ den gjelder umiddelbart for alle sidene.**
3. **Klient-øyene** — `islands.test.ts` (happy-dom). Dekker DOM-wiringen i
   `public/js/` som ellers bare kjører i nettleser. IntersectionObserver og plus-porten
   stubbes/lastes eksplisitt, så målingen kan drives deterministisk.
4. **Layout i en EKTE nettleser** — `mobile-layout.test.ts`. De tre over kan ikke
   se bredde: SSR-HTML har ingen layout, og happy-dom returnerer nuller fra
   `getBoundingClientRect()`. Kjører hele `PAGES` i headless Chrome og krever at
   ingen side er bredere enn skjermen. Krever Chrome installert (`CHROME_BIN`
   overstyrer); den HOPPER IKKE stille over seg selv om den mangler.

`PAGES` bor i `test/pages.ts` og deles av nivå 2 og 4 — én oppføring gir en ny
side dekning under begge sveipene.

**Velg sider etter KOMPONENT, ikke etter URL.** 1 Mos 1 har ingen personer, så
studieblokka for personer rendres ikke der — en uprefikset lenke i den blokka slapp
gjennom kontrakten helt til mutasjonstesting avslørte det. Derfor ligger `/1mos/12`
(personer + profetier) og `/matt/1` (evangelieparalleller) også i matrisen.

**Verifiser nye vakter ved å gjeninnføre feilen de skal fange.** En test som ikke blir
rød av mutasjonen er verdiløs. Alle fire vaktene her er sjekket slik, og det
gjelder også fiksene: da #50 ble rettet, ble hver enkelt CSS-endring satt
tilbake for seg og vakta skulle bli rød. Én av dem ble det IKKE — en regel som
skjulte det lukkede menypanelet — og den ble derfor fjernet framfor å bli
stående som udokumentert pynt ingen test holder i live.

**En DB-test må hente poolen PER KALL, aldri på modulnivå.** `const sql =
getSql()` øverst i en testfil tar vare på instansen som fantes ved import;
`closeSql()` i en HELT ANNEN testfil nuller den ut, og den første fila feiler da
med «Connection closed» — i to filer som ikke har med saken å gjøre. Bruk
`getSql()` inne i hver test/hook, og la de filene som allerede lukker, lukke.

**Grense:** happy-dom lar seg ikke patche der `plus.js` overstyrer
`localStorage.setItem`, så den stille skrivesperren for gratisbrukere må verifiseres i
en ekte nettleser. Den brukersynlige porten (klikk registrerer ingenting) er dekket.

## Ingen side skal være bredere enn skjermen (#50)

Leseren skrur opp tekststørrelsen i TELEFONENS tilgjengelighetsinnstillinger
(Android: «Tekstskalering», 133–150 %). Det er ikke sidezoom: sidezoom
forstørrer alt proporsjonalt og går alltid bra, mens tekstskalering
multipliserer BARE skriftstørrelsen. Bokser, `min-width`, `padding` og
grid-spor står stille i px, og innholdet vokser ut av kassa. Ti av ti målte
sider ble bredere enn skjermen, verst kapittelsiden med +26 %; `/innstillinger`
var 503 px på en 390 px-skjerm allerede ved 100 %.

- **`min-width: 0` på alt** (`styles.css`, helt øverst). Grid- og flex-barn har
  `min-width: auto` — «aldri smalere enn min-content» — og det gulvet vokser med
  teksten. Det er hovedmekanismen: den ene regelen tok lesesiden fra 493 til
  404 px. `<fieldset>` er dekket av samme regel: den arver `min-width:
  min-content` fra nettleserens EGEN standardstil, og det var hele forklaringen
  på /innstillinger.
- **Gulv i `rem`, aldri i px.** `minmax(min(7.5rem, 100%), 1fr)`, ikke
  `minmax(120px, 1fr)`. `min(…, 100%)` hindrer at gulvet er bredere enn sporet;
  `rem` gjør at gulvet FØLGER teksten, så rutenettet går til én kolonne når det
  må. Alle tolv rutenettene i CSS-en er lagt om.
- **`nowrap` bare på ATOMÆRE verdier** — et årstall, en dato. En kategori er en
  frase: «The Resurrection and Exaltation of the Messiah» er 252 px alene, og da
  hjelper ingen radbryting. Norsk skjulte dette; vakta kjører basespråket
  engelsk og avslørte det.
- **Rader med tittel + meta bryter** (`flex-wrap: wrap`), også chrome-headeren.
  Wordmark og konto-chip SKAL være `nowrap` og `flex-shrink: 0` — en avkortet
  merkevare hjelper ingen — så det er rada som må gi etter. WCAG 1.4.10 sier
  nettopp at innhold skal flyte om framfor å scrolles sidelengs.
- **Ingen magisk høyde.** Mobilpanelet lå på `position: fixed; top: 3.25rem`,
  altså headerens høyde ved 100 % tekst. Det tallet er feil i samme øyeblikk
  rada brytes — altså nøyaktig i tilfellet dette handler om. Panelet er nå
  forankret til headeren med `position: absolute; top: 100%`.
- **En tabell scroller SELV** framfor å gjøre siden bred: pakk den i en
  `overflow-x: auto`-wrapper, slik `.stat-table-wrap` alltid har gjort.
- **Lange ord brytes** (`overflow-wrap`) i brødtekst. En URL i en `<p>` på /om
  satte gulvet for hele siden.

**Vakta er `test/mobile-layout.test.ts`**, og den måler i ekte Chrome fordi
bredde er en egenskap ved rendringen. Invarianten er én linje —
`scrollWidth <= clientWidth` — sjekket for hver side i `PAGES` på 320 og 390 px,
ved 100 % og 150 % tekst. 320 px dekker både iPhone SE og iOS' «Display Zoom»,
som krymper det logiske viewportet i stedet for å skalere skrift.
Feilmeldingen navngir det bredeste elementet OG lange tekstnoder, og hopper over
alt som ligger i en egen scroll-boks — ellers peker vakta på det som skyves
framfor på det som skyver.

### Toppen av skjermen har ÉN eier på mobil (#55)

Samme dobbelteierskap som sideinnrykket, på den loddrette aksen: `.site-main`
la 32 px på toppen, og hver sidecontainer (`.overview-main`, `.user-main`,
`.about-main`, `.search-main`, `.study-main`, `.persons-main`) la på sine egne
48 px uten å vite om den. **80 px — 9,5 % av en 390 px-skjerm — brukt på
ingenting før leseren hadde sett brødsmulestien**, og brødsmulen er navigasjon,
ikke innhold. Sidetypene sprikte dessuten fra 62 (kapittelsida) til 80 px uten
grunn. Verdiene er skrevet for et 1280 px vindu, der de er en bevisst luftig
innledning.

- **Under 768 px er toppinnrykket `.site-main` sitt**, og sidecontainerne
  nulles i ÉN blokk i `styles.css`. Desktop røres ikke.
- **Selektorene er kvalifisert med `.site-main`.** Sidenes egne stilark lastes
  ETTER `styles.css`, så en uspesifisert `.user-main` taper på rekkefølge — og
  da ser regelen riktig ut uten å virke.
- **En wrapper uten egen flate eier ikke luft.** Et KORT (ramme, radius,
  skygge) har sin egen innvendige padding og er unntaket; `.chapter-page` maler
  bare sidebakgrunnen og er ren layout.
- Inline `style` slår enhver regel: 404-sidas `padding: 4rem` lå der og var
  dermed både usynlig for regelen og uslåelig av den. Den er nå `.notfound-page`.
- Lesemodus beholder sine 80 px (`.chapter-page.reading-mode`) med vilje —
  det er en modus leseren VELGER, og luften er poenget med den.

**Vakta ligger i `mobile-layout.test.ts` og har to halvdeler.** AVSTANDEN:
header-bunn til brødsmule er under 40 px på 390 px og lik på alle sidetyper
(32 px, 38 på kapittelsida der brødsmulen står midtstilt i en rad med knapper),
og minst 60 px på 1280 px — ellers ville «fjern padding overalt» bestått.
EIERSKAPET: den går ned den første synlige barnekjeden fra `.site-main` og
feiler på enhver wrapper uten egen flate som legger på `padding-top`/`margin-top`.
Den halvdelen kjenner ingen klassenavn, så en HELT ny sidecontainer blir målt
uten at noen har ført den opp — og den dekker også sider uten brødsmule
(forsiden, 404), der avstandsmålet ikke har noe å måle mot.

## Lenker og lokale vakter

**Alle interne lenker skal bruke `lhref(path)`** (`lib/i18n.ts`), aldri `href="/…"` rått.
Uprefiksede lenker 302-redirecter til den FORHANDLEDE locale-en, ikke den leseren er på
— en norsk nettleser på den engelske utgaven ble kastet til /nb/ ved første klikk (#18).
`lhref` henter locale fra `contextStorage()` (montert i `app.ts`), så ingen komponent
trenger å ta imot `locale` som prop. Unntak som SKAL være uprefikset: `/js/`, `/css/`,
`/api/`, statiske filer.

`test/link-prefix.test.ts` er vakten: den rendrer 16 sider og feiler på enhver intern
lenke uten prefiks, og sveiper alle 8 ordbøker for manglende nøkler (`makeT` returnerer
NØKKELEN ved miss, så en glemt oversettelse vises som «rd.markRead» uten å feile).

## Klient-øyene: tekst og lenker (#33)

Øyene i `public/js/` bygger DOM i nettleseren og er derfor USYNLIGE for både
`link-prefix.test.ts` og `page-contract.test.ts`, som rendrer SSR-HTML. Da det
ble sjekket, lå det 21 uprefiksede interne lenker og ~130 norske strenger der —
hele kommandopaletten, hele hurtigtast-hjelpen, plus-CTA-en, PWA-banneret,
offline-nedlastingen.

- **Tekst:** `readStrings(el)` (`public/js/locale.js`) leser strengene serveren
  la på `data-strings` via `islandStrings(t, keys)` (`lib/i18n.ts`). Ordboka
  blir værende på serveren; øya får bare nøklene den bruker, med
  `{plassholdere}` i behold.
- **Nøkler:** `CHROME_ISLAND_KEYS` i `layout.tsx` for øyene som lastes på HVER
  side; `PAGE_ISLAND_KEYS` slås opp på skriptnavn for resten, så en side ikke
  bærer strenger den aldri bruker. **Glemmer du nøkkelen der, viser øya
  nøkkelen** — akkurat som `makeT`.
- **Lenker:** `localeHref(path)` er klientsidens `lhref()`. Samme unntak
  (`/js/`, `/css/`, `/api/`).

**Vaktene må være STRUKTURELLE, ikke språklige.** Første utgave av
`island-strings.test.ts` var en liste over norske ord, og mutasjonstesten viste
at «Senere» gikk rett gjennom — ingen æøå, ingen av ordene. Vakta sjekker nå
HVOR en strengliteral havner (`textContent`, `title`, `placeholder`,
`aria-label`, `el()`), og fanger dermed både «Senere» og «Later».
`island-links.test.ts` gjør det samme for lenker.

Moduler som også importeres av `bun test` (f.eks. `bible-text-parser.js`) må
hente oversetteren LATT — det finnes ikke noe `document` der.

## Ingen norsk tekst på en ikke-norsk side (#23)

`page-contract.test.ts` sveiper hele `PAGES` under `/en/` og feiler på norsk
tekst. Den finnes fordi nøkkelsveipen over ikke kunne se problemet: en
hardkodet «Grunntekst» er ikke en nøkkel som MANGLER, den er tekst som aldri
gikk gjennom ordboka. Kontrakten fanget derfor null av #20, #21 og #22.

Forutsetningen er at engelsk er gulvet: innhold som mangler på engelsk vises
ikke, så norsk på en engelsk side er alltid en defekt, aldri en fallback.

To unntak, uttrykt i HTML-en framfor i testen — så de er synlige der de
gjelder:

- `lang="nb"`/`lang="nn"` — sitert norsk (dokumentasjonseksemplene på `/om`).
- `data-proper-names` — lister over EGENNAVN fra dataene. «Bibelen Guds Ord» er
  tittelen på en faktisk bibelutgave og skal ikke oversettes.

**Tekst som skal oversettes, skal gjennom ordboka.** Trenger en komponent
oversetteren uten å ha `c`, bruk `tCtx()`; for nøkler som settes sammen av
enum-verdier i dataene (`era.exodus`, `fn.tekstkritisk`, `plan.cat.tematisk`,
`rd.vsev.minor`), bruk `tEnum()` — den holder på typesikkerheten, som er det som
gjør en glemt oversettelse til en byggefeil.

### Ordlista fanger bare det noen har tenkt på — derfor fire vakter

Sveipen var én ordliste, og «Mørk», «Tittel», «støttes» og «søkesiden» sto igjen
på engelske sider i månedsvis fordi ingen hadde lagt inn ordene (#43). Sveipen er
derfor fire uavhengige invarianter, i økende styrke:

1. **Ordlista** (`NORWEGIAN_ONLY`) — funksjonsord. Billig, men bare det noen har
   ført opp.
2. **æ/ø/å i synlig tekst.** STRUKTURELT: engelsk bruker dem ikke. `NORDIC_PROPER`
   er unntakslista og skal være nesten tom — hver oppføring er en påstand om at
   ordet er et egennavn (`bokmål` er navnet på en skriftstandard, også på engelsk).
3. **Ordboksverdien selv.** Er teksten ordrett den NORSKE verdien for en nøkkel,
   og noe annet på engelsk, er den norske verdien — uten at noe ord trenger å
   stå i en liste. Dette fant «Liten»/«Stor», «Oppfylt:», «Bok», «Visning»,
   «Offline-tilgang» og rå enum-verdier som `tematisk` og `skapelsen`.
4. **Tekstbærende ATTRIBUTTER** (`aria-label`, `placeholder`, `title`, `alt`) og
   **metadata** (`<title>`, `<meta description>`). En skjermleserbruker og en
   søkeresultat-linje ser tekst som forsvinner når taggene strippes.

**Boknavn er den vanligste feilen.** `name_no`/`short_name` er NØKLER. `/statistikk`
viste `book.name_no`, profetireferansene bygde «Åp 12:1-5» av den norske
forkortelsen, og evangelieparallellene hadde en hardkodet `GOSPEL_NAMES`-tabell.
Bruk `bookName()`/`bookAbbr()`/`bookNameById()` — og merk at
`bookNameByShort()`/`bookAbbrByShort()` går gjennom ALIAS-tabellen: kildene staver
ikke nøkkelen likt («Høy» mot bokas «Høys»), og et direkte oppslag falt stille
tilbake til den norske nøkkelen.

**Boknavn:** `name_no`/`short_name` i `books-data.ts` er NØKLER (URL-sluger,
begge referanseparserne, `data-ref`, brukernes lagrede referanser) og skal ikke
røres. Bruk `bookName()`/`bookAbbr()` ved visning.

**Lærdom fra #18:** lenker som bygges i en variabel før bruk (`const url = …; <a
href={url}>`) er usynlige for tekstsøk etter `href="/`. Stol på den rendrede HTML-en,
ikke på grep.

### Boknavnet er DATA på åtte språk, ikke en engelsk fallback på fem (#69)

`bookName()` gikk gjennom innholdskjeden med bare `nb` og `en` fylt ut, så
`/fr/`, `/de/`, `/es/`, `/sv/` og `/fi/` leste «Matthew 5» i `<title>`, i
brødsmulen, i kapitteloverskriften og i hver referansechip — det ordet leseren
ser oftest, på fem av åtte flater. **Ingen av de fire norsk-sveipene kunne se
det:** engelsk på en fransk side er ikke norsk tekst, og et boknavn er ikke en
ordboksnøkkel som MANGLER. Det er samme klasse hull som #45 og #65 — skaden
ligger utenfor det vaktene var formulert på.

- **`src/lib/book-names.ts` eier navnene og forkortelsene**, `BOOK_NAMES` og
  `BOOK_ABBRS`, for de sju locale-ene som ikke er nøkkelspråket. **Bokmål blir
  stående i `books-data.ts`**: `name_no`/`short_name` er både NØKKEL og norsk
  visning, og én verdi kan ikke drive fra seg selv.
- **De kommer ikke fra free-bible, og det er undersøkt, ikke antatt.**
  `generate/constants.ts` har fulle navn for `nb`, `nn` og `es` — en intern
  hjelper for prompten — ingen forkortelser for noe språk, og ingen
  `generate/<type>/<språk>/` å importere fra. Der pipelinen «har» franske
  boknavn, er det modellen som skriver dem fra en promptlinje i `translate.ts`
  («Use standard ${language} Bible book names»), uverifisert og ikke lagret. Å
  vente på den kilden ville latt fem språk stå på engelsk på ubestemt tid.
  Skulle free-bible en dag EKSPORTERE dem, er dette fila som byttes ut.
- **Ikke i ordboka.** `dictionaries.ts` er «KUN grensesnittet», og dette er en
  lukket oppregning på 66 verdier adressert av en id fra dataene — samme klasse
  som språknavnene, der `langName()` bevisst valgte en egen mekanisme framfor
  ~700 nøkler.
- **Én navngitt utgave per språk**, så navn og forkortelse hører sammen framfor
  å bli plukket fra hver sin tradisjon: Bibelselskapets nynorskutgave, Luther
  2017, Segond, Reina-Valera, Bibel 2000, Kirkkoraamattu 1992. `es` og `nn` er
  ordrett free-bibles egne, så katalogen og det importerte innholdet staver
  bøkene likt. **De fire uten in-house kilde (de, fr, sv, fi) er ført opp her
  og bør leses over av en som har språket** — vakta ser at navnet FINNES og at
  det ikke er engelsk, ikke at det er riktig.
- **Nynorsk fikk sine egne navn.** «Openberringa» sto som «Åpenbaringen» fordi
  nabospråk-fallbacken gjorde jobben sin på data vi faktisk hadde.
- **Kommandopaletten og studieoppslaget hentet navnet fra NØKKELEN.**
  `formatParsedReference()` bygde «Matteus 5:3» av `name_no` og sendte det ut
  som `reference.formatted` fra `/api/reference` — altså norsk i ⌘K-paletten på
  alle åtte språk, engelsk inkludert. Strengen er ren visning og har én kaller,
  så den går nå gjennom `bookNameById()`; `/api/*` har alt locale fra
  `?lang=`/Referer (#24). Øya rendres i nettleseren og er dermed usynlig for
  sidesveipen — API-svaret måles derfor direkte.
- **Vakta er `test/book-names.test.ts`**, formulert på DATAENE: 66 bøker ×
  `LOCALES`, både at navnet finnes og at `bookName()` viser språkets EGET navn
  (en tabell som ligger der ubrukt består ikke). Den leser `LOCALES`, så et
  niende språk blir rødt uten at noen rører vakta. FORM-halvdelen fanger
  duplikater innen et språk og to språk med identisk tabell — «lim inn engelsk
  og oversett siden» ville ellers bestått alt. SIDA måler sakens eget bevis:
  `<title>` på `/<språk>/matt/5`. Alle fem mutasjonene er kjørt.
- **Lengden er en layout-egenskap.** Samme bok heter «1Mos», «1. Mose» og
  «Första Moseboken», og `mobile-layout.test.ts` målte bare basespråket — det
  KORTESTE. Den har nå en blokk til som velger språk av dataene (den locale-en
  med lengst navn, og den med lengst forkortelse) og måler lesesida, forsida og
  lesekartet på 320/390 px ved 100/150 % tekst.

### En oversatt etikett ser FORSKJELLIG ut på to språk (#63)

Siste brødsmuleledd på kapittelsiden sto som «Kap. 1» på alle åtte språk —
`{ label: \`Kap. ${chapter}\` }` — og alle fire vaktene over var blinde: «Kap.»
står ikke i ordlista, har ingen æ/ø/å, er ikke verdien til noen nøkkel (den gikk
aldri gjennom ordboka), og leddet er `textContent`, ikke et attributt.
Kapittelsiden er den mest besøkte sida vi har, så det var den norske teksten
flest ikke-norske lesere så.

- **Den femte invarianten er STRUKTURELL og trenger ingen ordliste:** en
  brødsmule som renderes ORDRETT LIKT under `/en/` og `/nb/` gikk aldri gjennom
  `t()`. Den fanger neste literal uten at noen har ført opp ordet, og uansett
  hvilket språk literalen tilfeldigvis er skrevet på — en hardkodet «Chapter 1»
  er like lik på tvers og like avslørt.
- **Unntaket er at ORDBOKA er enig:** det må finnes en nøkkel som har nettopp
  den teksten på BEGGE språk (`nav.offline` er «Offline» i begge). At teksten
  bare står i den ENGELSKE ordboka holder ikke — da ville en hardkodet «Ch. 1»
  sluppet gjennom mens de sju andre språkene fortsatt sto på engelsk. Begge
  mutasjonene er kjørt, og begge gir rødt.
- **Nøkler med `{plassholder}` sammenlignes som mønster**, ellers ville vakta
  krevd at fiksen ikke fantes. Et mønster uten egne bokstaver («{a} – {b}»)
  matcher hva som helst og holdes utenfor.
- **Egennavn fra dataene** (et personnavn, en manuskripttittel) er den ene
  legitime grunnen til at to språk viser samme streng. `PROPER_CRUMBS` er lista,
  og den er tom i dag — som `NORDIC_PROPER` er hver oppføring en påstand, ikke
  et sted å gjemme en glemt oversettelse.
- **Samme literal sto på `/tall/<n>`** («Tallet 7», i brødsmulen OG i
  `<title>`), og sveipen kunne ikke se den fordi DETALJSIDEN ikke lå i `PAGES`.
  Den ligger der nå. En vakt måles på matrisen sin: en side som ikke står der,
  står utenfor alle invariantene.

## Regler
- Minimal deps: innebygd/web-standard fremfor npm-pakker. Aldri React/Express/ORM-er.
- Bibeldata er derivert og regenererbar — aldri inn i Docker-imaget; import kjøres separat mot DB-en.
- **Issues spores KUN på GitHub** (`flogvit/bible.flogvit.com`; main er .com-appen). Som i resten av flogvit.com-produktene. Omskrivingens
  historikk (#1–#18) lå i ISSUES.md — slettet 2026-07-22, se git-historikken ved behov.
