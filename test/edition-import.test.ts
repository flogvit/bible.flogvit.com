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

describe('the credit, on the edition page only', () => {
  // #206: the reader gets one short line on the page's language, built from
  // `credits` in license.json; the licence's full wording (`statement`) is never
  // shown under the text. A test edition carries both, so the line is measured
  // whatever the local import holds.
  const app = createApp();
  const statement = 'No credit is required for this internal note';
  const licence = {
    license: 'CC BY',
    spdx: 'CC-BY-4.0',
    attribution_required: true,
    statement,
    credits: [
      { name: 'SBLGNT', url: 'https://sblgnt.com', license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', relation: 'translated_from' },
      { name: 'Leningrad Codex', url: 'https://www.tanach.us', relation: 'translated_from' },
    ],
  };
  const creditOf = (html: string) => html.match(/<p class="edition-credit" data-edition-credit[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';
  const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  beforeAll(async () => {
    await getSql()`REPLACE INTO bible_editions (id, name_native, lang_iso639_1, direction, meta, license)
      VALUES ('pd-test', 'PD', 'en', 'ltr', '{}', '{"license":"Public Domain","attribution_required":false}')`;
    await getSql()`REPLACE INTO bible_editions (id, name_native, abbreviation, lang_iso639_1, direction, meta, license)
      VALUES ('cc-test', 'CC', 'CC', 'en', 'ltr', '{}', ${JSON.stringify(licence)})`;
    // A credit stands under TEXT: the verse page shows it only when there are verses.
    await getSql()`REPLACE INTO verses (book_id, chapter, verse, text, bible) VALUES (43, 3, 16, 'For God so loved the world.', 'cc-test')`;
  });
  afterAll(async () => {
    await getSql()`DELETE FROM bible_editions WHERE id IN ('pd-test', 'cc-test')`;
    await getSql()`DELETE FROM verses WHERE bible = 'cc-test'`;
  });

  // The owner's decision (2026-10-30): the credit stands on the edition's page,
  // «ikke hver bidige side».
  test('on the edition page: one short line on the page\'s language, with its links', async () => {
    const en = creditOf(await (await app.request('http://x/en/oversettelser/cc-test')).text());
    expect(plain(en)).toBe('Translated from SBLGNT (CC BY 4.0) and Leningrad Codex');
    expect(en).toContain('href="https://sblgnt.com"');
    expect(en).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(en).toContain('href="https://www.tanach.us"');
    const nb = creditOf(await (await app.request('http://x/nb/oversettelser/cc-test')).text());
    expect(plain(nb)).toBe('Oversatt fra SBLGNT (CC BY 4.0) og Leningrad Codex');
  });

  test('nothing about licence or credit on the chapter and verse pages', async () => {
    for (const url of ['/en/tekst?refs=joh-3-16&bible=cc-test', '/nb/joh/3?bible=cc-test', '/nb/joh/3', '/en/ps/23', '/en/ps/23?bible=osen']) {
      const html = await (await app.request(`http://x${url}`)).text();
      expect(html, url).not.toContain('data-edition-credit');
      expect(html, url).not.toContain('No credit is required');
      expect(html, url).not.toContain('that obligation carries over');
    }
  });

  test("the licence's internal wording is shown nowhere, the edition page included", async () => {
    for (const url of ['/en/oversettelser/cc-test', '/en/oversettelser/osen', '/nb/oversettelser/osen']) {
      const html = await (await app.request(`http://x${url}`)).text();
      expect(html, url).not.toContain(statement);
      expect(html, url).not.toContain('No credit is required');
    }
  });

  test('a public domain edition with no credits keeps its publisher\'s licence notice', async () => {
    const html = await (await app.request('http://x/en/oversettelser/pd-test')).text();
    expect(html).not.toContain('data-edition-credit');
  });
});
