# Bibel.flogvit.com

## Prosjektbeskrivelse
En norsk bibel-nettside med oppslagsverk og verktøy for bibellesning. Vite-frontend + Express-API med SQLite (`data/bible.db`).

## Brancher
- **`bibel-no`** (denne): gammel app (Vite+React+Express+SQLite), serverer **bibel.flogvit.no** — fryst, beholdes som den er inntil videre. Deploy til .no må skje fra en checkout av DENNE branchen (`server/deploy-bibel.sh` i flogvit.com/server/).
- **`main`**: Bun+Hono+hono/jsx+Bun.sql mot MySQL — kjører på **bibel.flogvit.com** (parallelt med .no). Plan og status i `ISSUES.md` der.

## `osnb2` er BIBEL-id-en. Nummereringen heter `osnb` (#101)

To akser deler en streng, og det er ikke samme verdi:

- **Bibel-id** — `verses.bible`, `?bible=`, brukerens lagrede innstillinger.
  Heter fortsatt `osnb2`/`osnn1` i basen denne flata leser, og skal STÅ. `main`
  migrerte sin base til `osnb`/`osnn`; det er en annen base og en annen flate.
- **Mapping-id** — filnavnet i `kvn-package/mappings/`. free-bible døpte om
  `osnb2.ukvn.json` → `osnb.ukvn.json` 2026-07-26. `OSNB_MAPPING_ID` i
  `api/lib/verse-mapper.ts` er den ene sannheten; skriv den aldri som literal.

Prisen da de to ble blandet: `loadUkvnMapping` gjør `readFileSync` uten
fallback, så HVER forespørsel med `mapping=` kastet ENOENT og ble en 500 —
17 av 17 mot `/api/chapter`, mot 468 av 468 grønne uten. Samme linje tømte de
~250 lesetekst-sidene (#98/#99). Uten `mapping=` røres fila aldri, og det er
derfor bare parallellnummereringen døde: appen så frisk ut for alle andre.

**Vakta er `api/lib/verse-mapper.test.ts`**, kjørt med `npm test`
(= `bun test api`). Den er formulert på KATALOGEN av mappingfiler og ikke på
strengen «osnb», så neste omdøping i kilden blir rød her framfor en 500 hos en
leser. Tre halvdeler: BASEN (id-en kryssmapperen går gjennom står i
`listUkvnMappings()`), FLATA (`mapChapter` kaster ikke for id-ene appen SELV
tilbyr — valgt av dataene) og FORMEN (ingen mapping-id som literal i `api/`,
sveipen må finne begge kallformene, og bibel-id-en `osnb2` må fortsatt finnes,
så «søk og erstatt» ikke består). Sju mutasjoner kjørt.

**Branchen har ellers ingen testrigg.** `bun test` er valgt fordi den ikke
krever noe installert utover `npm ci`; `tsconfig.api.json` holder `*.test.ts`
utenfor `build:api`.

## Datakilder
All bibeldata hentes fra `../free-bible/generate/`:

### Bibler
- `bibles_raw/osnb2/[bok]/[kapittel].json` - Norsk bokmål (standard)
- `bibles_raw/osnn1/[bok]/[kapittel].json` - Norsk nynorsk
- `bibles_raw/sblgnt/[bok]/[kapittel].json` - Gresk NT (SBL Greek New Testament)
- `bibles_raw/tanach/[bok]/[kapittel].json` - Hebraisk GT

### Tilleggsdata
- `word4word/sblgnt/{nb|nn}/[bok]/[kapittel]/[vers].json` - Ord-for-ord NT (gresk → norsk)
- `word4word/tanach/{nb|nn}/[bok]/[kapittel]/[vers].json` - Ord-for-ord GT (hebraisk → norsk)
- `references/nb/[bok]/[kapittel]/[vers].json` - Kryssreferanser mellom bibeltekster
- `book_summaries/nb/[bok].txt` - Sammendrag av hver bok
- `chapter_summaries/nb/[bok]-[kapittel].txt` - Sammendrag av hvert kapittel
- `important_words/nb/[bok]-[kapittel].txt` - Viktige ord/begreper i kapittelet
- `themes/nb/[tema].json` - Tematiske oversikter med seksjoner og versreferanser
- `prophecies/prophecies.json` - Profetier og oppfyllelser (47 profetier i 7 kategorier)
- `timeline/nb/events/periods.json` + `timeline/nb/events/*.json` - Bibelske hendelser (11 perioder)
- `timeline/nb/world/periods.json` + `timeline/nb/world/*.json` - Verdenshistoriske hendelser (parallelt med bibelske)
- `timeline/nb/books/[bok].json` - Bok-spesifikke tidslinjer med seksjoner
- `reading_plans/` - Leseplaner (årlig, kronologisk, NT, etc.)
- `chapter_insights/nb/[bok]-[kapittel].json` - Strukturerte kapittel-innsikter (ættetavler, lister, etc.)

### Bokstruktur
- Bøker 1-39: Det gamle testamente (Tanach/hebraisk)
- Bøker 40-66: Det nye testamente (SBLGNT/gresk)

## Kommandoer
```bash
# Utvikling - starter begge servere
npm run dev:all

# Kun frontend (Vite) - port 3020
npm run dev

# Kun API-server (Express) - port 3018
npm run dev:api

# Bygg
npm run build

# Oppdater database fra generate/
npm run import-bible

# TypeScript (bruk alltid tsx)
npx tsx scripts/import.ts
```

## Utviklingsserver
- **Frontend (Vite)**: http://localhost:3020
- **API (Express)**: http://localhost:3018
- Vite proxyer `/api/*` til Express-backenden i utvikling
- Produksjon: Express serverer alt på port 3018

## Funksjoner

### Bibellesing
- Klikk på versnummer → referanser, bønn, andakt
- Klikk på ord → originalord, uttale, forklaring (word4word)
- Grunntekst-visning (hebraisk/gresk) under vers
- Vers-anker: `/[bok]/[kapittel]#v5`

### Hjelpemidler (ToolsPanel)
- Boksammendrag, kapittelsammendrag, viktige ord
- Tidslinje-sidebar (viser relevante hendelser)
- Skriftstørrelse (liten/medium/stor)
- Mørk/lys modus

### Brukerdata (localStorage)
- Favorittvers
- Emnetagging av vers
- Leseplan-progresjon med streak-teller
- Innstillinger (showSummary, showOriginal, theme, etc.)

## Apache-konfigurasjon
Kjør Express-serveren bak Apache som reverse proxy:
```apache
<VirtualHost *:80>
    ServerName bibel.flogvit.no
    ProxyPass / http://localhost:3018/
    ProxyPassReverse / http://localhost:3018/
</VirtualHost>
```

## Designretningslinjer
Basert på books.flogvit.com - moderne, stilrent, behagelig.

### Farger
```scss
$color-primary: #2c3e50;      // Mørk blågrå - overskrifter
$color-secondary: #8b7355;    // Varm brun - lenker
$color-accent: #c9a959;       // Gull - aksentfarge
$color-background: #faf8f5;   // Varm off-white - bakgrunn
$color-paper: #ffffff;        // Hvit - kort/paneler
$color-text: #333333;         // Mørk grå - brødtekst
$color-text-muted: #999999;   // Lys grå - sekundær tekst
$color-border: #e5e0d8;       // Varm grå - kantlinjer
```

### Typografi
- **Overskrifter**: Georgia, serif (font-weight: 400)
- **Brødtekst**: Segoe UI, Helvetica Neue, sans-serif
- **Linjehøyde**: 1.6 for tekst, 1.3 for overskrifter

### Stilelementer
- Ingen gradienter
- Subtile skygger (box-shadow med lav opacity)
- Avrundede hjørner (4-12px)
- God whitespace/spacing
- Myk hover-effekt på interaktive elementer

### Sidestruktur
Alle sider (`src/pages/`) skal pakkes inn i en container. Standard mønster:
```tsx
<main className={styles.main}>
  <div className="reading-container">
    <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Sidenavn' }]} />
    <h1>Sidenavn</h1>
    {/* innhold */}
  </div>
</main>
```
- `"reading-container"` er en global CSS-klasse (max-width 720px, sentrert) - brukes for teksttunge sider
- `"container"` er en global CSS-klasse (max-width 1200px, sentrert) - brukes for bredere sider
- Alltid bruk `<Breadcrumbs>` for navigasjon tilbake

## Viktige regler
- Oppdater TODO.md når oppgaver fullføres (se også DONE.md)
