---
name: kvn-staging
description: Historien bak kvn-package-stagingen (#62) og hvorfor pakkas devDependencies strippes (#112). Les før du endrer scripts/kvn-staging.ts, stage-kvn.ts, ensure-kvn.ts, bun.lock eller Dockerfilens bun install, eller når bun audit melder noe.
---

<!-- Flyttet ordrett fra CLAUDE.md (#164). Regelen står kort i CLAUDE.md; her er saken. -->

### kvn-package/ er en VENDRET kopi — hvitlista eier hva som er i den (#62)

`@free-bible/kvn` er en `file:`-avhengighet. Katalogen er gitignort (`mappings/`
alene er 109 MB) og må fylles fra `../free-bible/kvn` før `bun install`.

**Det sto som en setning her før — «stages fra `../free-bible/kvn/`» — og det er
for lite til å handle på.** En agent i et ferskt arbeidstre leste den som
«kopier hele kvn-repoet» og fikk med `tests/`, `data/`, `scripts/`, `research/`
og `node_modules/`. `bun test` fra bibel-roten går inn i `kvn-package/` og kjørte
da free-bibles 17 egne testfiler, som leser et råkorpus
(`kvn/../../generate/bibles_raw/osnb`) som ikke finnes her og aldri skal finnes
her. Ingen så det hjemme, for der er katalogen riktig staget:

```
bibel/       bun run test  ->     568 tester,  0 fail, 31 filer
arbeidstre/  bun run test  ->  360 859 tester, 36 fail, 48 filer
```

36 røde tester ingen kunne fikse fra bibel. **Smia bygde hver sak ferdig,
forkastet den med «RØDT», og gjorde den om igjen neste runde** — i repoet med
flest issues i køen.

- **`scripts/kvn-staging.ts` eier hvitlista**: `src`, `mappings`, `package.json`,
  `tsconfig.json`. En HVITLISTE, ikke en svarteliste — en ny katalog i free-bible
  blir holdt ute gratis, mens en svarteliste måtte utvides hver gang.
- **`bun run oppsett`** = `stage-kvn.ts` + `bun install`. Stagingen **river** alt
  som ikke står i hvitlista, så en tidligere full kopi ryddes framfor å bli
  liggende ved siden av den nye — og den sier høyt hva den fjernet.
- **`test`, `typecheck` og `dev` kjører `ensure-kvn.ts` først.** Det er ikke
  pynt: `bun install` klarer ikke å bootstrappe en `file:`-avhengighet som ikke
  ligger der ennå, og **avslutter med 0** mens den sier «Failed to install 1
  package». `preinstall` redder det ikke — bun resolver `file:`-stier før
  livssyklusskriptene — og bun KOPIERER pakka inn i `node_modules` (109 MB, ikke
  symlink), så det holder ikke å fylle katalogen etterpå. `ensure-kvn` sjekker
  både at pakka er installert OG at inventaret er rent, og reparerer begge.
- **Ikke legg stagingen i `preinstall`.** Dockerfilen kjører `bun install` før
  `COPY scripts ./scripts`, i et lag der free-bible uansett ikke finnes.
- **Vakta er `test/kvn-staging.test.ts`**, og den er strukturell: inventaret må
  være nøyaktig hvitlista, og ingen `*.test.ts` får ligge der `bun test` går inn.
  Mutasjonstestet ved å kopiere inn `tests/` og `data/` på nytt.
- Deployen (`server/deploy-bibel-hono.sh`) kaller samme skript framfor å ha sin
  egen kopiliste. Gamle `.no`-appen (branch `bibel-no`) har fortsatt sine egne
  `cp`-linjer — den branchen har ikke skriptet.
- Porten på orkester-siden er `flogvit-com#40`: smias `finnTestporter` regnet
  `kvn-package/` som en komponent i bibel og krevde free-bibles suite grønn. En
  vendret `file:`-avhengighet er ikke en komponent, og telles ikke lenger.

#### Hvitlista eier også hva pakka DEKLARERER, ikke bare hvilke filer (#112)

`bun audit` meldte to kjente råd — `nanoid` (high) og `postcss` (moderate) —
mot pakker ingen del av bibel importerer. Kjeden var
`@free-bible/kvn (devDependencies) → vitest → vite → postcss → nanoid`: **108
av de 115 pakkene i `bun.lock` var free-bibles eget testverktøy**, låst og
revidert som om det var vårt. Etter fiksen er låsen 7 pakker og
`node_modules` 12 oppføringer mot 573.

- **Hvitlista fra #62 gjelder FILER, og `package.json` er én av dem.** Inni den
  sto et felt som drar hele treet med seg, så hvitlista var halv: den kunne
  hindre at `tests/` ble kopiert inn, men ikke at pakka BA OM verktøyet til å
  kjøre dem. `STRIPPED_FIELDS` i `kvn-staging.ts` er den andre halvdelen.
- **Regelen er installasjonens egen:** en devDependency får man av
  ROT-prosjektet sitt, aldri av en avhengighet. Bun avviker fra det for
  `file:`-avhengigheter — den installerer dem som et arbeidsområde — og det
  avviket er hele saken. `dependencies` strippes IKKE: får kvn en ekte
  kjøretidsavhengighet, trenger vi den.
- **Låsen var dessuten STALE, og det er verre enn det ser ut.** free-bible
  hadde alt sluttet å bruke vitest, men `bun install` beholder en eksisterende
  oppløsning framfor å regne den ut på nytt — så treet ble liggende og
  installert i hvert eneste ferske arbeidstre. En oppgradering av kilden kan
  altså ikke alene rydde her.
- **Stagingen hopper ikke over en reparasjon den er bedt om.**
  `stage-kvn.ts` brukte sin EGEN «er inventaret ok»-sjekk (bare filnavn) i
  fingeravtrykk-snarveien, mens `ensure-kvn.ts` reparerer etter
  `inventoryProblems()`. Med to lister ville ensure bedt om en re-staging som
  stagingen så hoppet over — en reparasjon som aldri skjer. Begge leser nå den
  samme.
- **Vakta er `test/laaste-avhengigheter.test.ts`, formulert på TILHØRIGHETEN og
  ikke på nanoid og postcss** — neste råd kommer mot esbuild eller rollup, som
  lå i den samme kjeden. Den går låsen fra arbeidsområdets egne deps og følger
  bare kjøretidskanter: hver pakke i `bun.lock` må være nådd. Fire halvdeler:
  REGELEN (ren logikk mot en syntetisk lås: rotas egne devDeps blir stående,
  en avhengighets gjør ikke, kjøretidskanter følges gjennom den vendrede pakka,
  en valgfri peer drar ingenting inn, og avhengighetsobjektet finnes på FORM
  siden en `file:`-oppføring er en 2-tuppel og en registry-oppføring en
  4-tuppel), PAKKA (den stagede `package.json` deklarerer ingen av feltene, og
  har fortsatt `exports` — ellers ville «tøm fila» bestått), LÅSEN (sakens eget
  bevis, mot den ekte `bun.lock`) og INGEN STILLE SKIP (låsen må ha pakker og
  rota noe å starte fra, ellers måler sveipen ingenting). Seks mutasjoner kjørt.
- **`bun audit` er verifiseringen, vakta er porten.** Revisjonen krever nett og
  et ferskt rådgiverregister, så den kan ikke stå i suiten; det den ville
  funnet, er uansett en pakke som ikke skulle vært låst.
