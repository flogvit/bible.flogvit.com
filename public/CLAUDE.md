# Layout og CSS i bibel

<!-- Flyttet ordrett fra rotas CLAUDE.md (#164). Lastes når en økt jobber i public/. Reglene gjelder også markup i src/views. -->

## Ingen side skal være bredere enn skjermen (#50)

Leseren skrur opp tekststørrelsen i TELEFONENS tilgjengelighetsinnstillinger
(Android: «Tekstskalering», 133–150 %). Det er ikke sidezoom: sidezoom
forstørrer alt proporsjonalt og går alltid bra, mens tekstskalering
multipliserer BARE skriftstørrelsen. Bokser, `min-width`, `padding` og
grid-spor står stille i px, og innholdet vokser ut av kassa. Ti av ti målte
sider ble bredere enn skjermen, verst kapittelsiden med +26 %; `/innstillinger`
var 503 px på en 390 px-skjerm allerede ved 100 %.

- **`min-width: 0` på alt** (`styles.css`, helt øverst). Grid- og flex-barn har
  `min-width: auto` — «aldri smalere enn min-content» — og det gulvet vokser med
  teksten. Det er hovedmekanismen: den ene regelen tok lesesiden fra 493 til
  404 px. `<fieldset>` er dekket av samme regel: den arver `min-width:
  min-content` fra nettleserens EGEN standardstil, og det var hele forklaringen
  på /innstillinger.
- **Gulv i `rem`, aldri i px.** `minmax(min(7.5rem, 100%), 1fr)`, ikke
  `minmax(120px, 1fr)`. `min(…, 100%)` hindrer at gulvet er bredere enn sporet;
  `rem` gjør at gulvet FØLGER teksten, så rutenettet går til én kolonne når det
  må. Alle tolv rutenettene i CSS-en er lagt om.
- **`nowrap` bare på ATOMÆRE verdier** — et årstall, en dato. En kategori er en
  frase: «The Resurrection and Exaltation of the Messiah» er 252 px alene, og da
  hjelper ingen radbryting. Norsk skjulte dette; vakta kjører basespråket
  engelsk og avslørte det.
- **Rader med tittel + meta bryter** (`flex-wrap: wrap`), også chrome-headeren.
  Wordmark og konto-chip SKAL være `nowrap` og `flex-shrink: 0` — en avkortet
  merkevare hjelper ingen — så det er rada som må gi etter. WCAG 1.4.10 sier
  nettopp at innhold skal flyte om framfor å scrolles sidelengs.
- **Ingen magisk høyde.** Mobilpanelet lå på `position: fixed; top: 3.25rem`,
  altså headerens høyde ved 100 % tekst. Det tallet er feil i samme øyeblikk
  rada brytes — altså nøyaktig i tilfellet dette handler om. Panelet er nå
  forankret til headeren med `position: absolute; top: 100%`.
- **En tabell scroller SELV** framfor å gjøre siden bred: pakk den i en
  `overflow-x: auto`-wrapper, slik `.stat-table-wrap` alltid har gjort.
- **Lange ord brytes** (`overflow-wrap`) i brødtekst. En URL i en `<p>` på /om
  satte gulvet for hele siden.

**Vakta er `test/mobile-layout.test.ts`**, og den måler i ekte Chrome fordi
bredde er en egenskap ved rendringen. Invarianten er én linje —
`scrollWidth <= clientWidth` — sjekket for hver side i `PAGES` på 320 og 390 px,
ved 100 % og 150 % tekst. 320 px dekker både iPhone SE og iOS' «Display Zoom»,
som krymper det logiske viewportet i stedet for å skalere skrift.
Feilmeldingen navngir det bredeste elementet OG lange tekstnoder, og hopper over
alt som ligger i en egen scroll-boks — ellers peker vakta på det som skyves
framfor på det som skyver.

### En vakt som bare måler basespråket, måler de KORTESTE strengene (#70)

Sveipen over kjørte hele `PAGES` på `DEFAULT_LOCALE`, og engelsk er nettopp det
språket som gir de korteste strengene vi har. Tysk setter sammen ord, finsk
bøyer med lange endelser, svensk har «Tillgänglighetsredogörelse» — og ingen av
de sju andre flatene hadde noen gang vært målt. Seks av dem var for brede på
320 px, og `/nb/tilgjengelighet` allerede ved **100 %** tekst. Samme klasse hull
som #45, #65 og #69: en side som er for bred svarer 200 og skriver ingen
loggrad, så skaden er bare synlig for den som holder telefonen.

- **Alle 41 sidene × sju språk er 287 målinger**, altså minutter i ekte Chrome.
  Sidene velges derfor av DATAENE: for hvert språk måles de tre sidene der
  SPRÅKET SELV er mest utsatt, rangert etter det lengste ordet siden har på det
  språket og IKKE på basespråket — altså nettopp det oversettelsen legger til.
  Fordi valget følger dataene, flytter en ny eller nyoversatt streng målingen
  dit selv.
- **Løpende bokstaver, ikke «ord» mellom mellomrom.** Nettleseren bryter etter
  en bindestrek, så `bok-kapittel-versstart` er ikke én bred klump — den ville
  ellers vunnet på hvert eneste språk og skjøvet de ekte sammensetningene ut av
  utvalget.
- **Ord basespråket OGSÅ har teller ikke** (URL-er, hebraisk, id-er, egennavn
  fra dataene): de er like brede på alle åtte flatene og er alt målt av sveipen.
- **Fiksen er å la `overflow-wrap` ARVES fra `body`.** #50 førte opp de
  tekstbærende taggene (`p`, `li`, `td`, …), og den lista holdt bare fordi den
  ble målt på engelsk: hvert språk som setter sammen ord fant et sted den ikke
  dekket — en `h1` på `/tilgjengelighet`, en `span` i en toggle-etikett på
  `/innstillinger`. Unntaket lista skulle verne trengs ikke: chrome som må stå i
  ett stykke er `white-space: nowrap`, og der gjør `overflow-wrap` ingenting.
  Regelen slår heller aldri inn på et ord som får plass.
- **Kjøretid er en del av regelen, ikke en unnskyldning for å la være.**
  Utvalget koster ~25 s (41 sider × 8 språk SSR, fire om gangen, og 21
  Chrome-målinger) på toppen av de ~30 s sveipen alt brukte.

### Toppen av skjermen har ÉN eier på mobil (#55)

Samme dobbelteierskap som sideinnrykket, på den loddrette aksen: `.site-main`
la 32 px på toppen, og hver sidecontainer (`.overview-main`, `.user-main`,
`.about-main`, `.search-main`, `.study-main`, `.persons-main`) la på sine egne
48 px uten å vite om den. **80 px — 9,5 % av en 390 px-skjerm — brukt på
ingenting før leseren hadde sett brødsmulestien**, og brødsmulen er navigasjon,
ikke innhold. Sidetypene sprikte dessuten fra 62 (kapittelsida) til 80 px uten
grunn. Verdiene er skrevet for et 1280 px vindu, der de er en bevisst luftig
innledning.

- **Under 768 px er toppinnrykket `.site-main` sitt**, og sidecontainerne
  nulles i ÉN blokk i `styles.css`. Desktop røres ikke.
- **Selektorene er kvalifisert med `.site-main`.** Sidenes egne stilark lastes
  ETTER `styles.css`, så en uspesifisert `.user-main` taper på rekkefølge — og
  da ser regelen riktig ut uten å virke.
- **En wrapper uten egen flate eier ikke luft.** Et KORT (ramme, radius,
  skygge) har sin egen innvendige padding og er unntaket; `.chapter-page` maler
  bare sidebakgrunnen og er ren layout.
- Inline `style` slår enhver regel: 404-sidas `padding: 4rem` lå der og var
  dermed både usynlig for regelen og uslåelig av den. Den er nå `.notfound-page`.
- Lesemodus beholder sine 80 px (`.chapter-page.reading-mode`) med vilje —
  det er en modus leseren VELGER, og luften er poenget med den.

**Vakta ligger i `mobile-layout.test.ts` og har to halvdeler.** AVSTANDEN:
header-bunn til brødsmule er under 40 px på 390 px og lik på alle sidetyper
(32 px, 38 på kapittelsida der brødsmulen står midtstilt i en rad med knapper),
og minst 60 px på 1280 px — ellers ville «fjern padding overalt» bestått.
EIERSKAPET: den går ned den første synlige barnekjeden fra `.site-main` og
feiler på enhver wrapper uten egen flate som legger på `padding-top`/`margin-top`.
Den halvdelen kjenner ingen klassenavn, så en HELT ny sidecontainer blir målt
uten at noen har ført den opp — og den dekker også sider uten brødsmule
(forsiden, 404), der avstandsmålet ikke har noe å måle mot.

### En LAYOUT er ikke en spalte — den får headerens bredde (#78)

`--maxw` (1120 px) er en LESEBREDDE: den finnes for at én tekstkolonne ikke skal
bli for lang å følge. Kapittelsida er noe annet — den deler bredden på tre
(innholdsfortegnelse, tekst, studiepanel) — så taket traff feil del, og
tekstdelen betalte for alle tre: **448 px lesbar tekst på en 1440 px skjerm**,
mens headeren rett over strakte seg 1192 px og margen tok 180 px på HVER side.
Utslaget er stille som i #45, #65 og #70: sida svarer 200 og ser riktig ut, og
bare den som sitter foran den ser at teksten er trang mens plassen står tom.

- **`wide` på `Layout`** gir `.site-main-wide`, altså `--maxw-wide` framfor
  `--maxw`. Utelatt = lesebredden, som er riktig for alt som ER én spalte.
  Regelen er hva sida GJØR med bredden, ikke hvilken rute det er.
- **Boksen OG innrykket er headerens** — `--maxw-wide` og `--chrome-pad`, brukt
  begge steder. Deler de ikke innrykk, ligger kantene 4 px fra hverandre, og da
  ser sida ut som to sider oppå hverandre framfor som én bredde. Ett tall er
  dessuten det eneste som hindrer at de driver fra hverandre senere.
- **Mobil beholder sine 20 px.** Det er #50s avgjørelse, tatt for at
  lesekolonnen ikke skal stå unødig langt inn på en 390 px-skjerm — og under
  768 px biter taket uansett ikke, så bare innrykket ville endret seg.
- **Vakta er `test/reading-width.test.ts`**, i ekte Chrome på to desktop-bredder
  (1280 og 1440, så et hardkodet tall ikke består). Den har to halvdeler:
  KANTENE (de tre delene spenner nøyaktig headerens innhold, verken smalere
  eller bredere) og TEKSTEN (hele gevinsten havner i tekstdelen, og den lesbare
  kolonnen er over 500 px). Den andre finnes fordi den første alene ville
  bestått både av et tak på `.chapter-content` — sida brer seg ut, pikslene går
  til margen, leseren merker ingenting — og av å krympe HEADEREN i stedet. Fire
  mutasjoner kjørt.
- Motsatt akse av `mobile-layout.test.ts`, som måler at ingenting er for BREDT
  for skjermen. Denne feilen er bare synlig der det er plass til overs, altså
  aldri på en telefon.

### DEKOR ligger bak innholdet — rekkefølgen i markupen er ikke en avgjørelse (#90)

Velkommenboksen på forsiden har en gyllen glød i hjørnet
(`.home-continue::after`). Både gløden og innholdet er posisjonert UTEN
`z-index`, og da avgjør DOM-rekkefølgen hva som havner øverst — et
pseudo-element er sist, altså over alt annet. Gløden er dessuten ugjennomsiktig
i midten (`--gold-soft` er en BLANDET farge, ikke en alfa), så den la et slør
over teksten fra høyre hjørne og nedover. Målt: 73 kanaltrinn på
`.home-continue-sub`, og «Start med 1. Mosebok 1» på den gylne knappen var knapt
lesbar.

- **Mobil er verst, men feilen er ikke mobilens.** Sirkelen er 380 px bred; på
  390 px viewport er kortet ~350 px, altså dekker dekoren nesten hele boksen. På
  1280 px traff den fortsatt undertittelen. En fiks bak et brekkpunkt ville latt
  halve feilen stå — den er mutasjonstestet nettopp slik.
- **Fiksen er å gjøre lagdelingen eksplisitt** (`z-index: 0` på gløden, `1` på
  barna), ikke å krympe eller fjerne dekoren. Kortet er den første flata en ny
  leser ser, og en glød som er borte er ikke en penere glød.
- **Utslaget er stille, som #45, #65 og #70:** sida svarer 200, ingen loggrad, og
  bare den som ser på skjermen merker at teksten er blass. `mobile-layout`
  måler BREDDE og kunne per konstruksjon ikke se det.
- **Vakta er `test/welcome-box-glow.test.ts`, og den er formulert på UTFALLET:**
  ikke ett piksel som ER tekst blir farget om av dekoren. Den måler i ekte
  Chrome, tar to skjermbilder av samme flate (med dekoren og uten), og
  sammenligner bare GLYFKJERNENE — piksler som uten dekoren treffer elementets
  egen `color`. Kantutjevning holdes utenfor: et kantpiksel er blandet med
  bakgrunnen og SKAL endre seg når en glød ligger bak det; det er nettopp
  forskjellen på «bak» og «over». Elementene velges av SIDA (alle i boksen som
  bærer en tekstnode), så et nytt element arver målingen. PNG-en dekodes i
  sidas eget canvas framfor i en egen dekoder. Andre halvdel krever at gløden
  fortsatt MALER kortet, ellers ville «slett dekoren» bestått; en tredje at det
  finnes glyfkjerner å måle, ellers ville en for streng terskel gjort de to
  andre til tom påstand. Fire mutasjoner kjørt (dekoren fjernet, fiks bare
  under 768 px, tom måling, og feilen gjeninnført med `z-index: auto`).

### ADRESSEN bærer rekka — ellers kan sida ikke markere den (#91)

«Romerne 12:14-15» i Dagens vers pekte på `/nb/rom/12#v14`. Leseren ble scrollet
ned midt i kapittelet og satt igjen uten noe som sa hvilke vers referansen
gjaldt — verset man kom for er ett av tretti like linjer. Feilen lå ikke i
lesesida: etiketten lovte to vers, og hashen kunne bare uttrykke ett.

- **`public/js/verse-hash.js` eier FORMEN**, delt av serveren (link-byggerne) og
  lesesida — samme grep som `reading-progress.js`. Bygger og leser i hver sin
  fil ville vært to representasjoner av samme adresse, altså to steder å drive
  fra hverandre.
- **Sluttverset utelates når det ikke legger til noe.** En adresse skal ikke
  påstå en rekke den ikke har, og byggere som bare HAR ett vers (personchips,
  søketreff) arver dermed regelen uten en egen gren.
- **Den gamle formen (`#v14`) leses fortsatt.** Den ligger i delte lenker,
  bokmerker og søkeindekser, og en delt lenke lever lenger enn en deploy.
- **Merket er subtilt med vilje** — gyllen tone og en tynn kantlinje, ikke en
  overstreking leseren selv har laget. Det negative venstremarget spiser
  kantlinja + innrykket, så merkede og umerkede vers står på samme grunnlinje;
  uten det ville halve kapittelet flyttet seg 12 px når man kom fra en lenke.
- **Vakta er `test/verse-jump-marker.test.ts`**, og den følger kjeden i tre
  trinn. REGELEN (ren logikk: bygg og les er hverandres motstykke, og en hash vi
  ikke kjenner gir null framfor et halvt svar). LENKENE er en SVEIP over rendret
  HTML, ikke en liste over kallsteder: hver etikett som viser `<kap>:<fra>-<til>`
  for kapittelet lenka peker på, må adressere nøyaktig den rekka — så en ny
  referanseblokk måles uten at noen fører den opp, og en sveip uten treff er
  rød. FLATA måler i ekte Chrome at merket VIRKER (#55-fella: en klasse
  stilarket ikke honorerer): hele rekka merkes og ingenting utenfor, merket er
  synlig mot et umerket vers, den gamle formen merker fortsatt ett vers, uten
  hash er ingenting merket, og merket gjør ikke sida bredere enn skjermen på
  320 px — `mobile-layout.test.ts` måler uten hash og ser aldri merkede vers.
  Sju mutasjoner kjørt.

### EN BREKKET linje eier ikke lenger høyrekanten (#93)

Den faste legal-raden (portal/FOOTER.md) er merke · Vilkår · Personvern · Konto ·
© år. På desktop får alt plass på én linje, og `margin-left: auto` holder
copyright-en til høyre — det er et bevisst oppsett. På en telefon får den ikke
plass, og da skjøv det samme margen den helt ut til høyre på sin EGEN linje:
innrykket fra alt annet i footeren, under høyre ende av lenkene. Målt før
fiksen: venstrekant 239 av en 350 px rad på 390 px, 169 av 280 på 320 px.

- **`margin-left: auto` kan ikke skille de to tilfellene.** Den betyr «ta all
  ledig plass til venstre», og på en linje der posten er alene er det hele linja.
  Merke og lenker er derfor ÉN flex-post (`.site-footer-legal-main`), så raden
  har nøyaktig to, og `justify-content: space-between` fordeler PER LINJE: deler
  copyright-en linje, står den til høyre; brekkes den ned, er den alene og
  havner på venstrekanten sammen med alt annet.
- **Ikke et `@media`-brekkpunkt i px.** Raden brekkes tidligere når leseren
  forstørrer teksten, og et px-brekkpunkt kjenner ikke skriftstørrelsen — samme
  felle som i #50. Mutasjonstestet: fiksen bak `max-width: 768px` blir rød på
  800 px ved 200 % tekst.
- **Å hindre brekkingen er ikke fiksen.** `nowrap` her ville gjort sida bredere
  enn skjermen, altså byttet #93 mot #50. Vakta avviser den.
- **Vakta er `test/footer-legal-wrap.test.ts`, formulert på LINJENE:** hver
  linje i raden begynner på radens venstrekant, uansett hvor mange linjer den
  ble. Linjene grupperes ved loddrett OVERLAPP, ikke ved eksakt `top` — postene
  er grunnlinjejustert, så merket og lenkene står på ulik `top` på samme linje —
  og halvdelen kjenner ingen klassenavn utover raden selv, så et nytt ledd i den
  faste raden måles gratis. Språket velges av ORDBØKENE (som #70: engelsk
  skriver raden kortest), i tillegg til `nb` som saken er meldt på. DESKTOP
  krever at copyright-en fortsatt står til høyre OG at lenkene står inntil
  merket; uten den andre ville «venstrestill alltid» og «dropp grupperingen»
  rettet telefonen ved å legge om desktop. ROLLENE og «raden brekkes faktisk»
  finnes for at de tre andre ikke skal måle ingenting. Seks mutasjoner kjørt.

### HJELPEMIDLENE ER ENTEN EN KOLONNE ELLER ÉN TAPP UNNA (#94)

Studiepanelet (oppslag, sammendrag, personer, viktige ord, tidslinje) er en
kolonne i `.chapter-layout` på desktop. Under 1100 px har grid-en to spor og
tre barn, så panelet falt ned UNDER teksten: 792 px hjelpemidler 4632 px nede
på en 390 px-skjerm, altså etter hele kapittelet. ▥ i bunnlinja åpnet det
samme innholdet i et overlegg — som lå under headeren og ikke lot seg lukke.

- **Regelen som skulle skjult panelet sto der fra før og VIRKET IKKE.**
  `@media (max-width: 1100px) { .reading-sidebar { display: none } }` i
  `reading.css` har samme spesifisitet som `.reading-sidebar { display: flex }`
  i `studium.css`, og studium.css lastes ETTERPÅ — altså taper den på
  REKKEFØLGE. Media-spørringen legger ikke til spesifisitet. Kvalifisert med
  forelderen (`.chapter-layout .reading-sidebar`) vinner den. Ordrett samme
  felle som #55, og den er stille: regelen ser riktig ut i stilarket.
- **Verktøylinja tar over ved NØYAKTIG samme bredde.** Den sto på 768 px mens
  panelet forsvant på 1100, så mellom 769 og 1100 fantes verken kolonnen eller
  knappen — hjelpemidlene lå bare som en klump under teksten. De to
  brekkpunktene er én avgjørelse: er panelet ute av layouten, ER ▥ veien inn.
- **Overlegget dekker sida, altså også chromen.** `z-index: 80` mot headerens
  klebende `500` gjorde at headeren la seg over overleggets øverste 53 px —
  nettopp der tittelen og ✕ står. Målt med treffprøve: fingeren på ✕ traff
  headerens hamburgermeny. Panelet lot seg åpne og ikke lukke, som saken sier.
  Laget er nå 900, samme som hurtigtast-hjelpen, under kommandopaletten (2000).
- **Fanerada blir med inn i overlegget.** Den er skjult i sidebaren (vises bare
  i panelmodus på desktop), og når sidebaren er borte på mobil er overlegget
  eneste vei inn — uten fanene ser leseren studium-seksjonen og ALDRI
  tidslinje, paralleller eller innsikt. Tre av fire seksjoner var rendret og
  uoppnåelige på telefon. `activateTab` slår derfor opp i DOKUMENTET framfor i
  sidebaren: en fane som er flyttet ut ville ellers sluttet å bytte seksjon
  uten å se annerledes ut.
- **Fanerada leveres tilbake PÅ SIN PLASS**, som søsken før `[data-sidebar-content]`
  og ikke inni det: inne i det rullende innholdet mister den plassen sin over
  seksjonene i panelmodus på desktop. Målt som egen mutasjon.
- **⚙-arket er urørt.** Det er bunnforankret, så ✕ ligger godt under headeren —
  målt treffbar på 320 og 390 px ved 100 % og 150 % tekst, også på en 500 px høy
  skjerm. Samme z-index-klasse, men ingen målt defekt, og vi retter ikke noe vi
  ikke har målt.
- **Vakta er `test/study-panel-mobile.test.ts`, i ekte Chrome** — SSR-HTML og
  happy-dom har ingen layout-motor og kan per konstruksjon verken se plassering
  eller overlapping. Tre halvdeler: VEIEN (ved 320/390/900 er panelet ute av
  flyten OG åpneren synlig; ved 1280 er panelet fortsatt en kolonne ved siden av
  teksten, ellers ville «slett panelet» bestått), FLATA (treffprøve med
  `elementFromPoint` på ✕ og på overleggets header — et `z-index`-tall sier
  ingenting om hva fingeren treffer, #55-fella) og INNHOLDET (hver fane viser
  sin egen seksjon, og innholdet er tilbake på sin plass etter lukking). Åtte
  mutasjoner kjørt.
