// Ingen godkjent oppføring skal være usynlig (#75).
//
// Katalogen hentet `LIMIT 100` og viste det den fikk. Det finnes ingen side 2,
// enkeltoppføringene ligger ikke i sitemapen (bare lista — #42-lærdommen), og
// sorteringen er nyeste først. Oppføring nummer 101 var altså godkjent,
// publisert og uoppdagbar: forfatteren så «Publisert» med en lenke som virket,
// og ingen leser hadde en vei dit.
//
// VAKTA ER FORMULERT PÅ USYNLIGHETEN, IKKE PÅ TALLET 100. Den seeder flere
// oppføringer enn ÉN side rommer (`CATALOG_PAGE_SIZE`, ikke et tall her),
// GÅR katalogen slik en leser og en crawler gjør — fra rot-adressen, via
// «neste side»-lenka — og krever at hver eneste godkjente oppføring dukker opp
// underveis. Da fanges også en fiks som flytter taket i stedet for å fjerne
// det: er taket 1000 og alt synlig på én side, er invarianten oppfylt; er det
// et tak uten en vei videre, er den brutt uansett hvor taket står.
//
// Utslaget er stille — 200, ingen loggrad, ingen 404 — så det er bare en vakt
// på KONTRAKTEN som kan se det. Samme klasse som #45, #60, #65 og #69.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { CATALOG_PAGE_SIZE, listCatalog } from '../src/lib/publications.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const USER = 990311;
/** Én mer enn én side rommer — men målt i sidestørrelsen, ikke i et tall. */
const SEEDED = CATALOG_PAGE_SIZE + 3;
const CATALOG = L('/manuskripter/katalog');

let app: ReturnType<typeof createApp>;
const slugs: string[] = [];

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM devotional_publications WHERE user_id = ${USER}`;
  await sql`DELETE FROM sync_items WHERE user_id = ${USER}`;
}

/** Alle oppføringene skrives rett i basen — det er LESEVEIEN som testes her. */
async function seed() {
  const sql = getSql();
  const now = Date.now();
  for (let i = 0; i < SEEDED; i++) {
    const itemId = `dev-side-${i}`;
    const slug = `paginering-nr-${i}-t3st${i}`;
    const data = {
      id: itemId,
      slug: `paginering-${i}`,
      title: `Manuskript nummer ${i}`,
      type: 'andakt',
      updatedAt: now,
      versions: [{ id: 'v1', content: `# Manuskript ${i}\n\nEn tekst.`, locked: false }],
    };
    await sql`
      INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
      VALUES (${USER}, 'devotionals', ${itemId}, ${JSON.stringify(data)}, ${now}, 0)
      ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0
    `;
    await sql`
      INSERT INTO devotional_publications
        (slug, user_id, item_id, author_name, title, content, status, submitted_at, decided_at)
      -- SAMME tidspunkt på alle: en reviewer som går gjennom køen godkjenner
      -- flere i samme millisekund, og da er det bare en TOTAL sortering som
      -- holder radene på hver sin side av sideskillet.
      VALUES (${slug}, ${USER}, ${itemId}, 'Testforfatter', ${`Manuskript nummer ${i}`},
              ${`# Manuskript ${i}`}, 'approved', ${now}, ${now})
    `;
    slugs.push(slug);
  }
}

beforeAll(async () => {
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await closeSql();
});

const html = async (path: string) => {
  const res = await app.request(path);
  expect({ path, status: res.status }).toMatchObject({ path, status: 200 });
  return res.text();
};

/** Oppføringene siden faktisk lenker til — slik en crawler ser dem. */
function listedSlugs(page: string): string[] {
  return [...page.matchAll(/href="[^"]*\/manuskripter\/katalog\/([a-z0-9-]+)"/g)].map((m) => m[1]!);
}

/** «Neste side»-lenka, om siden har en. */
function nextHref(page: string): string | null {
  const tag = page.match(/<a\b[^>]*data-pager="next"[^>]*>/)?.[0];
  return tag?.match(/href="([^"]+)"/)?.[1] ?? null;
}

describe('ingen godkjent oppføring er usynlig', () => {
  test('katalogen har flere sider enn én når det er mer enn én side med innhold', async () => {
    const first = await listCatalog(1);
    expect(first.total).toBeGreaterThanOrEqual(SEEDED);
    expect(first.pageCount).toBeGreaterThan(1);
  });

  test('hver eneste oppføring nås ved å GÅ katalogen fra rot-adressen', async () => {
    const seen: string[] = [];
    const visited: string[] = [];
    let path: string | null = CATALOG;

    // Taket er en løpsk-løkke-sikring, ikke en forventning om antall sider.
    for (let guard = 0; path && guard < 500; guard++) {
      visited.push(path);
      const page: string = await html(path);
      const onPage = listedSlugs(page);
      expect({ path, items: onPage.length <= CATALOG_PAGE_SIZE }).toMatchObject({ path, items: true });
      seen.push(...onPage);
      path = nextHref(page);
    }

    expect(path).toBeNull(); // siste side lenker ikke videre
    expect(visited.length).toBe((await listCatalog(1)).pageCount);
    expect(new Set(seen).size).toBe(seen.length); // ingen oppføring listet to ganger

    const missing = slugs.filter((s) => !seen.includes(s));
    expect(missing).toEqual([]);
  });

  test('og siden SIER hvor i katalogen leseren er', async () => {
    const page = await html(CATALOG);
    expect(page).toContain('data-pager="next"');
    expect(page).toContain('Page 1 of ');
  });
});

describe('adressen til en side', () => {
  test('side 2 ligger på en STI, ikke i en query — ellers er den nofollow (#60)', async () => {
    const next = nextHref(await html(CATALOG))!;
    expect(next).toContain('/manuskripter/katalog/side/2');
    expect(next).not.toContain('?');
  });

  test('side 1 har ÉN adresse: den korte', async () => {
    const res = await app.request(L('/manuskripter/katalog/side/1'));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(CATALOG);
  });

  test('en side som ikke finnes er 404, ikke en tom liste med 200', async () => {
    const { pageCount } = await listCatalog(1);
    expect((await app.request(L(`/manuskripter/katalog/side/${pageCount + 1}`))).status).toBe(404);
    expect((await app.request(L('/manuskripter/katalog/side/0'))).status).toBe(404);
    expect((await app.request(L('/manuskripter/katalog/side/abc'))).status).toBe(404);
  });

  test('detaljsiden slukes ikke av sideruta', async () => {
    const res = await app.request(L(`/manuskripter/katalog/${slugs[0]}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Manuskript nummer 0');
  });
});
