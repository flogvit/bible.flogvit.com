# Delekortet — hvordan du lager det på nytt

Kortet er bildet en delt lenke til bible.flogvit.com viser på Facebook,
LinkedIn, Slack, iMessage og Discord (#65). Det ligger som `public/og.png` og
deklareres av sidemalen; **hvorfor** det ser slik ut står i `../../CLAUDE.md`
→ «Delekortet».

## Lag det på nytt

```bash
bun scripts/generate-og-card.ts   # assets/og/card.html -> public/og.png
bun test test/share-card.test.ts  # bekrefter at målene stemmer med taggene
git add public/og.png && git commit
```

Skriptet krever Chrome — samme som layout-vakta. Finner det ingen, sier det
hvilke stier det prøvde; `CHROME_BIN` overstyrer.

Kjør det når du har endret `card.html`, eller når identiteten i
`portal/STYLE.md` endres (papirfargen, lær-aksenten, wordmarken). Kortet er en
brand-ressurs som ellers står i ro, så det er **ikke** en del av deployen:
`public/og.png` ligger i git og rulles ut med imaget.

## Hva du kan endre

`card.html` er kilden. Fargene og skriftreglene der er kopiert fra
`portal/STYLE.md` — familien deler identitet ved å kopiere verdier, ikke ved en
delt pakke, så endrer du dem her skal de allerede være endret der.

Målene 1200x630 er derimot ikke frie: sidemalen deklarerer dem i
`og:image:width`/`:height`, og `test/share-card.test.ts` leser bildets ekte mål
ut av PNG-en og krever at de tre er enige. Skal kortet ha andre mål, endres
`SHARE_CARD_WIDTH`/`HEIGHT` i `src/lib/share-card.ts` og konstantene i
generatoren i samme slengen.

## Skriftene

`fonts/` er de to familieskriftene fra `portal/STYLE.md`, latin-utsnittet,
kopiert fra `image/public/fonts/`. De ligger her for at generatoren skal virke i
et ferskt arbeidstre uten nett og uten et søskenrepo — de lastes ikke av appen,
som henter dem fra Google Fonts som før.

Begge er **SIL Open Font License 1.1**: Schibsted Grotesk (Schibsted) og IBM
Plex Mono (IBM). Lisensen tillater videredistribusjon; fontene kan ikke
videreselges alene eller distribueres modifisert under samme navn.

## Flytt til objektlagring

Porteføljeregelen er at bilder hører i objektlagring, også systeminnhold
(`flogvit.com/docs/KONVENSJONER.md` → «Objektlagring»). Bøtta `bibel` finnes
ikke ennå, så kortet serveres fra vårt eget opphav inntil den gjør det.

Når bøtta finnes:

1. Last opp `public/og.png` (public-read).
2. Sett `OG_IMAGE_URL=<absolutt URL>` i `bibel.env` og restart.

Det er hele flyttingen — ingen kodeendring. `share-card.test.ts` holder
knappen i live, så den virker den dagen den brukes.
