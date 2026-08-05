// Kapittelrenderen henter per-vers-dataene PER KAPITTEL (GitHub #19).
//
// Løkka i `loadChapterData` gjorde fire spørringer per vers: grunntekst,
// undertekst, ord-for-ord og kryssreferanser. Det er 704 rundturer på Sal 119.
// Lokalt mot DBngin målte de 8–33 ms og var altså ikke flaskehalsen som veltet
// siden — men mot en managed database over nett er latensen en annen, og da er
// antallet rundturer selve kostnaden. Nå er det fire spørringer per KAPITTEL.
//
// Det testen må holde fast på er at billigere IKKE ble annerledes: de batchede
// getterne skal gi bit for bit samme rader som per-vers-variantene, som fortsatt
// finnes og brukes andre steder.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import {
  getOriginalWord4Word,
  getOriginalWord4WordByVerse,
  getReferences,
  getReferencesByVerse,
  getVerses,
  initBooks,
} from '../src/lib/bible.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

beforeAll(async () => {
  await initBooks();
});

// 1 Mos 1 (31 vers) har både ord-for-ord og kryssreferanser; Sal 119 (176 vers)
// er kapittelet som gjorde antallet rundturer synlig.
const KAPITLER: [book: number, chapter: number, navn: string][] = [
  [1, 1, '1 Mos 1'],
  [19, 119, 'Sal 119'],
  [43, 3, 'Joh 3'],
];

describe('batchede per-vers-data er identiske med per-vers-spørringene', () => {
  for (const [book, chapter, navn] of KAPITLER) {
    test(`${navn} — kryssreferanser`, async () => {
      const verses = await getVerses(book, chapter, 'osnb');
      expect(verses.length).toBeGreaterThan(0);

      const batched = await getReferencesByVerse(book, chapter, 'nb');
      for (const v of verses) {
        expect({ vers: v.verse, refs: batched.get(v.verse) ?? [] }).toEqual({
          vers: v.verse,
          refs: await getReferences(book, chapter, v.verse, 'nb'),
        });
      }
    });

    test(`${navn} — ord-for-ord`, async () => {
      const verses = await getVerses(book, chapter, 'osnb');
      const batched = await getOriginalWord4WordByVerse(book, chapter, 'nb');
      for (const v of verses) {
        expect({ vers: v.verse, ord: batched.get(v.verse) ?? [] }).toEqual({
          vers: v.verse,
          ord: await getOriginalWord4Word(book, chapter, v.verse, 'nb'),
        });
      }
      expect([...batched.values()].flat().length).toBeGreaterThan(0);
    });
  }

  // Uten dette ville sammenligningene over vært tomt mot tomt for hvert vers og
  // bestått på en base uten innhold. Sal 119 har ingen kryssreferanser i det
  // hele tatt, så kravet stilles til SETTET, ikke til hvert kapittel.
  test('fixturene har faktisk referanser å sammenligne', async () => {
    let n = 0;
    for (const [book, chapter] of KAPITLER) {
      n += [...(await getReferencesByVerse(book, chapter, 'nb')).values()].flat().length;
    }
    expect(n).toBeGreaterThan(0);
  });

  test('et språk uten innhold gir tomt, ikke en tilfeldig annen språkrad', async () => {
    // Grunnteksten bærer språket i bibel-id-en (tanach-nb), så her finnes ingen
    // fallback-kjede — og skal ikke finnes.
    const batched = await getOriginalWord4WordByVerse(1, 1, 'zz');
    expect([...batched.values()].flat()).toEqual([]);
  });
});

// Strukturell vakt: legger noen tilbake et per-vers-kall i løkka, er 500+
// rundturer per sidevisning tilbake uten at testene over blir røde — de sjekker
// bare at getterne er enige, ikke hvem kapittelrenderen kaller.
describe('kapittelrenderen kaller ingen per-vers-getter', () => {
  test('reading.tsx bruker bare kapittel-getterne', async () => {
    const src = await Bun.file('src/routes/pages/reading.tsx').text();
    const perVers = ['getReferences', 'getOriginalWord4Word', 'getOriginalVerse', 'getVerse'];
    const funn: string[] = [];
    for (const navn of perVers) {
      // `\b…\(` treffer ikke flertallsformene (getVerses, getReferencesByVerse).
      const re = new RegExp(`^(?!\\s*(?:\\/\\/|\\*)).*\\b${navn}\\(`, 'gm');
      for (const m of src.matchAll(re)) funn.push(m[0].trim());
    }
    expect(funn).toEqual([]);
  });
});
