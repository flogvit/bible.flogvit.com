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

import type { SQL } from 'bun';

const CS = 'CHARACTER SET utf8mb4 COLLATE utf8mb4_danish_ci';

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
    bible VARCHAR(20) NOT NULL DEFAULT 'osnb2',
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
    bible VARCHAR(20) NOT NULL DEFAULT 'osnb2',
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
    book_id INT PRIMARY KEY,
    summary MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS book_context (
    book_id INT PRIMARY KEY,
    context MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS chapter_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    summary MEDIUMTEXT NOT NULL,
    UNIQUE KEY uq_chapter_summaries (book_id, chapter)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS chapter_context (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    context MEDIUMTEXT NOT NULL,
    UNIQUE KEY uq_chapter_context (book_id, chapter)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS important_words (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    word VARCHAR(255) NOT NULL,
    explanation TEXT NOT NULL,
    INDEX idx_important_words_chapter (book_id, chapter)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS important_verses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    text TEXT,
    UNIQUE KEY uq_important_verses (book_id, chapter, verse)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS verse_prayers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    prayer MEDIUMTEXT NOT NULL,
    UNIQUE KEY uq_verse_prayers (book_id, chapter, verse)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS verse_sermons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse INT NOT NULL,
    sermon MEDIUMTEXT NOT NULL,
    UNIQUE KEY uq_verse_sermons (book_id, chapter, verse)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS themes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    content MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_periods (
    id VARCHAR(100) NOT NULL,
    timeline_type VARCHAR(50) NOT NULL DEFAULT 'bible',
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20),
    description TEXT,
    sort_order INT,
    PRIMARY KEY (id, timeline_type)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_events (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_timeline_events_seq (seq),
    id VARCHAR(100) PRIMARY KEY,
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
    INDEX idx_timeline_events_period (period_id),
    INDEX idx_timeline_events_sort (sort_order),
    INDEX idx_timeline_events_type (timeline_type),
    INDEX idx_timeline_events_book (book_id)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS timeline_references (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    INDEX idx_timeline_references_event (event_id)
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
    PRIMARY KEY (id, book_id),
    INDEX idx_timeline_book_sections_book (book_id)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS prophecy_categories (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_prophecy_categories_seq (seq),
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS prophecies (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_prophecies_seq (seq),
    id VARCHAR(100) PRIMARY KEY,
    category_id VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    explanation TEXT,
    prophecy_book_id INT NOT NULL,
    prophecy_chapter INT NOT NULL,
    prophecy_verse_start INT NOT NULL,
    prophecy_verse_end INT NOT NULL,
    INDEX idx_prophecies_category (category_id)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS prophecy_fulfillments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    prophecy_id VARCHAR(100) NOT NULL,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    INDEX idx_prophecy_fulfillments_prophecy (prophecy_id),
    INDEX idx_prophecy_fulfillments_book (book_id, chapter)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    content MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS chapter_insights (
    id INT AUTO_INCREMENT PRIMARY KEY,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    UNIQUE KEY uq_chapter_insights (book_id, chapter),
    INDEX idx_chapter_insights_book (book_id, chapter)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS daily_verses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date VARCHAR(10) NOT NULL UNIQUE,
    book_id INT NOT NULL,
    chapter INT NOT NULL,
    verse_start INT NOT NULL,
    verse_end INT NOT NULL,
    note TEXT,
    INDEX idx_daily_verses_date (date)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS reading_plans (
    seq INT NOT NULL AUTO_INCREMENT,
    UNIQUE KEY uq_reading_plans_seq (seq),
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    days INT NOT NULL,
    content MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS db_meta (
    \`key\` VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS gospel_parallel_sections (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS gospel_parallels (
    id VARCHAR(100) PRIMARY KEY,
    section_id VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    notes TEXT,
    sort_order INT NOT NULL,
    INDEX idx_gospel_parallels_section (section_id)
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
    INDEX idx_gospel_parallel_passages_parallel (parallel_id)
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
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    content MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS number_symbolism (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number INT NOT NULL UNIQUE,
    content MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS reading_texts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    series VARCHAR(255),
    INDEX idx_reading_texts_date (date)
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
    slug VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(500) NOT NULL,
    keywords TEXT NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    INDEX idx_stories_category (category)
  ) ENGINE=InnoDB ${CS}`,

  `CREATE TABLE IF NOT EXISTS content_hashes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    content_type VARCHAR(50) NOT NULL,
    content_key VARCHAR(255) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    UNIQUE KEY uq_content_hashes (content_type, content_key),
    INDEX idx_content_hashes_type (content_type),
    INDEX idx_content_hashes_updated (updated_at)
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
];

/** Oppretter alle tabeller (idempotent). */
export async function ensureSchema(sql: SQL): Promise<void> {
  for (const stmt of TABLES) {
    await sql.unsafe(stmt).simple();
  }
}

export const TABLE_COUNT = TABLES.length;
