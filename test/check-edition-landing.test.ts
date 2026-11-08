// The rule scripts/check-edition-landing.ts judges a chapter by (#216): the verse
// lengths of two translations of the same text follow each other, so a chapter
// whose lengths match one verse over and not in place is shifted.
import { describe, expect, test } from 'bun:test';
import { chapterShift, JUNK, textLength } from '../scripts/check-edition-landing.ts';

// Lengths by verse number (index 0 unused), as a real chapter varies them.
const KJV = [0, 120, 45, 80, 200, 60, 150, 90, 30, 170, 110, 70, 140];

describe('chapterShift', () => {
  test('a chapter in place is not flagged', () => {
    const same = KJV.map((n) => Math.round(n * 0.9));
    expect(chapterShift('66 1', same, KJV)).toBeNull();
  });

  test('a chapter one verse low is flagged, and by which way', () => {
    // The translation's verse v holds what kjv has at v+1 (albanian Gal 1 before #141).
    const low = [0, ...KJV.slice(2), 0];
    expect(chapterShift('48 1', low, KJV)).toMatchObject({ chapter: '48 1', by: -1 });
  });

  test('a chapter one verse high is flagged', () => {
    const high = [0, 0, ...KJV.slice(1, -1)];
    expect(chapterShift('19 9', high, KJV)).toMatchObject({ by: 1 });
  });

  test('too few shared verses say nothing', () => {
    expect(chapterShift('64 1', [0, 10, 20, 30], [0, 30, 10, 20])).toBeNull();
  });
});

test('length counts letters in any script, not spaces or punctuation', () => {
  expect(textLength('耶 和 华 啊 ， 我')).toBe(5);
  expect(textLength('Ðức Giê-hô-va.')).toBe(textLength('ĐứcGiêhôva'));
});

test('the placeholder bungo has at Exodus 7:24 is junk', () => {
  expect(JUNK.test('*** POSSIBLE ERROR IN BIBLE, TEXT MISSING HERE ***')).toBe(true);
  expect(JUNK.test('In the beginning God created')).toBe(false);
});
