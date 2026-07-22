// Berik bibelhistorier med evangelieparalleller (port fra better-sqlite3 →
// Bun.sql, ISSUES.md #3). Leser gospel_parallel_passages fra DB-en, matcher mot
// historie-referansene i free-bible/generate/stories/nb/*.json og legger til
// manglende parallellreferanser i filene. Kjøres etter split-stories (alt
// gjort — enkeltfilene finnes). Kjør: bun scripts/enrich-story-references.ts

import { readdirSync } from 'node:fs';
import { getSql, closeSql } from '../src/lib/db.ts';

const STORIES_DIR = '../free-bible/generate/stories/nb';

interface StoryRef {
  bookId: number;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

interface Story {
  slug: string;
  references?: StoryRef[];
  [key: string]: unknown;
}

interface GospelPassage {
  parallel_id: string;
  gospel: string;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

const sql = getSql();
const passages = (await sql`
  SELECT gpp.parallel_id, gpp.gospel, gpp.book_id, gpp.chapter, gpp.verse_start, gpp.verse_end
  FROM gospel_parallel_passages gpp
  JOIN gospel_parallels gp ON gp.id = gpp.parallel_id
  ORDER BY gpp.parallel_id
`) as GospelPassage[];

const parallelGroups = new Map<string, GospelPassage[]>();
for (const p of passages) {
  const group = parallelGroups.get(p.parallel_id) || [];
  group.push(p);
  parallelGroups.set(p.parallel_id, group);
}
console.log(`Lastet ${parallelGroups.size} evangelieparalleller fra databasen.`);

// Kapittel*1000 + vers som lineær posisjon (som originalen).
function rangesOverlap(storyRef: StoryRef, passage: GospelPassage): boolean {
  if (storyRef.bookId !== passage.book_id) return false;
  const storyStart = storyRef.startChapter * 1000 + storyRef.startVerse;
  const storyEnd = storyRef.endChapter * 1000 + storyRef.endVerse;
  const passageStart = passage.chapter * 1000 + passage.verse_start;
  const passageEnd = passage.chapter * 1000 + passage.verse_end;
  return storyStart <= passageEnd && passageStart <= storyEnd;
}

function hasReference(refs: StoryRef[], ref: StoryRef): boolean {
  return refs.some(
    (r) =>
      r.bookId === ref.bookId &&
      r.startChapter === ref.startChapter &&
      r.startVerse === ref.startVerse &&
      r.endChapter === ref.endChapter &&
      r.endVerse === ref.endVerse,
  );
}

const storyFiles = readdirSync(STORIES_DIR).filter((f) => f.endsWith('.json') && f !== 'stories.json');
console.log(`Fant ${storyFiles.length} historiefiler.`);

let enrichedCount = 0;
let totalNewRefs = 0;

for (const file of storyFiles) {
  const filePath = `${STORIES_DIR}/${file}`;
  const story = (await Bun.file(filePath).json()) as Story;
  if (!story.references || story.references.length === 0) continue;

  const newRefs: StoryRef[] = [];
  for (const storyRef of story.references) {
    for (const group of parallelGroups.values()) {
      const matchingPassage = group.find((p) => rangesOverlap(storyRef, p));
      if (!matchingPassage) continue;
      for (const other of group) {
        if (other === matchingPassage) continue;
        const newRef: StoryRef = {
          bookId: other.book_id,
          startChapter: other.chapter,
          startVerse: other.verse_start,
          endChapter: other.chapter,
          endVerse: other.verse_end,
        };
        if (!hasReference(story.references, newRef) && !hasReference(newRefs, newRef)) {
          newRefs.push(newRef);
        }
      }
    }
  }

  if (newRefs.length > 0) {
    story.references.push(...newRefs);
    await Bun.write(filePath, JSON.stringify(story, null, 2) + '\n');
    console.log(`  ${story.slug}: +${newRefs.length} referanser (totalt ${story.references.length})`);
    enrichedCount++;
    totalNewRefs += newRefs.length;
  }
}

console.log(`\nFerdig! Beriket ${enrichedCount} historier med ${totalNewRefs} nye referanser.`);
await closeSql();
