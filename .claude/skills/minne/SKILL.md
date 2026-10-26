---
name: minne
description: Minne og kapasitet: mikrocachen lagret som byte (#105), mappinglista fra katalogen (#106), allokator-høyvann og heapGulv (#110), blob-forfilteret og persons.ref_books (#110), profilering og batching (#19), strømmet bulk-svar (#104). Les før du endrer page-cache.ts sitt budsjett, verse-mapper.ts, getAvailableMappings, gettere som leser hele tabeller, eller ved OOM-drap.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

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
