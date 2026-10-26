---
name: i18n-vakter
description: De fire norsk-vaktene, boknavn på åtte språk (#69), feiltekster i API-et (#71) og brødsmuler som må gå gjennom ordboka (#63). Les før du endrer book-names.ts, bookName-hjelperne, reference-parser, ordbøkene eller page-contract sine språkvakter.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

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
