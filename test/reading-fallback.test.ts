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
import { IMPORTED_BIBLES, OWN_EDITIONS } from '../src/lib/editions.ts';
import { loadChapterWithFallback } from '../src/routes/pages/reading.tsx';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

describe('readableBibleCandidates', () => {
  // Our own editions lead, in the language chain's order; the harvested ones
  // (#170) follow, the language's own before the floor's. The lists below are
  // the heads; what follows them is checked by the rule, not by name, so the
  // next import does not have to rewrite this test.
  const SOURCE = ['sblgnt', 'tanach'];
  const OWN = ['osnb', 'osnn', 'osen', 'oses'];
  const startsWith = async (lang: string, head: string[]) => {
    const candidates = await readableBibleCandidates(lang);
    const ids = candidates.map((e) => e.id);
    expect(ids.slice(0, head.length), lang).toEqual(head);
    expect(ids.filter((id) => SOURCE.includes(id)), `${lang}: no source texts`).toEqual([]);
    // Within one language, no own edition comes after a harvested one.
    candidates.forEach((e, i) => {
      if (OWN.includes(e.id)) return;
      const laterOwn = candidates.slice(i + 1).filter((x) => x.lang === e.lang && OWN.includes(x.id));
      expect(laterOwn.map((x) => x.id), `${lang}: ${e.id} before our own`).toEqual([]);
    });
    return ids;
  };

  // The language's own editions come before the floor's: a harvested Norwegian
  // edition (dnb30, #220) sits between osnb and osen, and osen still leads English.
  const englishLeadsWith = async (lang: string, lead: string) => {
    const english = (await readableBibleCandidates(lang)).filter((e) => e.lang === 'en');
    expect(english[0]?.id, `${lang}: first English`).toBe(lead);
  };

  test('nb → osnb, deretter engelsk som gulv (#26)', async () => {
    const ids = await startsWith('nb', ['osnb']);
    await englishLeadsWith('nb', 'osen');
  });

  test('nn → osnn, osnb, osen — nabospråk før basespråk', async () => {
    const ids = await startsWith('nn', ['osnn', 'osnb']);
    await englishLeadsWith('nn', 'osen');
    expect(ids.indexOf('osen')).toBeGreaterThan(ids.indexOf('osnb'));
  });

  test('en → osen først, osnb som gulv', async () => {
    const ids = await startsWith('en', ['osen']);
    expect(ids).toContain('osnb');
  });

  test('sv → osen (basespråket) før osnb, ingen svensk utgave', async () => {
    const ids = await startsWith('sv', ['osen']);
    expect(ids).toContain('osnb');
  });

  // #231: a new edition must not move a language's default. Harvested editions
  // follow IMPORTED_BIBLES, the order they were published in, not the alphabet
  // (elberfelder_1905 took German from luther_1912 the day it came).
  test('harvested editions keep the order they were published in, so a new one never becomes the default', async () => {
    const listed = IMPORTED_BIBLES as readonly string[];
    const own = OWN_EDITIONS as readonly string[];
    for (const lang of ['en', 'de', 'fr', 'es', 'nb']) {
      const candidates = await readableBibleCandidates(lang);
      for (const edLang of new Set(candidates.map((e) => e.lang))) {
        const ids = candidates.filter((e) => e.lang === edLang && listed.includes(e.id) && !own.includes(e.id)).map((e) => e.id);
        const ranks = ids.map((id) => listed.indexOf(id));
        expect(ranks, `${lang} → ${edLang}: ${ids.join(', ')}`).toEqual([...ranks].sort((a, b) => a - b));
      }
    }
    const de = (await readableBibleCandidates('de')).map((e) => e.id);
    if (de.includes('luther_1912') && de.includes('elberfelder_1905')) {
      expect(de.indexOf('luther_1912')).toBeLessThan(de.indexOf('elberfelder_1905'));
    }
  });

  test('es → oses before the harvested Spanish edition (#170)', async () => {
    const ids = await startsWith('es', ['oses']);
    if (ids.includes('rv_1909')) expect(ids.indexOf('rv_1909')).toBeGreaterThan(ids.indexOf('oses'));
  });

  test('grunntekster (sblgnt/tanach) er aldri kandidater', async () => {
    // Greek has no reading edition, so English leads; Hebrew has he_modern (#221),
    // a reading edition, which leads its language. startsWith itself holds that
    // no source text is among the candidates.
    await startsWith('el', ['osen']);
    const he = await readableBibleCandidates('he');
    expect(he.map((e) => e.id)).not.toContain('tanach');
    expect(he[0]?.id === 'he_modern' || he[0]?.id === 'osen').toBe(true);
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
