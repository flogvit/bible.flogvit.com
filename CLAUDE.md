# Bibel — Bun + Hono (main)

Full omskriving av bibel-appen: Bun + Hono + hono/jsx SSR + vanilla JS-øyer, Bun.sql
(mysql-adapter) mot MySQL. FLOGVITs egen instans kjører på **bible.flogvit.com**.

> Dette repoet inneholder APPEN, ikke hvordan FLOGVIT deployer den. Miljøspesifikke
> skript (VM, registry, env-filer) bor i driftsrepoet vårt og er bevisst holdt utenfor.

## Hvor reglene står

Denne fila bærer REGLENE. Hele saken bak hver regel — tallene, vaktenes
halvdeler, mutasjonene, hva som ble vraket — står ordrett i en prosjektskill
(`.claude/skills/<navn>/SKILL.md`), nevnt i overskriften over reglene den
gjelder. **Les skillen før du endrer noe på det området.** Testreglene står i
`test/CLAUDE.md`, layout- og CSS-reglene i `public/CLAUDE.md`; begge lastes når
du jobber i katalogen. Fila holdes under 32 000 tegn av
`test/claude-md-storrelse.test.ts`: ny historie hører i en skill, ikke her (#164).

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

### kvn-package/ er en VENDRET kopi (#62, #112) — skill `kvn-staging`
- `@free-bible/kvn` er en gitignort `file:`-avhengighet som stages fra
  `../free-bible/kvn`. `bun install` klarer ikke å bootstrappe den og avslutter
  likevel med 0; derfor kjører `test`, `typecheck` og `dev` `ensure-kvn.ts` først.
- **`scripts/kvn-staging.ts` eier HVITLISTA** (`src`, `mappings`, `package.json`,
  `tsconfig.json`) og river alt annet — en full kopi dro free-bibles 17 testfiler
  inn i `bun test` og gjorde merge-porten rød (#62). Ikke legg stagingen i
  `preinstall`; deployen kaller samme skript.
- **`STRIPPED_FIELDS` stripper pakkas devDependencies**, aldri `dependencies`: en
  devDependency får man av rotprosjektet. Uten det var 108 av 115 pakker i
  `bun.lock` free-bibles testverktøy (#112). Vakter: `test/kvn-staging.test.ts`,
  `test/laaste-avhengigheter.test.ts`.

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

### Importert innhold — skill `importert-innhold`

Felles for alle: en rydding kjøres fra `ensureSchema()` (altså **hver deploy**,
som rydder prod) OG fra slutten av importen, teller som en endring (løfter
sync-versjonen, ellers serverer mikrocachen det døde i en time), og importen
RAPPORTERER alltid det den kaster. **Kast aldri innhold vi HAR for å bli kvitt en
adresse vi ikke har.**

- **#46 Ingen rad peker på et vers som ikke finnes.** `src/lib/verse-refs.ts` eier
  tabellene; sannheten er `verses` med `bible = 'osnb'`; dødt startvers slettes,
  sluttvers forbi kapittelslutten klippes (`pruneDanglingRefs()`). Også adresser
  inne i JSON-blobber (`persons`, `stories` …), med `JSON_ADDRESS_KEYS`. Vakt:
  `test/verse-integrity.test.ts`. Rotårsaken er free-bible#26.
- **#73 En blokk lover ikke et skriftsted den ikke leverer.** En hendelse uten
  vers får `.event-no-verses` (ingen skillelinje), skjules IKKE, og seksjonen
  rendres bare når den har hendelser. Vakt: `test/key-event-promise.test.ts`.
- **#58 En innholdstabell hvis KILDEKATALOG er borte rapporteres, ryddes ikke
  automatisk** (en feilsatt `FREE_BIBLE_DIR` ville tømt basen). Mangler hele
  kildetreet, avslutter importen med 1. **Sett `FREE_BIBLE_DIR` eksplisitt når du
  importerer fra et arbeidstre.** En fjernet side svarer 410 (`REMOVED_PAGES`,
  `GonePage`), og tabellen droppes av `dropRemovedTables()`.
- **Kapittelantall har ÉN sannhet: `books-data.ts`** (#46, bifunn). Hebraisk
  versifisering (Joel 4, Malaki 3); `syncBookChapters()` holder `books.chapters` i
  takt ved hver deploy.
- **#92 En lesning som krysser et kapittelskille** oversettes ved endene og fylles
  mot `verse-counts.ts` (`src/lib/reading-ref.ts`); etiketten bygges av VERSENE
  (`formatVerseRefLabel()`), aldri av markupen med `@mapping`.
- **#100 En nummerering vi ikke har gir null, ikke et ENOENT-kast** — kastet felte
  `init-db` og dermed hele deployen. Reparasjonen rapporterer det den lot stå.
- **#111 En fiks som bare finnes på ÉN disk er ikke levert.**
  `test/upushet-arbeid.test.ts` krever at hver lokal gren (unntatt `smie/*`,
  `testsmie/*`) og hver commit-SHA dokumentasjonen peker på finnes på en remote.
- **#40 En offentlig URL bærer ALDRI en auto_increment-id** — importen
  renummererer. Lesedager adresseres av datoen; gamle id-er 301-er så lenge raden
  finnes. Ny detaljside: adresser den med noe kilden eier (dato, slug).

### Personer, rad-id-er og historie-slugs — skill `personadresser`
- **#61 Ingen rad peker på en person som ikke finnes.** `src/lib/person-refs.ts`
  (`PERSON_REF_KEYS`) og sannheten `persons.name` gjennom `contentLanguageChain`.
  Kan adressen RETTES (`PERSON_ID_ALIASES`, `normalizePersonId()` ø→o, æ→ae, å→a,
  alltid med EKSAKT treff), rettes den; ellers faller lenka og navnet blir stående.
  **Den gjetter aldri** (`josef` er ingen av de elleve `josef-*`).
- **Begge personflatene** (`/personer/:personId` og `/api/persons/:id`) honorerer
  aliasene og ø/æ/å-formen med 301 og bærer queryen over. Samme adresse, samme svar.
- **API-et deler ut ADRESSEN som `id`, aldri rad-id-en** (`src/lib/api-ids.ts`,
  `withApiId()` kaster når adressen mangler). Vakt: `test/api-id-graph.test.ts`.
- **#153 En historie med ny slug fra korrekturen 301-er fra den gamle**
  (`src/lib/story-slug-aliases.ts`, begge flatene, oppslag ETTER basen).
- **`bibel.flogvit.no` er frosset på branch `bibel-no` og får IKKE fikser fra
  `main`.** Lukk aldri en sak meldt på .no fra en commit på `main`; hva flata
  skal bli er avgjørelsen i #98 (søskensaker #48, #49).

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

### Språkaksen på flata — skill `sprakakse`
- **#45 En side som ikke finnes på et språk annonseres ikke der.** `Layout` tar
  `locales`, utledet av `localesWithContent()`; `x-default` ligger innenfor
  settet. Hreflang-klyngen er NØYAKTIG de locale-ene adressen svarer 200 på
  (invariant 9 i `page-contract.test.ts`, detaljsidene i
  `test/hreflang-detail-pages.test.ts`).
- **#76 Norsk-spesifikt innhold er ingen blindvei:** dagsiden 302-er (ikke 301) til
  språket dagen finnes på, og en tom liste peker videre når SPRÅKET mangler
  innholdet. Menypunktet skjules ikke.
- **#77 Sitemapen har en språkakse:** `LANGUAGE_SCOPED_PATHS` i
  `sitemap-paths.ts`, slått opp per forespørsel; klyngen bygges av samme liste
  som `<loc>`.

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

## Sanger fra FLOGVIT.music (#188)

`src/lib/songs.ts` leser `media.flogvit.com/music/index.json` server-side
(10 min cache, `MUSIC_INDEX_TTL_MS`; `MUSIC_INDEX_URL=` slår av). Feil = ingen
sanger, aldri en feilside. Testene kjører uten nett (`test/preload.ts`).
**Sjekk etter en ny sangrunde:** `bun scripts/check-song-tags.ts` — exit 1
navngir hver sang hvis tema/person/historie eller vers bibel ikke har.

## Manuskripter: deling og åpen katalog (#15) — skill `manuskripter`

Runbooken for review er `REVIEW.md`.
- **`/delt/<token>` er en capability-URL:** tokenet lages på serveren, ett levende
  per manuskript (ny lenke trekker tilbake den gamle), nøkkelen er sync-item-id-en.
  Ukjent, tilbaketrukket og slettet gir samme 404; siden er `NEVER_CACHED`,
  `private, no-store` og `noindex`. Å DELE er plus, å LESE er gratis.
- **Katalogen er manuelt reviewet**, og teksten FRYSES ved innsending; sletting
  virker likevel (alle spørringer JOIN-er levende `sync_items`). Adressen er
  tittel-slug + seks tilfeldige tegn. Rapporter skjuler ingenting av seg selv.
  Hele katalogen er `NEVER_CACHED`. `catalog.tsx` monteres FØR `user.tsx`.
- **Et tak på en liste er en oppføring ingen finner (#75, #81):** katalogen
  pagineres på STI (`/side/N`, total sortering med `slug ASC`, 404 forbi siste
  side), review-køen på ARGUMENT (`kø 2`), og CLI-en skriver `total`. CLI-en er
  en egen søm og testes som underprosess; et feilkonfigurert token stopper høylytt.

## Publiserte adresser — skill `publiserte-adresser`
- **#80 `absoluteUrl()` (`src/lib/site-url.ts`) er eneste vei til en absolutt
  adresse** og prosentkoder den; `SITE` eksporteres ikke. Ikke kod i
  `toUrlSlug()` (dobbelkoding, #42).
- **#84 Kortstien er ASCII-ren** (`cardBookSlug()` translittererer), ruta tar
  imot begge formene, og under `/og/` svares det aldri som en side (`avkortet()`,
  catch-all SIST).
- **#118, #152 En adresse klienten har SKADET (mojibake latin-1/windows-1252, `?`)
  301-er til den publiserte** (`src/lib/skadet-adresse.ts`), bare ved EKSAKT treff;
  den gjetter aldri. Verifiseringen i prod er tidsavgrenset til utrullingen og
  krever at aktøren er sett etterpå — «umålt er ikke grønt».

## Delekortet — skill `delekort`
- **#65 Kortet står i SIDEMALEN** (`layout.tsx`, `src/lib/share-card.ts`):
  absolutt `og:image` med mål 1200x630, alt-tekst gjennom ordboka,
  `twitter:card` = `summary_large_image`. Kilden er `assets/og/card.html`
  (runbook `assets/og/README.md`).
- **#66, #87 Bildet til objektlagring** med `bun scripts/upload-og-card.ts`
  (`sjekk` måler den publiserte adressen; skriptet oppretter ALDRI bøtta).
  `DELEKORT` er én sannhet med prosjekt, bøtte, region og nøkkel; filnavnet
  byttes når MOTIVET endres. `OG_IMAGE_URL` er midlertidig.
- **#68 Kapittelkortet settes sammen per forespørsel** (`src/lib/og-card.ts`,
  ~10 ms, ingen Chrome i prod); renderen nekter framfor å tegne et halvt kort.
  `COPY assets/og/generated` i Dockerfilen er en del av det. `/og/` er ikke
  forbudt i robots.txt.

## Database: budsjett og avbrudd — skill `db-avbrudd`
- **#107 Retry-budsjettet er FORESPØRSELENS** (`withRetryBudget`, montert ytterst
  i `app.ts`); skript utenfor et scope får sitt eget per kall, og
  versjonssjekken i mikrocachen har budsjett null. `DB_RETRY_BUDGET_MS` leses per
  kall. `DB_CONNECT_TIMEOUT` er urørt til noen har målt i prod.
- **#108 Et DB-avbrudd er 503 + `Retry-After`, en defekt er 500**
  (`app.onError`, klassifisert med `isConnectionError()`); svaret er ren tekst
  (JSON under `/api/`). `/robots.txt` skal fortsatt svare 200.
- **#109, #123 Ruter som fanger sitt eget kast logger med `loggFeil()` og svarer
  med `internFeil()`** (`routes/api/util.ts`); `ensureBooks()` laster bok-cachen
  på nytt framfor å stå tom ut containerens levetid.

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

### Køen, avsenderen og crawlerne — skill `lastvern`
- **#19 Køen er like lang som taket**, og plassen går til den FERSKESTE (LIFO);
  er køen full, svarer forespørselen straks. TTL-en er en time med invalidering
  på `db_meta.sync_version`.
- **#126 Én avsender får høyst `RENDER_MAX_PER_SENDER`** (halve taket) plasser,
  render og kø til sammen; avsenderen er HØYRE ledd i X-Forwarded-For.
- **#64, #95, #96 Taket verner RENDEREN:** en sti med punktum (`NOT_A_PAGE`) går
  utenom; katalogmonteringene (`STATIC_MOUNTS`, med og uten skråstrek) svarer 404
  uten HTML og uten omvei. Ingen siderute får punktum i stien.
- **#60 En URL med query er en handling:** `relFor(path)` gir `nofollow`,
  robots.txt forbyr QUERYEN (`Disallow: /*?vers=`, aldri stien), `?q=` er
  bevisst utelatt, `noindex` på `/bidra?…`. robots.txt kommer fra `seoRoutes`.
- **#86, #150 `Crawl-delay` per navngitt aktør** (`CRAWL_DELAYS`: PerplexityBot,
  ClaudeBot) — en navngitt gruppe ERSTATTER `*`, så `group()` gjentar hvert
  forbud. Ingen blokkering; det neste håndtaket (Caddy) er Vegards valg.

### Minne og kapasitet — skill `minne`
- **#105 Mikrocachen lagrer kroppen som byte** (`Uint8Array`), så budsjettet er
  et minnebudsjett; `PAGE_CACHE_MAX_BYTES`/`…_ENTRY_BYTES` er env-styrte.
- **#106 Mappinglista bygges av KATALOGEN** uten å åpne filene (54 MB RSS spart).
- **#110 Live-settet står stille; det som vokser er allokator-høyvann.**
  `heapGulv` i `/api/minne` er tallet å følge. Gettere som leste hele tabeller
  sjekker råraden med `bookMentionTest()` før de parser, og `persons.ref_books` holder blobben
  tilbake (`IF(...)`, ikke `WHERE`, så språkvalget står).
- **#19 Profilér før du skrur på tak.** Mappingfiler går gjennom `mappingFile()`
  — **kall aldri `loadUkvnMapping` direkte**; per-vers-data hentes PER KAPITTEL.
- **#104 Et svar større enn heapen strømmes**, én fil om gangen, utenom fil-cachen.
- **Minnesonder kjøres i et EGET PROGRAM** (`bun test` deler prosess), med
  `await Bun.sleep(25)` mellom samlingene.

## MCP-serveren — `mcp/` (#127)

`mcp.bible.flogvit.com/mcp` gir KI-assistenter (Claude, ChatGPT, Cursor …)
bibelteksten og studiestoffet som MCP-verktøy. Runbook og verktøyliste:
`mcp/README.md`.

- **Egen pakke, egne avhengigheter, eget image** — men den leser basen gjennom
  getterne i `src/lib/`. **Endrer du en getter, kjør `cd mcp && bun run test`
  også**: rotens `bun test` hopper over `mcp/` (`bunfig.toml`), fordi pakka har
  sin egen `node_modules`.
- **Én commit, to containere.** FLOGVIT ruller ut `bibel-mcp` fra samme commit
  som `bibel-hono`, og bare bibel setter deploy-taggen.
- **CLI-en `flogvit-bible` (`cli/`, #129) er en tynn klient av MCP-serveren**:
  kommandoene er verktøyene, lest fra `tools/list`. Et nytt verktøy er en ny
  kommando uten kodeendring i `cli/`; testene ligger i `mcp/test/cli.test.ts`.
  Repoet er også en Claude Code-markedsplass (`.claude-plugin/marketplace.json`
  → `cli/`), så skillen publiseres ved push — ingen deploy. How-to:
  `cli/README.md`.
- **Egen db-bruker med SELECT på `CONTENT_TABLES` og ingenting annet**
  (`mcp/src/grants.ts`). Får importen en ny innholdstabell, må grantene kjøres
  på nytt i prod; til da svarer `/healthz` 503 og navngir tabellen.
- **Sida om den er `/<lang>/mcp`** (#157), og landingssida på
  `mcp.bible.flogvit.com/` rendres fra de SAMME kildene: `src/lib/mcp-info.ts`
  (adresse, verktøy, kodesnutter) og `mcp.*` i `src/lib/dictionaries-mcp.ts`.
  **Nytt verktøy ⇒ ny rad i `TOOL_ROWS`**, ellers er `mcp/test/landing.test.ts`
  rød. Registeroppføringen er `mcp/server.json`; hvor serveren er oppført og
  hvordan den tas ned står i `mcp/README.md`.

## Funksjoner — skill `funksjoner`
- **Utgavevalget (#182): leserens valg slår språket.** `bible.edition` leses
  ETT sted (`src/lib/edition-choice.ts`); `?bible=` slår det, språket avgjør
  bare uten valg. Innlogget er KONTOEN sannheten, også uten plus. Vakter:
  `test/edition-choice.test.ts`, `test/edition-pref.test.ts`.
- **Importløypa (#200, #170):** en utgave i `IMPORTED_BIBLES` må ha lisensen
  bekreftet (`license.json` → `verification`) og, utenom `OSNB_NUMBERED`,
  KVN verifisert mot teksten (`textVerification`); ellers ender importen med 1.
  Teksten flyttes til osnb-numre ved import (`src/lib/edition-import.ts`). CC
  BY-kreditten står under teksten og i MCP-svaret. Vakt:
  `test/edition-import.test.ts`.
- **Lesesporing (#16):** lesing er en HENDELSE (`{ firstAt, lastAt, count, opens,
  verses? }`). Kjernen er `public/js/reading-progress.js`, importert av både klient
  og server. `MERGERS` i `sync.ts` fletter kommutativt; klienten bruker samme
  funksjon. `readTracking: manual` måler INGENTING. Alt er pull; gamification er
  et non-goal. En leseplan er et spørsmål mot kartet (`planCoverage()`).
- **Singletons i sync (#132): fravær er aldri en sletting.** Klienten pusher bare
  det den HAR; serveren avviser `null` over ekte data uten `baseUpdatedAt`.
- **Offline (#14, #136):** skallet caches PER SPRÅK (`cacheOfflineShell()`),
  nedlastingen går forbi SW-cachen (`x-bibel-offline`).
- **«Ny versjon er lagt ut» (#161):** `public/js/ny-versjon.js` er en byte-kopi av
  portalens — endres i portalen. `sw.js` kaller ikke `skipWaiting()` ved install.
- **Verslister (#133):** `public/js/verse-list.js` eier adresseformen
  (`joh-3-16-18`), som ikke kan byttes.
- **API-dokumentasjonen (#114):** `src/lib/openapi.ts` eier operasjonene (OpenAPI
  3.1, `/api/docs`, vakta); hvert `prove.url` hentes av `test/api-docs.test.ts`.
  Ny rute ⇒ dokumentert eller rød. Ingen `swagger-ui-dist`, ingen CDN.

## Tilgjengelighet (#163) — runbook i `test/CLAUDE.md`

`/<lang>/tilgjengelighet` er FLOGVITs felles erklæring (`portal/TILGJENGELIGHET.md`).
`src/lib/tilgjengelighet.ts` og `test/tilgjengelighet-sjekk.ts` er KOPIER av
portalen — rediger dem aldri her. Bibels data: `src/lib/tilgjengelighet-erklaering.ts`.
Porten er `test/tilgjengelighet.test.ts`; hva rødt betyr og hva du gjør med det
står i `test/CLAUDE.md` → «Tilgjengelighet».

## Testene

Kjør `bun test` og `bun run typecheck` før du ruller ut. FLOGVITs eget
deploy-skript gjør dette automatisk og avbryter ved rødt. Fire nivåer: ren
logikk, sidekontrakten (`page-contract.test.ts`, en sveip over `PAGES` i
`test/pages.ts` — **ny side ⇒ legg den i `PAGES`**), klient-øyene i happy-dom, og
layout i ekte Chrome. **Verifiser nye vakter ved å gjeninnføre feilen de skal
fange.** Resten — DB-tester, tidsavbrudd, lastvern i tester, Chrome-sandkassen
(#85, #74, #72) — står i `test/CLAUDE.md`.

## Layout — `public/CLAUDE.md`

Leseren bruker 133–150 % tekst fra telefonens tilgjengelighetsinnstillinger;
sidezoom er ikke det samme. Reglene står ordrett i `public/CLAUDE.md`:
**#50** ingen side bredere enn skjermen (`min-width: 0`, gulv i `rem`, `nowrap`
bare på atomære verdier); **#70** mål på det språket som er mest utsatt;
**#55** toppen av skjermen har ÉN eier på mobil; **#78** en layout får headerens
bredde (`wide`); **#90** dekor ligger bak innholdet (eksplisitt `z-index`);
**#91** adressen bærer versrekka (`public/js/verse-hash.js`); **#93** en brekket
linje eier ikke høyrekanten; **#94** studiepanelet er en kolonne eller ▥, ved
samme brekkpunkt.

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

### Språkvaktene — skill `i18n-vakter`
- **Fire uavhengige vakter** (#43): ordlista `NORWEGIAN_ONLY`, æ/ø/å i synlig
  tekst (`NORDIC_PROPER` skal være nesten tom), den norske ordboksverdien selv,
  og tekstbærende attributter og metadata.
- **Boknavn er NØKLER** (`name_no`/`short_name`) og røres ikke; vis med
  `bookName()`/`bookAbbr()`/`bookNameById()`. `…ByShort()` går gjennom
  ALIAS-tabellen.
- **#69 Boknavnene for de sju andre locale-ene bor i `src/lib/book-names.ts`**
  (`BOOK_NAMES`, `BOOK_ABBRS`), ikke i ordboka; de, fr, sv og fi bør leses over av
  en som har språket. Vakt: `test/book-names.test.ts`.
- **#71 Feilgrenen er brukervendt tekst:** `parseReference()` returnerer en
  NØKKEL (`ReferenceError`), oversatt av `referenceErrorText()`.
- **#63 En brødsmule som rendres ordrett likt under `/en/` og `/nb/` gikk aldri
  gjennom `t()`.** Unntak bare når ordboka er enig på BEGGE språk, eller i
  `PROPER_CRUMBS` (tom i dag). En side som ikke står i `PAGES`, står utenfor
  alle invariantene.

## Regler
- Minimal deps: innebygd/web-standard fremfor npm-pakker. Aldri React/Express/ORM-er.
- Bibeldata er derivert og regenererbar — aldri inn i Docker-imaget; import kjøres separat mot DB-en.
- **Issues spores KUN på GitHub** (`flogvit/bible.flogvit.com`; main er .com-appen). Som i resten av flogvit.com-produktene. Omskrivingens
  historikk (#1–#18) lå i ISSUES.md — slettet 2026-07-22, se git-historikken ved behov.
