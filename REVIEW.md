# Review av manuskripter til den åpne katalogen

Runbook for `/manuskripter/katalog` (GitHub #15, del 2). Designbegrunnelsen —
hvorfor teksten fryses, hvorfor rapporter ikke skjuler noe — står i `CLAUDE.md`;
her står hvordan jobben gjøres.

Contrib har sin egen runbook (`../free-bible/contrib/README.md`) og er en ANNEN
flate: der er innsendingen data som havner i innholdstabellene. Dette er
brukerens egen tekst, og den blir aldri innholdsdata.

## Legitimasjonen

`REVIEW_TOKEN` er hele adgangskontrollen — det finnes ingen innlogging for
review. To endepunkter sjekker headeren `x-review-token` mot env-variabelen:

- `GET /api/publications/pending`
- `POST /api/publications/decide`

Uten variabelen i env **finnes ikke endepunktene** (404); feil verdi gir 403.
Verdien er den samme på VM-en (`server/bibel.env`) og hos den som reviewer
(`bibel/.env`, gitignorert). Roteres den, må begge settes samtidig — ellers
svarer prod 403 på hver kommando.

## Kommandoene

Kjøres fra `bibel/`. Tokenet leses fra `.env`, så det trenger ikke stå på linja.

```bash
bun scripts/publications-review.ts                  # køen + rapporterte
bun scripts/publications-review.ts vis <slug>       # hele teksten
bun scripts/publications-review.ts godkjenn <slug>
bun scripts/publications-review.ts avvis <slug> "begrunnelse"
```

Mot en lokal server: `BIBLE_URL=http://localhost:8080 bun scripts/…`.

Køen viser to lister:

1. **Til vurdering** — venter på svar, eldste først.
2. **Rapportert, men fortsatt publisert** — allerede ute, og noen har reagert.
   Rapporter skjuler ingenting av seg selv, så denne lista er det eneste stedet
   de dukker opp.

## Hva du faktisk vurderer

Du leser **hele teksten** (`vis`), ikke utdraget i køen. Utdraget er 100 tegn og
sier ingenting om hva som står lenger nede — det er nettopp der en innsending
som vil noe annet, plasserer det.

Terskelen er lav, men ikke fraværende: dette er andakter og prekener, ikke en
kvalitetskonkurranse. Avvis når teksten er:

- **reklame eller lenkespam** — inkludert en ellers grei andakt som ender i en
  produktlenke;
- **ikke et manuskript** — testinnsendinger, tomme skall, noen få ord;
- **åpenbart kopiert** uten kildeangivelse (søk på en karakteristisk setning);
- **angrep på personer eller grupper.** Teologisk uenighet er ikke det — vi
  publiserer tekster vi selv ville formulert annerledes, det er hele poenget med
  en åpen katalog.

Den redaksjonelle linja er Vegards; lista over er et gulv, ikke en smaksdom.

**Begrunnelsen er obligatorisk ved avvisning** (skriptet nekter uten), fordi den
er det ENESTE svaret forfatteren får. Den vises på hans egen manuskriptside.
Skriv den til ham, ikke til arkivet: «For mye reklame for [x] til at den kan stå
i en åpen katalog» er nyttig; «avvist» er det ikke.

## Hva som skjer etterpå

| Handling | Katalogen | Forfatteren ser |
|---|---|---|
| `godkjenn` | ute umiddelbart (siden er ikke cachet) | «Publisert» + lenke |
| `avvis` | forblir usynlig | «Ikke godtatt» + begrunnelsen din |
| forfatteren redigerer og publiserer på nytt | den godkjente kopien forsvinner mens den venter | «Til vurdering» |
| forfatteren trekker | borte umiddelbart, adressen 404-er | ingen oppføring |
| forfatteren sletter manuskriptet | borte, selv om teksten ligger frosset i tabellen | — |

Merk raden i midten: **du godkjenner en tekst, ikke en person.** En redigering
går tilbake i kø, og det er med vilje — ellers ville godkjenningen vært en
vaskeritjeneste for hva som helst.

En ny avgjørelse nullstiller rapport-telleren: den gjaldt teksten du nettopp så
på.

## Det som ikke finnes ennå

**Ingenting varsler deg om at noen venter.** Køen er ren pull, og en kø ingen får
beskjed om, er en kø ingen tømmer. Riktig sted for en teller er `dashboard/`
(tavle) — ikke vakt-varslene, som med vilje har terskelen «varsle bare når noe
hos oss er eksponert». En rutinekø der ville gjort kanalen verdiløs.

Inntil da: kjør kommandoen over med jevne mellomrom. Én innsending som blir
liggende i to uker er verre for forfatteren enn et avslag.
