// A psalm's title in a numbering that prints it without a number (#173).
//
// osnb numbers a psalm's title as its own verse (Ps 51:1–2 is the title, 51:3
// "Have mercy"), as the Hebrew does. KVN's master numbering folds the title
// into verse 1, and the King James inherits that: all three osnb verses landed
// in KJV 51:1, so «Ps 51:1» from a printed KJV gave the title. The title is now
// verse 0 in such a numbering, and verse 1 is the verse.
//
// The truth here is the PRINTED King James (free-bible `bibles_raw/kjv`), not
// the mapping: its verse 2 is found at its osnb address through the imported,
// text-verified KJV edition, and verse 1 must be exactly the one osnb verse
// before it. Krever lokal DB (DBngin :3326) med kjv-utgaven importert.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { FREE_BIBLE_DIR } from '../scripts/kvn-staging.ts';
import { readerText } from '../src/lib/edition-import.ts';
import type { RawVerse } from '../src/lib/edition-import.ts';
import { getVerses } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { getKvnMappingData, mapChapter, osnbToMapping } from '../src/lib/verse-mapper.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);
afterAll(() => closeSql());

const PSALMS = 19;

/**
 * Psalms whose title `english_kj` does not fold into verse 1, so the KJV is a
 * verse off there for a reason in free-bible's data, not in the code here:
 * 9 and 77 have no entries at all, 60 has stale `60:1`/`60:1a` entries. Over
 * all 1158 numberings, 803 fold Ps 60's title, 54 Ps 9's, 50 Ps 77's.
 * see the free-bible issue named in #173. Asserted to be STILL wrong, so the list goes
 * red the day the data is fixed.
 */
const KJV_DATA_ERRORS = [9, 60, 77];

function printedKjv(chapter: number): RawVerse[] {
  const file = path.join(FREE_BIBLE_DIR, 'generate', 'bibles_raw', 'kjv', String(PSALMS), `${chapter}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawVerse[];
}

describe('the King James numbering against the printed King James', () => {
  test('in every psalm, KJV verse 1 is the one osnb verse before printed verse 2', async () => {
    const wrong: number[] = [];
    let titled = 0;
    for (let ch = 1; ch <= 150; ch++) {
      const second = printedKjv(ch).find((v) => v.verseId === 2)!;
      const kjvEdition = await getVerses(PSALMS, ch, 'kjv');
      const at = kjvEdition.find((v) => v.text.trim() === readerText(second.text).trim());
      expect(at, `printed KJV Ps ${ch}:2 is not in the kjv edition`).toBeDefined();
      const expected = at!.verse - 1;
      if (expected > 1) titled++;

      const verseOne = (await mapChapter(PSALMS, ch, 'english_kj')).filter((m) => m.displayVerse === 1);
      const ok = verseOne.length === 1 && verseOne[0]!.osnbVerse === expected && !verseOne[0]!.partial;
      if (!ok) wrong.push(ch);
    }
    expect(titled).toBeGreaterThan(60);
    expect(wrong).toEqual(KJV_DATA_ERRORS);
  }, 60_000);

  test('the title is verse 0, in the order osnb gives it, and nothing else is', async () => {
    const ps51 = await mapChapter(PSALMS, 51, 'english_kj', 'osen');
    expect(ps51.filter((m) => m.displayVerse === 0).map((m) => m.osnbVerse)).toEqual([1, 2]);
    expect(ps51.filter((m) => m.displayVerse === 1).map((m) => m.osnbVerse)).toEqual([3]);
    expect(ps51.find((m) => m.displayVerse === 1)!.text).toStartWith('Have mercy');
    expect(ps51.at(-1)!.displayVerse).toBe(19);
    // The other route in the data: english_kj's own entry osmain 18:2 → 18:1.
    const ps18 = await mapChapter(PSALMS, 18, 'english_kj');
    expect(ps18.filter((m) => m.displayVerse === 0).map((m) => m.osnbVerse)).toEqual([1]);
    expect(ps18.filter((m) => m.displayVerse === 1).map((m) => m.osnbVerse)).toEqual([2]);
  });

  test('a single verse and the verseMap say the same', () => {
    expect(osnbToMapping('english_kj', PSALMS, 51, 1)).toEqual({ chapter: 51, verse: 0 });
    expect(osnbToMapping('english_kj', PSALMS, 51, 2)).toEqual({ chapter: 51, verse: 0 });
    expect(osnbToMapping('english_kj', PSALMS, 51, 3)).toEqual({ chapter: 51, verse: 1 });
    expect(osnbToMapping('english_kj', PSALMS, 18, 2)).toEqual({ chapter: 18, verse: 1 });
    const { verseMap } = getKvnMappingData('kjv')!;
    expect(verseMap['19-51-1']).toBe('19-51-3');
    expect(verseMap['19-18-1']).toBe('19-18-2');
    // Verse 0 is not a reference anyone types.
    expect(Object.keys(verseMap).filter((k) => k.endsWith('-0'))).toEqual([]);
  });
});

describe('a numbering that numbers the title itself is left alone', () => {
  test('dnb2024 has no verse 0 in any psalm, and Ps 3:1 is the title as in osnb', async () => {
    // Except Ps 13, where dnb2024's entries predate osmain's current Ps 13 and
    // fold its title (free-bible data, same issue as KJV_DATA_ERRORS; Ps 51 and
    // 60 are stale there too, but not folded).
    const zeros: string[] = [];
    for (let ch = 1; ch <= 150; ch++)
      for (let v = 1; v <= 4; v++) if (osnbToMapping('dnb2024_nb', PSALMS, ch, v).verse === 0) zeros.push(`${ch}:${v}`);
    expect(zeros).toEqual(['13:1']);
    const ps3 = await mapChapter(PSALMS, 3, 'dnb2024_nb');
    expect(ps3.filter((m) => m.displayVerse === 1).map((m) => m.osnbVerse)).toEqual([1]);
  });

  test('outside the Psalms nothing moves: Malachi 4:5 in the KJV is osnb 3:23', () => {
    expect(osnbToMapping('english_kj', 39, 3, 23)).toEqual({ chapter: 4, verse: 5 });
  });
});

describe('the flates', () => {
  const app = createApp();

  test('/api/chapter: Ps 51:1 in kjv is "Have mercy", the title is verse 0', async () => {
    const res = await app.request('/api/chapter?book=19&chapter=51&mapping=kjv&bible=osen');
    expect(res.status).toBe(200);
    const { verses } = (await res.json()) as { verses: { verse: number; osnbVerse: number; partial: boolean }[] };
    expect(verses.filter((v) => v.verse === 1)).toMatchObject([{ osnbVerse: 3, partial: false }]);
    expect(verses.filter((v) => v.verse === 0).map((v) => v.osnbVerse)).toEqual([1, 2]);
  });

  test('the chapter page shows the title without a verse number, and verse 1 once', async () => {
    const html = await (await app.request('/en/sal/51?mapping=kjv&bible=osen')).text();
    expect(html.match(/id="v1"/g)).toHaveLength(1);
    expect(html).not.toContain('id="v0"');
    const title = (await getVerses(PSALMS, 51, 'osen')).find((v) => v.verse === 1)!.text;
    expect(html).toMatch(new RegExp(`class="psalm-title"[^>]*>(?:<[^>]+>)*${title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
});
