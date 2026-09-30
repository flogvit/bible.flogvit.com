import { describe, expect, setSystemTime, test, afterEach } from 'bun:test';
import { rateLimiter } from '../src/lib/rate-limit.ts';

afterEach(() => setSystemTime());

describe('rateLimiter', () => {
  test('slipper gjennom max kall per nøkkel, så nei', () => {
    const tillat = rateLimiter<string>(2);
    expect([tillat('a'), tillat('a'), tillat('a')]).toEqual([true, true, false]);
    expect(tillat('b')).toBe(true);
  });

  test('vinduet åpner seg igjen når det er utløpt', () => {
    setSystemTime(new Date('2026-09-30T12:00:00Z'));
    const tillat = rateLimiter<number>(1, 1000);
    expect(tillat(1)).toBe(true);
    expect(tillat(1)).toBe(false);
    setSystemTime(new Date('2026-09-30T12:00:01.001Z'));
    expect(tillat(1)).toBe(true);
  });

  test('målingen teller nøklene kartet holder', () => {
    const tillat = rateLimiter<string>(5);
    tillat('x');
    tillat('y');
    tillat('x');
    expect(tillat.maaling()).toEqual({ oppforinger: 2 });
  });
});
