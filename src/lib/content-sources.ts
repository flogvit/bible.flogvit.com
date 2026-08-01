// Hvilken KILDEKATALOG hver import-eide innholdstabell fylles fra (GitHub #58).
//
// Importøren rydder rader som forsvinner fra en kildekatalog (`syncDeletions`),
// men hadde ingen sti for at hele katalogen forsvinner. Da free-bible slettet
// `generate/important_verses` ga `contentLanguages()` bare `[]`, løkka hoppet
// over, og 62 rader ble stående og drev `/kjente-vers` i produksjon — med
// nøyaktig de feilene kilden ble slettet for. Importen sa «ingen endringer»
// hver gang: den rapporterer hva den KASTER, ikke hva den ikke lenger FINNER,
// og en manglende katalog ser derfor ut som ingenting nytt.
//
// Derfor er koblingen tabell → kilde skrevet ned ett sted, og
// `test/content-sources.test.ts` krever at hver eid tabell står her. En ny
// innholdstype arver sjekken gratis; en som ikke passer inn må begrunnes blant
// `SOURCELESS_TABLES` framfor å bli glemt.

/**
 * Innholdstabellene import-pipelinen EIER. Brukertabellene røres aldri.
 *
 * Lista bor her og ikke i `import-bible.ts` fordi vakta må kunne lese den uten
 * å kjøre importen (skriptet importeres ikke — det EKSEKVERER).
 */
export const CONTENT_TABLES: readonly string[] = [
  'books',
  'verses',
  'bible_editions',
  'word4word',
  'references_',
  'book_summaries',
  'book_context',
  'chapter_summaries',
  'chapter_context',
  'important_words',
  'verse_prayers',
  'verse_sermons',
  'themes',
  'timeline_periods',
  'timeline_events',
  'timeline_references',
  'timeline_book_sections',
  'prophecy_categories',
  'prophecies',
  'prophecy_fulfillments',
  'persons',
  'chapter_insights',
  'daily_verses',
  'reading_plans',
  'db_meta',
  'gospel_parallel_sections',
  'gospel_parallels',
  'gospel_parallel_passages',
  'verse_mappings',
  'works',
  'work_verse_refs',
  'days',
  'number_symbolism',
  'reading_texts',
  'reading_text_refs',
  'stories',
  'content_hashes',
];

/**
 * Katalogen under `generate/` hver tabell fylles fra. Flere tabeller kan dele
 * kilde (tidslinja er fire tabeller fra én katalog) — det er katalogen som
 * enten finnes eller ikke.
 *
 * Navnet er katalogen slik den staves på disk, ikke tabellnavnet: `daily_verse`
 * fyller `daily_verses`, og `dnk_lesetekster` fyller `reading_texts`.
 */
export const CONTENT_SOURCES: Record<string, string> = {
  bible_editions: 'bibles_raw',
  word4word: 'word4word',
  references_: 'references',
  book_summaries: 'book_summaries',
  book_context: 'book_context',
  chapter_summaries: 'chapter_summaries',
  chapter_context: 'chapter_context',
  important_words: 'important_words',
  verse_prayers: 'verse_prayer',
  verse_sermons: 'verse_sermon',
  themes: 'themes',
  timeline_periods: 'timeline',
  timeline_events: 'timeline',
  timeline_references: 'timeline',
  timeline_book_sections: 'timeline',
  prophecy_categories: 'prophecies',
  prophecies: 'prophecies',
  prophecy_fulfillments: 'prophecies',
  persons: 'persons',
  chapter_insights: 'chapter_insights',
  daily_verses: 'daily_verse',
  reading_plans: 'reading_plans',
  gospel_parallel_sections: 'gospel_parallels',
  gospel_parallels: 'gospel_parallels',
  gospel_parallel_passages: 'gospel_parallels',
  verse_mappings: 'mappings',
  works: 'verse_works',
  work_verse_refs: 'verse_works',
  days: 'days',
  number_symbolism: 'number_symbolism',
  reading_texts: 'dnk_lesetekster',
  reading_text_refs: 'dnk_lesetekster',
  stories: 'stories',
};

/**
 * Tabeller uten en egen kildekatalog under `generate/`, med grunnen.
 *
 * Hver oppføring er en påstand om at tabellen ikke KAN bli foreldreløs på denne
 * måten — ikke et sted å parkere en innholdstype ingen gadd å koble opp.
 */
export const SOURCELESS_TABLES: Record<string, string> = {
  books: 'boklista står i importskriptet selv og i books-data.ts, ikke under generate/',
  verses: 'bibles_raw/<utgave> — én katalog per oversettelse, styrt av IMPORTED_BIBLES',
  db_meta: 'importens eget bokholderi (sync-versjon, tidsstempler)',
  content_hashes: 'importens eget bokholderi (inkrementell hashing)',
};

export interface OrphanedSource {
  table: string;
  source: string;
  rows: number;
}

/**
 * Tabellene som har RADER, men hvis kildekatalog er borte fra disken.
 *
 * Radtellingen er en del av regelen, ikke pynt: uten den ville hver
 * innholdstype vi ennå ikke har importert blitt meldt ved hver kjøring, og en
 * advarsel som alltid står er en advarsel ingen leser. Det er de stående radene
 * som er problemet.
 */
export function orphanedContentSources(
  presentSources: Iterable<string>,
  rowCounts: Record<string, number>,
): OrphanedSource[] {
  const present = new Set(presentSources);
  const funn: OrphanedSource[] = [];
  for (const [table, source] of Object.entries(CONTENT_SOURCES)) {
    if (present.has(source)) continue;
    const rows = rowCounts[table] ?? 0;
    if (rows === 0) continue;
    funn.push({ table, source, rows });
  }
  return funn;
}

/**
 * Rapporten importen skriver, eller `null` når alt er som det skal.
 *
 * SKILLET mellom «én kilde er borte» og «hele kildetreet er borte» er hele
 * poenget med funksjonen. Kjørt i et arbeidstre peker standard `FREE_BIBLE_DIR`
 * (`../free-bible` fra cwd) på ingenting: importen leser null filer, skriver
 * null rader og melder «Ingen endringer … Ferdig!». Uten skillet ville vakta da
 * listet samtlige innholdstabeller som foreldreløse — riktige linjer om feil
 * problem, og den ene setningen operatøren trenger ville druknet i dem.
 */
export function contentSourceReport(opts: {
  generatePath: string;
  generateExists: boolean;
  presentSources: Iterable<string>;
  rowCounts: Record<string, number>;
}): string | null {
  if (!opts.generateExists) {
    return [
      `KILDEN FINNES IKKE: ${opts.generatePath}`,
      'Importen leser da ingenting og har ingen endringer å melde — den ser vellykket ut.',
      'Sett FREE_BIBLE_DIR til det ekte free-bible-repoet (et arbeidstre har ingen søsterklone).',
    ].join('\n');
  }
  const funn = orphanedContentSources(opts.presentSources, opts.rowCounts);
  return funn.length > 0 ? formatOrphanReport(funn) : null;
}

/** Rapporten som gjør funnet handlingsbart for den som kjører importen. */
export function formatOrphanReport(funn: OrphanedSource[]): string {
  const linjer = funn.map(
    ({ table, source, rows }) => `  ${table}: ${rows} rader, men generate/${source}/ finnes ikke lenger`,
  );
  return [
    'FORELDRELØST INNHOLD — kildekatalogen er borte, radene står igjen:',
    ...linjer,
    'Kilden er slettet i free-bible. Enten skal innholdet ut av appen (rute, navigasjon,',
    'sitemap og tabell), eller så skal kilden tilbake — se GitHub #58.',
  ].join('\n');
}
