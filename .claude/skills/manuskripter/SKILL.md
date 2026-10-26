---
name: manuskripter
description: Delte manuskripter (/delt), den åpne katalogen, review-køen og pagineringen (#15, #75, #81). Les før du endrer publications.ts, catalog.tsx, publications-review.ts, devotional_shares eller REVIEW.md.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

## Deling av manuskripter (GitHub #15, del 1)

`/delt/<token>` viser ett manuskript til hvem som helst — **ingen konto, ingen
sesjon**. Lenken ER tilgangen (capability-URL), og det styrer alt:

- **Tokenet lages på serveren** (32 byte `crypto`, base64url) og bor i
  `devotional_shares`. Ikke i localStorage: en delt lenke må virke for en
  mottaker uten konto, altså kan den ikke bo hos avsenderen.
- **Ett levende token per manuskript** (UNIQUE på `user_id, item_id`). «Del» er
  idempotent; «Ny lenke» ERSTATTER og trekker dermed tilbake den gamle. To
  gyldige lenker til samme tekst ville gjort «trekk tilbake» til en løgn.
- **Nøkkelen er sync-item-id-en** (`dev-<ts>`), ikke slugen — slugen er avledet
  av tittelen, og en delt lenke skal ikke dø av at noen endrer overskriften.
- **Tilbaketrekking må virke UMIDDELBART.** Derfor står siden utenfor
  mikrocachen (`NEVER_CACHED` i `page-cache.ts` — med en times TTL ville en
  cachet kopi overlevd tilbaketrekkingen) og sendes med `private, no-store`.
- **Ukjent, tilbaketrukket og slettet gir samme svar: 404.** Et eget «trukket
  tilbake» ville bekreftet at tokenet en gang var gyldig. Slettet manuskript =
  `sync_items.deleted = 1`, og det filteret er en del av tilgangskontrollen.
- **`noindex`**, og ikke i sitemapen (`sitemap-paths.ts` lister bare faste
  sider).
- **Å DELE er plus** (husking=plus, altså må teksten være lagret i skyen); **å
  LESE er gratis**. Samme akse som resten av appen.

## Åpen katalog for manuskripter (#15, del 2)

`/manuskripter/katalog` er motstykket til den skjulte lenken: alt er listbart,
offentlig og indekserbart. Det er nettopp derfor det er review — alt som er
listbart, er verdt å spamme. Logikken bor i `lib/publications.ts`.

**Runbook: `REVIEW.md`** — kommandoene, hva du faktisk vurderer, og hva hver
avgjørelse gjør med katalogen og med forfatteren. Under her står bare hvorfor
modellen ser slik ut.

**Review-modellen er manuell godkjenning av hver publisering.** Minst å bygge,
og den kan VOKSE uten å rives: «betrodd konto etter N godkjente» er et spørsmål
mot de samme radene, og etterhånds-moderering er rapportknappen som allerede står
der. Kø og avgjørelse går over token-gatede endepunkter (`REVIEW_TOKEN`, uten
env FINNES de ikke) og `scripts/publications-review.ts` — samme mønster som
contrib, aldri direkte DB-tilgang og aldri engangscontainere på VM-en.

- **Teksten fryses ved innsending** (`title`/`content` i tabellen). Reviewen
  godkjenner en TEKST, ikke et løfte: leses manuskriptet live fra `sync_items`,
  kan en godkjent forfatter bytte det ut med reklame etterpå, og godkjenningen
  blir en vaskeritjeneste. Redigering endrer derfor ikke katalogen — ny
  innsending gjør, og den går tilbake til `pending`.
- **Sletting virker likevel.** Både lista og detaljen JOIN-er mot `sync_items` og
  krever `deleted = 0`. Øyeblikksbildet er for integritet, ikke for å holde på
  noe eieren har fjernet.
- **Adressen er `slug` = tittel-slug + seks tilfeldige tegn**, og er
  primærnøkkelen. Ingen auto_increment i en offentlig URL (#40), ingen bruker-id
  å telle bakover fra, og adressen overlever at tittelen endres. Ny innsending
  BEHOLDER slugen, så en delt lenke ikke dør av en retting.
- **Rapporter skjuler ingenting av seg selv** — tallet er et signal til den som
  reviewer. Auto-skjuling ved N rapporter ville vært et nedtakingsvåpen for hvem
  som helst. Rapportering krever ingen konto: den som ser noe galt er sjelden
  innlogget.
- **HELE katalogen står utenfor mikrocachen** (`NEVER_CACHED`), ikke bare
  detaljen. En tittel er også tekst noen kan ha reagert på, så «teksten er borte,
  men overskriften står i en time» er ikke moderering. Prisen er liten: én
  spørring mot en liten tabell, ikke 1189 kapittelsider.
- **Ruterekkefølge:** `catalog.tsx` monteres FØR `user.tsx` i `pages.tsx`, ellers
  sluker `/manuskripter/:slug` katalogen. `test/publications.test.ts` pinner det.
- Bare LISTA ligger i sitemapen. Enkeltoppføringer kommer og går med review og
  tilbaketrekking, og en sitemap full av adresser som forsvinner er verre enn
  ingen (#42-lærdommen).
- **Å PUBLISERE er plus** (teksten må være lagret i skyen), **å LESE er gratis**.

#### «Fortsatt publisert» må være SANT, og CLI-en er en egen søm

Køen er det eneste som gjør at en innsending noen gang kommer ut, og den har to
lag som begge kan svikte stille.

- **Reviewerens andre kø JOIN-er som katalogen.** «Rapportert, men fortsatt
  publisert» gjorde det ikke, så et manuskript forfatteren hadde SLETTET ble
  stående der: en tekst ingen leser kan se, som revieweren likevel må vurdere —
  og som ingen avgjørelse tar ut igjen, siden en rapport på noe usynlig aldri
  kommer i veien for noen. Alle tre spørringene mot katalogen (`listCatalog`,
  `getPublication`, `listReportedPublications`) krever nå den samme levende
  raden i `sync_items`.
- **`scripts/publications-review.ts` er et EGET PROGRAM**, ikke en funksjon.
  `publications.test.ts` går inn med `app.request()` og ser derfor ingenting av
  sømmen mellom CLI-en og API-et: døpes `authorName` om i svaret, står den
  suiten grønn mens køen slutter å vise hvem som har sendt inn. Mutasjonstestet
  nettopp slik.
- **`test/publications-review-cli.test.ts`** kjører de fire kommandoene fra
  `REVIEW.md` som ekte underprosesser mot en ekte lyttende server. To av dem
  finnes fordi et STILLE svar er det farlige: mangler TJENESTEN `REVIEW_TOKEN`
  (404) eller er den feil (403), skal CLI-en stoppe høylytt — melder den «(tom)»
  i stedet, ser en feilkonfigurert prod ut som en tom kø, og innsendingene blir
  liggende for alltid. Den pinner også at `vis` gir HELE teksten der køen bare
  gir 100 tegn; det er der en innsending som vil noe annet, plasserer det.

#### Et TAK på lista er en oppføring ingen kan finne (#75)

`listCatalog()` hentet `LIMIT 100` og siden viste det den fikk. Det fantes ingen
side 2, og enkeltoppføringene ligger med vilje ikke i sitemapen (over) — så
oppføring nummer 101 var **godkjent, publisert og uoppdagbar**: forfatteren så
«Publisert» med en lenke som virket, og ingen leser hadde en vei dit. Sorteringen
er nyeste først, altså faller de ELDSTE ut — de som har stått lengst. Utslaget er
stille (200, ingen loggrad, ingen 404), som #45, #60, #65 og #69.

- **Paginering på STI, ikke på query.** `/manuskripter/katalog/side/2`. En URL
  med query er en HANDLING som verken følges eller indekseres (#60), så `?side=2`
  ville gjort side 2 like uoppdagbar som oppføringene den skulle vise. To
  segmenter kolliderer heller ikke med `:slug`.
- **Tallet er sidelengden, ikke et tak.** `CATALOG_PAGE_SIZE` (50) sier hvor
  lang én side er; `pageCount` sier at det finnes en til. Alternativet «behold
  100, men si det» ble vraket fordi det ikke løser at oppføringen er *borte* —
  og «vis alt» fordi lista da vokser uten grense på en flate som står helt
  utenfor mikrocachen.
- **Sorteringen må være TOTAL.** `decided_at DESC, submitted_at DESC` alene har
  ingen innbyrdes rekkefølge for to rader godkjent i samme millisekund — og en
  reviewer som går gjennom køen godkjenner nettopp flere i samme millisekund. En
  slik rad kan havne på begge sider av et sideskille, altså listes to ganger
  eller ingen. `p.slug ASC` til slutt gjør ordenen entydig. Dette er det ene
  punktet her som IKKE lot seg mutasjonsteste: MySQL leverer tilfeldigvis stabil
  rekkefølge for denne spørringen lokalt, så vakta ble grønn uten leddet.
- **Side 1 har ÉN adresse, den korte.** `/side/1` er 301 dit; det er den som
  ligger i sitemapen og som canonical peker på. Dypere sider står ikke i
  sitemapen — de kommer og går med review, og «neste side»-lenka ER
  oppdagelsesveien.
- **Et sidetall forbi siste side er 404**, ikke en tom liste med 200. En side som
  svarer 200 uansett tall er en uendelig flate for en crawler.
- **Vakta er `test/catalog-pagination.test.ts`, og den er formulert på
  USYNLIGHETEN — ikke på tallet 100.** Den seeder flere oppføringer enn én side
  rommer (målt i `CATALOG_PAGE_SIZE`, ikke i et tall), GÅR katalogen slik en
  leser og en crawler gjør — fra rot-adressen, via «neste side»-lenka — og
  krever at hver eneste godkjente oppføring dukker opp underveis, ingen to
  ganger, og at siste side ikke lenker videre. Da består en fiks som flytter
  taket like gjerne som en som paginerer, så lenge ingenting er usynlig; og et
  tak uten vei videre stryker uansett hvor det står. Fem mutasjoner kjørt (tak
  uten side 2, pager uten neste-lenke, query framfor sti, 200 framfor 404 forbi
  siste side, ingen 301 fra `/side/1`).
- **Sida ligger ikke i `PAGES`**, og det er samme grunn som lesedagene i #45: den
  finnes bare når katalogen er stor nok, og 404-er ellers. Rot-adressen står der
  som før.

#### Og KØEN har samme tak, med en verre konsekvens (#81)

#75 løste lista LESEREN ser. Køen er en annen flate med en annen bruker —
revieweren — og der stoppet `LIMIT 50` en innsending fra å komme ut i det hele
tatt: den som står bak sideskillet blir aldri sett, altså aldri godkjent, og
forfatteren ser «Til vurdering» i det uendelige. Køen er den ENESTE veien ut i
katalogen.

- **`REVIEW_PAGE_SIZE` er sidelengden, ikke et tak**, og begge køene
  (`listPendingPublications`, `listReportedPublications`) returnerer
  `{items, page, pageCount, total}` som `listCatalog`. Sorteringen fikk `slug
  ASC` til slutt av samme grunn som i #75: uten en TOTAL orden kan en rad havne
  på begge sider av et sideskille, altså vises to ganger eller ingen.
- **`total` er ikke pynt — det er tallet CLI-en SKRIVER.** «Til vurdering (50)»
  var et tall som så ut som hele køen; det er selve løgnen saken handler om.
  Skriptet skriver også ut kommandoen for neste side, framfor å anta at
  revieweren gjetter at det finnes en.
- **Paginering på ARGUMENT, ikke på sti.** Motsatt av #75, og med vilje: dette
  er en CLI mot et token-gatet endepunkt, ingen crawler ser den og ingenting
  skal indekseres. `kø 2` er den formen en reviewer faktisk skriver.
- **Ett sidetall blar i BEGGE køene.** Den rapporterte er nesten alltid kort, og
  to uavhengige markører ville vært to ting å holde styr på for å gjøre én jobb.
- **Oppslaget står UTENFOR køen.** `vis` lette i køen den nettopp hentet, så en
  oppføring bak sideskillet kunne ikke engang leses med slugen i hånda.
  `GET /api/publications/review/:slug` slår opp på slugen alene, uansett status,
  med samme `sync_items`-JOIN som køene. **`godkjenn`/`avvis` var derimot ALDRI
  avhengige av køen** — de poster slugen rett til `/decide`, og saken tar feil på
  akkurat det punktet. `vis` var hele blokkeringen, og den er nok: du avgjør ikke
  en tekst du ikke kan lese.
- **404 fra den ruta betyr to ulike ting**, og CLI-en skiller dem: `not_found` er
  ukjent adresse, mens en tjeneste uten `REVIEW_TOKEN` svarer 404 på at
  endepunktet ikke finnes. Sier vi «fant ikke» på det siste, ser en
  feilkonfigurert prod ut som en skrivefeil — samme felle som «(tom) framfor
  høylytt stopp» i CLI-vakta over.
- **Tavla teller riktig allerede.** `dashboard/src/collect/prod.ts` gjør
  `COUNT(*)` rett mot basen og har aldri sett de 50 — den var altså det eneste
  stedet køens sanne lengde fantes, og revieweren så et annet tall enn tavla.
- **Vakta er `test/review-queue-pagination.test.ts`, og den er formulert på
  USYNLIGHETEN — ikke på tallet 50.** Den seeder flere enn én side rommer (målt i
  `REVIEW_PAGE_SIZE`), GÅR køen som revieweren gjør — `kø`, så kommandoen
  skriptet selv skrev ut — og krever at hver innsending dukker opp nøyaktig én
  gang, at tallet i overskriften er hele køen, og at den som faller utenfor
  første side kan `vis`-es med hele teksten og godkjennes helt ut i katalogen.
  Den rapporterte køen måles på samme vandring. Kommandoene kjøres som ekte
  underprosesser: CLI-en er en egen søm, og `publications.test.ts` går inn med
  `app.request()`. Fem mutasjoner kjørt (tak uten side 2, sidens antall framfor
  `total`, ingen neste-kommando, `vis` som leter i køen, urørt rapportert kø).
  `slug ASC` lot seg ikke mutasjonsteste — som i #75 leverer MySQL tilfeldigvis
  stabil rekkefølge for denne spørringen lokalt.
