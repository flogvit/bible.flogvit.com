// To testporter mot samme lokale base får aldri samme bruker-id (#276-porten).

import { describe, expect, test } from 'bun:test';
import { testUserId } from './test-users.ts';

const INT_MAX = 2 ** 31 - 1;

describe('testUserId', () => {
  test('to samtidige kjøringer (to pid-er) deler ingen id', () => {
    const a = Array.from({ length: 100 }, (_, s) => testUserId(s, 41_000));
    const b = Array.from({ length: 100 }, (_, s) => testUserId(s, 41_001));
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  test('filene i samme kjøring får hver sin id', () => {
    expect(new Set([0, 1, 2].map((s) => testUserId(s))).size).toBe(3);
  });

  test('id-en passer i user_id (INT), også for den største pid-en', () => {
    expect(testUserId(99, 9_999_999)).toBeLessThanOrEqual(INT_MAX);
  });

  test('en slot utenfor området er en feil, ikke en kollisjon', () => {
    expect(() => testUserId(100)).toThrow('utenfor');
    expect(() => testUserId(-1)).toThrow('utenfor');
  });
});
