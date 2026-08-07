// EN ADRESSE MED ø/æ/å SKAL FØRE TIL PERSONEN, IKKE TIL 404 (#61)
//
// Saken er meldt på .no og har to halvdeler. Datagrafen — at API-ets eget svar
// annonserer en id API-et selv ikke kan servere — er ryddet på .com av
// `prunePersonRefs()` (#61), og målt ren av prod-vakten 2026-08-04: 0 døde mål
// i 2029 personer. Den ANDRE halvdelen er adressen selv:
//
//   GET /api/persons/jisreel-hoseas-s%C3%B8nn   -> 404   (før denne fiksen)
//   GET /api/persons/jisreel-hoseas-sonn        -> 200
//
// Det er sakens egen overskrift, målt på .com. Ryddingen RETTET pekerne våre;
// den kunne ikke gjøre noe med de adressene som alt er publisert. Og de er
// publisert: `.no` lenker dem fra 1184 av sine 1771 personsider, de ligger i
// søkeindeksene, og `johannes-døperen` er dessuten formen et menneske SKRIVER.
//
// Saken spør selv: «Avklar om ø/æ/å i person-id er ment å finnes i det hele
// tatt.» Svaret er nei — ingen av de 4058 radene i `persons` har et tegn utenfor
// `[a-z0-9-]`, og free-bibles `nameToId` translittererer nå før NFD. Da er
// feilen i OPPSLAGET for alt som alt er delt ut, og svaret er 301 og ikke 404 —
// nøyaktig samme argument som `PERSON_ID_ALIASES` allerede står på: en URL som
// har vært offentlig skal ikke bare forsvinne.
//
// VAKTA HAR FIRE HALVDELER
// ------------------------
// REGELEN  — ren logikk: formen translittereres, og en id som alt er kanonisk
//            gir ingen kandidat (ellers ville hver eneste oppslag redirectet).
// DATA     — adressene velges av DATAENE, som i #70, #80 og #84: for hver
//            person bygges den formen kilden ville gitt UTEN translitterering
//            (visningsnavnet med æ/ø/å i behold), og bare der den normaliserer
//            tilbake til nettopp denne personen. En hardkodet liste ville målt
//            de tilfellene noen kom på; en ny innholdsrunde flytter denne selv.
// FLATENE  — begge, som i #61: sida og API-et skal gi SAMME svar på samme
//            adresse. Det var hele defekten sist.
// GJETTER  — den gjetter aldri. Normaliserer adressen til noe vi ikke har,
//            404-er den som før; `josef` blir ikke til en av de elleve
//            `josef-*` (#61s egen avgjørelse, og den står).

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { href } from '../src/lib/i18n.ts';
import { PERSON_ID_ALIASES, normalizePersonId, normalizedPersonId } from '../src/lib/person-id-aliases.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const db = () => getSql();

/**
 * Slugen kilden gir NÅR den ikke translittererer — altså formen som ligger ute:
 * `Jisreel (Hoseas sønn)` → `jisreel-hoseas-sønn`. Samme kjede som
 * `normalizePersonId`, bare uten æ/ø/å-leddet.
 */
function nordicSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9æøå]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** En publisert adresse med ø/æ/å, og personen den hører til. */
interface NordicAddress {
  address: string;
  canonical: string;
}

let addresses: NordicAddress[] = [];

beforeAll(async () => {
  // Bokcachen må stå før en side kan rendres — uten den svarer hver rute 500,
  // og «adressen er død» ville vært umulig å skille fra «sida er ødelagt».
  await initBooks();

  const rows = (await db()`
    SELECT name, JSON_UNQUOTE(JSON_EXTRACT(content, '$.name')) AS display FROM persons
  `) as { name: string; display: string | null }[];

  const found = new Map<string, string>();
  for (const row of rows) {
    if (!row.display) continue;
    const slug = nordicSlug(row.display);
    if (slug === row.name) continue;
    if (!/[æøå]/.test(slug)) continue;
    // Bare der translittereringen fører TILBAKE til nettopp denne personen.
    // Ellers er det ikke den samme adressen skrevet annerledes, og da skal den
    // fortsatt 404-e.
    if (normalizePersonId(slug) !== row.name) continue;
    found.set(slug, row.name);
  }
  addresses = [...found].map(([address, canonical]) => ({ address, canonical }));
});

describe('REGELEN: translittereringen er deterministisk, og den gjetter aldri', () => {
  test('en ø-form gir den translittererte id-en', () => {
    expect(normalizedPersonId('jisreel-hoseas-sønn')).toBe('jisreel-hoseas-sonn');
    expect(normalizedPersonId('johannes-døperen')).toBe('johannes-doperen');
    expect(normalizedPersonId('jakobs-søster')).toBe('jakobs-soster');
  });

  test('æ og å følger samme regel som ø', () => {
    expect(normalizedPersonId('ættetavlen-hos-nærmest')).toBe('aettetavlen-hos-naermest');
    expect(normalizedPersonId('åpenbaring')).toBe('apenbaring');
  });

  test('en id som alt er kanonisk gir INGEN kandidat', () => {
    // Uten dette ville hvert eneste oppslag hatt en redirect å prøve, og
    // «finnes ikke» blitt til en runde til mot basen for ingenting.
    expect(normalizedPersonId('jisreel-hoseas-sonn')).toBeNull();
    expect(normalizedPersonId('josef')).toBeNull();
  });
});

describe('DATA: en publisert ø/æ/å-adresse fører til personen', () => {
  test('det FINNES slike adresser i basen å måle på', () => {
    // Uten denne ville sveipene under bestått på en tom liste.
    expect(
      addresses.length,
      'ingen personadresse med ø/æ/å utledet av dataene — kjør `bun scripts/import-bible.ts`',
    ).toBeGreaterThan(0);
  });

  test('ingen av dem 404-er over API-et', async () => {
    const dead: string[] = [];
    for (const { address, canonical } of addresses) {
      const res = await app.request(`/api/persons/${encodeURIComponent(address)}`);
      if (res.status !== 301 || res.headers.get('location') !== `/api/persons/${canonical}`) {
        dead.push(`${address} -> ${res.status} ${res.headers.get('location') ?? ''}`);
      }
    }
    expect(dead, `${dead.length} av ${addresses.length} adresser fører ikke til personen:\n${dead.join('\n')}`).toEqual(
      [],
    );
  });

  test('måladressen svarer faktisk 200 — en 301 til en 404 er ingen fiks', async () => {
    const dead: string[] = [];
    for (const { canonical } of addresses) {
      const res = await app.request(`/api/persons/${canonical}`);
      if (res.status !== 200) dead.push(`${canonical} -> ${res.status}`);
    }
    expect(dead, dead.join('\n')).toEqual([]);
  });
});

describe('FLATENE: sida og API-et gir samme svar på samme adresse', () => {
  test('sida 301-er den også, med språket i behold', async () => {
    const dead: string[] = [];
    for (const { address, canonical } of addresses) {
      const res = await app.request(href('nb', `/personer/${encodeURIComponent(address)}`));
      if (res.status !== 301 || res.headers.get('location') !== href('nb', `/personer/${canonical}`)) {
        dead.push(`${address} -> ${res.status} ${res.headers.get('location') ?? ''}`);
      }
    }
    expect(dead, dead.join('\n')).toEqual([]);
  });

  test('redirecten beholder locale-en leseren står på', async () => {
    const { address, canonical } = addresses[0]!;
    const res = await app.request(href('de', `/personer/${encodeURIComponent(address)}`));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(href('de', `/personer/${canonical}`));
  });

  test('API-redirecten beholder ?lang=, ellers svarer neste kall på gulvspråket', async () => {
    const { address, canonical } = addresses[0]!;
    const res = await app.request(`/api/persons/${encodeURIComponent(address)}?lang=en`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/api/persons/${canonical}?lang=en`);
  });
});

describe('SAKENS EGET EKSEMPEL: den prosentkodede formen fra loggen', () => {
  test('/api/persons/jisreel-hoseas-s%C3%B8nn ender hos personen', async () => {
    const res = await app.request('/api/persons/jisreel-hoseas-s%C3%B8nn');
    expect(res.status).toBe(301);
    const location = res.headers.get('location')!;
    expect(location).toBe('/api/persons/jisreel-hoseas-sonn');
    const target = await app.request(location);
    expect(target.status).toBe(200);
    expect(((await target.json()) as { id: string }).id).toBe('jisreel-hoseas-sonn');
  });

  test('sida gjør det samme, og siden bak svarer 200', async () => {
    const res = await app.request(href('nb', '/personer/jisreel-hoseas-s%C3%B8nn'));
    expect(res.status).toBe(301);
    const location = res.headers.get('location')!;
    expect(location).toBe(href('nb', '/personer/jisreel-hoseas-sonn'));
    expect((await app.request(location)).status).toBe(200);
  });
});

describe('GJETTER ALDRI: en adresse vi ikke har er fortsatt død', () => {
  test('en ø-form uten person bak 404-er som før', async () => {
    const res = await app.request(`/api/persons/${encodeURIComponent('en-person-vi-ikke-har-sønn')}`);
    expect(res.status).toBe(404);
  });

  test('`josef` blir ikke til en av de elleve `josef-*`', async () => {
    // #61s egen avgjørelse, og den står: en gjetning ville sendt leseren til
    // feil person med full selvtillit.
    const res = await app.request('/api/persons/josef');
    expect(res.status).toBe(404);
  });

  test('alias-kartet vinner fortsatt der det finnes', async () => {
    const [old, next] = Object.entries(PERSON_ID_ALIASES)[0]!;
    const res = await app.request(`/api/persons/${encodeURIComponent(old)}`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/api/persons/${next}`);
  });
});
