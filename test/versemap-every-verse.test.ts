// The verseMap has an entry for EVERY osnb verse that a numbering moves (#266).
//
// The reference parser reads «Mal 4:5» written in the King James numbering
// through `getKvnMappingData('kjv').verseMap`. It was built from the entries in
// the osnb and the target mapping files, not from the verses, so a verse the
// cross-mapping moves without an entry of its own in either file had no entry:
// Malachi 4:1–6 in the King James (osnb 3:19–24) was missing, and «Mal 4:5»
// was read as a verse that does not exist. The truth here is `osnbToMapping()`,
// asked for every osnb verse in `verse-counts.ts`. Needs no database, but
// reaches db.ts through verse-mapper.ts, so it declares the timeout (#74).

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { verseCounts } from '../src/lib/verse-counts.ts';
import { getKvnMappingData, MAPPING_META, osnbToMapping } from '../src/lib/verse-mapper.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const MALACHI = 39;

describe('the verseMap against osnbToMapping, for every osnb verse', () => {
  test('King James Malachi 4:1–6 is osnb Malachi 3:19–24', () => {
    const { verseMap } = getKvnMappingData('kjv')!;
    for (let v = 1; v <= 6; v++) {
      expect(verseMap[`${MALACHI}-4-${v}`]).toBe(`${MALACHI}-3-${18 + v}`);
    }
  });

  for (const id of Object.keys(MAPPING_META).filter((id) => id !== 'osnb')) {
    test(`${id}: every verse the numbering moves has its entry, and every entry moves back`, () => {
      const { verseMap } = getKvnMappingData(id)!;
      const missing: string[] = [];
      for (const [book, chapters] of Object.entries(verseCounts)) {
        chapters.forEach((count, i) => {
          for (let verse = 1; verse <= count; verse++) {
            const target = osnbToMapping(id, Number(book), i + 1, verse);
            if (target.verse === 0 || (target.chapter === i + 1 && target.verse === verse)) continue;
            if (!verseMap[`${book}-${target.chapter}-${target.verse}`]) missing.push(`${book}-${i + 1}-${verse}`);
          }
        });
      }
      expect(missing).toEqual([]);

      const wrong = Object.entries(verseMap).filter(([key, value]) => {
        const [book, chapter, verse] = value.split('-').map(Number) as [number, number, number];
        const target = osnbToMapping(id, book, chapter, verse);
        return `${book}-${target.chapter}-${target.verse}` !== key;
      });
      expect(wrong).toEqual([]);
    });
  }
});
