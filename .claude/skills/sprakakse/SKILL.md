---
name: sprakakse
description: Sakene om hreflang, sider som bare finnes på noen språk, lesetekstenes blindvei og sitemapens språkakse (#45, #76, #77). Les før du endrer Layout sin locales-prop, localesWithContent, sitemap-paths.ts/seo.ts eller lesetekst-rutene.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

### En side som ikke finnes på et språk skal ikke annonseres der (#45)

Hreflang-klyngen ble generert generisk fra STIEN, uavhengig av om innholdet
fantes i språket. `reading_texts` ligger bare på `nb` — med vilje, se over — så
hver norsk lesedag annonserte alle åtte språk, og **sju av dem var 404**.
Feilloggen gikk fra ~50 rader i timen til 1542, hvorav 1228 var nettopp disse
(168 datoer × 7 språk = 1176). Vi *lenket* dem ikke i navigasjonen, men en
crawler trenger ingen lenke når `<link rel="alternate">` sier at siden finnes.

- **`Layout` tar `locales`** — språkene siden faktisk finnes på. Utelatt = alle
  åtte, som er sant for alt annet.
- **Lista utledes, ikke vedlikeholdes:** `localesWithContent()` (`lang.ts`)
  krysser innholdsspråkene i basen mot `contentLanguageChain()`, altså samme
  regel spørringen følger. `['nb']` → `nb` + `nn` (nabospråk før basespråket).
  Et nytt importert språk slår gjennom uten kodeendring.
- **`x-default` må ligge INNENFOR settet.** Det er adressen Google velger når
  ingen språkvariant passer; pekte den på engelsk for en norsk-bare side, sendte
  vi hver uplasserbar leser til en 404.
- **Vakta er invariant 9 i `page-contract.test.ts`, og den er en SVEIP.** Den
  sto først som tre håndplukkede sider mens både testfila og denne teksten lovte
  at den «fanger neste innholdsslag som mangler et språk» — de 36 andre sidene i
  `PAGES` var aldri sjekket. Invariant 3 sveiper riktignok hele matrisen, men den
  ser bare FORMEN: at åtte språk og `x-default` STÅR der. Om adressene FINNES kan
  den per konstruksjon ikke se, og det var nettopp hullet. Invariant 9 krever at
  **hver adresse klyngen annonserer svarer det samme som siden selv** — mot
  sidens EGEN status framfor mot 200, så 404-siden og 410-siden i matrisen holdes
  til samme regel framfor å bli unntak.
- **Detaljsiden kan ikke ligge i `PAGES`** — den svarer noe annet enn 200 under
  `/de/`, som er hele poenget — så den måles der detaljsidene måles: se
  «Detaljsidene er der klyngen kan lyve» under.
- De to produktbeslutningene saken lot ligge, er tatt i **#76 under**: dagsiden
  302-er nå til språket den finnes på, og oversikten oppgir fortsatt alle åtte.
  Klyngen er uendret av det — hreflang skal peke på adressen som ER siden, ikke
  på en som viser videre til den.

#### Detaljsidene er der klyngen KAN lyve (#45)

Invariant 9 sveiper `PAGES`, og `PAGES` er parameterløse sider. **Sidene saken
handlet om kan per konstruksjon ikke ligge der:** matrisen rendres under `/de/`,
og en side som ikke finnes på tysk er nettopp den som ikke svarer 200 der.
Sveipen dekket altså alt UNNTATT klassen defekten tilhørte, og lesedagen sto
igjen som ÉN håndplukket test — den ene adressen noen visste om.

- **Vakta er `test/hreflang-detail-pages.test.ts`, og invarianten går BEGGE
  veier:** klyngen er nøyaktig de locale-ene adressen svarer 200 på. Bare den
  ene retningen ville bestått av å oppgi én locale på hver side — det tar sju
  ekte adresser ut av søk, altså den motsatte skaden av samme slag.
- **Sidene velges av DATAENE** (som #70 og #80): for hver innholdstype måles
  oppføringen med SMALEST språkakse (`COUNT(DISTINCT language)` stigende), altså
  den som først blir en lesedag om igjen. En hardkodet `/personer/abaddon` ville
  målt en person som finnes på alle språk, altså ingenting — og en ny
  innholdsrunde flytter målingen selv. Sveipen er grønn overalt i dag: ingen
  enkeltrad i noen innholdstabell mangler et språk de andre har.
- **Den strukturelle halvdelen leser RUTENE**, ikke en liste: hver
  parameteriserte siderute må enten måles eller stå i `IKKE_MÅLT` med en grunn,
  og en oppføring som ikke lenger er en rute er rød. `sitemap-coverage.test.ts`
  trekker grensa si ved de parameterløse rutene og sier at detaljsidene «er en
  egen beslutning som fortjener sitt eget svar» — dette er det svaret.
- **En adresse som ikke svarer 200 på NOEN locale gir rødt**, ikke en stille
  bestått test. En tom tabell eller en omlagt rute ville ellers gjort halvdelen
  til pynt.
- Seks mutasjoner kjørt: `locales` fjernet fra lesedagen (klyngen for bred),
  klyngen for smal (`['nb']`, altså `nn` skjult), `x-default` valgt utenfor
  settet, en uklassifisert detaljrute, en død oppføring i kartet, og en
  måladresse som ikke finnes.

#### Norsk-spesifikt innhold skal ikke bli en blindvei på de sju andre (#76)

`reading_texts` ligger bare på `nb`, og det er riktig (#26). Men leseren møtte
to blindveier som ikke fulgte av den regelen:

```
GET /en/lesetekster/2026-12-25   404   <- delt lenke fra en norsk venn
GET /en/lesetekster              200   <- men lista er tom, uten en vei ut
```

- **Dagsiden 302-er til språket dagen FINNES på.** Hele bruken av den adressen
  er en delt lenke: den går fra en som leser norsk til en som kanskje ikke gjør
  det, og en 404 gjør lenken verdiløs for begge. Det bryter ikke med #26 — vi
  viser ikke norsk tekst under `/en/`; vi sier at teksten bor på den norske
  adressen og tar leseren dit, der `<html lang>` er ærlig. Alternativet «rendre
  den norske teksten under `/en/`» er nettopp det #26 forbyr.
- **302, ikke 301.** At lesetekstene bare finnes på norsk er en egenskap ved
  DATAENE, ikke ved adressen. Blir de importert på flere språk, skal en
  nettleser som har lagret en permanent redirect slutte å bruke den.
- **Målet utledes av basen** — `localesWithContent(getReadingTextLanguages(date))`,
  samme funksjon som hreflang-klyngen (#45) — aldri en hardkodet `nb`. Locale-en
  leseren står på utelates, så en redirect ikke kan peke på seg selv.
- **Redirecten gjetter ikke.** En dato uten lesetekst i det hele tatt 404-er som
  før; «send alt til `/nb/`» ville gjort hver ugyldig dato til en omvei til den
  samme blindveien. Queryen bæres over (`?bible=`), ellers svarer neste side på
  noe annet enn det leseren ba om (#24).
- **Menypunktet skjules IKKE på de seks andre språkene.** En locale-betinget meny
  er en ny akse i navigasjonen — hver flate måtte spørre databasen om innhold før
  chromet kunne rendres — og den koster mer enn den ene siden. Prisen betales
  heller der problemet er: **er lista tom fordi SPRÅKET mangler innholdet, sier
  siden det og lenker til utgaven som har det.** Da er menypunktet et svar, ikke
  en blindvei, og leseren får vite at teksten finnes.
- **De to tomme tilfellene er ikke det samme, og bare det ene har en vei ut.**
  Ingen rader i det hele tatt (språket mangler innholdet) → pek videre. Rader,
  men alle datoene passert (settet går ut 2028-12-31) → si bare det. Pekte vi
  videre også da, ville et tomt `/nb/lesetekster` sendt leseren til et like tomt
  `/nn/lesetekster`.
- **Språknavnet kommer fra `langName()`**, ikke fra en hardkodet «norsk» i åtte
  ordbøker: teksten følger da dataene, som resten av regelen.
- **Vakta er `test/reading-texts-locale.test.ts`, og den er formulert på
  UTFALLET.** LENKA: for hver av de åtte locale-ene ender
  `/<språk>/lesetekster/<dato>` i teksten — fulgt gjennom høyst ett hopp — så en
  fiks som OVERSETTER lesetekstene består like gjerne som en som redirecter, og
  det er riktig: da er ingenting en blindvei. LISTA: hver locale viser enten
  lesedager eller en lenke videre som selv svarer 200. MENYEN måles inne i
  `<nav class="site-nav">`, ikke i dokumentet som helhet — forsiden lenker også
  dit fra oppdagelseskortene, så en sveip over hele HTML-en ville bestått med
  menypunktet fjernet. Fem mutasjoner kjørt (ingen redirect, redirect uten
  oppslag, tapt query, ingen vei ut av tom liste, skjult menypunkt).

#### Sitemapen har en SPRÅKAKSE — ellers er valget alt eller ingenting (#77)

`STATIC_PATHS` er uprefikset, og `seo.ts` sendte HVER sti under HVERT språk med
en `xhtml:link`-klynge over alle åtte. Sitemapen kunne dermed ikke si «denne
stien finnes på nb og nn, ikke på de seks andre», og `/lesetekster` — en ekte,
offentlig side i navigasjonen med 236 lesedager bak seg — sto som eksplisitt
unntak i `NOT_IN_SITEMAP`. Begge utfallene mekanikken tillot er gale: å legge
den inn ville annonsert seks tomme sider for å få med én ekte (#45 om igjen, én
etasje ned), og å la den stå ute er en side søkemotorene bare finner ved å følge
en intern lenke — nøyaktig hullet #47 fantes for å stenge.

- **`LANGUAGE_SCOPED_PATHS` i `sitemap-paths.ts` eier unntakene, og verdien er
  en SPØRRING, ikke en liste.** `sitemapLocales()` gir
  `localesWithContent(await getReadingTextContentLanguages())` — samme mekanikk
  som hreflang-klyngen (#45), så et importert språk slår gjennom uten
  kodeendring, og et språk som forsvinner gjør det samme. Kartet inneholder bare
  unntakene; alt annet er alle åtte.
- **Klyngen bygges av SAMME liste som `<loc>`**, og `x-default` velges innenfor
  den. Bygde vi klyngen av `LOCALES`, ville de seks tomme adressene bare flyttet
  seg fra `<loc>` til `xhtml:link` — og det er den samme løgnen, sagt et annet
  sted.
- **Aksen slås opp PER FORESPØRSEL.** Én `SELECT DISTINCT` per unntak (i dag
  ett) mot en liten tabell, på en flate som hentes en håndfull ganger i døgnet.
  Stilista på ~1 200 oppføringer bygges fortsatt bare én gang. Alternativet —
  cache ved oppstart — ville krevd en restart for at en innholdsimport skulle
  slå gjennom.
- **Sitemapen og HTML-ens hreflang er IKKE samme spørsmål her, med vilje.**
  `/en/lesetekster` svarer 200 og peker leseren videre (#76), så sidas egen
  klynge oppgir alle åtte — adressen FINNES. Sitemapen sier hva som er et svar
  på et søk, og en tom liste med en vei ut er det ikke.
- **Vakta er `test/sitemap-locales.test.ts`, formulert på SIDEN.** Peker
  `/lesetekster` leseren videre til et annet språk, mangler DETTE språket
  lesetekstene, og da skal adressen ikke stå i sitemapen — og motsatt. De to
  andre halvdelene kjenner ingen sti: de leser språkaksen ut av sitemapene selv
  og krever at klyngen (og `x-default`) er enig med den, og at hver
  språk-scopet URL svarer 200. En egen test krever at det FINNES en scopet sti,
  ellers måler de to ingenting. Fire mutasjoner kjørt (klynge fra `LOCALES`,
  ingen filtrering på locale, `x-default` utenfor settet, stien ut av
  `STATIC_PATHS`). Den siste halvdelen lot seg ikke mutasjonsteste: alle åtte
  `/lesetekster`-adressene svarer 200 i dag, så det finnes ingen locale å
  annonsere feil.
