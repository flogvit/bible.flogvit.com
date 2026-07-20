// Engangs-bootstrap: kopierer alle innholdstabeller fra gamle bibel/data/bible.db
// (SQLite, fasit re-importert 2026-07-19) inn i MySQL — identiske data, verifisert
// med radantall per tabell. Import-pipelinen (ISSUES.md #3) tar over for fremtidige
// innholdsoppdateringer; denne kan slettes etter cutover.
// Kjør: bun scripts/copy-sqlite.ts [sti-til-bible.db]

import { Database } from 'bun:sqlite';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';

const SQLITE_PATH = process.argv[2] ?? '../bibel/data/bible.db';

// Innholdstabellene (brukertabellene har ingen kilde i bible.db).
const TABLES = [
  'books',
  'verses',
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
  'days',
  'number_symbolism',
  'reading_texts',
  'reading_text_refs',
  'stories',
  'content_hashes',
];

const BATCH = 500;

const src = new Database(SQLITE_PATH, { readonly: true });
const sql = getSql();
await ensureSchema(sql);

let mismatch = false;

for (const table of TABLES) {
  const cols = (src.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
  const colList = cols.map((c) => `\`${c}\``).join(', ');
  const rows = src.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];

  await sql.unsafe(`DELETE FROM ${table}`).simple();

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const placeholders = chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ');
    const values = chunk.flatMap((r) => cols.map((c) => r[c] ?? null));
    await sql.unsafe(`INSERT INTO ${table} (${colList}) VALUES ${placeholders}`, values);
  }

  const [{ n }] = (await sql.unsafe(`SELECT COUNT(*) AS n FROM ${table}`)) as { n: number | bigint }[];
  const ok = Number(n) === rows.length;
  if (!ok) mismatch = true;
  console.log(`${ok ? 'OK  ' : 'FEIL'} ${table}: sqlite=${rows.length} mysql=${n}`);
}

src.close();
await closeSql();
if (mismatch) {
  console.error('Radantall stemmer ikke — se FEIL-linjene over.');
  process.exit(1);
}
console.log('Alle tabeller kopiert med likt radantall.');
