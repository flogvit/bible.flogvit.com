# Issues — bibel-omskriving til Bun + Hono + Bun.sql/MySQL

Mål: full paritet med dagens `bibel/` (Vite + React SPA + Express + better-sqlite3), med minimalt
dependency-tre (npm-injection-vern). Måldeps: `hono` (+ evt. `zod`, `marked`) + vendored `kvn-package`.
Alt annet via Bun (runtime, bundler, test, Bun.sql, WebCrypto) og web-standard-API-er (IndexedDB, SW, fetch).

Besluttet: **bibel.flogvit.com er nytt kanonisk domene** (2026-07-19; .no 301-er dit ved cutover —
konto-cookien krysser ikke domenegrensen, OAuth-handoff valgt bort). Appen er norsk; UI-strenger
via tr()-dictionaries fra start så ev. flerspråklig senere ikke krever ombygging.
Full omskriving inkl. frontend i hono/jsx + vanilla-øyer; sentral auth via konto;
alt innhold (~30 SQLite-tabeller) + brukerdata til managed MySQL (db-flogvit, ALDRI DB i Docker);
bygges isolert her i `bibel-hono/` (photosuite-mønsteret) — `bibel/` forblir deploybar prod til cutover.
Redesignet (merget 2026-07-19) er visuell fasit: HTML/CSS og oppførsel porteres, SCSS-modulene
gjenbrukes som CSS.

Status: `ÅPEN` → `PÅGÅR` → `FERDIG`. Rekkefølgen er omtrentlig avhengighetsrekkefølge.

---

## #1 Prosjektskjelett — FERDIG

**Ferdig 2026-07-19:** Bun + Hono-app booter uten DB. `src/` (app.ts, index.ts, routes/pages.tsx,
views/layout.tsx), `public/styles.css` (familietokens + lær, lys-først, data-fv-theme-overstyring),
prefs-lese-snippet per portal/PREFS.md, plassholder-forside, `bun test` (3 grønne), typecheck rent,
health/side/statisk verifisert med curl. Kun dependency: hono.

Bun + Hono-app i `bibel-hono/`: `src/` (routes, views, lib, islands), `public/`, `bun test`-oppsett,
typecheck, dev-script. tsconfig med `jsxImportSource: hono/jsx` (photosuite-gotcha: Dockerfile MÅ
COPY tsconfig.json, ellers faller Bun til react/jsx-runtime og krasjer). Familietokens + lær-aksent
(#7a4a21/#d9a06b) fra bibel/STYLE.md som CSS-fundament. Appen skal boote og svare uten DB.

## #2 MySQL-skjema for bibelinnholdet — FERDIG

**2026-07-19:** Skjemaet er skrevet: `src/lib/schema.ts` (alle 34 innholdstabeller fra bible.db +
sync_items/sync_cursors/user_bibles/user_bible_chapters keyed på konto-id; users/refresh_tokens
utgår — konto-auth), `src/lib/db.ts` (Bun.sql-pool, konto-env-konvensjonen, DB_NAME
`flogvit_bibel`), `scripts/init-db.ts` (idempotent). Collation utf8mb4_danish_ci (æøå som egne
bokstaver — 0900_ai_ci ville latt ø matche o). Ingen FK-er på innhold (SQLite kjørte
foreign_keys=OFF). `data/users.db` i gamle appen er TOM (0 bytes) — bookmarks/reading_history/
live_sessions var ubrukt skaffold, ingen migrering. Typecheck rent.
**Verifisert 2026-07-19:** `bun scripts/init-db.ts` mot lokal bibel-MySQL (DBngin, port 3312,
root/tomt passord — samme instans som gamle init-mysql.ts siktet på) → 39/39 tabeller. `.env` i
bibel-hono/ setter DB_PORT=3312 for lokal utvikling.

Utvid `scripts/init-mysql.ts`-tilnærmingen til fullt skjema: de ~30 innholdstabellene fra SQLite
(books, verses, word4word/original, persons, timeline_*, prophecy_*, themes, stories,
gospel_parallels, number_symbolism, days, reading_plans, reading_text_refs, important_words,
important_verses, daily_verses, verse_mappings, chapter/book_context+summaries+insights,
verse_prayers, verse_sermons, content_hashes, db_meta) + brukertabellene (sync_items, sync_cursors,
user_bibles — keyed på konto-bruker-id, se #6). Kolonnetyper/indekser tilpasses MySQL (utf8mb4,
LIKE-søk trenger fornuftige indekser). Lokal utvikling mot lokal MySQL (DBngin — spør Vegard om å
starte den, aldri Docker).

## #3 Import-pipeline til MySQL — FERDIG 2026-07-22

**Resten portert 2026-07-22 (3b76171):** `generate-verse-counts.ts` + `enrich-story-references.ts`
på Bun.sql; `split-stories` var et engangsscript som alt er kjørt (292 enkeltfiler i free-bible).
Kjørt: verse-counts.ts regenerert (fanger Joel 4 etter books.chapters-fiksen), 16 historier
beriket med 57 parallellreferanser (committet i free-bible), inkrementell import lastet til
lokal + prod-DB (syncVersion 11; prod-lasting: mysqldump → engangs mysql:8-klientcontainer på
server_default — se CLAUDE.md «Innholdsoppdatering til prod»).

**Bootstrap ferdig 2026-07-19:** `scripts/copy-sqlite.ts` (bun:sqlite → Bun.sql, null nye pakker)
kopierte alle 35 innholdstabeller fra `bibel/data/bible.db` med identiske radantall (93 480 vers,
402 731 word4word, 64 317 references). Collation verifisert mot kolonnene: æøå egne bokstaver,
Å=å, aa=å (danish_ci) — bedre enn SQLite (ren ASCII-ufølsomhet). NB: literal-mot-literal-tester
bruker connection-collation — test alltid mot kolonnen. Scriptet slettes etter cutover.
**Gjenstår:** portere selve pipelinen (import-bible.ts 2224 linjer + import-utils m.fl.) til
Bun.sql for fremtidige innholdsoppdateringer fra free-bible/kvn.
**Pipeline portert 2026-07-19:** `scripts/import-bible.ts` + `scripts/import-utils.ts` på Bun.sql
(ensureSchema i stedet for CREATE TABLE, transaksjon per seksjon via sql.begin, `--full` = TRUNCATE
av innholdstabellene i stedet for filsletting, INSERT OR REPLACE→REPLACE INTO, backticks på
db_meta.`key`, LAST_INSERT_ID() for reading_texts, hash-cache i minne + multi-rad-inserts for
vers/word4word — ellers 1:1 med originalen). Verifisert mot flogvit_bibel: alle 35 tabeller likt
radantall OG likt innholds-checksum (eneste avvik: db_meta-historikk og reading_texts
AUTO_INCREMENT-offset — begge forventet). Inkrementell kjøring: 0 oppdatert, sync-versjon urørt.
Gjenstår i #3: enrich-story-references, split-stories, generate-verse-counts (om de trengs her).

Portér `scripts/import-bible.ts` (+ import-utils, enrich-story-references, split-stories,
generate-verse-counts) fra better-sqlite3 til Bun.sql mot MySQL. Leser fortsatt fra
`flogvit.com/free-bible/` via vendored kvn-package («Vers-mappinger: 0» er normalt). Verifiser
radantall mot dagens `data/bible.db` tabell for tabell. Importen kjøres lokalt/fra dev mot
db-flogvit — bible-data er derivert og regenererbar, aldri en del av containeren igjen (~170MB
mindre image).

## #4 Datalag på Bun.sql — FERDIG

**Ferdig 2026-07-19:** `src/lib/bible.ts` (99 funksjoner, async) + `src/lib/verse-mapper.ts`
portert; rene parser-libs kopiert. Bok-metadata er SYNKRON mot minnecache (`initBooks()` ved boot)
så reference-parser m.fl. slapp async-kaskaden. Viktige detaljer:
- `seq`-kolonner (AUTO_INCREMENT) i timeline_events, timeline_book_sections, prophecy_categories,
  prophecies, reading_plans bevarer SQLite-rowid-rekkefølgen; brukes som (tie)break i ORDER BY og
  STRIPPES fra alle API-svar (dropSeq) — kontrakten er uendret.
- searchImportantWords: `ORDER BY CAST(word AS BINARY), id` for eksakt gammel LIMIT-oppførsel
  (danish_ci ville endret hvilke 10 som velges).
- `getBookByShortName('ap')`→undefined er PARITET (toUrlSlug ASCII-folder ikke å; kommentaren i
  gammel kode lovte mer enn implementasjonen holdt).
- kvn: listUkvnMappings sorteres nå (readdir var filsystemavhengig); to !-guards i
  ukvn-text-slicer for noUncheckedIndexedAccess — begge synket til free-bible/kvn (kilden).
**Verifisert:** smoke mot ekte data + API-diff (se #7).

## #5 Konto-auth — FERDIG

**Ferdig 2026-07-19:** `src/lib/session.ts` — `getCentralSession` (puzzles-mønsteret: videresendt
cookie mot `${ACCOUNT_API_URL}/api/auth/session`, 2.5s timeout, fail-open til anonym, hopper over
kallet uten fv-session-cookie), `withSession`-middleware på alle ruter, `requireUser` (401),
`/logg-inn` + `/konto` 302 → flogvit.com/konto/. 6 tester mot mock-konto (gyldig/anonym/ukjent/
konto-nede/401/redirects) — 9 grønne totalt, typecheck rent. SessionUser bærer `plus` for ev.
plus-gating av sync (#6). Sjekk av gamle prod-sync-brukere flyttes til cutover (#18) — gjøres mot
prod-MySQL når vi er der.

Sentral auth etter puzzles/lab/photosuite-mønsteret: session-middleware som kaller
`GET ${ACCOUNT_API_URL}/api/auth/session` (default `http://konto:3020` i prod-nettet) med
videresendt Cookie, fail-open til anonym. Login/konto-lenker → `flogvit.com/konto/`. Bibels egen
Google-login, refresh-tokens og users-tabell SLETTES (google-auth-library, jsonwebtoken ryker).
Sjekk først om det finnes reelle brukere/sync-data i prod-MySQL (trolig nei — da ingen migrering).
Prefs (lang/theme) følger familiekontrakten i `portal/PREFS.md` (.flogvit.com-cookie) — virker
direkte siden kanonisk domene nå er bibel.flogvit.com.

## #6 Sync-API — FERDIG (server-siden; klienten er #12)

**Ferdig 2026-07-19:** `src/routes/sync.ts` — alle fire endepunkter portert med eksakt
JSON-kontrakt (POST /api/sync m/planProgress-union-merge og cursor-oppdatering, POST
/user-bibles, POST+GET /user-bible-chapters/:id m/eierskapssjekk), keyed på konto-bruker-id via
requireUser. Bun.sql-transaksjoner (sql.begin) verifisert mot MySQL. Rate-limit (30/min per
bruker) portert. BIGINT-kolonner kastes til Number før JSON (ellers kaster serialisering).
6 integrasjonstester mot lokal MySQL + mock-konto: roundtrip to enheter, server-nyere-vinner,
planProgress-merge, bibelopplasting/-nedlasting, 401/400/404.

Portér `api/routes/sync.ts` (372 linjer: items, cursors, user_bibles) til Hono + Bun.sql, keyed på
konto-bruker-id i stedet for lokal users.id. Bibel er UTENFOR plus, så sync blir i bibels egen DB —
konto sitt generiske sync-API er plus-gated og brukes ikke her (256KB/200-nøkkel-grensene rommer
ikke brukeropplastede bibler). Klient-siden av sync-motoren (`src/lib/sync/`) porteres til vanilla
TS med fetch (se #12). ÅPEN BESLUTNING (Vegard usikker): skal skylagring/sync plus-gates? Teknisk
én entitlement-sjekk i middleware (samme regel som puzzles' pluss.ts); alt annet forblir gratis.

## #7 API-ruter Express → Hono — FERDIG

**Ferdig 2026-07-19:** Alle 26 innholdsruter portert til `src/routes/api/*` og montert på samme
stier i app.ts (gamle /api/auth finnes ikke — konto-auth). Samme statuskoder, Cache-Control og
JSON-form. **Verifisert med API-diff** (45 endepunkter, ny lokal vs gammel Express-app lokalt på
SAMME bible.db — prod var foreldet både i kode og data og er IKKE gyldig fasit): 41/45
byte-identiske; de 4 siste (persons, stories, stories/search, days) er verifiserte RENE
PERMUTASJONER fra norsk-korrekt ORDER BY name/title (danish_ci: ø før å; SQLite sorterte råbytes)
— dokumentert forbedring. Diff-scriptene ligger i scratchpad (api-diff.ts, perm-check.ts).

## #8 Frontend-fundament (hono/jsx) — PÅGÅR

**2026-07-19:** Chrome-fundamentet ferdig: Layout med familiemeny (produktvelger + tema-segment,
portal-mønsteret), redesignets headerstruktur (hurtigsøk-trigger m/`/sok`-fallback, Mitt/Studier/
Oversikt som `<details>`-nedtrekk — virker uten JS, tema- og innstillinger-knapp, mobilmeny),
footer med wordmark. **Identitetsbeslutning:** familie-identiteten (lær, Grotesk/Plex) vinner over
redesignets mai-identitet (gull/Inter Tight); Source Serif 4 beholdt som langlesningstypografi
(STYLE.md-unntaket). Token-bro i styles.css: redesignets variabelnavn (--gold, --paper-2, --muted,
--border, --shadow-*) er alias med familieverdier → side-CSS porteres tilnærmet ordrett.
`js/chrome.js`: temabryter per PREFS.md (cookie + konto-persist), detaljlukking, ⌘K-hint.
**Gjenstår:** portere resten av globals.scss (versnummer, kort, tabeller m.m.) etter hvert som
sidene porteres (#9).

Layout, Header/Footer med FLOGVIT.bibel-wordmark + familiemeny, breadcrumbs, skip-links.
SCSS-modulene fra redesignet konverteres til ren CSS (sass ryker; Bun bundler CSS). Mørk/lys tema
via familie-prefs. PrefsPopover som vanilla-øy. Grunnmønster for øyer etableres her (data-attributt
+ liten TS-modul, som photosuite).

## #9 Innholdssider SSR — PÅGÅR

**2026-07-20:** Struktur etablert: domenefiler i `src/routes/pages/` (persons, themes, overview,
home-search, user, misc, reading — montert i pages.tsx, reading SIST pga /:book/:chapter),
per-side CSS i public/css/, øyer i public/js/. Layout har styles[]/scripts[]-props;
Breadcrumbs-view finnes. FERDIG: /om, /tilgjengelighet, 404 (via app.notFound, JSON for /api/*).
FERDIG: delte komponenter (InlineRefs/Footnotes/verse-display/ItemTagging + ref-preview/tagging-øyer,
8 tester); lesesiden /:book/:chapter + /tekst (#10); **personer** (liste m/filter-øy + detalj,
familie/relaterte server-side — verifisert /personer, /personer/moses, 404); **temaer/historier/
tall/dager** (src/routes/pages/themes.tsx — JSON-parsing, VerseRefList for vers, card-filter-øy,
study.css — verifisert alle 8 ruter live: Debora-historien viser 55 versreferanser, tall/7 refs,
dager rendrer, 404 for ukjente).
FERDIG også (main-loop 2026-07-20): **kjente-vers** (62 kort), **lesetekster**-liste, **profetier**
(51 kort m/kategori-filter-øy, 395 vers via nested details+VerseRefList), **paralleller** (60 kort,
4-evangelie-kolonner m/referanselenker — inline side-ved-side-versinnlasting kan legges på som øy
senere), **tidslinje** (33 perioder / 447 hendelser som SSR-innhold gruppert per periode; grafisk
MultiTimelineView-viz kan legges på som øy senere). Alt i overview.tsx + overview.css, verifisert live.
FERDIG også: **lesetekster-DETALJ** (enrichWithVerseText → delt `src/lib/reading-text-enrich.ts`,
23 versnummer verifisert) og **statistikk** (oversiktskort + OT/NT + boktabell SSR + topord —
oversettelse SSR, hebraisk/gresk lazy via statistics.js-øy; 66 bøker, 100 ord verifisert).
**HELE OVERSIKTSGRUPPEN FERDIG.** FERDIG også: **forside** (home-search.tsx — hero m/dagens vers
+ dagens lesetekst + 66 bøker + 16 utforsk-kort SSR; «Fortsett å lese»/leseplan via home.js-øy fra
localStorage; midlertidig /-plassholder i pages.tsx fjernet) og **søk** (/sok + /sok/original —
SSR via ?q= GET-skjema, paginering via ?side=; 181 treff «kjærlighet», 54 «αγάπη» verifisert).
FERDIG også: **brukersidene** (user.tsx + user.js + user.css) — favoritter/emner/notater/lister/
manuskripter (liste+visning+textarea-editor m/CodeMirror-fri markdown-renderer)/innstillinger er
localStorage-drevne øyer med SAMME nøkler/JSON-former som gamle appen (bible-favorites, bible-notes,
bible-topics, bible-settings, bible-verse-lists, bible-devotionals, activeReadingPlan); leseplan-
LISTA (37 planer) SSR fra DB + aktiv-markering via øy; offline + oversettelser er funksjonelle skall
med TODO(#12 sync-klient)/TODO(#14 SW+nedlasting). Alle 12 ruter verifisert 200 live.
**HELE SIDE-SURFACEN (#9–#13) FERDIG.** GJENSTÅR: #12 sync-klient (koble user.js/reading til
/api/sync), #14 offline/SW + full oversettelser-opplasting, #16 a11y-sweep (browser), #18 db-flogvit
+ compose/Caddy-flip + cutover.

Server-rendrede sider med paritet mot dagens 36 React-pages: Hjem (ny forside fra redesignet),
kapittellesing (ChapterPage m/fotnoter, InlineRefs, versvisning), Text, bøker, personer (liste +
detalj), tidslinje (inkl. MultiTimelineView), profetier, temaer, historier (liste + detalj),
paralleller, tallsymbolikk (liste + detalj), dager (liste + detalj), lesetekster (slots-format),
kjente vers, oversettelser/mappings, statistikk, søk + grunntekstsøk, dagens vers, Om,
Tilgjengelighet, 404. SEO-meta + canonical på alle (SSR er en reell forbedring — i dag klientrendres
alt).

## #10 Studium-arbeidsflaten — FERDIG (øyene skrevet og deployet 2026-07-21)

**Øyene skrevet 2026-07-21 (2070fd0):** reading.js (versdetaljer m/faner, ord-for-ord,
favoritter, notater, lokale manuskripter, versversjoner, layout-modus, leseposisjon,
kopiering-med-referanse, innstillinger-som-standard for bible/secondary/mapping) og
studium.js (st-blokk-tilstand, panelfaner, sidebar-resize, oppslag, kapittelmanuskripter,
hele mobil-verktøylinja). Browser-verifisert lokalt og i prod (ingen konsollfeil).
Sammendrag SSR-rendres som markdown (views/markdown.tsx, 73729e1).

Historikk: **`public/js/reading.js` og `public/js/studium.js` BLE ALDRI SKREVET** — reading.tsx
refererer dem (404 i konsollen), så versdetaljer, layout-modus, panelfaner, mobil-verktøylinje,
leseposisjon og kopiering er døde. Tidligere «verifisert i browser»-påstand dekket åpenbart ikke
lesesiden. Blank side i prod skyldtes i tillegg at `.studium-overlay { display:flex }` slo
`[hidden]` — fikset med global `[hidden] { display:none !important }` i styles.css (570b956).
Selve lesingen (SSR-vers, TOC, sammendrag) fungerer nå; øyene må skrives som neste steg.
Sjekk også: sammendrag i sidepanelet viser rå markdown (`**…**`) — trolig samme manglende øy
eller manglende SSR-rendering.

**2026-07-20:** Lesesiden `src/routes/pages/reading.tsx` (1925 linjer) + `css/reading.css` +
`css/studium.css` portert av agent: /:book/:chapter (SSR av vers m/ankere id="v{n}", grunntekst,
sekundærbibel, KVN-mapping via mapChapter, word4word/referanser, kapittelsammendrag/kontekst/
innsikt, TOC, Studium-sidebar, forrige/neste) + /tekst. Verifisert live: /1mos/1 («I begynnelsen
skapte Gud»), /joh/3?bible=osnn1 (nynorsk), /sal/23?mapping=dnb2024 (mappet), /xyz/1→404.
data-attributt-kontrakten for shortcuts.js implementert. Detaljert komplett-vs-delvis må sjekkes
mot browser i #18.

Studium med slots-format og sidebar fra redesignet: vanilla-øy(er) som henter alt fra API-et
(chapter-context, verse-extras, word4word, references, paralleller, historier, tall, lesetekster).
Dette er den tyngste interaktive biten — porteres komponent for komponent med redesign-React-koden
som fasit.

## #11 CommandPalette + tastatursnarveier — FERDIG

**2026-07-20:** Begge portert som globale vanilla-øyer lastet fra layout: `public/js/cmdk.js` +
`css/cmdk.css` (⌘/Ctrl+K eller header-trigger som ellers GET-faller til /sok; sidenavigasjon,
referanseoppslag mot /api/reference med debounce, fulltekst/grunntekst-søkelenker, piltaster/
Enter/Esc, tekst settes med textContent — aldri innerHTML) og `public/js/shortcuts.js` +
`css/shortcuts.css` (?-overlay, /-fokus, Alt+Shift-navigasjon via e.code, kapittelnavigasjon
via `<body data-book-slug data-chapter data-max-chapter data-next-book-slug data-bible-query>`,
layout-modus og panelfaner via CustomEvents `bibel:layout-mode`/`bibel:panel-tab` — kontrakten
lesesiden (#9/#10) implementerer mot). NavigationAnnouncer utgår: SSR gir ekte sidelastinger som
annonserer selv (#16).

## #12 Brukerdata-øyer + sync-klient — I HOVEDSAK FERDIG (3ff4830, 2026-07-21)

**Gjort:** /innstillinger har nå konto/sync-seksjon (SSR login-state), sekundærbibel- og
versnummerering-valg (brukes som standard på lesesidene; sidens egne knapper overstyrer for
økten via sessionStorage-flagg), eksport/import av alle brukerdata, fortsett-lesing-toggle.
Ny global sync.js mot /api/sync med gamle klientens protokoll (singleton/per-item/per-plan,
tombstones via skygge-snapshot, endringsfangst ved patchet localStorage.setItem, debounced
push + pull ved last; 401 huskes per økt). **GJENSTÅR å verifisere sync med EKTE innlogget
konto-bruker (krever Vegards login) + per-oversettelse-toggles/egne bibler (hører til #14).**

Historikk: **Innstillinger-paritet mangler (Vegard påpekte 2026-07-21):** gamle /innstillinger hadde i
tillegg: Konto og synkronisering-seksjon (login-status, sync — hører hjemme her i #12),
per-oversettelse på/av-toggles (inkl. grunntekstene + egne bibler), sekundærbibel-valg
(inkl. «Grunntekst»), **versnummerering/KVN-mapping-valg**, og eksport/import av brukerdata
(useDataImportExport). Ny side har kun fontstørrelse + primærbibel + 10 visnings-toggles.
NB: flere toggles er uansett døde til reading.js/studium.js (#10) finnes. Footer-lenkene til
/om, /om#hjelp og /tilgjengelighet var foreldreløse — fikset (e35d950).

Favoritter, leseplaner, leseposisjon/ContinueReading, notater, andakter, emnetagging
(Topics/ItemTagging), verselister, innstillinger — localStorage/IndexedDB-lagring som i dag, koblet
til sync-motoren (vanilla-port av `src/lib/sync/`, idb-wrapperen erstattes med rå IndexedDB).
Innlogget tilstand fra konto-sesjonen.

## #13 Notat-/andaktseditor — FERDIG (levert i #9, verifisert i audit 2026-07-22)

Levert som del av brukersidene (#9): manuskript-editoren i user.tsx/user.js er textarea +
preview med egen CodeMirror-fri markdown-renderer. Browser-verifisert i prod under audit
2026-07-22 (/manuskripter/ny: textarea, preview og Lagre fungerer).

Erstatt CodeMirror-stacken (@uiw/react-codemirror, @codemirror/*, @lezer) med egen lettvekts
markdown-editor (textarea + preview; rendering med `marked` som i photosuite, eller egen renderer).
NotesPage, DevotionalEditor/View/List, react-markdown-visning erstattes av samme renderer.

## #14 Offline/PWA — FERDIG 2026-07-22

**Ferdig 2026-07-22:** Full offline/PWA-flate portert til SSR-arkitekturen:
- `public/manifest.json` + `public/sw.js` (statisk cache-first, HTML network-first m/fallback,
  utvalgte GET-API-er network-first m/cache; SKIP_WAITING/CLEAR_CACHE-meldinger) +
  `public/js/pwa.js` globalt (registrering, oppdaterings-banner, offline/online-indikator).
- `public/js/offline-db.js`: samme IndexedDB-skjema som gamle appen (bibel-offline v4,
  chapters keyet [bookId, chapter, bible]).
- `/offline` + `offline.js`: nedlasting av hele bibelen per oversettelse (batch 5, pause/
  gjenopptak, 404-skip) + tidslinje/profetier/personer/leseplaner; status (antall, plass,
  versjon) og sletting. Verifisert lokalt: 1189/1189 kapitler (~200MB), gjenopptak plukket
  kun manglende kapittel.
- `/offline-fallback` + `offline-reader.js`: SW serverer siden for navigasjoner uten nett;
  kapitler rendres fra IndexedDB (verifisert: 1 Mos 1, 31 vers), ellers bokoversikt.
- `/oversettelser` + `translations.js` + `bible-text-parser.js` (4 tester): fil/innliming →
  «Analyser tekst» (mapping-bookNames, greedy prefiks, advarsler) → import til IndexedDB.
  NYTT vs gamle appen: egne bibler synces til kontoen når innlogget (POST /api/sync/
  user-bibles + chunket user-bible-chapters; pull av kontobibler ved sidelast) — gamle
  appen hadde serverendepunktene men aldri klientkoblingen.
- Egne bibler på lesesiden (`user-bibles.js`): ?bible=user:<id> SSR-er osnb2 som grunnlag
  (studieverktøyene følger osnb2, som i gamle appen) og øya bytter versteksten fra
  IndexedDB; ?secondary=user:<id> som undertekst; bibelvelgeren utvides og respekterer
  settings.hiddenBibles (per-oversettelse-toggles i innstillinger, inkl. egne bibler +
  valgbare i primær/sekundær).
- DATAFIKS: books.chapters for Joel var 3 i DB (verses har 4) — rettet lokalt med UPDATE;
  prod rettes ved deploy. Kilden bør sjekkes i free-bible/generate-verse-counts (#3).

Full paritet-beskrivelsen (opprinnelig):

Full paritet: service worker (native), nedlasting av hele bibelen til IndexedDB
(`src/lib/offline/`, 104K — rå IndexedDB uten idb), CacheStatus, OfflineIndicator, OfflinePage,
UpdateNotification, manifest. Merk: innholdet kommer nå fra MySQL-API-et — offline-nedlastingen går
mot samme API-endepunkter.

## #15 Sitemap + SEO-artefakter — FERDIG (OG-meta følger sidene i #9)

**2026-07-20:** `scripts/generate-sitemap.ts` portert til Bun.sql — output BYTE-IDENTISK med
gammel (1199 URL-er, diffet mot regenerert gammel sitemap). robots.txt + favicon.svg kopiert;
favicon lenket i layout. Title/description settes per side i #9.

## #16 Tilgjengelighet — FERDIG (axe-sweep 2026-07-21, 8c4424a)

**Sweep 2026-07-21:** crawl av 260 URL-er i prod (statuskoder, døde lenker, ressurser, title/h1/
lang/skip-link/main/img-alt) + axe-core (WCAG 2.0/2.1 A+AA) i browser på lesesiden, forsiden,
innstillinger, søk, statistikk, editor, personer, paralleller, tidslinje, leseplan. Funn fikset:
aria-pressed på rail-chip-lenker → aria-current; falsk role=tablist på statistikk-ordfaner →
group + aria-pressed (statistics.js synker); manglende h1 på forsiden og editoren; lenker i
løpende tekst fikk understrek (WCAG 1.4.1); .sr-only globalt. **Resultat: 0 axe-brudd på alle
testede sider.** Grenser: automatisk sjekk (axe) + strukturell crawl — manuell skjermleser-test
og mørk modus-kontrastsjekk er ikke gjort. SSR-navigasjon = ekte sidelastinger annonserer selv
(NavigationAnnouncer trengs ikke).

## #17 Dockerfile + deploy — FERDIG (deployet i produksjon 2026-07-20)

**DEPLOYET 2026-07-20 — PARALLELL DRIFT (Vegards beslutning):** bibel.flogvit.no beholdes
SOM DEN ER (gammel app, service `bibel`); hono-varianten kjører PARALLELT på
**https://bibel.flogvit.com** (service `bibel-hono`, /srv/flogvit.com/bibel-hono/, Caddy
reverse_proxy i stedet for gammel 301). Ingen cutover/301 av .no nå. Gjort: flogvit_bibel +
bruker `bibel` opprettet på db-flogvit (scw, konto-mønsteret), bibel.env på VM-en (root-only),
alle data lastet via mysqldump lokal→VM→db-flogvit (93 480 vers / 402 731 word4word / 39
tabeller verifisert), deploy/deploy-bibel.sh kjørt: bygget, helsesjekk OK, lesesider/søk/API
verifisert live. Sitemap: committet versjon brukes når .env mangler i checkouten.

**2026-07-20:** Dockerfile ferdig (Bun 1.3-slim, COPY tsconfig.json-gotchaen håndtert, kvn-package
kopieres før bun install --production, ingen bible.db). Ny deploy-script klar i
`deploy/deploy-bibel.sh` (erstatter server/deploy-bibel.sh VED CUTOVER — prod-scripten er urørt):
rsyncer bibel-hono, stager kvn fra free-bible, genererer sitemap, ingen db-staging.
**Gjenstår til cutover (#18):** server/compose.yml (env_file bibel.env), server/Caddyfile
(.com kanonisk, .no → 301), opprette flogvit_bibel + bruker på db-flogvit (sjekk eksisterende
state først!), kjøre init-db + import mot db-flogvit, bibel.env varig lagret.

Bun-basert Dockerfile (COPY tsconfig.json!), compose-tjenesten `bibel` bytter build-kilde til
rsyncet `bibel-hono/`, oppdater `server/deploy-bibel.sh` (slutt å stage bible.db; kvn-package
trengs kun for import, ikke runtime — vurder). MySQL-tilkobling via env: secrets lagres VARIG
(feedback-durable-secrets — aldri write-only). db-flogvit: ny database `bibel` + bruker; sjekk
eksisterende state før endring (gcloud/Scaleway-regelen gjelder db-flogvit også).

## #18 Verifisering + evt. cutover — FERDIG 2026-07-22 (ingen cutover — Vegards beslutning)

**Lukket 2026-07-22:** All verifisering er fullført (full audit, side-ved-side, sync roundtrip
live, offline). **Vegard har besluttet at det IKKE blir cutover på .no** — parallell drift er
modellen: .com er kanonisk og videreutvikles, .no står urørt på branch bibel-no. Ingen 301,
ingen opprydding av gammel app. Skulle det noen gang endre seg, er det en ny beslutning.

**Side-ved-side-diff kjørt 2026-07-22:** full crawl av alle 1199 sitemap-URL-er på begge
domener, lenkegraf fra forsiden, browser-test av ~15 nøkkelsider + øyer (⌘K, versdetaljer,
editor, innstillinger) på begge, API-diff (version/daily-verse/books), kildekode-diff main vs
bibel-no. Alle 36 ruter finnes og svarer på .com. Funnene er lagt som #19–#24 (.no røres ikke —
Vegards beslutning 2026-07-22). **Sync roundtrip VERIFISERT LIVE 2026-07-22** med egenopprettet
testbruker (claude-sync-test@menneske.no, id 5 i konto — kan slettes): push fra enhet A → pull
fra enhet B (favoritter + settings), user-bibles push/pull, 401 uinnlogget, fv-auth-markør.
Testdata i bibel-DB-en er ryddet; konto-brukeren står. Offline (#14) er levert og live.
Lokal login-flyt uten DB er dokumentert i CLAUDE.md (konto med DB_DISABLED=1).
Gjenstår i #18 kun selve cutover-beslutningen for .no.

**Ny modell (Vegard 2026-07-20): parallell drift.** .com er live med hono-varianten (#17);
.no beholdes som den er inntil videre — INGEN 301/cutover planlagt nå. Gjenstående
verifisering skjer mot live .com: side-ved-side-diff mot .no, sync roundtrip mot
konto-innlogget bruker, offline når #14 er bygget. Hvis/når .no skal over: merge `hono` →
`main`, snu Caddy (.no → 301 .com), rydd gammel app — men det er en egen fremtidig beslutning.

**Alle seks FERDIG 2026-07-22** — detaljer og verifisering i GitHub-issuene. Kortversjon:
#19 sitemap genereres nå fra statisk booksData med norske slugs (= canonical, ingen DB-avhengighet;
alle 1200 URL-er verifisert 200 lokalt, +/joel/4 som manglet — books.chapters i DB sier 3, verses
har 4) + bindestrek-aliaser for engelske navn. #20 /sok SSR-er alle 10 ekstra resultattypene via
samme lib-funksjoner som /api/search/all + search.js-øy som respekterer searchResultTypes-toggles.
#21 Dager i Oversikt-menyen, kronologisk/tematisk via ?visning= (card-filter.js gjort
descendant-basert), TodaysDay-ekvivalent SSR på forsiden m/showTodaysDay-toggle (betingede
forsideseksjoner skjules nå faktisk av home.js via data-setting-show — toggles var før uten
konsumenter). #22 src/lib/page-cache.ts: mikrocache for anonyme GET-HTML (TTL 5 min, 48MB tak,
fv-session omgår, /api/* urørt) + Cache-Control public/max-age=300/swr — 30 samtidige Sal 119
på 1,1s lokalt; 5 tester. #23 nye toggles: historisk kontekst, viktige ord, versdetaljer-klikk,
parallelle tekster, standard visningsmodus (select) + Søkeresultater-seksjon; user.js data-setting
støtter dot-path. #24 fv-auth-markørcookie (withSession) så sync.js dropper 401-kallet uinnlogget;
h1 = bok + kapittel; Ressurser/Oppslag VERIFISERT dekket (alle 12 StudyBlocks finnes — ingen
endring); tidslinje-periodefilter som øy (SSR-knapper, skjult uten JS). showVerseIndicators fra
gamle appen er IKKE portert — redesignet har ingen versindikator-funksjon å skru av/på.

## #19 Sitemap peker på 237 døde kapittel-URL-er — FERDIG 2026-07-22 → [GitHub #1](https://github.com/flogvit/bibel.flogvit.no/issues/1)

Funnet i audit 2026-07-22 (full crawl): sitemap-generatoren lager kapittel-slugs fra
`books.name` (ENGELSK i DB, mellomrom→bindestrek: `/1-chronicles/1`), men
`src/lib/book-aliases.ts` har kun varianter uten bindestrek (`1chronicles`). 18 bøker med
flerords engelsk navn (1/2 Krønikebok, Samuel, Kongebok, Korinter, Tess, Tim, Pet, Joh,
Høysangen m.fl.) = 237 av 1199 sitemap-URL-er gir 404. Gamle appen har SAMME feil (klientside
soft-404, «Bok ikke funnet» med HTTP 200) — feilen er arvet, ikke innført av omskrivingen.
Canonical bruker norske slugs (`/1mos/1`) og spriker mot sitemapen også der engelsk slug
virker (`/genesis/1` → canonical `/1mos/1`).
**Fiks:** generer sitemapen med norske slugs (= canonical) i `scripts/generate-sitemap.ts`
(slug fra `short_name` som appen selv, ASCII-foldet som i dag: 1krøn→1kron virker via alias).
Vurder i tillegg bindestrek-aliaser (`1-chronicles`, `song-of-solomon`, …) i book-aliases.ts
så gamle indekserte engelske URL-er fortsatt treffer. Regenerér og deploy sitemap.

## #20 Søk: manglende resultattyper — FERDIG 2026-07-22 → [GitHub #2](https://github.com/flogvit/bibel.flogvit.no/issues/2)

Gamle søket viser 10 resultattyper utover bibeltekst: bibelhistorier, temaer, personer,
profetier, tidslinje, evangelieparalleller, leseplaner, viktige ord, tall, dager — med
per-type på/av-toggles i innstillinger («Søkeresultater»-seksjonen). Nye `/sok` har kun
bibeltekst (181 treff «kjærlighet» er verifisert paritet for selve teksten). Portér de øvrige
typene som SSR-seksjoner på søkesiden + toggles i innstillinger (→ #23).

## #21 Dager: menypunkt, faner og forsidekomponent — FERDIG 2026-07-22 → [GitHub #3](https://github.com/flogvit/bibel.flogvit.no/issues/3)

Audit 2026-07-22: «Dager» mangler i Oversikt-menyen i layout.tsx (gamle appen har den) —
`/dager` nås i dag kun via Alt+Shift+D. Siden selv virker (48 kort, paritet), men mangler
gamle appens Kronologisk/Tematisk-faner. Gamle forsiden har dessuten betinget «Dagens
helligdag»-komponent (vises søndag/høytid; TodaysDay) med egen forside-toggle i innstillinger
— mangler i ny forside. Fiks: menypunkt i NAV_GROUPS, faner på /dager, TodaysDay-ekvivalent
SSR på forsiden (betinget på dagens dato mot days-tabellen).

## #22 Cache/ytelse på SSR-HTML — FERDIG 2026-07-22 → [GitHub #4](https://github.com/flogvit/bibel.flogvit.no/issues/4)

Audit 2026-07-22: kapittelsider er 385KB–1.1MB rå HTML (Sal 119 størst; gzip ~156KB over
nett). Ingen Cache-Control på HTML-svar. ~16 samtidige forespørsler ga 502 + 9s responstid
(3 samtidige gikk fint) — sårbart for bot-crawling. Tiltak: Cache-Control på innholdssider
(innholdet endres kun ved import — kan caches aggressivt med import-versjon som nøkkel),
vurder slanking av word4word-SSR-payloaden, ev. mikrocaching/samtidighetsgrense i Caddy.

## #23 Innstillinger: resterende paritet — FERDIG 2026-07-22 → [GitHub #5](https://github.com/flogvit/bibel.flogvit.no/issues/5)

Utover det som alt er levert i #12 og utsatt til #14: gamle visnings-toggles som mangler i ny
(versindikatorer, parallelle tekster, viktige ord, versdetaljer, lesemodus som standard),
søkeresultat-toggles (leveres med #20), «Dagens helligdag»-forsidetoggle (leveres med #21).
Per-oversettelse på/av-toggles hører fortsatt til #14 (krever oversettelses-infrastrukturen).

## #24 Småpuss fra audit 2026-07-22 — FERDIG 2026-07-22 → [GitHub #6](https://github.com/flogvit/bibel.flogvit.no/issues/6)

- `sync.js` kaller `/api/sync` også uinnlogget → 401-konsollfeil på hver eneste sidelast.
  Sjekk SSR-login-state (data-attributt fra layout?) før kall.
- h1 på kapittelside er «Kapittel 1» — gamle hadde «1. Mosebok 1» (bokinfo finnes i konteksten;
  paritet + tydeligere SEO).
- Studium-sidebar: ny har Studium/Tidslinje/Paralleller/Innsikt, gamle hadde
  Tidslinje/Kontekst/Ressurser/Oppslag — verifiser at Ressurser- og Oppslag-innholdet er
  dekket, ellers portér det som mangler.
- Tidslinje: gamle hadde interaktive periodefilter-knapper; ny er statisk SSR-gruppering.
  Tas ev. sammen med MultiTimelineView-øya (notert i #9).
