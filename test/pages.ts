// Sidematrisen — DELT mellom sidekontrakten (`page-contract.test.ts`) og
// layout-vakten (`mobile-layout.test.ts`). Én liste, så en ny side kommer inn
// under BEGGE sveipene med én oppføring — ikke to som driver fra hverandre.

/**
 * Representative sider. Målet er DEKNING AV KOMPONENTER, ikke av URL-er: hver
 * oppføring skal dra inn minst én komponent de andre ikke rører.
 *
 * `status` er svaret siden SKAL gi (default 200). Sider som ikke svarer 200
 * rendrer likevel HTML og hører derfor til i matrisen — 404-siden og 410-siden
 * (#58) skal følge de samme invariantene som resten. Feltet står her og ikke som
 * en `if` i sidekontrakten: da eier lista regelen, og den neste slike siden
 * arver den uten at noen må røre vakta.
 */
export const PAGES: { path: string; name: string; status?: number }[] = [
  { path: '/', name: 'forsiden' },
  { path: '/1mos/1', name: 'kapittelsiden (TOC, skinne, versdetaljer, referanser)' },
  // 1 Mos 1 har INGEN personer, så studieblokka for personer rendres ikke der.
  // Mutasjonstesting avslørte det: en uprefikset lenke i den blokka slapp
  // gjennom kontrakten. Disse to drar inn de betingede blokkene.
  { path: '/1mos/12', name: 'kapittel med personer og profetier' },
  { path: '/matt/1', name: 'kapittel med evangelieparalleller' },
  { path: '/profetier', name: 'profetier' },
  { path: '/paralleller', name: 'evangelieparalleller' },
  { path: '/statistikk', name: 'statistikk' },
  { path: '/tall', name: 'tallsymbolikk' },
  // Detaljsiden, ikke bare oversikten: brødsmulen og <title> sto med «Tallet 7»
  // på alle åtte språk (#63, samme klasse som kapittelsmulen). En side som ikke
  // står her, står utenfor ALLE invariantene — og da ser sveipen den ikke.
  { path: '/tall/7', name: 'tallsymbolikk (detalj)' },
  { path: '/lesetekster', name: 'lesetekster' },
  { path: '/personer', name: 'personer (verse-display)' },
  { path: '/temaer', name: 'temaer (studiekort)' },
  { path: '/historier', name: 'historier' },
  { path: '/tidslinje', name: 'tidslinje' },
  { path: '/dager', name: 'dager' },
  { path: '/oversettelser', name: 'oversettelser' },
  { path: '/leseplan', name: 'leseplan' },
  { path: '/lesekart', name: 'lesekart (heatmap)' },
  { path: '/innstillinger', name: 'innstillinger' },
  { path: '/favoritter', name: 'favoritter' },
  { path: '/manuskripter', name: 'manuskripter' },
  { path: '/manuskripter/katalog', name: 'manuskriptkatalogen (#15, del 2)' },
  { path: '/om', name: 'om' },
  { path: '/sok?q=gud', name: 'søk med treff' },
  // Brukersidene og detaljsidene manglet i matrisen, og der lå det norsk igjen
  // som sveipen ikke kunne se — den sjekker bare sidene som STÅR her. Ny side
  // ⇒ legg den til, ellers er den utenfor alle invariantene.
  { path: '/emner', name: 'emner' },
  { path: '/notater', name: 'notater' },
  { path: '/lister', name: 'verslister' },
  { path: '/offline', name: 'offline' },
  { path: '/bidra', name: 'bidra' },
  // Med opphav (#57): brødsmulene får et tredje ledd som ingen annen side
  // rendrer, og rada er den lengste /bidra kan få på en smal skjerm.
  { path: '/bidra?vers=1mos-1-3', name: 'bidra med vei tilbake til verset' },
  // Med TREFF, ikke uten: treffteksten («2 matches (Hebrew).») er egen kode som
  // aldri rendres på en tom søkeside, og der lå det hardkodet norsk igjen.
  { path: '/sok/original?q=%D0%B0%D0%BB', name: 'søk i grunnteksten (uten treff)' },
  { path: '/sok/original?q=%D7%91%D7%A8%D7%90', name: 'søk i grunnteksten (med treff)' },
  // Editoren og redigeringsvisningen manglet, og der lå det hardkodet norsk
  // (#43). En side som ikke står her, står utenfor ALLE invariantene.
  { path: '/tekst', name: 'bibelpassasjer (/tekst, tom tilstand)' },
  { path: '/manuskripter/ny', name: 'manuskript-editor (ny)' },
  { path: '/manuskripter/et-manuskript/rediger', name: 'manuskript-editor (rediger)' },
  { path: '/tilgjengelighet', name: 'tilgjengelighet' },
  { path: '/changes', name: 'endringslogg' },
  { path: '/finnes-ikke', name: '404-siden', status: 404 },
  // 410-siden (#58). En fjernet side RENDRES fortsatt — den skal si at den er
  // borte — og en side som ikke står her står utenfor alle invariantene.
  { path: '/kjente-vers', name: '410-siden (fjernet, #58)', status: 410 },
];
