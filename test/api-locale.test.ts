// /api/* er montert uprefikset og arver ingen locale fra ruta slik sidene gjør
// (#24). Uten locale svarte hele API-et på gulvet, så alt studieinnhold som
// hentes etter sidevisningen kom på feil språk — uten å feile noe sted.
//
// Rekkefølgen er det som må voktes: eksplisitt ?lang= > språkprefikset i
// Referer > cookie/Accept-Language. Regelen «URL-en vinner over cookien» må
// holde også her, ellers viser en delt lenke mottakerens språk.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { apiLocale } from '../src/lib/i18n.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Minimal stand-in for Hono-requesten — apiLocale trenger bare de to. */
function req(query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return {
    query: (k: string) => query[k],
    header: (k: string) => headers[k.toLowerCase()],
  };
}

const NB_COOKIE = encodeURIComponent(JSON.stringify({ lang: 'nb' }));

describe('apiLocale', () => {
  test('eksplisitt ?lang= vinner over alt annet', () => {
    expect(apiLocale(req({ lang: 'de' }, { referer: 'http://x/nb/personer' }), NB_COOKIE)).toBe('de');
  });

  test('språkprefikset i Referer vinner over cookien', () => {
    expect(apiLocale(req({}, { referer: 'http://x/en/personer' }), NB_COOKIE)).toBe('en');
  });

  test('cookien brukes når siden ikke røper språk', () => {
    expect(apiLocale(req(), NB_COOKIE)).toBe('nb');
    expect(apiLocale(req({}, { referer: 'http://x/' }), NB_COOKIE)).toBe('nb');
  });

  test('Accept-Language når verken URL eller cookie sier noe', () => {
    expect(apiLocale(req({}, { 'accept-language': 'sv,en;q=0.8' }), null)).toBe('sv');
  });

  test('gulvet til slutt', () => {
    expect(apiLocale(req(), null)).toBe('en');
  });

  test('søppelverdier faller gjennom framfor å nå databasen', () => {
    expect(apiLocale(req({ lang: 'nb; DROP TABLE verses' }), null)).toBe('en');
    expect(apiLocale(req({}, { referer: 'ikke-en-url' }), null)).toBe('en');
    expect(apiLocale(req({}, { referer: 'http://x/zz/personer' }), null)).toBe('en');
  });
});

describe('API-et svarer på sidens språk', () => {
  const app = createApp();

  test('Referer fra /nb/ gir norsk innhold', async () => {
    const res = await app.request('/api/persons', { headers: { referer: 'http://localhost/nb/personer' } });
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain('Avgrunnsengelen');
  });

  test('uten Referer svarer det på gulvet, ikke på norsk', async () => {
    const res = await app.request('/api/persons');
    expect(JSON.stringify(await res.json())).toContain('Angel of the Abyss');
  });
});
