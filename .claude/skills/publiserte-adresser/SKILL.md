---
name: publiserte-adresser
description: Prosentkoding av publiserte adresser (#80), ASCII-ren kortsti og avkortede kortadresser (#84), og 301 fra adresser klienten har skadet (#118, #152). Les før du endrer site-url.ts, cardBookSlug, skadet-adresse.ts, app.notFound eller catch-all-rutene.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

### En PUBLISERT adresse er prosentkodet — og bare ett ledd koder den (#80)

Sidemalen sendte rå UTF-8-bytes i `og:image`, `canonical` og hreflang-klyngen,
mens sitemapen kodet de samme adressene. De to var altså uenige om hva adressen
ER. Amazonbot, som fikk den rå formen, sendte `GET /og/en/1kr` — prefikset fram
til første ikke-ASCII-byte — og fikk 404, mens `/og/en/1kr%C3%B8n-15.png` ga 200
i samme vindu. 760 delekort- og 760 canonical-URL-er sto slik.

- **`src/lib/site-url.ts` eier BÅDE opphavet og kodingen.** `absoluteUrl(sti)`
  er `SITE + encodeURI(sti)`, og literalen `https://bible.flogvit.com` finnes
  ikke lenger noe annet sted i `src/` — den var kopiert til fire filer, og fire
  av canonical-ene var derfor bygget utenom enhver koding.
- **`SITE` eksporteres IKKE, og det er hele grepet.** Er konstanten
  tilgjengelig, er `SITE + sti` tilgjengelig — og da er kodingen frivillig.
  `absoluteUrl()` er den eneste veien til en absolutt adresse, så en ny rute
  som vil utenom må skrive opphavet selv, og det er nettopp det vakta ser.
- **Ikke i `toUrlSlug()`.** Den brukes også der rå form er riktig (ruter og
  interne lenker), og #42 viser hva som skjer når en verdi tar en runde gjennom
  en kodet representasjon og kodes igjen: `%C3%B8` → `%25C3%25B8`, 95 kapitler
  404 i alle åtte sitemaps. Én representasjon internt, én koding ved utsending —
  samme regel `sitemap-paths.ts` allerede sier.
- **Hreflang-klyngen fulgte med.** Saken navnga `og:image` og canonical, men
  klyngen er den samme adressen sagt et annet sted; lot vi den stå rå, hadde vi
  bare flyttet uenigheten med sitemapen.
- **Usynlig innenfra, som #65.** Et delekort som ikke lar seg hente svarer
  ingen: skraperen viser et kort uten bilde, og det gir verken 404, 5xx eller en
  logglinje hos oss. At det dukket opp i vakta i det hele tatt var flaks — én
  crawler sendte prefikset sitt framfor å gi opp i stillhet.
- **Vakta er `test/published-url-encoding.test.ts`, og sidene velges av
  DATAENE** (som i #69 og #70): hver bok hvis slug bærer et tegn utenfor ASCII,
  altså `åp`, `1krøn`, `2krøn`, `høys` i dag. En test på `/1mos/1` beviser
  ingenting her — `encodeURI` er identiteten på ren ASCII, som er hele
  blindsonen. Fem halvdeler: ingen publisert adresse bærer et tegn utenfor
  ASCII; den kodede adressen DEKODER tilbake til sidas egen sti (ellers ville
  «strip ø i slugen» bestått); sitemapen og sida oppgir BIT-IDENTISK samme
  adresse, klyngen inkludert (at de var uenige er selve feilen — hver for seg
  svarer begge formene 200); opphavet settes bare sammen med en sti i
  `site-url.ts`, så neste rute ikke kan bygge sin egen; og kortet svarer 200 på
  adressen slik den er publisert. En egen test krever at det FINNES en slik
  slug, ellers måler de andre ingenting. Seks mutasjoner kjørt — den ene som
  IKKE ble rød av ASCII-sveipen er sidemalens egen canonical: hver sti med
  ikke-ASCII i dag er en kapittelside, og den sender sin EGEN canonical. Det er
  den strukturelle halvdelen og typesjekkeren som holder den, ikke sveipen.

#### Kortstien er ASCII-REN — prosentkoding flyttet kuttet, den fjernet det ikke (#84)

#80 er ute og virker: alle fire bøkene sender kodet form i `og:image`,
`canonical` og hreflang. Symptomet overlevde likevel, **målt med samme nevner**
— 4,4 % avkortede før fiksen, 4,7 % etter, og null forespørsler med rå
ikke-ASCII i etter-vinduet. Amazonbot kutter nå ved første `%` i stedet for ved
første rå ikke-ASCII-byte (`GET /og/de/2kr` av `/og/de/2kr%C3%B8n-<n>.png`), og
en ny form kom til: `åp` gir `/og/<språk>/`, en sti uten filsegment, som faller
ut av `/og/`-ruta og videre i locale-forhandlingen til 404.

- **Er det ingen `%` der, har klienten ingenting å kutte ved.**
  `cardBookSlug()` i `og-card.ts` translittererer bokleddet: `1kron`, `2kron`,
  `hoys`, `ap`. Regelen er porteføljens egen (`normalizePersonId`, #61, altså
  free-bibles `nameToId`): `æ`→`ae`, `ø`→`o`, `å`→`a`. En ny omskriving her
  ville vært en tredje stavemåte for de samme bøkene.
- **Bare KORTSTIEN — men ikke fordi sidas egen adresse går fri.** Den kuttes av
  samme klient på nøyaktig samme sted (`GET /de/2kr` av `/de/2krøn/26`,
  Amazonbot 2026-08-06T12:32Z), bare ~120 ganger sjeldnere: 0,038 % av 2638
  hentinger mot 4,6 % av 366 på kortstien, målt over 98 timer mot de samme fire
  bøkene. Forskjellen er at det ikke finnes noen ASCII-form å bytte til der —
  `ø`-en ER adressen, og den leses av et menneske. Å skrive den om er en
  avgjørelse om adresseskjemaet, ikke en feilretting, og den bæres ikke av
  0,038 %. #80s krav om at den kodede adressen DEKODER tilbake til sidas egen
  sti står derfor uendret for canonical og hreflang; kortstien er unntaket, og
  den leses av en maskin, aldri av en leser. **Innholdsformen har sin egen
  katalog-linje** (`flogvit-com-server@f9a5a01`, terskel 5 ≈ 500× dagens nivå),
  og den skal BLI STÅENDE når søsterlinja under fjernes — ellers mister nettopp
  den formen fiksen ikke rører all dekning i samme slengen.
- **Ruta tar imot BEGGE formene.** Den prosentkodede ligger i delte lenker og i
  skrapernes indeks fra før, og en delt lenke lever lenger enn en deploy.
  `bookByCardSlug()` prøver kortslugen først og faller tilbake på
  `getBookInfoBySlug()`. Å lene seg på ALIAS-tabellen alene holdt ikke: den har
  `1kron`, `2kron` og `ap`, men ikke `hoys` — den er skrevet for
  referanseparsing, ikke for denne adressen.
- **Katalog-linja i `server/vakt-kjent.tsv` demper klassen** og forutsatte at
  #80 ville fjerne den. Tallet sto høyt etterpå, og det ble fanget av en
  tilfeldighet (den fjerde formen bommet på regexen), ikke av porten. Linja
  peker nå hit; den skal FJERNES når dette er deployet og verifisert — står
  tallet fortsatt høyt, er også denne fiksen ufullstendig. Den ligger i et annet
  repo (`flogvit-com-server`).
- **Vakta er `test/og-card-ascii-path.test.ts`, formulert på TEGNET og ikke på
  `ø`**, med sidene valgt av DATAENE (som i #69, #70 og #80). Seks halvdeler:
  ingen kortsti for noen bok på noe språk bærer noe `encodeURI` må røre; den
  adressen SIDA publiserer har ingen prosentkode (funksjonen alene beviser ikke
  hva som står i `og:image`); adressen leverer kortet for RIKTIG bok målt på
  BYTENE (ellers ville «fjern ø-en» bestått — det er innvendingen #80 reiste mot
  en omskriving); den gamle kodede formen svarer fortsatt med samme kort; ingen
  kortslug skygger for en annen bok eller kolliderer med en annen kortslug; og
  en egen test krever at det FINNES en slik slug, ellers måler de andre
  ingenting. Sju mutasjoner kjørt. Den ene som IKKE ble rød er å STRIPPE `å`
  framfor å translitterere den (`åp` → `p`) — og det er riktig: den formen er
  fortsatt ASCII-ren, entydig og peker på samme bok, altså ikke defekten. Er
  den derimot en annen boks slug eller en annen boks kortslug, er den rød.

##### Og en AVKORTET adresse skal ikke svares som en side (#84, andre halvdel)

En ASCII-ren sti hindrer NYE kutt. Den hindrer ikke de 18 avkortede formene som
alt ligger i skrapernes indeks, og de blir hentet igjen. Saken sier selv hva som
er galt med svaret de fikk: «Skraperen får `text/html` der den ventet en PNG.»

- **`/og/<språk>/` hadde ikke lenger et filsegment**, falt derfor ut av kortruta
  og videre i locale-forhandlingen: `302 /en/og/fr/` → `301 /en/og/fr` → `404`.
  To hopp for et bilde som ikke finnes, der det siste er en adresse i
  SIDE-navnerommet som ikke fantes før vi fant den opp — nøyaktig klassen #46 og
  #60 stenger.
- **Prisen var en RENDER-PLASS.** `NOT_A_PAGE` (#64) kjenner en fil på
  punktumet, og et kutt fjerner nettopp punktumet. En avkortet kortadresse sto
  dermed i køen bak semaforen og rendret en HTML-side ingen skraper leser, i det
  øyeblikket kapasiteten er knapp (#19, #86).
- **Under `/og/` svares det aldri som en side:** ingen HTML-kropp, ingen omvei.
  `avkortet()` i `routes/og.ts` er ett svar for alle tre stedene — ugyldig
  språk/filnavn, ukjent bok/kapittel, og catch-allen. **Catch-allen står SIST**,
  så en hel adresse fortsatt vinner; den er enden på et kutt, ikke en mur.
- **Vakta ligger i samme fil og er formulert på ADRESSEN, ikke på de fire målte
  formene:** ingen PREFIKS av en publisert kortadresse — i begge formene, for
  hver bok og hvert språk — får redirecte eller svare med HTML. En egen halvdel
  holder de fire målte formene ordrett, og en tredje krever at den HELE adressen
  fortsatt leverer kortet, ellers ville «404 på alt under `/og/`» bestått. Fire
  mutasjoner kjørt (ingen catch-all, `c.notFound()` tilbake i kortruta,
  catch-all FØRST, og en smal fiks som bare tar `/og/<språk>`).

##### Og en adresse klienten har SKADET er ikke en adresse vi ikke har (#118)

Samme fire bøker, samme tegn, men nå på SIDAS egen adresse — den #84 lot stå.
Målt over 17,8 timer mot `1krøn`, `2krøn`, `høys` og `åp`: 145 hentinger
korrekt prosentkodet og servert, **24 skadet av klienten og 404-et**.

```
bingbot   GET /en/1kr%C3%83%C2%B8n/14    7 av 22 (32 %)   UTF-8 lest som latin-1, kodet på nytt
MJ12bot   GET /fr/1kr?n/20              17 av 17          tegnet byttet mot `?`
```

- **#84s begrunnelse for å la den stå var et TALL, og tallet har flyttet seg.**
  «0,038 % … bæres ikke av 0,038 %» gjaldt Amazonbots kutt. For bingbot er
  andelen nå 32 %, og bingbot er en SYNLIGHETSAKTØR: en tredel av hentingen
  blir aldri indeksert. 4 bøker × 8 språk = 584 sider. Utslaget er stille i den
  retningen som teller — vi ser en 404-rad, mottakeren ser et hull i indeksen.
- **Begge formene er DETERMINISTISKE omskrivinger av adressen vi publiserte**,
  altså kan begge regnes tilbake. Da er feilen i OPPSLAGET og ikke i adressen,
  og svaret er **301, ikke 404** — ordrett samme argument `PERSON_ID_ALIASES`
  og `normalizedPersonId()` står på (#61). `src/lib/skadet-adresse.ts` eier
  regelen; `PLASSHOLDERE` er `?` og U+FFFD, altså formen KLASSEN tar, ikke en
  liste over klienter.
- **Den gjetter aldri.** Hver omskriving krever et EKSAKT treff i `booksData`,
  mojibaken dekodes STRENGT (`TextDecoder` med `fatal`), og et kapittel boka
  ikke har blir stående som 404 framfor å bli en 301 til en 404 (#61).
- **En HEL adresse har ikke noe vern foran seg, og det er med vilje.** Begge
  omskrivingene må ENDRE leddet for å treffe, så en slug som alt er vår faller
  ut av seg selv; et «er dette en bok vi har?»-vern ville vært en linje ingen
  mutasjon kunne felle (#50-lærdommen). Egenskapen holdes av en SVEIP over hver
  slug og hvert alias i stedet.
- **`?` er spørringens eget tegn, så MJ12bots form når oss som to ting.**
  `/fr/1kr?n/20` er stien `/fr/1kr` med spørringen `n/20` — der er `?`-et en del
  av ADRESSEN og skal ikke bæres videre, mens en EKTE spørring ved siden av
  bingbots form (`?bible=osnn`) skal (#24, #61). Derfor leses adressen på to
  måter, og bare den som regner seg tilbake brukes.
- **To kallsteder, én regel.** `app.notFound()` fordi bingbots form er en ren
  sti — `/:book/:chapter` MATCHER den og svarer `c.notFound()` selv, så
  catch-allen ser den aldri. Catch-allen fordi `/de/åp/3` skadet blir `/de/`
  med spørringen `p/3`, altså trailing-slash-trimmingen, som ellers 301-et den
  til FORSIDA — en soft-404 er verre enn en 404.
- **Prisen var dessuten en RENDER-PLASS.** En skadet adresse har ikke noe
  punktum, altså er den en SIDE for `NOT_A_PAGE` (#64), og en hel SSR-render av
  404-sida sto i køen bak semaforen (#19, #86). En 301 koster mikrosekunder.
- **Dette gjør IKKE adressen ASCII-ren.** Å skrive om adresseskjemaet for 584
  sider er fortsatt avgjørelsen #84 lot ligge — `ø`-en leses av et menneske — og
  porten her trengs uansett hvilken vei den går: de `ø`-bærende adressene ligger
  alt i indeksene, og en indeksert adresse lever lenger enn en deploy.
- **Vakta er `test/skadet-kapitteladresse.test.ts` med fem halvdeler.** REGELEN
  (ren logikk: begge formene gir den publiserte adressen, en hel adresse røres
  ikke — sveipet over hver slug og hvert alias — et kapittel boka ikke har gir
  ingen omskriving, og en ukjent bok gjettes ikke fram). DE MÅLTE FORMENE
  (ordrett fra loggen, og vakta beviser først at formene den BYGGER er dem
  loggen viser). FLATA (alle fire bøkene × åtte språk × begge formene: 301, og
  måladressen hentes og må svare 200 med RIKTIG canonical — bare status hadde
  bestått av en 301 til hva som helst; pluss at queryen bæres over). INGENTING
  ANNET RØRES (en hel adresse svarer som før, og en ukjent er fortsatt 404 —
  ellers ville «301 på alt som ikke finnes» bestått). Formene BYGGES slik
  klienten bygger dem (UTF-8-bytes lest som latin-1, tegnet byttet mot `?`),
  ikke slik fiksen regner dem tilbake. Sju mutasjoner kjørt.
- **To former slapp gjennom, og begge var en asymmetri i regelen (#152).**
  `?`-grenen prøvde bare SLUGENE mens mojibake-grenen gikk gjennom
  `getBookInfoBySlug()` og dermed aliasene — så `/fr/h?y/1` (aliaset `høy`)
  404-et. Begge prøver nå de samme leddene, og en `?`-form som gir flere bøker
  gjettes ikke. Og andre runde mojibake kan være lest som **windows-1252**
  (`0x83` → `ƒ`, U+0192), så `ÃƒÂ¸` var et tegn over 0xFF latin-1-veien
  avviste; `CP1252_TIL_BYTE` regner de 32 tegnene tilbake til byten.
- **UMÅLT ER IKKE GRØNT.** Symptomet lever i prod, og verifiseringen må være
  tidsavgrenset til utrullingen OG kreve at aktøren har vært innom etterpå —
  ellers er den rød av historikken og grønn av stillhet (#86):

  ```sh
  ssh flogvit-vm 'docker exec server-caddy-1 sh -c "cat /var/log/caddy/access.log"' \
   | LC_ALL=C awk -v fra=<utrullingens epoch> '
     /bingbot|MJ12bot/ {
       match($0,/"ts":[0-9.]+/); t=substr($0,RSTART+5,RLENGTH-5)+0
       if (t < fra) next
       sett++; if ($0 ~ /"status":404/) doede++
     }
     END { print "sett=" sett+0, "404=" doede+0; exit !(sett>0 && doede==0) }'
  ```
