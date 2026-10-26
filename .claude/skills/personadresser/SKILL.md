---
name: personadresser
description: Sakene om person-id-er, alias, normalisert ø/æ/å, rad-id-er i API-svar og historie-slug-alias (#61, #153). Les før du endrer person-refs.ts, person-id-aliases, api-ids.ts, story-slug-aliases.ts eller /personer-, /historier- og /api/persons-rutene.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

### Importert innhold får ikke peke på en PERSON som ikke finnes (#61)

Samme klasse som #46, én akse over. Beviset kom fra .no-appen, som henter
familien over API-et: `/api/persons/gomer` svarte 200 med
`children: ["jisreel-hoseas-sønn", …]`, og `/api/persons/jisreel-hoseas-sønn`
svarte 404 — **API-ets eget svar annonserte en id API-et selv ikke kunne
servere**. Sju av sju API-404-er i loggvinduet hadde vår egen side som referer.

.com har samme rot, med to ulike utslag. Persondetaljen slår opp familien
server-side og hopper STILLE over det som ikke finnes, så leseren mister et
familiemedlem uten at noe ser galt ut. Ættetavlene i `chapter_insights` lenker
derimot rett ut: `/nb/matt/1` lenket «Tamar» til `/personer/tamar`, som er 404.
Personen finnes — hun heter `tamar-juda`. Åtte språkprefikser, fra en av de
tettest personlenkede sidene vi har.

- **`src/lib/person-refs.ts` eier lista og regelen.** `PERSON_REF_KEYS` er
  NØKKELEN, ikke stien: `personId` ligger på fire dybder i insight-JSON-en
  (`sections[].persons[]`, `footer.links[]`, `persons[]`, `heroes[]`), og en ny
  insight-type med samme nøkkel arver regelen gratis.
- **Sannheten er `persons.name`** — kolonnen `/personer/<id>` slår opp i — lest
  gjennom SAMME fallback-kjede som spørringen (`contentLanguageChain`). En
  nb-rad som peker på en person vi bare har på engelsk er derfor ikke død.
- **Kan adressen RETTES, rettes den — sletting er siste utvei.** Første utgave
  hadde bare ett svar, «fjern», og det er feil for den største klassen: av 90
  døde peker-id-er målt på .no var 16 slike vi HAR, bare stavet på den gamle
  måten (`jisreel-hoseas-sønn` mot rada `jisreel-hoseas-sonn`, `na'ama` mot
  `naama`). Der slettet ryddingen en ekte familierelasjon for å bli kvitt en
  adresse den kunne rettet. `personResolverFrom` gir derfor den KANONISKE
  id-en framfor ja/nei, i tre trinn som alle krever et EKSAKT treff i
  `persons`: id-en som den står → `PERSON_ID_ALIASES` (de 68 håndverifiserte
  fra free-bible#25, altså formene translitterering ikke kan redde —
  `akabs-snn` mangler bokstaven helt) → `normalizePersonId()`, som gjør
  nøyaktig det free-bible sin rettede `nameToId` gjør (ø→o, æ→ae, å→a).
  Rapporten skiller rettet fra fjernet: «fjernet 16 lenker» der den rettet dem
  beskriver en annen hendelse enn den som skjedde.
- **Lenka faller, navnet blir stående** — når den ikke kan rettes. En død
  adresse nulles (skalar) eller filtreres ut (liste); raden bæres uendret
  videre. «Tamar» står fortsatt i ættetavlen, bare ikke som lenke —
  `PersonLink` uten id gir ren tekst, en form dataene alt bruker («Peres»,
  «Hesron»). Samme avveining som «start slettes, slutt klippes» i #46: kast
  aldri innhold vi HAR for å bli kvitt en adresse vi ikke har.
- **Den gjetter aldri.** `tamar` kunne vært `tamar-juda`,
  `tamar-absaloms-datter` eller `tamar-absaloms-soster-davids-datter`. Samme
  grunn som at bare ÉN generasjon leseteksts-id-er kunne løses opp i #40.
  Rettingen bryter ikke med dette: den er en deterministisk omstaving med
  eksakt treff, ikke et valg mellom kandidater. `josef` normaliserer til seg
  selv, vi har elleve `josef-*`, og ingen av dem velges — den adressen dør.
- **Begge personflatene honorerer samme alias-kart.** Kartet lå bare på
  `/personer/:personId`, så `/api/persons/:id` slo opp rått: de 68 rettede
  id-ene 301-et for en leser som klikket og 404-et for en klient som hentet
  dem — samme adresse, samme app, to svar. Seks av dem har et ordrett `ø` og
  kommer inn som `%C3%B8`, altså nøyaktig formen saken er meldt på. Queryen
  bæres over redirecten, ellers svarer neste kall på gulvspråket (#24).
- **Ett etter-pass, fra to steder** — `ensureSchema()` (altså hver deploy, som
  rydder prod) og slutten av `import-bible.ts`. Sveipen går over ALLE
  innholdstabellene med en JSON-blob, ikke bare de to som har adresser i dag.
- **Ryddingen teller som en endring** og løfter sync-versjonen, ellers ville
  mikrocachen servert den døde lenka i inntil en time til.
- **Vakta er `test/person-refs.test.ts` og har fem halvdeler.** REGELEN (ren
  logikk: skalar nulles, liste filtreres, alt annet står), RETTINGEN (en
  ø-adresse rettes framfor å forsvinne, en uredelig id slettes fortsatt, og
  rapporten skiller de to), DATA (ingen rad i noen innholdstabell peker på en
  person som ikke finnes — hele basen, ikke bare `PAGES`), FORM (ny tabell med
  JSON-blob og ny adressenøkkel må deklareres) og SIDA (`/nb/matt/1` og
  `/en/matt/1` rendret, hver personlenke svarer 200). API-flata har sin egen i
  `person-id-aliases.test.ts`: ingen gammel id får 404-e over API-et når sida
  sender den videre. Nøkkel-halvdelen kjenner ingen nøkkelnavn: den finner
  nøkler hvis verdier stort sett slår opp i `persons`, så en ny adressenøkkel
  oppdages uten at noen har ført den opp. Alle vaktene er mutasjonstestet —
  også de to grenene i resolveren, hver for seg.

> **`bibel.flogvit.no` får IKKE disse fiksene, og det er ikke en forglemmelse.**
> Saken over er meldt på .no, som er frosset på branch `bibel-no`. Alt her ligger
> på `main`, altså hono-appen bak `bible.flogvit.com`. En fiks på `main` kan
> ikke nå .no — den ble merget og saken lukket 2026-07-31 på nettopp den
> misforståelsen, og gjenåpnet av prod-vakten 2026-08-02 med beviset fortsatt
> rødt på .no. Hva som skal skje med den frosne flata (301 til .com, tine opp
> branchen, eller la den stå) er en avgjørelse, ikke en kodeoppgave — den bærer
> merket `beslutning` sammen med søskensakene #48 og #49. **Lukk den ikke fra
> en commit på `main`.**

#### Ryddingen rettet PEKERNE — adressene var alt delt ut (#61)

Sveipen over eier dataene våre, og prod-vakten målte dem rene 2026-08-04: 0 døde
mål i 2029 personer på `.com`. Sakens EGEN overskrift sto likevel igjen, målt
på `.com` og ikke på `.no`:

```
GET /api/persons/jisreel-hoseas-s%C3%B8nn   404
GET /api/persons/jisreel-hoseas-sonn        200
```

`prunePersonRefs()` retter pekerne VÅRE. Den kan ikke røre en adresse som alt er
publisert — og de er publisert: `.no` lenker dem fra 1184 av sine 1771
personsider, de ligger i søkeindeksene, og `johannes-døperen` er dessuten formen
et menneske SKRIVER inn.

- **Saken stilte spørsmålet, og dataene svarer.** «Avklar om ø/æ/å i person-id er
  ment å finnes i det hele tatt» → nei: ingen av de 4058 radene i `persons` har
  et tegn utenfor `[a-z0-9-]`, og free-bibles `nameToId` translittererer nå før
  NFD. Da er feilen i OPPSLAGET for det som alt er delt ut, og svaret er **301,
  ikke 404** — ordrett samme argument `PERSON_ID_ALIASES` selv står på.
- **`PERSON_ID_ALIASES` kunne ikke dekke det.** Kartet er ENDELIG (68
  håndverifiserte former fra free-bible#25) og skal aldri vokse. Klassen her er
  ikke en gammel id, men den samme id-en stavet med bokstaven i behold, og den
  er utledbar — 95 adresser i dagens base.
- **`normalizedPersonId()` er kandidaten, ikke svaret.** Kalleren krever et
  EKSAKT treff i `persons` før den sender leseren videre, samme krav
  `personResolverFrom()` stiller i ryddingen. Uten det ville en 301 kunne peke på
  en 404. Og den gjetter aldri: `josef` normaliserer til seg selv, så de elleve
  `josef-*` er fortsatt ingen av dem — #61s egen avgjørelse, uendret.
- **Begge personflatene, som sist.** `/personer/:personId` og
  `/api/persons/:id`. At kartet lå på bare den ene var nettopp defekten «samme
  adresse, samme app, to svar»; en ny regel på bare den ene ville vært den
  samme feilen gjort på nytt.
- **Vakta er `test/person-id-normalized.test.ts`, og adressene velges av
  DATAENE** (som #70, #80 og #84): for hver person bygges formen kilden ville
  gitt UTEN translitterering — visningsnavnet med æ/ø/å i behold — og bare der
  den normaliserer tilbake til nettopp denne personen. Fire halvdeler: REGELEN
  (ren logikk, og ingen kandidat for en id som alt er kanonisk), DATA (ingen av
  de 95 404-er, og måladressen svarer faktisk 200 — en 301 til en 404 er ingen
  fiks), FLATENE (sida og API-et gir samme svar, med locale og `?lang=` i
  behold) og GJETTER ALDRI. Seks mutasjoner kjørt. Den ene som er verdt å nevne
  er å STRIPPE `ø` framfor å translitterere den: den blir rød, fordi DATA måler
  at adressen fører til den RIKTIGE personen — samme innvending #84 reiste.
- **Dette flytter fortsatt ikke `.no`.** Symptomet saken er meldt på lever på
  `bibel.flogvit.no`, som serveres fra `bibel-no`. Men det flytter hva en 301
  fra `.no` til `.com` ville vært verdt: av de 1120 døde id-ene vakten talte,
  var 11 slike som bare manglet translittereringen.

#### En RAD-ID delt ut som om den var en adresse (#61)

Sakens tabell har tre former, ikke én. Persongrafen og ø/æ/å-adressene er tatt
over. Den tredje er `/api/reading-texts/165` fra `/lesetekster/165` — en
auto_increment-id delt ut som en adresse. #40 tok den formen ut av URL-ene
våre; den sto igjen i API-svarene, og der var den fortsatt på `.com`:

```
GET /api/stories              -> [{ "id": 6453, "slug": "abimelek-…", … }]
GET /api/stories/6453         -> 404      (adressen er `slug`)
GET /api/themes/70            -> 404      (adressen er `name`)
GET /api/number-symbolism/351 -> 404      (adressen er `number`)
```

- **Tre ruter gjorde `SELECT *`** og sendte raden ut som den lå, mens
  `/api/persons`, `/api/days`, `/api/reading-plans` og `/api/parallels` i samme
  API deler ut nettopp adressen som `id`. Samme felt, to betydninger — og en
  klient som gjør det åpenbare (`GET /api/<samling>/<element.id>`) får 404 på
  hvert eneste element.
- **Verre enn 404: id-en RENUMMERERES ved hver innholdsimport** (#40 — importen
  sletter og setter inn på nytt), så en klient som lagret den peker på en annen
  historie etter neste innholdsrunde. En død adresse er synlig; en som stille
  bytter innhold er ikke det.
- **`src/lib/api-ids.ts` eier samlingene og regelen.** `API_COLLECTIONS` er ett
  sted, brukt både av rutene og av vakta — hadde hver rute hatt sin egen
  literal, ville vakta målt at ruta er enig med seg selv. `withApiId()` KASTER
  når raden mangler adressefeltet: stille ville den blitt til `id: undefined`,
  altså den samme døde adressen uten et tall å kjenne den igjen på.
- **Rad-id-en blir ikke liggende ved siden av adressen.** Den finnes bare i vår
  egen base, den er ustabil, og en klient som ser to id-lignende felter velger
  før eller siden feil.
- **To samlinger er deklarert med et NOTAT framfor en endring.**
  `/api/parallels` deler også ut `sections[].id`, men det er en
  grupperingsnøkkel (`parallels[].section_id`) uten detaljrute — ingen adresse.
  `/api/reading-texts` beholder rad-id-en fordi flere lesetekster kan dele dato
  (#40), så datoen adresserer DAGEN og ikke raden; `date` ligger i lista ved
  siden av, og at rad-id-en er ustabil er #40s sak.
- **Vakta er `test/api-id-graph.test.ts`, formulert på KONTRAKTEN og ikke på de
  tre samlingene.** Fem halvdeler: REGELEN (ren logikk; en udeklarert samling
  kaster framfor å gjette), FORMEN (leser RUTETABELLEN — hver rute med både
  liste og bar detaljrute må være deklarert eller stå i `UNADDRESSED_ROUTES`
  med en grunn, og en deklarasjon uten rute er rød), DATA (hver eneste
  oppføring bærer adressen som `id`, og et data-valgt utvalg hentes faktisk og
  gir RIKTIG oppføring — bare status hadde bestått av «server hva som helst»),
  DETALJEN (detaljsvarets egen id svarer selv 200) og GRAFEN (hver person-id
  API-et deler ut i `family`/`relatedPersons` finnes i API-ets egen indeks —
  sakens eget bevis, målt på flata framfor i basen som `person-refs`). Utvalget
  velges av DATAENE: formene som ikke er en ren `[a-z0-9-]`-slug, pluss begge
  ender av lista. Sju mutasjoner kjørt.
- **Dette flytter fortsatt ikke `.no`**, av samme grunn som avsnittet over.

#### En historie som fikk NY SLUG i korrekturen 301-er fra den gamle (#153)

`/en/historier/pasken-og-uttogget` 404-et etter at korrekturen ga historien
slugen `pasken-og-uttoget` — den gamle formen sto i free-bibles første
historie-commit og ligger i crawlernes indekser.

- **`src/lib/story-slug-aliases.ts` er kartet**, og begge flatene
  (`/historier/:slug` og `/api/stories/:slug`) honorerer det — samme lærdom som
  personaliasene: samme adresse, samme svar. Oppslaget skjer ETTER basen, så en
  levende historie alltid vinner. Queryen bæres over (#24).
- **Kilden er `proofread_stories/nb/<nåværende>.json` → `revisedStory.slug`**,
  men metadataen er ikke ren: tre par peker på en annen historie
  (`peters-tale-i-salomos-soylegang` → `josefs-far-jakob-kommer-til-egypt`). Et
  par kom bare med når målet finnes, den gamle slugen IKKE er en levende
  historie, og referansene overlapper — 16 av 76.
- **Den gjetter aldri.** De andre stiene i saken (`samuelsdommen-over-israel`,
  `/personer/maaka` …) står ikke som tidligere versjon av noe og 404-er fortsatt.
- **Vakta er `test/story-slug-aliases.test.ts`:** KARTET mot basen på hvert
  språk, FLATA (301 på alle åtte prefikser og i API-et, og målet svarer 200),
  QUERYEN og GJETTER ALDRI.
