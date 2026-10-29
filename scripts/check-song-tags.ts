// Does every song in FLOGVIT.music's index reach a page in bibel? (#188)
//
//   bun scripts/check-song-tags.ts            # the live index, against the DB in .env
//   MUSIC_INDEX_URL=<url> bun scripts/check-song-tags.ts
//
// A song whose theme, person or story slug bibel does not have, or whose passage
// points past the end of a chapter, is shown nowhere for that tag — the page
// answers 200 and the song is just missing. This lists each such tag and exits 1.
// The fix is in the index (flogvit/flogvit-bible-music), or, for an id bibel has
// renamed, in bibel's alias tables (`canonicalSlug` in src/lib/songs.ts uses them).

import { closeSql, getSql } from '../src/lib/db.ts';
import { canonicalSlug, songIndex, type SongTagKind } from '../src/lib/songs.ts';
import { verseCounts } from '../src/lib/verse-counts.ts';

const index = await songIndex();
if (!index) {
  console.error(`Could not read the index (${process.env.MUSIC_INDEX_URL ?? 'the default'}).`);
  process.exit(1);
}

const sql = getSql();
const COLUMNS: Record<SongTagKind, string> = {
  themes: 'SELECT DISTINCT name AS v FROM themes',
  persons: 'SELECT DISTINCT name AS v FROM persons',
  stories: 'SELECT DISTINCT slug AS v FROM stories',
};
const problems: string[] = [];
for (const [kind, query] of Object.entries(COLUMNS) as [SongTagKind, string][]) {
  const have = new Set(((await sql.unsafe(query)) as { v: string }[]).map((r) => r.v));
  for (const s of index.songs) {
    for (const { slug } of s.tags[kind] ?? []) {
      if (!have.has(canonicalSlug(kind, slug))) problems.push(`${s.id}: ${kind} «${slug}» is not in bibel`);
    }
  }
}
for (const s of index.songs) {
  for (const p of s.references) {
    const last = verseCounts[p.bookId]?.[p.chapter - 1];
    if (!last || (p.verseEnd ?? p.verseStart ?? 0) > last) {
      problems.push(`${s.id}: ${p.bookId} ${p.chapter}:${p.verseStart ?? ''}-${p.verseEnd ?? ''} is not in osnb`);
    }
  }
}
await closeSql();

console.log(`${index.songs.length} songs in ${index.url}`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('Every theme, person, story and passage reaches a page in bibel.');
