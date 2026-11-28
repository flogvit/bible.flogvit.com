// Formen leseren ser (#286), som ren logikk: `shapeCommentary` tar seksjonene
// slik de ligger i basen og gir bokas innledning, kapittelets innledning og
// seksjonene uten bibeltekst. Fixturen er 1 Mos 1 i miniatyr, i kildens egen
// form: forordet til de fem Mosebøkene og kapittelets innledning er limt inn
// foran første seksjon, under «Vers 1–2».

import { describe, expect, test } from 'bun:test';
import { commentaryTeaser, shapeCommentary, type RawCommentarySection } from '../src/lib/commentary.ts';
// @ts-expect-error — delt klient-modul uten typer
import { commentaryOn } from '../public/js/commentary-render.js';

const EN = [
  '<h>Genesis to Deuteronomy</h>',
  '<h>PREFACE</h>',
  '<h>Genesis to Deuteronomy</h>',
  'I. That <i>religion is the one thing useful.</i>',
  'We have before us the first of the five books.',
  'We have three things in this chapter.',
  '<h>The Creation. (b. c. 4004.)</h>',
  '<sup>1</sup> In the beginning God created the heaven and the earth.',
  'In these verses we have the work of creation in its epitome.',
] as const;
const NB = [
  '<h>Første Mosebok til Femte Mosebok</h>',
  '<h>FORORD</h>',
  '<h>Første Mosebok til Femte Mosebok</h>',
  'I. At <i>religionen er det ene nyttige.</i>',
  'Vi har foran oss den første av de fem bøkene.',
  'Vi har tre ting i dette kapittelet.',
  '<h>Skapelsen. (4004 f.Kr.)</h>',
  '<sup>1</sup> I begynnelsen skapte Gud himmelen og jorden.',
  'I disse versene har vi skaperverket i sammendrag.',
] as const;

const at = (chapter: number, verse: number) => ({ chapter, verse });
const section = (over: Partial<RawCommentarySection>): RawCommentarySection => ({
  sourceChapter: 1,
  sectionNo: 0,
  from: at(1, 1),
  to: at(1, 2),
  paragraphs: [...NB],
  sourceParagraphs: [...EN],
  models: ['claude-fable-5-2'],
  ...over,
});
const next = section({
  sectionNo: 1,
  from: at(1, 3),
  to: at(1, 5),
  paragraphs: ['<h>Skapelsen. (4004 f.Kr.)</h>', '<sup>3</sup> Og Gud sa: Det bli lys!', 'Her får vi den første dagens verk.'],
  sourceParagraphs: ['<h>The Creation. (b. c. 4004.)</h>', '<sup>3</sup> And God said, Let there be light.', 'We have here the first day’s work.'],
});

describe('the preface is the book’s introduction, never verses 1–2', () => {
  const shaped = shapeCommentary([section({}), next]);

  test('the book introduction carries the preface, each heading once, with its source alongside', () => {
    expect(shaped.bookIntro?.id).toBe('book');
    expect(shaped.bookIntro?.paragraphs).toEqual([NB[0], NB[1], NB[3], NB[4]]);
    expect(shaped.bookIntro?.sourceParagraphs).toEqual([EN[0], EN[1], EN[3], EN[4]]);
  });

  test('the chapter introduction is its own part at verse 0, before the sections', () => {
    expect(shaped.sections[0]).toMatchObject({ id: '1-0-intro', from: at(1, 0), to: at(1, 0), paragraphs: [NB[5]], sourceParagraphs: [EN[5]] });
  });

  test('«Vers 1–2» holds only Henry’s comment on verses 1–2: no preface, no Bible text', () => {
    const v12 = shaped.sections[1]!;
    expect(v12).toMatchObject({ id: '1-0', from: at(1, 1), to: at(1, 2) });
    expect(v12.paragraphs).toEqual([NB[6], NB[8]]);
    expect(v12.sourceParagraphs).toEqual([EN[6], EN[8]]);
    expect(v12.paragraphs.join(' ')).not.toContain('FORORD');
  });

  test('every other section loses its quoted verses and keeps its id', () => {
    expect(shaped.sections[2]).toMatchObject({ id: '1-1', paragraphs: [next.paragraphs[0], next.paragraphs[2]] });
    const all = [shaped.bookIntro!, ...shaped.sections].flatMap((p) => p.paragraphs);
    expect(all.some((p) => /^\s*<sup>\d+<\/sup>/.test(p))).toBe(false);
  });

  test('no paragraph is lost: all but the verse quotes and the repeated heading land in exactly one part', () => {
    const parts = [shaped.bookIntro!, ...shaped.sections].flatMap((p) => p.sourceParagraphs!);
    const expected = [...EN, ...next.sourceParagraphs!].filter((p, i, a) => !/^<sup>/.test(p) && !(p === EN[2] && i === 2));
    expect(parts.sort()).toEqual(expected.sort());
  });

  test('the split is computed on the source: the same parts in the source language alone', () => {
    const en = shapeCommentary([section({ paragraphs: [...EN], sourceParagraphs: null })]);
    expect(en.bookIntro?.paragraphs).toEqual([EN[0], EN[1], EN[3], EN[4]]);
    expect(en.sections.map((s) => s.id)).toEqual(['1-0-intro', '1-0']);
  });

  test('shaping is stable: shaping the shaped parts again changes nothing', () => {
    const again = shapeCommentary(shaped.sections);
    expect(again.sections).toEqual(shaped.sections);
    expect(again.bookIntro).toBeNull();
  });
});

describe('the cases the rule must leave alone or combine', () => {
  test('a book introduction in source chapter 0 comes first, then the lead', () => {
    const zero = section({ sourceChapter: 0, from: at(1, 0), to: at(1, 0), paragraphs: ['<h>Obadja</h>', 'Den korteste boka.'], sourceParagraphs: ['<h>Obadiah</h>', 'The shortest book.'] });
    const shaped = shapeCommentary([zero, section({})]);
    expect(shaped.bookIntro?.paragraphs.slice(0, 2)).toEqual(['<h>Obadja</h>', 'Den korteste boka.']);
    expect(shaped.bookIntro?.paragraphs).toContain(NB[3]);
  });

  test('a section with no quoted verse is not cut', () => {
    const plain = section({ paragraphs: ['Første.', 'Andre.'], sourceParagraphs: ['First.', 'Second.'] });
    expect(shapeCommentary([plain])).toEqual({ bookIntro: null, sections: [{ ...plain, id: '1-0' }] });
  });

  test('only the FIRST section of chapter 1 can carry a lead; later chapters keep their text', () => {
    const later = section({ sourceChapter: 2, from: at(2, 1), to: at(2, 3) });
    const shaped = shapeCommentary([later]);
    expect(shaped.bookIntro).toBeNull();
    expect(shaped.sections.map((s) => s.id)).toEqual(['2-0']);
  });

  test('a rendering whose paragraph count differs from the source gets no original, rather than a shifted one', () => {
    const shaped = shapeCommentary([section({ sourceParagraphs: EN.slice(1) })]);
    expect(shaped.sections.every((s) => s.sourceParagraphs === null)).toBe(true);
    expect(shaped.bookIntro?.paragraphs).toContain(NB[1]);
  });

  test('a section that was only a heading and the Bible text is dropped', () => {
    const empty = section({ sectionNo: 4, from: at(1, 9), to: at(1, 9), paragraphs: ['<h>X</h>', '<sup>9</sup> tekst'], sourceParagraphs: ['<h>X</h>', '<sup>9</sup> text'] });
    expect(shapeCommentary([section({}), empty]).sections.map((s) => s.id)).toEqual(['1-0-intro', '1-0']);
  });
});

describe('one switch per work (#286)', () => {
  test('on unless switched off; the old single switch counts until the reader chooses per work', () => {
    expect(commentaryOn({}, 'mhc')).toBe(true);
    expect(commentaryOn({ commentaries: { mhc: false } }, 'mhc')).toBe(false);
    expect(commentaryOn({ commentaries: { mhc: false } }, 'other')).toBe(true);
    expect(commentaryOn({ showCommentary: false }, 'mhc')).toBe(false);
    expect(commentaryOn({ showCommentary: false, commentaries: { mhc: true } }, 'mhc')).toBe(true);
  });
});

test('the panel’s teaser is cut at a word, with an ellipsis', () => {
  const t = commentaryTeaser('Dette kapittelet inneholder tre ting: et allment bilde av skaperverket, en detaljert beretning, og en forklaring.', 50);
  expect(t.length).toBeLessThanOrEqual(51);
  expect(t.endsWith('…')).toBe(true);
  expect(t).not.toMatch(/\s…$/);
  expect(commentaryTeaser('Kort.', 50)).toBe('Kort.');
});
