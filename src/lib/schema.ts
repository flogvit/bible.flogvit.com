// MySQL-skjemaet for bibel: 1:1-port av SQLite-innholdstabellene (bible.db)
// pluss brukertabellene fra gamle scripts/init-mysql.ts, rekeyet til konto.
//
// Beslutninger (ISSUES.md #2):
// - Collation utf8mb4_danish_ci på alt: behandler æ/ø/å som egne bokstaver
//   (0900_ai_ci ville latt ø matche o i LIKE-søk) og gir norsk case-
//   insensitivitet — strengt bedre enn SQLite, der LOWER()/LIKE bare er
//   ASCII-ufølsom.
// - Ingen FK-er på innholdstabellene: importen kjørte med foreign_keys=OFF i
//   SQLite (de var aldri håndhevet), og import-pipelinen bygger tabeller i
//   vilkårlig rekkefølge. Eneste FK er user_bible_chapters → user_bibles.
// - Store innholdsfelter er MEDIUMTEXT (16MB); verse_map i verse_mappings er
//   LONGTEXT (hele kartet for en oversettelse).
// - Tabeller med VARCHAR-PK der gammel kode lente seg på SQLite-rowid-rekkefølge
//   (implisitt/ties) har en `seq` AUTO_INCREMENT-kolonne som bevarer
//   innsettingsrekkefølgen; spørringene bruker den som (tie)break.
// - `key` i db_meta er reservert ord i MySQL — alle spørringer må backtick-e den.
// - user_id i sync-/brukertabellene er konto-bruker-id (INT, egen database —
//   ingen FK mulig). Bibels egen users-tabell finnes ikke lenger (konto-auth).
//
// SPRÅKDIMENSJON (se lang.ts): alt derivert innhold er språk-scopet med en
// `language`-kolonne som er DEL AV unik-nøkkelen, slik at flere språk kan ligge
// side om side uten å overskrive hverandre. Tre unntak, med vilje:
// - `books`, `verse_mappings`: har egne språkkolonner/-akser (name/name_no,
//   book_names per oversettelse).
// - `verses`, `word4word`: scopet av `bible` (oversettelses-id), som allerede
//   koder språk (osnb, osnn, tanach-nb, …).
// - Barnetabeller med SURROGAT-forelder (`reading_text_refs`): språket følger av
//   forelderraden. Barn med NATURLIG forelder-nøkkel (timeline_references,
//   prophecy_fulfillments, gospel_parallel_passages) har egen kolonne, fordi
//   selve forelder-id-en nå bare er unik sammen med språket.

import type { SQL } from 'bun';
import { DEFAULT_CONTENT_LANGUAGE } from './lang.ts';

const CS = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_danish_ci';

/** Språkkolonnen på innholdstabellene. Default = gulvet, så gamle rader og
 *  språknøytralt innhold beholder sin verdi uten migrering av data. */
const LANG = `language VARCHAR(10) NOT NULL DEFAULT '${DEFAULT_CONTENT_LANGUAGE}'`;

const TABLES: string[] = [
  // --- bibelinnhold (derivert, regenereres av import-pipelinen) ---
  `CREATE TABLE IF NOT EXISTS books (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_no VARCHAR(100) NOT NULL,
    short_name VARCHAR(20) NOT NULL,
    testament VARCHAR(2) NOT NULL CHECK (testament IN ('OT', 'NT')),
    chapters INT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS verses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    text TEXT NOT NULL,
    bible VARCHAR(20) NOT NULL DEFAULT 'osnb',
    versions MEDIUMTEXT,
    footnotes MEDIUMTEXT,
    UNIQUE KEY uq_verses (book_id, chapter, verse, bible),
    INDEX idx_verses_book_chapter (book_id, chapter),
    INDEX idx_verses_bible (bible)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS word4word (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    word_index INT NOT NULL,
    word VARCHAR(255) NOT NULL,
    original TEXT,
    pronunciation TEXT,
    explanation TEXT,
    bible VARCHAR(20) NOT NULL DEFAULT 'osnb',
    UNIQUE KEY uq_word4word (book_id, chapter, verse, word_index, bible),
    INDEX idx_word4word_verse (book_id, chapter, verse, bible)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS references_ (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_book_id INT NOT NULL,
    from_chapter INT NOT NULL,
    from_verse INT NOT NULL,
    to_book_id INT NOT NULL,
    to_chapter INT NOT NULL,
    to_verse_start INT NOT NULL,
    to_verse_end INT NOT NULL,
    description TEXT,
    language VARCHAR(10) NOT NULL DEFAULT 'nb',
    INDEX idx_references_from (from_book_id, from_chapter, from_verse, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS book_summaries (
    book_id INT NOT NULL,
    summary MEDIUMTEXT NOT NULL,
    ${LANG},
    PRIMARY KEY (book_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS book_context (
    book_id INT NOT NULL,
    context MEDIUMTEXT NOT NULL,
    ${LANG},
    PRIMARY KEY (book_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS chapter_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    summary MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_chapter_summaries (book_id, chapter, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS chapter_context (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    context MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_chapter_context (book_id, chapter, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS important_words (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    word VARCHAR(255) NOT NULL,
    explanation TEXT NOT NULL,
    ${LANG},
    INDEX idx_important_words_chapter (book_id, chapter, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS important_verses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    text TEXT,
    ${LANG},
    UNIQUE KEY uq_important_verses (book_id, chapter, verse, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS verse_prayers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    prayer MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_verse_prayers (book_id, chapter, verse, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS verse_sermons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    sermon MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_verse_sermons (book_id, chapter, verse, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS themes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_themes (name, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_periods (
    id VARCHAR(100) NOT NULL,
    timeline_type VARCHAR(50) NOT NULL DEFAULT 'bible',
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20),
    description TEXT,
    sort_order INT,
    ${LANG},
    PRIMARY KEY (id, timeline_type, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_events (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_timeline_events_seq (seq),
    id VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    year INT,
    year_display VARCHAR(100),
    period_id VARCHAR(100),
    importance VARCHAR(20) DEFAULT 'minor',
    sort_order INT NOT NULL,
    timeline_type VARCHAR(50) NOT NULL DEFAULT 'bible',
    region VARCHAR(100),
    book_id INT,
    section_id VARCHAR(100),
    ${LANG},
    PRIMARY KEY (id, language),
    INDEX idx_timeline_events_period (period_id, language),
    INDEX idx_timeline_events_sort (sort_order),
    INDEX idx_timeline_events_type (timeline_type, language),
    INDEX idx_timeline_events_book (book_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_references (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    ${LANG},
    INDEX idx_timeline_references_event (event_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_book_sections (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_timeline_book_sections_seq (seq),
    id VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    chapter_start INT NOT NULL,
    chapter_end INT NOT NULL,
    description TEXT,
    sort_order INT,
    ${LANG},
    PRIMARY KEY (id, book_id, language),
    INDEX idx_timeline_book_sections_book (book_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS prophecy_categories (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_prophecy_categories_seq (seq),
    id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    ${LANG},
    PRIMARY KEY (id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS prophecies (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_prophecies_seq (seq),
    id VARCHAR(100) NOT NULL,
    category_id VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    explanation TEXT,
    prophecy_book_id INT NOT NULL,
    prophecy_chapter INT NOT NULL,
    prophecy_verse_start INT NOT NULL,
    prophecy_verse_end INT NOT NULL,
    ${LANG},
    PRIMARY KEY (id, language),
    INDEX idx_prophecies_category (category_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS prophecy_fulfillments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prophecy_id VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    ${LANG},
    INDEX idx_prophecy_fulfillments_prophecy (prophecy_id, language),
    INDEX idx_prophecy_fulfillments_book (book_id, chapter, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_persons (name, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS chapter_insights (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_chapter_insights (book_id, chapter, language),
    INDEX idx_chapter_insights_book (book_id, chapter, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS daily_verses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date VARCHAR(10) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    note TEXT,
    ${LANG},
    UNIQUE KEY uq_daily_verses (date, language),
    INDEX idx_daily_verses_date (date, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS reading_plans (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_reading_plans_seq (seq),
    id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    days INT NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    PRIMARY KEY (id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS db_meta (
    \`key\` VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS gospel_parallel_sections (
    id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL,
    ${LANG},
    PRIMARY KEY (id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS gospel_parallels (
    id VARCHAR(100) NOT NULL,
    section_id VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    notes TEXT,
    sort_order INT NOT NULL,
    ${LANG},
    PRIMARY KEY (id, language),
    INDEX idx_gospel_parallels_section (section_id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS gospel_parallel_passages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parallel_id VARCHAR(100) NOT NULL,
    gospel VARCHAR(50) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    reference VARCHAR(100) NOT NULL,
    ${LANG},
    INDEX idx_gospel_parallel_passages_parallel (parallel_id, language)
  ) ENGINE=InnoDB ${CS}`,

  // Metadata om selve OVERSETTELSEN (free-bible: bibles_raw/<oversettelse>/meta.json +
  // license.json). `id` er oversettelses-id-en, altså samme verdi som `verses.bible` —
  // raden finnes bare for oversettelser vi faktisk importerer tekst for.
  //
  // Ingen language-kolonne: dette er metadata OM et språk, ikke innhold PÅ et
  // språk (navnet ligger som name.native + name.en i meta-JSON-en).
  //
  // Kolonnene som er trukket ut er de vi lister/sorterer/filtrerer på; resten av
  // feltene leses fra JSON-blobbene på detaljsiden. Samme mønster som
  // themes/persons/stories (utdrag + full `content`), fordi meta.json har svært
  // varierende felter: bare translation/name/language/coverage/features/provenance
  // finnes i alle 82, mens f.eks. year/translators/publisher/place er valgfrie.
  `CREATE TABLE IF NOT EXISTS bible_editions (
    id VARCHAR(50) PRIMARY KEY,
    name_native VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    abbreviation VARCHAR(50),
    lang_iso639_1 VARCHAR(10),
    lang_iso639_3 VARCHAR(10),
    script VARCHAR(20),
    direction VARCHAR(3) NOT NULL DEFAULT 'ltr',
    philosophy VARCHAR(50),
    tradition VARCHAR(50),
    body VARCHAR(255),
    year_published INT,
    testament VARCHAR(10),
    books INT,
    chapters INT,
    verses INT,
    license_name VARCHAR(255),
    license_spdx VARCHAR(100),
    meta MEDIUMTEXT NOT NULL,
    license MEDIUMTEXT,
    INDEX idx_bible_editions_lang (lang_iso639_1)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS verse_mappings (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    book_names MEDIUMTEXT NOT NULL,
    verse_map LONGTEXT NOT NULL,
    unmapped MEDIUMTEXT
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS days (
    id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    PRIMARY KEY (id, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS number_symbolism (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number INT NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_number_symbolism (number, language)
  ) ENGINE=InnoDB ${CS}`,

  // uq_reading_texts er den NATURLIGE nøkkelen (#40). Kildefilene overlapper ved
  // kirkeårsskiftet — 2025-2026.json går ut året 2026 og 2026-2027.json starter
  // i november 2026 — så 18 lesedager fantes to ganger i basen og dukket opp
  // som doble kort. Nøkkelen gjør den klassen umulig.
  `CREATE TABLE IF NOT EXISTS reading_texts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    series VARCHAR(255),
    ${LANG},
    UNIQUE KEY uq_reading_texts (date, name, series, language),
    INDEX idx_reading_texts_date (date, language)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS reading_text_refs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reading_text_id INT NOT NULL,
    title VARCHAR(255),
    display_ref VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT,
    part_start VARCHAR(10),
    part_end VARCHAR(10),
    sort_order INT DEFAULT 0,
    slot_index INT NOT NULL DEFAULT 0,
    option_index INT NOT NULL DEFAULT 0,
    part_index INT NOT NULL DEFAULT 0,
    INDEX idx_reading_text_refs_chapter (book_id, chapter),
    INDEX idx_reading_text_refs_hierarchy (reading_text_id, slot_index, option_index, part_index)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS stories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    keywords TEXT NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    ${LANG},
    UNIQUE KEY uq_stories (slug, language),
    INDEX idx_stories_category (category, language)
  ) ENGINE=InnoDB ${CS}`,

  // language her er SCOPET til hash-oppføringen, ikke nødvendigvis innholdets
  // språk: språknøytrale typer (kapitler, word4word, vers-mappinger) føres på
  // gulvet, slik at eksisterende rader beholder nøkkelen sin og ikke utløser en
  // full reimport når kolonnen kommer til.
  `CREATE TABLE IF NOT EXISTS content_hashes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content_type VARCHAR(50) NOT NULL,
    content_key VARCHAR(255) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    ${LANG},
    UNIQUE KEY uq_content_hashes (content_type, content_key, language),
    INDEX idx_content_hashes_type (content_type),
    INDEX idx_content_hashes_updated (updated_at)
  ) ENGINE=InnoDB ${CS}`,

  // --- verk (artikler/bøker) fra free-bible/generate/verse_works/ ---
  // KVN-kolonnene er bit-shift-kodingen fra kvn/src/types.ts:
  // (book<<20)|(chapter<<12)|(verse<<4)|part — monoton i (bok,kapittel,vers),
  // så range-oppslag «hvilke verk dekker dette verset» er én BETWEEN-spørring.
  `CREATE TABLE IF NOT EXISTS works (
    id VARCHAR(120) PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    title VARCHAR(500) NULL,
    authors VARCHAR(500) NULL,
    year INT NULL,
    container VARCHAR(300) NULL,
    doi VARCHAR(200) NULL,
    isbn13 VARCHAR(13) NULL,
    openlibrary_id VARCHAR(30) NULL,
    url VARCHAR(500) NULL,
    contributors VARCHAR(500) NULL,
    updated VARCHAR(40) NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS work_verse_refs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    work_id VARCHAR(120) NOT NULL,
    kvn_from BIGINT NOT NULL,
    kvn_to BIGINT NOT NULL,
    kvn_ref VARCHAR(150) NULL,
    book_id INT NOT NULL,
    level VARCHAR(10) NOT NULL,
    ref_kind VARCHAR(20) NOT NULL,
    where_page INT NULL,
    where_section VARCHAR(200) NULL,
    INDEX idx_wvr_book (book_id, kvn_from),
    INDEX idx_wvr_work (work_id)
  ) ENGINE=InnoDB ${CS}`,

  // --- brukerdata (sync; user_id = konto-bruker-id) ---
  `CREATE TABLE IF NOT EXISTS sync_items (
    user_id INT NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    data JSON NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (user_id, data_type, item_id),
    INDEX idx_sync_items_user_updated (user_id, updated_at)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS sync_cursors (
    user_id INT NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    last_sync_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, device_id)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS user_bibles (
    id VARCHAR(100) PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    mapping_id VARCHAR(50) NOT NULL,
    verse_counts JSON,
    uploaded_at BIGINT NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_user_bibles_user (user_id)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS user_bible_chapters (
    bible_id VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    data JSON NOT NULL,
    PRIMARY KEY (bible_id, book_id, chapter),
    FOREIGN KEY (bible_id) REFERENCES user_bibles(id) ON DELETE CASCADE
  ) ENGINE=InnoDB ${CS}`,

  // Bruker-innsendte artikler/bøker (free-bible-contrib/1). BRUKERTABELL —
  // aldri inn i import/deploy-data-listene. `status` speiler
  // payload.review.status (kolonne for indeksering; payloaden er kontrakten
  // som pull-skriptet eksporterer til free-bible/contrib/queue/).
  `CREATE TABLE IF NOT EXISTS contrib_submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    kind VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payload JSON NOT NULL,
    review_note TEXT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    reviewed_at BIGINT NULL,
    INDEX idx_contrib_user (user_id, updated_at),
    INDEX idx_contrib_status (status, updated_at)
  ) ENGINE=InnoDB ${CS}`,

  // Delingslenker for manuskripter (#15, del 1). BRUKERTABELL — aldri inn i
  // import/deploy-data-listene.
  //
  // Lenken ER tilgangen: en capability-URL med et ugjettbart token, som leses
  // UTEN innlogging. Derfor:
  // - `token` er primærnøkkelen, så oppslaget er ett indeksert treff og det
  //   ikke finnes noen annen vei inn.
  // - UNIQUE på (user_id, item_id): ett levende token per manuskript. Å
  //   regenerere er å erstatte, og det TREKKER TILBAKE det gamle — to gyldige
  //   lenker til samme tekst ville gjort «trekk tilbake» til en løgn.
  // - `item_id` er sync-item-id-en (`dev-<ts>`), ikke slugen: slugen er avledet
  //   av tittelen, og en delt lenke skal ikke kunne dø av at noen endrer
  //   overskriften.
  `CREATE TABLE IF NOT EXISTS devotional_shares (
    token VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY uq_devotional_shares_item (user_id, item_id)
  ) ENGINE=InnoDB ${CS}`,

  // Åpen katalog for manuskripter (#15, del 2). BRUKERTABELL — aldri inn i
  // import/deploy-data-listene.
  //
  // Review-modellen er MANUELL GODKJENNING av hver publisering. Med dagens
  // volum er den minst å bygge, og den kan vokse til «betrodd konto etter N
  // godkjente» uten at noe må rives — statusfeltet er allerede der.
  //
  // - `slug` er den offentlige adressen og primærnøkkel: lesbar tittel-slug +
  //   seks tilfeldige tegn. Ingen auto_increment i en offentlig URL, og ingen
  //   bruker-id — katalogen skal ikke kunne telles opp bakover til kontoer.
  // - `title`/`content` er et ØYEBLIKKSBILDE tatt ved innsending. Katalogen
  //   viser det som faktisk ble godkjent; leses teksten live, kan en godkjent
  //   forfatter bytte den ut med hva som helst etterpå. Redigering endrer
  //   derfor ikke katalogen — ny innsending gjør, og den går til `pending`.
  // - UNIQUE (user_id, item_id): ett katalogoppslag per manuskript.
  // - `reports` er et SIGNAL til den som reviewer, ikke en automatisk skjuling.
  //   Auto-skjuling på antall rapporter ville vært et nedtakingsvåpen for hvem
  //   som helst.
  `CREATE TABLE IF NOT EXISTS devotional_publications (
    slug VARCHAR(120) PRIMARY KEY,
    user_id INT NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(120) NULL,
    title VARCHAR(255) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    review_note TEXT NULL,
    reports INT NOT NULL DEFAULT 0,
    submitted_at BIGINT NOT NULL,
    decided_at BIGINT NULL,
    UNIQUE KEY uq_devotional_publications_item (user_id, item_id),
    INDEX idx_devotional_publications_status (status, submitted_at)
  ) ENGINE=InnoDB ${CS}`,
];

// --- Migreringer ---------------------------------------------------------
//
// `CREATE TABLE IF NOT EXISTS` treffer bare NYE databaser; en tabell som
// allerede finnes blir stående som den var. Skjemaendringer må derfor uttrykkes
// som eksplisitte, idempotente steg her — de kjøres av `ensureSchema` etter
// CREATE-ene og er no-ops når skjemaet allerede stemmer (altså på nye baser).
//
// Alle språk-scopede tabeller er små (titusener av rader på det meste), så
// ALTER-ene er raske. `verses`/`word4word` — de store — røres ikke.

/** Tabellene som fikk språkdimensjonen, med nøklene den må inn i. */
const LANGUAGE_MIGRATIONS: {
  table: string;
  /** Unik-nøkler/PK som må inneholde language for at språk skal kunne sameksistere. */
  keys: { name: string; columns: string[]; kind: 'primary' | 'unique' | 'index' }[];
  /** Indekser fra inline `UNIQUE` (MySQL navngir dem etter kolonnen) som skal bort. */
  dropLegacy?: string[];
}[] = [
  { table: 'book_summaries', keys: [{ name: 'PRIMARY', columns: ['book_id', 'language'], kind: 'primary' }] },
  { table: 'book_context', keys: [{ name: 'PRIMARY', columns: ['book_id', 'language'], kind: 'primary' }] },
  { table: 'chapter_summaries', keys: [{ name: 'uq_chapter_summaries', columns: ['book_id', 'chapter', 'language'], kind: 'unique' }] },
  { table: 'chapter_context', keys: [{ name: 'uq_chapter_context', columns: ['book_id', 'chapter', 'language'], kind: 'unique' }] },
  { table: 'important_words', keys: [{ name: 'idx_important_words_chapter', columns: ['book_id', 'chapter', 'language'], kind: 'index' }] },
  { table: 'important_verses', keys: [{ name: 'uq_important_verses', columns: ['book_id', 'chapter', 'verse', 'language'], kind: 'unique' }] },
  { table: 'verse_prayers', keys: [{ name: 'uq_verse_prayers', columns: ['book_id', 'chapter', 'verse', 'language'], kind: 'unique' }] },
  { table: 'verse_sermons', keys: [{ name: 'uq_verse_sermons', columns: ['book_id', 'chapter', 'verse', 'language'], kind: 'unique' }] },
  { table: 'themes', keys: [{ name: 'uq_themes', columns: ['name', 'language'], kind: 'unique' }], dropLegacy: ['name'] },
  { table: 'timeline_periods', keys: [{ name: 'PRIMARY', columns: ['id', 'timeline_type', 'language'], kind: 'primary' }] },
  {
    table: 'timeline_events',
    keys: [
      { name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' },
      { name: 'idx_timeline_events_period', columns: ['period_id', 'language'], kind: 'index' },
      { name: 'idx_timeline_events_type', columns: ['timeline_type', 'language'], kind: 'index' },
      { name: 'idx_timeline_events_book', columns: ['book_id', 'language'], kind: 'index' },
    ],
  },
  { table: 'timeline_references', keys: [{ name: 'idx_timeline_references_event', columns: ['event_id', 'language'], kind: 'index' }] },
  {
    table: 'timeline_book_sections',
    keys: [
      { name: 'PRIMARY', columns: ['id', 'book_id', 'language'], kind: 'primary' },
      { name: 'idx_timeline_book_sections_book', columns: ['book_id', 'language'], kind: 'index' },
    ],
  },
  { table: 'prophecy_categories', keys: [{ name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' }] },
  {
    table: 'prophecies',
    keys: [
      { name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' },
      { name: 'idx_prophecies_category', columns: ['category_id', 'language'], kind: 'index' },
    ],
  },
  {
    table: 'prophecy_fulfillments',
    keys: [
      { name: 'idx_prophecy_fulfillments_prophecy', columns: ['prophecy_id', 'language'], kind: 'index' },
      { name: 'idx_prophecy_fulfillments_book', columns: ['book_id', 'chapter', 'language'], kind: 'index' },
    ],
  },
  { table: 'persons', keys: [{ name: 'uq_persons', columns: ['name', 'language'], kind: 'unique' }], dropLegacy: ['name'] },
  {
    table: 'chapter_insights',
    keys: [
      { name: 'uq_chapter_insights', columns: ['book_id', 'chapter', 'language'], kind: 'unique' },
      { name: 'idx_chapter_insights_book', columns: ['book_id', 'chapter', 'language'], kind: 'index' },
    ],
  },
  {
    table: 'daily_verses',
    keys: [
      { name: 'uq_daily_verses', columns: ['date', 'language'], kind: 'unique' },
      { name: 'idx_daily_verses_date', columns: ['date', 'language'], kind: 'index' },
    ],
    dropLegacy: ['date'],
  },
  { table: 'reading_plans', keys: [{ name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' }] },
  { table: 'gospel_parallel_sections', keys: [{ name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' }] },
  {
    table: 'gospel_parallels',
    keys: [
      { name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' },
      { name: 'idx_gospel_parallels_section', columns: ['section_id', 'language'], kind: 'index' },
    ],
  },
  { table: 'gospel_parallel_passages', keys: [{ name: 'idx_gospel_parallel_passages_parallel', columns: ['parallel_id', 'language'], kind: 'index' }] },
  { table: 'days', keys: [{ name: 'PRIMARY', columns: ['id', 'language'], kind: 'primary' }] },
  { table: 'number_symbolism', keys: [{ name: 'uq_number_symbolism', columns: ['number', 'language'], kind: 'unique' }], dropLegacy: ['number'] },
  {
    table: 'reading_texts',
    keys: [
      { name: 'uq_reading_texts', columns: ['date', 'name', 'series', 'language'], kind: 'unique' },
      { name: 'idx_reading_texts_date', columns: ['date', 'language'], kind: 'index' },
    ],
  },
  {
    table: 'stories',
    keys: [
      { name: 'uq_stories', columns: ['slug', 'language'], kind: 'unique' },
      { name: 'idx_stories_category', columns: ['category', 'language'], kind: 'index' },
    ],
    dropLegacy: ['slug'],
  },
  { table: 'content_hashes', keys: [{ name: 'uq_content_hashes', columns: ['content_type', 'content_key', 'language'], kind: 'unique' }] },
];

// --- Omdøpte bibel-ID-er (2026-07-26) ------------------------------------
//
// free-bible omdøpte `osnb2`→`osnb` og `osnn1`→`osnn`. Innholdstabellene hadde
// rettet seg selv ved neste FULLE import, men `content_hashes` gjør importen
// inkrementell (nøkkelen inneholder bibel-ID-en), og `user_bibles` importeres
// aldri på nytt — den er brukerdata. En halvmigrert base gir tom bibeltekst,
// så verdiene renames her, idempotent.
//
// Brukerens INNSTILLINGER må med i samme runde: sync er server-først, så en
// upåvirket serverrad ville skrevet `osnb2` tilbake til klienten ved neste
// sidelast uansett hva klienten gjorde lokalt (`public/js/sync.js` migrerer den
// lokale cachen tilsvarende, for lesingene som skjer før første sync svarer).
// I tillegg tåler serveren de gamle ID-ene fra gamle lenker og eldre klienter
// via `normalizeBibleId` i bible.ts.
const BIBLE_ID_RENAMES: [from: string, to: string][] = [
  ['osnb2', 'osnb'],
  ['osnn1', 'osnn'],
];

/** Kolonner der ID-en er HELE verdien. */
const BIBLE_ID_COLUMNS: [table: string, column: string][] = [
  ['verses', 'bible'],
  ['word4word', 'bible'],
  ['bible_editions', 'id'],
  ['verse_mappings', 'id'],
  ['user_bibles', 'mapping_id'],
];

/** Kolonner der ID-en er PREFIKS i en sammensatt nøkkel (`osnb2-1-1`). */
const BIBLE_ID_PREFIX_COLUMNS: [table: string, column: string][] = [
  ['content_hashes', 'content_key'],
];

/** Skalarfelt i den synkede `settings`-blobben som holder en bibel-/mapping-ID. */
const SETTINGS_BIBLE_KEYS = ['bible', 'secondaryBible', 'verseMapping'] as const;

/**
 * Renamer gamle bibel-ID-er. `UPDATE IGNORE` + påfølgende `DELETE`: står den nye
 * raden der allerede (basen er delvis reimportert med nye ID-er), er den
 * autoritativ og den gamle skal bort — ellers ville unik-nøkkelen stoppet hele
 * migreringen.
 */
async function renameBibleIds(sql: SQL): Promise<void> {
  for (const [from, to] of BIBLE_ID_RENAMES) {
    for (const [table, column] of BIBLE_ID_COLUMNS) {
      if (!(await tableExists(sql, table))) continue;
      await sql.unsafe(`UPDATE IGNORE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`, [to, from]);
      await sql.unsafe(`DELETE FROM \`${table}\` WHERE \`${column}\` = ?`, [from]);
    }

    for (const [table, column] of BIBLE_ID_PREFIX_COLUMNS) {
      if (!(await tableExists(sql, table))) continue;
      await sql.unsafe(
        `UPDATE IGNORE \`${table}\` SET \`${column}\` = CONCAT(?, SUBSTRING(\`${column}\`, ?))
         WHERE \`${column}\` LIKE ?`,
        [to, from.length + 1, `${from}%`],
      );
      await sql.unsafe(`DELETE FROM \`${table}\` WHERE \`${column}\` LIKE ?`, [`${from}%`]);
    }

    if (await tableExists(sql, 'sync_items')) {
      for (const key of SETTINGS_BIBLE_KEYS) {
        await sql.unsafe(
          `UPDATE sync_items SET data = JSON_SET(data, '$.${key}', ?)
           WHERE data_type = 'settings' AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.${key}')) = ?`,
          [to, from],
        );
      }
      // `hiddenBibles` er en array — JSON_SEARCH gir stien til elementet
      // (`$.hiddenBibles[2]`), som JSON_SET så kan bytte ut. Hver ID kan bare
      // forekomme én gang, så «one» er nok.
      await sql.unsafe(
        `UPDATE sync_items
         SET data = JSON_SET(data, JSON_UNQUOTE(JSON_SEARCH(data, 'one', ?, NULL, '$.hiddenBibles')), ?)
         WHERE data_type = 'settings'
           AND JSON_SEARCH(data, 'one', ?, NULL, '$.hiddenBibles') IS NOT NULL`,
        [from, to, from],
      );
    }
  }
}

async function tableExists(sql: SQL, table: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${table}
  `) as { n: number }[];
  return rows.length > 0;
}

async function columnExists(sql: SQL, table: string, column: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 AS n FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `) as { n: number }[];
  return rows.length > 0;
}

/** Kolonnene i en indeks, i nøkkelrekkefølge. Tom liste = indeksen finnes ikke. */
async function indexColumns(sql: SQL, table: string, index: string): Promise<string[]> {
  // Alias eksplisitt: information_schema svarer med VERSALE kolonnenavn.
  const rows = (await sql`
    SELECT column_name AS col FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${index}
    ORDER BY seq_in_index
  `) as { col: string }[];
  return rows.map((r) => r.col.toLowerCase());
}

/**
 * Fjerner dupliserte lesedager, så `uq_reading_texts` kan legges på (#40).
 *
 * Kildefilene i free-bible overlapper ved kirkeårsskiftet: `2025-2026.json` går
 * ut kalenderåret 2026, mens `2026-2027.json` starter i november 2026. De 18
 * lesedagene i snittet ble importert to ganger og vist som doble kort.
 *
 * HØYESTE id vinner, som i importen: den kommer fra den SENERE kildefila, og
 * der er dataene rettet (de to som skilte seg hadde en versreferanse liggende
 * igjen inne i tittelen i den eldre fila).
 *
 * `series` kan være NULL, så sammenligningen må være null-sikker (`<=>`) —
 * `=` gir NULL og ville latt duplikatene stå igjen uten å feile.
 */
async function dedupeReadingTexts(sql: SQL): Promise<void> {
  if (!(await tableExists(sql, 'reading_texts'))) return;
  if (!(await columnExists(sql, 'reading_texts', 'language'))) return;
  // Finnes nøkkelen alt, kan det ikke ligge duplikater der.
  if ((await indexColumns(sql, 'reading_texts', 'uq_reading_texts')).length > 0) return;

  const keep = `
    JOIN (
      SELECT date, name, series, language, MAX(id) AS keep_id
      FROM reading_texts GROUP BY date, name, series, language
    ) k ON k.date = t.date AND k.name = t.name AND k.series <=> t.series
       AND k.language = t.language AND t.id <> k.keep_id`;

  // Barna først: reading_text_refs har ingen FK, så en foreldreløs rad ville
  // blitt liggende og dukket opp i kapittel-oppslagene (JOIN på id-en).
  await sql.unsafe(`DELETE r FROM reading_text_refs r JOIN reading_texts t ON r.reading_text_id = t.id ${keep}`).simple();
  await sql.unsafe(`DELETE t FROM reading_texts t ${keep}`).simple();
}

/** Kjører alle skjemaendringer som CREATE-ene ikke kan uttrykke. Idempotent. */
async function runMigrations(sql: SQL): Promise<void> {
  // Dupliserte lesedager MÅ vike før uq_reading_texts kan legges på (#40).
  await dedupeReadingTexts(sql);

  for (const { table, keys, dropLegacy } of LANGUAGE_MIGRATIONS) {
    if (!(await tableExists(sql, table))) continue;

    if (!(await columnExists(sql, table, 'language'))) {
      await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN ${LANG}`).simple();
    }

    // Gamle inline-UNIQUE-indekser (navngitt etter kolonnen) må vike for den
    // navngitte, språk-scopede nøkkelen — ellers står den gamle igjen og
    // håndhever unikhet PÅ TVERS av språk.
    for (const legacy of dropLegacy ?? []) {
      const cols = await indexColumns(sql, table, legacy);
      if (cols.length > 0 && !cols.includes('language')) {
        await sql.unsafe(`ALTER TABLE ${table} DROP INDEX \`${legacy}\``).simple();
      }
    }

    for (const key of keys) {
      const current = await indexColumns(sql, table, key.name);
      const wanted = key.columns.map((c) => c.toLowerCase());
      if (current.length === wanted.length && current.every((c, i) => c === wanted[i])) continue;

      const cols = key.columns.map((c) => `\`${c}\``).join(', ');
      const parts: string[] = [];
      if (current.length > 0) {
        parts.push(key.kind === 'primary' ? 'DROP PRIMARY KEY' : `DROP INDEX \`${key.name}\``);
      }
      parts.push(
        key.kind === 'primary'
          ? `ADD PRIMARY KEY (${cols})`
          : key.kind === 'unique'
            ? `ADD UNIQUE KEY \`${key.name}\` (${cols})`
            : `ADD INDEX \`${key.name}\` (${cols})`,
      );
      await sql.unsafe(`ALTER TABLE ${table} ${parts.join(', ')}`).simple();
    }
  }

  await renameBibleIds(sql);
}

/** Oppretter alle tabeller og kjører migreringene (idempotent). */
export async function ensureSchema(sql: SQL): Promise<void> {
  for (const stmt of TABLES) {
    await sql.unsafe(stmt).simple();
  }
  await runMigrations(sql);
}

export const TABLE_COUNT = TABLES.length;
