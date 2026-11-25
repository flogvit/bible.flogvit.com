// EN BOK UTEN KAPITTEL ÅPNER BOKA (#217)
//
// En leser som kutter kapittelet av adressen (`/de/høys/1` → `/de/høys`) fikk
// 404: det fantes ingen rute for `/<språk>/<bok>`. Nå 301-er en KJENT bokslug
// (også et alias) til kapittel 1 på samme språk; en ukjent slug er fortsatt 404.
// Bøkene velges av dataene, så en ny bok arver vakta.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { booksData } from '../src/lib/books-data.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { toUrlSlug } from '../src/lib/url-utils.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
await initBooks();

const hopp = (path: string) => app.request(path, { redirect: 'manual' });

describe('/<språk>/<bok> uten kapittel (#217)', () => {
  test('adressen fra vakta: /de/h%c3%b8ys → kapittel 1', async () => {
    const res = await hopp('/de/h%c3%b8ys');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/de/${encodeURI('høys')}/1`);
  });

  test('hver bok på hvert språk 301-er til kapittel 1', async () => {
    const feil: string[] = [];
    for (const locale of LOCALES) {
      for (const b of booksData) {
        const slug = encodeURI(toUrlSlug(b.short_name));
        const res = await hopp(`/${locale}/${slug}`);
        const forventet = `/${locale}/${slug}/1`;
        if (res.status !== 301 || res.headers.get('location') !== forventet) {
          feil.push(`/${locale}/${slug} → ${res.status} ${res.headers.get('location')}`);
        }
      }
    }
    expect(feil).toEqual([]);
  });

  test('queryen følger med', async () => {
    const res = await hopp('/nb/1mos?bible=osnn');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/nb/1mos/1?bible=osnn');
  });

  test('en ukjent slug er fortsatt 404', async () => {
    const res = await hopp('/nb/finnes-ikke-bok');
    expect(res.status).toBe(404);
  });

  // Ruta matcher ETHVERT ett-ledds stykke; står den foran en side, sluker den
  // siden og gjør den til 404 (`/tekst` står i samme fil).
  test('en ett-ledds side som ikke er en bok, svarer fortsatt selv', async () => {
    const res = await hopp('/de/tekst');
    expect(res.status).toBe(200);
  });

  test('målet svarer 200', async () => {
    const res = await hopp(`/de/${encodeURI('høys')}/1`);
    expect(res.status).toBe(200);
  });
});
