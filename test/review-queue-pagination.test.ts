// Ingen innsending skal bli liggende usett eller uavgjørbar bak et tall (#81).
//
// Samme klasse som #75, men på KØEN i stedet for på katalogen, og med en annen
// bruker: revieweren, ikke leseren. `listPendingPublications()` hentet
// `LIMIT 50` og CLI-en skrev «Til vurdering (50)» — et tall som ser ut som hele
// køen. Innsending nummer 51 ble aldri vist, og `vis` slo slugen opp I KØEN, så
// den kunne ikke engang leses med slugen i hånda. En innsending som aldri ses,
// blir aldri godkjent: forfatteren ser «Til vurdering» i det uendelige.
//
// VAKTA ER FORMULERT PÅ USYNLIGHETEN, IKKE PÅ TALLET 50. Den seeder flere
// innsendinger enn ÉN side rommer (`REVIEW_PAGE_SIZE`, ikke et tall her), GÅR
// køen slik revieweren gjør — fra `kø`, via kommandoen skriptet selv skriver ut
// — og krever at hver eneste innsending dukker opp, ingen to ganger, og at den
// som faller UTENFOR første side kan leses og avgjøres. Da består en fiks som
// hever taket like gjerne som en som paginerer, så lenge ingenting er usynlig;
// og et tak uten en vei videre stryker uansett hvor det står.
//
// CLI-en er en EGEN SØM: `publications.test.ts` går inn med `app.request()` og
// ser aldri slug-oppslaget i `scripts/publications-review.ts`. Kommandoene
// kjøres derfor som ekte underprosesser mot en ekte lyttende server, slik
// `REVIEW.md` beskriver dem.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { REVIEW_PAGE_SIZE, listPendingPublications } from '../src/lib/publications.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const USER = 990411;
const TOKEN = 'review-paging-token';
/** Én mer enn én side rommer — men målt i sidelengden, ikke i et tall. */
const SEEDED = REVIEW_PAGE_SIZE + 3;
/** Utdraget i køen er 100 tegn, så halen er det bare `vis` kan vise. */
const PADDING = 'En andakt om å vente på svar, skrevet i god tro og med rikelig innledning. ';
const tail = (i: number) => `HALE-NUMMER-${i}-SOM-KOEN-KLIPPER-BORT`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
const slugs: string[] = [];

const ROOT = new URL('..', import.meta.url).pathname;

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

/** Køen leses, ikke skrives, i denne saken — radene skrives derfor rett i basen. */
async function seed() {
  const sql = getSql();
  const now = Date.now();
  for (let i = 0; i < SEEDED; i++) {
    const itemId = `dev-ko-${i}`;
    const slug = `koside-nr-${String(i).padStart(3, '0')}-t3st`;
    const title = `Innsending nummer ${i}`;
    const content = `# ${title}\n\n${PADDING.repeat(3)}\n\n${tail(i)}`;
    await sql`
      INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
      VALUES (${USER}, 'devotionals', ${itemId}, ${JSON.stringify({
        id: itemId,
        slug: `koside-${i}`,
        title,
        type: 'andakt',
        updatedAt: now,
        versions: [{ id: 'v1', content, locked: false }],
      })}, ${now}, 0)
      ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0
    `;
    await sql`
      INSERT INTO devotional_publications
        (slug, user_id, item_id, author_name, title, content, status, submitted_at)
      -- SAMME tidspunkt på alle: en forfatterflate som melder inn flere, og en
      -- reviewer som avgjør flere, treffer samme millisekund. Da er det bare en
      -- TOTAL sortering som holder radene på hver sin side av sideskillet — en
      -- rad uten innbyrdes rekkefølge kan ellers listes to ganger, eller ingen.
      VALUES (${slug}, ${USER}, ${itemId}, 'Testforfatter', ${title}, ${content}, 'pending', ${now})
    `;
    slugs.push(slug);
  }
}

beforeAll(async () => {
  process.env.REVIEW_TOKEN = TOKEN;
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  base = `http://localhost:${server.port}`;
  await ensureSchema(getSql());
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  server?.stop(true);
  delete process.env.REVIEW_TOKEN;
});

/** Adressene køen faktisk viser fram — slik revieweren leser dem. */
const listedSlugs = (out: string): string[] => [...out.matchAll(/koside-nr-\d+-t3st/g)].map((m) => m[0]);

/** Kommandoen skriptet selv skriver ut for neste side, om det finnes en. */
const nextPage = (out: string): string | null =>
  out.match(/publications-review\.ts\s+(?:kø|ko)\s+(\d+)/)?.[1] ?? null;

/**
 * GÅR køen slik revieweren gjør: `kø`, så kommandoen skriptet skrev ut, til det
 * ikke står flere. Returnerer alt som ble vist underveis.
 */
async function walkQueue(): Promise<{ seen: string[]; pages: number }> {
  const seen: string[] = [];
  let page: string | null = null;
  let pages = 0;

  // Taket er en løpsk-løkke-sikring, ikke en forventning om antall sider.
  for (let guard = 0; guard < 100; guard++) {
    const { code, out } = page === null ? await cli() : await cli('kø', page);
    expect({ page, code }).toMatchObject({ page, code: 0 });
    pages++;
    seen.push(...listedSlugs(out));
    const next: string | null = nextPage(out);
    if (!next) break;
    page = next;
  }
  return { seen, pages };
}

describe('ingen innsending er usett', () => {
  test('køen er lengre enn én side, så det finnes en hale å miste', async () => {
    const { total, pageCount } = await listPendingPublications();
    expect(total).toBeGreaterThanOrEqual(SEEDED);
    expect(pageCount).toBeGreaterThan(1);
  });

  test('hver eneste innsending dukker opp når revieweren GÅR køen', async () => {
    const { seen, pages } = await walkQueue();

    expect(pages).toBe((await listPendingPublications()).pageCount);
    expect(new Set(seen).size).toBe(seen.length); // ingen listet to ganger
    expect(slugs.filter((s) => !seen.includes(s))).toEqual([]);
  });

  test('og tallet køen oppgir er HELE køen, ikke det den rakk å vise', async () => {
    const { out } = await cli();
    const oppgitt = Number(out.match(/Til vurdering \((\d+)/)?.[1]);
    expect(oppgitt).toBe((await listPendingPublications()).total);
    expect(listedSlugs(out).length).toBeLessThan(oppgitt);
  });
});

describe('ingen innsending er uavgjørbar', () => {
  /** Den som faller utenfor første side — valgt av DATAENE, ikke av et tall. */
  async function bakFørsteSide(): Promise<{ slug: string; nr: number }> {
    const førsteSide = listedSlugs((await cli()).out);
    const slug = slugs.find((s) => !førsteSide.includes(s));
    expect(typeof slug).toBe('string');
    const nr = Number(slug!.match(/nr-(\d+)-/)![1]);
    return { slug: slug!, nr };
  }

  test('`vis` gir HELE teksten til en innsending første side ikke viste', async () => {
    const { slug, nr } = await bakFørsteSide();
    const { code, out } = await cli('vis', slug);
    expect({ slug, code }).toMatchObject({ slug, code: 0 });
    expect(out).toContain(`Innsending nummer ${nr}`);
    expect(out).toContain(tail(nr));
  });

  test('og den kan godkjennes hele veien ut i katalogen', async () => {
    const { slug, nr } = await bakFørsteSide();
    expect((await cli('godkjenn', slug)).code).toBe(0);
    const res = await fetch(`${base}${L(`/manuskripter/katalog/${slug}`)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`Innsending nummer ${nr}`);
  });

  test('en adresse som ikke finnes stopper fortsatt høylytt', async () => {
    const { code, err } = await cli('vis', 'finnes-ikke-xyz123');
    expect(code).not.toBe(0);
    expect(err).toContain('finnes-ikke-xyz123');
  });
});

describe('den andre køen — rapportert, men fortsatt publisert', () => {
  test('en hale av rapporterte er like synlig som en hale av ventende', async () => {
    // Alle ut i katalogen, alle rapportert: samme lengde på den andre køen.
    await getSql()`
      UPDATE devotional_publications SET status = 'approved', decided_at = submitted_at, reports = 1
      WHERE user_id = ${USER}
    `;

    const seen: string[] = [];
    let page: string | null = null;
    for (let guard = 0; guard < 100; guard++) {
      const { out } = page === null ? await cli() : await cli('kø', page);
      seen.push(...listedSlugs(out));
      const next: string | null = nextPage(out);
      if (!next) break;
      page = next;
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(slugs.filter((s) => !seen.includes(s))).toEqual([]);
  });
});
