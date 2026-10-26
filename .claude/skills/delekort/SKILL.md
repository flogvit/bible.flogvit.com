---
name: delekort
description: Delekortet: og:image i sidemalen (#65), opplasting til objektlagring (#66, #87) og kapittelkortet som settes sammen per forespørsel (#68). Les før du endrer share-card.ts, og-card.ts, routes/og.ts, assets/og/ eller upload-og-card.ts.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

## Delekortet — hva en delt lenke faktisk viser (#65)

Flata deklarerte ingen `og:image` i det hele tatt, så hver lenke noen delte på
Facebook, LinkedIn, Slack, iMessage eller Discord ble et kort med tittel og
beskrivelse **uten bilde**. Målt i prod på forsiden og på `/en/matt/5`.

**Ingen kunne se det innenfra, og det er sakens egentlige lærdom.** Siden svarer
200 og ser riktig ut; en manglende meta-tagg gir verken 404, 5xx eller en
logglinje. Prod-vakten kunne per konstruksjon aldri fanget det — `usage_errors`
inneholder bare FEIL. Hullet finnes utelukkende utenfor produktet, hos noen som
ennå ikke har klikket. Samme klasse hull som #45 og #60: skaden skjer der vi
ikke ser den, og bare en vakt som er formulert på KONTRAKTEN finner den.
Tverrgående sak med målingen for alle åtte flatene: `flogvit-com#74`.

- **Kortet står i SIDEMALEN, ikke per rute.** `layout.tsx` deklarerer det som
  standard for alle sider. Legges det per side, mangler det på den ruta noen
  legger til i morgen — og da er vi tilbake til å oppdage det utenfra.
- **`src/lib/share-card.ts` eier adressen og målene.** Målene er en del av
  kontrakten, ikke pynt: uten `og:image:width`/`:height` må skraperen HENTE
  bildet før den vet om det kan vises bredt, og den FØRSTE delingen av en URL —
  den som betyr noe — blir uten bilde.
- **Adressen er absolutt.** En relativ sti resolves ikke av alle skrapere.
- **`twitter:image` er bevisst utelatt.** X faller tilbake på `og:image`, så
  taggen ville vært duplisering med to steder å glemme å oppdatere. `twitter:card`
  må derimot stå — uten `summary_large_image` vises et 1200x630-bilde som en
  liten firkant ved siden av teksten.
- **`og:image:alt` går gjennom ordboka.** Den er tekst en skjermleser leser opp,
  altså brukervendt tekst. Den leses dessuten av norsk-sveipene i
  sidekontrakten, som nå tar den sammen med `<title>` og description — et
  attributt på en `<meta>` var usynlig for begge de gamle sveipene.
- **KILDEN til bildet er HTML**, `assets/og/card.html`, rastrert av
  `bun scripts/generate-og-card.ts` i samme headless Chrome som layout-vakta.
  En binær fil noen laget i et bilderedigeringsprogram kan ikke diffes, og da
  er neste endring en ny fil ingen kan sammenligne med den forrige. Runbooken
  er `assets/og/README.md`.
- **Kortet ligger i `public/`, ikke i objektlagring — og det er en RESTANSE,
  ikke et valg.** Porteføljeregelen er at bilder hører i objektlagring, også
  systeminnhold. Bøtta `bibel` finnes ikke, og en bøtte er en beslutning om
  skyprosjekt, region og kostnad (`flogvit.com/CLAUDE.md`), ikke noe en
  kodeendring kan ta. `OG_IMAGE_URL` er flyttelasset, og det er **kodet** —
  `scripts/upload-og-card.ts`, se #66 under.
- **Per-side-kort er et eget og senere steg** — tatt i #68 under, for
  kapittelsidene. Sidemalens kort er fortsatt standarden for alt annet.

**Vakta er todelt.** Sidekontraktens invariant 8 sveiper HVER side i `PAGES` —
absolutt `og:image`, målene 1200x630, en alt-tekst, og `twitter:card` — så en ny
side arver kortet uten at noen har tenkt på det. `test/share-card.test.ts` tar
det sveipen ikke kan se: at bildet FINNES, at det er en PNG med nøyaktig de
målene sidemalen deklarerer (lest ut av IHDR-chunken, ikke antatt), at appen
serverer det med validator, og at `OG_IMAGE_URL` faktisk flytter det. Alt-testen
er strukturell som brødsmulevakta i #63 — en hardkodet literal rendres ordrett
likt på fire ubeslektede språk. Alle vaktene er mutasjonstestet.

#### Flyttelasset flytter adressen — noe må flytte BILDET (#66)

«`OG_IMAGE_URL` er flyttelasset: last opp bildet, sett variabelen, ferdig —
ingen kodeendring» var halve flyttingen sagt som hele. Variabelen flytter
ADRESSEN. Ingenting flyttet bildet, og ingenting holdt de to kopiene like:
`public/og.png` ligger i git og rulles ut med imaget, mens bøttekopien måtte
lastes opp for hånd. Runbooken har TRE grunner til å lage kortet på nytt
(`card.html`, identiteten i `portal/STYLE.md`, en ny bokstav i et boknavn) og sa
ingenting om å laste det opp igjen. Fra dagen variabelen er satt, ville prod da
servert et gammelt kort for alltid — 200, ingen loggrad, synlig bare for den som
fikk lenken. Nøyaktig hullet #65 handlet om, én etasje ned. Sakens egen
«ferdig» krevde dette («ikke to kopier som driver fra hverandre») og kalte det
samtidig «ingen kodeendring».

- **`scripts/upload-og-card.ts` er PORTET, ikke funnet opp.** `books`, `lab` og
  `puzzles` har samme skript (`scripts/last-opp-delekort.ts`) mot samme
  `Bun.S3Client`, med samme legitimasjonskjede (env → `~/.config/scw/config.yaml`)
  og samme «bekreft anonymt etterpå». Å skrive en fjerde variant her ville vært
  en ny måte å gjøre det samme på — spørsmålet var HVORDAN den bæres over, ikke
  OM. Avviket er `sjekk`-kommandoen, som finnes fordi bibels opplasting IKKE
  ligger i deploy-kjeden: den bor i driftsrepoet.
- **Kortet skrives HVER gang**, som i `books`: det koster en håndfull kilobyte
  og fjerner hele klassen «bildet forsvant fordi noen ryddet i bøtta».
  `bun scripts/upload-og-card.ts sjekk` svarer på om den PUBLISERTE adressen
  fortsatt er lik kilden — den skriver ingenting og trenger ingen nøkler, så den
  kan kjøres etter hver deploy.
- **Den verifiserer FØR den skriver ut adressen, og gjør det ANONYMT.**
  Skrivingen kan lykkes uten at objektet kan leses utenfra — det er ACL-en, ikke
  opplastingen, som avgjør om delingen virker. En adresse vi ikke har bevist er
  nettopp løgnen saken handler om: den ser riktig ut i env-fila, og gir et
  gammelt eller tomt kort hos den som fikk lenken.
- **`sjekk` måler `OG_IMAGE_URL` når den er satt**, ikke den utledede adressen.
  Å måle en adresse ingen leser henter kortet fra er å måle ingenting.
- **Skriptet oppretter ALDRI bøtta.** Det er en beslutning om skyprosjekt,
  region og kostnad (KONVENSJONER.md → «Objektlagring»), og en bøtte kan ikke
  flyttes mellom prosjekter i Scaleway. Mangler den, stopper skriptet høylytt og
  navngir avgjørelsen — et stille «ferdig» ville fått en maskin uten bøtte til å
  se ferdig ut. Samme lærdom som «(tom) framfor høylytt stopp» i CLI-vakta for
  review-køen. Meldingen nevner også at S3-navnerommet deles med alle
  Scaleway-kunder: `lab` var opptatt og måtte bli `flogvit-lab`.
- **`DELEKORT` i `share-card.ts` er ÉN sannhet** — bøtte, region, nøkkel og mål
  — delt av opplastingen, runbooken og `share-card.test.ts`, som bruker
  `objektUrl()` framfor en literal. Nøkkelen er
  `system/delekort/bibel-1200x630.png`, samme form som de tre andre produktene:
  `<uid>/` er obligatorisk første segment for BRUKER-innhold, og `system/`
  holder systeminnhold utenfor lagringsregnskapet framfor å late som om det er
  noens. **Filnavnet bærer målene og skal BYTTES når kortet endrer MOTIV** —
  skraperne cacher per URL, så en overskrevet fil viser det gamle motivet i
  ukevis uten at noe sier fra.
- **`OG_IMAGE_URL` er MIDLERTIDIG.** De tre andre produktene peker sidemalen
  rett på `objektUrl()` og har ingen slik bryter. Den finnes her bare fordi en
  `og:image` mot en bøtte som ikke finnes gir INGEN forhåndsvisning — altså
  dårligere enn i dag.
- **Vakta er `test/og-card-upload.test.ts`, og den er formulert på ADRESSEN —
  ikke på at en PUT ble sendt.** Skriptet kjøres som et ekte underprosess mot en
  ekte lyttende S3-flate (en egen søm, som CLI-vakta), og adressen det SKRIVER
  UT må servere nøyaktig bytene i `public/og.png`. Sju halvdeler: adressen
  virker; kortet skrives hver gang; en bøttekopi som har drevet fra kilden sier
  fra og lar seg rette; `sjekk` måler `OG_IMAGE_URL`; en PUT som svarer 200 uten
  at objektet blir lesbart skriver INGEN adresse; en bøtte som ikke finnes gir
  høylytt stopp; og uten nøkler (heller ikke i `~/.config/scw/config.yaml`)
  stopper den før den later som den lastet opp.
- **Det som gjenstår er ÉN avgjørelse, ikke tre steg.** Opprett bøtta, kjør
  skriptet, lim inn linja det skriver ut. Avgjørelsen er `#87`.

##### Kommandoen kan ikke si hvilket PROSJEKT bøtta havner i (#87)

Avgjørelsen er «prosjekt `flogvit`, region fr-par», men
`scw object bucket create` har **ingen `project-id`-arg** (målt på scw 2.50.0:
`name`, `tags`, `enable-versioning`, `acl`, `region`). Bøtta havner altså i det
prosjektet maskinens `scw`-profil tilfeldigvis peker på, mens kommandolinja
`name=bibel region=fr-par` SER ut som den uttrykker hele avgjørelsen. Det var
nettopp den lesingen som la soulsupport-bøttene i prosjektet «Bibel»
2026-07-29, og en bøtte kan ikke flyttes mellom prosjekter i Scaleway.

- **`DELEKORT.project` er prosjektet**, ved siden av bøtte, region og nøkkel —
  det leddet som ikke kan rettes etterpå hører i samme sannhet som de andre.
  Verdien er NAVNET, ikke id-en: repoet er offentlig, og navnet er nok til å
  sammenligne med `scw config get default-project-id`.
- **Skriptets stopp-melding er runbooken i det øyeblikket handlingen skjer**,
  så den navngir prosjektet og sjekk-kommandoen framfor bare create-linja.
- **Målt 2026-08-07:** navnet `bibel` er ledig globalt
  (`https://bibel.s3.fr-par.scw.cloud/` → `NoSuchBucket`), og maskinens
  `default-project-id` er `flogvit`. `flogvit-`-prefikset trengs altså ikke.

##### `sjekk` må kunne stå i deploy-kjeden FØR bøtta finnes (#87)

Restansen fra #66 er at `server/deploy-bibel-hono.sh` (i driftsrepoet) skal
kjøre `bun scripts/upload-og-card.ts sjekk` etter deploy. Den kunne ikke wires:
kommandoen felte på `NoSuchBucket`, altså hadde HVER deploy vært rød fram til
avgjørelsen var tatt — så linja ville aldri blitt lagt inn, og guarden hadde
kommet nøyaktig når den ikke lenger var gratis.

**«Bøtta finnes ikke» betyr to ulike ting**, som 404 gjør for review-køa (#81):
uten `OG_IMAGE_URL` er flyttingen bare ikke gjort, sidemalen serverer
`public/og.png` fra vårt eget opphav, og det er RIKTIG — kommandoen sier det og
avslutter med 0. Med `OG_IMAGE_URL` satt påstår miljøet at kortet ligger i
objektlagringen, og da er en manglende bøtte delte lenker uten forhåndsvisning
i det hele tatt — dårligere enn før flyttingen — og den avslutter med 1.
Guarden armerer seg altså selv i det øyeblikket variabelen settes.

### Kortet skal si HVILKET kapittel lenken peker på (#68)

Det generiske kortet er gulvet, og det er kapittellenkene folk deler: en delt
`/en/matt/5` så nøyaktig ut som en delt forside. Kapittelsiden sender nå sitt
eget kort — «Matthew» over «Chapter 5» — på **lenkens** språk.

- **Begge veiene saken satte opp var stengt, og det er sakens egentlige svar.**
  «~1200 kort på disk» er i virkeligheten 1189 kapitler × 8 språk = **9512**
  bilder, altså ~200 MB derivert binær i git som må lages på nytt hver gang et
  boknavn rettes. «Rastrér ved første treff» er headless Chrome, og prod-imaget
  er `oven/bun:1.3-slim`: et Chrome-lag er ~1 GB på en disk som har tatt ned
  prod før, på en VM der CPU er den kjente flaskehalsen (#19, #64).
- **Veien som står igjen er å SETTE SAMMEN kortet per forespørsel.**
  Generatoren rastrerer én gang det som ikke varierer — bakgrunnen, og ett
  alfabilde per BOKSTAV i de to skriftene malen bruker, med kerningen målt i
  samme Chrome. Kjøretiden er da piksel-aritmetikk og `node:zlib`: ~10 ms, ingen
  ny avhengighet, 138 kB artefakter mot 200 MB. `src/lib/og-card.ts` bærer både
  koden og begrunnelsen; runbooken er `assets/og/README.md`.
- **Malen er fortsatt HTML-en.** `assets/og/card.html` fikk en `body.chapter`
  med to `[data-og-slot]`, og generatoren MÅLER dem — plass, grunnlinje,
  skrift, farge — framfor å ha tallene i seg. Flytter du et slott i CSS-en,
  flytter teksten seg med.
- **Boknavnet kommer fra `bookNameById()`** (#69), ikke fra ordboka: 66 verdier
  adressert av en id fra dataene hører ikke i `dictionaries.ts`. Kapittelledda
  går derimot gjennom ordboka, for ordstillingen er ikke vår å anta (#63).
- **Renderen nekter framfor å tegne et halvt kort.** Mangler malen et tegn,
  serveres det generiske. En tittel med hull i ser riktig ut fra en 200-linje i
  loggen og er bare synlig for den som fikk lenken.
- **Ruta ligger UTENFOR lastvernet** — stien har punktum, altså `NOT_A_PAGE`
  (#64) — og det er med vilje: en 503 på delekortet er et kort som aldri kommer,
  og skraperen prøver ikke igjen. **Den er heller ikke forbudt i robots.txt**;
  Facebook og LinkedIn leser robots, så et `Disallow: /og/` ville tatt bort
  nettopp bildet som er poenget. #60 forbyr HANDLINGS-URL-er, ikke dette.
- **Boka adresseres med SLUGEN sida bruker** (`/og/en/matt-5.png`), ikke med
  rad-id-en (#40).
- **`COPY assets/og/generated` i Dockerfilen er en del av fiksen.** `assets/`
  var ikke med i imaget, og uten linja ville hvert kapittelkort falt tilbake til
  det generiske — med 200 i loggen og ingen feilrad. Vakta leser Dockerfilen.

**Vakta er `test/og-chapter-card.test.ts`**, og den er formulert på kontrakten:
kapittelsiden deklarerer sitt EGET kort på alle åtte språk (ellers rødt), de
deklarerte målene er kortets EKTE mål lest ut av IHDR, kortbytene er
FORSKJELLIGE på fire ubeslektede språk (en tekst som aldri gikk gjennom ordboka
eller boknavntabellen ville gitt identiske byte — samme strukturelle grep som
#63), malen har tegn for **hvert boknavn på hvert språk** lest ut av
`booksData` × `LOCALES`, alt annet beholder det generiske kortet, et kapittel
som ikke finnes gir 404, og artefaktene blir med i imaget. Alle vaktene er
mutasjonstestet.

**Ikke gjort, med vilje:** kortet viser ikke de første ordene av teksten. Vi har
bibeltekst på `nb`, `nn` og `en` — et fransk kort med norsk vers ville vært verre
enn det generiske, som er nøyaktig det saken advarer mot. Vers- og
person-/temasider har heller ikke egne kort ennå; de arver gulvet fra #65.
