// bibels tilgjengelighetserklæring — DATAENE (portal/TILGJENGELIGHET.md,
// flogvit-com#341, #163).
//
// Siden og strengene er fellesdelen i `tilgjengelighet.ts`, en kopi av
// portalens fil byte for byte. Det som står HER, er bibels egne data: når
// erklæringen ble laget, når flata sist ble testet, hva som ikke holder ennå.
// Endres noe av det, er det denne fila som oppdateres — og datoene med den.
// `test/tilgjengelighet.test.ts` blir rød når `testet` er mer enn et år
// gammel; da er det tid for den årlige gjennomgangen (TILGJENGELIGHET.md).

import type { Erklaering } from './tilgjengelighet.ts';

export const ERKLAERING: Erklaering = {
  nettsted: 'bible.flogvit.com',
  status: 'fullt',
  // Den første erklæringen kom med «Add accessibility testing and statement page».
  laget: '2026-01-23',
  // 3.1.2 for hebraiske og greske ord inne i forklaringene ble rettet i #166.
  oppdatert: '2026-10-30',
  testet: '2026-10-30',
  brudd: [],
  omfang: {
    en: 'Tested with axe-core, a visible-focus check and the keyboard, in light and dark mode: every page type in English — the front page, chapters (also in Hebrew and Greek), verse references, search (also in the original text), persons, themes, stories, numbers, days, prophecies, parallels, the timeline, statistics, reading texts, the reading plan and map, favourites, notes, topics, verse lists, settings, manuscripts and the catalogue, the editor, contributions, translations, offline reading, about, this statement, the change log, the MCP guide, the API documentation and the 404 and 410 pages. The front page, chapters, search, settings, about, offline reading, this statement and the 404 page in all eight languages; the pages that change for a signed-in reader also signed in with FLOGVIT.plus, in English and Norwegian. Pages are also checked at 320 and 390 px with text enlarged to 150 %.',
    nb: 'Testet med axe-core, en sjekk av synlig fokus og tastaturet, i lys og mørk modus: hver sidetype på engelsk — forsiden, kapitler (også på hebraisk og gresk), versreferanser, søk (også i grunnteksten), personer, temaer, historier, tall, dager, profetier, paralleller, tidslinjen, statistikk, lesetekster, leseplanen og lesekartet, favoritter, notater, emner, verslister, innstillinger, manuskripter og katalogen, editoren, bidrag, oversettelser, offline-lesing, om, denne erklæringen, endringsloggen, MCP-veiledningen, API-dokumentasjonen og 404- og 410-sidene. Forsiden, kapitler, søk, innstillinger, om, offline-lesing, denne erklæringen og 404-siden på alle åtte språk; sidene som endrer seg for en innlogget leser også innlogget med FLOGVIT.plus, på engelsk og bokmål. Sidene er også målt på 320 og 390 px med tekst forstørret til 150 %.',
  },
};
