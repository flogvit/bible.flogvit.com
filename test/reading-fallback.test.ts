// Bibeltekst-fallback per locale (GitHub #13): en gyldig bok/kapittel-referanse
// skal aldri 404-e fordi språkets utgave mangler — den serveres fra fallback-
// kjeden (contentLanguageChain → utgaver) med et lite hint. Gjelder ALLE
// locales, ikke bare /en/: hvert språk får sin egen utgave automatisk når den
// importeres. Strukturelt ugyldige referanser (kapittel > bokas antall) skal
// fortsatt 404-e. Krever lokal DB (DBngin :3312) med importert innhold.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { readableBibleCandidates } from '../src/lib/bible.ts';
import { loadChapterWithFallback } from '../src/routes/pages/reading.tsx';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

describe('readableBibleCandidates', () => {
  test('nb → osnb, deretter engelsk som gulv (#26)', async () => {
    const c = await readableBibleCandidates('nb');
    expect(c.map((e) => e.id)).toEqual(['osnb', 'osen']);
  });

  test('nn → osnn, osnb, osen — nabospråk før basespråk', async () => {
    const c = await readableBibleCandidates('nn');
    expect(c.map((e) => e.id)).toEqual(['osnn', 'osnb', 'osen']);
  });

  test('en → osen først, osnb som gulv', async () => {
    const c = await readableBibleCandidates('en');
    expect(c.map((e) => e.id)).toEqual(['osen', 'osnb']);
  });

  test('sv → osen (basespråket) før osnb, ingen svensk utgave', async () => {
    const c = await readableBibleCandidates('sv');
    expect(c.map((e) => e.id)).toEqual(['osen', 'osnb']);
  });

  test('grunntekster (sblgnt/tanach) er aldri kandidater', async () => {
    for (const lang of ['el', 'he']) {
      const c = await readableBibleCandidates(lang);
      expect(c.map((e) => e.id)).toEqual(['osen', 'osnb']);
    }
  });
});

describe('kapittel-fallback i ruta', () => {
  test('/en/1mos/1: osen uten innstilling, ingen untranslated-hint', async () => {
    const res = await app.request('/en/1mos/1');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('In the beginning God created');
    expect(html).not.toContain('data-untranslated');
  });

  // Fallback-mekanismen selv holdes i live av et språk vi IKKE har utgave for:
  // svensk faller til basespråket (osen), ikke til gulvet, og skal vise hintet.
  test('/sv/1mos/1: faller til osen med untranslated-hint', async () => {
    const res = await app.request('/sv/1mos/1');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('In the beginning God created');
    expect(html).toContain('data-untranslated');
  });

  test('/nb/1mos/1: ingen hint', async () => {
    const res = await app.request('/nb/1mos/1');
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('data-untranslated');
  });

  test('/nn/1mos/1: nynorsk utgave som standard, ingen hint', async () => {
    const res = await app.request('/nn/1mos/1');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('I byrjinga skapte Gud');
    expect(html).not.toContain('data-untranslated');
  });

  test('strukturelt ugyldig kapittel 404-er fortsatt', async () => {
    const res = await app.request('/en/hos/16');
    expect(res.status).toBe(404);
  });

  test('eksplisitt ?bible= respekteres uten hint', async () => {
    const res = await app.request('/en/1mos/1?bible=osnn');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('I byrjinga skapte Gud');
    expect(html).not.toContain('data-untranslated');
  });

  test('/en/ bruker engelsk kapittelsammendrag (derivert innhold følger locale)', async () => {
    const res = await app.request('/en/1mos/1');
    expect(await res.text()).toContain('God creates');
  });
});

describe('loadChapterWithFallback', () => {
  test('hopper videre når første kandidat mangler kapittelet', async () => {
    // sblgnt er NT-only: 1 Mos finnes ikke der, så løkka må videre til osnb.
    const { data, bible } = await loadChapterWithFallback(
      1,
      1,
      [
        { id: 'sblgnt', lang: 'el' },
        { id: 'osnb', lang: 'nb' },
      ],
      null,
      undefined,
      'nb',
    );
    expect(data).not.toBeNull();
    expect(bible.id).toBe('osnb');
  });
});
