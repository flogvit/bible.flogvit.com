# TODO - Bibel.flogvit.com

Se DONE.md for fullførte oppgaver.

## Fase 8: Sam-lesing (fremtidig)
- [ ] WebSocket-server for realtime
- [ ] Opprett sesjon som taler
- [ ] Delta i sesjon som tilhører
- [ ] Synkronisert visning

## Fase 9: Brukerkontoer (fremtidig)
- [ ] Autentisering (NextAuth.js eller lignende)
- [ ] Brukerregistrering/innlogging
- [ ] Lagre personlige innstillinger i database
- [ ] Lesehistorikk
- [ ] Emnetagging database-versjon (med innlogging, users.db)

## Studiebibel-funksjoner

### Ordstudier
| Funksjon | Format | Skript | Mappe |
|----------|--------|--------|-------|
| Ordhistorie og etymologi | `.json` | `word_etymology.mjs` | `word_etymology/` |
| Semantiske felt (relaterte ord) | `.json` | `word_relations.mjs` | `word_relations/` |

### Teologi og tolkning
| Funksjon | Format | Skript | Mappe |
|----------|--------|--------|-------|
| Doktrinær oversikt per tema | `.md` | (inkl. i themes.mjs) | `themes/nb/` |
| Typologi (GT→NT) | `.json` | `typology.mjs` | `typology/` |
| Guds attributter vs. menneskers | `.json` | `divine_attributes.mjs` | `divine_attributes/nb/` |

### Personlig bibelstudium
| Funksjon | Format | Skript | Mappe |
|----------|--------|--------|-------|
| Spørsmål til refleksjon | `.json` | `reflection_questions.mjs` | `reflection_questions/nb/` |
| Applikasjoner for dagliglivet | `.json` | `applications.mjs` | `applications/nb/` |

### Oppslagsverk
| Funksjon | Format | Skript | Mappe |
|----------|--------|--------|-------|
| Stedsoversikt med beskrivelser | `.md` | `bible_places.mjs` | `places/nb/` |
| Symboler og billedspråk forklart | `.md` | `symbols.mjs` | `symbols/nb/` |
| Bibelsk ordbok/leksikon | `.md` | `bible_dictionary.mjs` | `dictionary/nb/` |

### Beregnes fra eksisterende data
| Funksjon | Kilde | Skript | Output |
|----------|-------|--------|--------|
| Konkordans | word4word + verses | `build_concordance.mjs` | `concordance/` |

### Eksterne kilder
| Funksjon | Mulige kilder |
|----------|---------------|
| Geografisk info med kart | OpenBible.info (koordinater), Leaflet/OpenStreetMap |
| Lydbibel-integrasjon | Må finne åpen kilde eller lisensiert innhold |
| Bilder og illustrasjoner | Public domain bilder, eller lisensiert |

### Frontend-funksjoner
- [x] Dagens vers (verse of the day) på forsiden
- [ ] Bibelvers-memorering med repetisjon (spaced repetition)
- [ ] Kart for bibelske reiser (Leaflet-komponent med koordinater fra places/)

## Data-generering (../free-bible/generate/)

### Ufullstendig data
| Datatype | Status | Filer | Skript |
|----------|--------|-------|--------|
| references | ⚠️ Delvis | 3,457 | `references.mjs` |
| important_verses | ❌ Minimal | 1 | Mangler |
| themes | ❌ Minimal | 1 | Mangler |
| verse_prayer | ❌ Minimal | 4 | Mangler |
| verse_sermon | ❌ Minimal | 5 | Mangler |

### Skript som må lages
- themes.mjs - Tematiske oversikter
- verse_prayer.mjs - Bønn basert på vers
- verse_sermon.mjs - Andakt/preken basert på vers
- important_verses2json.mjs - Konvertere til JSON

### Skript som må kjøres videre
references.mjs - Kryssreferanser (mangler bøker 2-39 og 43-66)

## Data
- [ ] Generere norsk word4word-data for alle bøker (mangler for de fleste GT-bøker)
- [ ] Sjekke at alle hebraiske word4word har latinske bokstaver (translitterasjon) på de hebraiske ordene, slik vi har for de greske ordene

## WCAG 2.2 AA - Gjenstående testing
- [ ] Testing med skjermleser (VoiceOver, NVDA)
- [ ] Manuell testing med tastatur
- [ ] Lighthouse accessibility audit

## Manuskriptmodul

Implementert! Se `/manuskripter` for å skrive, organisere og koble manuskripter til bibeltekst.

### Implementert
- [x] Manuskripter med markdown-innhold, tittel, dato, type, tags
- [x] Typer: andakt, preken, bibeltime, refleksjon, studie, bønn, undervisning
- [x] Bibelvers-referanser (`[ref:Joh 3,16]`) som rendres som klikkbare lenker med inline-visning
- [x] Manuskriptliste/arkiv med søk, filtrering (type/tag) og kalendervisning
- [x] Kobling vers → manuskripter: Manuskripter-tab i vers-popup viser relaterte manuskripter
- [x] Kobling manuskript → vers: klikk på versreferanse → inline verstekst eller hopp til bibeltekst
- [x] Markdown-editor med toolbar (bold, italic, heading, list, quote, link, versreferanse)
- [x] Live preview (side-by-side desktop, toggle mobil)
- [x] Vers-innsettingsdialog med søk og forhåndsvisning (referanse eller sitat-modus)
- [x] Søk i andre manuskripter fra editoren (sidepanel med innliming/lenking)
- [x] Krysslenking mellom manuskripter (`[manuskript:slug]`)
- [x] Auto-complete for `[vers:` mens man skriver (bokliste dropdown)
- [x] Tags/emner med auto-suggest fra eksisterende tags
- [x] Relaterte manuskripter (scorer på delte vers, tags, type)
- [x] Kalendervisning med månedsnavigasjon og manuskript-markører
- [x] Lesemodus (global readingMode) skjuler detaljer, viser kun innhold
- [x] Lagring i IndexedDB (med localStorage fallback)
- [x] Ruter: `/manuskripter`, `/manuskripter/ny`, `/manuskripter/:slug`, `/manuskripter/:slug/rediger`
- [x] Dark mode og responsivt design
- [x] Unsaved changes warning

### Gjenstår (fremtidig)
- [ ] Sitat-del: Samle og organisere bibelsitater til bruk i manuskripter
- [ ] Synkronisering desktop → iPad/mobil (krever brukerkonto, Fase 9)
- [ ] Offline-støtte med sync
- [ ] Eksport/import av manuskripter

## Desktop-app (Electron)

Pakke appen som standalone desktop-app for macOS, Windows og Linux.

### Hvorfor Electron
- Eksisterende arkitektur (Vite/React SPA + Express API + SQLite) passer nesten 1:1
- Express-serveren kan kjøre direkte i Electron sin main process
- better-sqlite3 fungerer i Electron (med `electron-rebuild`)
- React SPA lastes i BrowserWindow
- IndexedDB/localStorage fungerer uendret (Chromium under panseret)

### Minimalt oppsett
- [ ] Installer `electron` + `electron-builder`
- [ ] Lag `electron/main.ts`:
  - Start Express-serveren (embed `api/server.ts`)
  - Åpne `BrowserWindow` som peker på Express-serveren
  - Bundle `data/bible.db` med appen
- [ ] `electron-rebuild` for å rekompilere `better-sqlite3` mot Electron sin Node-versjon
- [ ] Konfigurer `electron-builder` for macOS (.dmg), Windows (.exe/.msi), Linux (.AppImage/.deb)

### Tilpasninger
- [ ] DB-path: Endre fra `process.cwd()` til `process.resourcesPath` (for bundlet DB) og `app.getPath('userData')` (for bruker-DB)
- [ ] Port-håndtering: Start Express på tilfeldig ledig port, eller bruk Electron sin `protocol.handle()` for å kjøre uten HTTP
- [ ] Native menylinje for Mac/Windows/Linux
- [ ] Auto-oppdatering via `electron-updater`

### Brukerdata
- IndexedDB + localStorage fungerer uten endring i Electron
- Data lagres i Electron sin Chromium-profil (`~/Library/Application Support/Bibel/` på Mac)
- Valgfritt: Flytte brukerdata til SQLite (users.db) for enklere backup/eksport og fremtidig synkronisering

### Ting som fungerer uten endring
- All frontend-kode (React, SCSS, routing)
- All API-kode (Express routes)
- SQLite-database (better-sqlite3)
- Brukerdata (IndexedDB/localStorage via `src/lib/offline/userData.ts`)

## Lokal LLM-generering (Qwen 3.5 122B)

Følgende oppgaver kan kjøres med en lokal LLM. Prioritert etter brukerverdi.

### Høy prioritet
| Oppgave | Status | Omfang | Kommentar |
|---------|--------|--------|-----------|
| Kryssreferanser | ⚠️ 1/3 ferdig | Bøker 2-39, 43-66 | Mest synlig for brukerne, mangler for 2/3 av Bibelen |
| Temaer | ❌ 1 fil | Alle temaer | Stor verdi for studiebibel-opplevelsen |
| Spørsmål til refleksjon | ❌ Ikke startet | Per kapittel | Enkelt å generere, nyttig for bibelstudiegrupper |
| Stedsoversikt | ❌ Ikke startet | Engangsjobb | Kan kobles til fremtidig kartfunksjon |

### Medium prioritet
| Oppgave | Status | Omfang | Kommentar |
|---------|--------|--------|-----------|
| Bønn basert på vers | ❌ 4 filer | Per kapittel | Inspirert av kapittelteksten |
| Andakt/preken per vers | ❌ 5 filer | Per kapittel | Korte andakter |
| Typologi GT→NT | ❌ Ikke startet | Engangsjobb | Forbilder i GT som peker mot NT |
| Symboler og billedspråk | ❌ Ikke startet | Engangsjobb | Forklaring av bibelsk symbolikk |

### Lavere prioritet
| Oppgave | Status | Omfang | Kommentar |
|---------|--------|--------|-----------|
| Applikasjoner for dagliglivet | ❌ Ikke startet | Per kapittel | Praktiske anvendelser |
| Bibelsk ordbok | ❌ Ikke startet | Engangsjobb | Leksikonartikler |
| Ordhistorie/etymologi | ❌ Ikke startet | Per ord | Hebraiske/greske ordstammer |
| Word4word norsk (GT) | ⚠️ Delvis | Fleste GT-bøker | Oversette ord-for-ord fra hebraisk |
| Semantiske felt | ❌ Ikke startet | Per ord | Relaterte ord/synonymer |

### Engelske tidsepoke-tagger på personsiden
Noen person-epoker er på engelsk (conquest, creation, divided-kingdom, early-church, jesus, united-kingdom) mens andre er norske. Kan fikses med LLM-kjøring over person-dataene.

## Bugs/Forbedringer
- [ ] Tidslinjen i lesemodus: kompaktere design, kollapsbare perioder, evt. 2-kolonners layout
- [ ] Tidslinjen generelt: vurder kompaktere event-kort, bok-kolonne bak toggle
