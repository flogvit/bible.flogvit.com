// Person-id-ene er lesbare, og de gamle adressene lever videre (free-bible#25).
//
// `nameToId()` i free-bible SLETTET `ø` og `æ` i stedet for å translitterere
// dem, fordi de er egne bokstaver uten kanonisk dekomponering: NFD lar dem stå,
// og filteret etterpå kastet dem. `å` og `é` gikk klar — de ER base pluss
// diakritisk tegn — og det er derfor feilen så vilkårlig ut. Resultatet var
// `akabs-snn`, `jakobs-sster` og `fbe` (Føbe) som OFFENTLIGE URL-er. Fem id-er
// hadde til og med et ordrett `ø`, og to hadde understrek.
//
// Testen vokter to ting kildefiksen ikke kan vokte alene:
//   1. at kartet bare inneholder gode måladresser (ellers flyttet vi feilen)
//   2. at en gammel adresse 301-er og ikke 404-er
//
// Ingen DB nødvendig for 1; 2 treffer bare redirect-grenen, som ligger FØR
// oppslaget nettopp fordi en gammel id ikke finnes i basen lenger.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { PERSON_ID_ALIASES } from '../src/lib/person-id-aliases.ts';
import { href } from '../src/lib/i18n.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

// Tokens der et ø/æ er blitt slettet. `verste` er «øverste», ikke «verst».
const DAMAGED = /(^|-)(snn|sster|snnesnn|hvding|verste|frste|ttetavle|nrmest)($|-)|bronsestperen/;

describe('person-id-aliaser', () => {
  test('kartet er ikke tomt', () => {
    expect(Object.keys(PERSON_ID_ALIASES).length).toBeGreaterThan(0);
  });

  test('alle måladresser er rene slugs', () => {
    const bad = Object.values(PERSON_ID_ALIASES).filter((v) => !/^[a-z0-9-]+$/.test(v));
    expect(bad).toEqual([]);
  });

  test('ingen måladresse har fortsatt et slettet ø eller æ', () => {
    const bad = Object.values(PERSON_ID_ALIASES).filter((v) => DAMAGED.test(v));
    expect(bad).toEqual([]);
  });

  test('ingen id peker på seg selv', () => {
    const bad = Object.entries(PERSON_ID_ALIASES).filter(([k, v]) => k === v);
    expect(bad).toEqual([]);
  });

  test('ingen kjede: en måladresse er aldri selv en gammel id', () => {
    const chained = Object.values(PERSON_ID_ALIASES).filter((v) => v in PERSON_ID_ALIASES);
    expect(chained).toEqual([]);
  });

  test('en gammel id 301-er til den nye', async () => {
    const [old, next] = Object.entries(PERSON_ID_ALIASES)[0]!;
    const res = await app.request(href('nb', `/personer/${old}`));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(href('nb', `/personer/${next}`));
  });

  test('redirecten beholder språket', async () => {
    const [old, next] = Object.entries(PERSON_ID_ALIASES)[0]!;
    const res = await app.request(href('de', `/personer/${old}`));
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(href('de', `/personer/${next}`));
  });
});

// BEGGE PERSONFLATENE HONORERER SAMME KART (#61)
// ----------------------------------------------
// Kartet ble lagt inn på SIDA og bare der, så `/personer/<gammel>` 301-et mens
// `/api/persons/<gammel>` 404-et — to svar på samme adresse, fra samme app.
//
// Det er nøyaktig symptomet #61 er meldt på, målt på .no: appens eget API
// 404-er en person-id appen selv fortsatt honorerer et annet sted. Seks av de
// gamle id-ene har et ORDRETT `ø`, altså `%C3%B8` på veien inn — den ene
// formen saken navngir i tittelen (`jisreel-hoseas-s%C3%B8nn`).
//
// Adressene har vært offentlige og er indeksert og bokmerket; det er hele
// grunnen til at kartet finnes framfor en 404. En klient som henter dem over
// API-et har samme krav på å bli sendt videre som en leser som klikker.
describe('personadresser: API-et honorerer samme alias-kart som sida', () => {
  const aliases = Object.entries(PERSON_ID_ALIASES);

  // Klassen saken er meldt på: gammel id med et ordrett ø/æ/å.
  const nordic = aliases.filter(([old]) => /[øæå]/.test(old));

  test('det finnes gamle id-er med ordrett ø/æ/å å måle på', () => {
    expect(nordic.length).toBeGreaterThan(0);
  });

  test('en gammel id 301-er også over API-et', async () => {
    const [old, next] = aliases[0]!;
    const res = await app.request(`/api/persons/${encodeURIComponent(old)}`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/api/persons/${next}`);
  });

  test('ingen gammel id 404-er over API-et når sida sender den videre', async () => {
    const dead: string[] = [];
    for (const [old] of aliases) {
      const res = await app.request(`/api/persons/${encodeURIComponent(old)}`);
      if (res.status === 404) dead.push(old);
    }
    expect(dead, `API-et 404-er ${dead.length} id-er sida 301-er:\n${dead.join('\n')}`).toEqual([]);
  });

  test('den prosentkodede ø-formen — saken sitt eget eksempel — svarer', async () => {
    for (const [old, next] of nordic) {
      // encodeURIComponent gir nettopp %C3%B8, slik klienten sender den.
      const res = await app.request(`/api/persons/${encodeURIComponent(old)}`);
      expect(res.status, `${old} skulle 301-et til ${next}`).toBe(301);
      expect(res.headers.get('location')).toBe(`/api/persons/${next}`);
    }
  });

  test('redirecten beholder ?lang=, ellers svarer neste kall på feil språk', async () => {
    const [old, next] = aliases[0]!;
    const res = await app.request(`/api/persons/${encodeURIComponent(old)}?lang=en`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/api/persons/${next}?lang=en`);
  });
});
