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
   den norske teksten og kilden ved siden av.

En bok som IKKE står i `index.json` importeres ikke på det språket, selv om
katalogen finnes: index.json er free-bibles «ferdig og kontrollert». Leseren
ser da kildeteksten (engelsk) merket «Ikke oversatt til ditt språk ennå».
Kildespråket (`meta.json` → `language`) importeres alltid helt.

## Et nytt verk eller en ny tabell

- Et nytt verk er en ny katalog `generate/commentary/<verk>/` med `meta.json`
  (title, author, written, language, license, url). Ingen kodeendring.
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
- **Layout:** side om side er en container-spørring på blokka (40rem), ikke
  vinduets bredde; i sidepanelet og på telefon står kilden under. Vakt:
  `test/commentary-mobile.test.ts` (ekte Chrome, 320/390 px × 100/150 % tekst,
  og 900 px der de står side om side). To mutasjoner kjørt.
- **Vakter:** `test/commentary.test.ts` (forankring, OSIS, rendrer),
  `test/commentary-page.test.ts` (blokka, språkkjeden, API-et),
  `mcp/test/server.test.ts` (get_chapter_study).
