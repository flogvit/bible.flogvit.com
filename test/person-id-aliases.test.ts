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

import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { PERSON_ID_ALIASES } from '../src/lib/person-id-aliases.ts';
import { href } from '../src/lib/i18n.ts';

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
