// Kommentarmodulens rene logikk (#269): forankringen fra verkets KJV-nummerering
// til osnb, OSIS-henvisningene og rendreren som bare slipper gjennom kildens
// egen markup.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import {
  anchorChapterSections,
  anchorSection,
  isHeadingOnly,
  osnbTranslator,
  parseCommentaryChapter,
  parseOsisRef,
  renderCommentaryParagraph,
} from '../src/lib/commentary.ts';
import { loadRawMappingUncached } from '../src/lib/verse-mapper.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const toOsnb = osnbTranslator(loadRawMappingUncached('kjv'), loadRawMappingUncached('osnb'));

describe('KJV addresses land where the osnb reader has the verses', () => {
  test('identical numbering stays put', () => {
    expect(toOsnb(1, 1, 1)).toEqual({ chapter: 1, verse: 1 });
    expect(toOsnb(43, 3, 16)).toEqual({ chapter: 3, verse: 16 });
  });

  test('KJV Exod 8:1 is osnb 7:26 («Let my people go» is not with the frogs)', () => {
    expect(toOsnb(2, 8, 1)).toEqual({ chapter: 7, verse: 26 });
    expect(toOsnb(2, 8, 5)).toEqual({ chapter: 8, verse: 1 });
  });

  test('Joel and Malachi follow the Hebrew chapters', () => {
    expect(toOsnb(29, 2, 28)).toEqual({ chapter: 3, verse: 1 });
    expect(toOsnb(39, 4, 1)).toEqual({ chapter: 3, verse: 19 });
  });

  test('a psalm verse with its title covers the title verses from the start and the text at the end', () => {
    expect(toOsnb(19, 51, 1)).toEqual({ chapter: 51, verse: 1 });
    expect(toOsnb(19, 51, 1, true)).toEqual({ chapter: 51, verse: 3 });
    expect(toOsnb(19, 51, 2)).toEqual({ chapter: 51, verse: 4 });
  });

  test('a section is anchored from its first to its last verse; 0 is the chapter introduction', () => {
    expect(anchorSection(toOsnb, 2, 8, { from: 1, to: 4 })).toEqual({ start: { chapter: 7, verse: 26 }, end: { chapter: 7, verse: 29 } });
    expect(anchorSection(toOsnb, 2, 8, { from: 0, to: 0 })).toEqual({ start: { chapter: 7, verse: 0 }, end: { chapter: 7, verse: 0 } });
    expect(anchorSection(toOsnb, 1, 0, { from: 0, to: 0 })).toEqual({ start: { chapter: 1, verse: 0 }, end: { chapter: 1, verse: 0 } });
  });
});

test('a chapter introduction stands where most of the chapter lands, not where verse 1 does', () => {
  // KJV Exod 8: verses 1–4 land in osnb 7, 5–32 in osnb 8.
  const exod8 = anchorChapterSections(toOsnb, 2, 8, [{ from: 0, to: 0 }, { from: 1, to: 15 }, { from: 16, to: 32 }]);
  expect(exod8[0]).toEqual({ start: { chapter: 8, verse: 0 }, end: { chapter: 8, verse: 0 } });
  expect(exod8[1]).toEqual({ start: { chapter: 7, verse: 26 }, end: { chapter: 8, verse: 11 } });
  // KJV Mal 4 lands whole in osnb 3.
  expect(anchorChapterSections(toOsnb, 39, 4, [{ from: 0, to: 0 }, { from: 1, to: 6 }])[0]!.start).toEqual({ chapter: 3, verse: 0 });
  // KJV Joel 2: 1–27 stay, 28–32 move to osnb 3 — the introduction stays in 2.
  expect(anchorChapterSections(toOsnb, 29, 2, [{ from: 0, to: 0 }, { from: 1, to: 32 }])[0]!.start).toEqual({ chapter: 2, verse: 0 });
});

describe('OSIS references', () => {
  test('book, chapter and verse, and the end of a range in the same book', () => {
    expect(parseOsisRef('Eccl.12.13')).toEqual({ book: 21, chapter: 12, verse: 13, endChapter: 12, endVerse: 13 });
    expect(parseOsisRef('Gen.1.14-Gen.1.15')).toEqual({ book: 1, chapter: 1, verse: 14, endChapter: 1, endVerse: 15 });
    expect(parseOsisRef('Matt.1.1-Matt.2.3')).toEqual({ book: 40, chapter: 1, verse: 1, endChapter: 2, endVerse: 3 });
    expect(parseOsisRef('2Tim.3.16')).toEqual({ book: 55, chapter: 3, verse: 16, endChapter: 3, endVerse: 16 });
    expect(parseOsisRef('Ps.23')).toEqual({ book: 19, chapter: 23, verse: 0, endChapter: 23, endVerse: 0 });
    // Several references after one another: the first.
    expect(parseOsisRef('Gen.1.1 Gen.1.3')?.verse).toBe(1);
  });

  test('an unknown book is no reference', () => {
    expect(parseOsisRef('Tob.1.1')).toBeNull();
    expect(parseOsisRef('')).toBeNull();
  });
});

describe('the paragraph renderer lets through the source markup and nothing else', () => {
  const link = (ref: string) => (ref.startsWith('Rom') ? '/nb/rom/10#v17' : null);

  test('italics, bold, superscript and headings', () => {
    expect(renderCommentaryParagraph('<i>tro</i> og <b>gjerning</b><sup>1</sup>', link)).toBe('<i>tro</i> og <b>gjerning</b><sup>1</sup>');
    expect(renderCommentaryParagraph('<h>Skapelsen</h>', link)).toBe('<strong class="cm-heading">Skapelsen</strong>');
  });

  test('a link in another numbering than its label says so in the HTML', () => {
    const moved = () => ({ href: '/nb/sal/38#v14-16', labelNumbering: 'kjv' });
    expect(renderCommentaryParagraph('<ref osisRef="Ps.38.13-Ps.38.15">Sal 38,13–15</ref>', moved)).toBe(
      '<a class="cm-ref" href="/nb/sal/38#v14-16" data-label-numbering="kjv">Sal 38,13–15</a>',
    );
  });

  test('a reference becomes a link, or stays text when it cannot be resolved', () => {
    expect(renderCommentaryParagraph('hører (<ref osisRef="Rom.10.17">Rom 10,17</ref>)', link)).toBe(
      'hører (<a class="cm-ref" href="/nb/rom/10#v17">Rom 10,17</a>)',
    );
    expect(renderCommentaryParagraph('<ref osisRef="Tob.1.1">Tob 1,1</ref>', link)).toBe('Tob 1,1');
  });

  test('anything else is escaped, also an attribute on a known tag', () => {
    expect(renderCommentaryParagraph('<script>alert(1)</script>', link)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderCommentaryParagraph('<i onclick="x()">a</i>', link)).toBe('&lt;i onclick=&quot;x()&quot;&gt;a</i>');
    expect(renderCommentaryParagraph('a & b < c', link)).toBe('a &amp; b &lt; c');
  });

  test('a heading-only paragraph is told apart from body text', () => {
    expect(isHeadingOnly('<h>Skapelsen. (4004 f.Kr.)</h>')).toBe(true);
    expect(isHeadingOnly('<h>Skapelsen</h> og mer')).toBe(false);
  });
});

describe('a chapter file is checked before it is imported', () => {
  test('the shape free-bible writes is accepted', () => {
    const ok = parseCommentaryChapter(JSON.stringify({ work: 'mhc', language: 'nb', source: 'en', book: 1, chapter: 1, sections: [{ from: 1, to: 2, paragraphs: ['a'], models: ['m'] }] }));
    expect(typeof ok).toBe('object');
  });

  test('broken files give a reason, not a throw', () => {
    expect(parseCommentaryChapter('{')).toMatch(/ugyldig JSON/);
    expect(parseCommentaryChapter(JSON.stringify({ work: 'mhc', language: 'nb', book: 1, chapter: 1 }))).toBe('mangler sections');
    expect(parseCommentaryChapter(JSON.stringify({ work: 'mhc', language: 'nb', book: 1, chapter: 1, sections: [{ from: 1, to: 2, paragraphs: [1] }] }))).toMatch(/paragraphs/);
  });
});
