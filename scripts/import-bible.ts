// Import-pipeline for bibelinnhold: ../free-bible/generate/ → MySQL.
// Port av bibel/scripts/import-bible.ts fra better-sqlite3 til Bun.sql
// (samme innhold, samme inkrementelle hash-logikk, samme stats-rapportering).
//
// Kjør: bun scripts/import-bible.ts [--full]
//   --full tømmer alle innholdstabeller (tilsvarer sletting av bible.db i
//   originalen) og reimporterer alt.
//
// Hver import-seksjon kjører i sin egen transaksjon (sql.begin) slik at et
// krasj ikke etterlater en halvskrevet seksjon.

import * as fs from 'fs';
import * as path from 'path';
import type { SQL } from 'bun';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import {
  computeHash,
  updateContentHash,
  incrementSyncVersion,
  getSyncVersion,
} from './import-utils.ts';
import { DEFAULT_CONTENT_LANGUAGE, isLanguageCode } from '../src/lib/lang.ts';
import { booksData } from '../src/lib/books-data.ts';
import { getChapterVerseCount } from '../src/lib/verse-counts.ts';
import { parseRefMarkup } from '@free-bible/kvn/ref';
import { BOOK_IDS } from '@free-bible/kvn/types';
import { UkvnMapper, loadUkvnMapping, ukvnEncode, ukvnDecode, resolveMappingId } from '@free-bible/kvn';

// Kilde for bibelinnhold. Standard: ../free-bible relativt til cwd (som er en
// symlink til det ekte free-bible-repoet). Kan overstyres eksplisitt med
// FREE_BIBLE_DIR — deploy-bibel-data.sh setter den til den resolverte stien slik
// at importen aldri leser en tilfeldig/stale klon ved feil cwd.
const FREE_BIBLE_DIR = process.env.FREE_BIBLE_DIR
  ? path.resolve(process.env.FREE_BIBLE_DIR)
  : path.join(process.cwd(), '..', 'free-bible');
const GENERATE_PATH = path.join(FREE_BIBLE_DIR, 'generate');
console.log(`Kilde: ${GENERATE_PATH}`);

/**
 * Språkene en innholdstype har innhold for, lest fra
 * `generate/<type>/<språk>/`. DISKEN er kilden — ikke en liste i koden — slik at
 * et nytt språk bare er en ny katalog (free-bibles translate.mjs oversetter fra
 * `nb` til `<språk>` i nøyaktig denne strukturen). Kataloger som ikke er
 * velformede språkkoder hoppes over: samme mappe kan inneholde hjelpeskript og
 * arbeidskataloger (f.eks. `gospel_parallels/temp_verify`).
 *
 * Gulvet importeres først, resten alfabetisk — deterministisk rekkefølge gjør
 * loggen sammenlignbar mellom kjøringer.
 */
function contentLanguages(type: string): string[] {
  const dir = path.join(GENERATE_PATH, type);
  if (!fs.existsSync(dir)) return [];
  const langs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isLanguageCode(e.name))
    .map((e) => e.name)
    .sort();
  return langs.sort((a, b) => {
    if (a === DEFAULT_CONTENT_LANGUAGE) return -1;
    if (b === DEFAULT_CONTENT_LANGUAGE) return 1;
    return a.localeCompare(b);
  });
}

/** Logg-prefiks som gjør det tydelig hvilket språk en linje gjelder. */
const forLang = (lang: string) => `  [${lang}]`;

// Parse command line arguments
const args = process.argv.slice(2);
const isFullImport = args.includes('--full');

/**
 * Oversettelsene vi importerer TEKST for. Dette er en bevisst, kort liste — ikke
 * alt som ligger i `bibles_raw` (82 moduler, de fleste med lisenser vi ikke kan
 * publisere under).
 *
 * Listen styrer også metadata-importen (`bible_editions`), så en ny oversettelse
 * her drar meta.json/license.json og info-siden med seg automatisk.
 */
const BIBLES = ['osnb', 'osnn', 'sblgnt', 'tanach'];

// Statistics tracking
interface ImportStats {
  chapters: { updated: number; unchanged: number };
  bibleEditions: { updated: number; unchanged: number };
  word4word: { updated: number; unchanged: number };
  references: { updated: number; unchanged: number };
  bookSummaries: { updated: number; unchanged: number };
  bookContext: { updated: number; unchanged: number };
  chapterSummaries: { updated: number; unchanged: number };
  chapterContext: { updated: number; unchanged: number };
  importantWords: { updated: number; unchanged: number };
  versePrayers: { updated: number; unchanged: number };
  verseSermons: { updated: number; unchanged: number };
  themes: { updated: number; unchanged: number };
  timeline: { updated: number; unchanged: number };
  prophecies: { updated: number; unchanged: number };
  persons: { updated: number; unchanged: number };
  chapterInsights: { updated: number; unchanged: number };
  dailyVerses: { updated: number; unchanged: number };
  readingPlans: { updated: number; unchanged: number };
  gospelParallels: { updated: number; unchanged: number };
  verseMappings: { updated: number; unchanged: number };
  stories: { updated: number; unchanged: number };
  numberSymbolism: { updated: number; unchanged: number };
  days: { updated: number; unchanged: number };
  readingTexts: { updated: number; unchanged: number };
  verseWorks: { updated: number; unchanged: number };
}

const stats: ImportStats = {
  verseWorks: { updated: 0, unchanged: 0 },
  chapters: { updated: 0, unchanged: 0 },
  bibleEditions: { updated: 0, unchanged: 0 },
  word4word: { updated: 0, unchanged: 0 },
  references: { updated: 0, unchanged: 0 },
  bookSummaries: { updated: 0, unchanged: 0 },
  bookContext: { updated: 0, unchanged: 0 },
  chapterSummaries: { updated: 0, unchanged: 0 },
  chapterContext: { updated: 0, unchanged: 0 },
  importantWords: { updated: 0, unchanged: 0 },
  versePrayers: { updated: 0, unchanged: 0 },
  verseSermons: { updated: 0, unchanged: 0 },
  themes: { updated: 0, unchanged: 0 },
  timeline: { updated: 0, unchanged: 0 },
  prophecies: { updated: 0, unchanged: 0 },
  persons: { updated: 0, unchanged: 0 },
  chapterInsights: { updated: 0, unchanged: 0 },
  dailyVerses: { updated: 0, unchanged: 0 },
  readingPlans: { updated: 0, unchanged: 0 },
  gospelParallels: { updated: 0, unchanged: 0 },
  verseMappings: { updated: 0, unchanged: 0 },
  stories: { updated: 0, unchanged: 0 },
  numberSymbolism: { updated: 0, unchanged: 0 },
  days: { updated: 0, unchanged: 0 },
  readingTexts: { updated: 0, unchanged: 0 },
};

const deleted: Record<string, number> = {};

const sql = getSql();

// In-memory cache of content_hashes (lastes én gang) — erstatter originalens
// per-fil SELECT i better-sqlite3, som ville gitt ~70k runder mot MySQL.
const hashCache = new Map<string, string>();
const hashKey = (contentType: string, contentKey: string, language: string) =>
  `${contentType}\u0000${contentKey}\u0000${language}`;

function hasContentChangedCached(
  contentType: string,
  contentKey: string,
  newHash: string,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): boolean {
  return hashCache.get(hashKey(contentType, contentKey, language)) !== newHash;
}

async function setContentHash(
  db: SQL,
  contentType: string,
  contentKey: string,
  hash: string,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): Promise<void> {
  await updateContentHash(db, contentType, contentKey, hash, language);
  hashCache.set(hashKey(contentType, contentKey, language), hash);
}

/**
 * Remove rows from a table where the key column value no longer has a matching file on disk.
 * Also cleans up content_hashes for removed entries.
 *
 * Oppryddingen er SPRÅK-SCOPET: den sammenligner bare mot filene som finnes for
 * `language`. Uten det ville en import av ett språk slettet alle rader for de
 * andre språkene, siden nøklene deres ikke finnes i denne språkkatalogen.
 */
async function cleanupRemovedEntries(
  db: SQL,
  table: string,
  keyColumn: string,
  diskKeys: Set<string>,
  contentType: string,
  label: string,
  language: string = DEFAULT_CONTENT_LANGUAGE,
): Promise<void> {
  const rows = (await db.unsafe(`SELECT ${keyColumn} FROM ${table} WHERE language = ?`, [
    language,
  ])) as Record<string, string | number>[];
  const toDelete: (string | number)[] = [];

  for (const row of rows) {
    const key = String(row[keyColumn]);
    if (!diskKeys.has(key)) {
      toDelete.push(row[keyColumn] as string | number);
    }
  }

  if (toDelete.length > 0) {
    for (const key of toDelete) {
      await db.unsafe(`DELETE FROM ${table} WHERE ${keyColumn} = ? AND language = ?`, [key, language]);
      await db`
        DELETE FROM content_hashes
        WHERE content_type = ${contentType} AND content_key = ${String(key)} AND language = ${language}
      `;
      hashCache.delete(hashKey(contentType, String(key), language));
    }
    deleted[label] = (deleted[label] ?? 0) + toDelete.length;
    console.log(`${forLang(language)} Slettet ${toDelete.length} ${label} som ikke lenger finnes på disk`);
  }
}

// Innholdstabellene som import-pipelinen eier (brukertabellene røres aldri).
const CONTENT_TABLES = [
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
  'important_verses',
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

console.log('Oppretter database-skjema...');
await ensureSchema(sql);

// For full import: tøm eksisterende innholdstabeller (originalen slettet
// SQLite-filen; i MySQL tømmer vi tabellene i stedet).
if (isFullImport) {
  console.log('Full import modus - tømmer eksisterende innholdstabeller...');
  for (const table of CONTENT_TABLES) {
    await sql.unsafe(`TRUNCATE TABLE ${table}`).simple();
  }
} else {
  console.log('Inkrementell import modus - oppdaterer kun endret innhold...');
  const rows = (await sql`
    SELECT content_type, content_key, content_hash, language FROM content_hashes
  `) as { content_type: string; content_key: string; content_hash: string; language: string }[];
  for (const row of rows) {
    hashCache.set(hashKey(row.content_type, row.content_key, row.language), row.content_hash);
  }
}

// Bokliste
const books = [
  { id: 1, name: 'Genesis', name_no: '1. Mosebok', short_name: '1Mos', testament: 'OT', chapters: 50 },
  { id: 2, name: 'Exodus', name_no: '2. Mosebok', short_name: '2Mos', testament: 'OT', chapters: 40 },
  { id: 3, name: 'Leviticus', name_no: '3. Mosebok', short_name: '3Mos', testament: 'OT', chapters: 27 },
  { id: 4, name: 'Numbers', name_no: '4. Mosebok', short_name: '4Mos', testament: 'OT', chapters: 36 },
  { id: 5, name: 'Deuteronomy', name_no: '5. Mosebok', short_name: '5Mos', testament: 'OT', chapters: 34 },
  { id: 6, name: 'Joshua', name_no: 'Josva', short_name: 'Jos', testament: 'OT', chapters: 24 },
  { id: 7, name: 'Judges', name_no: 'Dommerne', short_name: 'Dom', testament: 'OT', chapters: 21 },
  { id: 8, name: 'Ruth', name_no: 'Rut', short_name: 'Rut', testament: 'OT', chapters: 4 },
  { id: 9, name: '1 Samuel', name_no: '1. Samuel', short_name: '1Sam', testament: 'OT', chapters: 31 },
  { id: 10, name: '2 Samuel', name_no: '2. Samuel', short_name: '2Sam', testament: 'OT', chapters: 24 },
  { id: 11, name: '1 Kings', name_no: '1. Kongebok', short_name: '1Kong', testament: 'OT', chapters: 22 },
  { id: 12, name: '2 Kings', name_no: '2. Kongebok', short_name: '2Kong', testament: 'OT', chapters: 25 },
  { id: 13, name: '1 Chronicles', name_no: '1. Krønikebok', short_name: '1Krøn', testament: 'OT', chapters: 29 },
  { id: 14, name: '2 Chronicles', name_no: '2. Krønikebok', short_name: '2Krøn', testament: 'OT', chapters: 36 },
  { id: 15, name: 'Ezra', name_no: 'Esra', short_name: 'Esr', testament: 'OT', chapters: 10 },
  { id: 16, name: 'Nehemiah', name_no: 'Nehemja', short_name: 'Neh', testament: 'OT', chapters: 13 },
  { id: 17, name: 'Esther', name_no: 'Ester', short_name: 'Est', testament: 'OT', chapters: 10 },
  { id: 18, name: 'Job', name_no: 'Job', short_name: 'Job', testament: 'OT', chapters: 42 },
  { id: 19, name: 'Psalms', name_no: 'Salmene', short_name: 'Sal', testament: 'OT', chapters: 150 },
  { id: 20, name: 'Proverbs', name_no: 'Ordspråkene', short_name: 'Ord', testament: 'OT', chapters: 31 },
  { id: 21, name: 'Ecclesiastes', name_no: 'Forkynneren', short_name: 'Fork', testament: 'OT', chapters: 12 },
  { id: 22, name: 'Song of Solomon', name_no: 'Høysangen', short_name: 'Høy', testament: 'OT', chapters: 8 },
  { id: 23, name: 'Isaiah', name_no: 'Jesaja', short_name: 'Jes', testament: 'OT', chapters: 66 },
  { id: 24, name: 'Jeremiah', name_no: 'Jeremia', short_name: 'Jer', testament: 'OT', chapters: 52 },
  { id: 25, name: 'Lamentations', name_no: 'Klagesangene', short_name: 'Klag', testament: 'OT', chapters: 5 },
  { id: 26, name: 'Ezekiel', name_no: 'Esekiel', short_name: 'Esek', testament: 'OT', chapters: 48 },
  { id: 27, name: 'Daniel', name_no: 'Daniel', short_name: 'Dan', testament: 'OT', chapters: 12 },
  { id: 28, name: 'Hosea', name_no: 'Hosea', short_name: 'Hos', testament: 'OT', chapters: 14 },
  { id: 29, name: 'Joel', name_no: 'Joel', short_name: 'Joel', testament: 'OT', chapters: 3 },
  { id: 30, name: 'Amos', name_no: 'Amos', short_name: 'Amos', testament: 'OT', chapters: 9 },
  { id: 31, name: 'Obadiah', name_no: 'Obadja', short_name: 'Ob', testament: 'OT', chapters: 1 },
  { id: 32, name: 'Jonah', name_no: 'Jona', short_name: 'Jona', testament: 'OT', chapters: 4 },
  { id: 33, name: 'Micah', name_no: 'Mika', short_name: 'Mika', testament: 'OT', chapters: 7 },
  { id: 34, name: 'Nahum', name_no: 'Nahum', short_name: 'Nah', testament: 'OT', chapters: 3 },
  { id: 35, name: 'Habakkuk', name_no: 'Habakkuk', short_name: 'Hab', testament: 'OT', chapters: 3 },
  { id: 36, name: 'Zephaniah', name_no: 'Sefanja', short_name: 'Sef', testament: 'OT', chapters: 3 },
  { id: 37, name: 'Haggai', name_no: 'Haggai', short_name: 'Hag', testament: 'OT', chapters: 2 },
  { id: 38, name: 'Zechariah', name_no: 'Sakarja', short_name: 'Sak', testament: 'OT', chapters: 14 },
  { id: 39, name: 'Malachi', name_no: 'Malaki', short_name: 'Mal', testament: 'OT', chapters: 3 },
  { id: 40, name: 'Matthew', name_no: 'Matteus', short_name: 'Matt', testament: 'NT', chapters: 28 },
  { id: 41, name: 'Mark', name_no: 'Markus', short_name: 'Mark', testament: 'NT', chapters: 16 },
  { id: 42, name: 'Luke', name_no: 'Lukas', short_name: 'Luk', testament: 'NT', chapters: 24 },
  { id: 43, name: 'John', name_no: 'Johannes', short_name: 'Joh', testament: 'NT', chapters: 21 },
  { id: 44, name: 'Acts', name_no: 'Apostlenes gjerninger', short_name: 'Apg', testament: 'NT', chapters: 28 },
  { id: 45, name: 'Romans', name_no: 'Romerne', short_name: 'Rom', testament: 'NT', chapters: 16 },
  { id: 46, name: '1 Corinthians', name_no: '1. Korinter', short_name: '1Kor', testament: 'NT', chapters: 16 },
  { id: 47, name: '2 Corinthians', name_no: '2. Korinter', short_name: '2Kor', testament: 'NT', chapters: 13 },
  { id: 48, name: 'Galatians', name_no: 'Galaterne', short_name: 'Gal', testament: 'NT', chapters: 6 },
  { id: 49, name: 'Ephesians', name_no: 'Efeserne', short_name: 'Ef', testament: 'NT', chapters: 6 },
  { id: 50, name: 'Philippians', name_no: 'Filipperne', short_name: 'Fil', testament: 'NT', chapters: 4 },
  { id: 51, name: 'Colossians', name_no: 'Kolosserne', short_name: 'Kol', testament: 'NT', chapters: 4 },
  { id: 52, name: '1 Thessalonians', name_no: '1. Tessaloniker', short_name: '1Tess', testament: 'NT', chapters: 5 },
  { id: 53, name: '2 Thessalonians', name_no: '2. Tessaloniker', short_name: '2Tess', testament: 'NT', chapters: 3 },
  { id: 54, name: '1 Timothy', name_no: '1. Timoteus', short_name: '1Tim', testament: 'NT', chapters: 6 },
  { id: 55, name: '2 Timothy', name_no: '2. Timoteus', short_name: '2Tim', testament: 'NT', chapters: 4 },
  { id: 56, name: 'Titus', name_no: 'Titus', short_name: 'Tit', testament: 'NT', chapters: 3 },
  { id: 57, name: 'Philemon', name_no: 'Filemon', short_name: 'Filem', testament: 'NT', chapters: 1 },
  { id: 58, name: 'Hebrews', name_no: 'Hebreerne', short_name: 'Hebr', testament: 'NT', chapters: 13 },
  { id: 59, name: 'James', name_no: 'Jakob', short_name: 'Jak', testament: 'NT', chapters: 5 },
  { id: 60, name: '1 Peter', name_no: '1. Peter', short_name: '1Pet', testament: 'NT', chapters: 5 },
  { id: 61, name: '2 Peter', name_no: '2. Peter', short_name: '2Pet', testament: 'NT', chapters: 3 },
  { id: 62, name: '1 John', name_no: '1. Johannes', short_name: '1Joh', testament: 'NT', chapters: 5 },
  { id: 63, name: '2 John', name_no: '2. Johannes', short_name: '2Joh', testament: 'NT', chapters: 1 },
  { id: 64, name: '3 John', name_no: '3. Johannes', short_name: '3Joh', testament: 'NT', chapters: 1 },
  { id: 65, name: 'Jude', name_no: 'Judas', short_name: 'Jud', testament: 'NT', chapters: 1 },
  { id: 66, name: 'Revelation', name_no: 'Åpenbaringen', short_name: 'Åp', testament: 'NT', chapters: 22 },
];

// Importer bøker
console.log('Importerer bøker...');
await sql.begin(async (tx) => {
  for (const book of books) {
    await tx`
      REPLACE INTO books (id, name, name_no, short_name, testament, chapters)
      VALUES (${book.id}, ${book.name}, ${book.name_no}, ${book.short_name}, ${book.testament}, ${book.chapters})
    `;
  }
});

// Importer vers med hash-sjekk
console.log('Importerer vers...');

interface RawVerse {
  bookId: number;
  chapterId: number;
  verseId: number;
  text: string;
  versions?: unknown;
  footnotes?: unknown;
}

async function importVerses(bible: string): Promise<void> {
  const biblePath = path.join(GENERATE_PATH, 'bibles_raw', bible);
  if (!fs.existsSync(biblePath)) {
    console.log(`  Hopper over ${bible} (ikke funnet)`);
    return;
  }

  await sql.begin(async (tx) => {
    const bookDirs = fs.readdirSync(biblePath).filter((f) => !f.startsWith('.'));

    for (const bookDir of bookDirs) {
      const bookId = parseInt(bookDir);
      if (isNaN(bookId)) continue;

      const bookPath = path.join(biblePath, bookDir);
      const chapterFiles = fs.readdirSync(bookPath).filter((f) => f.endsWith('.json'));

      for (const chapterFile of chapterFiles) {
        const chapterPath = path.join(bookPath, chapterFile);
        const chapterId = parseInt(chapterFile.replace('.json', ''));
        const content = fs.readFileSync(chapterPath, 'utf-8');
        const contentHash = computeHash(content);
        const contentKey = `${bible}-${bookId}-${chapterId}`;

        // Check if content has changed
        if (!isFullImport && !hasContentChangedCached('chapter', contentKey, contentHash)) {
          stats.chapters.unchanged++;
          continue;
        }

        // Content changed - update
        const verses = JSON.parse(content) as RawVerse[];
        await tx`DELETE FROM verses WHERE book_id = ${bookId} AND chapter = ${chapterId} AND bible = ${bible}`;
        if (verses.length > 0) {
          const placeholders = verses.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
          const params = verses.flatMap((v) => [
            v.bookId,
            v.chapterId,
            v.verseId,
            v.text,
            bible,
            v.versions ? JSON.stringify(v.versions) : null,
            v.footnotes ? JSON.stringify(v.footnotes) : null,
          ]);
          await tx.unsafe(
            `REPLACE INTO verses (book_id, chapter, verse, text, bible, versions, footnotes) VALUES ${placeholders}`,
            params,
          );
        }
        await setContentHash(tx, 'chapter', contentKey, contentHash);
        stats.chapters.updated++;
      }
    }
  });
}

for (const bible of BIBLES) {
  console.log(`  Importerer ${bible}...`);
  await importVerses(bible);
}

// Importer oversettelses-metadata (meta.json + license.json per modul)
console.log('Importerer oversettelses-metadata...');

interface RawBibleMeta {
  module?: string;
  name?: { native?: string; en?: string };
  abbreviation?: string;
  language?: { iso639_1?: string; iso639_3?: string; script?: string; direction?: string };
  year?: { published?: number };
  philosophy?: string;
  tradition?: string;
  body?: string;
  coverage?: { testament?: string; books?: number; chapters?: number; verses?: number };
}

interface RawBibleLicense {
  license?: string;
  spdx?: string;
}

for (const bible of BIBLES) {
  const metaPath = path.join(GENERATE_PATH, 'bibles_raw', bible, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    console.log(`  Hopper over ${bible} (ingen meta.json)`);
    continue;
  }

  // license.json finnes bare for moduler der lisensen er kartlagt eksternt —
  // egne tekster (osnb/osnn) og grunntekstene har den ikke.
  const licensePath = path.join(GENERATE_PATH, 'bibles_raw', bible, 'license.json');
  const metaContent = fs.readFileSync(metaPath, 'utf-8');
  const licenseContent = fs.existsSync(licensePath) ? fs.readFileSync(licensePath, 'utf-8') : null;
  const contentHash = computeHash(metaContent + (licenseContent ?? ''));

  if (!isFullImport && !hasContentChangedCached('bible_edition', bible, contentHash)) {
    stats.bibleEditions.unchanged++;
    continue;
  }

  try {
    const meta = JSON.parse(metaContent) as RawBibleMeta;
    const license = licenseContent ? (JSON.parse(licenseContent) as RawBibleLicense) : null;

    await sql.begin(async (tx) => {
      await tx`
        REPLACE INTO bible_editions (
          id, name_native, name_en, abbreviation,
          lang_iso639_1, lang_iso639_3, script, direction,
          philosophy, tradition, body, year_published,
          testament, books, chapters, verses,
          license_name, license_spdx, meta, license
        ) VALUES (
          ${bible},
          ${meta.name?.native ?? meta.name?.en ?? bible},
          ${meta.name?.en ?? null},
          ${meta.abbreviation ?? null},
          ${meta.language?.iso639_1 ?? null},
          ${meta.language?.iso639_3 ?? null},
          ${meta.language?.script ?? null},
          ${meta.language?.direction ?? 'ltr'},
          ${meta.philosophy ?? null},
          ${meta.tradition ?? null},
          ${meta.body ?? null},
          ${meta.year?.published ?? null},
          ${meta.coverage?.testament ?? null},
          ${meta.coverage?.books ?? null},
          ${meta.coverage?.chapters ?? null},
          ${meta.coverage?.verses ?? null},
          ${license?.license ?? null},
          ${license?.spdx ?? null},
          ${metaContent},
          ${licenseContent}
        )
      `;
      await setContentHash(tx, 'bible_edition', bible, contentHash);
      stats.bibleEditions.updated++;
    });
    console.log(`  ${bible}: ${meta.name?.native ?? bible}${licenseContent ? ' (med lisens)' : ''}`);
  } catch (e) {
    console.error(`Ugyldig JSON i bibles_raw/${bible}:`, e);
  }
}

// Fjern utgaver vi ikke lenger importerer tekst for, så info-sidene ikke henger
// igjen for en oversettelse som er tatt ut. Egen opprydding her framfor
// cleanupRemovedEntries, som er språk-scopet — denne tabellen har ingen
// language-kolonne.
await sql.begin(async (tx) => {
  const rows = (await tx`SELECT id FROM bible_editions`) as { id: string }[];
  const stale = rows.map((r) => r.id).filter((id) => !BIBLES.includes(id));
  for (const id of stale) {
    await tx`DELETE FROM bible_editions WHERE id = ${id}`;
    await tx`DELETE FROM content_hashes WHERE content_type = 'bible_edition' AND content_key = ${id}`;
    hashCache.delete(hashKey('bible_edition', id, DEFAULT_CONTENT_LANGUAGE));
  }
  if (stale.length > 0) {
    deleted['oversettelser'] = stale.length;
    console.log(`  Slettet ${stale.length} oversettelser som ikke lenger importeres`);
  }
});

// Importer word4word
console.log('Importerer word4word...');

interface RawWord {
  wordId: number;
  word: string;
  original?: string;
  pronunciation?: string;
  explanation?: string;
}

async function importWord4Word(original: string, lang: string): Promise<void> {
  const word4wordPath = path.join(GENERATE_PATH, 'word4word', original, lang);
  if (!fs.existsSync(word4wordPath)) {
    console.log(`  Hopper over word4word for ${original}/${lang} (ikke funnet)`);
    return;
  }

  const bibleValue = `${original}-${lang}`;

  await sql.begin(async (tx) => {
    const bookDirs = fs.readdirSync(word4wordPath).filter((f) => !f.startsWith('.'));

    for (const bookDir of bookDirs) {
      const bookId = parseInt(bookDir);
      if (isNaN(bookId)) continue;

      const bookPath = path.join(word4wordPath, bookDir);
      const chapterDirs = fs.readdirSync(bookPath).filter((f) => !f.startsWith('.'));

      for (const chapterDir of chapterDirs) {
        const chapterId = parseInt(chapterDir);
        if (isNaN(chapterId)) continue;

        const chapterPath = path.join(bookPath, chapterDir);
        const verseFiles = fs.readdirSync(chapterPath).filter((f) => f.endsWith('.json'));

        for (const verseFile of verseFiles) {
          const verseId = parseInt(verseFile.replace('.json', ''));
          if (isNaN(verseId)) continue;

          const versePath = path.join(chapterPath, verseFile);
          const content = fs.readFileSync(versePath, 'utf-8');
          const contentHash = computeHash(content);
          const contentKey = `${bibleValue}-${bookId}-${chapterId}-${verseId}`;

          // Check if content has changed
          if (!isFullImport && !hasContentChangedCached('word4word', contentKey, contentHash)) {
            stats.word4word.unchanged++;
            continue;
          }

          // Content changed - update
          const data = JSON.parse(content) as { words?: RawWord[] }[];
          await tx`
            DELETE FROM word4word
            WHERE book_id = ${bookId} AND chapter = ${chapterId} AND verse = ${verseId} AND bible = ${bibleValue}
          `;

          const words = Array.isArray(data) ? data[0]?.words : undefined;
          if (words && words.length > 0) {
            const placeholders = words.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const params = words.flatMap((wordData) => [
              bookId,
              chapterId,
              verseId,
              wordData.wordId,
              wordData.word,
              wordData.original || null,
              wordData.pronunciation || null,
              wordData.explanation || null,
              bibleValue,
            ]);
            await tx.unsafe(
              `REPLACE INTO word4word (book_id, chapter, verse, word_index, word, original, pronunciation, explanation, bible) VALUES ${placeholders}`,
              params,
            );
          }
          await setContentHash(tx, 'word4word', contentKey, contentHash);
          stats.word4word.updated++;
        }
      }
    }
  });
}

// word4word er scopet av `bible` (= <grunntekst>-<språk>), ikke av language-
// kolonnen — men språkene under hver grunntekst leses fra disk, som ellers.
const originals = ['tanach', 'sblgnt'];
for (const original of originals) {
  for (const lang of contentLanguages(path.join('word4word', original))) {
    console.log(`${forLang(lang)} Importerer word4word for ${original}...`);
    await importWord4Word(original, lang);
  }
}

// Importer referanser
console.log('Importerer referanser...');

interface RawReference {
  bookId: number;
  chapterId: number;
  fromVerseId?: number | null;
  toVerseId?: number | null;
  text?: string;
}

for (const lang of contentLanguages('references')) {
  const refsPath = path.join(GENERATE_PATH, 'references', lang);

  console.log(`${forLang(lang)} Importerer referanser...`);
  await sql.begin(async (tx) => {
    const bookDirs = fs.readdirSync(refsPath).filter((f) => !f.startsWith('.'));

    for (const bookDir of bookDirs) {
      const bookId = parseInt(bookDir);
      if (isNaN(bookId)) continue;

      const bookPath = path.join(refsPath, bookDir);
      const chapterDirs = fs.readdirSync(bookPath).filter((f) => !f.startsWith('.'));

      for (const chapterDir of chapterDirs) {
        const chapterId = parseInt(chapterDir);
        if (isNaN(chapterId)) continue;

        const chapterPath = path.join(bookPath, chapterDir);
        const verseFiles = fs.readdirSync(chapterPath).filter((f) => f.endsWith('.json'));

        for (const verseFile of verseFiles) {
          const verseId = parseInt(verseFile.replace('.json', ''));
          if (isNaN(verseId)) continue;

          const versePath = path.join(chapterPath, verseFile);
          const content = fs.readFileSync(versePath, 'utf-8');
          const contentHash = computeHash(content);
          // Språket ligger både i nøkkelen og i language-kolonnen. Redundant,
          // men bevisst: referanse-nøklene har alltid hatt prefikset, og å bytte
          // format ville gjort alle 10k+ hasher ugyldige og utløst en full
          // reimport av referansene uten at noe innhold var endret.
          const contentKey = `ref-${lang}-${bookId}-${chapterId}-${verseId}`;

          // Check if content has changed
          if (!isFullImport && !hasContentChangedCached('reference', contentKey, contentHash, lang)) {
            stats.references.unchanged++;
            continue;
          }

          // Content changed - update
          const data = JSON.parse(content) as { references?: RawReference[] };
          await tx`
            DELETE FROM references_
            WHERE from_book_id = ${bookId} AND from_chapter = ${chapterId} AND from_verse = ${verseId} AND language = ${lang}
          `;

          if (data.references) {
            for (const ref of data.references) {
              const fromVerse = ref.fromVerseId;
              const toVerse = ref.toVerseId ?? fromVerse;

              if (fromVerse == null) {
                console.error(`Missing fromVerseId in ${versePath}:`, JSON.stringify(ref));
                process.exit(1);
              }

              try {
                await tx`
                  INSERT INTO references_ (from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end, description, language)
                  VALUES (${bookId}, ${chapterId}, ${verseId}, ${ref.bookId}, ${ref.chapterId}, ${fromVerse}, ${toVerse}, ${ref.text || null}, ${lang})
                `;
              } catch (e) {
                console.error(`Error importing reference from ${versePath}:`, JSON.stringify(ref), e);
                process.exit(1);
              }
            }
          }
          await setContentHash(tx, 'reference', contentKey, contentHash, lang);
          stats.references.updated++;
        }
      }
    }
  });
}

// Importer boksammendrag
console.log('Importerer boksammendrag...');
for (const lang of contentLanguages('book_summaries')) {
  const bookSummariesPath = path.join(GENERATE_PATH, 'book_summaries', lang);
  const before = stats.bookSummaries.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(bookSummariesPath).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const bookId = parseInt(file.replace('.md', ''));
      if (isNaN(bookId)) continue;

      const filePath = path.join(bookSummariesPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = String(bookId);

      if (!isFullImport && !hasContentChangedCached('book_summary', contentKey, contentHash, lang)) {
        stats.bookSummaries.unchanged++;
        continue;
      }

      await tx`REPLACE INTO book_summaries (book_id, summary, language) VALUES (${bookId}, ${content}, ${lang})`;
      await setContentHash(tx, 'book_summary', contentKey, contentHash, lang);
      stats.bookSummaries.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.bookSummaries.updated - before} oppdatert`);
}

// Importer bokkontekst
console.log('Importerer bokkontekst...');
for (const lang of contentLanguages('book_context')) {
  const bookContextPath = path.join(GENERATE_PATH, 'book_context', lang);
  const before = stats.bookContext.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(bookContextPath).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const bookId = parseInt(file.replace('.md', ''));
      if (isNaN(bookId)) continue;

      const filePath = path.join(bookContextPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = String(bookId);

      if (!isFullImport && !hasContentChangedCached('book_context', contentKey, contentHash, lang)) {
        stats.bookContext.unchanged++;
        continue;
      }

      await tx`REPLACE INTO book_context (book_id, context, language) VALUES (${bookId}, ${content}, ${lang})`;
      await setContentHash(tx, 'book_context', contentKey, contentHash, lang);
      stats.bookContext.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.bookContext.updated - before} oppdatert`);
}

// Importer kapittelsammendrag
console.log('Importerer kapittelsammendrag...');
for (const lang of contentLanguages('chapter_summaries')) {
  const chapterSummariesPath = path.join(GENERATE_PATH, 'chapter_summaries', lang);
  const before = stats.chapterSummaries.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(chapterSummariesPath).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const match = file.match(/^(\d+)-(\d+)\.md$/);
      if (!match) continue;

      const bookId = parseInt(match[1]!);
      const chapter = parseInt(match[2]!);

      const filePath = path.join(chapterSummariesPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `${bookId}-${chapter}`;

      if (!isFullImport && !hasContentChangedCached('chapter_summary', contentKey, contentHash, lang)) {
        stats.chapterSummaries.unchanged++;
        continue;
      }

      await tx`
        REPLACE INTO chapter_summaries (book_id, chapter, summary, language)
        VALUES (${bookId}, ${chapter}, ${content}, ${lang})
      `;
      await setContentHash(tx, 'chapter_summary', contentKey, contentHash, lang);
      stats.chapterSummaries.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.chapterSummaries.updated - before} oppdatert`);
}

// Importer kapittelkontekst
console.log('Importerer kapittelkontekst...');
for (const lang of contentLanguages('chapter_context')) {
  const chapterContextPath = path.join(GENERATE_PATH, 'chapter_context', lang);
  const before = stats.chapterContext.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(chapterContextPath).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const match = file.match(/^(\d+)-(\d+)\.md$/);
      if (!match) continue;

      const bookId = parseInt(match[1]!);
      const chapter = parseInt(match[2]!);

      const filePath = path.join(chapterContextPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `${bookId}-${chapter}`;

      if (!isFullImport && !hasContentChangedCached('chapter_context', contentKey, contentHash, lang)) {
        stats.chapterContext.unchanged++;
        continue;
      }

      await tx`
        REPLACE INTO chapter_context (book_id, chapter, context, language)
        VALUES (${bookId}, ${chapter}, ${content}, ${lang})
      `;
      await setContentHash(tx, 'chapter_context', contentKey, contentHash, lang);
      stats.chapterContext.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.chapterContext.updated - before} oppdatert`);
}

// Importer viktige ord
console.log('Importerer viktige ord...');
for (const lang of contentLanguages('important_words')) {
  const importantWordsPath = path.join(GENERATE_PATH, 'important_words', lang);
  const before = stats.importantWords.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(importantWordsPath).filter((f) => f.endsWith('.txt'));

    for (const file of files) {
      const match = file.match(/^(\d+)-(\d+)\.txt$/);
      if (!match) continue;

      const bookId = parseInt(match[1]!);
      const chapter = parseInt(match[2]!);

      const filePath = path.join(importantWordsPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `${bookId}-${chapter}`;

      if (!isFullImport && !hasContentChangedCached('important_words', contentKey, contentHash, lang)) {
        stats.importantWords.unchanged++;
        continue;
      }

      await tx`
        DELETE FROM important_words
        WHERE book_id = ${bookId} AND chapter = ${chapter} AND language = ${lang}
      `;
      for (const line of content.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const word = line.substring(0, colonIdx).trim();
          const explanation = line.substring(colonIdx + 1).trim();
          if (word && explanation) {
            await tx`
              INSERT INTO important_words (book_id, chapter, word, explanation, language)
              VALUES (${bookId}, ${chapter}, ${word}, ${explanation}, ${lang})
            `;
          }
        }
      }
      await setContentHash(tx, 'important_words', contentKey, contentHash, lang);
      stats.importantWords.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.importantWords.updated - before} oppdatert`);
}

// Importer vers-bønn
console.log('Importerer vers-bønn...');
for (const lang of contentLanguages('verse_prayer')) {
  const versePrayerPath = path.join(GENERATE_PATH, 'verse_prayer', lang);
  const before = stats.versePrayers.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(versePrayerPath).filter((f) => f.endsWith('.txt'));

    for (const file of files) {
      const match = file.match(/^(\d+)-(\d+)-(\d+)\.txt$/);
      if (!match) continue;

      const bookId = parseInt(match[1]!);
      const chapter = parseInt(match[2]!);
      const verse = parseInt(match[3]!);

      const filePath = path.join(versePrayerPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `${bookId}-${chapter}-${verse}`;

      if (!isFullImport && !hasContentChangedCached('verse_prayer', contentKey, contentHash, lang)) {
        stats.versePrayers.unchanged++;
        continue;
      }

      await tx`
        REPLACE INTO verse_prayers (book_id, chapter, verse, prayer, language)
        VALUES (${bookId}, ${chapter}, ${verse}, ${content}, ${lang})
      `;
      await setContentHash(tx, 'verse_prayer', contentKey, contentHash, lang);
      stats.versePrayers.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.versePrayers.updated - before} oppdatert`);
}

// Importer vers-andakt
console.log('Importerer vers-andakt...');
for (const lang of contentLanguages('verse_sermon')) {
  const verseSermonPath = path.join(GENERATE_PATH, 'verse_sermon', lang);
  const before = stats.verseSermons.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(verseSermonPath).filter((f) => f.endsWith('.txt'));

    for (const file of files) {
      const match = file.match(/^(\d+)-(\d+)-(\d+)\.txt$/);
      if (!match) continue;

      const bookId = parseInt(match[1]!);
      const chapter = parseInt(match[2]!);
      const verse = parseInt(match[3]!);

      const filePath = path.join(verseSermonPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `${bookId}-${chapter}-${verse}`;

      if (!isFullImport && !hasContentChangedCached('verse_sermon', contentKey, contentHash, lang)) {
        stats.verseSermons.unchanged++;
        continue;
      }

      await tx`
        REPLACE INTO verse_sermons (book_id, chapter, verse, sermon, language)
        VALUES (${bookId}, ${chapter}, ${verse}, ${content}, ${lang})
      `;
      await setContentHash(tx, 'verse_sermon', contentKey, contentHash, lang);
      stats.verseSermons.updated++;
    }
  });
  console.log(`${forLang(lang)} ${stats.verseSermons.updated - before} oppdatert`);
}

// Importer viktige vers (always full import - small file)
console.log('Importerer viktige vers...');
const bookNameMap: Record<string, number> = {
  'Filipperne': 50,
  'Romerne': 45,
  'Matt': 40,
  'Matteus': 40,
  'Josva': 6,
  'Jeremia': 24,
  'Salme': 19,
  'Salmene': 19,
  '1 Korinter': 46,
  'Efeserne': 49,
  'Galaterne': 48,
  'Johannes': 43,
  '2 Timoteus': 55,
  'Hebreerne': 58,
  '1 Peter': 60,
  '2 Korinter': 47,
  'Apostlenes gjerninger': 44,
  '1 Johannes': 62,
  'Jakob': 59,
  'Lukas': 42,
  'Isaiah': 23,
  'Jesaja': 23,
};

// NB: important_verses oversettes IKKE maskinelt (se translate.mjs) — filen
// siterer faktisk bibeltekst, og maskinoversatte kjente vers ville reprodusert
// opphavsrettsbeskyttede oversettelser. Andre språk må hentes fra en bibeltekst
// på det språket. Løkken er likevel per språk, så en `en/`-katalog importeres
// den dagen den lages på riktig vis.
for (const lang of contentLanguages('important_verses')) {
  const importantVersesPath = path.join(GENERATE_PATH, 'important_verses', lang, 'verses.txt');
  if (!fs.existsSync(importantVersesPath)) continue;

  await sql.begin(async (tx) => {
    const insertImportantVerse = async (bookId: number, chapter: number, verse: number, text: string | null) => {
      await tx`
        REPLACE INTO important_verses (book_id, chapter, verse, text, language)
        VALUES (${bookId}, ${chapter}, ${verse}, ${text}, ${lang})
      `;
    };

    const content = fs.readFileSync(importantVersesPath, 'utf-8');

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;

      const textMatch = line.match(/"([^"]+)"/);
      const text = textMatch ? textMatch[1]! : null;

      const numericMatch = line.match(/^(\d+):(\d+):(\d+)/);
      if (numericMatch) {
        await insertImportantVerse(parseInt(numericMatch[1]!), parseInt(numericMatch[2]!), parseInt(numericMatch[3]!), text);
        continue;
      }

      const nameMatch = line.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?/);
      if (nameMatch) {
        const bookName = nameMatch[1]!;
        const chapterStr = nameMatch[2]!;
        const verseStartStr = nameMatch[3]!;
        const verseEndStr = nameMatch[4];
        const bookId = bookNameMap[bookName.trim()];

        if (bookId) {
          await insertImportantVerse(bookId, parseInt(chapterStr), parseInt(verseStartStr), text);

          if (verseEndStr) {
            for (let v = parseInt(verseStartStr) + 1; v <= parseInt(verseEndStr); v++) {
              await insertImportantVerse(bookId, parseInt(chapterStr), v, text);
            }
          }
        } else {
          console.log(`  Ukjent bok: ${bookName}`);
        }
      }
    }
  });
}

// Importer temaer
console.log('Importerer temaer...');
for (const lang of contentLanguages('themes')) {
  const themesPath = path.join(GENERATE_PATH, 'themes', lang);
  const before = stats.themes.updated;
  await sql.begin(async (tx) => {
    const jsonFiles = fs.readdirSync(themesPath).filter((f) => f.endsWith('.json'));
    const txtFiles = fs.readdirSync(themesPath).filter((f) => f.endsWith('.txt'));

    for (const file of jsonFiles) {
      const name = file.replace('.json', '');
      const filePath = path.join(themesPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = name;

      if (!isFullImport && !hasContentChangedCached('theme', contentKey, contentHash, lang)) {
        stats.themes.unchanged++;
        continue;
      }

      try {
        JSON.parse(content);
        await tx`REPLACE INTO themes (name, content, language) VALUES (${name}, ${content}, ${lang})`;
        await setContentHash(tx, 'theme', contentKey, contentHash, lang);
        stats.themes.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }

    for (const file of txtFiles) {
      const name = file.replace('.txt', '');
      const filePath = path.join(themesPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = name;

      if (!isFullImport && !hasContentChangedCached('theme', contentKey, contentHash, lang)) {
        stats.themes.unchanged++;
        continue;
      }

      await tx`REPLACE INTO themes (name, content, language) VALUES (${name}, ${content}, ${lang})`;
      await setContentHash(tx, 'theme', contentKey, contentHash, lang);
      stats.themes.updated++;
    }

    // Cleanup: remove themes that no longer exist on disk
    const themeKeysOnDisk = new Set([
      ...jsonFiles.map((f) => f.replace('.json', '')),
      ...txtFiles.map((f) => f.replace('.txt', '')),
    ]);
    await cleanupRemovedEntries(tx, 'themes', 'name', themeKeysOnDisk, 'theme', 'temaer', lang);
  });
  console.log(`${forLang(lang)} ${stats.themes.updated - before} oppdatert`);
}

// Importer tidslinje (bible, world, books)
console.log('Importerer tidslinje...');

const timelineDir = (lang: string) => path.join(GENERATE_PATH, 'timeline', lang);

function readAllTimelineFiles(timelineBaseDir: string): string {
  let combined = '';
  const dirs = ['events', 'world', 'books'];
  for (const dir of dirs) {
    const dirPath = path.join(timelineBaseDir, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json')).sort();
      for (const file of files) {
        combined += fs.readFileSync(path.join(dirPath, file), 'utf-8');
      }
    }
  }
  return combined;
}

interface RawTimelineRef {
  book: number;
  chapter: number;
  verse?: number;
  verseStart?: number;
  verseEnd?: number;
}

async function insertTimelineEvent(
  tx: SQL,
  id: string,
  title: string,
  description: string | null,
  year: number | null,
  yearDisplay: string | null,
  periodId: string | null,
  importance: string,
  sortOrder: number,
  timelineType: string,
  region: string | null,
  bookId: number | null,
  sectionId: string | null,
  language: string,
): Promise<void> {
  await tx`
    REPLACE INTO timeline_events (id, title, description, year, year_display, period_id, importance, sort_order, timeline_type, region, book_id, section_id, language)
    VALUES (${id}, ${title}, ${description}, ${year}, ${yearDisplay}, ${periodId}, ${importance}, ${sortOrder}, ${timelineType}, ${region}, ${bookId}, ${sectionId}, ${language})
  `;
}

async function importTimelineType(
  tx: SQL,
  type: 'bible' | 'world',
  subDir: string,
  lang: string,
): Promise<{ periods: number; events: number }> {
  const dirPath = path.join(timelineDir(lang), subDir);
  const periodsFile = path.join(dirPath, 'periods.json');
  if (!fs.existsSync(periodsFile)) return { periods: 0, events: 0 };

  const periodsData = JSON.parse(fs.readFileSync(periodsFile, 'utf-8'));
  let periodOrder = 0;
  for (const period of periodsData.periods) {
    await tx`
      REPLACE INTO timeline_periods (id, timeline_type, name, color, description, sort_order, language)
      VALUES (${period.id}, ${type}, ${period.name}, ${period.color || null}, ${period.description || null}, ${periodOrder++}, ${lang})
    `;
  }

  let totalEvents = 0;
  for (const period of periodsData.periods) {
    if (period.eventsFile) {
      // eventsFile is like "events/creation.json" or "world/creation.json" - extract just the filename
      const eventFileName = path.basename(period.eventsFile);
      const eventsPath = path.join(dirPath, eventFileName);
      if (fs.existsSync(eventsPath)) {
        const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
        if (eventsData.events) {
          for (const event of eventsData.events) {
            await insertTimelineEvent(
              tx,
              event.id,
              event.title,
              event.description || null,
              event.year || null,
              event.year_display || null,
              event.period || null,
              event.importance || 'minor',
              event.sort_order,
              type,
              event.region || null,
              null,
              null,
              lang,
            );

            if (event.references && event.references.length > 0) {
              for (const ref of event.references as RawTimelineRef[]) {
                const verseStart = ref.verseStart ?? ref.verse ?? 1;
                const verseEnd = ref.verseEnd ?? ref.verse ?? verseStart;
                await tx`
                  INSERT INTO timeline_references (event_id, book_id, chapter, verse_start, verse_end, language)
                  VALUES (${event.id}, ${ref.book}, ${ref.chapter}, ${verseStart}, ${verseEnd}, ${lang})
                `;
              }
            }
            totalEvents++;
          }
        }
      }
    }
  }

  return { periods: periodsData.periods.length, events: totalEvents };
}

async function importBookTimelines(tx: SQL, lang: string): Promise<{ books: number; sections: number; events: number }> {
  const booksDir = path.join(timelineDir(lang), 'books');
  if (!fs.existsSync(booksDir)) return { books: 0, sections: 0, events: 0 };

  const bookFiles = fs.readdirSync(booksDir).filter((f) => f.endsWith('.json')).sort((a, b) => {
    return parseInt(a.replace('.json', '')) - parseInt(b.replace('.json', ''));
  });

  let totalSections = 0;
  let totalEvents = 0;

  for (const file of bookFiles) {
    const filePath = path.join(booksDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const bookId = data.book;

    // Import sections
    if (data.sections) {
      let sectionOrder = 0;
      for (const section of data.sections) {
        await tx`
          REPLACE INTO timeline_book_sections (id, book_id, title, chapter_start, chapter_end, description, sort_order, language)
          VALUES (${section.id}, ${bookId}, ${section.title}, ${section.chapter_start}, ${section.chapter_end}, ${section.description || null}, ${sectionOrder++}, ${lang})
        `;
        totalSections++;
      }
    }

    // Import events
    if (data.events) {
      for (const event of data.events) {
        await insertTimelineEvent(
          tx,
          event.id,
          event.title,
          event.description || null,
          event.year || null,
          event.year_display || null,
          null,
          event.importance || 'minor',
          event.sort_order,
          'books',
          null,
          bookId,
          event.section || null,
          lang,
        );

        if (event.references && event.references.length > 0) {
          for (const ref of event.references as RawTimelineRef[]) {
            const verseStart = ref.verseStart ?? ref.verse ?? 1;
            const verseEnd = ref.verseEnd ?? ref.verse ?? verseStart;
            await tx`
              INSERT INTO timeline_references (event_id, book_id, chapter, verse_start, verse_end, language)
              VALUES (${event.id}, ${bookId}, ${ref.chapter}, ${verseStart}, ${verseEnd}, ${lang})
            `;
          }
        }
        totalEvents++;
      }
    }
  }

  return { books: bookFiles.length, sections: totalSections, events: totalEvents };
}

for (const lang of contentLanguages('timeline')) {
  const combinedContent = readAllTimelineFiles(timelineDir(lang));
  const contentHash = computeHash(combinedContent);

  if (isFullImport || hasContentChangedCached('timeline', 'data', contentHash, lang)) {
    await sql.begin(async (tx) => {
      // Tidslinjen importeres i sin helhet, men bare for DETTE språket — en
      // usscopet DELETE ville tømt de andre språkene.
      await tx`DELETE FROM timeline_references WHERE language = ${lang}`;
      await tx`DELETE FROM timeline_events WHERE language = ${lang}`;
      await tx`DELETE FROM timeline_periods WHERE language = ${lang}`;
      await tx`DELETE FROM timeline_book_sections WHERE language = ${lang}`;

      // Import bible timeline
      const bible = await importTimelineType(tx, 'bible', 'events', lang);
      console.log(`${forLang(lang)} Bibel: ${bible.periods} perioder, ${bible.events} hendelser`);

      // Import world timeline
      const world = await importTimelineType(tx, 'world', 'world', lang);
      console.log(`${forLang(lang)} Verden: ${world.periods} perioder, ${world.events} hendelser`);

      // Import book timelines
      const bookResult = await importBookTimelines(tx, lang);
      console.log(`${forLang(lang)} Bøker: ${bookResult.books} bøker, ${bookResult.sections} seksjoner, ${bookResult.events} hendelser`);

      const totalEvents = bible.events + world.events + bookResult.events;
      await setContentHash(tx, 'timeline', 'data', contentHash, lang);
      stats.timeline.updated += totalEvents;
    });
  } else {
    const rows = (await sql`
      SELECT COUNT(*) as count FROM timeline_events WHERE language = ${lang}
    `) as { count: number | bigint }[];
    const eventCount = Number(rows[0]?.count ?? 0);
    console.log(`${forLang(lang)} Uendret (${eventCount} hendelser)`);
    stats.timeline.unchanged += eventCount;
  }
}

// Importer profetier
console.log('Importerer profetier...');
for (const lang of contentLanguages('prophecies')) {
  const propheciesPath = path.join(GENERATE_PATH, 'prophecies', lang, 'prophecies.json');
  if (!fs.existsSync(propheciesPath)) continue;

  const content = fs.readFileSync(propheciesPath, 'utf-8');
  const contentHash = computeHash(content);

  if (isFullImport || hasContentChangedCached('prophecies', 'data', contentHash, lang)) {
    await sql.begin(async (tx) => {
      const prophecyData = JSON.parse(content);

      // Bare dette språkets rader — se kommentaren i tidslinje-importen.
      await tx`DELETE FROM prophecy_fulfillments WHERE language = ${lang}`;
      await tx`DELETE FROM prophecies WHERE language = ${lang}`;
      await tx`DELETE FROM prophecy_categories WHERE language = ${lang}`;

      if (prophecyData.categories) {
        for (const category of prophecyData.categories) {
          await tx`
            REPLACE INTO prophecy_categories (id, name, description, language)
            VALUES (${category.id}, ${category.name}, ${category.description || null}, ${lang})
          `;
        }
        console.log(`${forLang(lang)} Importerte ${prophecyData.categories.length} kategorier`);
      }

      if (prophecyData.prophecies) {
        for (const prophecy of prophecyData.prophecies) {
          await tx`
            REPLACE INTO prophecies (id, category_id, title, explanation, prophecy_book_id, prophecy_chapter, prophecy_verse_start, prophecy_verse_end, language)
            VALUES (${prophecy.id}, ${prophecy.category}, ${prophecy.title}, ${prophecy.explanation || null}, ${prophecy.prophecy.bookId}, ${prophecy.prophecy.chapter}, ${prophecy.prophecy.verseStart}, ${prophecy.prophecy.verseEnd}, ${lang})
          `;

          if (prophecy.fulfillments && prophecy.fulfillments.length > 0) {
            for (const fulfillment of prophecy.fulfillments) {
              await tx`
                INSERT INTO prophecy_fulfillments (prophecy_id, book_id, chapter, verse_start, verse_end, language)
                VALUES (${prophecy.id}, ${fulfillment.bookId}, ${fulfillment.chapter}, ${fulfillment.verseStart}, ${fulfillment.verseEnd}, ${lang})
              `;
            }
          }
        }
        console.log(`${forLang(lang)} Importerte ${prophecyData.prophecies.length} profetier`);
      }

      await setContentHash(tx, 'prophecies', 'data', contentHash, lang);
      stats.prophecies.updated++;
    });
  } else {
    stats.prophecies.unchanged++;
  }
}

// Importer personer
console.log('Importerer personer...');
for (const lang of contentLanguages('persons')) {
  const personsPath = path.join(GENERATE_PATH, 'persons', lang);
  const before = stats.persons.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(personsPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const name = file.replace('.json', '');
      const filePath = path.join(personsPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = name;

      if (!isFullImport && !hasContentChangedCached('person', contentKey, contentHash, lang)) {
        stats.persons.unchanged++;
        continue;
      }

      try {
        JSON.parse(content);
        await tx`REPLACE INTO persons (name, content, language) VALUES (${name}, ${content}, ${lang})`;
        await setContentHash(tx, 'person', contentKey, contentHash, lang);
        stats.persons.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }
    console.log(`${forLang(lang)} Importerte ${stats.persons.updated - before} personer`);

    // Cleanup: remove persons that no longer exist on disk
    const personKeysOnDisk = new Set(files.map((f) => f.replace('.json', '')));
    await cleanupRemovedEntries(tx, 'persons', 'name', personKeysOnDisk, 'person', 'personer', lang);
  });
}

// Importer kapittel-innsikter
console.log('Importerer kapittel-innsikter...');
for (const lang of contentLanguages('chapter_insights')) {
  const chapterInsightsPath = path.join(GENERATE_PATH, 'chapter_insights', lang);
  const before = stats.chapterInsights.updated;
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(chapterInsightsPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const match = file.match(/^(\d+)-(\d+)\.json$/);
      if (!match) continue;

      const bookId = parseInt(match[1]!);
      const chapter = parseInt(match[2]!);

      const filePath = path.join(chapterInsightsPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `${bookId}-${chapter}`;

      if (!isFullImport && !hasContentChangedCached('chapter_insight', contentKey, contentHash, lang)) {
        stats.chapterInsights.unchanged++;
        continue;
      }

      try {
        const insight = JSON.parse(content);
        await tx`
          REPLACE INTO chapter_insights (book_id, chapter, type, content, language)
          VALUES (${bookId}, ${chapter}, ${insight.type}, ${content}, ${lang})
        `;
        await setContentHash(tx, 'chapter_insight', contentKey, contentHash, lang);
        stats.chapterInsights.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }
    console.log(`${forLang(lang)} Importerte ${stats.chapterInsights.updated - before} kapittel-innsikter`);
  });
}

// Importer dagens vers
console.log('Importerer dagens vers...');
for (const lang of contentLanguages('daily_verse')) {
  const dailyVersePath = path.join(GENERATE_PATH, 'daily_verse', lang);
  await sql.begin(async (tx) => {
    const yearFiles = fs.readdirSync(dailyVersePath).filter((f) => f.endsWith('.json'));

    for (const file of yearFiles) {
      const filePath = path.join(dailyVersePath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = file.replace('.json', '');

      if (!isFullImport && !hasContentChangedCached('daily_verse', contentKey, contentHash, lang)) {
        stats.dailyVerses.unchanged++;
        continue;
      }

      const yearData = JSON.parse(content);

      if (yearData.verses) {
        for (const verse of yearData.verses) {
          // Parse ref format: "book:chapter:verse" or "book:chapter:verseStart-verseEnd"
          const refParts = (verse.ref as string).split(':');
          const bookId = parseInt(refParts[0]!);
          const chapter = parseInt(refParts[1]!);
          const versePart = refParts[2]!;

          let verseStart: number;
          let verseEnd: number;

          if (versePart.includes('-')) {
            const [start, end] = versePart.split('-');
            verseStart = parseInt(start!);
            verseEnd = parseInt(end!);
          } else {
            verseStart = parseInt(versePart);
            verseEnd = verseStart;
          }

          await tx`
            REPLACE INTO daily_verses (date, book_id, chapter, verse_start, verse_end, note, language)
            VALUES (${verse.date}, ${bookId}, ${chapter}, ${verseStart}, ${verseEnd}, ${verse.note || null}, ${lang})
          `;
        }
      }

      await setContentHash(tx, 'daily_verse', contentKey, contentHash, lang);
      stats.dailyVerses.updated++;
    }
    console.log(`${forLang(lang)} Importerte ${stats.dailyVerses.updated} årsfiler (${stats.dailyVerses.unchanged} uendret)`);
  });
}

// Importer leseplaner
console.log('Importerer leseplaner...');
for (const lang of contentLanguages('reading_plans')) {
  const readingPlansPath = path.join(GENERATE_PATH, 'reading_plans', lang);
  const before = stats.readingPlans.updated;
  await sql.begin(async (tx) => {
    const planFiles = fs.readdirSync(readingPlansPath).filter((f) => f.endsWith('.json') && f !== 'index.json');

    for (const file of planFiles) {
      const filePath = path.join(readingPlansPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = file.replace('.json', '');

      if (!isFullImport && !hasContentChangedCached('reading_plan', contentKey, contentHash, lang)) {
        stats.readingPlans.unchanged++;
        continue;
      }

      try {
        const plan = JSON.parse(content);
        await tx`
          REPLACE INTO reading_plans (id, name, description, category, days, content, language)
          VALUES (${plan.id}, ${plan.name}, ${plan.description || null}, ${plan.category || null}, ${plan.days}, ${content}, ${lang})
        `;
        await setContentHash(tx, 'reading_plan', contentKey, contentHash, lang);
        stats.readingPlans.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }
    console.log(`${forLang(lang)} Importerte ${stats.readingPlans.updated - before} leseplaner (${stats.readingPlans.unchanged} uendret)`);
  });
}

// Importer evangelieparalleller
console.log('Importerer evangelieparalleller...');
for (const lang of contentLanguages('gospel_parallels')) {
  const gospelParallelsPath = path.join(GENERATE_PATH, 'gospel_parallels', lang, 'parallels.json');
  if (!fs.existsSync(gospelParallelsPath)) continue;

  const content = fs.readFileSync(gospelParallelsPath, 'utf-8');
  const contentHash = computeHash(content);

  if (isFullImport || hasContentChangedCached('gospel_parallels', 'data', contentHash, lang)) {
    await sql.begin(async (tx) => {
      const data = JSON.parse(content);

      // Bare dette språkets rader — se kommentaren i tidslinje-importen.
      await tx`DELETE FROM gospel_parallel_passages WHERE language = ${lang}`;
      await tx`DELETE FROM gospel_parallels WHERE language = ${lang}`;
      await tx`DELETE FROM gospel_parallel_sections WHERE language = ${lang}`;

      // Import sections
      if (data.sections) {
        let sectionOrder = 0;
        for (const section of data.sections) {
          await tx`
            REPLACE INTO gospel_parallel_sections (id, name, description, sort_order, language)
            VALUES (${section.id}, ${section.name}, ${section.description || null}, ${sectionOrder++}, ${lang})
          `;
        }
        console.log(`${forLang(lang)} Importerte ${data.sections.length} seksjoner`);
      }

      // Import parallels
      if (data.parallels) {
        let parallelOrder = 0;
        for (const parallel of data.parallels) {
          await tx`
            REPLACE INTO gospel_parallels (id, section_id, title, notes, sort_order, language)
            VALUES (${parallel.id}, ${parallel.section}, ${parallel.title}, ${parallel.notes || null}, ${parallelOrder++}, ${lang})
          `;

          // Import passages
          if (parallel.passages) {
            for (const [gospel, passage] of Object.entries(parallel.passages)) {
              const p = passage as { bookId: number; chapter: number; verseStart: number; verseEnd: number; reference: string };
              await tx`
                INSERT INTO gospel_parallel_passages (parallel_id, gospel, book_id, chapter, verse_start, verse_end, reference, language)
                VALUES (${parallel.id}, ${gospel}, ${p.bookId}, ${p.chapter}, ${p.verseStart}, ${p.verseEnd}, ${p.reference}, ${lang})
              `;
            }
          }
        }
        console.log(`${forLang(lang)} Importerte ${data.parallels.length} paralleller`);
      }

      await setContentHash(tx, 'gospel_parallels', 'data', contentHash, lang);
      stats.gospelParallels.updated += data.parallels?.length || 0;
    });
  } else {
    const rows = (await sql`
      SELECT COUNT(*) as count FROM gospel_parallels WHERE language = ${lang}
    `) as { count: number | bigint }[];
    const parallelCount = Number(rows[0]?.count ?? 0);
    console.log(`${forLang(lang)} Uendret (${parallelCount} paralleller)`);
    stats.gospelParallels.unchanged += parallelCount;
  }
}

// Importer vers-mappinger
console.log('Importerer vers-mappinger...');
const mappingsPath = path.join(GENERATE_PATH, 'mappings');
if (fs.existsSync(mappingsPath)) {
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(mappingsPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(mappingsPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const mappingId = file.replace('.json', '');

      if (!isFullImport && !hasContentChangedCached('verse_mapping', mappingId, contentHash)) {
        stats.verseMappings.unchanged++;
        continue;
      }

      try {
        const data = JSON.parse(content);
        await tx`
          REPLACE INTO verse_mappings (id, name, description, book_names, verse_map, unmapped)
          VALUES (${data.id || mappingId}, ${data.name || mappingId}, ${data.description || null}, ${JSON.stringify(data.bookNames)}, ${JSON.stringify(data.verseMap)}, ${data.unmapped ? JSON.stringify(data.unmapped) : null})
        `;
        await setContentHash(tx, 'verse_mapping', mappingId, contentHash);
        stats.verseMappings.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }
    console.log(`  Importerte ${stats.verseMappings.updated} vers-mappinger`);
  });
} else {
  console.log('  Ingen mappinger-mappe funnet');
}


// Importer verk (artikler/bøker fra contrib-pipelinen) — språknøytral flat
// katalog som mappings. KVN-kolonnene er bit-shift-kodingen fra
// kvn/src/types.ts; level avledes av spennet for visningsgruppering.
console.log('Importerer verk (verse_works)...');

function decodeWorkKvn(kvn: number): { book: number; chapter: number; verse: number } {
  return { book: (kvn >> 20) & 0x7f, chapter: (kvn >> 12) & 0xff, verse: (kvn >> 4) & 0xff };
}

function workRefLevel(kvnFrom: number, kvnTo: number): string {
  const a = decodeWorkKvn(kvnFrom);
  const b = decodeWorkKvn(kvnTo);
  if (a.book !== b.book) return 'passage';
  if (a.chapter === b.chapter && a.verse === b.verse) return 'verse';
  const chapters = booksData.find((bk) => bk.id === a.book)?.chapters ?? 0;
  const wholeFromStart = a.chapter === 1 && a.verse === 1;
  const wholeToEnd = b.chapter === chapters && b.verse >= getChapterVerseCount(b.book, b.chapter);
  if (wholeFromStart && wholeToEnd) return 'book';
  if (a.verse === 1 && b.verse >= getChapterVerseCount(b.book, b.chapter)) return 'chapter';
  return 'passage';
}

const verseWorksPath = path.join(GENERATE_PATH, 'verse_works');
if (fs.existsSync(verseWorksPath)) {
  const workKeysOnDisk = new Set<string>();
  await sql.begin(async (tx) => {
    const files = fs.readdirSync(verseWorksPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(verseWorksPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const fileId = file.replace('.json', '');
      workKeysOnDisk.add(fileId);

      if (!isFullImport && !hasContentChangedCached('verse_work', fileId, contentHash)) {
        stats.verseWorks.unchanged++;
        continue;
      }

      try {
        const data = JSON.parse(content) as {
          id?: string;
          kind?: string;
          target?: Record<string, string>;
          title?: string;
          authors?: string[];
          year?: number;
          container?: string;
          contributors?: string[];
          updated?: string;
          refs?: { kvnFrom: number; kvnTo: number; kvnRef?: string; kind?: string;
            where?: { page?: number; chapter_or_section?: string } }[];
        };
        const workId = data.id || fileId;
        await tx`
          REPLACE INTO works (id, kind, title, authors, year, container, doi, isbn13,
                              openlibrary_id, url, contributors, updated)
          VALUES (${workId}, ${data.kind || 'article'}, ${data.title || null},
                  ${data.authors?.length ? data.authors.join(', ') : null}, ${data.year || null},
                  ${data.container || null}, ${data.target?.doi || null},
                  ${data.target?.isbn13 || null}, ${data.target?.openlibrary_id || null},
                  ${data.target?.url || null},
                  ${data.contributors?.length ? data.contributors.join(', ') : null},
                  ${data.updated || null})
        `;
        await tx`DELETE FROM work_verse_refs WHERE work_id = ${workId}`;
        for (const ref of data.refs ?? []) {
          if (!Number.isInteger(ref.kvnFrom) || !Number.isInteger(ref.kvnTo)) continue;
          await tx`
            INSERT INTO work_verse_refs (work_id, kvn_from, kvn_to, kvn_ref, book_id, level,
                                         ref_kind, where_page, where_section)
            VALUES (${workId}, ${ref.kvnFrom}, ${ref.kvnTo}, ${ref.kvnRef || null},
                    ${decodeWorkKvn(ref.kvnFrom).book}, ${workRefLevel(ref.kvnFrom, ref.kvnTo)},
                    ${ref.kind || 'discusses'}, ${ref.where?.page || null},
                    ${ref.where?.chapter_or_section || null})
          `;
        }
        await setContentHash(tx, 'verse_work', fileId, contentHash);
        stats.verseWorks.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }

    // Slett verk som er borte fra disk (works har ingen språkkolonne, så
    // cleanupRemovedEntries kan ikke brukes).
    const dbWorks = (await tx`SELECT id FROM works`) as { id: string }[];
    let removed = 0;
    for (const row of dbWorks) {
      if (workKeysOnDisk.has(row.id)) continue;
      await tx`DELETE FROM work_verse_refs WHERE work_id = ${row.id}`;
      await tx`DELETE FROM works WHERE id = ${row.id}`;
      await tx`DELETE FROM content_hashes WHERE content_type = 'verse_work' AND content_key = ${row.id}`;
      removed++;
    }
    if (removed > 0) {
      deleted['verk'] = (deleted['verk'] ?? 0) + removed;
      console.log(`  Slettet ${removed} verk som er fjernet fra disk`);
    }
    console.log(`  Importerte ${stats.verseWorks.updated} verk`);
  });
} else {
  console.log('  Ingen verse_works-mappe funnet');
}

// Importer bibelhistorier (per-fil, lik persons-mønsteret)
console.log('Importerer bibelhistorier...');

async function insertStory(
  tx: SQL,
  story: { slug: string; title: string; keywords: string[]; description?: string; category: string },
  language: string,
): Promise<void> {
  await tx`
    REPLACE INTO stories (slug, title, keywords, description, category, content, language)
    VALUES (${story.slug}, ${story.title}, ${story.keywords.join(',')}, ${story.description || null}, ${story.category}, ${JSON.stringify(story)}, ${language})
  `;
}

for (const lang of contentLanguages('stories')) {
  const storiesDir = path.join(GENERATE_PATH, 'stories', lang);
  const before = stats.stories.updated;
  // Skjulte filer er pipeline-tilstand fra free-bible (.flagged_existing.json,
  // .scan_state.json …), ikke innhold — samme skille som bibles_raw/word4word.
  const storyFiles = fs
    .readdirSync(storiesDir)
    .filter((f) => !f.startsWith('.') && f.endsWith('.json') && f !== 'stories.json');

  if (storyFiles.length > 0) {
    // Per-fil import (nye individuelle filer)
    await sql.begin(async (tx) => {
      for (const file of storyFiles) {
        const slug = file.replace('.json', '');
        const filePath = path.join(storiesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentHash = computeHash(content);
        const contentKey = slug;

        if (!isFullImport && !hasContentChangedCached('story', contentKey, contentHash, lang)) {
          stats.stories.unchanged++;
          continue;
        }

        try {
          const story = JSON.parse(content);
          await insertStory(tx, story, lang);
          await setContentHash(tx, 'story', contentKey, contentHash, lang);
          stats.stories.updated++;
        } catch (e) {
          console.error(`Ugyldig JSON i ${file}:`, e);
        }
      }
    });
  } else {
    // Fallback: gammel monolittisk stories.json
    const storiesJsonPath = path.join(storiesDir, 'stories.json');
    if (fs.existsSync(storiesJsonPath)) {
      const content = fs.readFileSync(storiesJsonPath, 'utf-8');
      const contentHash = computeHash(content);

      if (isFullImport || hasContentChangedCached('stories', 'data', contentHash, lang)) {
        await sql.begin(async (tx) => {
          try {
            const storiesData = JSON.parse(content);
            await tx`DELETE FROM stories WHERE language = ${lang}`;

            for (const story of storiesData) {
              await insertStory(tx, story, lang);
            }

            await setContentHash(tx, 'stories', 'data', contentHash, lang);
            stats.stories.updated += storiesData.length;
            console.log(`${forLang(lang)} Importerte ${storiesData.length} bibelhistorier (fra stories.json)`);
          } catch (e) {
            console.error('Ugyldig JSON i stories.json:', e);
          }
        });
      } else {
        const rows = (await sql`
          SELECT COUNT(*) as count FROM stories WHERE language = ${lang}
        `) as { count: number | bigint }[];
        const storyCount = Number(rows[0]?.count ?? 0);
        console.log(`${forLang(lang)} Uendret (${storyCount} historier)`);
        stats.stories.unchanged += storyCount;
      }
    }
  }
  console.log(`${forLang(lang)} Importerte ${stats.stories.updated - before} bibelhistorier (${stats.stories.unchanged} uendret)`);

  // Cleanup: remove stories that no longer exist on disk (only for per-file mode)
  if (storyFiles.length > 0) {
    const storyKeysOnDisk = new Set(storyFiles.map((f) => f.replace('.json', '')));
    await cleanupRemovedEntries(sql, 'stories', 'slug', storyKeysOnDisk, 'story', 'historier', lang);
  }
}

// Importer tallsymbolikk
console.log('Importerer tallsymbolikk...');
for (const lang of contentLanguages('number_symbolism')) {
  const numberSymbolismPath = path.join(GENERATE_PATH, 'number_symbolism', lang);
  const before = stats.numberSymbolism.updated;
  await sql.begin(async (tx) => {
    const jsonFiles = fs.readdirSync(numberSymbolismPath).filter((f) => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = path.join(numberSymbolismPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);
      const contentKey = `number-${file.replace('.json', '')}`;

      if (!isFullImport && !hasContentChangedCached('numberSymbolism', contentKey, contentHash, lang)) {
        stats.numberSymbolism.unchanged++;
        continue;
      }

      try {
        const data = JSON.parse(content);
        await tx`
          REPLACE INTO number_symbolism (number, content, language)
          VALUES (${data.number}, ${content}, ${lang})
        `;
        await setContentHash(tx, 'numberSymbolism', contentKey, contentHash, lang);
        stats.numberSymbolism.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }
    console.log(`${forLang(lang)} Importerte ${stats.numberSymbolism.updated - before} tall (${stats.numberSymbolism.unchanged} uendret)`);

    // Cleanup: remove numbers that no longer exist on disk
    const numberKeysOnDisk = new Set(jsonFiles.map((f) => f.replace('.json', '')));
    await cleanupRemovedEntries(tx, 'number_symbolism', 'number', numberKeysOnDisk, 'numberSymbolism', 'tall', lang);
  });
}

// Importer dager (helligdager/merkedager)
console.log('Importerer dager...');
for (const lang of contentLanguages('days')) {
  const daysPath = path.join(GENERATE_PATH, 'days', lang);
  const before = stats.days.updated;
  await sql.begin(async (tx) => {
    const dayFiles = fs.readdirSync(daysPath).filter((f) => f.endsWith('.json'));

    for (const file of dayFiles) {
      const id = file.replace('.json', '');
      const filePath = path.join(daysPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentHash = computeHash(content);

      if (!isFullImport && !hasContentChangedCached('day', id, contentHash, lang)) {
        stats.days.unchanged++;
        continue;
      }

      try {
        const data = JSON.parse(content);
        await tx`
          REPLACE INTO days (id, name, content, language)
          VALUES (${data.id}, ${data.name}, ${content}, ${lang})
        `;
        await setContentHash(tx, 'day', id, contentHash, lang);
        stats.days.updated++;
      } catch (e) {
        console.error(`Ugyldig JSON i ${file}:`, e);
      }
    }
    console.log(`${forLang(lang)} Importerte ${stats.days.updated - before} dager (${stats.days.unchanged} uendret)`);

    const dayKeysOnDisk = new Set(dayFiles.map((f) => f.replace('.json', '')));
    await cleanupRemovedEntries(tx, 'days', 'id', dayKeysOnDisk, 'day', 'dager', lang);
  });
}

// Importer lesetekster (DNK)
console.log('Importerer lesetekster...');

// Cache UkvnMappers for converting translation→osmain
const kvnMapperCache = new Map<string, UkvnMapper>();
function getKvnMapper(mappingId: string): UkvnMapper {
  if (!kvnMapperCache.has(mappingId)) {
    kvnMapperCache.set(mappingId, new UkvnMapper(loadUkvnMapping(mappingId)));
  }
  return kvnMapperCache.get(mappingId)!;
}

/**
 * Normalize comma notation (Sal 24,1-10) to colon notation (Sal 24:1-10)
 * in the ref part of a [ref:...] markup. Replaces every chapter,verse comma
 * (needed for cross-chapter ranges like "1 Mos 1,26-2,2").
 */
function normalizeRefComma(markup: string): string {
  return markup.replace(/\[ref:([^|@\]]+)/, (_, refPart: string) => {
    const normalized = refPart.replace(/(\d+),(\d)/g, '$1:$2');
    return '[ref:' + normalized;
  });
}

/**
 * Parse a verseSpec like "1-10", "1a.2.6-7", "13-15a.17-18" into ranges.
 * Dot separates discontinuous ranges. Each range has start, end, and part suffixes.
 * "1a" means part 'a' of verse 1. "15a" means up to part 'a' of verse 15.
 */
function parseVerseRanges(verseSpec: string): { start: number; end: number; partStart: string | null; partEnd: string | null }[] {
  if (!verseSpec) return [];
  // Normalize en-dash (–) and em-dash (—) to hyphen
  const normalized = verseSpec.replace(/[–—]/g, '-');
  const parts = normalized.split('.');
  return parts.map((part) => {
    const dashIdx = part.indexOf('-');
    if (dashIdx === -1) {
      // Single verse or verse with part: "2" or "1a"
      const partMatch = part.match(/^(\d+)([a-c])?$/);
      if (!partMatch) return null;
      const v = parseInt(partMatch[1]!, 10);
      const p = partMatch[2] || null;
      return { start: v, end: v, partStart: p, partEnd: p };
    }
    const startStr = part.slice(0, dashIdx);
    const endStr = part.slice(dashIdx + 1);
    const startMatch = startStr.match(/^(\d+)([a-c])?$/);
    const endMatch = endStr.match(/^(\d+)([a-c])?$/);
    if (!startMatch || !endMatch) return null;
    return {
      start: parseInt(startMatch[1]!, 10),
      end: parseInt(endMatch[1]!, 10),
      partStart: startMatch[2] || null,
      partEnd: endMatch[2] || null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null && !isNaN(r.start));
}

/**
 * Convert a verse number from a translation system to osmain coordinates.
 */
function toOsmain(bookId: number, chapter: number, verse: number, mappingId: string): { chapter: number; verse: number } {
  const mapper = getKvnMapper(mappingId);
  const tkvn = ukvnEncode(bookId, chapter, verse);
  const osmainKvn = mapper.toKvn(tkvn);
  const decoded = ukvnDecode(osmainKvn);
  return { chapter: decoded.chapter, verse: decoded.verse };
}

const leseteksterPath = path.join(GENERATE_PATH, 'dnk_lesetekster');
if (fs.existsSync(leseteksterPath)) {
  const jsonFiles = fs.readdirSync(leseteksterPath).filter((f) => f.endsWith('.json'));

  // Check if any files changed
  const allContent = jsonFiles.map((f) => fs.readFileSync(path.join(leseteksterPath, f), 'utf-8'));
  const combinedHash = computeHash(allContent.join(''));

  if (isFullImport || hasContentChangedCached('readingTexts', 'all', combinedHash)) {
    await sql.begin(async (tx) => {
      // Clear existing data and reimport
      await tx`DELETE FROM reading_text_refs`;
      await tx`DELETE FROM reading_texts`;

      let totalTexts = 0;
      let totalRefs = 0;

      async function insertOneRef(
        readingTextId: number,
        slotIdx: number,
        optionIdx: number,
        partIdx: number,
        refMarkup: string,
        title: string,
        sortOrderBase: number,
      ): Promise<number> {
        const displayRef = refMarkup;
        try {
          const normalized = normalizeRefComma(refMarkup);
          let parsed: { book: string; chapter: number; verseSpec: string; system?: string; displayText?: string };
          try {
            parsed = parseRefMarkup(normalized);
          } catch {
            const match = normalized.match(/^\[ref:([^\]]+)\]$/);
            if (!match) throw new Error(`Invalid ref: ${refMarkup}`);
            let refPart = match[1]!.trim();
            let system: string | undefined;
            const atIdx = refPart.lastIndexOf('@');
            if (atIdx !== -1) {
              system = refPart.slice(atIdx + 1).trim();
              refPart = refPart.slice(0, atIdx).trim();
            }
            const bookMatch = refPart.match(/^(.+?)\s+(\d.*)$/);
            if (!bookMatch) throw new Error(`Invalid ref: ${refMarkup}`);
            const book = bookMatch[1]!.trim();
            const chapterVerse = bookMatch[2]!.trim();
            const colonIdx = chapterVerse.indexOf(':');
            if (colonIdx === -1) {
              parsed = { book, chapter: parseInt(chapterVerse, 10), verseSpec: '', system, displayText: refPart };
            } else {
              parsed = { book, chapter: parseInt(chapterVerse.slice(0, colonIdx), 10), verseSpec: chapterVerse.slice(colonIdx + 1).trim(), system, displayText: refPart };
            }
          }
          const bookId = BOOK_IDS[parsed.book];
          if (bookId === undefined) {
            console.warn(`  Ukjent bok: ${parsed.book} i ${refMarkup}`);
            return 0;
          }
          const mappingId = parsed.system ? (resolveMappingId(parsed.system) || parsed.system) : 'osnb';
          const ranges = parseVerseRanges(parsed.verseSpec);

          let inserted = 0;
          if (ranges.length === 0) {
            const osmain = toOsmain(bookId, parsed.chapter, 1, mappingId);
            await tx`
              INSERT INTO reading_text_refs (reading_text_id, slot_index, option_index, part_index, title, display_ref, book_id, chapter, verse_start, verse_end, part_start, part_end, sort_order)
              VALUES (${readingTextId}, ${slotIdx}, ${optionIdx}, ${partIdx}, ${title}, ${displayRef}, ${bookId}, ${osmain.chapter}, ${1}, ${null}, ${null}, ${null}, ${sortOrderBase})
            `;
            inserted++;
          } else {
            for (let rangeIdx = 0; rangeIdx < ranges.length; rangeIdx++) {
              const range = ranges[rangeIdx]!;
              const mappedVerses: { chapter: number; verse: number }[] = [];
              for (let v = range.start; v <= range.end; v++) {
                mappedVerses.push(toOsmain(bookId, parsed.chapter, v, mappingId));
              }
              const groups: { chapter: number; verseStart: number; verseEnd: number; isFirst: boolean; isLast: boolean }[] = [];
              let currentGroup: typeof groups[0] | null = null;
              for (let vi = 0; vi < mappedVerses.length; vi++) {
                const mv = mappedVerses[vi]!;
                if (!currentGroup || mv.chapter !== currentGroup.chapter || mv.verse !== currentGroup.verseEnd + 1) {
                  if (currentGroup) groups.push(currentGroup);
                  currentGroup = { chapter: mv.chapter, verseStart: mv.verse, verseEnd: mv.verse, isFirst: vi === 0, isLast: vi === mappedVerses.length - 1 };
                } else {
                  currentGroup.verseEnd = mv.verse;
                  currentGroup.isLast = vi === mappedVerses.length - 1;
                }
              }
              if (currentGroup) groups.push(currentGroup);
              for (let gi = 0; gi < groups.length; gi++) {
                const g = groups[gi]!;
                await tx`
                  INSERT INTO reading_text_refs (reading_text_id, slot_index, option_index, part_index, title, display_ref, book_id, chapter, verse_start, verse_end, part_start, part_end, sort_order)
                  VALUES (${readingTextId}, ${slotIdx}, ${optionIdx}, ${partIdx}, ${title}, ${displayRef}, ${bookId}, ${g.chapter}, ${g.verseStart}, ${g.verseEnd}, ${g.isFirst ? range.partStart : null}, ${g.isLast ? range.partEnd : null}, ${sortOrderBase + rangeIdx * 10 + gi})
                `;
                inserted++;
              }
            }
          }
          return inserted;
        } catch (e) {
          console.warn(`  Kunne ikke parse referanse: ${refMarkup} — ${(e as Error).message}`);
          return 0;
        }
      }

      for (let fileIdx = 0; fileIdx < jsonFiles.length; fileIdx++) {
        const content = allContent[fileIdx]!;
        try {
          const entries = JSON.parse(content) as Array<{
            name: string;
            date: string;
            series: string;
            slots: Array<{
              options: Array<{
                parts: Array<{ refs: string[]; title: string }>;
              }>;
            }>;
          }>;

          for (const entry of entries) {
            await tx`INSERT INTO reading_texts (date, name, series) VALUES (${entry.date}, ${entry.name}, ${entry.series || null})`;
            const idRows = (await tx`SELECT LAST_INSERT_ID() AS id`) as { id: number | bigint }[];
            const readingTextId = Number(idRows[0]!.id);
            totalTexts++;

            for (let slotIdx = 0; slotIdx < entry.slots.length; slotIdx++) {
              const slot = entry.slots[slotIdx]!;
              for (let optionIdx = 0; optionIdx < slot.options.length; optionIdx++) {
                const option = slot.options[optionIdx]!;
                for (let partIdx = 0; partIdx < option.parts.length; partIdx++) {
                  const part = option.parts[partIdx]!;
                  for (let refIdx = 0; refIdx < part.refs.length; refIdx++) {
                    const refMarkup = part.refs[refIdx]!;
                    const sortBase = (slotIdx * 10000) + (optionIdx * 1000) + (partIdx * 100) + (refIdx * 10);
                    totalRefs += await insertOneRef(readingTextId, slotIdx, optionIdx, partIdx, refMarkup, part.title, sortBase);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error(`Ugyldig JSON i ${jsonFiles[fileIdx]}:`, e);
        }
      }

      await setContentHash(tx, 'readingTexts', 'all', combinedHash);
      stats.readingTexts.updated = totalTexts;
      console.log(`  Importerte ${totalTexts} lesetekster med ${totalRefs} referanser`);
    });
  } else {
    stats.readingTexts.unchanged = 1;
    console.log('  Lesetekster uendret');
  }
}

// (Indekser opprettes av ensureSchema — ingen egen indeks-seksjon i MySQL.)

// Check if any content was updated
const totalUpdated = Object.values(stats).reduce((sum, s) => sum + s.updated, 0);
const totalUnchanged = Object.values(stats).reduce((sum, s) => sum + s.unchanged, 0);
const totalDeleted = Object.values(deleted).reduce((sum, n) => sum + n, 0);

// Only increment sync version if something changed
if (totalUpdated > 0 || totalDeleted > 0 || isFullImport) {
  await sql.begin(async (tx) => {
    const newSyncVersion = await incrementSyncVersion(tx);

    // Store timestamp for this version
    const now = new Date();
    const version = now.toISOString().replace('T', ' ').substring(0, 19);
    await tx`REPLACE INTO db_meta (\`key\`, value) VALUES ('version', ${version})`;
    await tx`REPLACE INTO db_meta (\`key\`, value) VALUES ('imported_at', ${now.toISOString()})`;
    await tx`REPLACE INTO db_meta (\`key\`, value) VALUES (${`version_${newSyncVersion}`}, ${now.toISOString()})`;
    console.log(`\nSync-versjon: ${newSyncVersion}`);
    console.log(`Database-versjon: ${version}`);
  });
} else {
  const currentVersion = await getSyncVersion(sql);
  console.log(`\nIngen endringer - sync-versjon forblir: ${currentVersion}`);
}

await closeSql();

// Print summary
console.log('\n=== Import-sammendrag ===');
console.log(`Modus: ${isFullImport ? 'Full reimport' : 'Inkrementell'}`);
console.log('');
const d = (label: string) => (deleted[label] ? String(deleted[label]).padStart(7) : '      -');
console.log('Innholdstype          Oppdatert  Uendret  Slettet');
console.log('--------------------------------------------------');
console.log(`Kapitler              ${String(stats.chapters.updated).padStart(9)}  ${String(stats.chapters.unchanged).padStart(7)}  ${d('kapitler')}`);
console.log(`Oversettelser         ${String(stats.bibleEditions.updated).padStart(9)}  ${String(stats.bibleEditions.unchanged).padStart(7)}  ${d('oversettelser')}`);
console.log(`Word4word             ${String(stats.word4word.updated).padStart(9)}  ${String(stats.word4word.unchanged).padStart(7)}  ${d('word4word')}`);
console.log(`Referanser            ${String(stats.references.updated).padStart(9)}  ${String(stats.references.unchanged).padStart(7)}  ${d('referanser')}`);
console.log(`Boksammendrag         ${String(stats.bookSummaries.updated).padStart(9)}  ${String(stats.bookSummaries.unchanged).padStart(7)}  ${d('boksammendrag')}`);
console.log(`Bokkontekst           ${String(stats.bookContext.updated).padStart(9)}  ${String(stats.bookContext.unchanged).padStart(7)}  ${d('bokkontekst')}`);
console.log(`Kapittelsammendrag    ${String(stats.chapterSummaries.updated).padStart(9)}  ${String(stats.chapterSummaries.unchanged).padStart(7)}  ${d('kapittelsammendrag')}`);
console.log(`Kapittelkontekst      ${String(stats.chapterContext.updated).padStart(9)}  ${String(stats.chapterContext.unchanged).padStart(7)}  ${d('kapittelkontekst')}`);
console.log(`Viktige ord           ${String(stats.importantWords.updated).padStart(9)}  ${String(stats.importantWords.unchanged).padStart(7)}  ${d('viktige ord')}`);
console.log(`Vers-bønn             ${String(stats.versePrayers.updated).padStart(9)}  ${String(stats.versePrayers.unchanged).padStart(7)}  ${d('vers-bønn')}`);
console.log(`Vers-andakt           ${String(stats.verseSermons.updated).padStart(9)}  ${String(stats.verseSermons.unchanged).padStart(7)}  ${d('vers-andakt')}`);
console.log(`Temaer                ${String(stats.themes.updated).padStart(9)}  ${String(stats.themes.unchanged).padStart(7)}  ${d('temaer')}`);
console.log(`Tidslinje             ${String(stats.timeline.updated).padStart(9)}  ${String(stats.timeline.unchanged).padStart(7)}  ${d('tidslinje')}`);
console.log(`Profetier             ${String(stats.prophecies.updated).padStart(9)}  ${String(stats.prophecies.unchanged).padStart(7)}  ${d('profetier')}`);
console.log(`Personer              ${String(stats.persons.updated).padStart(9)}  ${String(stats.persons.unchanged).padStart(7)}  ${d('personer')}`);
console.log(`Kapittel-innsikter    ${String(stats.chapterInsights.updated).padStart(9)}  ${String(stats.chapterInsights.unchanged).padStart(7)}  ${d('kapittel-innsikter')}`);
console.log(`Dagens vers           ${String(stats.dailyVerses.updated).padStart(9)}  ${String(stats.dailyVerses.unchanged).padStart(7)}  ${d('dagens vers')}`);
console.log(`Leseplaner            ${String(stats.readingPlans.updated).padStart(9)}  ${String(stats.readingPlans.unchanged).padStart(7)}  ${d('leseplaner')}`);
console.log(`Evangelieparalleller  ${String(stats.gospelParallels.updated).padStart(9)}  ${String(stats.gospelParallels.unchanged).padStart(7)}  ${d('evangelieparalleller')}`);
console.log(`Vers-mappinger        ${String(stats.verseMappings.updated).padStart(9)}  ${String(stats.verseMappings.unchanged).padStart(7)}  ${d('vers-mappinger')}`);
console.log(`Bibelhistorier        ${String(stats.stories.updated).padStart(9)}  ${String(stats.stories.unchanged).padStart(7)}  ${d('historier')}`);
console.log(`Tallsymbolikk         ${String(stats.numberSymbolism.updated).padStart(9)}  ${String(stats.numberSymbolism.unchanged).padStart(7)}  ${d('tall')}`);
console.log(`Dager                 ${String(stats.days.updated).padStart(9)}  ${String(stats.days.unchanged).padStart(7)}  ${d('dager')}`);
console.log(`Verk                  ${String(stats.verseWorks.updated).padStart(9)}  ${String(stats.verseWorks.unchanged).padStart(7)}  ${d('verk')}`);
console.log('--------------------------------------------------');
console.log(`Totalt                ${String(totalUpdated).padStart(9)}  ${String(totalUnchanged).padStart(7)}  ${totalDeleted > 0 ? String(totalDeleted).padStart(7) : '      -'}`);
console.log('\nFerdig!');
