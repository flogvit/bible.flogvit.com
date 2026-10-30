---
name: funksjoner
description: Lesesporing og sync-fletting (#16, #132), offline-lesing (#14, #136), «Ny versjon er lagt ut» (#161), verslister (#133), API-dokumentasjonen (#114), utgavevalget (#182) og importløypa for oversettelser (#200). Les før du endrer en av disse funksjonene.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

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
- **Singletons (`topics`, `settings`, `activePlan`, `readingPosition`,
  `verseVersions`) er én blob, nyeste vinner — men FRAVÆR er aldri en sletting
  (#132).** En ny enhet pushet før `null` for alt den ikke hadde, og slettet
  emner og innstillinger på alle enheter. Klienten pusher nå bare singletons den
  HAR, og en sletting bare fra `localStorage.removeItem` (merket i
  `bible-sync-deleted`). Serveren avviser `null` over ekte data med mindre
  klienten sender `baseUpdatedAt` ≥ serverens versjon (`bible-sync-base` holder
  den) — forsvaret står også mot gamle klienter i service worker-cachen.
  `topics` flettes IKKE: blobben har ingen slettemerker, så en union ville
  vekket opp emner og koblinger brukeren har fjernet. Samtidige endringer på
  to enheter er fortsatt nyeste-vinner; en ekte fletting krever at emnene blir
  `items` med skygge, som listene.
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

## Offline-lesing (#14, #136)

`/<lang>/offline` laster hele utgaven ned til IndexedDB (`offline.js`); uten nett
svarer service workeren (`public/sw.js`) med `/<lang>/offline-fallback`, og
`offline-reader.js` tegner kapittelet fra IndexedDB i lesesidens form —
grunntekst, ord for ord, kryssreferanser, sammendrag, kontekst og innsikt.

- **Skallet caches PER SPRÅK, aldri uprefikset.** `/offline-fallback` svarer 302,
  og en omdirigert respons kan ikke besvare en navigasjon — det var grunnen til at
  hvert ubesøkt kapittel ga Chromes feilside. `cacheOfflineShell()` i SW-en henter
  skallet, stilarkene og skriptene i HTML-en og modulene de importerer (rekursivt);
  den kjøres i bakgrunnen ved hver navigasjon under et språk, og nedlastingen VENTER
  på den (`CACHE_OFFLINE_SHELL`) før den sier «ferdig».
- **Språket leses av stien, ikke av en liste** i SW-en — språklista har én sannhet.
- **Skallet bærer det IndexedDB ikke har:** boknavnene på sidens språk og utgavene
  i språkets rekkefølge (`data-books`, `data-editions`, fra `offlineEditions()`).
  Samme funksjon gir avkryssingsboksene på `/offline`, så /en/ tilbyr OSEN.
- **Nedlastingen går forbi SW-cachen** (`x-bibel-offline`-headeren). Uten den lå
  alt dobbelt: 68 MB i IndexedDB og 147 MB i API-cachen.
- **Vakta er `test/offline-les.test.ts`:** laster ned i ekte Chrome, STOPPER
  serveren (nettverksemulering per fane rammer ikke SW-ens egne kall) og åpner et
  kapittel som aldri er besøkt, med bredde målt på 320/390 px og 100/150 % tekst.

## «Ny versjon er lagt ut» (#161, flogvit-com#339)

Kontrakten er `portal/VERSJON.md`. `public/js/ny-versjon.js` er en KOPI av
portalens `design/ny-versjon.js`, byte for byte — endres i portalen, skrives med
`bun versjonskopi.ts --skriv` i meta-repoet. `VersionHead` i `layout.tsx` legger
`<meta name="fv-versjon" content="<buildId()>">` og skriptet i hvert `<head>`
(også `/api/docs`, som har sitt eget). `/versjon.json` svarer bygget som
serveres nå, `no-store`, før sesjon og retry-budsjett. `buildId()`
(`lib/build-id.ts`) hasher `public/js`, `public/css`, `public/styles.css` og
`public/sw.js` — serverkode ber ingen laste på nytt.

- **PWA-banneret er foldet inn i felles linje.** En ventende worker sender
  `fv-ny-versjon` (pwa.js); knappen sender `SKIP_WAITING`, og siden lastes på
  nytt BARE etter det klikket. `sw.js` kaller derfor ikke `skipWaiting()` ved
  install — før lastet siden seg selv når workeren tok over, også ved første
  besøk.
- **Vakta er `test/ny-versjon.test.ts`:** kopien mot portalens `origin/main`,
  bygg-id-en, hver side i `PAGES` + `/api/docs` + uprefikset 404, at hvert
  skript og stilark sidene laster ligger under det som hashes, at SW-en aldri
  svarer `/versjon.json`, og PWA-ens «last bare når leseren ba om det». Fire
  mutasjoner kjørt. `island-strings.test.ts` hopper over kopien (den bærer
  portalens ordbok på åtte språk).

## Verslister (#133)

En liste kunne opprettes og navnet synkes, men ingenting la et vers i den, og
det fantes ingen `/lister/:id` — Plus lovte verslister, og hver liste var tom.

- **`public/js/verse-list.js` eier adresseformen** (`joh-3-16`, eller
  `joh-3-16-18` for en rekke) og importeres av lesesida, `user.js` og
  `user.tsx`. Formen er gamle appens og manuskriptenes `verses`, og den ligger
  alt i synkede lister — den kan ikke byttes.
- **Fra verset:** «Legg i liste» i versdetaljen er én avkrysning per liste
  (`renderVerseLists` i `reading.js`). Uten lister lenker den til `/lister`.
- **`/lister/:id`** rendrer versene server-side for en synket liste, og
  `user.js` rendrer på nytt fra den lokale kopien — ellers ville en liste som
  ikke er synket ennå vært tom. Boktabellen (slug → id, navn) ligger på sida,
  så øya slipper å hente alle 66 bøkene for å finne bok-id-en. `noindex`.
- **En adresse som ikke kan leses vises som den står**, med «Slett», framfor å
  forsvinne stille.
- **Vakta er `test/verslister.test.ts`**: den legger verset i lista på den EKTE
  kapittelsida (SSR fra appen, i happy-dom), synker lista slik øya skrev den og
  leser verset på `/lister/<id>`, og rendrer en lokal-only liste med user.js.

## API-et er BESKREVET, og beskrivelsen er målt (#114)

74 endepunkter — dagens vers, bibelteksten, studieinnholdet, brukerens egne
notater — og ingen beskrivelse noe sted. Den eneste måten å lære hva
`/api/chapter` tar imot var å lese `src/routes/api/`. For en som skal bygge noe
mot bible.flogvit.com fantes API-et da ikke.

- **`src/lib/openapi.ts` eier operasjonene**, og de brukes tre steder:
  `/api/openapi.json` (OpenAPI 3.1), utforskersida `/api/docs`, og vakta. Hver
  operasjon bærer `route` NØYAKTIG slik den står i RUTETABELLEN, med hono-formen
  på parametrene (`:date{[0-9]{4}-…}`) — det er dét som lar vakta gå begge veier.
  Hadde sida hatt sin egen liste, ville vakta målt at dokumentet er enig med seg
  selv (samme grep som `API_COLLECTIONS`, #61).
- **Sida er VÅR EGEN SSR, ikke `swagger-ui-dist` og ikke et CDN.** Repoets første
  regel er innebygd framfor npm-pakker, og #112 er hva som skjer når et
  verktøytre kommer inn bakveien. Et CDN ville dessuten gjort en side vi eier
  avhengig av at noen andre er oppe. **Dokumentet er standard**, så den som VIL
  ha Swagger UI eller Redoc peker den på `/api/openapi.json` — den veien er
  åpen, vi holder bare ikke på treet.
- **Eksempelet er MÅLT.** `prove.url` på hver operasjon er både adressen sida
  fyller «Send»-knappen med, og den vakta faktisk henter. Et eksempel ingen har
  kjørt er en gjetning med vår signatur på: endres et parameternavn, blir
  dokumentet rødt framfor å stå og love den gamle formen.
- **Sida står IKKE i `PAGES`,** og det er ikke en forglemmelse. `PAGES` er
  lokaliserte sider, og hver invariant der er formulert på åtte språk
  (hreflang-klynge, prefiksede lenker, ordbok, ingen norsk under `/en/`). En
  API-referanse er ett engelsk dokument under `/api/` og ville stått som unntak i
  hver eneste. Den har derfor sin egen BREDDE-halvdel i ekte Chrome — #50 er en
  klasse som ikke bryr seg om hvem sida er skrevet for.
- **Den er LENKET fra `/om`**, ved siden av de to repoene. En referanse ingen
  finner er den samme feilen én etasje ned; `/api/` er dessuten ikke sperret i
  robots.txt, så sida er også et svar på et søk.
- **Notatene ligger bak `POST /api/sync`**, ikke bak en `/api/notes`. Det er én
  delta-sync for alle datatypene (`notes`, `favorites`, `verseLists`,
  `devotionals`, `topics`, `readingProgress` …), og `lastSyncAt: 0` med tom
  `changes` henter alt. Dokumentet sier dette høyt, for et API som ser ut som
  det mangler notater er det samme som å mangle dem.
- **Vakta er `test/api-docs.test.ts` med fem halvdeler.** FORMEN (rutetabellen
  og operasjonene mot hverandre begge veier — en ny rute blir dokumentert eller
  rød, og en operasjon uten rute er et endepunkt vi sender klienter til en 404
  på). DOKUMENTET (OpenAPI-formen: sti-parametre deklarert og bare de,
  etikettene kjent, portene definert, ingen hono-form igjen i stiene).
  EKSEMPLENE (hver `prove.url` hentes; statusen må være dokumentert, og
  medietypen stemme). SIDA (hver operasjon vises med SIN egen metode, og hver
  fil sida ber om serveres). BREDDEN (320/390 px ved 100/150 % tekst). Ni
  mutasjoner kjørt.
- **`UDOKUMENTERTE_RUTER` er tom**, og som `EXEMPT_ADDRESS_KEYS` (#46) er hver
  framtidig oppføring en påstand — ikke et gjemmested. Det ene endepunktet uten
  eksempel er `/api/mappings/kvn/all`, som er ~73 MB (#104); grunnen står i
  `ikkeProvd`.

## Utgavevalget (#182)

`bible.edition` i `fv-prefs` leses ETT sted (`src/lib/edition-choice.ts`) av
`defaultBibleForLanguage()`; språket avgjør bare når ingenting er valgt, og
`?bible=` slår begge. Sider varierer på cookien: mikrocachen nøkler på valget,
og svaret sier `Vary: Cookie`. Klienten skriver valget med `setPref`
(`public/js/edition-pref.js`).

- **Innlogget er KONTOEN sannheten, med eller uten plus.** konto lagrer
  `bible.edition` (`PRODUCT_PREF_REGISTRY` i `konto/src/lib/prefs.ts`,
  portal/PREFS.md), sesjonssvaret bærer `prefs`, og `withSession` skriver
  kontoens valg inn i cookien.
- **PUT-en til konto krever CSRF-tokenet**, som står på konto-chipen
  (`data-csrf`). `window.__fvCsrf` settes av ingen; uten tokenet svarte konto 403,
  og valget nådde aldri kontoen.

## Importløypa for oversettelser (#200, #170)

Én vei fra free-bible til siden og MCP-en: `IMPORTED_BIBLES` i
`src/lib/editions.ts` er lista, `scripts/import-bible.ts` importerer.

- **Porten** (`editionGate`/`checkEdition` i `src/lib/edition-import.ts`):
  lisensen må være BEKREFTET mot kilden (`license.json` → `verification.status:
  confirmed`, skrevet i free-bible), og for alt utenom `OSNB_NUMBERED` må
  KVN-mappinga være verifisert mot teksten (`textVerification.status:
  verified` i `kvn/mappings/<id>.ukvn.json`). En listet utgave som avvises
  importeres ikke, blir liggende som den var i basen, og importen ender med 1
  — deployen stopper. `test/edition-import.test.ts` kjører porten mot free-bible
  som den er, så en liste som lover noe free-bible ikke har klarert er rød FØR
  deploy.
- **Basen holder alle utgaver i osnb-numre.** En høstet oversettelse (KJV har
  Malaki 4) flyttes ved import: eget nummer → osmain (dens mapping) → osnb.
  Vers som lander på samme osnb-vers slås sammen i egen rekkefølge; et vers
  osnb deler, deles med `sliceVersePart`. Ingen tekst går tapt (målt over hele
  KJV). Derfor MÅ KVN være verifisert: en mapping som er riktig i aritmetikk og
  feil i tekst flytter hvert vers til feil nummer.
- **Våre egne først i språket** (`OWN_EDITIONS`): ellers ville ASV blitt
  standard for /en/, første engelske i alfabetet. Sortert i koden, ikke i SQL —
  basens kollasjon holdt ikke `ORDER BY id` (målt).
- **Kreditten** (`src/views/edition-credit.tsx`) står under teksten på
  kapittelsida og /tekst når lisensen krever navngivelse: ÉN kort linje på
  sidens språk, bygget av `credits` i license.json (kildene med lenke, lisensen
  lenket, «oversatt fra» der utgaven er en oversettelse) og en lenke til
  utgavesida. MCP-ens `attribution()` gir det samme kort på engelsk.
- **`statement` vises ALDRI under teksten (#206).** Den første utgaven viste hele
  lisensnotatet rått og på engelsk på hver kapittelside — et notat til oss, ikke
  en kreditt for leseren. Det står på utgavesida (`/oversettelser/<id>`), som
  linja lenker til; CC BY 4.0 godtar kreditt «in any reasonable manner»,
  også en lenke dit den fulle informasjonen står.
