import { afterAll, describe, expect, test } from 'bun:test';
import { getVerses } from '../../src/lib/bible.ts';
import { bookName, getBookInfoById } from '../../src/lib/books-data.ts';
import { closeSql, getSql } from '../../src/lib/db.ts';
import { minneRegnskap } from '../../src/lib/minne-regnskap.ts';
import { listMappingIds, MAPPING_META, mapChapter, osnbToMapping } from '../../src/lib/verse-mapper.ts';
import { createHandler } from '../src/server.ts';
import { mcpPost } from './calls.ts';

// Verse numberings (KVN mappings) in the MCP tools (#169). The tools do no
// remapping of their own: a reference in a numbering is read through
// `mapChapter()`, the code `/api/chapter?mapping=` uses, and an osnb address
// is given in a numbering through `osnbToMapping()`, the cross mapping
// `/api/mappings/kvn/:id` builds its verseMap from. So the test holds the
// tools to THAT code, over every chapter where the numbering differs —
// Malachi 4 and the psalm headings among them.

const handler = createHandler({ maxConcurrent: 4, maxConcurrentCli: 4, queueWaitMs: 5000, dbBudgetMs: 10_000 });
const SWEEP = 120_000;
let id = 0;

async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const res = await mcpPost(handler, { jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  const body = (await res.json()) as { result: { content: { text: string }[]; isError?: boolean } };
  return { text: body.result.content.map((c) => c.text).join('\n'), isError: Boolean(body.result.isError) };
}

const verse = async (book: number, chapter: number, v: number, bible = 'osen') => (await getVerses(book, chapter, bible)).find((x) => x.verse === v)!.text;

afterAll(() => closeSql());

describe('list_verse_mappings', () => {
  test('lists every mapping file, and finds one by the name of its edition', async () => {
    const all = (await call('list_verse_mappings', {})).text;
    const ids = listMappingIds();
    expect(ids.length).toBeGreaterThan(1000);
    for (const m of ids) expect(all).toContain(m);
    expect((await call('list_verse_mappings', { query: 'king james' })).text).toContain('**english_kj**');
    expect((await call('list_verse_mappings', { query: 'bibelselskapets 2024 nynorsk' })).text).toContain('**dnb2024_nn**');
  });
});

describe('get_passage reads and numbers through mapChapter', () => {
  test(
    'every chapter where the King James numbering differs from osnb gives what mapChapter gives',
    async () => {
      // The chapters with a differing verse, found by the cross mapping itself.
      const chapters = new Set<string>();
      const all = (await getSql()`SELECT book_id AS b, chapter AS c, MAX(verse) AS n FROM verses WHERE bible = 'osnb' GROUP BY book_id, chapter`) as {
        b: number;
        c: number;
        n: number;
      }[];
      for (const { b, c, n } of all) {
        for (let v = 1; v <= Number(n); v++) {
          const t = osnbToMapping('english_kj', b, c, v);
          if (t.chapter !== c || t.verse !== v) chapters.add(`${b}-${t.chapter}`);
        }
      }
      expect(chapters.size).toBeGreaterThan(50);
      for (const key of chapters) {
        const [b, c] = key.split('-').map(Number) as [number, number];
        const expected = await mapChapter(b, c, 'english_kj', 'osen');
        if (expected.length === 0) continue;
        // Verses spelled out: in a one-chapter book "3 John 1" is a verse.
        const { text, isError } = await call('get_passage', { reference: `${bookName(getBookInfoById(b)!, 'en')} ${c}:1-200`, mapping: 'kjv', editions: ['osen'] });
        expect(isError).toBe(false);
        for (const m of expected) expect(text).toContain(`\n${m.displayVerse} ${m.text}`);
        expect(text).toContain('verse numbering english_kj');
      }
    },
    SWEEP,
  );

  test('Malachi 4:5 in the King James numbering is osnb Malachi 3:23, and without a mapping says how to ask', async () => {
    const elijah = await verse(39, 3, 23);
    const { text } = await call('get_passage', { reference: 'Mal 4:5', mapping: 'kjv', editions: ['osen'] });
    expect(text).toContain(`5 ${elijah}`);
    expect(text).toContain('/mal/3#v23');
    const plain = await call('get_passage', { reference: 'Mal 4:5' });
    expect(plain.isError).toBe(true);
    expect(plain.text).toContain('pass mapping');
  });

  test('a mapping outside the named ones is read the same way', async () => {
    const other = listMappingIds().find((m) => !MAPPING_META[m] && m !== 'osnb')!;
    const expected = await mapChapter(19, 51, other, 'osen');
    expect(expected.length).toBeGreaterThan(10);
    const { text } = await call('get_passage', { reference: 'Ps 51', mapping: other, editions: ['osen'] });
    for (const m of expected) expect(text).toContain(`\n${m.displayVerse} ${m.text}`);
  });

  test('a client walking the catalogue keeps the mapping caches under their cap', async () => {
    // The site only reaches the ids resolveMappingId() knows; the MCP reaches
    // every file, so the caches in verse-mapper.ts have a cap (32).
    const ids = listMappingIds().filter((m) => !MAPPING_META[m]).slice(0, 40);
    expect(ids.length).toBe(40);
    for (const m of ids) expect((await call('get_passage', { reference: 'Mal 3:23', mapping: m, editions: ['osen'] })).isError).toBe(false);
    const kilder = minneRegnskap().kilder;
    for (const navn of ['verse-mapper/mappingFiles', 'verse-mapper/mappers', 'verse-mapper/crossMappers']) {
      expect(kilder[navn]!.oppforinger).toBeLessThanOrEqual(32);
      expect(kilder[navn]!.oppforinger).toBeGreaterThan(14);
    }
  }, 120_000);

  test('an unknown numbering is an error that points to the list', async () => {
    const { text, isError } = await call('get_passage', { reference: 'John 3:16', mapping: 'no-such-numbering' });
    expect(isError).toBe(true);
    expect(text).toContain('list_verse_mappings');
  });
});

describe('the other tools', () => {
  test('get_original_text gives the Hebrew of the osnb verse the numbering points at', async () => {
    const [hebrew] = (await getSql()`SELECT text FROM verses WHERE bible = 'tanach' AND book_id = 39 AND chapter = 3 AND verse = 23`) as { text: string }[];
    const { text } = await call('get_original_text', { reference: 'Mal 4:5', mapping: 'kjv', word_by_word: false });
    expect(text).toContain(`4:5 ${hebrew!.text}`);
  });

  test(
    'get_cross_references reads the verse in the numbering and gives every target in it',
    async () => {
      // Data-chosen: reference rows whose source verse is numbered differently in KJV.
      const rows = (await getSql()`
        SELECT from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse_start FROM references_
        WHERE language = 'en' ORDER BY from_book_id, from_chapter, from_verse`) as {
        from_book_id: number;
        from_chapter: number;
        from_verse: number;
        to_book_id: number;
        to_chapter: number;
        to_verse_start: number;
      }[];
      let checked = 0;
      for (const r of rows) {
        if (checked >= 40) break;
        const from = osnbToMapping('english_kj', r.from_book_id, r.from_chapter, r.from_verse);
        if (from.chapter === r.from_chapter && from.verse === r.from_verse) continue;
        const to = osnbToMapping('english_kj', r.to_book_id, r.to_chapter, r.to_verse_start);
        const source = `${bookName(getBookInfoById(r.from_book_id)!, 'en')} ${from.chapter}:${from.verse}`;
        const { text } = await call('get_cross_references', { reference: source, mapping: 'kjv' });
        expect(text).toContain(`**${source}**`);
        expect(text).toContain(`${bookName(getBookInfoById(r.to_book_id)!, 'en')} ${to.chapter}:${to.verse}`);
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
      // And a target alone: Luke 1:78 points at osnb Malachi 3:20, which is 4:2.
      expect((await call('get_cross_references', { reference: 'Luke 1:78', mapping: 'kjv' })).text).toContain('Malachi 4:2');
      expect((await call('get_cross_references', { reference: 'Luke 1:78' })).text).toContain('Malachi 3:20');
    },
    SWEEP,
  );

  test('check_references checks a reference against the numbering it is written in', async () => {
    const kjv = await call('check_references', { text: 'Elia kommer, Mal 4,5. Mal 4,7 finnes ikke.', mapping: 'kjv', language: 'nb' });
    expect(kjv.text).toContain('2 Bible references, 1 with problems.');
    expect(kjv.text).toContain('Malaki 4:7 does not exist in the english_kj numbering');
    expect(kjv.text).toContain(await verse(39, 3, 23, 'osnb'));
    const osnb = await call('check_references', { text: 'Elia kommer, Mal 4,5.' });
    expect(osnb.text).toContain('1 Bible references, 1 with problems.');
  });

  test('the lookups take a reference in the numbering and give their passages in it', async () => {
    // Every prophecy whose passage is numbered differently in KJV is found from that numbering.
    const prophecies = (await getSql()`
      SELECT id, prophecy_book_id AS b, prophecy_chapter AS c, prophecy_verse_start AS v FROM prophecies WHERE language = 'en'`) as {
      id: string;
      b: number;
      c: number;
      v: number;
    }[];
    let found = 0;
    for (const x of prophecies) {
      const t = osnbToMapping('english_kj', x.b, x.c, x.v);
      if (t.chapter === x.c && t.verse === x.v) continue;
      const label = `${bookName(getBookInfoById(x.b)!, 'en')} ${t.chapter}:${t.verse}`;
      const { text } = await call('get_prophecies', { reference: label, mapping: 'kjv' });
      expect(text).toContain(`[id: ${x.id}]`);
      expect(text).toContain(`Prophecy: ${label}`);
      found++;
    }
    expect(found).toBeGreaterThan(0);
    const story = await call('get_story', { name: 'den-fortapte-sonn', mapping: 'kjv', include_text: false });
    expect(story.text).toContain('verse numbering english_kj');
    const study = await call('get_chapter_study', { reference: 'Mal 4', mapping: 'kjv' });
    expect(study.text).toContain('# Malachi 4 (chapter 3 in osnb');
  });
});
