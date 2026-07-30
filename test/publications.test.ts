// Åpen katalog for manuskripter (GitHub #15, del 2) — ekte lokal MySQL
// (DBngin :3312, .env) + mock-konto. Rydder etter seg på user_id.
//
// Kontrakten som testes er en REVIEW-kontrakt, ikke bare et CRUD-API:
//
//   - Ingenting vises før noen har godkjent det. En `pending` oppføring skal
//     ikke kunne nås av noen som gjetter slugen.
//   - Teksten som vises er ØYEBLIKKSBILDET som ble godkjent. Redigerer
//     forfatteren manuskriptet etterpå, endres ikke katalogen — ellers ville
//     godkjenningen vært en vaskeritjeneste for hva som helst.
//   - Ny innsending går tilbake til `pending`, også for noe som var godkjent.
//   - Å trekke tilbake virker umiddelbart, og sletting av manuskriptet fjerner
//     oppføringen selv om teksten ligger frosset i tabellen.
//   - Rapportering krever ingen konto og skjuler ingenting av seg selv.
//   - Review-endepunktene FINNES IKKE uten REVIEW_TOKEN i env.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { getSql, closeSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import { publicationSlug } from '../src/lib/publications.ts';
import { L } from './paths.ts';

const PLUS_USER = 990301;
const FREE_USER = 990302;
const ITEM_ID = 'dev-katalog-test';
const TOKEN = 'review-token-for-test';

let mock: ReturnType<typeof Bun.serve>;
let app: ReturnType<typeof createApp>;

const PLUS = { cookie: 'fv-session=kat-plus', 'content-type': 'application/json' };
const FREE = { cookie: 'fv-session=kat-free', 'content-type': 'application/json' };
const REVIEW = { 'x-review-token': TOKEN, 'content-type': 'application/json' };

const devotional = (content: string) => ({
  id: ITEM_ID,
  slug: 'katalog-andakt',
  title: 'Om håpet i Romerbrevet',
  type: 'andakt',
  updatedAt: 1,
  versions: [{ id: 'v1', content, locked: false }],
});

const GODKJENT_TEKST = '# Om håpet\n\nEn andakt over [ref:Rom 5,1-5].';

async function cleanup() {
  const sql = getSql();
  for (const id of [PLUS_USER, FREE_USER]) {
    await sql`DELETE FROM devotional_publications WHERE user_id = ${id}`;
    await sql`DELETE FROM sync_items WHERE user_id = ${id}`;
  }
}

async function seedDevotional(userId: number, content = GODKJENT_TEKST, deleted = false) {
  await getSql()`
    INSERT INTO sync_items (user_id, data_type, item_id, data, updated_at, deleted)
    VALUES (${userId}, 'devotionals', ${ITEM_ID}, ${JSON.stringify(devotional(content))}, ${Date.now()}, ${deleted})
    ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = VALUES(deleted)
  `;
}

/**
 * Sender inn og KREVER at det gikk bra når vi bruker plus-brukeren — ellers
 * dukker feilen opp som en forvirrende 400 lenger nede (en oppbrukt rate-limit
 * ga `slug: undefined` inn i /decide).
 */
async function submit(headers = PLUS): Promise<{ status: number; slug?: string; state?: string }> {
  const res = await app.request('/api/publications', {
    method: 'POST',
    headers,
    body: JSON.stringify({ itemId: ITEM_ID }),
  });
  if (!res.ok) {
    if (headers === PLUS) expect({ status: res.status, body: await res.text() }).toMatchObject({ status: 200 });
    return { status: res.status };
  }
  const { publication } = (await res.json()) as { publication: { slug: string; status: string } };
  return { status: res.status, slug: publication.slug, state: publication.status };
}

async function decide(slug: string, status: 'approved' | 'rejected', note?: string) {
  const res = await app.request('/api/publications/decide', {
    method: 'POST',
    headers: REVIEW,
    body: JSON.stringify({ slug, status, note }),
  });
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  mock = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      const user = (id: number, plus: boolean) =>
        Response.json({
          user: { id, email: `kat-${id}@flogvit.com`, displayName: 'Katalog-test', verified: true, plus, plusUntil: null },
          csrf: 'csrf',
        });
      if (cookie.includes('fv-session=kat-plus')) return user(PLUS_USER, true);
      if (cookie.includes('fv-session=kat-free')) return user(FREE_USER, false);
      return Response.json({ user: null });
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${mock.port}`;
  process.env.REVIEW_TOKEN = TOKEN;
  app = createApp();
  await ensureSchema(getSql());
  await cleanup();
  await seedDevotional(PLUS_USER);
});

afterAll(async () => {
  await cleanup();
  await closeSql();
  mock.stop(true);
  delete process.env.REVIEW_TOKEN;
});

describe('publicationSlug', () => {
  test('lesbar tittel + tilfeldig hale, uten æøå', () => {
    const slug = publicationSlug('Om håpet i Romerbrevet', new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(slug).toMatch(/^om-haapet-i-romerbrevet-[a-z0-9]{6}$/);
  });

  test('to like titler gir ULIKE adresser', () => {
    expect(publicationSlug('Samme tittel')).not.toBe(publicationSlug('Samme tittel'));
  });

  test('en tittel uten brukbare tegn gir fortsatt en adresse', () => {
    expect(publicationSlug('!!! ???').length).toBeGreaterThan(0);
  });
});

describe('forfatterens side', () => {
  test('krever innlogging', async () => {
    const res = await app.request('/api/publications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: ITEM_ID }),
    });
    expect(res.status).toBe(401);
  });

  test('krever plus — publisering forutsetter at manuskriptet er lagret', async () => {
    await seedDevotional(FREE_USER);
    expect((await submit(FREE)).status).toBe(402);
  });

  test('et manuskript brukeren ikke har gir 404', async () => {
    const res = await app.request('/api/publications', {
      method: 'POST',
      headers: PLUS,
      body: JSON.stringify({ itemId: 'dev-finnes-ikke' }),
    });
    expect(res.status).toBe(404);
  });

  test('innsending starter som «til vurdering»', async () => {
    const { state } = await submit();
    expect(state).toBe('pending');
  });

  test('to innsendinger gir SAMME adresse — en delt lenke skal ikke dø av en retting', async () => {
    const first = await submit();
    expect((await submit()).slug).toBe(first.slug);
  });
});

describe('katalogen viser bare det som er godkjent', () => {
  test('ventende oppføring er 404 selv med riktig slug', async () => {
    const { slug } = await submit();
    const res = await app.request(L(`/manuskripter/katalog/${slug}`));
    expect(res.status).toBe(404);
  });

  test('avvist oppføring er 404 — samme svar som ukjent', async () => {
    const { slug } = await submit();
    await decide(slug!, 'rejected', 'Ikke et manuskript.');
    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(404);
  });

  test('godkjent oppføring vises, med tittel og tekst', async () => {
    const { slug } = await submit();
    await decide(slug!, 'approved');
    const res = await app.request(L(`/manuskripter/katalog/${slug}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Om håpet i Romerbrevet');
    expect(html).toContain('En andakt over');
  });

  test('og den står i lista', async () => {
    const html = await (await app.request(L('/manuskripter/katalog'))).text();
    expect(html).toContain('Om håpet i Romerbrevet');
  });

  // Rutas rekkefølge: /manuskripter/:slug i user.tsx ville slukt katalogen, og
  // da hadde katalogen stille blitt brukerens egen manuskriptside.
  test('katalogen slukes ikke av /manuskripter/:slug', async () => {
    // Norsk med vilje: da er overskriften en verdi bare katalogsiden har.
    const html = await (await app.request('/nb/manuskripter/katalog')).text();
    expect(html).not.toContain('data-user-page="devotional-view"');
    expect(html).toContain('Manuskriptkatalogen');
  });
});

describe('øyeblikksbildet', () => {
  test('redigering etter godkjenning endrer IKKE den publiserte teksten', async () => {
    const { slug } = await submit();
    await decide(slug!, 'approved');
    await seedDevotional(PLUS_USER, '# Kjøp billige klokker\n\nSpam.');

    const html = await (await app.request(L(`/manuskripter/katalog/${slug}`))).text();
    expect(html).toContain('En andakt over');
    expect(html).not.toContain('Kjøp billige klokker');
  });

  test('ny innsending går tilbake til vurdering, og teksten forsvinner fra katalogen', async () => {
    const { slug, state } = await submit();
    expect(state).toBe('pending');
    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(404);
    await seedDevotional(PLUS_USER); // tilbake til den ekte teksten
  });
});

describe('tilbaketrekking og sletting', () => {
  test('forfatteren kan trekke oppføringen, og adressen dør', async () => {
    const { slug } = await submit();
    await decide(slug!, 'approved');
    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(200);

    const res = await app.request(`/api/publications/${ITEM_ID}`, { method: 'DELETE', headers: PLUS });
    expect(res.status).toBe(200);
    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(404);
  });

  test('slettet manuskript forsvinner fra katalogen, selv om teksten ligger frosset', async () => {
    const { slug } = await submit();
    await decide(slug!, 'approved');
    await seedDevotional(PLUS_USER, GODKJENT_TEKST, true);

    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(404);
    const html = await (await app.request(L('/manuskripter/katalog'))).text();
    expect(html).not.toContain('Om håpet i Romerbrevet');
    await seedDevotional(PLUS_USER);
  });

  test('detaljsiden er utenfor mikrocachen — tilbaketrekking må virke med en gang', async () => {
    const { slug } = await submit();
    await decide(slug!, 'approved');
    const first = await app.request(L(`/manuskripter/katalog/${slug}`));
    expect(first.headers.get('x-cache')).not.toBe('HIT');
    await app.request(L(`/manuskripter/katalog/${slug}`));

    await app.request(`/api/publications/${ITEM_ID}`, { method: 'DELETE', headers: PLUS });
    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(404);
  });
});

describe('rapportering', () => {
  test('krever ingen konto, og svarer likt for ukjent slug', async () => {
    const kjent = await app.request('/api/publications/report/finnes-ikke', { method: 'POST' });
    expect(kjent.status).toBe(200);
  });

  test('en rapport skjuler ingenting av seg selv', async () => {
    const { slug } = await submit();
    await decide(slug!, 'approved');
    await app.request(`/api/publications/report/${slug}`, { method: 'POST' });
    expect((await app.request(L(`/manuskripter/katalog/${slug}`))).status).toBe(200);
  });

  test('men den havner i reviewerens andre kø', async () => {
    const res = await app.request('/api/publications/pending', { headers: REVIEW });
    const { reported } = (await res.json()) as { reported: { slug: string; reports: number }[] };
    expect(reported.some((r) => r.reports > 0)).toBe(true);
  });
});

describe('review-endepunktene', () => {
  test('feil token gir 403', async () => {
    const res = await app.request('/api/publications/pending', { headers: { 'x-review-token': 'feil' } });
    expect(res.status).toBe(403);
  });

  test('uten REVIEW_TOKEN i env FINNES de ikke', async () => {
    const saved = process.env.REVIEW_TOKEN;
    delete process.env.REVIEW_TOKEN;
    const res = await app.request('/api/publications/pending', { headers: REVIEW });
    expect(res.status).toBe(404);
    process.env.REVIEW_TOKEN = saved;
  });

  test('køen er eldste først, og bærer teksten som skal vurderes', async () => {
    await app.request(`/api/publications/${ITEM_ID}`, { method: 'DELETE', headers: PLUS });
    await submit();
    const res = await app.request('/api/publications/pending', { headers: REVIEW });
    const { pending } = (await res.json()) as { pending: { title: string; content: string }[] };
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0]!.content).toContain('En andakt over');
  });

  test('ukjent slug kan ikke avgjøres', async () => {
    const res = await app.request('/api/publications/decide', {
      method: 'POST',
      headers: REVIEW,
      body: JSON.stringify({ slug: 'finnes-ikke', status: 'approved' }),
    });
    expect(res.status).toBe(404);
  });

  test('bare approved/rejected godtas', async () => {
    const res = await app.request('/api/publications/decide', {
      method: 'POST',
      headers: REVIEW,
      body: JSON.stringify({ slug: 'uansett', status: 'published' }),
    });
    expect(res.status).toBe(400);
  });
});
