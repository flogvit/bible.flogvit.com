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

/** Lesevisningen (#286): hele teksten, del for del. */
const readerOf = (page: string) => {
  const a = page.indexOf('data-cm-reader');
  return a < 0 ? '' : page.slice(a, page.indexOf('</dialog>', a));
};
/** Én del i lesevisningen, ved adressen. */
const partOf = (page: string, id: string) => {
  const a = page.indexOf(`id="${id}"`);
  return a < 0 ? '' : page.slice(a, page.indexOf('</article>', a));
};
/** Lesevisningen uten innholdet i originalbryteren. */
const outsideOriginal = (reader: string) => reader.replace(/<details class="cm-original">[\s\S]*?<\/details>/g, '');

describe('the commentary on the chapter page (#286)', () => {
  test('/nb: only Norwegian is shown; the English is behind one closed toggle per part', async () => {
    const reader = readerOf(await html('/nb/1mos/1'));
    expect(reader).toMatch(/<div class="cm-p[^"]*" lang="nb">/);
    // The rendering is not the work's own text, so it never carries data-verbatim.
    expect(reader).not.toMatch(/lang="nb" data-verbatim/);
    expect(outsideOriginal(reader)).not.toMatch(/<div class="cm-p[^"]*" lang="en"/);
    expect(outsideOriginal(reader)).not.toContain('The Creation');
    expect(reader).not.toContain('cm-pair');
    // The source keeps its own language and stays verbatim (#23), closed by default.
    expect(reader).toMatch(/<details class="cm-original"><summary>Vis originalteksten \(engelsk\)<\/summary><div class="cm-original-text"><div class="cm-p[^"]*" lang="en" data-verbatim="true">/);
    expect(reader).not.toMatch(/<details class="cm-original" open/);
    expect(reader).toContain('Oversatt og kontrollert av');
    expect(reader).toContain('Lisens: Public Domain');
    // Kildens henvisninger er lenker til lesesiden på leserens språk.
    expect(reader).toMatch(/<a class="cm-ref" href="\/nb\/[a-z0-9]+\/\d+(#v\d+(-\d+)?)?"( data-label-numbering="kjv")?>/);
    expect(reader).not.toContain('cm-source-only');
  });

  test("/nb: the work's title is Norwegian, in the panel and the reader", async () => {
    const page = await html('/nb/1mos/1');
    expect(block(page)).toContain('Matthew Henrys kommentar til hele Bibelen');
    expect(readerOf(page)).toContain('Matthew Henrys kommentar til hele Bibelen');
    expect(page).not.toContain('Complete Commentary on the Whole Bible');
  });

  test('the preface to the Pentateuch is the book introduction, in «Sammendrag», never under «Vers 1–2»', async () => {
    const page = await html('/nb/1mos/1');
    const verses12 = partOf(page, 'cm-mhc-1-0');
    expect(verses12).toContain('Vers 1–2');
    expect(verses12).not.toContain('FORORD');
    expect(verses12).not.toContain('Første Mosebok til Femte Mosebok');
    expect(verses12).not.toContain('tre ting');
    const book = partOf(page, 'cm-mhc-book');
    expect(book).toContain('FORORD');
    expect(book).toContain('Innledning til boka');
    expect(book.match(/Første Mosebok til Femte Mosebok/g)?.length).toBe(1);
    // «Dette kapittelet inneholder tre ting» is the chapter's introduction.
    expect(partOf(page, 'cm-mhc-1-0-intro')).toContain('tre ting');
    // The teaser for it stands in «Sammendrag», with the book summary.
    const summary = page.slice(page.indexOf('data-block-id="sammendrag"'), page.indexOf('</details>', page.indexOf('data-block-id="sammendrag"')));
    expect(summary).toMatch(/data-summary-kind="commentary-intro" data-commentary-work="mhc"/);
    expect(summary).toContain('href="#cm-mhc-book"');
    expect(block(page)).not.toContain('#cm-mhc-book');
  });

  test('the Bible text is not repeated: no part quotes the verses', async () => {
    const reader = readerOf(await html('/nb/1mos/1'));
    expect(reader).not.toContain('I begynnelsen skapte Gud himmelen og jorden');
    expect(reader).not.toMatch(/<div class="cm-p[^"]*" lang="nb"><sup>\d+<\/sup>/);
  });

  test('the side panel shows each part’s label and first lines, and opens it in the reader; no full text', async () => {
    const page = await html('/nb/1mos/1');
    const b = block(page);
    const teasers = [...b.matchAll(/<a class="cm-teaser" href="#(cm-mhc-[^"]+)" data-cm-open(?:="true")?>/g)].map((m) => m[1]);
    expect(teasers.length).toBeGreaterThan(5);
    for (const id of teasers) expect(page).toContain(`<article class="cm-read" id="${id}"`);
    expect(b).toContain('<span class="cm-teaser-label">Innledning</span>');
    expect(b).toContain('<span class="cm-teaser-label">Vers 1–2</span>');
    expect(b).not.toContain('class="cm-p');
  });

  test('every place that shows a work says which, so it can be switched off', async () => {
    const page = await html('/nb/1mos/1');
    expect(block(page)).toContain('data-commentary-work="mhc"');
    expect(page).toMatch(/<p class="vd-commentary" data-commentary-work="mhc">/);
    for (const m of readerOf(page).matchAll(/<article class="cm-read"[^>]*>/g)) expect(m[0]).toContain('data-commentary-work="mhc"');
    expect(page).toMatch(/data-block-id="kommentar" open="" data-commentary-group/);
  });

  test('a book with no Norwegian yet shows the source, and says so', async () => {
    const { untranslated } = await books();
    const [c] = await getCommentaryForChapter(untranslated, 1, 'nb');
    expect(c?.language).toBe('en');
    expect(c?.sourceOnly).toBe(true);
  });

  test('in English the source is the text, with no toggle and nothing marked', async () => {
    const page = await html('/en/1mos/1');
    const reader = readerOf(page);
    expect(reader).toMatch(/<div class="cm-p[^"]*" lang="en" data-verbatim="true">/);
    expect(reader).not.toContain('cm-original');
    expect(reader).not.toContain('Translated and checked by');
    expect(partOf(page, 'cm-mhc-book')).toContain('PREFACE');
    expect(partOf(page, 'cm-mhc-1-0')).not.toContain('PREFACE');
    expect(block(page)).toContain('Complete Commentary on the Whole Bible');
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

  test('the verse details link to the sections on the verse, which open in the reader', async () => {
    const page = await html('/nb/1mos/1');
    const link = page.match(/<p class="vd-commentary" data-commentary-work="mhc">[^<]*<a href="#(cm-[a-z0-9-]+)" data-cm-open(?:="true")?>/);
    expect(link).not.toBeNull();
    expect(readerOf(page)).toContain(`id="${link![1]}"`);
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

describe('Innstillinger: one switch per commentary work (#286)', () => {
  test('listed from the works the site has, under the title in the reader’s language; the single switch is gone', async () => {
    const page = await html('/nb/innstillinger');
    const works = (await getSql()`SELECT id FROM commentary_works`) as { id: string }[];
    expect(works.length).toBeGreaterThan(0);
    for (const w of works) expect(page).toContain(`data-setting="commentaries.${w.id}"`);
    expect(page).toContain('Matthew Henrys kommentar til hele Bibelen');
    expect(page).not.toContain('data-setting="showCommentary"');
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

  test('a hit in the preface opens the book introduction, not «Vers 1–2» (#286)', async () => {
    const hits = await searchCommentary('religionen ene nyttige', 'nb');
    const genesis = hits.find((h) => h.bookId === 1 && h.chapter === 1);
    expect(genesis?.part).toBe('book');
    const page = await html('/nb/sok?q=religionen%20ene%20nyttige');
    expect(page).toContain('/nb/1mos/1#cm-mhc-book');
    expect(page).toMatch(/data-search-type="commentary" data-commentary-group/);
    expect(page).toMatch(/class="search-extra-card" data-commentary-work="mhc"/);
  });

  test('a quote in the query is a word, not SQL', async () => {
    expect(await searchCommentary("o'neil' OR 1=1 --", 'en')).toEqual([]);
  });
});
