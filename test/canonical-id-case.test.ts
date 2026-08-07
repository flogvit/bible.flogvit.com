// ÉN PERSON, ÉN ADRESSE — KOLLASJONEN AKSEPTERER FLERE SKRIVEMÅTER (#49)
//
// `persons.name` og `stories.slug` har kollasjonen `utf8mb4_danish_ci`, altså
// både case- og aksent-insensitiv. Oppslaget svarer derfor 200 på skrivemåter
// id-en aldri har hatt:
//
//   200  /fr/personer/oholibama      <- den ekte
//   200  /fr/personer/Oholibama
//   200  /fr/personer/OHOLIBAMA
//   200  /fr/personer/óholibama
//
// Det alene ville vært ufarlig om sida pekte tilbake på ÉN adresse. Den gjorde
// ikke det: canonical ekkoet den FORESPURTE skrivemåten, så hver variant
// erklærte seg selv som en selvstendig side. Målt i prod: 339 unike slike
// URL-er i ett døgn, hentet av Amazonbot, GPTBot og Googlebot — altså tre
// indekser som splitter rangeringssignalene mellom duplikatene.
//
// Og asymmetrien er verre enn duplikatene. Alt ANNET i ruta behandler id-en som
// eksakt små bokstaver, deriblant `PERSON_ID_ALIASES` — et rent JS-oppslag, og
// dermed case-SENSITIVT. En versal variant av en VANLIG person svarte 200,
// mens en versal variant av en ALIAS-id svarte 404:
//
//   301  /en/personer/enkens-snn-fra-nain   ->  …/enkens-sonn-fra-nain
//   404  /en/personer/Enkens-Snn-Fra-Nain
//
// altså nøyaktig de 66 adressene tabellen ble skrevet for å redde (#61,
// free-bible#25): «en URL som har svart 200 skal ikke bare forsvinne».
//
// SANNHETEN ER RADEN, IKKE EN OMSKRIVING
// --------------------------------------
// Vakta krever ikke en bestemt normalisering i JS. Den krever at hver
// skrivemåte KOLLASJONEN selv aksepterer ender på radens egen skrivemåte —
// altså `persons.name`/`stories.slug`, den #61 alt har utpekt som sannheten.
// En fiks som folder på en annen måte enn `danish_ci` består like gjerne, så
// lenge ingen fremmed skrivemåte blir stående som en side.
//
// SEKS HALVDELER
// --------------
// REGELEN     — ren logikk: foldingen speiler kollasjonen (case og latinske
//               aksenter foldes, æ/ø/å er EGNE bokstaver i dansk sortering og
//               foldes ikke — det er derfor #61 trengte translittereringen).
// DUPLIKATENE — adressene velges av DATAENE (som #70, #80 og #84): en variant
//               er bare med når basen FAKTISK svarer på den. Hver av dem må
//               301-e til den ene kanoniske adressen.
// CANONICAL   — sida bak peker på seg selv, og ingen variant får svare 200 med
//               sin egen skrivemåte i canonical. Det er symptomet ordrett.
// ALIASENE    — symptom 2: en versal alias-id skal ende der den lille enden,
//               målt mot hverandre framfor mot en fasit, så vakta ikke er
//               avhengig av hvilke personer basen har i dag.
// FLATENE     — sida og API-et gir samme svar på samme adresse (#61s egen
//               regel: «samme adresse, samme app, to svar» var hele defekten).
// GJETTER     — den kanoniske skrivemåten redirecter ALDRI (ellers ville «301
//               på alt» bestått), ingen redirect ender i en 404, og en adresse
//               vi ikke har er fortsatt død.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { href } from '../src/lib/i18n.ts';
import { absoluteUrl } from '../src/lib/site-url.ts';
import { PERSON_ID_ALIASES } from '../src/lib/person-id-aliases.ts';
import { foldId } from '../src/lib/canonical-id.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const db = () => getSql();

/**
 * De to flatene saken gjelder. `historier` har ingen alias-tabell — der finnes
 * bare duplikatene — men kollasjonen er den samme, og fiksen skal ligge et sted
 * begge deler.
 */
const SURFACES = [
  {
    name: 'personer',
    table: 'persons',
    column: 'name',
    page: (id: string) => `/personer/${id}`,
    api: (id: string) => `/api/persons/${id}`,
  },
  {
    name: 'historier',
    table: 'stories',
    column: 'slug',
    page: (id: string) => `/historier/${id}`,
    api: (id: string) => `/api/stories/${id}`,
  },
] as const;

type Surface = (typeof SURFACES)[number];

/**
 * Hvor mange oppføringer per flate som måles. En full sveip er 2029 personer +
 * 1357 historier × tre skrivemåter, altså titusener av renderinger — utvalget
 * er derfor et DETERMINISTISK spredt snitt, og det sies her framfor å se ut som
 * full dekning. Skrivemåtene under er ikke et utvalg: hver eneste variant
 * kollasjonen aksepterer måles.
 */
const SAMPLE = 6;

/** Skrivemåter av samme id som kollasjonen kan tenkes å akseptere. */
function spellings(id: string): string[] {
  const accents: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
  const out = new Set<string>([
    id.toUpperCase(),
    id.replace(/(^|-)([a-zæøå])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase()),
    id.replace(/[aeiou]/, (ch) => accents[ch]!),
  ]);
  out.delete(id);
  return [...out];
}

interface Duplicate {
  surface: Surface;
  canonical: string;
  spelling: string;
}

const duplicates: Duplicate[] = [];

beforeAll(async () => {
  // Uten bokcachen svarer hver siderute 500, og «adressen er død» ville vært
  // umulig å skille fra «sida er ødelagt».
  await initBooks();

  for (const surface of SURFACES) {
    const rows = (await db().unsafe(
      `SELECT ${surface.column} AS id FROM ${surface.table} WHERE language = 'nb' ORDER BY ${surface.column}`,
    )) as { id: string }[];
    const ids = [...new Set(rows.map((r) => r.id))];
    if (ids.length === 0) continue;

    const step = Math.max(1, Math.floor(ids.length / SAMPLE));
    const sample = Array.from({ length: Math.min(SAMPLE, ids.length) }, (_, i) => ids[i * step]!);

    for (const canonical of sample) {
      for (const spelling of spellings(canonical)) {
        // Bare skrivemåter basen FAKTISK svarer på. En variant kollasjonen
        // avviser er ikke et duplikat, og skal fortsatt 404-e.
        const hit = (await db().unsafe(
          `SELECT ${surface.column} AS id FROM ${surface.table} WHERE ${surface.column} = ? AND language = 'nb' LIMIT 1`,
          [spelling],
        )) as { id: string }[];
        if (hit[0]?.id === canonical) duplicates.push({ surface, canonical, spelling });
      }
    }
  }
});

/** Følger redirect-kjeden og gir adressen og statusen den ender på. */
async function follow(url: string): Promise<{ url: string; status: number }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await app.request(current);
    if (res.status !== 301 && res.status !== 302) return { url: current, status: res.status };
    current = res.headers.get('location') ?? '';
  }
  throw new Error(`redirect-løkke fra ${url}`);
}

describe('REGELEN: foldingen speiler kollasjonen', () => {
  test('store bokstaver foldes', () => {
    expect(foldId('Oholibama')).toBe('oholibama');
    expect(foldId('OHOLIBAMA')).toBe('oholibama');
    expect(foldId('Korah-Esaus-Snn-Med-Oholibama')).toBe('korah-esaus-snn-med-oholibama');
  });

  test('latinske aksenter foldes, som i danish_ci', () => {
    expect(foldId('óholibama')).toBe('oholibama');
    expect(foldId('ohólibama')).toBe('oholibama');
  });

  test('æ, ø og å er EGNE bokstaver og foldes IKKE', () => {
    // Det er nettopp derfor #61 trengte translittereringen ved siden av: basen
    // matcher ikke `jisreel-hoseas-sønn` mot `jisreel-hoseas-sonn`.
    expect(foldId('jisreel-hoseas-sønn')).toBe('jisreel-hoseas-sønn');
    expect(foldId('Ananias-Øversteprest')).toBe('ananias-øversteprest');
    expect(foldId('nærmest-våt')).toBe('nærmest-våt');
  });

  test('alias-kartet slår opp på den foldede nøkkelen', () => {
    const [old, next] = Object.entries(PERSON_ID_ALIASES)[0]!;
    expect(PERSON_ID_ALIASES[foldId(old.toUpperCase())]).toBe(next);
  });
});

describe('DUPLIKATENE: hver skrivemåte kollasjonen godtar ender på ÉN adresse', () => {
  test('det FINNES slike skrivemåter å måle på', () => {
    // Uten denne ville sveipene under bestått på en tom liste.
    expect(
      duplicates.length,
      'ingen duplikat-skrivemåte utledet av dataene — kjør `bun scripts/import-bible.ts`',
    ).toBeGreaterThan(0);
    for (const surface of SURFACES) {
      expect(
        duplicates.some((d) => d.surface.name === surface.name),
        `ingen målt skrivemåte for /${surface.name}`,
      ).toBe(true);
    }
  });

  test('sida 301-er til den kanoniske adressen', async () => {
    const bad: string[] = [];
    for (const { surface, canonical, spelling } of duplicates) {
      const res = await app.request(href('nb', surface.page(spelling)));
      const location = res.headers.get('location');
      if (res.status !== 301 || location !== href('nb', surface.page(canonical))) {
        bad.push(`${surface.page(spelling)} -> ${res.status} ${location ?? ''}`);
      }
    }
    expect(bad, `${bad.length} av ${duplicates.length} skrivemåter er egne sider:\n${bad.join('\n')}`).toEqual([]);
  });

  test('redirecten beholder locale-en leseren står på', async () => {
    const { surface, canonical, spelling } = duplicates[0]!;
    const res = await app.request(href('de', surface.page(spelling)));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(href('de', surface.page(canonical)));
  });
});

describe('CANONICAL: ingen fremmed skrivemåte blir stående som en side', () => {
  test('sida bak peker på seg selv', async () => {
    const bad: string[] = [];
    for (const { surface, canonical } of duplicates) {
      const path = href('nb', surface.page(canonical));
      const res = await app.request(path);
      const html = await res.text();
      const link = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (res.status !== 200 || link !== absoluteUrl(path)) bad.push(`${path} -> ${res.status} ${link ?? '(ingen)'}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('en fremmed skrivemåte svarer aldri 200 med sin EGEN canonical', async () => {
    // Symptomet ordrett: `curl …/personer/Oholibama | grep canonical` ga
    // `href="…/personer/Oholibama"`, altså «dette er en selvstendig side».
    const bad: string[] = [];
    for (const { surface, spelling } of duplicates) {
      const path = href('nb', surface.page(spelling));
      const res = await app.request(path);
      if (res.status !== 200) continue;
      const link = (await res.text()).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (link === absoluteUrl(path)) bad.push(path);
    }
    expect(bad, `${bad.length} skrivemåter selv-kanonikaliserer:\n${bad.join('\n')}`).toEqual([]);
  });
});

describe('ALIASENE: en versal alias-id ender der den lille ender (symptom 2)', () => {
  const entries = Object.keys(PERSON_ID_ALIASES);

  test('over API-et, for hver eneste oppføring i kartet', async () => {
    const bad: string[] = [];
    for (const old of entries) {
      const variant = old.replace(/(^|-)([a-zæøå])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
      if (variant === old) continue;
      const exact = await follow(`/api/persons/${encodeURIComponent(old)}`);
      const cased = await follow(`/api/persons/${encodeURIComponent(variant)}`);
      if (cased.status !== exact.status || cased.url !== exact.url) {
        bad.push(`${variant} -> ${cased.status} ${cased.url} (${old} -> ${exact.status} ${exact.url})`);
      }
    }
    expect(bad, `${bad.length} av ${entries.length} alias-id-er svarer ulikt på skrivemåten:\n${bad.join('\n')}`).toEqual(
      [],
    );
  });

  test('sakens eget eksempel ender hos personen, ikke i en 404', async () => {
    const cased = await follow(href('fr', '/personer/Korah-Esaus-snn-med-oholibama'));
    expect(cased.status).toBe(200);
    expect(cased.url).toBe(href('fr', '/personer/korah-esaus-sonn-med-oholibama'));
  });

  test('og de tre andre målte formene gjør det samme', async () => {
    for (const form of [
      'Abinadab-Isais-Snn-Bror-Av-David',
      'Enkens-Snn-Fra-Nain',
      'Jeusj-Snn-Av-Esau',
    ]) {
      const { status } = await follow(href('en', `/personer/${form}`));
      expect(status, form).toBe(200);
    }
  });
});

describe('FLATENE: API-et svarer som sida', () => {
  test('en fremmed skrivemåte 301-er også over API-et', async () => {
    const bad: string[] = [];
    for (const { surface, canonical, spelling } of duplicates) {
      const res = await app.request(surface.api(encodeURIComponent(spelling)));
      const location = res.headers.get('location');
      if (res.status !== 301 || location !== surface.api(canonical)) {
        bad.push(`${surface.api(spelling)} -> ${res.status} ${location ?? ''}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('API-redirecten beholder ?lang=, ellers svarer neste kall på gulvspråket', async () => {
    const { surface, canonical, spelling } = duplicates[0]!;
    const res = await app.request(`${surface.api(encodeURIComponent(spelling))}?lang=nb`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${surface.api(canonical)}?lang=nb`);
  });
});

describe('GJETTER ALDRI', () => {
  test('den kanoniske skrivemåten redirecter ikke', async () => {
    // Uten denne ville «301 til lowercase alltid» bestått alt over.
    const bad: string[] = [];
    for (const { surface, canonical } of duplicates) {
      const page = await app.request(href('nb', surface.page(canonical)));
      const api = await app.request(surface.api(canonical));
      if (page.status !== 200) bad.push(`side ${surface.page(canonical)} -> ${page.status}`);
      if (api.status !== 200) bad.push(`api ${surface.api(canonical)} -> ${api.status}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('ingen redirect ender i en 404 — en 301 til en 404 er ingen fiks', async () => {
    const bad: string[] = [];
    for (const { surface, spelling } of duplicates) {
      const { url, status } = await follow(href('nb', surface.page(spelling)));
      if (status !== 200) bad.push(`${surface.page(spelling)} -> ${status} ${url}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  test('en skrivemåte vi ikke har er fortsatt død', async () => {
    for (const path of [
      href('nb', '/personer/En-Person-Vi-Ikke-Har'),
      href('nb', '/historier/En-Historie-Vi-Ikke-Har'),
    ]) {
      expect((await app.request(path)).status, path).toBe(404);
    }
    expect((await app.request('/api/persons/En-Person-Vi-Ikke-Har')).status).toBe(404);
    expect((await app.request('/api/stories/En-Historie-Vi-Ikke-Har')).status).toBe(404);
  });
});
