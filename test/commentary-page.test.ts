// Bibelkommentarene på kapittelsiden og i kapittel-API-et (#269).
//
// Målt mot det som er IMPORTERT, ikke mot en liste: en bok som blir ferdig
// oversatt flytter testene selv. Krever den lokale basen med kommentarene
// importert (`bun scripts/import-bible.ts`).

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql } from '../src/lib/db.ts';
import { getCommentaryForChapter, searchCommentary } from '../src/lib/commentary-data.ts';
import { commentaryRefHref } from '../src/views/commentary.tsx';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const html = async (path: string) => (await app.request(`http://x${path}`)).text();
const block = (page: string) => {
  const a = page.indexOf('data-block-id="kommentar"');
  return a < 0 ? '' : page.slice(a, page.indexOf('</details>', page.indexOf('cm-block', a)));
};

/** Den første boka med en norsk gjengivelse, og en bok uten. */
async function books(): Promise<{ translated: number; untranslated: number }> {
  const rows = (await getSql()`
    SELECT DISTINCT book_id FROM commentary_sections WHERE language = 'nb' ORDER BY book_id
  `) as { book_id: number }[];
  const nb = new Set(rows.map((r) => Number(r.book_id)));
  const untranslated = [...Array(66).keys()].map((i) => i + 1).find((b) => !nb.has(b))!;
  return { translated: rows[0]!.book_id, untranslated };
}

describe('the commentary block on the chapter page', () => {
  test('Genesis 1 in bokmål: the Norwegian beside the English source, with the model credit', async () => {
    const b = block(await html('/nb/1mos/1'));
    expect(b).toContain('Matthew Henry');
    expect(b).toMatch(/<div class="cm-pair"><div class="cm-text[^"]*" lang="nb">/);
    expect(b).toMatch(/<div class="cm-source[^"]*" lang="en" data-verbatim="true">/);
    // The rendering is not the work's own text, so it never carries data-verbatim.
    expect(b).not.toMatch(/lang="nb" data-verbatim/);
    expect(b).toContain('Oversatt og kontrollert av');
    expect(b).toContain('Lisens: Public Domain');
    // Kildens henvisninger er lenker til lesesiden på leserens språk.
    expect(b).toMatch(/<a class="cm-ref" href="\/nb\/[a-z0-9]+\/\d+(#v\d+(-\d+)?)?"( data-label-numbering="kjv")?>/);
    expect(b).not.toContain('cm-source-only');
  });

  test('a book with no Norwegian yet shows the source, and says so', async () => {
    const { untranslated } = await books();
    const [c] = await getCommentaryForChapter(untranslated, 1, 'nb');
    expect(c?.language).toBe('en');
    expect(c?.sourceOnly).toBe(true);
  });

  test('in English the source is the text, with nothing beside it and nothing marked', async () => {
    const b = block(await html('/en/1mos/1'));
    expect(b).toContain('class="cm-single"');
    expect(b).not.toContain('cm-source');
    expect(b).not.toContain('Translated and checked by');
  });

  test('nynorsk reads the bokmål rendering before the source', async () => {
    const [c] = await getCommentaryForChapter(1, 1, 'nn');
    expect(c?.language).toBe('nb');
    expect(c?.sections[0]?.sourceParagraphs?.length).toBeGreaterThan(0);
  });

  test('KJV Exod 8:1–4 is commented on where the osnb reader has those verses: 7:26–29', async () => {
    const [c] = await getCommentaryForChapter(2, 7, 'nb');
    const crossing = c?.sections.find((s) => s.sourceChapter === 8 && s.from.verse > 0);
    expect(crossing?.from).toEqual({ chapter: 7, verse: 26 });
    expect(crossing?.to.chapter).toBe(8);
  });

  test('the verse details link to the sections on the verse', async () => {
    const page = await html('/nb/1mos/1');
    const link = page.match(/<a href="#(cm-[a-z0-9-]+)" data-cm-jump(?:="[^"]*")?>/);
    expect(link).not.toBeNull();
    expect(page).toContain(`id="${link![1]}"`);
  });

});

describe('a reference in the commentary links to the verses the reader has', () => {
  test('the same numbering: the whole range, no marker', () => {
    expect(commentaryRefHref('Gal.1.15-Gal.1.16')).toBe('/en/gal/1#v15-16');
    expect(commentaryRefHref('Rom.10.17')).toBe('/en/rom/10#v17');
  });

  test('a psalm with a title: the osnb range, and the label says it is KJV', () => {
    expect(commentaryRefHref('Ps.38.13-Ps.38.15')).toEqual({ href: '/en/sal/38#v14-16', labelNumbering: 'kjv' });
  });
});

describe('the chapter API carries the commentary', () => {
  test('/api/chapter?book=1&chapter=1&lang=nb', async () => {
    const res = await app.request('http://x/api/chapter?book=1&chapter=1&lang=nb');
    const body = (await res.json()) as { commentary?: { work: { id: string }; language: string; sections: { paragraphs: string[]; sourceParagraphs: string[] | null }[] }[] };
    expect(res.status).toBe(200);
    const mhc = body.commentary?.find((c) => c.work.id === 'mhc');
    expect(mhc?.language).toBe('nb');
    expect(mhc?.sections[0]?.paragraphs.length).toBeGreaterThan(0);
    expect(mhc?.sections[0]?.sourceParagraphs?.length).toBe(mhc?.sections[0]?.paragraphs.length);
  });
});

describe('the commentary search', () => {
  test("every word must match, in the reader's language, capped by the limit", async () => {
    const hits = await searchCommentary('god light', 'en', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (const h of hits) expect(h.snippet.toLowerCase()).toContain('god');
    expect(hits[0]?.workTitle).toContain('Matthew Henry');
  });

  test('a quote in the query is a word, not SQL', async () => {
    expect(await searchCommentary("o'neil' OR 1=1 --", 'en')).toEqual([]);
  });
});
