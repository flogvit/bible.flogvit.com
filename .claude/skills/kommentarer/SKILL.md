---
name: kommentarer
description: Bibelkommentarene (#269) — Matthew Henry først — som innholdsmodul: tabellene, importen fra generate/commentary/, forankringen fra KJV til osnb, blokka på kapittelsiden, API, MCP, søk og frakoblet lesing. Les før du endrer commentary*.ts, views/commentary.tsx, public/js/commentary-render.js eller kommentarimporten, og når en ny bok eller et nytt verk skal ut.
---

# Bibelkommentarer (#269)

## Slik får du en ny ferdig bok ut (how-to)

1. free-bible legger boka i `generate/commentary/<verk>/<språk>/<bok>/` og en
   linje for den i `generate/commentary/<verk>/<språk>/index.json`. Ingen
   kodeendring her.
2. Rull ut dataene fra flogvit.com-utsjekken: `bash server/deploy-bibel-data.sh`.
3. Sjekk: `https://bible.flogvit.com/nb/<bok>/1` viser blokka «Kommentar» med
   en norsk smakebit per del, og en del åpner seg i lesevisningen (#286).

En bok som IKKE står i `index.json` importeres ikke på det språket, selv om
katalogen finnes: index.json er free-bibles «ferdig og kontrollert». Leseren
ser da kildeteksten (engelsk) merket «Ikke oversatt til ditt språk ennå».
Kildespråket (`meta.json` → `language`) importeres alltid helt.

## Et nytt verk eller en ny tabell

- Et nytt verk er en ny katalog `generate/commentary/<verk>/` med `meta.json`
  (title, author, written, language, license, url). Ingen kodeendring: bryteren
  i Innstillinger leses fra `commentary_works`. Tittelen på leserens språk er
  `cm.work.<id>` i `dictionaries-commentary.ts`; uten nøkkel vises meta-tittelen.
- En ny innholdsTABELL (som `commentary_works`/`commentary_sections` var) krever
  at MCP-brukerens grants kjøres på nytt i prod FØR utrullingen, ellers svarer
  `mcp.bible.flogvit.com/healthz` 503, MCP ruller tilbake og hele
  `deploy-bibel-hono.sh` melder feil. Grantene kjøres med
  `bash server/deploy-bibel-mcp.sh --provision`, som roterer admin- og
  bibel-mcp-passordet — det er GRANT mot prod, så eieren sier ja først.

## Reglene

- **Forankring:** Matthew Henry følger KJV-nummereringen; lesesiden er osnb
  (hebraisk). Importen flytter hver seksjon til osnb (`osnbTranslator`, samme
  vei som utgaveimporten: KJV → osmain → osnb). KJV 2 Mos 8:1–4 står derfor på
  osnb 7:26–29. En innledning (vers 0) står i osnb-kapittelet der FLEST av
  kapittelets vers lander (`anchorChapterSections`).
- **Regelversjonen** `COMMENTARY_IMPORT_RULES` er med i importens hash: løft den
  når forankringen eller det som lagres endres, ellers står alt importert med
  de gamle ankrene.
- **Språk:** `getCommentaryForChapter` følger `contentLanguageChain`, med
  kildens språk sist. En gjengivelse får kildens avsnitt med seg (samme
  seksjonsnummer, avsnitt i = avsnitt i). Finnes ingen gjengivelse, vises
  kilden og `sourceOnly` sier det.
- **Markup:** kildens `<h>`, `<i>`, `<b>`, `<sup>` og `<ref osisRef>`. ÉN rendrer,
  `public/js/commentary-render.js`, brukt av både serveren og frakoblet lesing:
  den escaper alt først og gjenoppretter bare disse taggene.
- **Formen (#286):** `shapeCommentary` (i `commentary-render.js`, kjørt i
  `getCommentaryForChapter` og av frakoblet lesing for gamle nedlastinger)
  fjerner versitatene (`<sup>N</sup>` først i avsnittet) og deler det kilden
  har limt inn foran første seksjon av kapittel 1: det SISTE avsnittet som
  ikke er overskrift er kapittelets innledning (`<kap>-<nr>-intro`), resten er
  bokas innledning (`book`, sammen med kildekapittel 0). Målt over alle 66
  bøkene. Delingen regnes på kildens indekser; stemmer ikke antallet, får delen
  ingen original. Adressen er `cm-<verk>-<del-id>`.
- **Visningen (#286):** bare leserens språk; kilden bak én lukket `<details>`
  per del (#269s «side om side» er overstyrt av eieren 27.11). Studiepanelet
  viser etikett + første linjer; teksten leses i `<dialog data-cm-reader>`,
  så bred som `.chapter-content` og i versteksten størrelse (studium.js).
  Bokas innledning står i «Sammendrag». Uten JS viser `:target` delen.
- **Bryterne (#286):** `bible-settings.commentaries.<id>`, på som standard;
  den gamle `showCommentary: false` gjelder til leseren velger per verk
  (`commentaryOn`). Alt som viser et verk bærer `data-commentary-work`, og
  `hideCommentariesTurnedOff` skjuler det (lesesiden, søket, frakoblet).
- **Vakter:** `test/commentary.test.ts` (forankring, OSIS, rendrer),
  `test/commentary-shape.test.ts` (formen og bryterregelen),
  `test/commentary-page.test.ts` (språket, forordet, panelet, innstillinger,
  søket, API-et), `test/commentary-mobile.test.ts` (ekte Chrome: 320/390 px ×
  100/150 % tekst, lesevisningens bredde og skrift, Tilbake, et avslått verk),
  `mcp/test/server.test.ts` (get_chapter_study).
