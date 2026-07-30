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

## Lastvern (anonyme sidevisninger)

`src/lib/page-cache.ts` er både mikrocache OG lastavvisning (#4, #14): anonyme
GET-HTML-sider caches 5 min, og render over semafor-taket får utløpt
cache-innhold (stale) eller 503 + `Retry-After: 30` etter kort kø. Innloggede
går alltid utenom. Env: `RENDER_MAX_CONCURRENT` (24), `RENDER_QUEUE_WAIT_MS`
(3000) og `DB_POOL_MAX` (default 5 — sett den etter hva databasen din tåler; en for
liten pool var nettopp det som ga 502 under samtidighet).

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
enum-verdier i dataene (`era.exodus`, `fn.tekstkritisk`), bruk `tEnum()` — den
holder på typesikkerheten, som er det som gjør en glemt oversettelse til en
byggefeil.

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
