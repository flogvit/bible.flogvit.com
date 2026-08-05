/**
 * Taket en testfil som snakker med DATABASEN skal kjøre under (#74).
 *
 * Buns standard er 5000 ms, og det tallet er valgt for en vanlig test — ren
 * logikk som enten svarer med en gang eller henger. En hook som migrerer
 * skjemaet er noe annet: `ensureSchema()` er 33 CREATE TABLE + hele
 * `runMigrations()`, og arbeidet er legitimt sekunder langt.
 *
 * Målt på denne maskinen mot den lokale MySQL-en:
 *
 *     tom maskin        ensureSchema: 2493 / 2419 / 2387 ms
 *     under last        ensureSchema: 14067 / 14730 / 15228 ms
 *
 * Altså: taket lå 2× over arbeidet på en rolig maskin og 3× UNDER det på en
 * travel. Utslaget er ikke en rød test — det er at hele filen forsvinner:
 * ryker `beforeAll`, kjøres ingen av filens tester, og suiten melder et lavere
 * totaltall som ser grønt ut (799 mot 822 i saken). En vakt som blir borte er
 * verre enn en som feiler; den lyver med et tall.
 *
 * 60 s er derfor ikke «rundelig», det er 4× det tyngste vi har MÅLT. Prisen for
 * et for høyt tak er at en database som HENGER rapporteres et minutt senere;
 * prisen for et for lavt er at ferdig, riktig arbeid forkastes fordi maskinen
 * var travel. De to er ikke i nærheten av hverandre i kostnad.
 *
 * Filen erklærer taket sitt selv med `setDefaultTimeout(DB_TEST_TIMEOUT_MS)`,
 * som gjelder BÅDE hooks og tester i filen — så en tung sveip inne i en `test()`
 * (verse-integrity, removed-pages) arver det samme taket som hooken.
 * `test/db-test-timeout.test.ts` er vakta som krever linja.
 */
export const DB_TEST_TIMEOUT_MS = 60_000;
