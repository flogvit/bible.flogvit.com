// VAKTA for feilmeldingene fra /api/reference (#71).
//
// Symptomet: `routes/api/reference.ts` og `reference-parser.ts` svarte med
// hardkodet norsk tekst på alle åtte språk («Salmene har 150 kapitler» på
// `?lang=fr`), og de to tellemeldingene bygde strengen av `book.name_no` —
// altså NØKKELEN, samme klasse som #69, bare i feilgrenen.
//
// Ingen klient viser feltet i dag (`cmdk.js`/`studium.js` leser bare
// `data.reference`), så hullet er LATENT: det gir verken 404, 5xx eller en
// loggrad, og ingen sveip kan se det. Samme klasse som #45, #65 og #69 — bare
// en vakt formulert på KONTRAKTEN finner den.
//
// Vakta er formulert på UTFALLET og ikke på de sju målte inputene: hver feil
// endepunktet faktisk kan svare med må være en RENDRING av en `ref.err.*`-nøkkel
// i ordboka for språket i kallet. En ny feilgren med en hardkodet streng matcher
// da ingen nøkkel og blir rød uten at noen har ført den opp.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES, isMessageKey, makeT, type Locale } from '../src/lib/i18n.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';
import { localeToContentLanguage } from '../src/lib/lang.ts';
import { bookNameById } from '../src/lib/books-data.ts';
import { parseReference, referenceErrorText } from '../src/lib/reference-parser.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

beforeAll(async () => {
  await initBooks();
});

/** Prefikset feilnøklene deler. Ordboka er kilden, ikke en liste her. */
const ERROR_PREFIX = 'ref.err.';

function errorKeys(locale: Locale): string[] {
  return Object.keys(DICTIONARIES[locale]).filter((k) => k.startsWith(ERROR_PREFIX));
}

/**
 * Er teksten en RENDRING av en av `ref.err.*`-verdiene for språket?
 * `{plassholder}` blir `.+`, så «Psalms has 150 chapters» matcher
 * «{book} has {count} chapters» mens en hardkodet norsk streng ikke matcher noe.
 */
function matchedKey(locale: Locale, text: string): string | undefined {
  const dict = DICTIONARIES[locale] as Record<string, string>;
  return errorKeys(locale).find((key) => {
    const pattern = dict[key]!
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{[a-z]+\\\}/gi, '.+');
    return new RegExp(`^${pattern}$`).test(text);
  });
}

async function errorFor(query: string, locale: Locale): Promise<string | undefined> {
  const res = await app.request(`/api/reference?q=${encodeURIComponent(query)}&lang=${locale}`);
  expect(res.status).toBe(200);
  const data = (await res.json()) as { error?: string };
  return data.error;
}

// Hver av dem traff en egen feilgren, målt mot koden slik den sto i saken.
// Den siste (`sal 119,300`) er rutas egen versgren, som slår opp i basen.
const FAILING = [
  { q: '', branch: 'mangler søkeparameter' },
  { q: 'hei', branch: 'ikke en referanse' },
  { q: 'sal 3 4 5', branch: 'ugyldig format' },
  { q: 'xyz 3', branch: 'fant ikke bok' },
  { q: 'sal', branch: 'mangler kapittel' },
  { q: 'sal 200', branch: 'kapittelantall' },
  { q: 'sal 119,300', branch: 'versantall' },
] as const;

describe('feilmeldingene fra /api/reference (#71)', () => {
  // ── REGELEN ────────────────────────────────────────────────────────────
  // Parseren er ren logikk uten request-kontekst, så den kan ikke oversette:
  // den skal returnere en NØKKEL med parametre, og oversettelsen skjer i ruta.
  describe('regelen', () => {
    const PARSER_INPUTS = ['', 'sal 3 4 5', 'xyz 3', 'sal', 'sal 200'];

    for (const input of PARSER_INPUTS) {
      test(`parseReference(${JSON.stringify(input)}) gir en ordboksnøkkel`, () => {
        const err = parseReference(input).error;
        expect(err).toBeDefined();
        expect(isMessageKey(err!.key)).toBe(true);
        expect(err!.key.startsWith(ERROR_PREFIX)).toBe(true);
      });

      test(`${JSON.stringify(input)} sier noe annet på engelsk enn på norsk`, () => {
        const err = parseReference(input).error!;
        const en = referenceErrorText(makeT('en'), err);
        const nb = referenceErrorText(makeT('nb'), err);
        expect(en).not.toBe(nb);
        // Ingen plassholder står igjen usubstituert.
        expect(en).not.toContain('{');
      });
    }
  });

  // ── FLATA ──────────────────────────────────────────────────────────────
  // Sakens eget bevis: `?lang=fr` fikk «Salmene har 150 kapitler». Hver
  // feilgren måles mot ordboka for språket i kallet — så en fiks som bare
  // oversetter NOEN av dem blir rød.
  describe('flata', () => {
    for (const { q, branch } of FAILING) {
      test(`«${q}» (${branch}) svarer på språket i kallet`, async () => {
        for (const locale of LOCALES) {
          const text = await errorFor(q, locale);
          expect(text, `${locale}: ingen feilmelding for «${q}»`).toBeTruthy();
          expect(
            matchedKey(locale, text!),
            `${locale}: «${text}» er ingen ref.err.*-verdi for ${locale}`,
          ).toBeDefined();
        }
      });
    }

    test('ingen feilgren svarer med norsk tekst på ?lang=en', async () => {
      for (const { q } of FAILING) {
        const en = await errorFor(q, 'en');
        const nb = await errorFor(q, 'nb');
        expect(en, `«${q}»`).not.toBe(nb);
        expect(matchedKey('nb', en!), `«${q}»: «${en}» er den norske verdien`).toBeUndefined();
      }
    });

    // Boknavnet er VISNING, ikke nøkkelen (#69). De to tellemeldingene bygde
    // strengen av `name_no`, så «Salmene» sto der også på engelsk.
    test('tellemeldingene navngir boka gjennom bookName()', async () => {
      for (const q of ['sal 200', 'sal 119,300']) {
        for (const locale of LOCALES) {
          const text = await errorFor(q, locale);
          const name = bookNameById(19, localeToContentLanguage(locale));
          expect(text, `${locale}: «${text}» mangler «${name}»`).toContain(name);
        }
        expect(await errorFor(q, 'en')).toContain('Psalms');
        expect(await errorFor(q, 'en')).not.toContain('Salmene');
      }
    });
  });

  // ── ORDBOKA ────────────────────────────────────────────────────────────
  // Uten denne kunne de to over bestått av at prefikset ikke finnes i det hele
  // tatt: `matchedKey` ville da lett i en tom liste og aldri fått noe å matche.
  test('nøklene finnes på alle åtte språk', () => {
    const base = errorKeys('en');
    expect(base.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      expect(errorKeys(locale).sort(), locale).toEqual([...base].sort());
    }
  });
});
