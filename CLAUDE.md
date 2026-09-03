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

#### Hvitlista eier også hva pakka DEKLARERER, ikke bare hvilke filer (#112)

`bun audit` meldte to kjente råd — `nanoid` (high) og `postcss` (moderate) —
mot pakker ingen del av bibel importerer. Kjeden var
`@free-bible/kvn (devDependencies) → vitest → vite → postcss → nanoid`: **108
av de 115 pakkene i `bun.lock` var free-bibles eget testverktøy**, låst og
revidert som om det var vårt. Etter fiksen er låsen 7 pakker og
`node_modules` 12 oppføringer mot 573.

- **Hvitlista fra #62 gjelder FILER, og `package.json` er én av dem.** Inni den
  sto et felt som drar hele treet med seg, så hvitlista var halv: den kunne
  hindre at `tests/` ble kopiert inn, men ikke at pakka BA OM verktøyet til å
  kjøre dem. `STRIPPED_FIELDS` i `kvn-staging.ts` er den andre halvdelen.
- **Regelen er installasjonens egen:** en devDependency får man av
  ROT-prosjektet sitt, aldri av en avhengighet. Bun avviker fra det for
  `file:`-avhengigheter — den installerer dem som et arbeidsområde — og det
  avviket er hele saken. `dependencies` strippes IKKE: får kvn en ekte
  kjøretidsavhengighet, trenger vi den.
- **Låsen var dessuten STALE, og det er verre enn det ser ut.** free-bible
  hadde alt sluttet å bruke vitest, men `bun install` beholder en eksisterende
  oppløsning framfor å regne den ut på nytt — så treet ble liggende og
  installert i hvert eneste ferske arbeidstre. En oppgradering av kilden kan
  altså ikke alene rydde her.
- **Stagingen hopper ikke over en reparasjon den er bedt om.**
  `stage-kvn.ts` brukte sin EGEN «er inventaret ok»-sjekk (bare filnavn) i
  fingeravtrykk-snarveien, mens `ensure-kvn.ts` reparerer etter
  `inventoryProblems()`. Med to lister ville ensure bedt om en re-staging som
  stagingen så hoppet over — en reparasjon som aldri skjer. Begge leser nå den
  samme.
- **Vakta er `test/laaste-avhengigheter.test.ts`, formulert på TILHØRIGHETEN og
  ikke på nanoid og postcss** — neste råd kommer mot esbuild eller rollup, som
  lå i den samme kjeden. Den går låsen fra arbeidsområdets egne deps og følger
  bare kjøretidskanter: hver pakke i `bun.lock` må være nådd. Fire halvdeler:
  REGELEN (ren logikk mot en syntetisk lås: rotas egne devDeps blir stående,
  en avhengighets gjør ikke, kjøretidskanter følges gjennom den vendrede pakka,
  en valgfri peer drar ingenting inn, og avhengighetsobjektet finnes på FORM
  siden en `file:`-oppføring er en 2-tuppel og en registry-oppføring en
  4-tuppel), PAKKA (den stagede `package.json` deklarerer ingen av feltene, og
  har fortsatt `exports` — ellers ville «tøm fila» bestått), LÅSEN (sakens eget
  bevis, mot den ekte `bun.lock`) og INGEN STILLE SKIP (låsen må ha pakker og
  rota noe å starte fra, ellers måler sveipen ingenting). Seks mutasjoner kjørt.
- **`bun audit` er verifiseringen, vakta er porten.** Revisjonen krever nett og
  et ferskt rådgiverregister, så den kan ikke stå i suiten; det den ville
  funnet, er uansett en pakke som ikke skulle vært låst.

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

#### Ryddingen rettet PEKERNE — adressene var alt delt ut (#61)

Sveipen over eier dataene våre, og prod-vakten målte dem rene 2026-08-04: 0 døde
mål i 2029 personer på `.com`. Sakens EGEN overskrift sto likevel igjen, målt
på `.com` og ikke på `.no`:

```
GET /api/persons/jisreel-hoseas-s%C3%B8nn   404
GET /api/persons/jisreel-hoseas-sonn        200
```

`prunePersonRefs()` retter pekerne VÅRE. Den kan ikke røre en adresse som alt er
publisert — og de er publisert: `.no` lenker dem fra 1184 av sine 1771
personsider, de ligger i søkeindeksene, og `johannes-døperen` er dessuten formen
et menneske SKRIVER inn.

- **Saken stilte spørsmålet, og dataene svarer.** «Avklar om ø/æ/å i person-id er
  ment å finnes i det hele tatt» → nei: ingen av de 4058 radene i `persons` har
  et tegn utenfor `[a-z0-9-]`, og free-bibles `nameToId` translittererer nå før
  NFD. Da er feilen i OPPSLAGET for det som alt er delt ut, og svaret er **301,
  ikke 404** — ordrett samme argument `PERSON_ID_ALIASES` selv står på.
- **`PERSON_ID_ALIASES` kunne ikke dekke det.** Kartet er ENDELIG (68
  håndverifiserte former fra free-bible#25) og skal aldri vokse. Klassen her er
  ikke en gammel id, men den samme id-en stavet med bokstaven i behold, og den
  er utledbar — 95 adresser i dagens base.
- **`normalizedPersonId()` er kandidaten, ikke svaret.** Kalleren krever et
  EKSAKT treff i `persons` før den sender leseren videre, samme krav
  `personResolverFrom()` stiller i ryddingen. Uten det ville en 301 kunne peke på
  en 404. Og den gjetter aldri: `josef` normaliserer til seg selv, så de elleve
  `josef-*` er fortsatt ingen av dem — #61s egen avgjørelse, uendret.
- **Begge personflatene, som sist.** `/personer/:personId` og
  `/api/persons/:id`. At kartet lå på bare den ene var nettopp defekten «samme
  adresse, samme app, to svar»; en ny regel på bare den ene ville vært den
  samme feilen gjort på nytt.
- **Vakta er `test/person-id-normalized.test.ts`, og adressene velges av
  DATAENE** (som #70, #80 og #84): for hver person bygges formen kilden ville
  gitt UTEN translitterering — visningsnavnet med æ/ø/å i behold — og bare der
  den normaliserer tilbake til nettopp denne personen. Fire halvdeler: REGELEN
  (ren logikk, og ingen kandidat for en id som alt er kanonisk), DATA (ingen av
  de 95 404-er, og måladressen svarer faktisk 200 — en 301 til en 404 er ingen
  fiks), FLATENE (sida og API-et gir samme svar, med locale og `?lang=` i
  behold) og GJETTER ALDRI. Seks mutasjoner kjørt. Den ene som er verdt å nevne
  er å STRIPPE `ø` framfor å translitterere den: den blir rød, fordi DATA måler
  at adressen fører til den RIKTIGE personen — samme innvending #84 reiste.
- **Dette flytter fortsatt ikke `.no`.** Symptomet saken er meldt på lever på
  `bibel.flogvit.no`, som serveres fra `bibel-no`. Men det flytter hva en 301
  fra `.no` til `.com` ville vært verdt: av de 1120 døde id-ene vakten talte,
  var 11 slike som bare manglet translittereringen.

#### En RAD-ID delt ut som om den var en adresse (#61)

Sakens tabell har tre former, ikke én. Persongrafen og ø/æ/å-adressene er tatt
over. Den tredje er `/api/reading-texts/165` fra `/lesetekster/165` — en
auto_increment-id delt ut som en adresse. #40 tok den formen ut av URL-ene
våre; den sto igjen i API-svarene, og der var den fortsatt på `.com`:

```
GET /api/stories              -> [{ "id": 6453, "slug": "abimelek-…", … }]
GET /api/stories/6453         -> 404      (adressen er `slug`)
GET /api/themes/70            -> 404      (adressen er `name`)
GET /api/number-symbolism/351 -> 404      (adressen er `number`)
```

- **Tre ruter gjorde `SELECT *`** og sendte raden ut som den lå, mens
  `/api/persons`, `/api/days`, `/api/reading-plans` og `/api/parallels` i samme
  API deler ut nettopp adressen som `id`. Samme felt, to betydninger — og en
  klient som gjør det åpenbare (`GET /api/<samling>/<element.id>`) får 404 på
  hvert eneste element.
- **Verre enn 404: id-en RENUMMERERES ved hver innholdsimport** (#40 — importen
  sletter og setter inn på nytt), så en klient som lagret den peker på en annen
  historie etter neste innholdsrunde. En død adresse er synlig; en som stille
  bytter innhold er ikke det.
- **`src/lib/api-ids.ts` eier samlingene og regelen.** `API_COLLECTIONS` er ett
  sted, brukt både av rutene og av vakta — hadde hver rute hatt sin egen
  literal, ville vakta målt at ruta er enig med seg selv. `withApiId()` KASTER
  når raden mangler adressefeltet: stille ville den blitt til `id: undefined`,
  altså den samme døde adressen uten et tall å kjenne den igjen på.
- **Rad-id-en blir ikke liggende ved siden av adressen.** Den finnes bare i vår
  egen base, den er ustabil, og en klient som ser to id-lignende felter velger
  før eller siden feil.
- **To samlinger er deklarert med et NOTAT framfor en endring.**
  `/api/parallels` deler også ut `sections[].id`, men det er en
  grupperingsnøkkel (`parallels[].section_id`) uten detaljrute — ingen adresse.
  `/api/reading-texts` beholder rad-id-en fordi flere lesetekster kan dele dato
  (#40), så datoen adresserer DAGEN og ikke raden; `date` ligger i lista ved
  siden av, og at rad-id-en er ustabil er #40s sak.
- **Vakta er `test/api-id-graph.test.ts`, formulert på KONTRAKTEN og ikke på de
  tre samlingene.** Fem halvdeler: REGELEN (ren logikk; en udeklarert samling
  kaster framfor å gjette), FORMEN (leser RUTETABELLEN — hver rute med både
  liste og bar detaljrute må være deklarert eller stå i `UNADDRESSED_ROUTES`
  med en grunn, og en deklarasjon uten rute er rød), DATA (hver eneste
  oppføring bærer adressen som `id`, og et data-valgt utvalg hentes faktisk og
  gir RIKTIG oppføring — bare status hadde bestått av «server hva som helst»),
  DETALJEN (detaljsvarets egen id svarer selv 200) og GRAFEN (hver person-id
  API-et deler ut i `family`/`relatedPersons` finnes i API-ets egen indeks —
  sakens eget bevis, målt på flata framfor i basen som `person-refs`). Utvalget
  velges av DATAENE: formene som ikke er en ren `[a-z0-9-]`-slug, pluss begge
  ender av lista. Sju mutasjoner kjørt.
- **Dette flytter fortsatt ikke `.no`**, av samme grunn som avsnittet over.

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
  ikke ROLLET UT: `.no` kjører fortsatt `bibel:20260818-112552-5154b48`, og hva
  som skal skje med den frosne flata er avgjørelsen i #98.

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
- **Vakta er invariant 9 i `page-contract.test.ts`, og den er en SVEIP.** Den
  sto først som tre håndplukkede sider mens både testfila og denne teksten lovte
  at den «fanger neste innholdsslag som mangler et språk» — de 36 andre sidene i
  `PAGES` var aldri sjekket. Invariant 3 sveiper riktignok hele matrisen, men den
  ser bare FORMEN: at åtte språk og `x-default` STÅR der. Om adressene FINNES kan
  den per konstruksjon ikke se, og det var nettopp hullet. Invariant 9 krever at
  **hver adresse klyngen annonserer svarer det samme som siden selv** — mot
  sidens EGEN status framfor mot 200, så 404-siden og 410-siden i matrisen holdes
  til samme regel framfor å bli unntak.
- **Detaljsiden kan ikke ligge i `PAGES`** — den svarer noe annet enn 200 under
  `/de/`, som er hele poenget — så den måles der detaljsidene måles: se
  «Detaljsidene er der klyngen kan lyve» under.
- De to produktbeslutningene saken lot ligge, er tatt i **#76 under**: dagsiden
  302-er nå til språket den finnes på, og oversikten oppgir fortsatt alle åtte.
  Klyngen er uendret av det — hreflang skal peke på adressen som ER siden, ikke
  på en som viser videre til den.

#### Detaljsidene er der klyngen KAN lyve (#45)

Invariant 9 sveiper `PAGES`, og `PAGES` er parameterløse sider. **Sidene saken
handlet om kan per konstruksjon ikke ligge der:** matrisen rendres under `/de/`,
og en side som ikke finnes på tysk er nettopp den som ikke svarer 200 der.
Sveipen dekket altså alt UNNTATT klassen defekten tilhørte, og lesedagen sto
igjen som ÉN håndplukket test — den ene adressen noen visste om.

- **Vakta er `test/hreflang-detail-pages.test.ts`, og invarianten går BEGGE
  veier:** klyngen er nøyaktig de locale-ene adressen svarer 200 på. Bare den
  ene retningen ville bestått av å oppgi én locale på hver side — det tar sju
  ekte adresser ut av søk, altså den motsatte skaden av samme slag.
- **Sidene velges av DATAENE** (som #70 og #80): for hver innholdstype måles
  oppføringen med SMALEST språkakse (`COUNT(DISTINCT language)` stigende), altså
  den som først blir en lesedag om igjen. En hardkodet `/personer/abaddon` ville
  målt en person som finnes på alle språk, altså ingenting — og en ny
  innholdsrunde flytter målingen selv. Sveipen er grønn overalt i dag: ingen
  enkeltrad i noen innholdstabell mangler et språk de andre har.
- **Den strukturelle halvdelen leser RUTENE**, ikke en liste: hver
  parameteriserte siderute må enten måles eller stå i `IKKE_MÅLT` med en grunn,
  og en oppføring som ikke lenger er en rute er rød. `sitemap-coverage.test.ts`
  trekker grensa si ved de parameterløse rutene og sier at detaljsidene «er en
  egen beslutning som fortjener sitt eget svar» — dette er det svaret.
- **En adresse som ikke svarer 200 på NOEN locale gir rødt**, ikke en stille
  bestått test. En tom tabell eller en omlagt rute ville ellers gjort halvdelen
  til pynt.
- Seks mutasjoner kjørt: `locales` fjernet fra lesedagen (klyngen for bred),
  klyngen for smal (`['nb']`, altså `nn` skjult), `x-default` valgt utenfor
  settet, en uklassifisert detaljrute, en død oppføring i kartet, og en
  måladresse som ikke finnes.

#### Norsk-spesifikt innhold skal ikke bli en blindvei på de sju andre (#76)

`reading_texts` ligger bare på `nb`, og det er riktig (#26). Men leseren møtte
to blindveier som ikke fulgte av den regelen:

```
GET /en/lesetekster/2026-12-25   404   <- delt lenke fra en norsk venn
GET /en/lesetekster              200   <- men lista er tom, uten en vei ut
```

- **Dagsiden 302-er til språket dagen FINNES på.** Hele bruken av den adressen
  er en delt lenke: den går fra en som leser norsk til en som kanskje ikke gjør
  det, og en 404 gjør lenken verdiløs for begge. Det bryter ikke med #26 — vi
  viser ikke norsk tekst under `/en/`; vi sier at teksten bor på den norske
  adressen og tar leseren dit, der `<html lang>` er ærlig. Alternativet «rendre
  den norske teksten under `/en/`» er nettopp det #26 forbyr.
- **302, ikke 301.** At lesetekstene bare finnes på norsk er en egenskap ved
  DATAENE, ikke ved adressen. Blir de importert på flere språk, skal en
  nettleser som har lagret en permanent redirect slutte å bruke den.
- **Målet utledes av basen** — `localesWithContent(getReadingTextLanguages(date))`,
  samme funksjon som hreflang-klyngen (#45) — aldri en hardkodet `nb`. Locale-en
  leseren står på utelates, så en redirect ikke kan peke på seg selv.
- **Redirecten gjetter ikke.** En dato uten lesetekst i det hele tatt 404-er som
  før; «send alt til `/nb/`» ville gjort hver ugyldig dato til en omvei til den
  samme blindveien. Queryen bæres over (`?bible=`), ellers svarer neste side på
  noe annet enn det leseren ba om (#24).
- **Menypunktet skjules IKKE på de seks andre språkene.** En locale-betinget meny
  er en ny akse i navigasjonen — hver flate måtte spørre databasen om innhold før
  chromet kunne rendres — og den koster mer enn den ene siden. Prisen betales
  heller der problemet er: **er lista tom fordi SPRÅKET mangler innholdet, sier
  siden det og lenker til utgaven som har det.** Da er menypunktet et svar, ikke
  en blindvei, og leseren får vite at teksten finnes.
- **De to tomme tilfellene er ikke det samme, og bare det ene har en vei ut.**
  Ingen rader i det hele tatt (språket mangler innholdet) → pek videre. Rader,
  men alle datoene passert (settet går ut 2028-12-31) → si bare det. Pekte vi
  videre også da, ville et tomt `/nb/lesetekster` sendt leseren til et like tomt
  `/nn/lesetekster`.
- **Språknavnet kommer fra `langName()`**, ikke fra en hardkodet «norsk» i åtte
  ordbøker: teksten følger da dataene, som resten av regelen.
- **Vakta er `test/reading-texts-locale.test.ts`, og den er formulert på
  UTFALLET.** LENKA: for hver av de åtte locale-ene ender
  `/<språk>/lesetekster/<dato>` i teksten — fulgt gjennom høyst ett hopp — så en
  fiks som OVERSETTER lesetekstene består like gjerne som en som redirecter, og
  det er riktig: da er ingenting en blindvei. LISTA: hver locale viser enten
  lesedager eller en lenke videre som selv svarer 200. MENYEN måles inne i
  `<nav class="site-nav">`, ikke i dokumentet som helhet — forsiden lenker også
  dit fra oppdagelseskortene, så en sveip over hele HTML-en ville bestått med
  menypunktet fjernet. Fem mutasjoner kjørt (ingen redirect, redirect uten
  oppslag, tapt query, ingen vei ut av tom liste, skjult menypunkt).

#### Sitemapen har en SPRÅKAKSE — ellers er valget alt eller ingenting (#77)

`STATIC_PATHS` er uprefikset, og `seo.ts` sendte HVER sti under HVERT språk med
en `xhtml:link`-klynge over alle åtte. Sitemapen kunne dermed ikke si «denne
stien finnes på nb og nn, ikke på de seks andre», og `/lesetekster` — en ekte,
offentlig side i navigasjonen med 236 lesedager bak seg — sto som eksplisitt
unntak i `NOT_IN_SITEMAP`. Begge utfallene mekanikken tillot er gale: å legge
den inn ville annonsert seks tomme sider for å få med én ekte (#45 om igjen, én
etasje ned), og å la den stå ute er en side søkemotorene bare finner ved å følge
en intern lenke — nøyaktig hullet #47 fantes for å stenge.

- **`LANGUAGE_SCOPED_PATHS` i `sitemap-paths.ts` eier unntakene, og verdien er
  en SPØRRING, ikke en liste.** `sitemapLocales()` gir
  `localesWithContent(await getReadingTextContentLanguages())` — samme mekanikk
  som hreflang-klyngen (#45), så et importert språk slår gjennom uten
  kodeendring, og et språk som forsvinner gjør det samme. Kartet inneholder bare
  unntakene; alt annet er alle åtte.
- **Klyngen bygges av SAMME liste som `<loc>`**, og `x-default` velges innenfor
  den. Bygde vi klyngen av `LOCALES`, ville de seks tomme adressene bare flyttet
  seg fra `<loc>` til `xhtml:link` — og det er den samme løgnen, sagt et annet
  sted.
- **Aksen slås opp PER FORESPØRSEL.** Én `SELECT DISTINCT` per unntak (i dag
  ett) mot en liten tabell, på en flate som hentes en håndfull ganger i døgnet.
  Stilista på ~1 200 oppføringer bygges fortsatt bare én gang. Alternativet —
  cache ved oppstart — ville krevd en restart for at en innholdsimport skulle
  slå gjennom.
- **Sitemapen og HTML-ens hreflang er IKKE samme spørsmål her, med vilje.**
  `/en/lesetekster` svarer 200 og peker leseren videre (#76), så sidas egen
  klynge oppgir alle åtte — adressen FINNES. Sitemapen sier hva som er et svar
  på et søk, og en tom liste med en vei ut er det ikke.
- **Vakta er `test/sitemap-locales.test.ts`, formulert på SIDEN.** Peker
  `/lesetekster` leseren videre til et annet språk, mangler DETTE språket
  lesetekstene, og da skal adressen ikke stå i sitemapen — og motsatt. De to
  andre halvdelene kjenner ingen sti: de leser språkaksen ut av sitemapene selv
  og krever at klyngen (og `x-default`) er enig med den, og at hver
  språk-scopet URL svarer 200. En egen test krever at det FINNES en scopet sti,
  ellers måler de to ingenting. Fire mutasjoner kjørt (klynge fra `LOCALES`,
  ingen filtrering på locale, `x-default` utenfor settet, stien ut av
  `STATIC_PATHS`). Den siste halvdelen lot seg ikke mutasjonsteste: alle åtte
  `/lesetekster`-adressene svarer 200 i dag, så det finnes ingen locale å
  annonsere feil.

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

#### «Fortsatt publisert» må være SANT, og CLI-en er en egen søm

Køen er det eneste som gjør at en innsending noen gang kommer ut, og den har to
lag som begge kan svikte stille.

- **Reviewerens andre kø JOIN-er som katalogen.** «Rapportert, men fortsatt
  publisert» gjorde det ikke, så et manuskript forfatteren hadde SLETTET ble
  stående der: en tekst ingen leser kan se, som revieweren likevel må vurdere —
  og som ingen avgjørelse tar ut igjen, siden en rapport på noe usynlig aldri
  kommer i veien for noen. Alle tre spørringene mot katalogen (`listCatalog`,
  `getPublication`, `listReportedPublications`) krever nå den samme levende
  raden i `sync_items`.
- **`scripts/publications-review.ts` er et EGET PROGRAM**, ikke en funksjon.
  `publications.test.ts` går inn med `app.request()` og ser derfor ingenting av
  sømmen mellom CLI-en og API-et: døpes `authorName` om i svaret, står den
  suiten grønn mens køen slutter å vise hvem som har sendt inn. Mutasjonstestet
  nettopp slik.
- **`test/publications-review-cli.test.ts`** kjører de fire kommandoene fra
  `REVIEW.md` som ekte underprosesser mot en ekte lyttende server. To av dem
  finnes fordi et STILLE svar er det farlige: mangler TJENESTEN `REVIEW_TOKEN`
  (404) eller er den feil (403), skal CLI-en stoppe høylytt — melder den «(tom)»
  i stedet, ser en feilkonfigurert prod ut som en tom kø, og innsendingene blir
  liggende for alltid. Den pinner også at `vis` gir HELE teksten der køen bare
  gir 100 tegn; det er der en innsending som vil noe annet, plasserer det.

#### Et TAK på lista er en oppføring ingen kan finne (#75)

`listCatalog()` hentet `LIMIT 100` og siden viste det den fikk. Det fantes ingen
side 2, og enkeltoppføringene ligger med vilje ikke i sitemapen (over) — så
oppføring nummer 101 var **godkjent, publisert og uoppdagbar**: forfatteren så
«Publisert» med en lenke som virket, og ingen leser hadde en vei dit. Sorteringen
er nyeste først, altså faller de ELDSTE ut — de som har stått lengst. Utslaget er
stille (200, ingen loggrad, ingen 404), som #45, #60, #65 og #69.

- **Paginering på STI, ikke på query.** `/manuskripter/katalog/side/2`. En URL
  med query er en HANDLING som verken følges eller indekseres (#60), så `?side=2`
  ville gjort side 2 like uoppdagbar som oppføringene den skulle vise. To
  segmenter kolliderer heller ikke med `:slug`.
- **Tallet er sidelengden, ikke et tak.** `CATALOG_PAGE_SIZE` (50) sier hvor
  lang én side er; `pageCount` sier at det finnes en til. Alternativet «behold
  100, men si det» ble vraket fordi det ikke løser at oppføringen er *borte* —
  og «vis alt» fordi lista da vokser uten grense på en flate som står helt
  utenfor mikrocachen.
- **Sorteringen må være TOTAL.** `decided_at DESC, submitted_at DESC` alene har
  ingen innbyrdes rekkefølge for to rader godkjent i samme millisekund — og en
  reviewer som går gjennom køen godkjenner nettopp flere i samme millisekund. En
  slik rad kan havne på begge sider av et sideskille, altså listes to ganger
  eller ingen. `p.slug ASC` til slutt gjør ordenen entydig. Dette er det ene
  punktet her som IKKE lot seg mutasjonsteste: MySQL leverer tilfeldigvis stabil
  rekkefølge for denne spørringen lokalt, så vakta ble grønn uten leddet.
- **Side 1 har ÉN adresse, den korte.** `/side/1` er 301 dit; det er den som
  ligger i sitemapen og som canonical peker på. Dypere sider står ikke i
  sitemapen — de kommer og går med review, og «neste side»-lenka ER
  oppdagelsesveien.
- **Et sidetall forbi siste side er 404**, ikke en tom liste med 200. En side som
  svarer 200 uansett tall er en uendelig flate for en crawler.
- **Vakta er `test/catalog-pagination.test.ts`, og den er formulert på
  USYNLIGHETEN — ikke på tallet 100.** Den seeder flere oppføringer enn én side
  rommer (målt i `CATALOG_PAGE_SIZE`, ikke i et tall), GÅR katalogen slik en
  leser og en crawler gjør — fra rot-adressen, via «neste side»-lenka — og
  krever at hver eneste godkjente oppføring dukker opp underveis, ingen to
  ganger, og at siste side ikke lenker videre. Da består en fiks som flytter
  taket like gjerne som en som paginerer, så lenge ingenting er usynlig; og et
  tak uten vei videre stryker uansett hvor det står. Fem mutasjoner kjørt (tak
  uten side 2, pager uten neste-lenke, query framfor sti, 200 framfor 404 forbi
  siste side, ingen 301 fra `/side/1`).
- **Sida ligger ikke i `PAGES`**, og det er samme grunn som lesedagene i #45: den
  finnes bare når katalogen er stor nok, og 404-er ellers. Rot-adressen står der
  som før.

#### Og KØEN har samme tak, med en verre konsekvens (#81)

#75 løste lista LESEREN ser. Køen er en annen flate med en annen bruker —
revieweren — og der stoppet `LIMIT 50` en innsending fra å komme ut i det hele
tatt: den som står bak sideskillet blir aldri sett, altså aldri godkjent, og
forfatteren ser «Til vurdering» i det uendelige. Køen er den ENESTE veien ut i
katalogen.

- **`REVIEW_PAGE_SIZE` er sidelengden, ikke et tak**, og begge køene
  (`listPendingPublications`, `listReportedPublications`) returnerer
  `{items, page, pageCount, total}` som `listCatalog`. Sorteringen fikk `slug
  ASC` til slutt av samme grunn som i #75: uten en TOTAL orden kan en rad havne
  på begge sider av et sideskille, altså vises to ganger eller ingen.
- **`total` er ikke pynt — det er tallet CLI-en SKRIVER.** «Til vurdering (50)»
  var et tall som så ut som hele køen; det er selve løgnen saken handler om.
  Skriptet skriver også ut kommandoen for neste side, framfor å anta at
  revieweren gjetter at det finnes en.
- **Paginering på ARGUMENT, ikke på sti.** Motsatt av #75, og med vilje: dette
  er en CLI mot et token-gatet endepunkt, ingen crawler ser den og ingenting
  skal indekseres. `kø 2` er den formen en reviewer faktisk skriver.
- **Ett sidetall blar i BEGGE køene.** Den rapporterte er nesten alltid kort, og
  to uavhengige markører ville vært to ting å holde styr på for å gjøre én jobb.
- **Oppslaget står UTENFOR køen.** `vis` lette i køen den nettopp hentet, så en
  oppføring bak sideskillet kunne ikke engang leses med slugen i hånda.
  `GET /api/publications/review/:slug` slår opp på slugen alene, uansett status,
  med samme `sync_items`-JOIN som køene. **`godkjenn`/`avvis` var derimot ALDRI
  avhengige av køen** — de poster slugen rett til `/decide`, og saken tar feil på
  akkurat det punktet. `vis` var hele blokkeringen, og den er nok: du avgjør ikke
  en tekst du ikke kan lese.
- **404 fra den ruta betyr to ulike ting**, og CLI-en skiller dem: `not_found` er
  ukjent adresse, mens en tjeneste uten `REVIEW_TOKEN` svarer 404 på at
  endepunktet ikke finnes. Sier vi «fant ikke» på det siste, ser en
  feilkonfigurert prod ut som en skrivefeil — samme felle som «(tom) framfor
  høylytt stopp» i CLI-vakta over.
- **Tavla teller riktig allerede.** `dashboard/src/collect/prod.ts` gjør
  `COUNT(*)` rett mot basen og har aldri sett de 50 — den var altså det eneste
  stedet køens sanne lengde fantes, og revieweren så et annet tall enn tavla.
- **Vakta er `test/review-queue-pagination.test.ts`, og den er formulert på
  USYNLIGHETEN — ikke på tallet 50.** Den seeder flere enn én side rommer (målt i
  `REVIEW_PAGE_SIZE`), GÅR køen som revieweren gjør — `kø`, så kommandoen
  skriptet selv skrev ut — og krever at hver innsending dukker opp nøyaktig én
  gang, at tallet i overskriften er hele køen, og at den som faller utenfor
  første side kan `vis`-es med hele teksten og godkjennes helt ut i katalogen.
  Den rapporterte køen måles på samme vandring. Kommandoene kjøres som ekte
  underprosesser: CLI-en er en egen søm, og `publications.test.ts` går inn med
  `app.request()`. Fem mutasjoner kjørt (tak uten side 2, sidens antall framfor
  `total`, ingen neste-kommando, `vis` som leter i køen, urørt rapportert kø).
  `slug ASC` lot seg ikke mutasjonsteste — som i #75 leverer MySQL tilfeldigvis
  stabil rekkefølge for denne spørringen lokalt.

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
  kodeendring kan ta. `OG_IMAGE_URL` er flyttelasset, og det er **kodet** —
  `scripts/upload-og-card.ts`, se #66 under.
- **Per-side-kort er et eget og senere steg** — tatt i #68 under, for
  kapittelsidene. Sidemalens kort er fortsatt standarden for alt annet.

**Vakta er todelt.** Sidekontraktens invariant 8 sveiper HVER side i `PAGES` —
absolutt `og:image`, målene 1200x630, en alt-tekst, og `twitter:card` — så en ny
side arver kortet uten at noen har tenkt på det. `test/share-card.test.ts` tar
det sveipen ikke kan se: at bildet FINNES, at det er en PNG med nøyaktig de
målene sidemalen deklarerer (lest ut av IHDR-chunken, ikke antatt), at appen
serverer det med validator, og at `OG_IMAGE_URL` faktisk flytter det. Alt-testen
er strukturell som brødsmulevakta i #63 — en hardkodet literal rendres ordrett
likt på fire ubeslektede språk. Alle vaktene er mutasjonstestet.

#### Flyttelasset flytter adressen — noe må flytte BILDET (#66)

«`OG_IMAGE_URL` er flyttelasset: last opp bildet, sett variabelen, ferdig —
ingen kodeendring» var halve flyttingen sagt som hele. Variabelen flytter
ADRESSEN. Ingenting flyttet bildet, og ingenting holdt de to kopiene like:
`public/og.png` ligger i git og rulles ut med imaget, mens bøttekopien måtte
lastes opp for hånd. Runbooken har TRE grunner til å lage kortet på nytt
(`card.html`, identiteten i `portal/STYLE.md`, en ny bokstav i et boknavn) og sa
ingenting om å laste det opp igjen. Fra dagen variabelen er satt, ville prod da
servert et gammelt kort for alltid — 200, ingen loggrad, synlig bare for den som
fikk lenken. Nøyaktig hullet #65 handlet om, én etasje ned. Sakens egen
«ferdig» krevde dette («ikke to kopier som driver fra hverandre») og kalte det
samtidig «ingen kodeendring».

- **`scripts/upload-og-card.ts` er PORTET, ikke funnet opp.** `books`, `lab` og
  `puzzles` har samme skript (`scripts/last-opp-delekort.ts`) mot samme
  `Bun.S3Client`, med samme legitimasjonskjede (env → `~/.config/scw/config.yaml`)
  og samme «bekreft anonymt etterpå». Å skrive en fjerde variant her ville vært
  en ny måte å gjøre det samme på — spørsmålet var HVORDAN den bæres over, ikke
  OM. Avviket er `sjekk`-kommandoen, som finnes fordi bibels opplasting IKKE
  ligger i deploy-kjeden: den bor i driftsrepoet.
- **Kortet skrives HVER gang**, som i `books`: det koster en håndfull kilobyte
  og fjerner hele klassen «bildet forsvant fordi noen ryddet i bøtta».
  `bun scripts/upload-og-card.ts sjekk` svarer på om den PUBLISERTE adressen
  fortsatt er lik kilden — den skriver ingenting og trenger ingen nøkler, så den
  kan kjøres etter hver deploy.
- **Den verifiserer FØR den skriver ut adressen, og gjør det ANONYMT.**
  Skrivingen kan lykkes uten at objektet kan leses utenfra — det er ACL-en, ikke
  opplastingen, som avgjør om delingen virker. En adresse vi ikke har bevist er
  nettopp løgnen saken handler om: den ser riktig ut i env-fila, og gir et
  gammelt eller tomt kort hos den som fikk lenken.
- **`sjekk` måler `OG_IMAGE_URL` når den er satt**, ikke den utledede adressen.
  Å måle en adresse ingen leser henter kortet fra er å måle ingenting.
- **Skriptet oppretter ALDRI bøtta.** Det er en beslutning om skyprosjekt,
  region og kostnad (KONVENSJONER.md → «Objektlagring»), og en bøtte kan ikke
  flyttes mellom prosjekter i Scaleway. Mangler den, stopper skriptet høylytt og
  navngir avgjørelsen — et stille «ferdig» ville fått en maskin uten bøtte til å
  se ferdig ut. Samme lærdom som «(tom) framfor høylytt stopp» i CLI-vakta for
  review-køen. Meldingen nevner også at S3-navnerommet deles med alle
  Scaleway-kunder: `lab` var opptatt og måtte bli `flogvit-lab`.
- **`DELEKORT` i `share-card.ts` er ÉN sannhet** — bøtte, region, nøkkel og mål
  — delt av opplastingen, runbooken og `share-card.test.ts`, som bruker
  `objektUrl()` framfor en literal. Nøkkelen er
  `system/delekort/bibel-1200x630.png`, samme form som de tre andre produktene:
  `<uid>/` er obligatorisk første segment for BRUKER-innhold, og `system/`
  holder systeminnhold utenfor lagringsregnskapet framfor å late som om det er
  noens. **Filnavnet bærer målene og skal BYTTES når kortet endrer MOTIV** —
  skraperne cacher per URL, så en overskrevet fil viser det gamle motivet i
  ukevis uten at noe sier fra.
- **`OG_IMAGE_URL` er MIDLERTIDIG.** De tre andre produktene peker sidemalen
  rett på `objektUrl()` og har ingen slik bryter. Den finnes her bare fordi en
  `og:image` mot en bøtte som ikke finnes gir INGEN forhåndsvisning — altså
  dårligere enn i dag.
- **Vakta er `test/og-card-upload.test.ts`, og den er formulert på ADRESSEN —
  ikke på at en PUT ble sendt.** Skriptet kjøres som et ekte underprosess mot en
  ekte lyttende S3-flate (en egen søm, som CLI-vakta), og adressen det SKRIVER
  UT må servere nøyaktig bytene i `public/og.png`. Sju halvdeler: adressen
  virker; kortet skrives hver gang; en bøttekopi som har drevet fra kilden sier
  fra og lar seg rette; `sjekk` måler `OG_IMAGE_URL`; en PUT som svarer 200 uten
  at objektet blir lesbart skriver INGEN adresse; en bøtte som ikke finnes gir
  høylytt stopp; og uten nøkler (heller ikke i `~/.config/scw/config.yaml`)
  stopper den før den later som den lastet opp.
- **Det som gjenstår er ÉN avgjørelse, ikke tre steg.** Opprett bøtta, kjør
  skriptet, lim inn linja det skriver ut. Avgjørelsen er `#87`.

##### Kommandoen kan ikke si hvilket PROSJEKT bøtta havner i (#87)

Avgjørelsen er «prosjekt `flogvit`, region fr-par», men
`scw object bucket create` har **ingen `project-id`-arg** (målt på scw 2.50.0:
`name`, `tags`, `enable-versioning`, `acl`, `region`). Bøtta havner altså i det
prosjektet maskinens `scw`-profil tilfeldigvis peker på, mens kommandolinja
`name=bibel region=fr-par` SER ut som den uttrykker hele avgjørelsen. Det var
nettopp den lesingen som la soulsupport-bøttene i prosjektet «Bibel»
2026-07-29, og en bøtte kan ikke flyttes mellom prosjekter i Scaleway.

- **`DELEKORT.project` er prosjektet**, ved siden av bøtte, region og nøkkel —
  det leddet som ikke kan rettes etterpå hører i samme sannhet som de andre.
  Verdien er NAVNET, ikke id-en: repoet er offentlig, og navnet er nok til å
  sammenligne med `scw config get default-project-id`.
- **Skriptets stopp-melding er runbooken i det øyeblikket handlingen skjer**,
  så den navngir prosjektet og sjekk-kommandoen framfor bare create-linja.
- **Målt 2026-08-07:** navnet `bibel` er ledig globalt
  (`https://bibel.s3.fr-par.scw.cloud/` → `NoSuchBucket`), og maskinens
  `default-project-id` er `flogvit`. `flogvit-`-prefikset trengs altså ikke.

##### `sjekk` må kunne stå i deploy-kjeden FØR bøtta finnes (#87)

Restansen fra #66 er at `server/deploy-bibel-hono.sh` (i driftsrepoet) skal
kjøre `bun scripts/upload-og-card.ts sjekk` etter deploy. Den kunne ikke wires:
kommandoen felte på `NoSuchBucket`, altså hadde HVER deploy vært rød fram til
avgjørelsen var tatt — så linja ville aldri blitt lagt inn, og guarden hadde
kommet nøyaktig når den ikke lenger var gratis.

**«Bøtta finnes ikke» betyr to ulike ting**, som 404 gjør for review-køa (#81):
uten `OG_IMAGE_URL` er flyttingen bare ikke gjort, sidemalen serverer
`public/og.png` fra vårt eget opphav, og det er RIKTIG — kommandoen sier det og
avslutter med 0. Med `OG_IMAGE_URL` satt påstår miljøet at kortet ligger i
objektlagringen, og da er en manglende bøtte delte lenker uten forhåndsvisning
i det hele tatt — dårligere enn før flyttingen — og den avslutter med 1.
Guarden armerer seg altså selv i det øyeblikket variabelen settes.

### Kortet skal si HVILKET kapittel lenken peker på (#68)

Det generiske kortet er gulvet, og det er kapittellenkene folk deler: en delt
`/en/matt/5` så nøyaktig ut som en delt forside. Kapittelsiden sender nå sitt
eget kort — «Matthew» over «Chapter 5» — på **lenkens** språk.

- **Begge veiene saken satte opp var stengt, og det er sakens egentlige svar.**
  «~1200 kort på disk» er i virkeligheten 1189 kapitler × 8 språk = **9512**
  bilder, altså ~200 MB derivert binær i git som må lages på nytt hver gang et
  boknavn rettes. «Rastrér ved første treff» er headless Chrome, og prod-imaget
  er `oven/bun:1.3-slim`: et Chrome-lag er ~1 GB på en disk som har tatt ned
  prod før, på en VM der CPU er den kjente flaskehalsen (#19, #64).
- **Veien som står igjen er å SETTE SAMMEN kortet per forespørsel.**
  Generatoren rastrerer én gang det som ikke varierer — bakgrunnen, og ett
  alfabilde per BOKSTAV i de to skriftene malen bruker, med kerningen målt i
  samme Chrome. Kjøretiden er da piksel-aritmetikk og `node:zlib`: ~10 ms, ingen
  ny avhengighet, 138 kB artefakter mot 200 MB. `src/lib/og-card.ts` bærer både
  koden og begrunnelsen; runbooken er `assets/og/README.md`.
- **Malen er fortsatt HTML-en.** `assets/og/card.html` fikk en `body.chapter`
  med to `[data-og-slot]`, og generatoren MÅLER dem — plass, grunnlinje,
  skrift, farge — framfor å ha tallene i seg. Flytter du et slott i CSS-en,
  flytter teksten seg med.
- **Boknavnet kommer fra `bookNameById()`** (#69), ikke fra ordboka: 66 verdier
  adressert av en id fra dataene hører ikke i `dictionaries.ts`. Kapittelledda
  går derimot gjennom ordboka, for ordstillingen er ikke vår å anta (#63).
- **Renderen nekter framfor å tegne et halvt kort.** Mangler malen et tegn,
  serveres det generiske. En tittel med hull i ser riktig ut fra en 200-linje i
  loggen og er bare synlig for den som fikk lenken.
- **Ruta ligger UTENFOR lastvernet** — stien har punktum, altså `NOT_A_PAGE`
  (#64) — og det er med vilje: en 503 på delekortet er et kort som aldri kommer,
  og skraperen prøver ikke igjen. **Den er heller ikke forbudt i robots.txt**;
  Facebook og LinkedIn leser robots, så et `Disallow: /og/` ville tatt bort
  nettopp bildet som er poenget. #60 forbyr HANDLINGS-URL-er, ikke dette.
- **Boka adresseres med SLUGEN sida bruker** (`/og/en/matt-5.png`), ikke med
  rad-id-en (#40).
- **`COPY assets/og/generated` i Dockerfilen er en del av fiksen.** `assets/`
  var ikke med i imaget, og uten linja ville hvert kapittelkort falt tilbake til
  det generiske — med 200 i loggen og ingen feilrad. Vakta leser Dockerfilen.

**Vakta er `test/og-chapter-card.test.ts`**, og den er formulert på kontrakten:
kapittelsiden deklarerer sitt EGET kort på alle åtte språk (ellers rødt), de
deklarerte målene er kortets EKTE mål lest ut av IHDR, kortbytene er
FORSKJELLIGE på fire ubeslektede språk (en tekst som aldri gikk gjennom ordboka
eller boknavntabellen ville gitt identiske byte — samme strukturelle grep som
#63), malen har tegn for **hvert boknavn på hvert språk** lest ut av
`booksData` × `LOCALES`, alt annet beholder det generiske kortet, et kapittel
som ikke finnes gir 404, og artefaktene blir med i imaget. Alle vaktene er
mutasjonstestet.

**Ikke gjort, med vilje:** kortet viser ikke de første ordene av teksten. Vi har
bibeltekst på `nb`, `nn` og `en` — et fransk kort med norsk vers ville vært verre
enn det generiske, som er nøyaktig det saken advarer mot. Vers- og
person-/temasider har heller ikke egne kort ennå; de arver gulvet fra #65.

### En PUBLISERT adresse er prosentkodet — og bare ett ledd koder den (#80)

Sidemalen sendte rå UTF-8-bytes i `og:image`, `canonical` og hreflang-klyngen,
mens sitemapen kodet de samme adressene. De to var altså uenige om hva adressen
ER. Amazonbot, som fikk den rå formen, sendte `GET /og/en/1kr` — prefikset fram
til første ikke-ASCII-byte — og fikk 404, mens `/og/en/1kr%C3%B8n-15.png` ga 200
i samme vindu. 760 delekort- og 760 canonical-URL-er sto slik.

- **`src/lib/site-url.ts` eier BÅDE opphavet og kodingen.** `absoluteUrl(sti)`
  er `SITE + encodeURI(sti)`, og literalen `https://bible.flogvit.com` finnes
  ikke lenger noe annet sted i `src/` — den var kopiert til fire filer, og fire
  av canonical-ene var derfor bygget utenom enhver koding.
- **`SITE` eksporteres IKKE, og det er hele grepet.** Er konstanten
  tilgjengelig, er `SITE + sti` tilgjengelig — og da er kodingen frivillig.
  `absoluteUrl()` er den eneste veien til en absolutt adresse, så en ny rute
  som vil utenom må skrive opphavet selv, og det er nettopp det vakta ser.
- **Ikke i `toUrlSlug()`.** Den brukes også der rå form er riktig (ruter og
  interne lenker), og #42 viser hva som skjer når en verdi tar en runde gjennom
  en kodet representasjon og kodes igjen: `%C3%B8` → `%25C3%25B8`, 95 kapitler
  404 i alle åtte sitemaps. Én representasjon internt, én koding ved utsending —
  samme regel `sitemap-paths.ts` allerede sier.
- **Hreflang-klyngen fulgte med.** Saken navnga `og:image` og canonical, men
  klyngen er den samme adressen sagt et annet sted; lot vi den stå rå, hadde vi
  bare flyttet uenigheten med sitemapen.
- **Usynlig innenfra, som #65.** Et delekort som ikke lar seg hente svarer
  ingen: skraperen viser et kort uten bilde, og det gir verken 404, 5xx eller en
  logglinje hos oss. At det dukket opp i vakta i det hele tatt var flaks — én
  crawler sendte prefikset sitt framfor å gi opp i stillhet.
- **Vakta er `test/published-url-encoding.test.ts`, og sidene velges av
  DATAENE** (som i #69 og #70): hver bok hvis slug bærer et tegn utenfor ASCII,
  altså `åp`, `1krøn`, `2krøn`, `høys` i dag. En test på `/1mos/1` beviser
  ingenting her — `encodeURI` er identiteten på ren ASCII, som er hele
  blindsonen. Fem halvdeler: ingen publisert adresse bærer et tegn utenfor
  ASCII; den kodede adressen DEKODER tilbake til sidas egen sti (ellers ville
  «strip ø i slugen» bestått); sitemapen og sida oppgir BIT-IDENTISK samme
  adresse, klyngen inkludert (at de var uenige er selve feilen — hver for seg
  svarer begge formene 200); opphavet settes bare sammen med en sti i
  `site-url.ts`, så neste rute ikke kan bygge sin egen; og kortet svarer 200 på
  adressen slik den er publisert. En egen test krever at det FINNES en slik
  slug, ellers måler de andre ingenting. Seks mutasjoner kjørt — den ene som
  IKKE ble rød av ASCII-sveipen er sidemalens egen canonical: hver sti med
  ikke-ASCII i dag er en kapittelside, og den sender sin EGEN canonical. Det er
  den strukturelle halvdelen og typesjekkeren som holder den, ikke sveipen.

#### Kortstien er ASCII-REN — prosentkoding flyttet kuttet, den fjernet det ikke (#84)

#80 er ute og virker: alle fire bøkene sender kodet form i `og:image`,
`canonical` og hreflang. Symptomet overlevde likevel, **målt med samme nevner**
— 4,4 % avkortede før fiksen, 4,7 % etter, og null forespørsler med rå
ikke-ASCII i etter-vinduet. Amazonbot kutter nå ved første `%` i stedet for ved
første rå ikke-ASCII-byte (`GET /og/de/2kr` av `/og/de/2kr%C3%B8n-<n>.png`), og
en ny form kom til: `åp` gir `/og/<språk>/`, en sti uten filsegment, som faller
ut av `/og/`-ruta og videre i locale-forhandlingen til 404.

- **Er det ingen `%` der, har klienten ingenting å kutte ved.**
  `cardBookSlug()` i `og-card.ts` translittererer bokleddet: `1kron`, `2kron`,
  `hoys`, `ap`. Regelen er porteføljens egen (`normalizePersonId`, #61, altså
  free-bibles `nameToId`): `æ`→`ae`, `ø`→`o`, `å`→`a`. En ny omskriving her
  ville vært en tredje stavemåte for de samme bøkene.
- **Bare KORTSTIEN — men ikke fordi sidas egen adresse går fri.** Den kuttes av
  samme klient på nøyaktig samme sted (`GET /de/2kr` av `/de/2krøn/26`,
  Amazonbot 2026-08-06T12:32Z), bare ~120 ganger sjeldnere: 0,038 % av 2638
  hentinger mot 4,6 % av 366 på kortstien, målt over 98 timer mot de samme fire
  bøkene. Forskjellen er at det ikke finnes noen ASCII-form å bytte til der —
  `ø`-en ER adressen, og den leses av et menneske. Å skrive den om er en
  avgjørelse om adresseskjemaet, ikke en feilretting, og den bæres ikke av
  0,038 %. #80s krav om at den kodede adressen DEKODER tilbake til sidas egen
  sti står derfor uendret for canonical og hreflang; kortstien er unntaket, og
  den leses av en maskin, aldri av en leser. **Innholdsformen har sin egen
  katalog-linje** (`flogvit-com-server@f9a5a01`, terskel 5 ≈ 500× dagens nivå),
  og den skal BLI STÅENDE når søsterlinja under fjernes — ellers mister nettopp
  den formen fiksen ikke rører all dekning i samme slengen.
- **Ruta tar imot BEGGE formene.** Den prosentkodede ligger i delte lenker og i
  skrapernes indeks fra før, og en delt lenke lever lenger enn en deploy.
  `bookByCardSlug()` prøver kortslugen først og faller tilbake på
  `getBookInfoBySlug()`. Å lene seg på ALIAS-tabellen alene holdt ikke: den har
  `1kron`, `2kron` og `ap`, men ikke `hoys` — den er skrevet for
  referanseparsing, ikke for denne adressen.
- **Katalog-linja i `server/vakt-kjent.tsv` demper klassen** og forutsatte at
  #80 ville fjerne den. Tallet sto høyt etterpå, og det ble fanget av en
  tilfeldighet (den fjerde formen bommet på regexen), ikke av porten. Linja
  peker nå hit; den skal FJERNES når dette er deployet og verifisert — står
  tallet fortsatt høyt, er også denne fiksen ufullstendig. Den ligger i et annet
  repo (`flogvit-com-server`).
- **Vakta er `test/og-card-ascii-path.test.ts`, formulert på TEGNET og ikke på
  `ø`**, med sidene valgt av DATAENE (som i #69, #70 og #80). Seks halvdeler:
  ingen kortsti for noen bok på noe språk bærer noe `encodeURI` må røre; den
  adressen SIDA publiserer har ingen prosentkode (funksjonen alene beviser ikke
  hva som står i `og:image`); adressen leverer kortet for RIKTIG bok målt på
  BYTENE (ellers ville «fjern ø-en» bestått — det er innvendingen #80 reiste mot
  en omskriving); den gamle kodede formen svarer fortsatt med samme kort; ingen
  kortslug skygger for en annen bok eller kolliderer med en annen kortslug; og
  en egen test krever at det FINNES en slik slug, ellers måler de andre
  ingenting. Sju mutasjoner kjørt. Den ene som IKKE ble rød er å STRIPPE `å`
  framfor å translitterere den (`åp` → `p`) — og det er riktig: den formen er
  fortsatt ASCII-ren, entydig og peker på samme bok, altså ikke defekten. Er
  den derimot en annen boks slug eller en annen boks kortslug, er den rød.

##### Og en AVKORTET adresse skal ikke svares som en side (#84, andre halvdel)

En ASCII-ren sti hindrer NYE kutt. Den hindrer ikke de 18 avkortede formene som
alt ligger i skrapernes indeks, og de blir hentet igjen. Saken sier selv hva som
er galt med svaret de fikk: «Skraperen får `text/html` der den ventet en PNG.»

- **`/og/<språk>/` hadde ikke lenger et filsegment**, falt derfor ut av kortruta
  og videre i locale-forhandlingen: `302 /en/og/fr/` → `301 /en/og/fr` → `404`.
  To hopp for et bilde som ikke finnes, der det siste er en adresse i
  SIDE-navnerommet som ikke fantes før vi fant den opp — nøyaktig klassen #46 og
  #60 stenger.
- **Prisen var en RENDER-PLASS.** `NOT_A_PAGE` (#64) kjenner en fil på
  punktumet, og et kutt fjerner nettopp punktumet. En avkortet kortadresse sto
  dermed i køen bak semaforen og rendret en HTML-side ingen skraper leser, i det
  øyeblikket kapasiteten er knapp (#19, #86).
- **Under `/og/` svares det aldri som en side:** ingen HTML-kropp, ingen omvei.
  `avkortet()` i `routes/og.ts` er ett svar for alle tre stedene — ugyldig
  språk/filnavn, ukjent bok/kapittel, og catch-allen. **Catch-allen står SIST**,
  så en hel adresse fortsatt vinner; den er enden på et kutt, ikke en mur.
- **Vakta ligger i samme fil og er formulert på ADRESSEN, ikke på de fire målte
  formene:** ingen PREFIKS av en publisert kortadresse — i begge formene, for
  hver bok og hvert språk — får redirecte eller svare med HTML. En egen halvdel
  holder de fire målte formene ordrett, og en tredje krever at den HELE adressen
  fortsatt leverer kortet, ellers ville «404 på alt under `/og/`» bestått. Fire
  mutasjoner kjørt (ingen catch-all, `c.notFound()` tilbake i kortruta,
  catch-all FØRST, og en smal fiks som bare tar `/og/<språk>`).

## Å VENTE PÅ DATABASEN er forespørselens budsjett, ikke spørringens (#107)

`db.ts` gjentar lesninger når forbindelsen er borte, så en DB-restart (målt 12 s
og 28 s, Cost Optimized-tieren har ingen SLA) gir en treg side framfor en
feilside. Blokka lover et TAK — «brukeren venter litt» — og taket fantes ikke:
deadlinen ble regnet ut på nytt inne i hvert eneste `sql`-kall, og en side gjør
mange. `/personer/:id` slår opp far, mor, ektefelle, hvert søsken, hvert barn og
hver relatert person — ett kall hver, i tur — så taket for den siden var ANTALL
SPØRRINGER × 25 s. Med tjue oppslag er det over åtte minutter, og Caddy har
ingen response-timeout som stopper det.

- **Beviset er de to sidene som brukte like lang tid og endte ulikt.** Målt
  2026-08-30T20:01:22–20:02:16Z, da nye forbindelser timet ut på 2 s:
  `/sv/historier/…` brukte 24,67 s og ble **500**, altså én spørring som spiste
  hele budsjettet og kastet. `/en/historier/daniel-i-lovehulen` brukte 24,8 s og
  ble **200** — og det kan ikke være samme form, for et budsjett som løper ut,
  kaster. Det er flere spørringer som hver brukte sin del av hvert sitt budsjett.
- **Prisen er ikke bare den ene leserens tid.** Den som venter holder en
  render-plass i semaforen hele veien (#19), så en blipp som rammer noen få
  forespørsler kan stanse flata for alle — nettopp «sto i ~55 s». Det er samme
  avveining #19 alt har tatt: raske nei til noen få slår trege svar til alle.
- **`withRetryBudget(fn)` er scopet**, montert ytterst i `app.ts` og bygget på
  `AsyncLocalStorage` framfor honos `contextStorage()`: `db.ts` skal ikke kjenne
  rammeverket. UTENFOR et scope — altså i `init-db.ts` og `import-bible.ts` —
  får hvert kall sitt eget budsjett som før; en import som rir av en restart
  skal ikke gi opp fordi forrige spørring brukte tid.
- **Mikrocachens versjonssjekk får sitt EGET budsjett, på null.** Den kjører
  inne i forespørselen, og ville ellers brukt opp leserens budsjett før siden
  begynte å rendre — altså byttet «treg side» mot «feilside» for den ene
  forespørselen i hvert 30-sekundersvindu som gjør sjekken. Null er ikke en
  nedprioritering; det er hva `page-cache.ts` alt sier om nettopp den
  spørringen: «DB nede: behold cachen. Den er det eneste som fortsatt kan
  svare.» Da er det ingenting å vente på.
- **`DB_RETRY_BUDGET_MS` leses PER KALL**, ikke én gang ved import — samme grunn
  som `PAGE_CACHE_MAX_BYTES` (#105): tallet skal kunne endres uten en deploy, og
  en vakt skal kunne måle regelen uten å vente 25 s.
- **Vakta er `test/db-retry-budget.test.ts`**, og den måler mot en «pool» som
  bare er svaret sitt — regelen skal kunne måles uten en database som er nede.
  Fem halvdeler: BUDSJETTET (flere spørringer i én forespørsel deler ett),
  DELINGEN (er det brukt opp, får neste nei MED EN GANG — ellers ville
  «budsjett/N per spørring» bestått), RETRYEN (den lever fortsatt, ellers er
  DB-restarten fra 2026-07-28 tilbake), SKRIPTENE (utenfor en forespørsel har
  hvert kall sitt eget) og VERSJONSSJEKKEN (eget budsjett, og `index.ts` bruker
  det faktisk — sømmen leses, siden `index.ts` starter en server ved import).
  RUTA måler at hver forespørsel virkelig kjøres inne i et budsjett, gjennom den
  injiserte versjonsleseren. Fem mutasjoner kjørt.
- **Ikke gjort, med vilje:** `DB_CONNECT_TIMEOUT` (2 s) er urørt. Saken lot det
  stå åpent om det var poolen vår eller en blipp som bare rammet NYE
  forbindelser, og det spørsmålet kan bare avgjøres med en måling i prod — å
  flytte tallet herfra ville vært et gjett. Det er allerede env-styrt, så det
  krever ingen deploy den dagen målingen finnes.

### Et avbrudd som VARER lenger enn budsjettet er 503, ikke 500 (#108)

Budsjettet over er et TAK, og et tak har en andre side: varer avbruddet lenger,
kaster `db.ts`. Appen hadde ingen `app.onError`, så kastet ble Honos standardsvar
— en naken **500**. Målt 2026-08-31T01:45:37–01:45:47Z fikk to bingbot-hentinger
og én SemrushBot nettopp det, etter 22,0 / 25,7 / 22,6 sekunder:
`/en/1kr%C3%B8n/1`, `/en/historier/daniel-i-lovehulen`, `/es/historier/babels-tarn`.
Samme blipp traff konto, hides og fuglefestival; bibel-hono var den eneste som
ga 5xx til en klient. Restansen fra #95, og samme mangel som felte puzzles
(`flogvit-com-puzzles#59`) og lab (`flogvit-com-lab#14`).

- **Statuskoden er hele utfallet.** Sida er ikke i stykker — basen var borte et
  halvminutt, som er forventet drift på en delt node uten SLA. 500 sier «denne
  adressen er i stykker», og gjentatte 500-er tar den ut av indeksen; 503 +
  `Retry-After` er den dokumenterte måten å si «midlertidig». Lastvernet i
  `page-cache.ts` svarer allerede nettopp det under overlast, med samme
  sekundtall (30) — det er samme beskjed, og den veien fantes. Den var bare ikke
  koblet til DB-avbruddet.
- **Ikke alt blir 503, og det er hele skillet.** En spørring mot en tabell som
  ikke finnes er en defekt hos OSS og skal stå som 500. «503 på alt» ville
  gjemt hver eneste bug bak et løfte om at det går over av seg selv.
  Klassifiseringen er `isConnectionError()` fra `db.ts`, altså SAMME regel som
  avgjør om spørringen gjentas i det hele tatt — to lister ville vært to steder
  å glemme neste feilkode.
- **Svaret er ren tekst, ikke 404-sidas HTML.** Å rendre `Layout` her ville
  kjørt chrome-komponentene på nytt i nettopp det øyeblikket noe er galt, og et
  kast INNE i `onError` gir Honos nakne 500 tilbake — altså feilen om igjen. En
  crawler leser statuskoden og `Retry-After`. API-stier svarer JSON, som
  `app.notFound()` allerede gjør, og en `HTTPException` beholder sitt eget svar:
  et bevisst 4xx fra en middleware skal ikke bli vår 500.
- **Loggen skiller de to like tydelig som svaret.** Et DB-avbrudd er drift og
  får én linje (det kommer én per forespørsel i en byge); en ekte feil er den
  ene gangen vi vil ha hele stacktracen. Uten `onError` logget Hono selv — den
  linja måtte erstattes, ikke bare fjernes.
- **Vakta er `src/lib/db-avbrudd-503.test.ts` og har to halvdeler.** REGELEN
  måler BEGGE veier (forbindelsesfeil → 503 med `Retry-After`, ekte feil → 500
  UTEN — ellers ville «503 på alt» bestått), pluss JSON på `/api/` og
  `HTTPException`. FLATA er sakens eget bevis: appen bootes mot en port ingen
  lytter på (ECONNREFUSED med en gang, framfor et tidsavbrudd som ville gjort
  vakta treg), og de tre adressene fra Caddy-loggen må svare 503. Den siste
  halvdelen krever at `/robots.txt` fortsatt svarer 200 i samme tilstand —
  ellers ville en «fiks» som svarer 503 på ALT mens basen er nede bestått, og da
  hadde vi tatt ned selve bremsen på lasten (#64). Seks mutasjoner kjørt,
  inkludert nettopp den.
- **Budsjettet leses per kall (#107), og det er derfor vakta kan måles.** Den
  setter `DB_RETRY_BUDGET_MS` lavt framfor å vente 25 sekunder.

#### En rute som fanger sitt EGET kast når aldri `app.onError` (#109)

Samme avbrudd, sett fra loggen. Containerloggen bar denne tre ganger i vinduet
2026-08-31 00:58–02:08Z — samme byge som #108, uten at noe var rullet ut:

```
code: "ERR_MYSQL_CONNECTION_TIMEOUT"
  at wrapError (internal:sql/mysql:14:10)
  at #onClose (internal:sql/mysql:192:22)
```

- **Formen er MÅLT, ikke gjettet.** Den oppstår i det øyeblikket
  feilOBJEKTET fra Bun rekkes til `console.error` — reprodusert med en base som
  ikke svarer, mot en app uten `app.onError` (altså taggen som sto i prod,
  `20260830-235034-091af4e`, som ligger ÉN commit foran #108-fiksen). De tre
  dumpene er de tre 500-ene i #108.
- **#108 lukket bare halve klassen.** Sidene lar kastet gå til `app.onError`,
  men **hver eneste rute under `/api/` fanger sitt eget** (`try { … } catch
  (error) { console.error('Error fetching X:', error) }`) og når derfor aldri
  dit. Signaturen lever videre der, fra ~55 kallsteder ingen liste kan holde
  styr på. `loggFeil()` i `error-handler.ts` er regelen ETT sted, og den er
  `feilsvar` sin: drift får én linje, en ekte feil beholder hele stacktracen.
  `feilsvar` kaller nå den samme funksjonen framfor å ha sin egen kopi.
- **Loggen alene ville vært å skru ned lyden på en alarm.** `initBooks()`
  kjøres ÉN gang ved oppstart og prøves aldri igjen, så en container som bootet
  mens basen var borte sto med tom bok-cache ut sin levetid. `requireBooks()`
  kaster «initBooks() er ikke kjørt», som IKKE er en forbindelsesfeil — altså
  **naken 500 i det uendelige** på `/personer/*`, `/historier/*`, `/statistikk`
  og hele `/api/books`, mens basen forlengst var frisk. Ingen 503, ingen
  `Retry-After`, ingen loggrad etter den ene ved oppstart. Målt, ikke antatt.
- **`ensureBooks()` laster på nytt fra en middleware**, altså inne i
  forespørselens retry-budsjett (#107): en blipp rides av, et lengre avbrudd
  blir 503 (#108), og svaret kommer i det øyeblikket basen er tilbake — uten en
  restart. Alle som venter deler ÉN lasting, og en lasting som FEILET nulles,
  ellers er permanensen bare flyttet inn i hjelperen.
- **Montert på sidene og på `/api/`, ikke på `*`.** `/robots.txt`, sitemapene,
  delekortene og `public/` slår ikke opp en bok, og en brems bak sin egen port
  er ingen brems (#64). Mutasjonstestet nettopp slik.
- **Vakta er `test/db-avbrudd-logg.test.ts` med fire halvdeler.** REGELEN
  (begge veier: drift uten feilobjektet, en defekt MED — ellers ville «logg
  aldri objektet» bestått og hver bug hos oss blitt sporløs). SVEIPEN (hele
  /api-RUTETABELLEN med basen nede, så en ny rute med et rått
  `console.error(…, err)` blir rød uten at noen fører den opp; bok-cachen
  lastes FØRST, ellers stopper middlewaren forespørselen før ruta kjører og
  sveipen måler seg selv). OPPSTARTEN (et EGET PROGRAM: bok-cachen er
  modulnivå-tilstand, og signaturen skrives til EKTE stderr — 503 under
  avbruddet, 200 etterpå, robots.txt urørt). SØMMEN (`index.ts` starter en
  server ved import og leses derfor fra kilden). Åtte mutasjoner kjørt.
- **RESTANSE, ikke løst her:** under et avbrudd svarer 33 av 55 `/api`-ruter
  fortsatt **500** framfor 503, fordi hver av dem returnerer sin egen
  `c.json({error}, 500)` etter å ha fanget kastet. Det er #108s avgjørelse tatt
  om igjen på API-flata, og en egen sak — 55 statuskoder er ikke en logglinje.

## Lastvern (anonyme sidevisninger)

`src/lib/page-cache.ts` er både mikrocache OG lastavvisning (#4, #14): anonyme
GET-HTML-sider caches, og render over semafor-taket får utløpt cache-innhold
(stale) eller 503 + `Retry-After: 30` etter kort kø. Innloggede går alltid
utenom. Env: `RENDER_MAX_CONCURRENT` (6), `RENDER_QUEUE_MAX` (samme tall som
taket), `RENDER_QUEUE_WAIT_MS` (3000),
`PAGE_CACHE_TTL_MS` (1 time), `PAGE_CACHE_VERSION_CHECK_MS` (30 s) og
`DB_POOL_MAX` (default 5 — sett den etter hva databasen din tåler; en for liten
pool var nettopp det som ga 502 under samtidighet).

**Taket beskytter RESPONSTIDEN, ikke bare mot kollaps (#19).** 24 samtidige
render på én delt vCPU betyr at hver enkelt tar 24× så lang tid: natt til
2026-07-29 svarte vanlige kapittelsider på 8–29 sekunder mens semaforen «holdt».
Riktig utfall under overlast er raske 503-er til noen få, ikke 20-sekunders svar
til alle. Standarden er derfor lav og skal MÅLES, ikke gjettes oppover.

### Men taket alene ga ikke raske 503-er — det gjorde KØEN (#19)

Med taket nede på 6 i prod ble episoden 2026-08-05 målt på nytt: bare **2**
forespørsler fikk 503, altså det taket ble bedt om. Men **12 fikk 3–9 sekunder**,
og begge 503-ene kom etter nøyaktig **3,003 s** — som er `RENDER_QUEUE_WAIT_MS`.
«Raske 503-er til noen få» var hele poenget, og det var ikke det som skjedde. Å
senke taket videre flytter grensen, det fjerner den ikke: mekanismen sitter i
køen bak semaforen, ikke i tallet foran den.

- **Køen er like lang som taket** (`RENDER_QUEUE_MAX`, default =
  `RENDER_MAX_CONCURRENT`). Uten en lengde er den et løfte vi ikke kan holde:
  over taket VET vi med en gang at vi ikke kan betjene alle, og brukte likevel
  opp hele fristen før vi sa nei. Er køen full, svarer forespørselen straks —
  stale om vi har en utløpt kopi, ellers 503. Verst var nettopp stale-veien: en
  kopi vi hadde liggende i minnet ble holdt tilbake i tre sekunder mens leseren
  ventet på å få høre at vi var opptatt.
- **Lengden er ikke et nytt gjettet tall.** Står du bakerst i en kø som er
  lengre enn taket, rekker du uansett ikke fram innen fristen når rendrene er
  trege — da er plassen i køen bare ventetid med et nei i enden. Senkes taket,
  følger køen med.
- **Plassen går til den FERSKESTE, ikke til den som har ventet lengst.** FIFO ga
  den ledige plassen til den som var nærmest å gi opp, og la dermed køtiden oppå
  rendertiden for alle — det er den formen de 12 svarene på 3–9 s har. Antallet
  vi rekker å betjene er det samme uansett rekkefølge; det er fordelingen av
  ventetid som endres, og under overlast er det den som er problemet. Er det
  ikke overlast, er køen tom eller én lang, og de to rekkefølgene er samme sak.
- **Vakta er `test/render-queue.test.ts`, formulert på TIDEN og på HVEM som blir
  betjent** — ikke på tallene i konfigurasjonen, så en fiks som løser det på en
  annen måte består like gjerne. Fire halvdeler: et nei kommer straks framfor
  etter fristen, en stale kopi vi HAR holdes ikke tilbake, køen slipper fortsatt
  til når en plass blir ledig (ellers ville «avvis alt» bestått de to første), og
  den ferskeste får plassen. Fire mutasjoner kjørt (ubegrenset kø, `shift()`
  framfor `pop()`, ingen kø i det hele tatt, kølengde løsrevet fra taket).
- **Ikke gjort:** `RENDER_QUEUE_WAIT_MS` er urørt. Med en begrenset kø er den et
  tak på hvor lenge noen kan vente forgjeves, ikke lenger prisen alle betaler —
  og å flytte den uten en ny måling ville vært et gjett.

**TTL-en er en time, med invalidering på innholdsversjon.** Innholdet endres bare
ved import, og en crawler går gjennom samme URL flere ganger i timen (5289
forespørsler over 1068 unike stier i hendelsen). Cachen leser `db_meta.sync_version`
med jevne mellomrom gjennom en INJISERT leser (`setContentVersionReader`, satt i
`index.ts`, ikke i `createApp()` — cachen skal kunne testes uten DB) og tømmer seg
selv når versjonen endres. Feiler spørringen, BEHOLDES cachen: den er det eneste
som fortsatt kan svare.

### Et budsjett i TEGN er ikke et budsjett i minne (#105)

Appen ble OOM-drept hvert ~14. minutt av sitt eget 288 MiB-tak, og minnet
vokste ~5 MiB/min uten å flate ut. Det så ut som en lekkasje — `--smol`
stanset den ikke, og et tak kan ikke stanse noe som holder på referansene sine
— men det er ingen lekkasje: mikrocachen fyller seg gradvis mens en crawler går
over UNIKE adresser, og **taket den fylles til var dobbelt så høyt som tallet i
koden**. Prosessen ble drept før cachen var full, og da er «vokser lineært og
flater aldri ut» nøyaktig hva en helt vanlig oppfylling ser ut som.

- **`bytes = body.length` teller TEGN.** En JS-streng koster én byte per tegn
  bare når HVERT tegn er under 256; ett eneste tegn utenfor latin1 tvinger hele
  strengen til UTF-16, og en kapittelside bærer hebraisk og gresk. Målt over 100
  ekte kapittelsider: **1,97 byte beholdt heap per tegn**, altså et 48 MB-tak
  som i virkeligheten var ~96 MB — på en container med 288 MiB.
- **Fiksen er ikke å gange med to.** Kroppen LAGRES som byte
  (`Uint8Array`): det er formen den sendes i uansett, den er én flat allokering
  på nøyaktig den størrelsen regnskapet fører, og et ANSLAG som kan drive fra
  virkeligheten er byttet mot et tall som ER virkeligheten. En treffende
  forespørsel slipper dessuten å kode strengen til byte på nytt, og en bom
  slipper å dekode dem til en streng bare for å telle dem.
- **Målt på PLATÅET, ikke på stigningen — for begge former plateauer.** Fire
  runder à 300 unike sider mot samme budsjett (48 MB), samme syntetiske
  kapittelmarkup, samme maskin:

  ```
  tegn:  runde 1  280 MB RSS / 156 MB heap  …  runde 4  444 / 247
  byte:  runde 1  202 MB RSS /  93 MB heap  …  runde 4  298 / 141
  ```

  Begge flater ut i runde 3. Forskjellen er ikke om de flater ut, men på
  HVILKET NIVÅ — og det gamle nivået lå over containerens tak, så prosessen
  ble drept før den kom dit. Beholdt heap faller 247 → 141 MB, altså ~106 MB,
  som er nettopp de 48 MB ekstra tegnene lagret i to byte hver. Tallet 48 MB
  står uendret — det betyr nå det det alltid sa.
- **Marginen er ikke stor, og det skal sies høyt.** Prod-tallene i saken
  (149,2 MiB etter 3 min, 181,1 etter 5) ekstrapolerer til ~102 MiB grunnlast,
  altså ~186 MiB å gå på under 288. 48 MB beholdt cache pluss allokatorens
  høyvannsmerke fra rendringen får plass der, men ikke med mye klaring — er
  drapene fortsatt der etter utrulling, er `PAGE_CACHE_MAX_BYTES` knappen, og
  neste post å måle er engangskosten i `getAvailableMappings()` under.
- **Taket PER SIDE måtte følge enheten.** `/nb/sal/119` er den største sida vi
  serverer (1,20 MB), og et tak som ble stående i den gamle enheten ville
  stille kastet nettopp de dyreste sidene ut av cachen: de svarer 200 som før,
  bare uten cache, og ingenting i loggen sier fra. Det er den motsatte skaden,
  gjort mens man fikser denne.
- **`PAGE_CACHE_MAX_BYTES` og `PAGE_CACHE_MAX_ENTRY_BYTES` er ENV-styrte.**
  Minnebudsjettet i driftsrepoet er oppbrukt, så den dagen dette må ned igjen
  skal det ikke kreve en deploy av appen.
- **Vakta er `test/page-cache-memory-budget.test.ts`**, og minnet måles i et
  EGET PROGRAM (`page-cache-memory-probe.ts`) av samme grunn som i #104: `bun
  test` kjører alle filene i samme prosess, så et tall målt der inne er summen
  av alt som har kjørt før. Fire halvdeler: REGNSKAPET (det cachen fører er
  aldri LAVERE enn antallet byte sida leveres som — et gulv framfor et
  likhetstegn, så en fiks som beholder strengen og fører opp to byte per tegn
  også består; med et tak, ellers ville «gang med hundre» bestått ved å gjøre
  cachen ubrukelig liten), BUDSJETTET (en crawl over unike adresser vokser
  under et tak utledet av budsjettet — målt 64 MB mot 161 MB med den gamle
  tellingen, med IDENTISK antall oppføringer, så det er ikke hvor mange sider
  cachen holder som er forskjellen), TAKET PER SIDE (Sal 119 caches fortsatt)
  og REGELEN (en side over taket caches ikke i det hele tatt). Prøvekroppene i
  måleprogrammet er ASCII-markup med en håndfull hebraiske ord, som en ekte
  kapittelside: et rent hebraisk dokument ville skjult forskjellen, for der er
  UTF-8 og UTF-16 like dyre. Seks mutasjoner kjørt.
- **Ikke gjort her, men tatt i #106 under:** `getAvailableMappings()` leser 1158
  mappingfiler ved første kapittelrender og etterlater +53 MB RSS permanent
  (målt). Det er en ENGANGSKOST som ikke vokser, altså ikke symptomet i DENNE
  saken — men den er halvparten av «grunnlasten» neste sak måtte forklare.

#### En ENGANGSKOST er ikke gratis når taket er 288 MB (#106)

Drapene fortsatte etter #105, og saken pekte på et tall ingen hadde forklart:
«162 MB grunnlast er mye for en SSR-app. Hvorfor, er ikke undersøkt.» Målt
herfra: **54,1 MB av de 162 er ÉN funksjon**, brent på den FØRSTE
kapittelrenderen etter hver restart — altså på en tilfeldig leser, hver gang.

`getAvailableMappings()` bygger nedtrekket «Versnummerering» i verktøylinja, og
leste alle 1158 vendrede mappingfilene (~109 MB JSON) for å hente tre felter
per fil. #19 sørget for at filene ikke BLIR LIGGENDE, og det er sant: heapen
viser ingenting galt etterpå. RSS gjør det. Allokatorens høyvannsmerke fra
109 MB churn gis aldri tilbake til OS-et, og **RSS er tallet cgroup-en teller**
når den bestemmer seg for å OOM-drepe containeren. Målt: 54,1 MB → 0,9 MB,
345 ms → 1,3 ms.

- **Å lese filene BILLIGERE er ikke fiksen.** Et rent byte-skann uten
  `JSON.parse` (tell oppføringer ved å gå gjennom bufferet) ble målt til
  +55 MB — praktisk talt det samme. Kostnaden er å røre 109 MB i det hele
  tatt, ikke hva man gjør med dem. Lista bygges derfor av KATALOGEN, uten å
  åpne én eneste fil.
- **Ingenting gikk tapt, og det er målt framfor antatt.** `file.name` er
  ORDRETT id-en i alle 1158 filene, altså den strengen filnavnet allerede ga
  oss; `shortname`/`displayName` kom uansett fra `MAPPING_META` for de 13 som
  har et menneskelig navn. Det ENESTE feltet som trengte fila var
  `entryCount` — og det leses ingen steder: ikke av nedtrekket, ikke av
  /innstillinger, ikke av `translations.js`, som er den eneste klienten av
  `/api/mappings/kvn`. Et felt ingen ser til 54 MB på en container med 288 er
  ikke en handel verdt å gjøre, og det er derfor det er FJERNET framfor
  beholdt — motsatt av #46/#61/#73, der det som sto på spill var innhold noen
  faktisk fikk se.
- **Vakta er `test/mapping-list-memory.test.ts`, og minnet måles i et EGET
  PROGRAM** — som #104 og #105, og her med en grunn til: lista er memoisert,
  altså målbar nøyaktig én gang per prosess. Fem halvdeler: MINNET (RSS-vekst
  under et tak, og en tid — 109 MB JSON kan ikke leses på under et kvart
  sekund — med et krav om at lista faktisk BLE bygget, ellers ville «returner
  tom liste» vært den billigste fiksen), ALT SKAL MED (lista er nøyaktig
  katalogen, i samme rekkefølge), NAVNET (de 13 navngitte utgavene beholder
  sitt, og ingen oppføring får et tomt navn — en tom `<option>` er en rad
  leseren ikke kan velge), DATA (påstanden fiksen hviler på, målt for HVER
  fil og ikke for et utvalg: `name` i fila er id-en — og bare HODET av hver
  fil leses, 400 byte × 1158, ellers ville vakta kostet det den er skrevet for
  å fjerne) og FLATA (API-svaret bærer hele lista, og nedtrekket på
  kapittelsida har fortsatt like mange `<option>` som katalogen har filer).
  Sju mutasjoner kjørt.
- **Det som IKKE er forklart av dette, og som er den større posten:** 100
  unike kapittelrender tar RSS fra 146 til 313 MB **med mikrocachen helt
  avskrudd**, mens heapen er 23 MB etterpå. Det er allokator-høyvann fra
  selve rendringen — snittsida er 357 kB, Sal 119 er 1,18 MB — og det
  platåer, men på et nivå over 288. Egen sak; her er bare grunnlasten målt.
- **Nedtrekket er 54 kB av HVER kapittelside** (11 % av en snittside), fordi
  det er 1158 `<option>`. At vi tilbyr 1158 versnummereringer i verktøylinja
  er en produktavgjørelse, ikke en feil, og hører i sitt eget issue.

#### Ingenting holdes i live — det er ALLOKATOREN som ikke gir tilbake (#110)

«15 MB/t, rett linje i sju timer» leste som en lekkasje, og saken pekte på fire
ubundne mapping-cacher. Målt herfra er svaret et NEI på begge, og begge halvdeler
er nå målbare uten ssh:

```
 60 unike kapittelrender   live-sett  8,1 → 10,0 MB     rss +48 MB
120 unike kapittelrender   live-sett  8,1 →  8,6 MB     rss +15 MB
240 unike kapittelrender   live-sett  8,1 →  9,1 MB     rss +75 MB
```

- **Live-settet skalerer ikke med renderne.** Det står på 8–10 MB uansett om
  sidene er nye eller de samme, mens residenten klatrer i sprang og så flater
  ut (målt lokalt: ~480–500 MB etter ~1500 render, med mikrocachen AV). Det er
  formen allokator-høyvann har, ikke formen en voksende heap har — altså
  motsatt av det saken leste ut av ett øyeblikksbilde. Restansen fra #106 er
  dermed denne saken, og den er ikke en lekkasje.
- **Hypotesen kunne per konstruksjon ikke stemme.** Hver eneste vei inn til de
  fire cachene — kapittelsida, `/api/chapter`, `/api/mappings/kvn/:id`,
  `enrichWithVerseText` — går gjennom `resolveMappingId()`, som svarer på 14 av
  de 1158 filene. En crawler som går nedtrekket ovenfra og ned legger derfor
  ikke igjen ÉN oppføring; den får osnb-sida tilbake for de 1144 andre.
  (At nedtrekket TILBYR 1144 valg som stille faller tilbake til osnb er en ekte
  defekt, men det er #106s nedtrekks-sak, ikke denne.)
- **`heapUsed` alene kan ikke avgjøre det, og det er grunnen til `heapGulv`.**
  Øyeblikksbildet bærer usamlet søppel og svingte 21–140 MB i den SAMME
  kjøringen mens live-settet lå i ro; to avlesninger med timer imellom ville
  sammenliknet GC-faser. `minneRegnskap()` fører derfor det LAVESTE tallet den
  har sett, og en poller som spør hvert minutt treffer tilstanden rett etter en
  samling mange ganger i timen. Stiger gulvet, holdes noe i live. Vi tvinger
  ALDRI fram en GC for å få tallet — `/api/minne` er offentlig, og en samling
  midt i en forespørsel er en pause for en leser.
- **Vakta er `test/minne-vekst.test.ts` med tre halvdeler.** LIVE-SETTET (eget
  program, som #104/#105/#106: `bun test` deler prosess — 240 unike render, og
  live-settet må stå stille; med krav om at sidene faktisk svarte 200 med en
  ekte kropp, ellers ville en 404-sveip bestått taket og målt ingenting).
  HYPOTESEN (40 katalog-id-er ingen kan slå opp sendes på BEGGE flatene, og
  ingen cache får en oppføring — mens en id som VIRKELIG finnes fortsatt
  lastes, ellers ville «cache aldri noe» bestått; taket er formulert som
  ANTALL OPPLØSELIGE, ikke som tallet 14, så en ny navngitt utgave hever det
  selv). GULVET (ren logikk mot en injisert avlesning: gulvet stiger aldri og
  følger heapen ned, og `/api/minne` gir begge ut). Fem mutasjoner kjørt,
  inkludert en render som holder 20 kB per side i live.
- **Én samling er ikke nok når man måler live-settet.** JSC frigjør en del
  objekter forsinket, så `Bun.gc(true)` uten en tur innom hendelsesløkka ga
  22–50 MB for det SAMME settet. Med `await Bun.sleep(25)` mellom samlingene
  lander avlesningene på ±30 kB. Gjelder enhver framtidig minnesonde her.
- **«Det som står igjen er ikke en kodefeil» var FEIL, og målingen over er
  grunnen til at den kunne rettes.** Live-settet står stille, altså holdes
  ingenting i live — men det følger ikke at ingenting er galt. Det følger at
  det er TOPPEN per render som er for høy, og en topp har en årsak man kan
  navngi når man leter etter den. Den står i avsnittet under.

#### TOPPEN er en kapittelside som leser HELE personregisteret (#110)

Med gulvet på plass sto spørsmålet igjen: hva ER toppen? Målt per getter i
`loadChapterData` på `/en/rom/8` — en ferdig side på 232 kB:

```
getPersonsByChapter          2029 rader, 8,1 MB tekst   +36,1 MB rss   36 ms
getStoriesByChapter          1357 rader, 1,1 MB          +3,7 MB rss    8 ms
getNumberSymbolismByChapter   326 rader, 1,7 MB          +2,8 MB rss    5 ms
getThemesByChapter             37 rader, 0,1 MB          +3,3 MB rss    1 ms
```

Fire gettere henter HELE tabellen for språket og `JSON.parse`-r hver eneste rad
for å finne de få som adresserer dette kapittelet. ~43 MB flyktig per
kapittelrender, på den mest besøkte flata vi har (1189 kapitler × 8 språk) — og
det er nettopp den kurven saken beskriver: residenten klatrer i sprang mens
live-settet ligger i ro på 8 MB.

- **Kommentaren over dem var riktig, og likevel ikke svaret.** «SQLite brukte
  json_each/json_extract; i MySQL filtrerer vi i JS i stedet» stemmer: å dytte
  filteret ned i SQL mot BLOBBEN er MÅLT dyrere (`LIKE` 38,8 ms, `REGEXP`
  54,2 ms mot 23,3 ms for å hente og parse alt), fordi MySQL må lese og skanne
  blobbene uansett. Det den ikke vurderte var hva PARSINGEN og HENTINGEN
  koster oss, og det er der de 36 MB-ene ligger.
- **To grep, fordi kostnaden ligger to ulike steder — og det er MÅLT, ikke
  antatt.** For de tre små er det parsingen: `bookMentionTest()` er en
  STRENGTEST på råraden, og en rad uten teksten `"bookId": <boka>` kan umulig
  bestå det eksakte predikatet. For `persons` er radene 8,1 MB, og der hjelper
  et JS-forfilter nesten ikke — målt over fem kapitteloppslag i hver sin
  ferske prosess: `+101 MB` som i dag, `+88 MB` med strengtest, `+14 MB` når
  basen holder blobben tilbake. Radstrengene er kostnaden, og de kommer uansett
  når `content` står i `SELECT`-en.
- **`persons.ref_books` er en AVLEDET kolonne** (`,1,45,`) med bok-id-ene raden
  adresserer — ~200 byte mot blobbens ~4 kB. Spørringen sender `content` bare
  for radene den peker ut: 2029 rader inn, 63 blobber ut på `/en/rom/8`.
- **`IF(...)`, ikke `WHERE` — og det er ikke en stilvalg.** `inLanguage()`
  avgjør språket på ANTALL rader, altså «har tabellen rader i det hele tatt for
  dette språket», ikke på om KAPITTELET har noe. Et kapittelfilter i `WHERE`
  ville gitt null rader for en bok ingen nb-person adresserer, og sendt
  nb-sida videre til de ENGELSKE personene (#26). Raden blir derfor med som
  før; det er bare blobben som holdes tilbake. Utslaget ville vært 200 og
  ingen loggrad, så `SPRÅKVALGET`-halvdelen i vakta er den eneste som ser det.
- **NULL betyr «ikke beregnet» og gir blobben ut som før.** Kolonnen er en
  optimalisering, aldri en sannhet: en base der synken ikke har kjørt svarer
  som før, bare like tregt som før. Motsatt regel ville gjort en avledet
  kolonne som henger etter innholdet til en stille tapt person på en
  kapittelside — samme klasse hull som #45, #65 og #69.
- **Spørringene er FASTE STRENGER med `?`-parametre**, ikke satt sammen — heller
  ikke synken, som grupperer på verdi og sender id-ene som ett
  `FIND_IN_SET`-argument framfor å bygge en `IN (…)`-liste av variabel lengde.
  Da finnes det ingen SQL her som er satt sammen av data i det hele tatt.
- **Synken kjøres fra `runMigrations()` og fra slutten av importen**, altså ved
  HVER deploy og hver innholdsrunde — samme to steder som #46, #61 og #92, og
  ETTER `prunePersonRefs()`, ellers indekseres adresser ryddingen nettopp har
  fjernet. Kolonnen legges til i migreringen og ikke bare i DDL-en:
  `CREATE TABLE IF NOT EXISTS` treffer bare nye baser. Den skriver bare rader
  som har endret seg — målt lokalt 4058 rader fordelt på 438 verdier, 1,6 s
  første gang og 0 skrivinger hver gang etterpå.
- **Vakta er `test/blob-forfilter.test.ts` med seks halvdeler.** REGELEN (ren
  logikk: blind for formateringen — `persons` ligger pen-printet, `stories`
  kompakt — og `45` er ikke `450`; NULL gir JA). SUPERSETTET (DATA, hele basen:
  verken forfilteret eller kolonnen får kaste en rad det EKSAKTE predikatet
  ville beholdt). SVARET (adressene velges av DATAENE som i #70 og #80, og de
  to veiene sammenliknes rad for rad; pluss ett kapittel uten personer, så
  «returner alt» ikke består). SPRÅKVALGET (spørringen gir én rad per person i
  språket UANSETT bok — boka velges av dataene — og blobben holdes faktisk
  tilbake, ellers ville «send alt» bestått). FORMEN (hver av de fire getterne
  må narre før den parser, og testen må BRUKES: å la `bookMentionTest(bookId)`
  stå mens `.filter()` fjernes er nettopp mutasjonen som ellers slipper
  gjennom). MINNET (eget program som #104/#105/#106, og BEGGE veiene i hver sin
  ferske prosess: et absolutt MB-tall er en egenskap ved maskinen, FORHOLDET er
  en egenskap ved koden — målt 67 MB gammel mot 21 MB ny, med krav om at de
  finner NØYAKTIG de samme personene). Ni mutasjoner kjørt.
- **Restanse:** de 1158 `<option>` i verktøylinja er fortsatt 54 kB av hver
  kapittelside, og resten av toppen er selve rendringen. Begge er avsnittet
  over sine, ikke denne.

### En byge kommer fra ÉN aktør — og den kan være nåbar (#86)

60 × 503 i vaktvinduet 2026-08-07, og **alle 60 lå innenfor 32,7 sekunder** av
11,4 timer. Det er ikke et utfall, det er én byge, og hver avvisning tok
nøyaktig 3,00 s (= `RENDER_QUEUE_WAIT_MS`) — lastvernet gjorde altså jobben
sin. PerplexityBot sto for 92 av 117 ankomster i bygen og 47 av de 60
avvisningene, med toppfart målt til **7 req/s** fra sju sammenhengende
adresser. Over hele vinduet er den 1,1 % av volumet: den er ikke stor, den er
rask, og med taket på 6 holder én slik aktør til å fylle semaforen alene.

- **Håndtaket er `Crawl-delay` i robots.txt, og det koster null kollateral.**
  Aktøren henter fila og gikk 0 av 204 ganger mot en `Disallow`-sti — vi hadde
  bare aldri BEDT den om noe: robots.txt hadde ingen agent-seksjon i det hele
  tatt. Det er motsatt av den udeklarerte farmen (`flogvit-com-server#12`),
  der 1 213 IP-er og roterende Chrome-UA-er gjør at ingen signatur når fram og
  eneste håndtak er et `/16`-område med uttalt kollateral. **Blokkering er
  ikke foreslått**: aktøren gjør ingenting galt, den er bare raskere enn én
  delt vCPU tåler.
- **En navngitt gruppe ERSTATTER `*` (RFC 9309 §2.2.1) — den arver
  ingenting.** Det er fella, og den er stille: en `User-agent:
  PerplexityBot`-seksjon med bare en `Crawl-delay` ville opphevet alle
  `Disallow`-ene fra #60 for nettopp den crawleren som går fortest, altså
  åpnet 498 672 adresser samtidig som fila ser mer forsiktig ut. `group()` i
  `seo.ts` gjentar derfor forbudene i hver seksjon, og `CRAWL_DELAYS` er
  kartet — en ny aktør arver forbudene gratis.
- **Tallet er en fart, ikke pynt.** `Crawl-delay: 2` = 0,5 req/s, under en
  tredel av de 1,8 req/s `#19` målte at velter siden, så de øvrige aktørene
  deler resten. Heltall: desimaler tolkes ulikt fra crawler til crawler.
- **Ikke i `*`-gruppa.** En generell brems treffer Applebot og SERanking (som
  ikke er problemet), bommer på Amazonbot og farmen (som ikke leser fila) og
  ignoreres av Googlebot uansett — `Crawl-delay` står ikke i RFC 9309 og er en
  anmodning, ikke en garanti. Håndtaket er verdt noe nettopp fordi det er rettet
  mot en aktør som beviselig leser og følger fila.
- **Neste håndtak ligger i et ANNET repo.** En UA-basert rate-limit i Caddy
  (`flogvit-com-server`, mønsteret `@metacrawl` alt bruker på
  `meta-externalagent`) er dyrere og koster synlighet i Perplexitys svar. Måles
  bygen på nytt og `bygesum sekunder` fortsatt er > 0, står det valget igjen —
  og det er Vegards, ikke vaktens.
- **Ikke lukk saken på at volumet falt.** 85 % av forespørslene kan forsvinne
  uten at ett eneste bygesekund gjør det (`flogvit-com-server#13`).
  Nullmålingen å sammenlikne mot er `bygesum 26 60 100 18 18.0 27 7`.
- **UMÅLT ER IKKE GRØNT — og det er ikke en formalitet her.** Fiksen er ute
  (deploy-tagg `20260807-070417-3eb0735`, containeren oppe 2026-08-07T07:05:15Z),
  men aktøren har ikke vært innom siden: 0 forespørsler, 0 × 503. Begge
  robots.txt-hentingene i loggvinduet (02:34:09Z og 06:34:09Z) ligger FØR
  utrullingen, så de 7 req/s er målt før vi ba den senke farten og sier
  ingenting om etterlevelse. Den henter fila hver fjerde time; første ærlige
  måling kan tidligst gjøres etter neste henting.
- **Verifiseringen må kreve at aktøren ER SETT etter utrullingen.** Feltet i
  saken (`grep PerplexityBot | grep -c '"status":503'` over hele
  `access.log`) tar feil begge veier: det leser den samme loggen som fortsatt
  bærer bygen fra FØR fiksen (svarte 47 kl. 09:06Z, uansett hvor godt fiksen
  virker), og i det øyeblikket loggen roterer forbi 05:51Z blir det **grønt av
  stillhet** — en aktør som ikke har vært innom har heller ingen 503-er. Målingen
  er derfor tidsavgrenset til utrullingen, og `sett=0` gir exit 1:

  ```sh
  ssh flogvit-vm 'docker exec server-caddy-1 sh -c "cat /var/log/caddy/access.log"' \
   | LC_ALL=C awk -v fra=1786086316 '
     /PerplexityBot/ {
       match($0,/"ts":[0-9.]+/); t=substr($0,RSTART+5,RLENGTH-5)+0
       if (t < fra) next
       sett++; if ($0 ~ /"status":503/) avvist++
     }
     END { print "sett=" sett+0, "503=" avvist+0; exit !(sett>0 && avvist==0) }'
  ```

  `fra` er utrullingen. Kommandoen krever VM-tilgang og ligger bak
  prod-grensen — den er for etterkontrollen eller for et menneske, aldri for
  smia. Er svaret `sett>0` og `503>0`, ignorerer aktøren anmodningen, og da er
  det håndtak 2 over som står igjen.
- **Vakta er `test/crawl-delay.test.ts`**, og halvdelene er formulert på hva en
  crawler FÅR LOV TIL, ikke på linjene i fila. REGELEN (ren logikk: en seksjon
  med bare `Crawl-delay` åpner det `*` stengte — halvdelen finnes for å bevise
  at matcheren ser fella). AKTØREN (bygeaktøren er navngitt, med produkt-tokenet
  slik det står i den målte User-Agent-strengen; «Perplexity» matcher ingen
  gruppe og er en stille no-op). FORBUDENE (hver navngitt seksjon stenger alt
  `*` stenger, og ingen sitemap-URL er forbudt for den — begge veier, ellers
  ville «`Disallow: /` for den ene» bestått). FARTEN (delayen finnes, er et
  heltall og gir høyst 0,5 req/s). `test/robots.ts` ble gruppebevisst i samme
  slengen: `parseRobots(txt, agent)` velger gruppe som RFC-en, `namedAgents()`
  og `crawlDelayFor()` leser resten. Åtte mutasjoner kjørt.

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

#### En KATALOG under en montering er hverken fil eller side (#95)

`/js/` og `/css/` svarte **500** der de ni andre flatene svarer 404. `etagFor()`
i `static-cache.ts` stat-et `./public/js/` uten å klage — en katalog stat-er
helt fint — og kastet så EISDIR på `arrayBuffer()`, altså FORBI vernet
`if (!stat) return null`. `catch`-en dekket `stat()`, ikke lesingen, og kastet
ble ubehandlet.

- **Ingen leser møter det:** layout lenker aldri en monteringsrot, så
  regresjonssveipene og røyktesten spurte aldri om `/js/`. Det som treffer den
  er skannere som sonderer katalogindekser, og prisen ligger der: en 5xx-rad i
  `usage_errors` eskalerer i vaktbriefen hver time uten at `vakt-kjent.tsv` kan
  dempe den. Én skanner vekker altså en ubetjent kjøring.
- **`isFile()` er skillet.** Alt som ikke er en vanlig fil har ingen ETag å gi,
  så middlewaren faller gjennom framfor å lese.
- **Å falle gjennom holdt ikke alene.** serveStatic finner ingen fil, og stien
  har ikke punktum, så locale-forhandlingen tok over og lovte `/en/js/` — som
  heller ikke finnes: 302 → 301 → 404, to hopp og en **render-plass** (#64
  kjenner en fil på punktumet, og en katalogsti har ikke det) for et svar som
  uansett er «her er ingenting». `staticMountNotFound` svarer derfor 404 rett
  under monteringene, uten HTML-kropp og uten omvei — ordrett samme regel som
  under `/og/` (#84). Bare KATALOGENE: en manglende fil-montering (`/og.png`)
  har alt punktum i stien og 404-er av seg selv.
- **`STATIC_MOUNTS` er én sannhet**, delt av begge middlewarene og av vakta —
  lista lå som en literal i `app.ts`, og en ny montering ville ellers vært to
  steder å huske.
- **Vakta ligger i `test/static-cache.test.ts` og har tre halvdeler.** REGELEN
  (middlewaren alene: hver katalogmontering faller gjennom til neste handler
  framfor å kaste, mens en ekte fil fortsatt merkes — ellers ville «returner
  alltid null» bestått). FLATA (hver katalog under `public/` svarer 404, uten
  omvei og uten HTML-kropp; katalogene velges av DATAENE, så en ny
  underkatalog måles uten at noen fører den opp). Og det må FINNES en
  katalogmontering, ellers måler de to andre ingenting. Fem mutasjoner kjørt,
  inkludert den smale fiksen som bare slipper `/js/` gjennom.
- **Restansen om `app.onError` er tatt i #108** — se «Et avbrudd som VARER
  lenger enn budsjettet er 503, ikke 500» under retry-budsjettet. Den er samme
  mangel som felte puzzles ved en DB-blipp (`flogvit-com-puzzles#59`).

##### Og roten UTEN skråstrek er den formen som faktisk skrives (#96)

EISDIR-en over ble meldt på nytt, men loggvinduet (05:05–06:15Z) ligger i sin
helhet FØR fiksen ble merget (06:40Z), og bibel-hono ble ikke rullet ut i det
vinduet i det hele tatt — taggen `20260815-061507-cce4c54` er `server`-repoet.
De seks hendelsene er altså førfiks. Det som fortsatt var galt, var samme regel
én bokstav unna: `startsWith('/js/')` ser ikke `/js`.

- **Formen uten skråstrek er den en skanner — og et menneske — skriver.** Den
  har ikke punktum, så `NOT_A_PAGE` (#64) ser ingen fil, og den gikk videre i
  locale-forhandlingen til `/en/js`: 302 og så en 404-SIDE. Det er de to samme
  prisene #95 tok bort for `/js/` — en omvei og en render-plass bak semaforen
  (#19) — for et svar som uansett er «her er ingenting».
- **Roten matches EKSAKT.** Som prefiks ville monteringen slukt enhver
  sideadresse som deler bokstavene (`/jsonfil`), altså byttet et billig 404 mot
  en side som forsvinner. Vakta måler nettopp den nabostien.
- **Vakta er de to nye halvdelene i `test/static-cache.test.ts`:** hver
  monteringsrot (fra `STATIC_MOUNTS`, ikke en egen liste) svarer 404 uten
  `Location` og uten HTML-kropp, og REGELEN krever i tillegg at nabostien går
  videre — ellers ville «404 på alt» bestått. Fem mutasjoner kjørt: feilen
  gjeninnført, roten som prefiks, 404 på alt, redirect framfor 404, og den
  smale fiksen som bare tar `/js`.

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

#### Et SVAR som er større enn heapen bygges STYKKEVIS (#104)

`/api/mappings/kvn/all` bygde alle 1158 KVN-mappingfilene til ETT objekt og
serialiserte det. Målt: 73 MB JSON, **232 MB heap og 925 MB RSS av én anonym
forespørsel** — og filene ble liggende permanent i fil-cachen etterpå, siden
ruta gikk gjennom `getKvnMappingRaw()`. Med et minnetak på containeren er det
ordrett signaturen saken er meldt på: `FATAL ERROR: Reached heap limit`.

- **Prisen er HELE APPEN, ikke et dårlig svar.** Prosessen dør, containeren
  starter på nytt, og hver leser som var midt i noe mister svaret sitt —
  mikrocachen er dessuten tom etterpå, så den dyreste renderen er tilbake for
  alle. Utslaget er stille som i #45 og #65: smoke sjekker at flatene svarer,
  og en app som nettopp kom opp igjen svarer 200.
- **Ruta ligger under `/api/`, altså UTENFOR lastvernet** (`page-cache.ts`
  slipper `/api/` rett gjennom). Semaforen fra #19 kan altså ikke avvise to
  samtidige kall, og to kall er to ganger så mye minne.
- **Strømmen er fiksen, ikke et tak på hva vi deler ut.** `pull` kalles når
  mottakeren er klar, og hver runde leser nøyaktig én mapping og slipper den —
  toppen er da én fil (~0,6 MB) uansett hvor stor responsen er. Innholdet er
  bit-identisk: 1158 nøkler, samme rekkefølge, samme verdier. Å svare mindre
  ville vært å bli kvitt symptomet ved å ta bort noe vi HAR (#46, #61, #73).
- **`loadRawMappingUncached()` framfor fil-cachen**, og det er samme avveining
  `getAvailableMappings()` alt tar: det som skal leses ÉN gang, skal ikke bli
  liggende. Cachen er riktig for de mappingene en leser velger (14 av 1158
  resolver i det hele tatt, og de leses om igjen på hver sidevisning) og feil
  for et gjennomløp av katalogen. `verse-mapper-cache.test.ts` teller derfor
  tre `loadUkvnMapping`-kallsteder, ikke to.
- **Vakta er `test/mapping-bulk-heap.test.ts`, og den måler i et EGET
  PROGRAM** (`mapping-bulk-probe.ts`). `bun test` kjører alle 69 filene i samme
  prosess, så et minnetall målt der inne er summen av alt som har kjørt før —
  et tak på det ville vært et tak på suiten, ikke på ruta. Fem halvdeler:
  MINNET (topp-heap og RSS under et tak; målt 232/925 før, 52/169 etter),
  RETENSJONEN (heap etter GC — ellers ville en fiks som strømmet svaret men
  fortsatt cachet hver fil bestått, og prosessen dødd på neste forespørsel),
  ALT SKAL MED (alle id-ene er der, en hel fil finnes ordrett i strømmen, og
  svaret er over 50 MB — uten den ville «svar `{}`» vært den billigste
  fiksen), JSON-RAMMA, og FORMEN (hver rute under `/api/mappings` er enten
  målt eller ført opp i `IKKE_MÅLT` med en grunn, så en ny bulk-rute ikke kan
  legges til i stillhet). Mutasjonstestet ved å sette den gamle ruta tilbake:
  to halvdeler blir røde, de tre andre grønne — som de skal, for den gamle
  ruta delte ut det samme.
- **Målingen er også svaret på hvorfor de andre minne-postene ikke er dette:**
  mikrocachen har tak (48 MB), kortcachen i `routes/og.ts` har tak (256), og
  mapping-cachene kan i praksis bare vokse til de 14 id-ene som resolver. Denne
  ene ruta var det eneste stedet én forespørsel kunne ta heapen alene.

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

### Sandkassen er den ene grunnen til å starte Chrome på nytt (#85)

De tre filene som måler i ekte Chrome — `mobile-layout`, `reading-width`,
`key-event-promise` — feilet ALLE i en ubetjent agentkjøring, med
`CDP-tidsavbrudd: Page.enable` etter 30 s. Chrome starter, DevTools-endepunktet
svarer, `Target.createTarget` og `Target.attachToTarget` gir svar — men
rendrerprosessen kommer aldri opp, fordi Chromes EGEN sandkasse ikke får starte
under den profilen (`sandbox initialization failed: Operation not permitted`).
`bun run test` var dermed rødt (818 pass, 3 fail) uansett hva branchen endret,
og det er merge-porten: en fiks som ellers er grønn blir ikke merget.

- **Porten må skille «layouten er brutt» fra «nettleseren fikk ikke starte».**
  Begge var rødt, og et menneske måtte lese stacktracen for å vite hvilket.
- **`test/chrome-cdp.ts` leser stderr HELE veien**, ikke bare til
  DevTools-adressen. Linja om sandkassen står FØR adressen, i den samme
  strømmen — den gamle lesingen slapp taket ett hakk for tidlig og kastet det
  eneste sporet som forklarte tidsavbruddet.
- **Den spør etter en RENDRER før den lover en nettleser.** Helsesjekken er de
  samme tre kallene `open()` gjør, med en kort frist (10 s), så en rendrer som
  blir borte uten å si hvorfor ikke blir et nytt 30-sekunders tidsavbrudd.
- **Bare sandkassen gir et nytt forsøk.** `launchWithSandboxFallback` prøver med
  sandkasse, og på nytt med `--no-sandbox` KUN når stderr meldte at den ikke lot
  seg starte. Alt annet — Chrome som ikke finnes, en WebSocket som ikke kobler,
  et tidsavbrudd med en annen årsak — bæres videre uendret. **Ser du
  «CDP-tidsavbrudd» nå, er det ikke sandkassen: den navngir seg selv.**
- **Avveiningen er tatt, ikke ramlet ut av et flagg.** Å slå av sandkassen for en
  LESER er noe helt annet: denne nettleseren starter på `about:blank`, laster
  bare våre egne bytes fra en localhost-server vi selv startet, kjører bare
  uttrykk vi selv skriver, og lever i sekunder i en testprosess. Fiendtlig
  innhold fra nettet — det sandkassen verner mot — finnes ikke her. Den sier det
  høyt hver gang den måler uten (`SANDBOX_WARNING`, og `chrome.sandboxDisabled`).
- **Regelen er formulert på INITIALISERINGEN, ikke på ordet «sandbox».** Chrome
  advarer selv mot flagget vi nettopp satte («unsupported command-line flag:
  --no-sandbox»); kjente vi den igjen som en feil, ville forsøk nummer to blitt
  meldt mislykket mens alt virket.
- **Vakta er `test/chrome-sandbox.test.ts`, og den består BEGGE steder** — hjemme
  der sandkassen starter, og ubetjent der den ikke gjør det. Fire halvdeler:
  REGELEN (linja kjennes igjen, og bare den — målt på ordrett stderr fra begge
  oppstartene), ORKESTRERINGEN (fire utfall, der «en annen feil» er en ekte feil
  uten nytt forsøk), FLATA (en ekte Chrome MÅLER, og sier fra om den måler uten
  sandkassen) og INGEN STILLE SKIP. Seks mutasjoner kjørt.
- **Å la vaktene hoppe over seg selv er IKKE svaret**, og det er den siste
  halvdelens jobb å hindre: da står #50, #55, #70, #73 og #78 uten port, og
  suiten melder grønt for en layout ingen har målt.

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

**En test som starter et EGET PROGRAM må DEKODE stien til repoet.**
`new URL('..', import.meta.url).pathname` er prosentkodet — samme
representasjonsfelle som #80, én etasje ned. Arbeidstrærne bor under
`.flogvit-orkester/trær/`, så cwd-en blir `tr%C3%A6r`, som ikke finnes, og
`Bun.spawn` melder da **ENOENT på «bun»** framfor på katalogen som mangler.
Utslaget er merge-porten: begge CLI-vaktene feilet komplett i ethvert
arbeidstre uansett hva branchen endret (som #85). Bruk `Bun.fileURLToPath()`.

**En DB-testfil oppgir taket sitt selv: `setDefaultTimeout(DB_TEST_TIMEOUT_MS)`
(#74).** Buns standard er 5000 ms, og det tallet er valgt for en test som enten
svarer med en gang eller henger — ikke for en hook som migrerer skjemaet.
`ensureSchema()` er 33 CREATE TABLE + hele `runMigrations()`: målt 2,4 s på en
tom maskin og 14 s på en travel. Utslaget er ikke en rød test, men at HELE FILEN
forsvinner — ryker `beforeAll`, kjøres ingen av testene, og suiten melder et
lavere totaltall som ser grønt ut (799 mot 822 i saken). Én konstant i
`test/db-timeout.ts`, og linja gjelder både hooks og tester i filen, så en tung
sveip inne i en `test()` arver samme tak. **Ikke skriv et eget tall ved siden
av** — det setter taket ned igjen uten at noen ser det. Vakta er
`test/db-test-timeout.test.ts`, og den er formulert på hva filen NÅR: enhver
testfil som transitivt importerer `src/lib/db.ts` må bære linja, og en fil som
ikke gjør det må la være (ellers ville «sett den overalt» bestått, og de rene
logikktestene mistet 5 s-taket sitt i stillhet). Fire mutasjoner kjørt.

**En testfil som skrur ned LASTVERNET setter det tilbake:
`afterAll(resetPageCache);` på toppnivå (#72).** `bun test` kjører alle filene i
SAMME prosess, og knappene, cachen, semaforen og versjonsleseren i
`page-cache.ts` er modulnivå-tilstand. `page-cache.test.ts` satte taket til ETT
render-spor og 30 ms køtid for å måle lastavvisning, og satte det aldri tilbake
— så alt som kjørte etterpå målte mot en app vi ikke ruller ut. Utslaget er
STILLE og det er poenget: en sveip som henter sidene én om gangen holder seg
innenfor det ene sporet og består, mens fire samtidige hentinger gir tre
503-er. En vakt som da måler 503-siden i stedet for sida, består også — og
måler ingenting. Målt: fire samtidige hentinger etter `page-cache.test.ts` ga
`[503, 200, 503, 503]`.

- **`resetPageCache()` er ett kall for hele tilstanden.**
  `configurePageCache({})` satte bare KNAPPENE tilbake; semaforen var det
  ingenting som kunne nullstille. En render som aldri ble ferdig — en test som
  røk på taket, en port som aldri ble åpnet — holdt plassen sin ut prosessen,
  og kapasiteten var da lavere enn den som sto i konfigurasjonen.
  `releaseRenderSlot()` har et gulv på null, ellers ville en render som
  fullførte ETTER nullstillingen tatt telleren negativ og hevet taket permanent
  — den motsatte feilen, like stille.
- **Linja skal stå på TOPPNIVÅ**, ikke inne i describen som skrudde. Da fyrer
  den etter siste describe, uansett hva noen legger til nederst i fila.
- **Vakta er `test/page-cache-reset.test.ts`, og den har to halvdeler.**
  STRUKTUREN er formulert på hva filen GJØR — kaller den `configurePageCache(`,
  må den bære linja, og en fil som ikke rører lastvernet må la være (ellers
  ville «sett linja overalt» bestått). RESETTEN måler at linja virker: at et tak
  satt for en måling ikke gjelder etterpå, at en forlatt render ikke holder
  plassen, og at en sen release ikke hever taket. Kapasiteten leses fra
  `PAGE_CACHE_DEFAULTS` framfor å skrives av. Fem mutasjoner kjørt.

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

### En vakt som bare måler basespråket, måler de KORTESTE strengene (#70)

Sveipen over kjørte hele `PAGES` på `DEFAULT_LOCALE`, og engelsk er nettopp det
språket som gir de korteste strengene vi har. Tysk setter sammen ord, finsk
bøyer med lange endelser, svensk har «Tillgänglighetsredogörelse» — og ingen av
de sju andre flatene hadde noen gang vært målt. Seks av dem var for brede på
320 px, og `/nb/tilgjengelighet` allerede ved **100 %** tekst. Samme klasse hull
som #45, #65 og #69: en side som er for bred svarer 200 og skriver ingen
loggrad, så skaden er bare synlig for den som holder telefonen.

- **Alle 41 sidene × sju språk er 287 målinger**, altså minutter i ekte Chrome.
  Sidene velges derfor av DATAENE: for hvert språk måles de tre sidene der
  SPRÅKET SELV er mest utsatt, rangert etter det lengste ordet siden har på det
  språket og IKKE på basespråket — altså nettopp det oversettelsen legger til.
  Fordi valget følger dataene, flytter en ny eller nyoversatt streng målingen
  dit selv.
- **Løpende bokstaver, ikke «ord» mellom mellomrom.** Nettleseren bryter etter
  en bindestrek, så `bok-kapittel-versstart` er ikke én bred klump — den ville
  ellers vunnet på hvert eneste språk og skjøvet de ekte sammensetningene ut av
  utvalget.
- **Ord basespråket OGSÅ har teller ikke** (URL-er, hebraisk, id-er, egennavn
  fra dataene): de er like brede på alle åtte flatene og er alt målt av sveipen.
- **Fiksen er å la `overflow-wrap` ARVES fra `body`.** #50 førte opp de
  tekstbærende taggene (`p`, `li`, `td`, …), og den lista holdt bare fordi den
  ble målt på engelsk: hvert språk som setter sammen ord fant et sted den ikke
  dekket — en `h1` på `/tilgjengelighet`, en `span` i en toggle-etikett på
  `/innstillinger`. Unntaket lista skulle verne trengs ikke: chrome som må stå i
  ett stykke er `white-space: nowrap`, og der gjør `overflow-wrap` ingenting.
  Regelen slår heller aldri inn på et ord som får plass.
- **Kjøretid er en del av regelen, ikke en unnskyldning for å la være.**
  Utvalget koster ~25 s (41 sider × 8 språk SSR, fire om gangen, og 21
  Chrome-målinger) på toppen av de ~30 s sveipen alt brukte.

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

### En LAYOUT er ikke en spalte — den får headerens bredde (#78)

`--maxw` (1120 px) er en LESEBREDDE: den finnes for at én tekstkolonne ikke skal
bli for lang å følge. Kapittelsida er noe annet — den deler bredden på tre
(innholdsfortegnelse, tekst, studiepanel) — så taket traff feil del, og
tekstdelen betalte for alle tre: **448 px lesbar tekst på en 1440 px skjerm**,
mens headeren rett over strakte seg 1192 px og margen tok 180 px på HVER side.
Utslaget er stille som i #45, #65 og #70: sida svarer 200 og ser riktig ut, og
bare den som sitter foran den ser at teksten er trang mens plassen står tom.

- **`wide` på `Layout`** gir `.site-main-wide`, altså `--maxw-wide` framfor
  `--maxw`. Utelatt = lesebredden, som er riktig for alt som ER én spalte.
  Regelen er hva sida GJØR med bredden, ikke hvilken rute det er.
- **Boksen OG innrykket er headerens** — `--maxw-wide` og `--chrome-pad`, brukt
  begge steder. Deler de ikke innrykk, ligger kantene 4 px fra hverandre, og da
  ser sida ut som to sider oppå hverandre framfor som én bredde. Ett tall er
  dessuten det eneste som hindrer at de driver fra hverandre senere.
- **Mobil beholder sine 20 px.** Det er #50s avgjørelse, tatt for at
  lesekolonnen ikke skal stå unødig langt inn på en 390 px-skjerm — og under
  768 px biter taket uansett ikke, så bare innrykket ville endret seg.
- **Vakta er `test/reading-width.test.ts`**, i ekte Chrome på to desktop-bredder
  (1280 og 1440, så et hardkodet tall ikke består). Den har to halvdeler:
  KANTENE (de tre delene spenner nøyaktig headerens innhold, verken smalere
  eller bredere) og TEKSTEN (hele gevinsten havner i tekstdelen, og den lesbare
  kolonnen er over 500 px). Den andre finnes fordi den første alene ville
  bestått både av et tak på `.chapter-content` — sida brer seg ut, pikslene går
  til margen, leseren merker ingenting — og av å krympe HEADEREN i stedet. Fire
  mutasjoner kjørt.
- Motsatt akse av `mobile-layout.test.ts`, som måler at ingenting er for BREDT
  for skjermen. Denne feilen er bare synlig der det er plass til overs, altså
  aldri på en telefon.

### DEKOR ligger bak innholdet — rekkefølgen i markupen er ikke en avgjørelse (#90)

Velkommenboksen på forsiden har en gyllen glød i hjørnet
(`.home-continue::after`). Både gløden og innholdet er posisjonert UTEN
`z-index`, og da avgjør DOM-rekkefølgen hva som havner øverst — et
pseudo-element er sist, altså over alt annet. Gløden er dessuten ugjennomsiktig
i midten (`--gold-soft` er en BLANDET farge, ikke en alfa), så den la et slør
over teksten fra høyre hjørne og nedover. Målt: 73 kanaltrinn på
`.home-continue-sub`, og «Start med 1. Mosebok 1» på den gylne knappen var knapt
lesbar.

- **Mobil er verst, men feilen er ikke mobilens.** Sirkelen er 380 px bred; på
  390 px viewport er kortet ~350 px, altså dekker dekoren nesten hele boksen. På
  1280 px traff den fortsatt undertittelen. En fiks bak et brekkpunkt ville latt
  halve feilen stå — den er mutasjonstestet nettopp slik.
- **Fiksen er å gjøre lagdelingen eksplisitt** (`z-index: 0` på gløden, `1` på
  barna), ikke å krympe eller fjerne dekoren. Kortet er den første flata en ny
  leser ser, og en glød som er borte er ikke en penere glød.
- **Utslaget er stille, som #45, #65 og #70:** sida svarer 200, ingen loggrad, og
  bare den som ser på skjermen merker at teksten er blass. `mobile-layout`
  måler BREDDE og kunne per konstruksjon ikke se det.
- **Vakta er `test/welcome-box-glow.test.ts`, og den er formulert på UTFALLET:**
  ikke ett piksel som ER tekst blir farget om av dekoren. Den måler i ekte
  Chrome, tar to skjermbilder av samme flate (med dekoren og uten), og
  sammenligner bare GLYFKJERNENE — piksler som uten dekoren treffer elementets
  egen `color`. Kantutjevning holdes utenfor: et kantpiksel er blandet med
  bakgrunnen og SKAL endre seg når en glød ligger bak det; det er nettopp
  forskjellen på «bak» og «over». Elementene velges av SIDA (alle i boksen som
  bærer en tekstnode), så et nytt element arver målingen. PNG-en dekodes i
  sidas eget canvas framfor i en egen dekoder. Andre halvdel krever at gløden
  fortsatt MALER kortet, ellers ville «slett dekoren» bestått; en tredje at det
  finnes glyfkjerner å måle, ellers ville en for streng terskel gjort de to
  andre til tom påstand. Fire mutasjoner kjørt (dekoren fjernet, fiks bare
  under 768 px, tom måling, og feilen gjeninnført med `z-index: auto`).

### ADRESSEN bærer rekka — ellers kan sida ikke markere den (#91)

«Romerne 12:14-15» i Dagens vers pekte på `/nb/rom/12#v14`. Leseren ble scrollet
ned midt i kapittelet og satt igjen uten noe som sa hvilke vers referansen
gjaldt — verset man kom for er ett av tretti like linjer. Feilen lå ikke i
lesesida: etiketten lovte to vers, og hashen kunne bare uttrykke ett.

- **`public/js/verse-hash.js` eier FORMEN**, delt av serveren (link-byggerne) og
  lesesida — samme grep som `reading-progress.js`. Bygger og leser i hver sin
  fil ville vært to representasjoner av samme adresse, altså to steder å drive
  fra hverandre.
- **Sluttverset utelates når det ikke legger til noe.** En adresse skal ikke
  påstå en rekke den ikke har, og byggere som bare HAR ett vers (personchips,
  søketreff) arver dermed regelen uten en egen gren.
- **Den gamle formen (`#v14`) leses fortsatt.** Den ligger i delte lenker,
  bokmerker og søkeindekser, og en delt lenke lever lenger enn en deploy.
- **Merket er subtilt med vilje** — gyllen tone og en tynn kantlinje, ikke en
  overstreking leseren selv har laget. Det negative venstremarget spiser
  kantlinja + innrykket, så merkede og umerkede vers står på samme grunnlinje;
  uten det ville halve kapittelet flyttet seg 12 px når man kom fra en lenke.
- **Vakta er `test/verse-jump-marker.test.ts`**, og den følger kjeden i tre
  trinn. REGELEN (ren logikk: bygg og les er hverandres motstykke, og en hash vi
  ikke kjenner gir null framfor et halvt svar). LENKENE er en SVEIP over rendret
  HTML, ikke en liste over kallsteder: hver etikett som viser `<kap>:<fra>-<til>`
  for kapittelet lenka peker på, må adressere nøyaktig den rekka — så en ny
  referanseblokk måles uten at noen fører den opp, og en sveip uten treff er
  rød. FLATA måler i ekte Chrome at merket VIRKER (#55-fella: en klasse
  stilarket ikke honorerer): hele rekka merkes og ingenting utenfor, merket er
  synlig mot et umerket vers, den gamle formen merker fortsatt ett vers, uten
  hash er ingenting merket, og merket gjør ikke sida bredere enn skjermen på
  320 px — `mobile-layout.test.ts` måler uten hash og ser aldri merkede vers.
  Sju mutasjoner kjørt.

### EN BREKKET linje eier ikke lenger høyrekanten (#93)

Den faste legal-raden (portal/FOOTER.md) er merke · Vilkår · Personvern · Konto ·
© år. På desktop får alt plass på én linje, og `margin-left: auto` holder
copyright-en til høyre — det er et bevisst oppsett. På en telefon får den ikke
plass, og da skjøv det samme margen den helt ut til høyre på sin EGEN linje:
innrykket fra alt annet i footeren, under høyre ende av lenkene. Målt før
fiksen: venstrekant 239 av en 350 px rad på 390 px, 169 av 280 på 320 px.

- **`margin-left: auto` kan ikke skille de to tilfellene.** Den betyr «ta all
  ledig plass til venstre», og på en linje der posten er alene er det hele linja.
  Merke og lenker er derfor ÉN flex-post (`.site-footer-legal-main`), så raden
  har nøyaktig to, og `justify-content: space-between` fordeler PER LINJE: deler
  copyright-en linje, står den til høyre; brekkes den ned, er den alene og
  havner på venstrekanten sammen med alt annet.
- **Ikke et `@media`-brekkpunkt i px.** Raden brekkes tidligere når leseren
  forstørrer teksten, og et px-brekkpunkt kjenner ikke skriftstørrelsen — samme
  felle som i #50. Mutasjonstestet: fiksen bak `max-width: 768px` blir rød på
  800 px ved 200 % tekst.
- **Å hindre brekkingen er ikke fiksen.** `nowrap` her ville gjort sida bredere
  enn skjermen, altså byttet #93 mot #50. Vakta avviser den.
- **Vakta er `test/footer-legal-wrap.test.ts`, formulert på LINJENE:** hver
  linje i raden begynner på radens venstrekant, uansett hvor mange linjer den
  ble. Linjene grupperes ved loddrett OVERLAPP, ikke ved eksakt `top` — postene
  er grunnlinjejustert, så merket og lenkene står på ulik `top` på samme linje —
  og halvdelen kjenner ingen klassenavn utover raden selv, så et nytt ledd i den
  faste raden måles gratis. Språket velges av ORDBØKENE (som #70: engelsk
  skriver raden kortest), i tillegg til `nb` som saken er meldt på. DESKTOP
  krever at copyright-en fortsatt står til høyre OG at lenkene står inntil
  merket; uten den andre ville «venstrestill alltid» og «dropp grupperingen»
  rettet telefonen ved å legge om desktop. ROLLENE og «raden brekkes faktisk»
  finnes for at de tre andre ikke skal måle ingenting. Seks mutasjoner kjørt.

### HJELPEMIDLENE ER ENTEN EN KOLONNE ELLER ÉN TAPP UNNA (#94)

Studiepanelet (oppslag, sammendrag, personer, viktige ord, tidslinje) er en
kolonne i `.chapter-layout` på desktop. Under 1100 px har grid-en to spor og
tre barn, så panelet falt ned UNDER teksten: 792 px hjelpemidler 4632 px nede
på en 390 px-skjerm, altså etter hele kapittelet. ▥ i bunnlinja åpnet det
samme innholdet i et overlegg — som lå under headeren og ikke lot seg lukke.

- **Regelen som skulle skjult panelet sto der fra før og VIRKET IKKE.**
  `@media (max-width: 1100px) { .reading-sidebar { display: none } }` i
  `reading.css` har samme spesifisitet som `.reading-sidebar { display: flex }`
  i `studium.css`, og studium.css lastes ETTERPÅ — altså taper den på
  REKKEFØLGE. Media-spørringen legger ikke til spesifisitet. Kvalifisert med
  forelderen (`.chapter-layout .reading-sidebar`) vinner den. Ordrett samme
  felle som #55, og den er stille: regelen ser riktig ut i stilarket.
- **Verktøylinja tar over ved NØYAKTIG samme bredde.** Den sto på 768 px mens
  panelet forsvant på 1100, så mellom 769 og 1100 fantes verken kolonnen eller
  knappen — hjelpemidlene lå bare som en klump under teksten. De to
  brekkpunktene er én avgjørelse: er panelet ute av layouten, ER ▥ veien inn.
- **Overlegget dekker sida, altså også chromen.** `z-index: 80` mot headerens
  klebende `500` gjorde at headeren la seg over overleggets øverste 53 px —
  nettopp der tittelen og ✕ står. Målt med treffprøve: fingeren på ✕ traff
  headerens hamburgermeny. Panelet lot seg åpne og ikke lukke, som saken sier.
  Laget er nå 900, samme som hurtigtast-hjelpen, under kommandopaletten (2000).
- **Fanerada blir med inn i overlegget.** Den er skjult i sidebaren (vises bare
  i panelmodus på desktop), og når sidebaren er borte på mobil er overlegget
  eneste vei inn — uten fanene ser leseren studium-seksjonen og ALDRI
  tidslinje, paralleller eller innsikt. Tre av fire seksjoner var rendret og
  uoppnåelige på telefon. `activateTab` slår derfor opp i DOKUMENTET framfor i
  sidebaren: en fane som er flyttet ut ville ellers sluttet å bytte seksjon
  uten å se annerledes ut.
- **Fanerada leveres tilbake PÅ SIN PLASS**, som søsken før `[data-sidebar-content]`
  og ikke inni det: inne i det rullende innholdet mister den plassen sin over
  seksjonene i panelmodus på desktop. Målt som egen mutasjon.
- **⚙-arket er urørt.** Det er bunnforankret, så ✕ ligger godt under headeren —
  målt treffbar på 320 og 390 px ved 100 % og 150 % tekst, også på en 500 px høy
  skjerm. Samme z-index-klasse, men ingen målt defekt, og vi retter ikke noe vi
  ikke har målt.
- **Vakta er `test/study-panel-mobile.test.ts`, i ekte Chrome** — SSR-HTML og
  happy-dom har ingen layout-motor og kan per konstruksjon verken se plassering
  eller overlapping. Tre halvdeler: VEIEN (ved 320/390/900 er panelet ute av
  flyten OG åpneren synlig; ved 1280 er panelet fortsatt en kolonne ved siden av
  teksten, ellers ville «slett panelet» bestått), FLATA (treffprøve med
  `elementFromPoint` på ✕ og på overleggets header — et `z-index`-tall sier
  ingenting om hva fingeren treffer, #55-fella) og INNHOLDET (hver fane viser
  sin egen seksjon, og innholdet er tilbake på sin plass etter lukking). Åtte
  mutasjoner kjørt.

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

#### FEILGRENEN er også brukervendt tekst (#71)

`bookName()` fikset det leseren ser når alt går bra. `/api/reference` svarte
fortsatt hardkodet norsk på alle åtte språk — «Mangler søkeparameter», «Ugyldig
format», og de to tellemeldingene bygget av `book.name_no`, altså NØKKELEN:
`?q=sal 200&lang=fr` ga «Salmene har 150 kapitler».

- **Hullet er LATENT, og det er grunnen til at det sto åpent.** Ingen klient
  viser feltet i dag — `cmdk.js` og `studium.js` leser bare `data.reference` og
  faller til null ved feil. Det gir verken 404, 5xx eller en loggrad, så ingen
  sveip kunne se det; den dagen noen viser `data.error` (den åpenbare
  forbedringen når leseren skriver «sal 200» og ikke får svar) er teksten norsk
  på sju språk. Samme klasse som #45, #65 og #69.
- **`parseReference()` returnerer en NØKKEL, ikke tekst.** Den er ren logikk
  uten request-kontekst og kan derfor ikke vite hvilket språk kallet kom på —
  sto teksten der, sto den på ett språk for alle åtte. `ReferenceError` er
  `{ key, params, bookId }`, og `referenceErrorText(t, err)` oversetter ett sted,
  delt av begge grenene i ruta. Ruta har alt riktig locale (`apiLocale`, #24).
- **Boknavnet er `{book}`, satt inn med `bookNameById()`.** `params.book` bærer
  `name_no` bare som siste utvei for en bok-id den statiske tabellen ikke har —
  samme avveining `formatParsedReference()` alt gjør. Lå navnet i params som
  nøkkelen, ville malen vært fransk og boka norsk, altså #69 om igjen.
- **Vakta er `test/api-reference-errors.test.ts`, formulert på UTFALLET og ikke
  på de sju målte inputene:** hver feil endepunktet svarer med må være en
  RENDRING av en `ref.err.*`-verdi i ordboka for språket i kallet (malen leses
  ut av ordboka, `{plassholder}` blir `.+`), så en ny feilgren med hardkodet
  tekst matcher ingen nøkkel og blir rød uten at noen fører den opp. Tre
  halvdeler til: REGELEN (parseren gir en nøkkel som FINNES, og engelsk sier noe
  annet enn norsk), tellemeldingene navngir boka gjennom `bookName()`, og
  nøklene finnes på alle åtte språk — ellers ville sveipen lett i en tom liste
  og aldri fått noe å matche. Fem mutasjoner kjørt.
- **De fire språkene uten in-house kilde (de, fr, sv, fi) bør leses over**, som
  boknavnene i #69: vakta ser at teksten går gjennom ordboka, ikke at den er
  riktig. Den finske tellemeldingen står som «{book}: {count} lukua» — boknavnet
  kommer fra dataene og kan ikke bøyes trygt.

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
