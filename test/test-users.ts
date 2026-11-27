// Bruker-id-er for DB-tester som skriver brukerrader (sync_items, sync_cursors).
//
// Alle arbeidstrær og alle testporter på maskinen deler ÉN lokal MySQL. En fast
// id (990133) betyr at to kjøringer samtidig sletter hverandres rader i
// beforeAll/afterAll midt i en test — #276s port feilet slik i
// sync-ny-enhet.test.ts, på en endring som ikke rørte sync. Basen avledes derfor
// av prosessen: to samtidige `bun test` får hver sitt område, og innenfor én
// kjøring skiller `slot` filene fra hverandre.
//
// Holdes under INT-taket (user_id er INT) og over konto-id-ene en lokal base har.

const BASE = 1_000_000_000;
const SLOTS = 100;

/** Unik id for denne prosessen. `slot` (0–99) skiller filene i samme kjøring. */
export function testUserId(slot: number, pid = process.pid): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS) throw new Error(`slot ${slot} er utenfor 0–${SLOTS - 1}`);
  return BASE + (pid % 10_000_000) * SLOTS + slot;
}
