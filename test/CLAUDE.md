# Testene i bibel

<!-- Flyttet ordrett fra rotas CLAUDE.md (#164). Lastes når en økt jobber i test/. -->

## Testene — fire nivåer og hva hvert av dem faktisk fanger

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
4. **Layout i en EKTE nettleser** — `mobile-layout.test.ts`. De tre over kan ikke
   se bredde: SSR-HTML har ingen layout, og happy-dom returnerer nuller fra
   `getBoundingClientRect()`. Kjører hele `PAGES` i headless Chrome og krever at
   ingen side er bredere enn skjermen. Krever Chrome installert (`CHROME_BIN`
   overstyrer); den HOPPER IKKE stille over seg selv om den mangler.

`PAGES` bor i `test/pages.ts` og deles av nivå 2 og 4 — én oppføring gir en ny
side dekning under begge sveipene.

### Sandkassen er den ene grunnen til å starte Chrome på nytt (#85)

De tre filene som måler i ekte Chrome — `mobile-layout`, `reading-width`,
`key-event-promise` — feilet ALLE i en ubetjent agentkjøring, med
`CDP-tidsavbrudd: Page.enable` etter 30 s. Chrome starter, DevTools-endepunktet
svarer, `Target.createTarget` og `Target.attachToTarget` gir svar — men
rendrerprosessen kommer aldri opp, fordi Chromes EGEN sandkasse ikke får starte
under den profilen (`sandbox initialization failed: Operation not permitted`).
`bun run test` var dermed rødt (818 pass, 3 fail) uansett hva branchen endret,
og det er merge-porten: en fiks som ellers er grønn blir ikke merget.

- **Porten må skille «layouten er brutt» fra «nettleseren fikk ikke starte».**
  Begge var rødt, og et menneske måtte lese stacktracen for å vite hvilket.
- **`test/chrome-cdp.ts` leser stderr HELE veien**, ikke bare til
  DevTools-adressen. Linja om sandkassen står FØR adressen, i den samme
  strømmen — den gamle lesingen slapp taket ett hakk for tidlig og kastet det
  eneste sporet som forklarte tidsavbruddet.
- **Den spør etter en RENDRER før den lover en nettleser.** Helsesjekken er de
  samme tre kallene `open()` gjør, med en kort frist (10 s), så en rendrer som
  blir borte uten å si hvorfor ikke blir et nytt 30-sekunders tidsavbrudd.
- **Bare sandkassen gir et nytt forsøk.** `launchWithSandboxFallback` prøver med
  sandkasse, og på nytt med `--no-sandbox` KUN når stderr meldte at den ikke lot
  seg starte. Alt annet — Chrome som ikke finnes, en WebSocket som ikke kobler,
  et tidsavbrudd med en annen årsak — bæres videre uendret. **Ser du
  «CDP-tidsavbrudd» nå, er det ikke sandkassen: den navngir seg selv.**
- **Avveiningen er tatt, ikke ramlet ut av et flagg.** Å slå av sandkassen for en
  LESER er noe helt annet: denne nettleseren starter på `about:blank`, laster
  bare våre egne bytes fra en localhost-server vi selv startet, kjører bare
  uttrykk vi selv skriver, og lever i sekunder i en testprosess. Fiendtlig
  innhold fra nettet — det sandkassen verner mot — finnes ikke her. Den sier det
  høyt hver gang den måler uten (`SANDBOX_WARNING`, og `chrome.sandboxDisabled`).
- **Regelen er formulert på INITIALISERINGEN, ikke på ordet «sandbox».** Chrome
  advarer selv mot flagget vi nettopp satte («unsupported command-line flag:
  --no-sandbox»); kjente vi den igjen som en feil, ville forsøk nummer to blitt
  meldt mislykket mens alt virket.
- **Vakta er `test/chrome-sandbox.test.ts`, og den består BEGGE steder** — hjemme
  der sandkassen starter, og ubetjent der den ikke gjør det. Fire halvdeler:
  REGELEN (linja kjennes igjen, og bare den — målt på ordrett stderr fra begge
  oppstartene), ORKESTRERINGEN (fire utfall, der «en annen feil» er en ekte feil
  uten nytt forsøk), FLATA (en ekte Chrome MÅLER, og sier fra om den måler uten
  sandkassen) og INGEN STILLE SKIP. Seks mutasjoner kjørt.
- **Å la vaktene hoppe over seg selv er IKKE svaret**, og det er den siste
  halvdelens jobb å hindre: da står #50, #55, #70, #73 og #78 uten port, og
  suiten melder grønt for en layout ingen har målt.

**Velg sider etter KOMPONENT, ikke etter URL.** 1 Mos 1 har ingen personer, så
studieblokka for personer rendres ikke der — en uprefikset lenke i den blokka slapp
gjennom kontrakten helt til mutasjonstesting avslørte det. Derfor ligger `/1mos/12`
(personer + profetier) og `/matt/1` (evangelieparalleller) også i matrisen.

**Verifiser nye vakter ved å gjeninnføre feilen de skal fange.** En test som ikke blir
rød av mutasjonen er verdiløs. Alle fire vaktene her er sjekket slik, og det
gjelder også fiksene: da #50 ble rettet, ble hver enkelt CSS-endring satt
tilbake for seg og vakta skulle bli rød. Én av dem ble det IKKE — en regel som
skjulte det lukkede menypanelet — og den ble derfor fjernet framfor å bli
stående som udokumentert pynt ingen test holder i live.

**En DB-test må hente poolen PER KALL, aldri på modulnivå.** `const sql =
getSql()` øverst i en testfil tar vare på instansen som fantes ved import;
`closeSql()` i en HELT ANNEN testfil nuller den ut, og den første fila feiler da
med «Connection closed» — i to filer som ikke har med saken å gjøre. Bruk
`getSql()` inne i hver test/hook, og la de filene som allerede lukker, lukke.

**En test som starter et EGET PROGRAM må DEKODE stien til repoet.**
`new URL('..', import.meta.url).pathname` er prosentkodet — samme
representasjonsfelle som #80, én etasje ned. Arbeidstrærne bor under
`.flogvit-orkester/trær/`, så cwd-en blir `tr%C3%A6r`, som ikke finnes, og
`Bun.spawn` melder da **ENOENT på «bun»** framfor på katalogen som mangler.
Utslaget er merge-porten: begge CLI-vaktene feilet komplett i ethvert
arbeidstre uansett hva branchen endret (som #85). Bruk `Bun.fileURLToPath()`.

**En DB-testfil oppgir taket sitt selv: `setDefaultTimeout(DB_TEST_TIMEOUT_MS)`
(#74).** Buns standard er 5000 ms, og det tallet er valgt for en test som enten
svarer med en gang eller henger — ikke for en hook som migrerer skjemaet.
`ensureSchema()` er 33 CREATE TABLE + hele `runMigrations()`: målt 2,4 s på en
tom maskin og 14 s på en travel. Utslaget er ikke en rød test, men at HELE FILEN
forsvinner — ryker `beforeAll`, kjøres ingen av testene, og suiten melder et
lavere totaltall som ser grønt ut (799 mot 822 i saken). Én konstant i
`test/db-timeout.ts`, og linja gjelder både hooks og tester i filen, så en tung
sveip inne i en `test()` arver samme tak. **Ikke skriv et eget tall ved siden
av** — det setter taket ned igjen uten at noen ser det. Vakta er
`test/db-test-timeout.test.ts`, og den er formulert på hva filen NÅR: enhver
testfil som transitivt importerer `src/lib/db.ts` må bære linja, og en fil som
ikke gjør det må la være (ellers ville «sett den overalt» bestått, og de rene
logikktestene mistet 5 s-taket sitt i stillhet). Fire mutasjoner kjørt.

**En testfil som skrur ned LASTVERNET setter det tilbake:
`afterAll(resetPageCache);` på toppnivå (#72).** `bun test` kjører alle filene i
SAMME prosess, og knappene, cachen, semaforen og versjonsleseren i
`page-cache.ts` er modulnivå-tilstand. `page-cache.test.ts` satte taket til ETT
render-spor og 30 ms køtid for å måle lastavvisning, og satte det aldri tilbake
— så alt som kjørte etterpå målte mot en app vi ikke ruller ut. Utslaget er
STILLE og det er poenget: en sveip som henter sidene én om gangen holder seg
innenfor det ene sporet og består, mens fire samtidige hentinger gir tre
503-er. En vakt som da måler 503-siden i stedet for sida, består også — og
måler ingenting. Målt: fire samtidige hentinger etter `page-cache.test.ts` ga
`[503, 200, 503, 503]`.

- **`resetPageCache()` er ett kall for hele tilstanden.**
  `configurePageCache({})` satte bare KNAPPENE tilbake; semaforen var det
  ingenting som kunne nullstille. En render som aldri ble ferdig — en test som
  røk på taket, en port som aldri ble åpnet — holdt plassen sin ut prosessen,
  og kapasiteten var da lavere enn den som sto i konfigurasjonen.
  `releaseRenderSlot()` har et gulv på null, ellers ville en render som
  fullførte ETTER nullstillingen tatt telleren negativ og hevet taket permanent
  — den motsatte feilen, like stille.
- **Linja skal stå på TOPPNIVÅ**, ikke inne i describen som skrudde. Da fyrer
  den etter siste describe, uansett hva noen legger til nederst i fila.
- **Vakta er `test/page-cache-reset.test.ts`, og den har to halvdeler.**
  STRUKTUREN er formulert på hva filen GJØR — kaller den `configurePageCache(`,
  må den bære linja, og en fil som ikke rører lastvernet må la være (ellers
  ville «sett linja overalt» bestått). RESETTEN måler at linja virker: at et tak
  satt for en måling ikke gjelder etterpå, at en forlatt render ikke holder
  plassen, og at en sen release ikke hever taket. Kapasiteten leses fra
  `PAGE_CACHE_DEFAULTS` framfor å skrives av. Fem mutasjoner kjørt.

**Grense:** happy-dom lar seg ikke patche der `plus.js` overstyrer
`localStorage.setItem`, så den stille skrivesperren for gratisbrukere må verifiseres i
en ekte nettleser. Den brukersynlige porten (klikk registrerer ingenting) er dekket.

## Tilgjengelighet — erklæringen og WCAG 2.1 AA-porten (#163)

`/<lang>/tilgjengelighet` er FLOGVITs felles erklæring (kontrakten:
`portal/TILGJENGELIGHET.md`). To filer er KOPIER av portalen, byte for byte —
rediger dem aldri her: `src/lib/tilgjengelighet.ts` (siden, strengene,
`kontroller()`) og `test/tilgjengelighet-sjekk.ts` (axe-core, fokus).
Endres de i portalen: `bun tilgjengelighetkopi.ts --skriv` i meta-repoet.
Bibels egne DATA står i `src/lib/tilgjengelighet-erklaering.ts`.

**Porten:** `bun test test/tilgjengelighet.test.ts` (inngår i `bun test`).
Den kjører axe (WCAG 2.0/2.1 A+AA), synlig fokus og `lang` på hebraisk/gresk
i ekte Chrome, lys og mørk, utlogget og innlogget med Plus — matrisen står
øverst i fila. Én nettleser, to faner. Rød betyr én av tre ting:

1. **Et nytt brudd** — feilmeldingen sier side, regel og element. Rett det.
   Kan det ikke rettes nå: eget issue merket `dux`, før det opp i `brudd` i
   datafila (kriterium + tekst på en og nb), og ta akkurat den siden/regelen ut
   av sjekken med en kommentar som peker på saken. Ingen unntaksliste.
2. **«sist testet …, N dager siden»** — den årlige gjennomgangen. Gå gjennom
   sidene med bare tastatur (Tab, Shift+Tab, Enter, Esc), 200 % zoom og 150 %
   tekst på 320/390 px, rett det som er galt, og sett `testet` og `oppdatert`
   til dagens dato. Deploy.
3. **«kunne ikke måles»** — nettleseren svarte ikke (to forsøk). Det er
   maskinen, ikke siden: kjør på nytt når lasten er nede.

Ny sidetype ⇒ legg den i `test/pages.ts` (eller `SIDETYPER` i testen), og
oppdater `omfang` i datafila. Temaet settes med `fv-prefs`-cookien FØR lasting:
å bytte `data-fv-theme` etterpå målte farger midt i en `transition`.
Kjente brudd nå: 3.1.2 for hebraiske/greske ord inne i forklarende prosa
(#166) — derfor teller lang-sjekken bare tekstnoder uten latinske bokstaver.
Footer-lenka står i den FASTE raden, med fellesdelens `lenketekst()`;
kommandopalettens `foot.a11y` holdes lik den av testen.
