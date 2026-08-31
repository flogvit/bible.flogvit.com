/**
 * VAKT: et DB-avbrudd skriver EN LINJE, aldri en stacktrace — og en oppstart som
 * traff avbruddet retter seg selv (#109).
 *
 * Saken: containerloggen for bibel-hono bar denne tre ganger i vinduet
 * 2026-08-31 00:58–02:08Z, uten at noe var rullet ut:
 *
 *     code: "ERR_MYSQL_CONNECTION_TIMEOUT"
 *       at wrapError (internal:sql/mysql:14:10)
 *       at #onClose (internal:sql/mysql:192:22)
 *
 * Formen er målt, ikke gjettet: den oppstår i det øyeblikket feilOBJEKTET fra
 * Bun rekkes til `console.error`. #108 tok den for sidene — der kastet nådde
 * Honos standardhåndterer, som gjør nettopp det — men **hver eneste rute under
 * `/api/` fanger sitt eget kast** (`console.error('Error fetching X:', error)`)
 * og når derfor aldri `app.onError`. Signaturen lever videre der, og der kommer
 * den fra ~55 kallsteder ingen liste kan holde styr på.
 *
 * **Loggen er ikke det eneste utfallet, og alene ville en stillere logg vært
 * verre.** `initBooks()` kjøres ÉN gang ved oppstart og prøves aldri igjen. En
 * container som bootet mens basen var borte, står derfor med tom bok-cache for
 * alltid: `requireBooks()` kaster «initBooks() er ikke kjørt», som IKKE er en
 * forbindelsesfeil, så hver personside, hver historieside, /statistikk og hele
 * `/api/books` svarer **naken 500 i det uendelige — mens basen er frisk igjen**.
 * Det er ingen 503, ingen `Retry-After`, og ingenting i loggen etter den ene
 * linja ved oppstart. Å gjøre nettopp den linja stillere uten å fikse
 * permanensen ville vært å skru ned lyden på en alarm.
 *
 * Fire halvdeler:
 *
 * REGELEN — `loggFeil()` måler BEGGE veier. Drift får en linje UTEN feilobjektet
 * (det er objektet som blir til dumpen); en ekte feil beholder hele stacktracen,
 * ellers ville «logg aldri objektet» bestått og hver bug hos oss blitt usynlig.
 *
 * SVEIPEN — hele /api-RUTETABELLEN med basen nede. Formulert på kontrakten og
 * ikke på de ~55 kallstedene: en ny rute med et rått `console.error(…, err)`
 * blir rød uten at noen fører den opp.
 *
 * OPPSTARTEN — et EGET PROGRAM (`db-avbrudd-boot-probe.ts`), fordi bok-cachen er
 * modulnivå-tilstand og fordi signaturen er noe Bun skriver til EKTE stderr.
 * Det måler sakens eget bevis: ingen dump i stderr, 503 under avbruddet, og 200
 * når basen er tilbake — UTEN en restart.
 *
 * SØMMEN — `index.ts` starter en server ved import og kan ikke kalles fra en
 * test, så oppstartslinja leses fra kilden. Uten den kunne helperen ligget
 * ubrukt og de tre andre halvdelene fortsatt vært grønne.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { closeSql } from '../src/lib/db.ts';
import { loggFeil } from '../src/lib/error-handler.ts';
import { clearPageCache } from '../src/lib/page-cache.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Arbeidstrærne bor under `.flogvit-orkester/trær/`, og en prosentkodet
// `pathname` som cwd gir ENOENT på «bun» framfor på katalogen (#80, én etasje
// ned). `Bun.fileURLToPath` dekoder.
const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));

/** Ordrett formen Bun kaster når forbindelsen tar tid — signaturen i saken. */
const dbNede = () =>
  Object.assign(new Error('Connection timeout after 2s (during authentication)'), {
    code: 'ERR_MYSQL_CONNECTION_TIMEOUT',
  });

/** En defekt hos OSS. Den skal aldri miste stacktracen sin. */
const ektefeil = () => new Error("Table 'flogvit_bibel.finnesikke' doesn't exist");

/** Det Bun skriver når feilOBJEKTET rekkes videre — det saken er meldt på. */
const DUMP = /at wrapError|internal:sql\/mysql|code: "ERR_MYSQL/;

/** Fanger argumentene `console.error` faktisk får, ikke bare teksten. */
function fangLogg<T>(fn: () => Promise<T> | T): { kall: unknown[][]; svar: Promise<T> } {
  const kall: unknown[][] = [];
  const ekte = console.error;
  console.error = (...args: unknown[]) => {
    kall.push(args);
  };
  const ferdig = (async () => fn())().finally(() => {
    console.error = ekte;
  });
  return { kall, svar: ferdig };
}

describe('REGELEN: drift er en linje, en defekt beholder stacktracen (#109)', () => {
  test('en forbindelsesfeil logges UTEN feilobjektet', async () => {
    const { kall, svar } = fangLogg(() => loggFeil('Error fetching books', dbNede()));
    await svar;
    expect(kall).toHaveLength(1);
    // Det er OBJEKTET som blir til dumpen. Rekkes bare tekst videre, finnes
    // signaturen ikke å skrive.
    for (const arg of kall[0]!) expect(typeof arg).toBe('string');
    expect(kall[0]!.join(' ')).toContain('Error fetching books');
    expect(kall[0]!.join(' ')).not.toMatch(DUMP);
  });

  // Uten denne ville «logg aldri objektet» bestått — og da er hver bug hos oss
  // en tekstlinje uten et eneste spor av hvor den kom fra.
  test('en ekte feil rekker feilobjektet videre', async () => {
    const feil = ektefeil();
    const { kall, svar } = fangLogg(() => loggFeil('Error fetching books', feil));
    await svar;
    expect(kall).toHaveLength(1);
    expect(kall[0]).toContain(feil);
  });
});

describe('SVEIPEN: ingen /api-rute dumper feilobjektet når basen er nede (#109)', () => {
  const før: Record<string, string | undefined> = {};
  const sett = (k: string, v: string) => {
    før[k] = process.env[k];
    process.env[k] = v;
  };

  beforeAll(async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response('') });
    const stengtPort = server.port;
    await server.stop(true);
    sett('DB_HOST', '127.0.0.1');
    sett('DB_PORT', String(stengtPort));
    // Budsjettet leses PER KALL (#107), så sveipen trenger ikke vente 25 s per
    // rute for å måle hva som logges når det er brukt opp.
    sett('DB_RETRY_BUDGET_MS', '200');
    await closeSql();
    clearPageCache();
  });

  afterAll(async () => {
    await closeSql();
    for (const [k, v] of Object.entries(før)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearPageCache();
  });

  /** Rutetabellen er lista — ikke en håndskrevet oppregning av kallsteder. */
  const stier = () => {
    const app = createApp();
    return app.routes
      .filter((r) => r.method === 'GET' && r.path.startsWith('/api/'))
      .map((r) => r.path)
      // `/api/health` rører ikke basen, og `/api/mappings/kvn/all` strømmer
      // 73 MB fra disk uten å spørre den (#104) — begge måler ingenting her.
      .filter((p) => p !== '/api/health' && p !== '/api/mappings/kvn/all')
      .map((p) =>
        p.replace(/:([a-zA-Z]+)(\{[^}]*\})?/g, (_m, navn: string) =>
          navn === 'date' ? '2026-01-01' : navn === 'slug' ? 'x' : '1',
        ),
      )
      .filter((p, i, alle) => alle.indexOf(p) === i);
  };

  test('rutetabellen har /api-ruter å sveipe', () => {
    expect(stier().length).toBeGreaterThan(30);
  });

  test('ingen av dem rekker feilobjektet til console.error', async () => {
    const app = createApp();
    const { kall, svar } = fangLogg(async () => {
      for (const sti of stier()) await app.request(`http://localhost${sti}`);
    });
    await svar;

    const dumper = kall.filter((args) => args.some((a) => typeof a !== 'string'));
    expect(
      dumper.map((args) => String(args[0])),
      'disse rutene rekker feilobjektet videre, og Bun skriver da hele stacken',
    ).toEqual([]);
    // Og teksten som BLIR skrevet skal ikke bære signaturen heller.
    for (const args of kall) expect(args.join(' ')).not.toMatch(DUMP);
  });
});

describe('OPPSTARTEN: en container som bootet under avbruddet (#109)', () => {
  interface Måling {
    underAvbruddet: { sti: string; status: number; retryAfter: string | null }[];
    etterpå: { sti: string; status: number }[];
  }
  let m: Måling;
  let stderr: string;

  beforeAll(async () => {
    const proc = Bun.spawn(['bun', 'test/db-avbrudd-boot-probe.ts'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [ut, feil] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    stderr = feil;
    const linje = ut.split('\n').find((l) => l.startsWith('MÅLING '));
    if (!linje) throw new Error(`måleprogrammet ga ingen måling:\n${ut}\n${feil}`);
    m = JSON.parse(linje.slice('MÅLING '.length)) as Måling;
  });

  test('oppstarten skriver ingen stacktrace — sakens egen signatur', () => {
    expect(stderr).not.toMatch(DUMP);
    // Men den sier fra: en stille oppstart er en container ingen vet er tom.
    expect(stderr).toContain('bok-metadata');
  });

  test('sidene svarer 503 med Retry-After mens basen er borte', () => {
    for (const r of m.underAvbruddet.filter((x) => x.sti !== '/robots.txt')) {
      expect(`${r.sti}: ${r.status}`).toBe(`${r.sti}: 503`);
      expect(Number(r.retryAfter)).toBeGreaterThan(0);
    }
  });

  // Uten denne ville «503 på alt» bestått — og da hadde vi tatt ned selve
  // bremsen på lasten (#64).
  test('robots.txt er urørt av avbruddet', () => {
    const r = m.underAvbruddet.find((x) => x.sti === '/robots.txt');
    expect(r?.status).toBe(200);
  });

  // KJERNEN: uten en ny lasting står bok-cachen tom ut containerens levetid, og
  // disse tre svarer naken 500 for alltid mens basen er frisk.
  test('og 200 når basen er tilbake — uten en restart', () => {
    for (const r of m.etterpå) expect(`${r.sti}: ${r.status}`).toBe(`${r.sti}: 200`);
  });
});

describe('SØMMEN: index.ts logger oppstarten gjennom regelen (#109)', () => {
  test('boot-feilen går gjennom loggFeil, ikke rått til console.error', async () => {
    const kilde = await Bun.file(`${ROOT}src/index.ts`).text();
    expect(kilde).toContain('loggFeil(');
    // `console.error('…', err)` er nettopp formen som skriver dumpen.
    expect(kilde).not.toMatch(/console\.error\([^)]*,\s*err/);
  });
});
