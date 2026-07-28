// Bun.sql-pool mot managed db-flogvit (ALDRI DB i Docker). Samme env-konvensjon
// som konto (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME). Lokal utvikling går
// mot lokal MySQL (DBngin).
//
// TÅLER AT BASEN FORSVINNER EN LITEN STUND
// ----------------------------------------
// Instansen ligger på Scaleways «Cost Optimized»-tier: delte ressurser, og
// EKSPLISITT unntatt SLA-en. Den får derfor ordnede SIGTERM-er med jevne
// mellomrom — helt forventet oppførsel for den tieren, ikke en feil å eskalere.
// Selve avbruddet er kort: målt 28 s og 12 s 2026-07-28 i Scaleways error-logg.
// Appene sto likevel i 7–15 minutter, og hele den forsterkningen var vår egen:
// Bun venter 30 s på en død forbindelse som standard, poolen gikk full av
// ventende kall, og ingenting prøvde på nytt.
//
// Derfor to grep her: kort connect-timeout så en poolplass frigjøres raskt, og
// retry av LESNINGER gjennom hele restarten så brukeren venter litt i stedet
// for å få en feilside.

import { SQL } from 'bun';

export const DB_NAME = process.env.DB_NAME || 'flogvit_bibel';

const CONNECT_TIMEOUT_S = Number(process.env.DB_CONNECT_TIMEOUT || 2);
const MAX_LIFETIME_S = Number(process.env.DB_MAX_LIFETIME || 900);
// Spenner over en hel DB-restart (målt 12 s og 28 s). Caddy tåler det: ingen
// response-timeout er satt, bare standardene, og `dial_timeout` slår kun inn
// når appen ikke tar imot forbindelsen i det hele tatt.
const RETRY_BUDGET_MS = Number(process.env.DB_RETRY_BUDGET_MS || 25_000);
const RETRY_BACKOFF_MAX_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Feil som betyr «forbindelsen er borte», ikke «spørringen er gal».
 * Bun legger koden på `err.code` (ERR_MYSQL_CONNECTION_CLOSED er den vi faktisk
 * så i prod), mens meldingsteksten varierer — derfor sjekkes begge, og
 * skilletegnet er `[ _]` siden koden bruker understrek der teksten bruker
 * mellomrom.
 *
 * «max lifetime» er VÅR EGEN maxLifetime som slår til: Bun kaster da en feil
 * til kalleren i stedet for å resirkulere stille. Den ER en forbindelsesfeil
 * og skal gjentas — uten dette ga resirkuleringen hver 15. minutt en 500 til
 * en tilfeldig bruker (sett i prod 2026-07-28 kveld, /en/2kong/18).
 */
export function isConnectionError(err: unknown): boolean {
  const e = err as { message?: unknown; code?: unknown } | null;
  const text = `${typeof e?.code === 'string' ? e.code : ''} ${typeof e?.message === 'string' ? e.message : String(err ?? '')}`;
  return /connection[ _]closed|connection[ _]timeout|shutdown[ _]in[ _]progress|server[ _]has[ _]gone[ _]away|lost[ _]connection|not[ _]connected|ECONNREFUSED|ECONNRESET|EPIPE|too[ _]many[ _]connections|max[ _]lifetime/i.test(text);
}

/**
 * Bare LESNINGER gjentas. En avbrutt skriving kan ha rukket å treffe serveren
 * før forbindelsen døde, og et blindt nytt forsøk kunne telt noe to ganger.
 */
export function isReadOnly(first: string): boolean {
  return /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE|WITH)\b/i.test(first);
}

let pool: SQL | null = null;
let wrapped: SQL | null = null;

function createPool(): SQL {
  return new SQL({
    adapter: 'mysql',
    hostname: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
    max: Number(process.env.DB_POOL_MAX || 5),
    connectionTimeout: CONNECT_TIMEOUT_S,
    maxLifetime: MAX_LIFETIME_S,
  });
}

/**
 * Poolen pakket i en Proxy som kun fanger tagged-template-kallene
 * (``sql`SELECT …` ``) — de 48 kallstedene trenger derfor ingen endring.
 *
 * `apply` er den ENESTE fellen: `sql.begin(…)`, `sql.unsafe(…).simple()` og alt
 * annet går på property-oppslag og treffer poolen direkte, uendret. Det er med
 * vilje — transaksjoner og migrasjoner er skrivinger, som ikke skal gjentas.
 */
function withRetry(base: SQL): SQL {
  return new Proxy(base, {
    apply(target, thisArg, args: unknown[]) {
      const strings = args[0] as TemplateStringsArray | undefined;
      const run = () => Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args);
      if (!strings || !isReadOnly(strings[0] ?? '')) return run();
      return (async () => {
        const deadline = Date.now() + RETRY_BUDGET_MS;
        let wait = 200;
        for (;;) {
          try {
            return await run();
          } catch (err) {
            if (!isConnectionError(err)) throw err;
            if (Date.now() + wait >= deadline) throw err;
            await sleep(wait);
            wait = Math.min(wait * 2, RETRY_BACKOFF_MAX_MS);
          }
        }
      })();
    },
  }) as SQL;
}

export function getSql(): SQL {
  if (!wrapped) {
    pool = createPool();
    wrapped = withRetry(pool);
  }
  return wrapped;
}

export async function closeSql(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    wrapped = null;
  }
}
