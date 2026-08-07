// Reviewerens egen søm (GitHub #15, del 2) — `scripts/publications-review.ts`.
//
// `publications.test.ts` dekker API-et og sidene, men går inn med
// `app.request()`. CLI-en er et EGET PROGRAM som over ekte HTTP leser et svar
// den har en formening om FORMEN på, og den er den ENESTE veien en innsending
// noen gang kommer ut i katalogen. Døpes `pending` om i
// `/api/publications/pending`, står hele suiten grønn mens alle fire
// kommandoene i `REVIEW.md` slutter å virke — og utslaget er stille: køen
// fylles, forfatteren ser «Til vurdering» for alltid, og ingen feillogg får en
// eneste rad.
//
// Kommandoene kjøres derfor som EKTE underprosesser mot en EKTE lyttende
// server, slik runbooken beskriver dem — ikke som funksjonskall.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { reportPublication, submitPublication } from '../src/lib/publications.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const USER = 990401;
const ITEM_ID = 'dev-review-cli-test';
const TOKEN = 'review-cli-token';
const TITLE = 'Om tålmodigheten i Jakobs brev';

// Utdraget i køen er 100 tegn. Halen er derfor det `vis` skal vise og køen
// ikke — nettopp der en innsending som vil noe annet, plasserer det.
const TAIL = 'KJØP-BILLIGE-KLOKKER-PÅ-EKSEMPEL-PUNKTUM-NO';
const CONTENT = `# Om tålmodigheten\n\n${'En andakt over [ref:Jak 5,7-11] om å vente. '.repeat(6)}\n\n${TAIL}`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
let slug: string;

// `.pathname` er PROSENTKODET (#80, én etasje ned): i et arbeidstre under
// `trær/` blir katalogen `tr%C3%A6r`, som ikke finnes — og `Bun.spawn` melder
// da ENOENT på «bun», ikke på cwd-en som mangler. Hele filen ble rød uansett
// hva branchen endret, altså samme merge-port som #85.
const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));

/** Kommandoen slik den står i REVIEW.md — eget program, ekte HTTP. */
async function cli(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(['bun', 'scripts/publications-review.ts', ...args], {
    cwd: ROOT,
    env: { ...process.env, REVIEW_TOKEN: TOKEN, BIBLE_URL: base },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out, err };
}

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM devotional_publications WHERE user_id = ${USER}`;
  await sql`DELETE FROM sync_items WHERE user_id = ${USER}`;
}

async function seedDevotional(deleted = false) {
  await getSql()`
    INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
    VALUES (${USER}, 'devotionals', ${ITEM_ID}, ${JSON.stringify({
      id: ITEM_ID,
      slug: 'om-taalmodigheten',
      title: TITLE,
      type: 'andakt',
      updatedAt: 1,
      versions: [{ id: 'v1', content: CONTENT, locked: false }],
    })}, ${Date.now()}, ${deleted})
    ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = VALUES(deleted)
  `;
}

/** Melder inn på nytt — det setter status tilbake til `pending` med samme slug. */
async function submit(): Promise<string> {
  const pub = await submitPublication(USER, ITEM_ID, 'Testforfatter');
  expect(pub).not.toBeNull();
  return pub!.slug;
}

async function statusOf(s: string): Promise<{ status: string; reviewNote: string | null }> {
  const [row] = (await getSql()`
    SELECT status, review_note FROM devotional_publications WHERE slug = ${s}
  `) as { status: string; review_note: string | null }[];
  return { status: row!.status, reviewNote: row!.review_note };
}

const catalogStatus = async (s: string) =>
  (await fetch(`${base}${L(`/manuskripter/katalog/${s}`)}`)).status;

beforeAll(async () => {
  process.env.REVIEW_TOKEN = TOKEN;
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  base = `http://localhost:${server.port}`;
  await ensureSchema(getSql());
  await cleanup();
  await seedDevotional();
  slug = await submit();
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  server?.stop(true);
  delete process.env.REVIEW_TOKEN;
});

describe('køen', () => {
  test('viser innsendingen med adresse, tittel og forfatter', async () => {
    const { code, out } = await cli();
    expect(code).toBe(0);
    expect(out).toContain('Til vurdering');
    expect(out).toContain(slug);
    expect(out).toContain(TITLE);
    expect(out).toContain('Testforfatter');
  });

  test('men bare et UTDRAG av teksten — halen er ikke med', async () => {
    const { out } = await cli();
    expect(out).not.toContain(TAIL);
  });
});

describe('vis', () => {
  test('gir HELE teksten, altså også det køen klipper bort', async () => {
    const { code, out } = await cli('vis', slug);
    expect(code).toBe(0);
    expect(out).toContain(TITLE);
    expect(out).toContain(TAIL);
  });

  test('en adresse som ikke er i køen stopper med feil', async () => {
    const { code, err } = await cli('vis', 'finnes-ikke-xyz123');
    expect(code).not.toBe(0);
    expect(err).toContain('finnes-ikke-xyz123');
  });
});

describe('avgjørelsen', () => {
  test('avvisning UTEN begrunnelse nektes, og lar oppføringen stå urørt', async () => {
    const { code, err } = await cli('avvis', slug);
    expect(code).not.toBe(0);
    expect(err.toLowerCase()).toContain('begrunnelse');
    expect((await statusOf(slug)).status).toBe('pending');
  });

  test('avvisning MED begrunnelse holder den tilbake, og svaret når forfatteren', async () => {
    const { code } = await cli('avvis', slug, 'For mye reklame til å stå i en åpen katalog.');
    expect(code).toBe(0);
    const row = await statusOf(slug);
    expect(row.status).toBe('rejected');
    expect(row.reviewNote).toBe('For mye reklame til å stå i en åpen katalog.');
    expect(await catalogStatus(slug)).toBe(404);
  });

  test('godkjenning legger den UT i katalogen — hele veien, ikke bare i basen', async () => {
    slug = await submit();
    const { code } = await cli('godkjenn', slug);
    expect(code).toBe(0);
    expect(await catalogStatus(slug)).toBe(200);
    expect(await (await fetch(`${base}${L('/manuskripter/katalog')}`)).text()).toContain(TITLE);
  });

  test('en ukjent adresse kan ikke avgjøres', async () => {
    const { code, err } = await cli('godkjenn', 'finnes-ikke-xyz123');
    expect(code).not.toBe(0);
    expect(err).toContain('404');
  });

  test('en ukjent kommando gjør ingenting, høylytt', async () => {
    const { code, err } = await cli('slett', slug);
    expect(code).not.toBe(0);
    expect(err).toContain('Ukjent kommando');
  });
});

describe('den andre køen — rapportert, men fortsatt publisert', () => {
  test('en rapport på noe som står ute dukker opp hos revieweren', async () => {
    await reportPublication(slug);
    const { out } = await cli();
    expect(out).toContain('Rapportert, men fortsatt publisert');
    expect(out).toMatch(new RegExp(`${slug} — 1 rapport`));
  });

  // «Fortsatt publisert» må være SANT. Sletter forfatteren manuskriptet, er
  // oppføringen borte fra katalogen (JOIN-en mot sync_items) — men lå den i
  // denne lista uten samme JOIN, ville revieweren vurdert en tekst ingen leser
  // kan se, og ingen avgjørelse ville fått den ut av køen igjen.
  test('men et SLETTET manuskript er ikke fortsatt publisert', async () => {
    await seedDevotional(true);
    expect(await catalogStatus(slug)).toBe(404);

    const { out } = await cli();
    expect(out).not.toContain(slug);
    await seedDevotional();
  });
});

describe('legitimasjonen', () => {
  // REVIEW.md: «Uten variabelen i env FINNES ikke endepunktene (404).» Da må
  // CLI-en stoppe høylytt — melder den «(tom)» i stedet, ser en feilkonfigurert
  // prod ut som en tom kø, og innsendingene blir liggende for alltid.
  test('mangler TJENESTEN tokenet, stopper CLI-en framfor å melde tom kø', async () => {
    const saved = process.env.REVIEW_TOKEN;
    delete process.env.REVIEW_TOKEN;
    try {
      const { code, out, err } = await cli();
      expect(code).not.toBe(0);
      expect(err).toContain('404');
      expect(out).not.toContain('Til vurdering');
    } finally {
      process.env.REVIEW_TOKEN = saved;
    }
  });

  test('feil token gir 403, ikke en tom kø', async () => {
    const proc = Bun.spawn(['bun', 'scripts/publications-review.ts'], {
      cwd: ROOT,
      env: { ...process.env, REVIEW_TOKEN: 'feil-token', BIBLE_URL: base },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const err = await new Response(proc.stderr).text();
    expect(await proc.exited).not.toBe(0);
    expect(err).toContain('403');
  });
});
