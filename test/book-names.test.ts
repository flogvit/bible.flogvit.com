// VAKTA for boknavn på alle åtte språkene (#69).
//
// Symptomet den finnes for: `books-data.ts` hadde navn på nb og en, og
// `bookName()` faller gjennom innholdskjeden til engelsk. `/fr/matt/5` hadde
// derfor `<title>Matthew 5`, og det samme sto i brødsmulen, i
// kapitteloverskriften og i hver referansechip — på fem av åtte språk, på det
// ordet leseren ser oftest.
//
// Vakta er formulert på DATAENE (66 bøker × alle LOCALES), ikke på de fem
// adressene i saken: leser den `LOCALES`, blir et niende språk rødt her i det
// øyeblikket det legges til, uten at noen har ført det opp.
//
// De fire norsk-sveipene i `page-contract.test.ts` kan per konstruksjon ikke se
// dette: engelsk på en fransk side er ikke norsk tekst, og det er ingen
// manglende ordboksnøkkel — navnet er data, ikke en nøkkel.

import { beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES, type Locale } from '../src/lib/i18n.ts';
import { localeToContentLanguage } from '../src/lib/lang.ts';
import { booksData, bookName, bookAbbr, type BookInfo } from '../src/lib/books-data.ts';
import { BOOK_NAMES, BOOK_ABBRS } from '../src/lib/book-names.ts';

const app = createApp();

beforeAll(async () => {
  await initBooks();
});

/**
 * Bokmål er NØKKELEN (`name_no`/`short_name`) og bor derfor i `books-data.ts`,
 * ikke i tabellene. Alle andre språk må ha sin egen rad.
 */
const KEY_LANGUAGE = 'nb';

/** Språkets EGET navn — `undefined` betyr at vi ikke har navnet på språket. */
function ownName(lang: string, book: BookInfo): string | undefined {
  return lang === KEY_LANGUAGE ? book.name_no : BOOK_NAMES[lang]?.[book.id];
}

function ownAbbr(lang: string, book: BookInfo): string | undefined {
  return lang === KEY_LANGUAGE ? book.short_name : BOOK_ABBRS[lang]?.[book.id];
}

const langOf = (locale: Locale) => localeToContentLanguage(locale);

describe('boknavn per språk (#69)', () => {
  // ── DEKNING ────────────────────────────────────────────────────────────
  // Hver bok, hvert språk. Det er selve saken: et manglende navn er ikke en
  // feil noe sted, det er en STILLE fallback til engelsk.
  describe('dekning', () => {
    for (const locale of LOCALES) {
      const lang = langOf(locale);

      test(`${locale}: alle 66 bøker har navn`, () => {
        const missing = booksData.filter((b) => !ownName(lang, b)?.trim());
        expect(missing.map((b) => `${b.id} ${b.short_name}`)).toEqual([]);
      });

      test(`${locale}: alle 66 bøker har forkortelse`, () => {
        const missing = booksData.filter((b) => !ownAbbr(lang, b)?.trim());
        expect(missing.map((b) => `${b.id} ${b.short_name}`)).toEqual([]);
      });

      // Selve fallbacken: `bookName()` skal gi språkets EGET navn, ikke det
      // engelske. Uten denne ville en tabell kunne ligge der uten å bli brukt.
      test(`${locale}: bookName/bookAbbr viser språkets eget navn`, () => {
        const wrong = booksData
          .map((b) => ({ b, name: bookName(b, lang), abbr: bookAbbr(b, lang) }))
          .filter(({ b, name, abbr }) => name !== ownName(lang, b) || abbr !== ownAbbr(lang, b))
          .map(({ b, name }) => `${b.short_name}: viste «${name}», ventet «${ownName(lang, b)}»`);
        expect(wrong).toEqual([]);
      });
    }
  });

  // ── FORM ───────────────────────────────────────────────────────────────
  // Tabellene leses mot LOCALES, ikke mot en liste her. Et nytt språk i
  // `LOCALES` gjør denne halvdelen rød uten at noen har rørt vakta.
  describe('form', () => {
    const IDS = booksData.map((b) => b.id);

    for (const [what, table] of [['navn', BOOK_NAMES], ['forkortelser', BOOK_ABBRS]] as const) {
      test(`${what}: nøyaktig språkene i LOCALES, minus nøkkelspråket`, () => {
        const expected = LOCALES.map(langOf).filter((l) => l !== KEY_LANGUAGE);
        expect(Object.keys(table).sort()).toEqual([...expected].sort());
      });

      test(`${what}: hver tabell dekker nøyaktig bok-id 1–66`, () => {
        for (const [lang, entries] of Object.entries(table)) {
          expect([lang, Object.keys(entries).map(Number).sort((a, b) => a - b)]).toEqual([lang, IDS]);
        }
      });

      // Duplikater er den vanligste innskrivingsfeilen, og den ENESTE som
      // overlever «finnes og er ikke tom»: to bøker med samme navn betyr at
      // en rad ble limt inn to ganger.
      test(`${what}: ingen bok deler verdi med en annen innen samme språk`, () => {
        for (const [lang, entries] of Object.entries(table)) {
          const values = Object.values(entries);
          expect([lang, new Set(values).size]).toEqual([lang, values.length]);
        }
      });

      // «Lim inn den engelske tabellen og oversett siden» er den andre: den
      // ville bestått alt over, og gitt leseren engelsk på nytt.
      test(`${what}: ingen to språk har samme tabell`, () => {
        const seen = new Map<string, string>();
        for (const [lang, entries] of Object.entries(table)) {
          const fingerprint = JSON.stringify(entries);
          expect([lang, seen.get(fingerprint)]).toEqual([lang, undefined]);
          seen.set(fingerprint, lang);
        }
      });
    }
  });

  // ── SIDA ───────────────────────────────────────────────────────────────
  // Beviset i saken er en rendret side, ikke en tabell: `curl /fr/matt/5 |
  // grep '<title>'`. Tabellen kan være riktig mens visningen henter navnet et
  // annet sted fra, så begge må måles.
  describe('sida', () => {
    const MATT = booksData.find((b) => b.id === 40)!;

    for (const locale of LOCALES) {
      const lang = langOf(locale);

      test(`/${locale}/matt/5 heter boka på ${locale}`, async () => {
        const res = await app.request(`/${locale}/matt/5`);
        expect(res.status).toBe(200);
        const html = await res.text();
        const name = ownName(lang, MATT)!;

        expect(html).toContain(`<title>${name} 5 — FLOGVIT.bible</title>`);
        // Kapitteloverskriften og brødsmulen bruker samme navn — begge sto
        // engelske i saken.
        expect(html).toContain(`<span class="chapter-book">${name}</span>`);
      });
    }
  });
});
