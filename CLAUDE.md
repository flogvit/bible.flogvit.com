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
- `bun install` — eneste runtime-dependency er `hono` + lokal `@free-bible/kvn`.
- `kvn-package/` er gitignort og stages fra `../free-bible/kvn/` før bygg.
- `.env` (gitignort): `DB_PORT=3312` for lokal DBngin-MySQL (root, tomt passord, db `flogvit_bibel`).
- Prod-DB: managed MySQL (db-flogvit) via `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.

## Kommandoer
```bash
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
  ingen kodeendring** — bare en ny katalog. free-bibles `translate.mjs` skriver
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

Del 2 i issuen (åpen katalog med review) er IKKE bygget — review-formen er ikke
avgjort, og del 1 er bevisst uavhengig av den.

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
- Per-vers-løkka i `loadChapterData` gjør fire spørringer per vers. Målt til
  8–33 ms lokalt, altså IKKE flaskehalsen — men den er 500+ rundturer på Sal 119,
  og mot en managed database over nett er latensen en annen. Se dit hvis prod
  fortsatt er treg etter dette.

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

## Testene — tre nivåer og hva hvert av dem faktisk fanger

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

**Velg sider etter KOMPONENT, ikke etter URL.** 1 Mos 1 har ingen personer, så
studieblokka for personer rendres ikke der — en uprefikset lenke i den blokka slapp
gjennom kontrakten helt til mutasjonstesting avslørte det. Derfor ligger `/1mos/12`
(personer + profetier) og `/matt/1` (evangelieparalleller) også i matrisen.

**Verifiser nye vakter ved å gjeninnføre feilen de skal fange.** En test som ikke blir
rød av mutasjonen er verdiløs. Alle fire vaktene her er sjekket slik.

**Grense:** happy-dom lar seg ikke patche der `plus.js` overstyrer
`localStorage.setItem`, så den stille skrivesperren for gratisbrukere må verifiseres i
en ekte nettleser. Den brukersynlige porten (klikk registrerer ingenting) er dekket.

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

## Regler
- Minimal deps: innebygd/web-standard fremfor npm-pakker. Aldri React/Express/ORM-er.
- Bibeldata er derivert og regenererbar — aldri inn i Docker-imaget; import kjøres separat mot DB-en.
- **Issues spores KUN på GitHub** (`flogvit/bible.flogvit.com`; main er .com-appen). Som i resten av flogvit.com-produktene. Omskrivingens
  historikk (#1–#18) lå i ISSUES.md — slettet 2026-07-22, se git-historikken ved behov.
