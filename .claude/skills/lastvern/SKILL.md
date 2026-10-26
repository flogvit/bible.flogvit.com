---
name: lastvern
description: Lastvernet i page-cache.ts: køen (#19), crawl-delay per aktør (#86, #150), per-avsender-taket (#126), hva som står utenfor semaforen (#64, #95, #96) og query-URL-er som handlinger (#60). Les før du endrer page-cache.ts, robots.txt/seo.ts, static-cache.ts eller rel/nofollow-lenker, eller når vakta melder 503-byger.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

### En URL med QUERY er en handling, ikke en side (#60)

12 × 503 på én time. Ikke nedetid — lastvernet under gjorde jobben sin. Det som
dyttet semaforen over kanten var vår EGEN HTML: hver kapittelside lenket to
sider per vers uten `rel="nofollow"`, `/bidra?vers=sal-94-1` og
`/manuskripter/ny?vers=sal-94-1`. 31 167 vers × 2 familier × 8 språkprefikser =
**498 672 crawlbare URL-er mot 1 189 kapittelsider** — en flate ~420 ganger
større enn innholdet, der ingen av adressene ER innhold. Hver er unik, altså
cache-miss, altså en render-plass. GPTBot sto for 68 % av all trafikk i vinduet,
72 % av den mot `/bidra?vers=`, på 1,7 req/s — permanent rett under de 1,8 req/s
#19 slo fast at velter siden. Googlebot fikk 6,7 s på `/en/2kor/11`.

- **Regelen er lenken, ikke lenkefamilien.** `relFor(path)` (`lib/crawl.ts`)
  tar hele STIEN og gir `nofollow` når den bærer query. Da avgjør stien selv, og
  en bryter som peker query-løst når valget er default («skru av undertekst» →
  `/sal/94`) blir fortsatt fulgt — det er den kanoniske adressen. `Breadcrumbs`
  kaller den selv framfor å ta imot et prop, så en ny smule arver regelen.
- **`nofollow` og `robots.txt` er to forskjellige jobber.** `nofollow` stopper
  OPPDAGELSE; robots stopper HENTING av det crawleren allerede kjenner — og
  GPTBot hadde et halvt million adresser fra før. Begge trengs.
- **Forby QUERYEN, ikke stien.** `Disallow: /*?vers=` treffer alle åtte
  prefiksene i én linje. Sti-varianten har to feller, begge mutasjonstestet:
  `Disallow: /bidra` er et rent no-op (prefiksmatch, og alle ekte adresser er
  prefikset), mens `Disallow: /*bidra` treffer — og tar `/bidra` selv med seg,
  en side som STÅR i sitemapen. Samme for `/*manuskripter/ny`, som ville stengt
  `/manuskripter/nytt-liv-a1b2c3` ute av den åpne katalogen (#15).
- **`?q=` er bevisst UTELATT fra robots.** Søkesiden skal deindekseres, og der
  er `noindex` direktivet (#41) — et robots-forbud ville hindret crawleren i å
  SE det. Lenkene dit er `nofollow`, så nye søke-URL-er oppdages ikke uansett.
- **Visningsvalgene teller også.** `?bible=`/`?secondary=`/`?mapping=` lenker
  kapittelet til seg selv, og prev/neste bærer valget videre: uten merking går
  crawleren hele Bibelen på nytt per kombinasjon, i den DYRESTE renderen vi har.
- **`noindex` på `/bidra?…`, ikke på `/bidra`.** Betingelsen er queryen, ikke
  den enkelte parameteren, så en ny måte å åpne siden på arver regelen.
  Canonical peker query-løst av seg selv (`Layout` bruker `path`), men canonical
  er et hint — `noindex` er direktivet. Manuskript-editoren er `noindex` uansett:
  en tom skriveflate bak innlogging er aldri svaret på et søk.
- **`public/robots.txt` er SLETTET.** `seoRoutes` monteres før `serveStatic`, så
  ruta har vunnet hele tiden; to kilder til samme sannhet er fella fra #42.

**Vakta er todelt.** Sidekontrakten (invariant 6 og 7) gjelder HVER side i
`PAGES`: en intern lenke med query må bære `nofollow`, og robots.txt må avvise
den. Formulert på lenken, så en ny handlingslenke fanges uten at noen fører den
opp. `crawl-surface.test.ts` holder på det målte tilfellet (Sal 94, også rendret
MED query så prev/neste-fella fanges) og på det sveipen ikke kan se: **ingen URL
i sitemapene er forbudt av vår egen robots.txt.** `test/robots.ts` er en ekte
RFC 9309-matcher (`*`, `$`, lengste treff vinner) — en vakt som bare lette etter
en STRENG ville bestått på en regel som ser riktig ut uten å treffe.

**Ikke gjort, med vilje:** ingen Caddy-blokk av GPTBot. Den er en beslutning om
en navngitt tredjepart og hører hos Vegard — og punkt over løser årsaken framfor
symptomet: flata var for stor for Googlebot også.

### Men taket alene ga ikke raske 503-er — det gjorde KØEN (#19)

Med taket nede på 6 i prod ble episoden 2026-08-05 målt på nytt: bare **2**
forespørsler fikk 503, altså det taket ble bedt om. Men **12 fikk 3–9 sekunder**,
og begge 503-ene kom etter nøyaktig **3,003 s** — som er `RENDER_QUEUE_WAIT_MS`.
«Raske 503-er til noen få» var hele poenget, og det var ikke det som skjedde. Å
senke taket videre flytter grensen, det fjerner den ikke: mekanismen sitter i
køen bak semaforen, ikke i tallet foran den.

- **Køen er like lang som taket** (`RENDER_QUEUE_MAX`, default =
  `RENDER_MAX_CONCURRENT`). Uten en lengde er den et løfte vi ikke kan holde:
  over taket VET vi med en gang at vi ikke kan betjene alle, og brukte likevel
  opp hele fristen før vi sa nei. Er køen full, svarer forespørselen straks —
  stale om vi har en utløpt kopi, ellers 503. Verst var nettopp stale-veien: en
  kopi vi hadde liggende i minnet ble holdt tilbake i tre sekunder mens leseren
  ventet på å få høre at vi var opptatt.
- **Lengden er ikke et nytt gjettet tall.** Står du bakerst i en kø som er
  lengre enn taket, rekker du uansett ikke fram innen fristen når rendrene er
  trege — da er plassen i køen bare ventetid med et nei i enden. Senkes taket,
  følger køen med.
- **Plassen går til den FERSKESTE, ikke til den som har ventet lengst.** FIFO ga
  den ledige plassen til den som var nærmest å gi opp, og la dermed køtiden oppå
  rendertiden for alle — det er den formen de 12 svarene på 3–9 s har. Antallet
  vi rekker å betjene er det samme uansett rekkefølge; det er fordelingen av
  ventetid som endres, og under overlast er det den som er problemet. Er det
  ikke overlast, er køen tom eller én lang, og de to rekkefølgene er samme sak.
- **Vakta er `test/render-queue.test.ts`, formulert på TIDEN og på HVEM som blir
  betjent** — ikke på tallene i konfigurasjonen, så en fiks som løser det på en
  annen måte består like gjerne. Fire halvdeler: et nei kommer straks framfor
  etter fristen, en stale kopi vi HAR holdes ikke tilbake, køen slipper fortsatt
  til når en plass blir ledig (ellers ville «avvis alt» bestått de to første), og
  den ferskeste får plassen. Fire mutasjoner kjørt (ubegrenset kø, `shift()`
  framfor `pop()`, ingen kø i det hele tatt, kølengde løsrevet fra taket).
- **Ikke gjort:** `RENDER_QUEUE_WAIT_MS` er urørt. Med en begrenset kø er den et
  tak på hvor lenge noen kan vente forgjeves, ikke lenger prisen alle betaler —
  og å flytte den uten en ny måling ville vært et gjett.

**TTL-en er en time, med invalidering på innholdsversjon.** Innholdet endres bare
ved import, og en crawler går gjennom samme URL flere ganger i timen (5289
forespørsler over 1068 unike stier i hendelsen). Cachen leser `db_meta.sync_version`
med jevne mellomrom gjennom en INJISERT leser (`setContentVersionReader`, satt i
`index.ts`, ikke i `createApp()` — cachen skal kunne testes uten DB) og tømmer seg
selv når versjonen endres. Feiler spørringen, BEHOLDES cachen: den er det eneste
som fortsatt kan svare.

### En byge kommer fra ÉN aktør — og den kan være nåbar (#86)

60 × 503 i vaktvinduet 2026-08-07, og **alle 60 lå innenfor 32,7 sekunder** av
11,4 timer. Det er ikke et utfall, det er én byge, og hver avvisning tok
nøyaktig 3,00 s (= `RENDER_QUEUE_WAIT_MS`) — lastvernet gjorde altså jobben
sin. PerplexityBot sto for 92 av 117 ankomster i bygen og 47 av de 60
avvisningene, med toppfart målt til **7 req/s** fra sju sammenhengende
adresser. Over hele vinduet er den 1,1 % av volumet: den er ikke stor, den er
rask, og med taket på 6 holder én slik aktør til å fylle semaforen alene.

- **Håndtaket er `Crawl-delay` i robots.txt, og det koster null kollateral.**
  Aktøren henter fila og gikk 0 av 204 ganger mot en `Disallow`-sti — vi hadde
  bare aldri BEDT den om noe: robots.txt hadde ingen agent-seksjon i det hele
  tatt. Det er motsatt av den udeklarerte farmen (`flogvit-com-server#12`),
  der 1 213 IP-er og roterende Chrome-UA-er gjør at ingen signatur når fram og
  eneste håndtak er et `/16`-område med uttalt kollateral. **Blokkering er
  ikke foreslått**: aktøren gjør ingenting galt, den er bare raskere enn én
  delt vCPU tåler.
- **En navngitt gruppe ERSTATTER `*` (RFC 9309 §2.2.1) — den arver
  ingenting.** Det er fella, og den er stille: en `User-agent:
  PerplexityBot`-seksjon med bare en `Crawl-delay` ville opphevet alle
  `Disallow`-ene fra #60 for nettopp den crawleren som går fortest, altså
  åpnet 498 672 adresser samtidig som fila ser mer forsiktig ut. `group()` i
  `seo.ts` gjentar derfor forbudene i hver seksjon, og `CRAWL_DELAYS` er
  kartet — en ny aktør arver forbudene gratis.
- **Tallet er en fart, ikke pynt.** `Crawl-delay: 2` = 0,5 req/s, under en
  tredel av de 1,8 req/s `#19` målte at velter siden, så de øvrige aktørene
  deler resten. Heltall: desimaler tolkes ulikt fra crawler til crawler.
- **Ikke i `*`-gruppa.** En generell brems treffer Applebot og SERanking (som
  ikke er problemet), bommer på Amazonbot og farmen (som ikke leser fila) og
  ignoreres av Googlebot uansett — `Crawl-delay` står ikke i RFC 9309 og er en
  anmodning, ikke en garanti. Håndtaket er verdt noe nettopp fordi det er rettet
  mot en aktør som beviselig leser og følger fila.
- **Neste håndtak ligger i et ANNET repo.** En UA-basert rate-limit i Caddy
  (`flogvit-com-server`, mønsteret `@metacrawl` alt bruker på
  `meta-externalagent`) er dyrere og koster synlighet i Perplexitys svar. Måles
  bygen på nytt og `bygesum sekunder` fortsatt er > 0, står det valget igjen —
  og det er Vegards, ikke vaktens.
- **Ikke lukk saken på at volumet falt.** 85 % av forespørslene kan forsvinne
  uten at ett eneste bygesekund gjør det (`flogvit-com-server#13`).
  Nullmålingen å sammenlikne mot er `bygesum 26 60 100 18 18.0 27 7`.
- **UMÅLT ER IKKE GRØNT — og det er ikke en formalitet her.** Fiksen er ute
  (deploy-tagg `20260807-070417-3eb0735`, containeren oppe 2026-08-07T07:05:15Z),
  men aktøren har ikke vært innom siden: 0 forespørsler, 0 × 503. Begge
  robots.txt-hentingene i loggvinduet (02:34:09Z og 06:34:09Z) ligger FØR
  utrullingen, så de 7 req/s er målt før vi ba den senke farten og sier
  ingenting om etterlevelse. Den henter fila hver fjerde time; første ærlige
  måling kan tidligst gjøres etter neste henting.
- **Verifiseringen må kreve at aktøren ER SETT etter utrullingen.** Feltet i
  saken (`grep PerplexityBot | grep -c '"status":503'` over hele
  `access.log`) tar feil begge veier: det leser den samme loggen som fortsatt
  bærer bygen fra FØR fiksen (svarte 47 kl. 09:06Z, uansett hvor godt fiksen
  virker), og i det øyeblikket loggen roterer forbi 05:51Z blir det **grønt av
  stillhet** — en aktør som ikke har vært innom har heller ingen 503-er. Målingen
  er derfor tidsavgrenset til utrullingen, og `sett=0` gir exit 1:

  ```sh
  ssh flogvit-vm 'docker exec server-caddy-1 sh -c "cat /var/log/caddy/access.log"' \
   | LC_ALL=C awk -v fra=1786086316 '
     /PerplexityBot/ {
       match($0,/"ts":[0-9.]+/); t=substr($0,RSTART+5,RLENGTH-5)+0
       if (t < fra) next
       sett++; if ($0 ~ /"status":503/) avvist++
     }
     END { print "sett=" sett+0, "503=" avvist+0; exit !(sett>0 && avvist==0) }'
  ```

  `fra` er utrullingen. Kommandoen krever VM-tilgang og ligger bak
  prod-grensen — den er for etterkontrollen eller for et menneske, aldri for
  smia. Er svaret `sett>0` og `503>0`, ignorerer aktøren anmodningen, og da er
  det håndtak 2 over som står igjen.
- **Vakta er `test/crawl-delay.test.ts`**, og halvdelene er formulert på hva en
  crawler FÅR LOV TIL, ikke på linjene i fila. REGELEN (ren logikk: en seksjon
  med bare `Crawl-delay` åpner det `*` stengte — halvdelen finnes for å bevise
  at matcheren ser fella). AKTØREN (bygeaktøren er navngitt, med produkt-tokenet
  slik det står i den målte User-Agent-strengen; «Perplexity» matcher ingen
  gruppe og er en stille no-op). FORBUDENE (hver navngitt seksjon stenger alt
  `*` stenger, og ingen sitemap-URL er forbudt for den — begge veier, ellers
  ville «`Disallow: /` for den ene» bestått). FARTEN (delayen finnes, er et
  heltall og gir høyst 0,5 req/s). `test/robots.ts` ble gruppebevisst i samme
  slengen: `parseRobots(txt, agent)` velger gruppe som RFC-en, `namedAgents()`
  og `crawlDelayFor()` leser resten. Åtte mutasjoner kjørt.

#### ClaudeBot er den andre aktøren i kartet (#150)

Samme klasse, målt 2026-10-22T18Z–10-23T08Z: 62 372 forespørsler fra
216.73.217.110 (`ClaudeBot/1.0`) på 14 timer, topp 3,7 req/s, og 310 av de
361 × 503 flata ga på to uker. Per-avsender-taket (#126) holdt avvisningene på
avsenderen, så ingen leser merket noe — men 503-ene sto som «5xx» overalt der
noen teller dem, og vi hadde aldri bedt aktøren om noe. Den henter robots.txt
hver time, og Anthropic dokumenterer at den respekterer `Crawl-delay`
(support.claude.com, artikkel 8896518). `CRAWL_DELAYS` fikk `ClaudeBot: 2`;
`BYGEAKTØRENE` i vakta bærer hver aktørs målte UA. Verifiseres som #86, med
`/ClaudeBot/` i awk-en og `fra` = utrullingen av #150.

### Taket ser AVSENDEREN — én adresse får ikke ta alle plassene (#126)

Fjerde gang (flogvit-com-server#255, #260, #268): én adresse, 13.140.37.198,
kapittelvis gjennom Mosebøkene med fire roterende nettleserstrenger, fylte alle
seks plassene alene. 136 × 503, 135 av dem dens egne — og alle andre som kom i
de sju bygesekundene fikk 503 også. Ingen UA-signatur, altså ingen Caddy-regel
som i #268.

- **`maxRendersPerSender`** (`RENDER_MAX_PER_SENDER`, standard halve taket = 3)
  er hvor mange plasser ÉN avsender får holde, **render og kø til sammen**. Over
  det avvises den straks (stale om vi har en kopi, ellers 503) — før den kan ta
  en plass fra noen andre. Køen teller med: en avsender som fyller køen har tatt
  plassene til de neste i det øyeblikket en blir ledig.
- **Avsenderen er HØYRE ledd i X-Forwarded-For**, altså det kanten skrev
  (`(klientip)` i Caddyfila setter headeren til TCP-motparten). Venstre ledd
  ville vært en fersk bøtte per forespørsel for den som setter headeren selv
  (#103).
- **Uten header gjelder bare det felles taket.** Å samle alle ukjente i én
  bøtte ville gjort halve taket til hele taket for trafikken vi ikke kan skille.
- **Vakta er `per-avsender-tak (#126)` i `test/page-cache.test.ts`:** N+1 fra
  samme avsender avvises STRAKS mens en annen slipper til, avsenderen tar ikke
  køplassen fra den neste, høyre ledd avgjør, plassen gis tilbake både etter
  render og etter en kø-plass som gikk ut, en avsender under taket merker
  ingenting, og standarden er under det felles taket. Tre mutasjoner kjørt
  (venstre ledd, ingen tilbakelevering ved tidsavbrudd, ingen ved release).
- **UMÅLT ER IKKE GRØNT.** Verifiseres i prod ved neste enkeltavsender-byge:
  503-ene skal stå på den avsenderen (`vakt-crawl.awk`, `bygesum`/`adresse`).

### Taket verner RENDEREN — ikke alt som passerer middlewaren (#64)

`withPageCache` er montert på `*`, så `/robots.txt` sto bak semaforen som alle
andre og fikk **503** natt til 2026-08-02: 1 av 7 hentinger, `Retry-After: 30`,
varighet nøyaktig 3,003 s (= `queueWaitMs`).

Det er selvopphevende. robots.txt er **bremsen** på lasten som utløste
avvisningen: `#60` la `Disallow: /*?vers=` der nettopp for å få crawlerne bort
fra handlingsflata, og den regelen virker bare hvis crawleren får LESE fila.
Kortvarig 5xx på robots.txt får de store til å stanse crawlingen av hele siten
en stund; vedvarende 5xx (Google: over ~30 dager) tolkes som `Disallow: /`. **Jo
hardere crawlen presser oss, desto mindre sannsynlig er det at den som presser
får se at vi ba den la være.**

- **Utslaget var større enn saken beskrev.** Målt sto også alle 50 filene i
  `public/` bak semaforen: en leser som fikk sida fra CACHEN (`x-cache: hit` —
  som ikke bruker en plass) kunne få 503 på `/styles.css` rett etterpå. Å skjære
  bort en filutlevering for å berge en SSR-render er nøyaktig baklengs.
- **Felles for dem: de kan aldri fylle cachen.** Bare `text/html` caches, så de
  KOSTER en plass og GIR ingenting tilbake — ren kostnad i akkurat det øyeblikket
  kapasiteten er knapp. Og de er billige, målt: 0,02 ms (robots.txt), 0,35 ms
  (`/styles.css`), 3,3 ms for den dyreste sitemapen (ren strengbygging, ingen DB)
  mot ~47 ms + DB for en kapittelside. Sitemapene er heller ingen crawl-flate:
  9 URL-er mot 1 189 kapittelsider (`#60`).
- **Regelen er FILNAVNET, ikke en liste over ruter.** `NOT_A_PAGE` i
  `page-cache.ts` er samme skille `app.ts` allerede bruker for å avgjøre at en
  sti med punktum ikke er en side (den 404-er framfor å bli forhandlet inn i et
  språk). En ny SEO-rute eller en ny fil i `public/` arver omgåelsen gratis —
  en `ALWAYS_THROUGH`-liste ville vært ett sted til å glemme.
- **Ingen siderute har punktum i stien**, og det er en forutsetning for regelen,
  ikke en tilfeldighet: manuskript-slugene er `[a-z0-9-]`, lesedagene er datoer,
  kapitlene er `/<bok>/<n>`. Adresserer du en ny detaljside, hold den punktumfri.
- **Det ene som følger med:** en ukjent sti MED punktum (`/foo.php`) rendrer
  404-siden utenom taket. Den koster 1,15 ms uten DB og ble uansett aldri cachet
  (status ≠ 200), altså samme regnestykke.
- **Ikke gjort:** ingen memoisering av sitemap-XML-en. 1,09 MB × 8 språk = ~8,7 MB
  permanent heap for noe som hentes en håndfull ganger i døgnet — samme avveining
  som det bevisste unntaket i `getAvailableMappings()` (`#19`).

**Vakta er `test/load-shedding.test.ts`** og har fire halvdeler. Den setter
`maxConcurrentRenders: 0` — semaforen alltid full — og spør hva som kommer
gjennom. De to første kjenner ingen sti-liste: de leser **rutetabellen**
(`seoRoutes.routes`) og **katalogen** `public/`. Den tredje krever at en ekte
side fortsatt skjæres bort, ellers ville «fjern hele lastvernet» bestått. Den
fjerde importerer `NOT_A_PAGE` og krever at ingen sti i sitemapen eller i `PAGES`
ser ut som en fil. Alle fire er mutasjonstestet, også mot den smale fiksen som
bare slipper `/robots.txt` gjennom.

#### En KATALOG under en montering er hverken fil eller side (#95)

`/js/` og `/css/` svarte **500** der de ni andre flatene svarer 404. `etagFor()`
i `static-cache.ts` stat-et `./public/js/` uten å klage — en katalog stat-er
helt fint — og kastet så EISDIR på `arrayBuffer()`, altså FORBI vernet
`if (!stat) return null`. `catch`-en dekket `stat()`, ikke lesingen, og kastet
ble ubehandlet.

- **Ingen leser møter det:** layout lenker aldri en monteringsrot, så
  regresjonssveipene og røyktesten spurte aldri om `/js/`. Det som treffer den
  er skannere som sonderer katalogindekser, og prisen ligger der: en 5xx-rad i
  `usage_errors` eskalerer i vaktbriefen hver time uten at `vakt-kjent.tsv` kan
  dempe den. Én skanner vekker altså en ubetjent kjøring.
- **`isFile()` er skillet.** Alt som ikke er en vanlig fil har ingen ETag å gi,
  så middlewaren faller gjennom framfor å lese.
- **Å falle gjennom holdt ikke alene.** serveStatic finner ingen fil, og stien
  har ikke punktum, så locale-forhandlingen tok over og lovte `/en/js/` — som
  heller ikke finnes: 302 → 301 → 404, to hopp og en **render-plass** (#64
  kjenner en fil på punktumet, og en katalogsti har ikke det) for et svar som
  uansett er «her er ingenting». `staticMountNotFound` svarer derfor 404 rett
  under monteringene, uten HTML-kropp og uten omvei — ordrett samme regel som
  under `/og/` (#84). Bare KATALOGENE: en manglende fil-montering (`/og.png`)
  har alt punktum i stien og 404-er av seg selv.
- **`STATIC_MOUNTS` er én sannhet**, delt av begge middlewarene og av vakta —
  lista lå som en literal i `app.ts`, og en ny montering ville ellers vært to
  steder å huske.
- **Vakta ligger i `test/static-cache.test.ts` og har tre halvdeler.** REGELEN
  (middlewaren alene: hver katalogmontering faller gjennom til neste handler
  framfor å kaste, mens en ekte fil fortsatt merkes — ellers ville «returner
  alltid null» bestått). FLATA (hver katalog under `public/` svarer 404, uten
  omvei og uten HTML-kropp; katalogene velges av DATAENE, så en ny
  underkatalog måles uten at noen fører den opp). Og det må FINNES en
  katalogmontering, ellers måler de to andre ingenting. Fem mutasjoner kjørt,
  inkludert den smale fiksen som bare slipper `/js/` gjennom.
- **Restansen om `app.onError` er tatt i #108** — se «Et avbrudd som VARER
  lenger enn budsjettet er 503, ikke 500» under retry-budsjettet. Den er samme
  mangel som felte puzzles ved en DB-blipp (`flogvit-com-puzzles#59`).

##### Og roten UTEN skråstrek er den formen som faktisk skrives (#96)

EISDIR-en over ble meldt på nytt, men loggvinduet (05:05–06:15Z) ligger i sin
helhet FØR fiksen ble merget (06:40Z), og bibel-hono ble ikke rullet ut i det
vinduet i det hele tatt — taggen `20260815-061507-cce4c54` er `server`-repoet.
De seks hendelsene er altså førfiks. Det som fortsatt var galt, var samme regel
én bokstav unna: `startsWith('/js/')` ser ikke `/js`.

- **Formen uten skråstrek er den en skanner — og et menneske — skriver.** Den
  har ikke punktum, så `NOT_A_PAGE` (#64) ser ingen fil, og den gikk videre i
  locale-forhandlingen til `/en/js`: 302 og så en 404-SIDE. Det er de to samme
  prisene #95 tok bort for `/js/` — en omvei og en render-plass bak semaforen
  (#19) — for et svar som uansett er «her er ingenting».
- **Roten matches EKSAKT.** Som prefiks ville monteringen slukt enhver
  sideadresse som deler bokstavene (`/jsonfil`), altså byttet et billig 404 mot
  en side som forsvinner. Vakta måler nettopp den nabostien.
- **Vakta er de to nye halvdelene i `test/static-cache.test.ts`:** hver
  monteringsrot (fra `STATIC_MOUNTS`, ikke en egen liste) svarer 404 uten
  `Location` og uten HTML-kropp, og REGELEN krever i tillegg at nabostien går
  videre — ellers ville «404 på alt» bestått. Fem mutasjoner kjørt: feilen
  gjeninnført, roten som prefiks, 404 på alt, redirect framfor 404, og den
  smale fiksen som bare tar `/js`.
