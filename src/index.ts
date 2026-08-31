// Entry point for bible.flogvit.com (Bun + Hono rewrite of the Vite/React +
// Express app).

import { createApp } from './app.ts';
import { initBooks } from './lib/bible.ts';
import { getSql, withRetryBudget } from './lib/db.ts';
import { loggFeil } from './lib/error-handler.ts';
import { setContentVersionReader } from './lib/page-cache.ts';

// Bok-metadata (66 rader, statisk innhold) caches i minnet så parserne kan
// være synkrone. Appen skal fortsatt boote om basen er borte akkurat nå —
// `medBokdata` i `app.ts` laster den da på første forespørsel som trenger den
// (#109). Linja her er en varsling, ikke en port.
//
// Den går gjennom `loggFeil` av samme grunn som rutene: et DB-avbrudd er drift
// og skal skrives som ÉN linje. Rekkes feilobjektet til `console.error`, skriver
// Bun hele stacken ned i sin egen mysql-modul — ordrett signaturen i #109.
await initBooks().catch((err) => loggFeil('[oppstart] bok-metadata ikke lastet', err));

// Mikrocachen holder anonyme sider i en time (#19). Uten dette ville en
// innholdsimport ikke vist seg før TTL-en løp ut, så cachen spør db_meta om
// sync-versjonen med jevne mellomrom og tømmer seg selv når den endres.
// Registreres HER, ikke i createApp(): cachen skal kunne testes uten database.
//
// Den kjører INNE i leserens forespørsel, men får ikke bruke leserens
// retry-budsjett (#107): budsjettet er ett per forespørsel, og en versjonssjekk
// som ventet ut en DB-restart ville brukt det opp før siden i det hele tatt
// begynte å rendre. Et eget budsjett på null er ikke en nedprioritering, det er
// hva cachen alt sier om denne spørringen — «feiler den, BEHOLDES cachen: den
// er det eneste som fortsatt kan svare». Da er det ingenting å vente på.
setContentVersionReader(() =>
  withRetryBudget(async () => {
    const rows = (await getSql()`
      SELECT value FROM db_meta WHERE \`key\` = 'sync_version'
    `) as { value: string }[];
    return rows[0]?.value;
  }, 0),
);

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
