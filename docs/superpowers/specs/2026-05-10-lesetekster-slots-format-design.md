# Lesetekster: slot/option/part-format

**Dato**: 2026-05-10
**Status**: Godkjent design

## Bakgrunn

DnK lesetekster (`free-bible/generate/dnk_lesetekster/{2025-2026,2026-2027,2027-2028}.json`) parses fra årlige PDF-er fra Den norske kirke (`free-bible/external/dnk/lesetekster/*.pdf`). Dagens datamodell er en flat liste med `readings`, hver med `reference`, `title`, og en valgfri `alternative: true`.

Dette holder ikke. Følgende mønstre i kildene mangler entydig representasjon:

| Mønster | Eksempel | Antall | Status i dag |
|---|---|---|---|
| **Eller** mellom bøker | `Jer 29,10-14` *eller* `Apg 16,25-40` | 21 | `alternative: true`-flagg, men parser mister bok-navn ved linje-wrap |
| **Cross-chapter compound** | `1 Mos 2,8-9; 3,1-8` (begge leses) | ~11 | Inline `;` som verken kvn-syntax eller importer håndterer korrekt |
| **Og** mellom bøker | `1 Mos 1,1-5;1,26-2,2 og 2 Mos 14,1-22` | 3 | Splittes i to readings — "og"-relasjonen tapt |
| **Og/eller** innen samme bok | `Apg 17,22-25 og/eller 26-31` | 2 | Inline fritekst — ikke maskin-leselig |

Synlig konsekvens: 6. søndag i påsketiden 2026 viser hele Jer 29 fra vers 1 fordi `import-bible.ts` ikke kan parse den ugyldige sammenslåtte referansen `Jer 29,10-14;16,25-40` (som dessuten egentlig skulle vært to separate alternativer).

## Mål

1. Datamodell som entydig uttrykker slot ⇄ option ⇄ part ⇄ ranges
2. Parser som klarer alle PDF-mønstrene, inkludert linje-wrap av bok-navn
3. UI som viser "eller" som valg og "og" som sekvens
4. Importer som lagrer hierarkiet og som ikke faller tilbake til "hele kapittelet" når den ikke kan parse

## Datamodell

### JSON (etter parser)

```typescript
interface DayEntry {
  name: string;
  date: string;        // YYYY-MM-DD
  series: string;      // I, II, III, A, IV
  slots: Slot[];
}

interface Slot {
  options: Option[];   // length >= 1; flere = "eller" mellom dem
}

interface Option {
  parts: Part[];       // length >= 1; flere = "og" — leses i sekvens
}

interface Part {
  refs: string[];      // length >= 1; flere = sammensatt referanse (cross-chapter)
  title: string;       // alle refs i en part deler tittel
}
```

Hver streng i `refs` er ren kvn-markup: `[ref:<book> <chapter>,<verseSpec>@dnb2024]`.

### Slot-rekkefølge

Beholdes slik den fremstår i PDF (typisk GT, evangelium, epistel, salme), men ingen eksplisitt `type`-merking. Slot-typer kan utledes senere ved behov.

### Eksempler

**6. søndag i påsketiden** — eller mellom bøker:
```json
{
  "slots": [
    {
      "options": [
        { "parts": [{ "refs": ["[ref:Jer 29,10-14@dnb2024]"], "title": "Fredstanker, fremtid og håp" }] },
        { "parts": [{ "refs": ["[ref:Apg 16,25-40@dnb2024]"], "title": "Paulus og Silas løslates" }] }
      ]
    },
    { "options": [{ "parts": [{ "refs": ["[ref:1 Joh 5,13-15@dnb2024]"], "title": "Han hører når vi ber" }] }] },
    { "options": [{ "parts": [{ "refs": ["[ref:Luk 18,1-8@dnb2024]"], "title": "Enken og dommeren" }] }] }
  ]
}
```

**Påskenatt/Ottesang** — og mellom bøker, og cross-chapter compound:
```json
{
  "slots": [
    {
      "options": [{
        "parts": [
          { "refs": ["[ref:1 Mos 1,1-5@dnb2024]", "[ref:1 Mos 1,26-2,2@dnb2024]"], "title": "Gud skaper lyset og menneskene" },
          { "refs": ["[ref:2 Mos 14,1-22@dnb2024]"], "title": "Sivsjø-underet" }
        ]
      }]
    }
    // ... øvrige slots
  ]
}
```

**17. mai** — og/eller innen samme bok blir tre likeverdige options:
```json
{
  "options": [
    { "parts": [{ "refs": ["[ref:Apg 17,22-25@dnb2024]"], "title": "Han gir liv og ånde til alle" }] },
    { "parts": [{ "refs": ["[ref:Apg 17,26-31@dnb2024]"], "title": "Han gir liv og ånde til alle" }] },
    { "parts": [{ "refs": ["[ref:Apg 17,22-25@dnb2024]", "[ref:Apg 17,26-31@dnb2024]"], "title": "Han gir liv og ånde til alle" }] }
  ]
}
```

## DB-skjema

`reading_text_refs` får tre nye kolonner:

```sql
ALTER TABLE reading_text_refs ADD COLUMN slot_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reading_text_refs ADD COLUMN option_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reading_text_refs ADD COLUMN part_index INTEGER NOT NULL DEFAULT 0;
```

Eksisterende kolonner:
- `display_ref` — én `[ref:...]`-markup per rad (tilsvarer én ref i parts.refs[]). Flere rader med samme `(slot_index, option_index, part_index)` kan ha hver sin `display_ref` (cross-chapter compound).
- `title` — tittel for part-en (samme verdi på alle rader for én part)
- `book_id`, `chapter`, `verse_start`, `verse_end`, `part_start`, `part_end` — én rad per range. Hvis én ref i `refs[]` dekker flere rader, har de samme `display_ref` og forskjellig `sort_order`.
- `sort_order` — sorterer rader innen samme part (først etter ref-index i `refs[]`, deretter etter range-index hvis én ref produserer flere rader)

Identifikasjon av en part: `(reading_text_id, slot_index, option_index, part_index)`.
Identifikasjon av en ref innen en part: gruppering på `display_ref` innen part-en.

`alternative`-feltet (eksisterer ikke i DB i dag) er ikke nødvendig; `option_index > 0` markerer alternativer.

### Display-streng på part-nivå

Backend bygger part-display ved respons-tid: hent unike `display_ref`-verdier i rekkefølge, strip `[ref:...|...]`-markup til ren tekst (eks. `Jer 29,10-14`), og join med `; `. Frontend rendrer den ferdig-bygde strengen via eksisterende `Reference`-komponent (`src/components/Reference.tsx`) som håndterer enkel tekst inkludert `;`-separerte refs.

## API

`GET /api/reading-texts/:id` returnerer hierarkisk struktur:

```typescript
interface ReadingTextResponse {
  id: number;
  date: string;
  name: string;
  series: string | null;
  slots: SlotResponse[];
  verses: Record<string, EnrichedVerse[]>; // nøkkel: display_ref per part
}

interface SlotResponse { options: OptionResponse[]; }
interface OptionResponse { parts: PartResponse[]; }
interface PartResponse {
  title: string;
  display_ref: string;          // join(refs, '; ') for visning
  ranges: VerseRange[];         // for vers-oppslag
}

interface VerseRange {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  part_start: string | null;
  part_end: string | null;
}
```

`verses`-cachen indekseres på `display_ref` per part — alle ranges i en part aggregeres til én vers-liste i samme rekkefølge som `ranges[]`.

`GET /api/reading-texts/today` og `/api/reading-texts/` returnerer samme hierarki (uten `verses`-data for listevisning).

## Parser-endringer (`parse_lesetekster.ts`)

Skrives om for å produsere `slots[]` direkte. Hovedlogikk:

1. **Linje-buffer for "eller <Bok>"-wrap**: Når en linje matcher `^(eller|og)\s+(<bok>)\s*$` (uten chapter/verse), buffer som *pending alt-prefix* og forvent at neste reflinje begynner med chapter/verse. Hvis neste linje matcher `^[\d]`, sett ref-en til `<bok> <chapter,vers>` med korrekt prefix-håndtering.
2. **Eksplisitt eller**: Reading med prefix `eller` blir en ny option i samme slot.
3. **Eksplisitt og**: Linje som starter med `og <Bok>` (eller `og <chapter>` for samme bok) blir en ny part i gjeldende option.
4. **Cross-chapter `;`**: Når en ref har `;` mellom verse-spec-er innen samme bok, splittes til flere refs innen samme part.
5. **og/eller**: Splittes til tre options i samme slot.

Edge cases (basert på PDF-skann):
- `eller Apg` + `16,25–40` (6. søndag i påsketiden 2026)
- `eller Apg 1,1–` + `11` (Kristi himmelfartsdag — fungerer i dag, må fortsatt fungere)
- `og 2 Mos 14,1–` + `22` (Påskenatt)
- `og/eller 26–31` (17. mai)
- `Hebr 11,1–` + `2.32b–34.38–40` (Sankthansdagen — komplisert verse-spec wrap)

## Importer-endringer (`scripts/import-bible.ts`)

1. Migrasjon: ALTER TABLE for å legge til de tre nye index-kolonnene; full re-import fra JSON (sletter alle `reading_text_refs`- og `reading_texts`-rader og bygger på nytt).
2. Iterer `slots[].options[].parts[].refs[]` og fyll én rad per range. `display_ref` på rad-nivå = den ene `[ref:...]`-markupen for ref-en (eks. `[ref:1 Mos 1,1-5@dnb2024]`). Korrekt `slot_index`, `option_index`, `part_index` settes.
3. `sort_order` settes globalt stigende innen part — først etter `refs[]`-rekkefølge, så etter range-index når én ref splittes til flere rader (f.eks. ved cross-chapter `verseSpec` som strekker seg over to kapitler).
4. `parseVerseRanges` håndterer fortsatt verse-spec på én ref. Cross-chapter compound (`;` mellom verseSpec-er) løses nå ved å splitte til flere refs i parser-fasen, ikke i importen.

## API-/lib-endringer

`src/lib/bible.ts`:
- Ny type `ReadingTextHierarchy` matcher API-respons
- `getReadingTextById(id)` returnerer ny type — bygger hierarki ved gruppering på `(slot_index, option_index, part_index)`, sorter etter disse + `sort_order`
- `getReadingTextsByDate(date)` likedan
- `getTodaysReadingTexts()` likedan

`api/routes/reading-texts.ts`:
- `enrichWithVerseText` opererer på hierarkiet, indekserer `verses` på part-ens `display_ref`

## UI-endringer

### `src/pages/ReadingTextPage.tsx`

Itererer over `slots`. For hver slot:
- Hvis `options.length === 1`: vis option-ens parts som tidligere (en eller flere parts i sekvens med titler)
- Hvis `options.length > 1`: vis options separert med "eller"-skille (visuell skillelinje + lite "eller"-merke), hver option vises med sine parts

Eksempel layout:

```
GT-lesning
  Jer 29,10-14 — Fredstanker, fremtid og håp
  [verses ...]

  ─── eller ───

  Apg 16,25-40 — Paulus og Silas løslates
  [verses ...]

Epistel
  1 Joh 5,13-15 — Han hører når vi ber
  [verses ...]

Evangelium
  Luk 18,1-8 — Enken og dommeren
  [verses ...]
```

Slot-overskrifter ("GT-lesning", "Epistel", etc.) er ikke i dataene; de utledes ikke i denne iterasjonen — slots vises bare nummerert eller uten heading. Vi kan vurdere å utlede senere (basert på book + posisjon).

### `src/components/TodaysReadingText.tsx`

Viser kun "primary path" (option_index=0 i hver slot, alle parts). Hvis en slot har flere options, vises en liten markør (f.eks. "(+)" eller "se også") som lenker til full visning.

### Andre frontend-filer

`src/lib/bible.ts` (frontend type-eksport) og evt. komponenter som leser `readings`-feltet må oppdateres. TS-feilene gir migreringslisten.

## KVN-tester

`free-bible/kvn/tests/{kvn-,ukvn-}lesetekster*.test.ts` leser JSON-filene direkte og forventer flat `readings[]`-array. Oppdatere til å iterere `slots[].options[].parts[].refs[]`.

## Migrering

1. Skriv om parseren først, kjør den, sjekk diff manuelt mot eksisterende JSON for de 36 dagene som har spesielle mønstre (21 alt + 11 cross-chapter + 3 og + 2 og/eller, med overlapp)
2. Skriv import-/lib-/API-endringer; verifiser at 6. søndag i påsketiden 2026 nå viser to options med riktige tekster
3. Frontend; lokalt smoke-test på et knippe utvalgte dager

## Risikoer

- **PDF-tolkning**: hver av de 36 spesielle entryene må visuelt verifiseres i PDF mot ny parser-output
- **KVN-mapping** for compound refs (cross-chapter `1,1-5; 1,26-2,2`): én ref per range, så KVN brukes individuelt — uendret fra dagens kode
- **DB-migrasjon**: full re-import nødvendig (sletter `reading_text_refs`-rader, fyller på nytt fra JSON). Ingen produksjonsdata går tapt fordi alt regenereres fra JSON.
