---
name: db-avbrudd
description: Retry-budsjettet per forespørsel (#107), 503 framfor 500 ved DB-avbrudd (#108) og ruter som fanger sitt eget kast, ensureBooks (#109, #123). Les før du endrer db.ts, error-handler.ts, app.onError, routes/api/util.ts eller bok-cachen.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

## Å VENTE PÅ DATABASEN er forespørselens budsjett, ikke spørringens (#107)

`db.ts` gjentar lesninger når forbindelsen er borte, så en DB-restart (målt 12 s
og 28 s, Cost Optimized-tieren har ingen SLA) gir en treg side framfor en
feilside. Blokka lover et TAK — «brukeren venter litt» — og taket fantes ikke:
deadlinen ble regnet ut på nytt inne i hvert eneste `sql`-kall, og en side gjør
mange. `/personer/:id` slår opp far, mor, ektefelle, hvert søsken, hvert barn og
hver relatert person — ett kall hver, i tur — så taket for den siden var ANTALL
SPØRRINGER × 25 s. Med tjue oppslag er det over åtte minutter, og Caddy har
ingen response-timeout som stopper det.

- **Beviset er de to sidene som brukte like lang tid og endte ulikt.** Målt
  2026-08-30T20:01:22–20:02:16Z, da nye forbindelser timet ut på 2 s:
  `/sv/historier/…` brukte 24,67 s og ble **500**, altså én spørring som spiste
  hele budsjettet og kastet. `/en/historier/daniel-i-lovehulen` brukte 24,8 s og
  ble **200** — og det kan ikke være samme form, for et budsjett som løper ut,
  kaster. Det er flere spørringer som hver brukte sin del av hvert sitt budsjett.
- **Prisen er ikke bare den ene leserens tid.** Den som venter holder en
  render-plass i semaforen hele veien (#19), så en blipp som rammer noen få
  forespørsler kan stanse flata for alle — nettopp «sto i ~55 s». Det er samme
  avveining #19 alt har tatt: raske nei til noen få slår trege svar til alle.
- **`withRetryBudget(fn)` er scopet**, montert ytterst i `app.ts` og bygget på
  `AsyncLocalStorage` framfor honos `contextStorage()`: `db.ts` skal ikke kjenne
  rammeverket. UTENFOR et scope — altså i `init-db.ts` og `import-bible.ts` —
  får hvert kall sitt eget budsjett som før; en import som rir av en restart
  skal ikke gi opp fordi forrige spørring brukte tid.
- **Mikrocachens versjonssjekk får sitt EGET budsjett, på null.** Den kjører
  inne i forespørselen, og ville ellers brukt opp leserens budsjett før siden
  begynte å rendre — altså byttet «treg side» mot «feilside» for den ene
  forespørselen i hvert 30-sekundersvindu som gjør sjekken. Null er ikke en
  nedprioritering; det er hva `page-cache.ts` alt sier om nettopp den
  spørringen: «DB nede: behold cachen. Den er det eneste som fortsatt kan
  svare.» Da er det ingenting å vente på.
- **`DB_RETRY_BUDGET_MS` leses PER KALL**, ikke én gang ved import — samme grunn
  som `PAGE_CACHE_MAX_BYTES` (#105): tallet skal kunne endres uten en deploy, og
  en vakt skal kunne måle regelen uten å vente 25 s.
- **Vakta er `test/db-retry-budget.test.ts`**, og den måler mot en «pool» som
  bare er svaret sitt — regelen skal kunne måles uten en database som er nede.
  Fem halvdeler: BUDSJETTET (flere spørringer i én forespørsel deler ett),
  DELINGEN (er det brukt opp, får neste nei MED EN GANG — ellers ville
  «budsjett/N per spørring» bestått), RETRYEN (den lever fortsatt, ellers er
  DB-restarten fra 2026-07-28 tilbake), SKRIPTENE (utenfor en forespørsel har
  hvert kall sitt eget) og VERSJONSSJEKKEN (eget budsjett, og `index.ts` bruker
  det faktisk — sømmen leses, siden `index.ts` starter en server ved import).
  RUTA måler at hver forespørsel virkelig kjøres inne i et budsjett, gjennom den
  injiserte versjonsleseren. Fem mutasjoner kjørt.
- **Ikke gjort, med vilje:** `DB_CONNECT_TIMEOUT` (2 s) er urørt. Saken lot det
  stå åpent om det var poolen vår eller en blipp som bare rammet NYE
  forbindelser, og det spørsmålet kan bare avgjøres med en måling i prod — å
  flytte tallet herfra ville vært et gjett. Det er allerede env-styrt, så det
  krever ingen deploy den dagen målingen finnes.

### Et avbrudd som VARER lenger enn budsjettet er 503, ikke 500 (#108)

Budsjettet over er et TAK, og et tak har en andre side: varer avbruddet lenger,
kaster `db.ts`. Appen hadde ingen `app.onError`, så kastet ble Honos standardsvar
— en naken **500**. Målt 2026-08-31T01:45:37–01:45:47Z fikk to bingbot-hentinger
og én SemrushBot nettopp det, etter 22,0 / 25,7 / 22,6 sekunder:
`/en/1kr%C3%B8n/1`, `/en/historier/daniel-i-lovehulen`, `/es/historier/babels-tarn`.
Samme blipp traff konto, hides og fuglefestival; bibel-hono var den eneste som
ga 5xx til en klient. Restansen fra #95, og samme mangel som felte puzzles
(`flogvit-com-puzzles#59`) og lab (`flogvit-com-lab#14`).

- **Statuskoden er hele utfallet.** Sida er ikke i stykker — basen var borte et
  halvminutt, som er forventet drift på en delt node uten SLA. 500 sier «denne
  adressen er i stykker», og gjentatte 500-er tar den ut av indeksen; 503 +
  `Retry-After` er den dokumenterte måten å si «midlertidig». Lastvernet i
  `page-cache.ts` svarer allerede nettopp det under overlast, med samme
  sekundtall (30) — det er samme beskjed, og den veien fantes. Den var bare ikke
  koblet til DB-avbruddet.
- **Ikke alt blir 503, og det er hele skillet.** En spørring mot en tabell som
  ikke finnes er en defekt hos OSS og skal stå som 500. «503 på alt» ville
  gjemt hver eneste bug bak et løfte om at det går over av seg selv.
  Klassifiseringen er `isConnectionError()` fra `db.ts`, altså SAMME regel som
  avgjør om spørringen gjentas i det hele tatt — to lister ville vært to steder
  å glemme neste feilkode.
- **Svaret er ren tekst, ikke 404-sidas HTML.** Å rendre `Layout` her ville
  kjørt chrome-komponentene på nytt i nettopp det øyeblikket noe er galt, og et
  kast INNE i `onError` gir Honos nakne 500 tilbake — altså feilen om igjen. En
  crawler leser statuskoden og `Retry-After`. API-stier svarer JSON, som
  `app.notFound()` allerede gjør, og en `HTTPException` beholder sitt eget svar:
  et bevisst 4xx fra en middleware skal ikke bli vår 500.
- **Loggen skiller de to like tydelig som svaret.** Et DB-avbrudd er drift og
  får én linje (det kommer én per forespørsel i en byge); en ekte feil er den
  ene gangen vi vil ha hele stacktracen. Uten `onError` logget Hono selv — den
  linja måtte erstattes, ikke bare fjernes.
- **Vakta er `src/lib/db-avbrudd-503.test.ts` og har to halvdeler.** REGELEN
  måler BEGGE veier (forbindelsesfeil → 503 med `Retry-After`, ekte feil → 500
  UTEN — ellers ville «503 på alt» bestått), pluss JSON på `/api/` og
  `HTTPException`. FLATA er sakens eget bevis: appen bootes mot en port ingen
  lytter på (ECONNREFUSED med en gang, framfor et tidsavbrudd som ville gjort
  vakta treg), og de tre adressene fra Caddy-loggen må svare 503. Den siste
  halvdelen krever at `/robots.txt` fortsatt svarer 200 i samme tilstand —
  ellers ville en «fiks» som svarer 503 på ALT mens basen er nede bestått, og da
  hadde vi tatt ned selve bremsen på lasten (#64). Seks mutasjoner kjørt,
  inkludert nettopp den.
- **Budsjettet leses per kall (#107), og det er derfor vakta kan måles.** Den
  setter `DB_RETRY_BUDGET_MS` lavt framfor å vente 25 sekunder.

#### En rute som fanger sitt EGET kast når aldri `app.onError` (#109)

Samme avbrudd, sett fra loggen. Containerloggen bar denne tre ganger i vinduet
2026-08-31 00:58–02:08Z — samme byge som #108, uten at noe var rullet ut:

```
code: "ERR_MYSQL_CONNECTION_TIMEOUT"
  at wrapError (internal:sql/mysql:14:10)
  at #onClose (internal:sql/mysql:192:22)
```

- **Formen er MÅLT, ikke gjettet.** Den oppstår i det øyeblikket
  feilOBJEKTET fra Bun rekkes til `console.error` — reprodusert med en base som
  ikke svarer, mot en app uten `app.onError` (altså taggen som sto i prod,
  `20260830-235034-091af4e`, som ligger ÉN commit foran #108-fiksen). De tre
  dumpene er de tre 500-ene i #108.
- **#108 lukket bare halve klassen.** Sidene lar kastet gå til `app.onError`,
  men **hver eneste rute under `/api/` fanger sitt eget** (`try { … } catch
  (error) { console.error('Error fetching X:', error) }`) og når derfor aldri
  dit. Signaturen lever videre der, fra ~55 kallsteder ingen liste kan holde
  styr på. `loggFeil()` i `error-handler.ts` er regelen ETT sted, og den er
  `feilsvar` sin: drift får én linje, en ekte feil beholder hele stacktracen.
  `feilsvar` kaller nå den samme funksjonen framfor å ha sin egen kopi.
- **Loggen alene ville vært å skru ned lyden på en alarm.** `initBooks()`
  kjøres ÉN gang ved oppstart og prøves aldri igjen, så en container som bootet
  mens basen var borte sto med tom bok-cache ut sin levetid. `requireBooks()`
  kaster «initBooks() er ikke kjørt», som IKKE er en forbindelsesfeil — altså
  **naken 500 i det uendelige** på `/personer/*`, `/historier/*`, `/statistikk`
  og hele `/api/books`, mens basen forlengst var frisk. Ingen 503, ingen
  `Retry-After`, ingen loggrad etter den ene ved oppstart. Målt, ikke antatt.
- **`ensureBooks()` laster på nytt fra en middleware**, altså inne i
  forespørselens retry-budsjett (#107): en blipp rides av, et lengre avbrudd
  blir 503 (#108), og svaret kommer i det øyeblikket basen er tilbake — uten en
  restart. Alle som venter deler ÉN lasting, og en lasting som FEILET nulles,
  ellers er permanensen bare flyttet inn i hjelperen.
- **Montert på sidene og på `/api/`, ikke på `*`.** `/robots.txt`, sitemapene,
  delekortene og `public/` slår ikke opp en bok, og en brems bak sin egen port
  er ingen brems (#64). Mutasjonstestet nettopp slik.
- **Vakta er `test/db-avbrudd-logg.test.ts` med fire halvdeler.** REGELEN
  (begge veier: drift uten feilobjektet, en defekt MED — ellers ville «logg
  aldri objektet» bestått og hver bug hos oss blitt sporløs). SVEIPEN (hele
  /api-RUTETABELLEN med basen nede, så en ny rute med et rått
  `console.error(…, err)` blir rød uten at noen fører den opp; bok-cachen
  lastes FØRST, ellers stopper middlewaren forespørselen før ruta kjører og
  sveipen måler seg selv). OPPSTARTEN (et EGET PROGRAM: bok-cachen er
  modulnivå-tilstand, og signaturen skrives til EKTE stderr — 503 under
  avbruddet, 200 etterpå, robots.txt urørt). SØMMEN (`index.ts` starter en
  server ved import og leses derfor fra kilden). Åtte mutasjoner kjørt.
- **Statuskoden på API-flata er tatt i #123.** Rutene fanget kastet og svarte
  sin egen 500, så et avbrudd ble «varig feil» på 33 av 55 `/api`-ruter.
  `internFeil()` i `routes/api/util.ts` er nå det ENE svaret en rute gir på sitt
  eget kast, med `feilsvar` sin regel: forbindelsesfeil → 503 +
  `Retry-After`, alt annet → 500. En rute med egen feilkropp (`/api/version`,
  `/api/sync`) sender den som `kropp` framfor å skrive sin egen `c.json(…, 500)`.
  Vakta er `test/api-db-avbrudd.test.ts`: REGELEN begge veier, og en SVEIP over
  hele /api-rutetabellen med basen nede der ingen rute får svare 500.
