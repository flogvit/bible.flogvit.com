// Rate-limit i minnet: høyst `max` kall per nøkkel innenfor et fast vindu.
// Brukt av sync, contrib og publiseringsrutene, som hver hadde sin egen kopi
// fram til #122. Alle stopper løpske klienter, ikke vanlig bruk.
//
// Kartet ligger INNE i fabrikken, så sveipen i `test/minne-regnskap.test.ts`
// (som leser `const … = new Map` på modulnivå) ser det ikke. Hvert kallsted
// melder derfor sin begrenser inn selv, med et literalt navn:
//
//   const limit = rateLimiter<number>(30);
//   registrerMinnekilde('sync/rateLimitMap', limit.maaling);
//
// En utløpt oppføring OVERSKRIVES framfor å slettes, så kartet er like stort
// som antall ulike nøkler siden oppstart — derfor må det måles (#110).

import type { Minnemaaling } from './minne-regnskap.ts';

export interface RateLimiter<K> {
  (key: K): boolean;
  maaling: () => Minnemaaling;
}

export function rateLimiter<K>(max: number, windowMs = 60_000): RateLimiter<K> {
  const seen = new Map<K, { count: number; resetAt: number }>();
  const tillat = (key: K): boolean => {
    const now = Date.now();
    const entry = seen.get(key);
    if (!entry || now > entry.resetAt) {
      seen.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  };
  return Object.assign(tillat, { maaling: () => ({ oppforinger: seen.size }) });
}
