// The chapter page's edition picker and its parallel-text list offer every
// readable edition we serve (#202). They were OSNB and OSNN by hand, so a reader
// on /en/ or /es/ could reach neither their own language's editions nor the
// harvested ones from the page — the editions came in with #170 and stayed
// invisible there.
//
// An edition picked in the URL also marks its verses in its own language
// (3.1.2): ?bible=kjv on a Spanish page is English text, not Spanish.
//
// The editions are read from the database, so the next import moves the test.
//
// Requires the local DB (DBngin :3326) with imported content.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { editionLangTag, getBibleEditions } from '../src/lib/bible.ts';
import { getSql } from '../src/lib/db.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const html = async (path: string) => (await app.request(`http://x${path}`)).text();
const readable = async () => (await getBibleEditions()).filter((e) => e.philosophy !== 'source_text');
// John 3 is in the New Testament: an Old-Testament-only edition (jps) is not offered there (#221).
const readableForNT = async () => (await readable()).filter((e) => (e.testament ?? '').toLowerCase() !== 'ot');

describe('the edition picker on the chapter page', () => {
  test('offers every readable edition that has the book, on every language', async () => {
    const ids = (await readableForNT()).map((e) => e.id);
    expect(ids.length).toBeGreaterThan(2);
    for (const locale of ['en', 'es', 'nb']) {
      const page = await html(`/${locale}/joh/3`);
      const picker = page.slice(page.indexOf('class="tools-bibles"'), page.indexOf('data-secondary-select'));
      for (const id of ids) {
        // The default edition is linked without ?bible=, the others with it.
        const linked = picker.includes(`?bible=${id}"`) || picker.includes(`/${locale}/joh/3"`);
        expect(linked, `${locale}: ${id} in the picker`).toBe(true);
      }
      expect(picker.match(/tools-bible-button/g)?.length, `${locale}: one button per edition`).toBe(ids.length);
    }
  });

  test('the parallel text can be any readable edition but the one shown', async () => {
    const ids = (await readableForNT()).map((e) => e.id);
    const page = await html('/en/joh/3?bible=kjv');
    const select = page.slice(page.indexOf('data-secondary-select'), page.indexOf('</select>', page.indexOf('data-secondary-select')));
    for (const id of ids.filter((x) => x !== 'kjv')) expect(select, id).toContain(`value="${id}"`);
    expect(select).not.toContain('value="kjv"');
  });

  test('an edition picked in the URL marks its verses in its own language', async () => {
    for (const e of (await readableForNT()).filter((x) => x.lang_iso639_1)) {
      const other = e.lang_iso639_1 === 'es' ? 'en' : 'es';
      const page = await html(`/${other}/joh/3?bible=${e.id}`);
      const verse = page.slice(page.indexOf('id="v16"'), page.indexOf('id="v17"'));
      // Chinese carries its script (zh-Hans / zh-Hant, #216); editionLangTag() is the rule.
      expect(verse, `${e.id} on /${other}/`).toContain(`lang="${editionLangTag(e)}"`);
    }
  });
});

// #238: the testament was not enough. Tyndale has Genesis-Deuteronomy, Jonah
// and the New Testament, so offered on Isaiah it led to a 404. The picker and
// the parallel list offer an edition only on a chapter it has; the books an
// edition has are read from `verses` here too, independently of the page.
describe('an edition is offered only on chapters it has (#238)', () => {
  const picker = (page: string) => page.slice(page.indexOf('class="tools-bibles"'), page.indexOf('data-secondary-select'));
  const parallel = (page: string) =>
    page.slice(page.indexOf('data-secondary-select'), page.indexOf('</select>', page.indexOf('data-secondary-select')));
  const has = async (bible: string, book: number) =>
    ((await getSql()`SELECT 1 FROM verses WHERE bible = ${bible} AND book_id = ${book} LIMIT 1`) as unknown[]).length > 0;

  test('tyndale: on Genesis and Jonah, not on Isaiah', async () => {
    expect(await has('tyndale', 1), 'tyndale is imported').toBe(true);
    expect(await has('tyndale', 23), 'tyndale has no Isaiah').toBe(false);
    for (const path of ['/en/1mos/1', '/en/jona/1']) {
      const page = await html(path);
      expect(picker(page), path).toContain('?bible=tyndale"');
      expect(parallel(page), path).toContain('value="tyndale"');
    }
    const isaiah = await html('/en/jes/1');
    expect(picker(isaiah)).not.toContain('tyndale');
    expect(parallel(isaiah)).not.toContain('tyndale');
  });

  test('an Old-Testament-only edition (jps) is not offered on John 3, and is on Genesis 1', async () => {
    expect(picker(await html('/en/joh/3'))).not.toContain('?bible=jps"');
    expect(picker(await html('/en/1mos/1'))).toContain('?bible=jps"');
  });
});
