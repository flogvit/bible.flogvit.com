// API-ETS EGNE SVAR SKAL IKKE PEKE PÅ ID-ER API-ET SELV 404-ER (#61)
//
// Sakens overskrift, målt på .com. Persongrafen er ryddet (`person-refs`) og
// adressene med ø/æ/å 301-er (`person-id-normalized`). Den tredje formen i
// sakens egen tabell — `/api/reading-texts/165` fra `/lesetekster/165` — er en
// RAD-ID delt ut som om den var en adresse, og den sto igjen i tre samlinger:
//
//   GET /api/stories              -> [{ "id": 6453, "slug": "abimelek-…" }]
//   GET /api/stories/6453         -> 404
//
// Vakta er formulert på KONTRAKTEN, ikke på de tre samlingene: hver id API-et
// deler ut i en liste skal API-et selv kunne servere, og en ny samling arver
// regelen uten at noen fører den opp.
//
// FEM HALVDELER
// -------------
// REGELEN   — ren logikk: `id` blir adressen, og en udeklarert samling kaster
//             framfor å gjette.
// FORMEN    — leser RUTETABELLEN: hver rute med både liste og detalj må være
//             deklarert (eller ha en begrunnet plass i `UNADDRESSED_ROUTES`),
//             og en deklarasjon uten rute er rød. Ellers kunne API-et vokse
//             fra vakta i stillhet, som skjemaet i #46.
// DATA      — hver eneste oppføring i hver liste bærer adressen som `id`
//             (O(n), uten HTTP), og et DATA-VALGT utvalg hentes faktisk over
//             API-et og gir 200 for RIKTIG oppføring. Bare status hadde bestått
//             av «server hva som helst».
// DETALJEN  — detaljsvaret deler ut sin egen id, og den må selv svare 200.
//             Lista alene ville latt detaljen bære rad-id-en videre.
// GRAFEN    — sakens eget bevis: hver person-id API-et deler ut i `family` og
//             `relatedPersons` finnes i API-ets egen indeks, og de formene som
//             er mest utsatt hentes over API-et.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import {
  API_COLLECTIONS,
  UNADDRESSED_ROUTES,
  withApiId,
  withApiIds,
} from '../src/lib/api-ids.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

/**
 * Innholdsspråket med flest rader. Uten det er `reading_texts` tom (norsk-bare
 * innhold, #26) og halvdelene under måler ingenting for den samlingen.
 */
const LANG = 'nb';

/** Hvor mange elementer per samling som hentes over HTTP. */
const PROBE_LIMIT = 12;

interface Fetched {
  collection: (typeof API_COLLECTIONS)[number];
  items: Record<string, unknown>[];
}

const fetched: Fetched[] = [];

async function json(path: string): Promise<{ status: number; body: unknown }> {
  const res = await app.request(path);
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, body: type.includes('json') ? await res.json() : null };
}

function listOf(body: unknown, listKey: string | null): Record<string, unknown>[] {
  const value = listKey === null ? body : (body as Record<string, unknown>)?.[listKey];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Adressen slik den står i en URL. */
const addr = (item: Record<string, unknown>, key: string) => String(item[key]);

/**
 * Utvalget velges av DATAENE, ikke av hva noen kom på: de formene som ikke er
 * en ren `[a-z0-9-]`-slug er de som kan gå galt i en URL, og først og sist
 * fanger en liste som er sortert slik at bare den ene enden er riktig.
 */
function sample(items: Record<string, unknown>[], key: string): Record<string, unknown>[] {
  const risky = items.filter((i) => !/^[a-z0-9-]+$/.test(addr(i, key)));
  const ends = [items[0], items[items.length - 1]].filter(Boolean) as Record<string, unknown>[];
  const picked: Record<string, unknown>[] = [];
  for (const item of [...ends, ...risky, ...items]) {
    if (picked.length >= PROBE_LIMIT) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

beforeAll(async () => {
  // Uten bokcachen svarer hver rute 500, og «adressen er død» ville vært umulig
  // å skille fra «appen er ødelagt».
  await initBooks();
  for (const collection of API_COLLECTIONS) {
    const { status, body } = await json(`${collection.path}?lang=${LANG}`);
    expect(`${collection.path} -> ${status}`).toBe(`${collection.path} -> 200`);
    fetched.push({ collection, items: listOf(body, collection.listKey) });
  }
});

describe('REGELEN', () => {
  test('`id` blir adressen detaljruta slår opp på', () => {
    const rows = [{ id: 6453, slug: 'abimelek-og-jotams-forbannelse', title: 'Abimelek' }];
    expect(withApiIds('/api/stories', rows)).toEqual([
      { id: 'abimelek-og-jotams-forbannelse', slug: 'abimelek-og-jotams-forbannelse', title: 'Abimelek' },
    ]);
    expect(withApiId('/api/themes', { id: 70, name: 'abraham' })).toEqual({ id: 'abraham', name: 'abraham' });
  });

  test('en udeklarert samling kaster framfor å gjette', () => {
    expect(() => withApiIds('/api/gjetting', [{ id: 1 }])).toThrow(/API_COLLECTIONS/);
  });
});

describe('FORMEN', () => {
  const routes = (app as { routes: { method: string; path: string }[] }).routes;

  /** Samlingene i rutetabellen som HAR både liste og en bar detaljrute. */
  const addressable = new Set<string>();
  {
    const lists = new Set<string>();
    const details = new Set<string>();
    for (const route of routes) {
      if (route.method !== 'GET' && route.method !== 'ALL') continue;
      const parts = route.path.split('/').filter(Boolean);
      if (parts[0] !== 'api' || parts.length < 2) continue;
      const collection = parts[1]!;
      if (parts.length === 2) lists.add(collection);
      // Bare `/api/<samling>/:param` — `/kvn/:id` og `/chapter/:b/:c` er egne
      // oppslag, ikke adressen et listeelement bærer.
      if (parts.length === 3 && parts[2]!.startsWith(':')) details.add(collection);
    }
    for (const c of lists) if (details.has(c)) addressable.add(c);
  }

  test('hver rute med liste OG detalj er deklarert', () => {
    const declared = new Set([
      ...API_COLLECTIONS.map((c) => c.path.replace('/api/', '')),
      ...UNADDRESSED_ROUTES.map((r) => r.collection),
    ]);
    const missing = [...addressable].filter((c) => !declared.has(c));
    expect(missing).toEqual([]);
    // Ellers ville halvdelen bestått av en tom rutetabell.
    expect(addressable.size).toBeGreaterThan(5);
  });

  test('en deklarasjon uten rute er rød', () => {
    for (const collection of API_COLLECTIONS) {
      expect(`${collection.path}: rute finnes`).toBe(
        `${collection.path}: ${addressable.has(collection.path.replace('/api/', '')) ? 'rute finnes' : 'ingen slik rute'}`,
      );
    }
    for (const route of UNADDRESSED_ROUTES) {
      expect(`${route.collection}: rute finnes`).toBe(
        `${route.collection}: ${addressable.has(route.collection) ? 'rute finnes' : 'ingen slik rute'}`,
      );
    }
  });

  test('hver unntatt rute har en begrunnelse', () => {
    for (const route of UNADDRESSED_ROUTES) expect(route.why.length).toBeGreaterThan(20);
  });
});

describe('DATA', () => {
  test('en samling som er tom måler ingenting, og må si hvorfor', () => {
    for (const { collection, items } of fetched) {
      if (items.length > 0) continue;
      expect(`${collection.path}: ${collection.mayBeEmpty ?? 'TOM UTEN GRUNN'}`).toBe(
        `${collection.path}: ${collection.mayBeEmpty ?? ''}`,
      );
    }
    expect(fetched.filter((f) => f.items.length > 0).length).toBeGreaterThan(5);
  });

  test('hver eneste oppføring bærer adressen som `id`', () => {
    for (const { collection, items } of fetched) {
      const wrong = items
        .filter((item) => String(item.id) !== addr(item, collection.addressKey))
        .slice(0, 5)
        .map((item) => `${collection.path}: id=${String(item.id)} men ${collection.addressKey}=${addr(item, collection.addressKey)}`);
      expect(wrong).toEqual([]);
    }
  });

  test('id-en API-et delte ut henter RIKTIG oppføring', async () => {
    let probed = 0;
    for (const { collection, items } of fetched) {
      const picked = sample(items, collection.addressKey);
      if (items.length > picked.length) {
        console.log(`  ${collection.path}: hentet ${picked.length} av ${items.length} over HTTP`);
      }
      // Et utvalg som ikke plukker noe måler ingenting.
      expect(`${collection.path}: ${picked.length > 0 || items.length === 0}`).toBe(`${collection.path}: true`);
      probed += picked.length;
      for (const item of picked) {
        const id = String(item.id);
        const { status, body } = await json(`${collection.path}/${encodeURIComponent(id)}?lang=${LANG}`);
        expect(`${collection.path}/${id} -> ${status}`).toBe(`${collection.path}/${id} -> 200`);
        // Bare status hadde bestått av en rute som serverer hva som helst.
        const one = Array.isArray(body) ? (body[0] as Record<string, unknown>) : (body as Record<string, unknown>);
        expect(`${collection.path}/${id}: ${addr(one, collection.addressKey)}`).toBe(
          `${collection.path}/${id}: ${addr(item, collection.addressKey)}`,
        );
      }
    }
    expect(probed).toBeGreaterThan(20);
  });
});

describe('DETALJEN', () => {
  test('detaljsvarets egen id svarer 200', async () => {
    let roundTrips = 0;
    for (const { collection, items } of fetched) {
      for (const item of sample(items, collection.addressKey).slice(0, 4)) {
        const first = await json(`${collection.path}/${encodeURIComponent(String(item.id))}?lang=${LANG}`);
        const one = Array.isArray(first.body)
          ? (first.body[0] as Record<string, unknown>)
          : (first.body as Record<string, unknown>);
        if (one?.id === undefined) continue; // detaljen deler ikke ut en id
        const again = await json(`${collection.path}/${encodeURIComponent(String(one.id))}?lang=${LANG}`);
        expect(`${collection.path}/${String(one.id)} -> ${again.status}`).toBe(
          `${collection.path}/${String(one.id)} -> 200`,
        );
        roundTrips++;
      }
    }
    // Uten dette ville «detaljen deler ikke ut en id» gjort halvdelen til pynt.
    expect(roundTrips).toBeGreaterThan(10);
  });
});

describe('GRAFEN', () => {
  test('hver person-id API-et deler ut finnes i API-ets egen indeks', async () => {
    const { body } = await json(`/api/persons?lang=${LANG}`);
    const persons = (Array.isArray(body) ? body : []) as Record<string, unknown>[];
    expect(persons.length).toBeGreaterThan(100);
    const known = new Set(persons.map((p) => String(p.id)));

    const edgesOf = (p: Record<string, unknown>): string[] => {
      const family = (p.family ?? {}) as Record<string, unknown>;
      const flat = [
        family.father,
        family.mother,
        family.spouse,
        ...((family.siblings as unknown[]) ?? []),
        ...((family.children as unknown[]) ?? []),
        ...((p.relatedPersons as unknown[]) ?? []),
      ];
      return flat.filter((v): v is string => typeof v === 'string' && v !== '');
    };

    const dead: string[] = [];
    const targets = new Set<string>();
    for (const person of persons) {
      for (const edge of edgesOf(person)) {
        targets.add(edge);
        if (!known.has(edge)) dead.push(`${String(person.id)} -> ${edge}`);
      }
    }
    expect(targets.size).toBeGreaterThan(100);
    expect(dead.slice(0, 10)).toEqual([]);

    // De formene som ikke er en ren slug er de saken er meldt på
    // (`jisreel-hoseas-sønn`, `na'ama`) — de hentes faktisk.
    const risky = [...targets].filter((id) => !/^[a-z0-9-]+$/.test(id)).slice(0, PROBE_LIMIT);
    const plain = [...targets].slice(0, PROBE_LIMIT);
    for (const id of [...new Set([...risky, ...plain])]) {
      const res = await app.request(`/api/persons/${encodeURIComponent(id)}?lang=${LANG}`);
      expect(`${id} -> ${res.status}`).toBe(`${id} -> 200`);
    }
  });
});
