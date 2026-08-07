# Delekortet — hvordan du lager det på nytt

Kortet er bildet en delt lenke til bible.flogvit.com viser på Facebook,
LinkedIn, Slack, iMessage og Discord. Det finnes i to utgaver:

| Utgave | Vises for | Ligger som |
|---|---|---|
| Generisk (#65) | alle sider unntatt kapittelsidene | `public/og.png` |
| Kapittel (#68) | `/nb/matt/5` og de 9511 andre | settes sammen ved forespørsel av delene i `generated/` |

Begge deklareres av sidemalen (`src/views/layout.tsx`), begge er 1200x630, og
begge har `assets/og/card.html` som kilde — kapittelutgaven er den samme malen
med `body.chapter` og to slotter fylt ut. **Hvorfor** det ser slik ut, og
hvorfor kapittelkortet ikke ligger som ferdige filer, står i `../../CLAUDE.md`
→ «Delekortet».

## Lag det på nytt

```bash
bun scripts/generate-og-card.ts        # card.html -> public/og.png + generated/
bun test test/share-card.test.ts test/og-chapter-card.test.ts
git add public/og.png assets/og/generated && git commit
bun scripts/upload-og-card.ts          # BARE når kortet ligger i objektlagring
```

Skriptet krever Chrome — samme som layout-vakta. Finner det ingen, sier det
hvilke stier det prøvde; `CHROME_BIN` overstyrer.

Kjør det når du har endret `card.html`, når identiteten i `portal/STYLE.md`
endres (papirfargen, lær-aksenten, wordmarken), **eller når et boknavn i
`src/lib/book-names.ts` får en bokstav vi ikke hadde fra før** — malen bærer
ett bilde per bokstav, og en bokstav som mangler ville falt stille ut av
kortet. Vakta i `test/og-chapter-card.test.ts` er rød før det skjer.

Kortene er brand-ressurser som ellers står i ro, så dette er **ikke** en del av
deployen: `public/og.png` og `generated/` ligger i git og rulles ut med imaget.

## Se etter deploy at kortet faktisk kommer ut

```bash
curl -s https://bible.flogvit.com/en/matt/5 | grep 'og:image'
curl -sI "$(curl -s https://bible.flogvit.com/en/matt/5 | grep -o 'https://[^"]*og/en/[^"]*png')"
```

Andre linja skal svare `200` og `content-type: image/png`. Svarer den 404, er
`assets/og/generated/` ikke med i imaget (se `COPY`-linja i `Dockerfile`);
viser bildet bare wordmarken, falt renderen tilbake til det generiske kortet og
har logget `og-card:` i containerloggen.

## Hva du kan endre

`card.html` er kilden. Fargene og skriftreglene der er kopiert fra
`portal/STYLE.md` — familien deler identitet ved å kopiere verdier, ikke ved en
delt pakke, så endrer du dem her skal de allerede være endret der.

Målene 1200x630 er derimot ikke frie: sidemalen deklarerer dem i
`og:image:width`/`:height`, og `test/share-card.test.ts` leser bildets ekte mål
ut av PNG-en og krever at de tre er enige. Skal kortet ha andre mål, endres
`SHARE_CARD_WIDTH`/`HEIGHT` i `src/lib/share-card.ts` og konstantene i
generatoren i samme slengen.

Slottene (`[data-og-slot]`) er kapittelkortets to tekstfelt. Flytt dem, bytt
skrift eller farge på dem i CSS-en her — generatoren MÅLER dem, den antar
ingenting. Legger du til et nytt slott, må `charsets()` i generatoren si hvilke
tegn det kan komme til å vise; ellers stopper skriptet med navnet på slottet.

## Skriftene

`fonts/` er de to familieskriftene fra `portal/STYLE.md`, latin-utsnittet,
kopiert fra `image/public/fonts/`. De ligger her for at generatoren skal virke i
et ferskt arbeidstre uten nett og uten et søskenrepo — de lastes ikke av appen,
som henter dem fra Google Fonts som før.

Begge er **SIL Open Font License 1.1**: Schibsted Grotesk (Schibsted) og IBM
Plex Mono (IBM). Lisensen tillater videredistribusjon; fontene kan ikke
videreselges alene eller distribueres modifisert under samme navn.

## Flytt til objektlagring (#66)

Porteføljeregelen er at bilder hører i objektlagring, også systeminnhold
(`flogvit.com/docs/KONVENSJONER.md` → «Objektlagring»). Bøtta `bibel` finnes
ikke ennå, så kortet serveres fra vårt eget opphav inntil den gjør det.

**Det som gjenstår er ÉN avgjørelse, ikke tre steg.** Å opprette bøtta er en
beslutning om skyprosjekt, region og kostnad
(`flogvit.com/docs/KONVENSJONER.md` → «Objektlagring»), og en bøtte kan ikke
flyttes mellom prosjekter i Scaleway — feil plassering er gratis å rette mens
den er tom, og en migrering etterpå. Resten er kodet:

```bash
scw object bucket create name=bibel region=fr-par     # <- avgjørelsen, tas én gang
bun scripts/upload-og-card.ts                         # laster opp og bekrefter
# skriptet skriver ut linja: OG_IMAGE_URL=… -> bibel.env, restart
```

S3-navnerommet deles med alle Scaleway-kunder. Er `bibel` opptatt (409
`BucketAlreadyExists`), følger porteføljen `flogvit-lab`-presedensen og
prefikser med `flogvit-`; da endres `DELEKORT.bucket` i
`src/lib/share-card.ts`, og adressen følger med.

Legitimasjon er env `S3_ACCESS_KEY`/`S3_SECRET_KEY` (porteføljens navn, fra
`soulsupport.env`), ellers `~/.config/scw/config.yaml` — samme kjede som
`books`, `lab` og `puzzles`. Adressen og nøkkelen bor i `DELEKORT` i
`src/lib/share-card.ts`, som opplastingen, runbooken og sidemalen deler.

### De to kopiene får ikke drive fra hverandre

`public/og.png` ligger i git og rulles ut med imaget; bøttekopien er en KOPI.
Lager du kortet på nytt uten å laste det opp, serverer prod det gamle kortet
for alltid — 200, ingen loggrad, synlig bare for den som fikk lenken. Derfor er
opplastingen et program og ikke et punkt i denne lista:

- Kortet **skrives hver gang**, som i `books`. Det koster en håndfull kilobyte
  og fjerner hele klassen «bildet forsvant fordi noen ryddet i bøtta».
- Den **verifiserer før den skriver ut adressen**, og gjør det ANONYMT: den
  henter objektet tilbake og krever bit-identiske byte. Skrivingen kan lykkes
  uten at objektet kan leses utenfra — det er ACL-en, ikke opplastingen, som
  avgjør om delingen virker.
- `bun scripts/upload-og-card.ts sjekk` svarer på om den PUBLISERTE adressen
  (`OG_IMAGE_URL`, når den er satt) fortsatt er lik kilden. Den skriver ingenting
  og trenger ingen nøkler, så den kan kjøres etter hver deploy.

**Endrer kortet MOTIV, bytt filnavnet i `DELEKORT`.** Skraperne cacher per URL,
så en overskrevet fil viser det gamle motivet i ukevis uten at noe sier fra.
Målene i filnavnet er der av samme grunn.

Vakta er `test/og-card-upload.test.ts`.
