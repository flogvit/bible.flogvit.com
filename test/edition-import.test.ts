// The path a translation takes from free-bible to the site and the MCP (#200):
// the GATE (licence confirmed, KVN verified), the RENUMBERING to osnb's verse
// numbers, our own editions staying first for their language, and the CREDIT a
// CC BY / CC BY-SA licence asks for under the text.
//
// The gate and the renumbering read the real free-bible (licence files) and the
// vendored KVN mappings, so a list that promises an edition free-bible has not
// cleared is red here, before it reaches a deploy.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { FREE_BIBLE_DIR } from '../scripts/kvn-staging.ts';
import { IMPORTED_BIBLES, OWN_EDITIONS } from '../src/lib/editions.ts';
import { checkEdition, editionGate, toOsnbNumbering } from '../src/lib/edition-import.ts';
import type { RawVerse } from '../src/lib/edition-import.ts';
import { loadRawMappingUncached } from '../src/lib/verse-mapper.ts';
import { getSql } from '../src/lib/db.ts';
import { readableBibleCandidates } from '../src/lib/bible.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const GENERATE = path.join(FREE_BIBLE_DIR, 'generate');
const loadMapping = (id: string) => {
  try {
    return loadRawMappingUncached(id);
  } catch {
    return null;
  }
};
const confirmed = { verification: { status: 'confirmed' } };
const verifiedMapping = { system: 'x', textVerification: { status: 'verified' } };

describe('the gate', () => {
  test('a translation with no confirmed licence is refused, with the reason', () => {
    for (const licence of [null, {}, { verification: { status: 'not_confirmed' } }]) {
      const gate = editionGate('kjv', licence, verifiedMapping);
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toMatch(/kjv: (no license\.json|the licence is not confirmed)/);
    }
  });

  test('a translation with no verified KVN is refused, with the reason', () => {
    for (const mapping of [null, { system: 'kjv' }, { system: 'kjv', textVerification: { status: 'pending' } }]) {
      const gate = editionGate('kjv', confirmed, mapping);
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.reason).toMatch(/kjv: (no KVN mapping|the KVN mapping is not verified)/);
    }
  });

  test('both confirmed lets it through; an osnb-numbered edition needs no mapping', () => {
    expect(editionGate('kjv', confirmed, verifiedMapping)).toEqual({ ok: true });
    expect(editionGate('osnb', confirmed, null)).toEqual({ ok: true });
  });

  test('every listed edition passes the gate against free-bible as it is', () => {
    expect(fs.existsSync(path.join(GENERATE, 'bibles_raw')), `free-bible at ${FREE_BIBLE_DIR}`).toBe(true);
    const refused = IMPORTED_BIBLES.map((id) => checkEdition(id, GENERATE, loadMapping)).filter((g) => !g.ok);
    expect(refused).toEqual([]);
  });
});

describe('the renumbering', () => {
  const osnb = loadRawMappingUncached('osnb');
  const kjv = loadRawMappingUncached('kjv');
  const readBook = (id: string, book: number): RawVerse[] => {
    const dir = path.join(GENERATE, 'bibles_raw', id, String(book));
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => parseInt(a) - parseInt(b))
      .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as RawVerse[]);
  };

  test("the KJV's Malachi 4 lands in osnb's Malachi 3, and Joel 2:28 in Joel 3:1", () => {
    const mal = toOsnbNumbering(readBook('kjv', 39), kjv, osnb).verses;
    const kjvMal41 = readBook('kjv', 39).find((v) => v.chapterId === 4 && v.verseId === 1)!;
    expect(mal.find((v) => v.chapter === 3 && v.verse === 19)?.text).toBe(kjvMal41.text.trim());
    expect(mal.some((v) => v.chapter === 4)).toBe(false);

    const joel = toOsnbNumbering(readBook('kjv', 29), kjv, osnb).verses;
    const kjvJoel228 = readBook('kjv', 29).find((v) => v.chapterId === 2 && v.verseId === 28)!;
    expect(joel.find((v) => v.chapter === 3 && v.verse === 1)?.text).toBe(kjvJoel228.text.trim());
  });

  test('no text of the translation is lost, for a whole Bible', () => {
    const raw = Array.from({ length: 66 }, (_, i) => readBook('kjv', i + 1)).flat();
    const { verses, split } = toOsnbNumbering(raw, kjv, osnb);
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    expect(verses.reduce((n, v) => n + words(v.text), 0)).toBe(raw.reduce((n, v) => n + words(v.text), 0));
    expect(split).toBeGreaterThanOrEqual(0);
    // One row per osnb address.
    expect(new Set(verses.map((v) => `${v.book}:${v.chapter}:${v.verse}`)).size).toBe(verses.length);
  });

  test('verses that land on one osnb verse are joined in their own order', () => {
    // A synthetic mapping: the translation's 1:1:1 and 1:1:2 are parts 1 and 2 of osmain 1:1:1.
    const enc = (b: number, c: number, v: number, p = 0) => ((b * 151 + c) * 177 + v) * 16 + p;
    const src = { ...kjv, map: [
      { kvnFrom: enc(1, 1, 1, 1), kvnTo: enc(1, 1, 1, 1), kvnRef: '', tkvnFrom: enc(1, 1, 1), tkvnTo: enc(1, 1, 1), tkvnRef: '', order: 0 },
      { kvnFrom: enc(1, 1, 1, 2), kvnTo: enc(1, 1, 1, 2), kvnRef: '', tkvnFrom: enc(1, 1, 2), tkvnTo: enc(1, 1, 2), tkvnRef: '', order: 1 },
    ] };
    const id = { ...osnb, map: [] };
    const out = toOsnbNumbering(
      [
        { bookId: 1, chapterId: 1, verseId: 2, text: 'second', versions: [{ text: 'x' }] },
        { bookId: 1, chapterId: 1, verseId: 1, text: 'first' },
      ],
      src,
      id,
    );
    expect(out.verses).toEqual([{ book: 1, chapter: 1, verse: 1, text: 'first second', versions: null, footnotes: null }]);
    expect(out.merged).toBe(1);
  });
});

describe('our own editions come first for their language', () => {
  beforeAll(async () => {
    await getSql()`REPLACE INTO bible_editions (id, name_native, lang_iso639_1, direction, meta) VALUES ('aaa-test', 'AAA', 'en', 'ltr', '{}')`;
  });
  afterAll(async () => {
    await getSql()`DELETE FROM bible_editions WHERE id = 'aaa-test'`;
  });

  test('an English edition earlier in the alphabet does not replace OSEN as the default', async () => {
    const [first] = await readableBibleCandidates('en');
    expect(first?.id).toBe('osen');
    expect(OWN_EDITIONS).toContain('osen');
  });
});

describe('the credit under the text', () => {
  const app = createApp();
  const statement = (id: string) =>
    JSON.parse(fs.readFileSync(path.join(GENERATE, 'bibles_raw', id, 'license.json'), 'utf-8')).statement as string;
  const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;|&quot;|&amp;/g, (m) => ({ '&#39;': "'", '&quot;': '"', '&amp;': '&' })[m]!).replace(/\s+/g, ' ');

  beforeAll(async () => {
    await getSql()`REPLACE INTO bible_editions (id, name_native, lang_iso639_1, direction, meta, license)
      VALUES ('pd-test', 'PD', 'en', 'ltr', '{}', '{"license":"Public Domain","attribution_required":false}')`;
  });
  afterAll(async () => {
    await getSql()`DELETE FROM bible_editions WHERE id = 'pd-test'`;
  });

  test('a CC BY text carries its licence and the credit from license.json, on the chapter page', async () => {
    const html = await (await app.request('http://x/en/joh/3?bible=osen')).text();
    const credit = html.match(/<p class="edition-credit" data-edition-credit="osen">[\s\S]*?<\/p>/)?.[0] ?? '';
    expect(credit).toContain('CC-BY-4.0');
    expect(plain(credit)).toContain(statement('osen').slice(0, 120));
  });

  test('and on the verse page', async () => {
    const html = await (await app.request('http://x/en/tekst?refs=joh-3-16&bible=osen')).text();
    expect(html).toContain('data-edition-credit="osen"');
  });

  test('a public domain text asks for no credit, and gets none', async () => {
    const html = await (await app.request('http://x/en/tekst?refs=joh-3-16&bible=pd-test')).text();
    expect(html).not.toContain('data-edition-credit');
  });
});
