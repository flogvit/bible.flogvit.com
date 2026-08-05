// Lesetekstene finnes bare på norsk — og de sju andre flatene skal likevel ikke
// være blindveier (GitHub #76).
//
// `reading_texts` importeres bare på `nb` (Den norske kirkes tekstrekker), og
// det er med vilje: språkkontrakten sier at manglende innhold skal vise
// INGENTING framfor norsk tekst på en side som ikke er norsk (#26). #45 fikset
// at hreflang ANNONSERTE de sju døde adressene. Igjen sto det leseren møter:
//
//   GET /en/lesetekster/2026-12-25   404   <- delt lenke fra en norsk venn
//   GET /en/lesetekster              200   <- men lista er tom, uten en vei ut
//
// Vaktene under er formulert på UTFALLET for leseren, ikke på mekanismen: en
// lenke til en lesedag skal ende i teksten uansett hvilket prefiks den bærer,
// og menypunktet skal aldri føre til en side uten en vei videre. En fiks som
// oversetter lesetekstene i stedet ville bestått like gjerne som en som
// redirecter — og det er riktig, for da er ingenting en blindvei.
//
// Krever lokal DB (DBngin :3326) med importert innhold.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { LOCALES, href } from '../src/lib/i18n.ts';
import { getAllReadingTexts } from '../src/lib/bible.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

/** Locale-ene som IKKE får lesetekster gjennom fallback-kjeden (#26). */
const UTEN_INNHOLD = LOCALES.filter((l) => l !== 'nb' && l !== 'nn');

let date = '';
let navn = '';

beforeAll(async () => {
  // Datoen hentes fra basen framfor å hardkodes: settet importeres på nytt ved
  // hver innholdsoppdatering, og en tom base skal gi rødt, ikke grønt.
  const texts = await getAllReadingTexts('nb');
  expect(texts.length).toBeGreaterThan(0);
  date = texts[0]!.date;
  navn = texts[0]!.name;
});

/** Følger inntil to hopp og rapporterer hvor leseren faktisk endte. */
async function follow(url: string): Promise<{ status: number; url: string; html: string; hopp: number }> {
  let current = url;
  for (let hopp = 0; hopp < 3; hopp++) {
    const res = await app.request(current);
    if (res.status !== 301 && res.status !== 302) {
      return { status: res.status, url: current, html: await res.text(), hopp };
    }
    current = res.headers.get('location') ?? '';
  }
  return { status: 508, url: current, html: '', hopp: 3 };
}

describe('en delt lenke til en lesedag virker på alle åtte språk (#76)', () => {
  for (const locale of LOCALES) {
    test(`${locale} ender i teksten, ikke i en 404`, async () => {
      const { status, url, html, hopp } = await follow(href(locale, `/lesetekster/${date}`));
      expect({ locale, status, navngir: html.includes(navn) }).toEqual({ locale, status: 200, navngir: true });
      // Ett hopp holder — en kjede av redirecter er en ny måte å miste leseren på.
      expect({ locale, hopp: hopp <= 1 }).toEqual({ locale, hopp: true });
      // Og adressen den ender på er en som FINNES på det språket den bærer.
      expect(url.startsWith('/')).toBe(true);
    });
  }

  test('nb og nn rendrer selv — ingen redirect, og dermed ingen løkke', async () => {
    for (const locale of ['nb', 'nn'] as const) {
      const res = await app.request(href(locale, `/lesetekster/${date}`));
      expect({ locale, status: res.status }).toEqual({ locale, status: 200 });
    }
  });

  test('en dato uten lesetekst 404-er på ALLE språk — redirecten gjetter ikke', async () => {
    // 1. januar 1900 kommer aldri til å stå i tekstrekken. Uten dette kunne
    // fiksen vært «send alt til /nb/», som gjør hver ugyldig dato til en 302
    // mot en 404 — en omvei til samme blindvei.
    for (const locale of LOCALES) {
      const res = await app.request(href(locale, '/lesetekster/1900-01-01'));
      expect({ locale, status: res.status }).toEqual({ locale, status: 404 });
    }
  });

  test('redirecten bærer queryen videre', async () => {
    // Visningsvalgene (?bible=) leses av dagsiden. Faller de bort i redirecten,
    // svarer neste side på noe annet enn det leseren ba om (#24).
    const res = await app.request(`${href(UTEN_INNHOLD[0]!, `/lesetekster/${date}`)}?bible=osen`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${href('nb', `/lesetekster/${date}`)}?bible=osen`);
  });
});

describe('menypunktet fører aldri til en blindvei (#76)', () => {
  // Beslutningen i #76: seksjonen SKJULES IKKE på de seks andre språkene. En
  // locale-betinget meny er en ny akse i navigasjonen, og den koster mer enn
  // den ene siden — så prisen betales der problemet er, på siden selv.
  test('/lesetekster står i HOVEDMENYEN på alle åtte språk', async () => {
    // Målt inne i `<nav class="site-nav">`, ikke i sidas HTML som helhet:
    // forsiden lenker også til lesetekstene fra oppdagelseskortene, så en
    // sveip over hele dokumentet ville bestått med menypunktet fjernet.
    for (const locale of LOCALES) {
      const html = await (await app.request(href(locale, '/'))).text();
      const meny = /<nav class="site-nav"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
      expect({ locale, iMenyen: meny.includes(`href="${href(locale, '/lesetekster')}"`) }).toEqual({
        locale,
        iMenyen: true,
      });
    }
  });

  test('lista viser enten lesedager eller veien til utgaven som har dem', async () => {
    const blindveier: string[] = [];
    for (const locale of LOCALES) {
      const res = await app.request(href(locale, '/lesetekster'));
      expect({ locale, status: res.status }).toEqual({ locale, status: 200 });
      const html = await res.text();

      // Enten står lesedagene der …
      const dager = html.match(/href="\/[a-z]{2}\/lesetekster\/\d{4}-\d{2}-\d{2}"/g) ?? [];
      if (dager.length > 0) continue;

      // … eller så peker siden på et språk som HAR dem, og den lenken lever.
      const annen = [...html.matchAll(/href="\/([a-z]{2})\/lesetekster"/g)]
        .map((m) => m[1]!)
        .find((l) => l !== locale);
      if (!annen) {
        blindveier.push(`${locale}: tom liste uten vei videre`);
        continue;
      }
      const mål = await app.request(href(annen as (typeof LOCALES)[number], '/lesetekster'));
      if (mål.status !== 200) blindveier.push(`${locale} → /${annen}/lesetekster (${mål.status})`);
    }
    expect(blindveier).toEqual([]);
  });
});
