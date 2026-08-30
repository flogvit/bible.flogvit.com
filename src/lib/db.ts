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
//
// OG BUDSJETTET FOR Å VENTE ER FORESPØRSELENS, IKKE SPØRRINGENS (#107)
// --------------------------------------------------------------------
// «Brukeren venter litt» over var et løfte om et TAK, og taket fantes ikke:
// deadlinen ble regnet ut på nytt inne i hvert eneste `sql`-kall, og en side
// gjør mange. `/personer/:id` slår opp far, mor, ektefelle, hvert søsken, hvert
// barn og hver relatert person — ett kall hver, i tur — så taket for den siden
// var ANTALL SPØRRINGER × budsjettet. Med 25 s og tjue oppslag er det over åtte
// minutter, og Caddy har ingen response-timeout som stopper det.
//
// Målt 2026-08-30T20:01:22–20:02:16Z, da nye forbindelser timet ut på 2 s:
// `/sv/historier/…` brukte 24,67 s og ble 500 — én spørring som spiste hele
// budsjettet. `/en/historier/daniel-i-lovehulen` brukte 24,8 s og ble **200**,
// og den kan ikke være det samme: et budsjett som løper ut, kaster. Det er
// flere spørringer som hver brukte sin del av hvert sitt budsjett.
//
// Prisen er mer enn den ene leserens tid. Den som venter, holder en render-plass
// i semaforen hele veien (#19), så en blipp som rammer noen få forespørsler kan
// stanse flata for alle — nettopp «bible.flogvit.com sto i ~55 s».

import { SQL } from 'bun';
import { AsyncLocalStorage } from 'node:async_hooks';

export const DB_NAME = process.env.DB_NAME || 'flogvit_bibel';

const CONNECT_TIMEOUT_S = Number(process.env.DB_CONNECT_TIMEOUT || 2);
const MAX_LIFETIME_S = Number(process.env.DB_MAX_LIFETIME || 900);
/**
 * Hvor lenge det er lov å vente på at basen kommer tilbake.
 *
 * Spenner over en hel DB-restart (målt 12 s og 28 s). Caddy tåler det: ingen
 * response-timeout er satt, bare standardene, og `dial_timeout` slår kun inn
 * når appen ikke tar imot forbindelsen i det hele tatt.
 *
 * Leses PER KALL framfor én gang ved import, av samme grunn som
 * `PAGE_CACHE_MAX_BYTES` (#105): den dagen tallet må ned, skal det ikke kreve
 * en deploy av appen — og en vakt skal kunne måle regelen uten å vente 25 s.
 */
const retryBudgetMs = () => Number(process.env.DB_RETRY_BUDGET_MS || 25_000);
const RETRY_BACKOFF_MAX_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deadlinen ALLE lesninger i samme forespørsel deler.
 *
 * AsyncLocalStorage framfor hono sin `contextStorage()`: `db.ts` skal ikke
 * kjenne rammeverket, og skriptene (`init-db.ts`, `import-bible.ts`) har ingen
 * forespørsel i det hele tatt.
 */
const budsjett = new AsyncLocalStorage<{ deadline: number }>();

/**
 * Kjør `fn` med ETT retry-budsjett for alt den gjør mot basen (#107).
 *
 * Monteres ytterst i `app.ts`, så hver forespørsel har ett tak uansett hvor
 * mange spørringer siden gjør. UTENFOR et slikt kall — altså i skriptene — får
 * hvert kall sitt eget budsjett som før: en import som rir av en DB-restart
 * skal ikke gi opp fordi den forrige spørringen brukte tid.
 */
export function withRetryBudget<T>(fn: () => T, budgetMs: number = retryBudgetMs()): T {
  return budsjett.run({ deadline: Date.now() + budgetMs }, fn);
}

/** Hva som er igjen av forespørselens budsjett, eller null utenfor et. */
export function retryBudgetRemainingMs(): number | null {
  const store = budsjett.getStore();
  return store ? store.deadline - Date.now() : null;
}

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
 *
 * Eksportert for vakta i `test/db-retry-budget.test.ts`: regelen skal kunne
 * måles mot en «pool» som bare er svaret sitt, uten en database som er nede.
 */
export function withRetry(base: SQL): SQL {
  return new Proxy(base, {
    apply(target, thisArg, args: unknown[]) {
      const strings = args[0] as TemplateStringsArray | undefined;
      const run = () => Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args);
      if (!strings || !isReadOnly(strings[0] ?? '')) return run();
      // Forespørselens deadline om vi er i en, ellers vår egen (skriptene).
      // Leses her, i den synkrone delen av kallet, mens konteksten er vår.
      const store = budsjett.getStore();
      return (async () => {
        const deadline = store ? store.deadline : Date.now() + retryBudgetMs();
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
