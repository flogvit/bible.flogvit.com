// Entry point for bible.flogvit.com (Bun + Hono rewrite of the Vite/React +
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
  // MAA ligge over DB_RETRY_BUDGET_MS i lib/db.ts. Bun sin standard er 10 s:
  // en forespoersel som venter lenger faar forbindelsen lukket, Caddy ser
  // «EOF» og svarer 502 — uansett hva Caddy selv er satt til. Det var dette
  // som gjorde at retryen paa 25 s ikke hjalp under DB-restarten 2026-07-28.
  idleTimeout: Number(process.env.SERVE_IDLE_TIMEOUT || 35),
};
