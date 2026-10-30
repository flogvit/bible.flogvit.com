// A translator's note does not stand inside the verse text (#207). OSEN Psalm
// 23:4 read «…the shadow of death,* I fear no evil, … [*Footnote: Or "the
// darkest valley"; …]» on the page, in search, in the songs and in the MCP: the
// note had been written into `text` in free-bible, in several forms. The notes
// now live in `footnotes`, the import refuses a verse whose text carries one,
// and this holds the rule, the data and the page.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { INLINE_NOTE, versesWithInlineNotes } from '../src/lib/edition-import.ts';
import { getSql } from '../src/lib/db.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

describe('the rule', () => {
  test('every form that was found in free-bible is a note', () => {
    for (const s of [
      'death,* I fear [*Footnote: Or "the darkest valley"]',
      'text [Footnote: Ishmael means "God hears."]',
      'text [footnote: The Hebrew]',
      'text [Fotnote: Den hebraiske]',
      'Edom.[nota: «Edom» suena]',
      'Mahanaim.[^1]\n\n[^1]: Mahanaim means',
      'heads.<fn>Hebrew raqia</fn>',
      'Cabul, a name\n\n*Cabul sounds like',
      "armor?*  *Or 'within his double bridle'",
      'it?"* [*Or "What advantage"]',
    ]) {
      expect(INLINE_NOTE.test(s), s).toBe(true);
    }
  });

  test('a verse is not a note', () => {
    for (const s of [
      'In the beginning God created the heavens and the earth.',
      'A psalm of David. The LORD is my shepherd; I lack nothing.',
      'Og Gud sa: «Det skal bli lys!» Og det ble lys.',
    ]) {
      expect(INLINE_NOTE.test(s), s).toBe(false);
    }
  });

  test('the import names the verses it refuses', () => {
    expect(
      versesWithInlineNotes([
        { bookId: 19, chapterId: 23, verseId: 3, text: 'He restores my soul.' },
        { bookId: 19, chapterId: 23, verseId: 4, text: 'shadow of death,* [*Footnote: Or "the darkest valley"]' },
      ]),
    ).toEqual(['19:23:4']);
  });
});

describe('the data and the page', () => {
  test('no verse of our own translations carries a note in its text', async () => {
    const rows = (await getSql()`
      SELECT bible, book_id, chapter, verse, text FROM verses
      WHERE bible IN ('osnb', 'osnn', 'osen', 'oses')
    `) as { bible: string; book_id: number; chapter: number; verse: number; text: string }[];
    expect(rows.length).toBeGreaterThan(60_000);
    expect(rows.filter((r) => INLINE_NOTE.test(r.text)).map((r) => `${r.bible} ${r.book_id}:${r.chapter}:${r.verse}`)).toEqual([]);
  });

  test('OSEN Psalm 23:4: the verse is the verse, and the note is a footnote under it', async () => {
    const html = await (await createApp().request('http://x/en/ps/23?bible=osen')).text();
    const verse = html.match(/data-verse-num="4"[\s\S]*?<\/details>/)?.[0] ?? '';
    const plain = verse.match(/<span data-verse-plain="true"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '';
    expect(plain).toContain('the shadow of death, I fear no evil');
    expect(plain).not.toMatch(/Footnote|\*/);
    expect(verse).toContain('class="footnotes"');
    expect(verse).toContain('the darkest valley');
  });
});
