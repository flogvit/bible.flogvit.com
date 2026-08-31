// Måleprogrammet bak `db-avbrudd-logg.test.ts` (#109): en container som BOOTET
// mens basen var borte.
//
// Det er et EGET PROGRAM med vilje, av to grunner. Bok-metadataen er
// modulnivå-tilstand i `bible.ts`, og `bun test` kjører alle filene i SAMME
// prosess — har en annen fil alt lastet de 66 radene, kan tilstanden «oppstarten
// bommet» ikke oppstå i det hele tatt, og halvdelen ville målt ingenting. Og
// signaturen i saken er noe Bun skriver til EKTE stderr; en `console.error`-spion
// ser bare det som går gjennom `console`.
//
// Skriver én linje JSON på stdout, prefikset `MÅLING `. Alt annet på stdout/stderr
// er loggen vakta leser.

import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { loggFeil } from '../src/lib/error-handler.ts';

/** Adressene som slår opp en bok. `/robots.txt` er kontrollen (#64). */
const STIER = [
  '/nb/personer/abraham',
  '/nb/statistikk',
  '/en/historier/daniel-i-lovehulen',
  '/api/books',
  '/robots.txt',
];

const ekte = { host: process.env.DB_HOST, port: process.env.DB_PORT };

// En port ingen lytter på: ECONNREFUSED med en gang, framfor et tidsavbrudd som
// ville gjort målingen treg og avhengig av nettverket. Feilen er den samme
// klassen — `isConnectionError()` kjenner begge.
const server = Bun.serve({ port: 0, fetch: () => new Response('') });
const stengtPort = server.port;
await server.stop(true);

process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = String(stengtPort);
process.env.DB_RETRY_BUDGET_MS = '300';
await closeSql();

// --- 1. OPPSTARTEN, slik `index.ts` gjør den --------------------------------
await initBooks().catch((err) => loggFeil('bok-metadata ikke lastet', err));

const app = createApp();

const mål = async (sti: string) => {
  const res = await app.request(`http://localhost${sti}`);
  return { sti, status: res.status, retryAfter: res.headers.get('retry-after') };
};

// --- 2. UNDER AVBRUDDET ------------------------------------------------------
const underAvbruddet = [];
for (const sti of STIER) underAvbruddet.push(await mål(sti));

// --- 3. BASEN ER TILBAKE — uten en restart ----------------------------------
if (ekte.host === undefined) delete process.env.DB_HOST;
else process.env.DB_HOST = ekte.host;
if (ekte.port === undefined) delete process.env.DB_PORT;
else process.env.DB_PORT = ekte.port;
await closeSql();

const etterpå = [];
for (const sti of STIER) etterpå.push(await mål(sti));

console.log(`MÅLING ${JSON.stringify({ underAvbruddet, etterpå })}`);
await closeSql();
process.exit(0);
