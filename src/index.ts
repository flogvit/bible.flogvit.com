// Entry point for bibel.flogvit.com (Bun + Hono rewrite of the Vite/React +
// Express app).

import { createApp } from './app.ts';
import { initBooks } from './lib/bible.ts';

// Bok-metadata (66 rader, statisk innhold) caches i minnet så parserne kan
// være synkrone. Feiler DB-en ved boot, logges det og API-et svarer 500 til
// DB-en er oppe — appen skal fortsatt boote.
await initBooks().catch((err) => console.error('initBooks feilet (DB nede?):', err));

const app = createApp();
const port = Number(process.env.PORT || 8080);
console.log(`bibel-web listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
