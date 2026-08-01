// EN INNHOLDSTABELL UTEN KILDE SKAL IKKE BLI STÅENDE STILLE (GitHub #58).
//
// Importøren har en slettesti for RADER som forsvinner fra en kildekatalog
// (`syncDeletions`), men ingen for at hele KATALOGEN forsvinner:
// `contentLanguages('important_verses')` returnerte `[]` da free-bible slettet
// `generate/important_verses`, løkka hoppet over, og 62 rader ble stående og
// drev en side i produksjon i månedsvis. Importen rapporterte «ingen endringer»
// hver eneste gang — den forteller hva den KASTER, ikke hva den ikke lenger
// FINNER, og en manglende katalog ser derfor nøyaktig ut som ingenting nytt.
//
// Vakta har to halvdeler:
//
//   REGELEN — ren logikk: en tabell med rader hvis kildekatalog er borte er
//   foreldreløs; er katalogen der, eller er tabellen tom, er den det ikke.
//
//   FORMEN — strukturell: hver import-eid tabell må ha en DEKLARERT kilde, ellers
//   en begrunnet plass blant de kildeløse. En ny innholdstype som ingen fører
//   opp er nøyaktig hullet #58 gikk gjennom, og lista kan ikke råtne: en
//   oppføring som ikke lenger er en tabell gjør testen rød.
//
// GRENSEN: DATA-halvdelen (finnes katalogen faktisk på disk nå?) hører hjemme i
// importen, ikke her. Den kan bare måles der free-bible finnes, og en test som
// hoppet stille over seg selv når kilden mangler ville vært blind på nøyaktig
// den maskinen der problemet oppstår.

import { describe, expect, test } from 'bun:test';
import {
  CONTENT_TABLES,
  CONTENT_SOURCES,
  SOURCELESS_TABLES,
  orphanedContentSources,
  formatOrphanReport,
  contentSourceReport,
} from '../src/lib/content-sources.ts';
import { TABLES } from '../src/lib/schema.ts';

describe('REGELEN: hva som er en foreldreløs innholdstabell', () => {
  // `themes` er bare et stedfortreder-eksempel: regelen kjenner ingen
  // innholdstype, den ser bare på kilden og radene.
  test('en tabell med rader og uten kildekatalog er foreldreløs', () => {
    const funn = orphanedContentSources(new Set(['stories']), { themes: 62, stories: 12 });
    expect(funn).toEqual([{ table: 'themes', source: 'themes', rows: 62 }]);
  });

  test('en tabell hvis kildekatalog finnes er ikke foreldreløs', () => {
    expect(orphanedContentSources(new Set(['themes', 'stories']), { themes: 62, stories: 12 })).toEqual([]);
  });

  // Uten radtellingen ville hver innholdstype vi ikke har importert ennå blitt
  // meldt ved hver kjøring, og en advarsel som alltid står er en advarsel ingen
  // leser. Det er de STÅENDE radene som er problemet.
  test('en tom tabell uten kilde er ikke foreldreløs — det er ingenting igjen', () => {
    expect(orphanedContentSources(new Set(), { important_verses: 0 })).toEqual([]);
  });

  // Kildeløse tabeller (books, verses, content_hashes …) fylles ikke fra en
  // katalog under generate/ og kan derfor aldri bli foreldreløse på denne måten.
  test('kildeløse tabeller meldes aldri', () => {
    const rows = Object.fromEntries(Object.keys(SOURCELESS_TABLES).map((t) => [t, 100]));
    expect(orphanedContentSources(new Set(), rows)).toEqual([]);
  });

  test('rapporten navngir tabellen, kilden og hvor mange rader som står igjen', () => {
    const tekst = formatOrphanReport([{ table: 'themes', source: 'themes', rows: 62 }]);
    expect(tekst).toContain('themes');
    expect(tekst).toContain('generate/themes');
    expect(tekst).toContain('62');
  });
});

// DIAGNOSEN. Funnet over ble gjort ved å kjøre importen i et arbeidstre: der
// peker standard `FREE_BIBLE_DIR` (`../free-bible` fra cwd) på ingenting, og
// importen leste null filer, skrev null rader og sa «Ingen endringer … Ferdig!»
// med exit 0. Uten dette skillet ville den nye vakta meldt samtlige 33
// innholdstabeller som foreldreløse — 33 riktige linjer om feil problem, og den
// ene setningen operatøren trenger («du peker på feil katalog») ville druknet.
describe('DIAGNOSEN: mangler ÉN kilde eller HELE kildetreet?', () => {
  const rowCounts = { themes: 62, stories: 12 };

  test('mangler hele generate/, er det kildetreet som meldes — ikke hver tabell', () => {
    const rapport = contentSourceReport({
      generatePath: '/et/sted/free-bible/generate',
      generateExists: false,
      presentSources: [],
      rowCounts,
    })!;
    expect(rapport).toContain('/et/sted/free-bible/generate');
    expect(rapport).toContain('FREE_BIBLE_DIR');
    expect(rapport).not.toContain('themes');
  });

  test('finnes kildetreet, meldes den enkelte foreldreløse tabellen', () => {
    const rapport = contentSourceReport({
      generatePath: '/et/sted/generate',
      generateExists: true,
      presentSources: ['stories'],
      rowCounts,
    })!;
    expect(rapport).toContain('themes');
    expect(rapport).toContain('62');
  });

  test('er alt på plass, sies ingenting', () => {
    expect(
      contentSourceReport({
        generatePath: '/et/sted/generate',
        generateExists: true,
        presentSources: ['themes', 'stories'],
        rowCounts,
      }),
    ).toBeNull();
  });
});

describe('FORMEN: hver import-eid tabell er klassifisert', () => {
  test('ingen import-eid tabell mangler kilde eller begrunnelse', () => {
    const uklassifiserte = CONTENT_TABLES.filter(
      (t) => !(t in CONTENT_SOURCES) && !(t in SOURCELESS_TABLES),
    );
    expect({
      uklassifiserte,
      hint: 'ny innholdstype: legg tabellen i CONTENT_SOURCES med kildekatalogen, eller i SOURCELESS_TABLES med en begrunnelse',
    }).toEqual({ uklassifiserte: [], hint: expect.any(String) });
  });

  test('ingen tabell står begge steder', () => {
    const begge = Object.keys(CONTENT_SOURCES).filter((t) => t in SOURCELESS_TABLES);
    expect({ begge }).toEqual({ begge: [] });
  });

  test('klassifiseringen har ingen døde oppføringer', () => {
    const eide = new Set(CONTENT_TABLES);
    const døde = [...Object.keys(CONTENT_SOURCES), ...Object.keys(SOURCELESS_TABLES)].filter(
      (t) => !eide.has(t),
    );
    expect({ døde }).toEqual({ døde: [] });
  });

  test('hver kildeløse tabell har en begrunnelse', () => {
    const uten = Object.entries(SOURCELESS_TABLES)
      .filter(([, grunn]) => !grunn.trim())
      .map(([t]) => t);
    expect({ uten }).toEqual({ uten: [] });
  });

  // Lista over eide tabeller kan heller ikke drive fra skjemaet: en tabell som
  // er fjernet fra `TABLES` men blir stående her ser ut som en beslutning.
  test('hver eid tabell finnes i skjemaet', () => {
    const iSkjema = new Set(
      TABLES.map((ddl) => /CREATE TABLE IF NOT EXISTS (\w+)/.exec(ddl)?.[1]).filter(Boolean),
    );
    const ukjente = CONTENT_TABLES.filter((t) => !iSkjema.has(t));
    expect({ ukjente }).toEqual({ ukjente: [] });
  });

  // DET MÅLTE TILFELLET (#58). Sveipen over ville bestått på en liste der noen
  // hadde ført `important_verses` opp som kildeløs — dette er påstanden om at
  // tabellen er UTE, ikke omklassifisert.
  test('important_verses er ute av alle tre listene', () => {
    expect(CONTENT_TABLES).not.toContain('important_verses');
    expect(CONTENT_SOURCES).not.toHaveProperty('important_verses');
    expect(SOURCELESS_TABLES).not.toHaveProperty('important_verses');
  });
});
