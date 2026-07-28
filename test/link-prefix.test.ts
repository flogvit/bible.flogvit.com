// Lenkerevisjon (GitHub #18): ALLE interne lenker må bære språkprefiks.
//
// Uten prefiks 302-redirecter lenken til den FORHANDLEDE locale-en, ikke den
// leseren faktisk er på — en norsk nettleser som leser den engelske utgaven
// blir kastet til /nb/ ved første klikk. URL-en skal vinne over Accept-Language
// hele veien, ikke bare på veien inn (portal/I18N.md §2).

import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { LOCALES, missingKeys } from '../src/lib/i18n.ts';

const app = createApp();

/** Stier som med rette er uprefiksede: statiske filer og API. */
const EXEMPT = [/^\/js\//, /^\/css\//, /^\/api\//, /^\/\.well-known\//, /^\/[^/]+\.(css|js|svg|png|ico|json|xml|txt|webmanifest)$/];

const localeRe = new RegExp(`^/(${LOCALES.join('|')})(/|$)`);

async function unprefixedLinks(path: string): Promise<string[]> {
  const html = await (await app.request(path)).text();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
  return [
    ...new Set(
      hrefs.filter((h) => {
        if (!h.startsWith('/')) return false; // eksterne og anker-lenker
        if (EXEMPT.some((re) => re.test(h))) return false;
        return !localeRe.test(h);
      }),
    ),
  ];
}

describe('interne lenker bærer språkprefiks', () => {
  test('kapittelsiden (tyngste siden — TOC, skinne, rutenett, referanser)', async () => {
    expect(await unprefixedLinks('/de/1mos/1')).toEqual([]);
  });

  test('forsiden', async () => {
    expect(await unprefixedLinks('/de/')).toEqual([]);
  });

  test('bokoversikten', async () => {
    expect(await unprefixedLinks('/de/boker')).toEqual([]);
  });

  test('404-siden', async () => {
    expect(await unprefixedLinks('/de/finnes-ikke')).toEqual([]);
  });

  test('innstillinger', async () => {
    expect(await unprefixedLinks('/de/innstillinger')).toEqual([]);
  });

  test('lesekartet', async () => {
    expect(await unprefixedLinks('/de/lesekart')).toEqual([]);
  });

  // Disse sidetypene rendrer gjennom EGNE komponenter (verse-display,
  // inline-refs, studiekortene). Et hull her var nettopp det som slapp unna
  // første runde av #18: verse-display bygger URL-en i en variabel, ikke som
  // en href-literal, så et tekstsøk fant den ikke.
  test('personsiden (verse-display + kontekstlenker)', async () => {
    expect(await unprefixedLinks('/de/personer')).toEqual([]);
  });

  test('temasiden (studiekort)', async () => {
    expect(await unprefixedLinks('/de/temaer')).toEqual([]);
  });

  test('historier', async () => {
    expect(await unprefixedLinks('/de/historier')).toEqual([]);
  });

  test('tidslinjen', async () => {
    expect(await unprefixedLinks('/de/tidslinje')).toEqual([]);
  });

  test('dager', async () => {
    expect(await unprefixedLinks('/de/dager')).toEqual([]);
  });

  test('kjente vers', async () => {
    expect(await unprefixedLinks('/de/kjente-vers')).toEqual([]);
  });

  test('oversettelser', async () => {
    expect(await unprefixedLinks('/de/oversettelser')).toEqual([]);
  });

  test('om-siden', async () => {
    expect(await unprefixedLinks('/de/om')).toEqual([]);
  });

  test('søkesiden med treff', async () => {
    expect(await unprefixedLinks('/de/sok?q=gud')).toEqual([]);
  });

  test('prefikset følger locale-en, ikke en fast verdi', async () => {
    const html = await (await app.request('/fi/1mos/1')).text();
    expect(html).toContain('href="/fi/');
    expect(html).not.toContain('href="/de/');
  });
});

// Ordboks-fullstendighet. `makeT` faller tilbake til å returnere NØKKELEN når
// en oversettelse mangler, så en glemt nøkkel vises som «rd.markRead» i UI-et i
// stedet for å feile. Denne sveipen fanger det før deploy.
describe('ordbøkene er komplette', () => {
  for (const locale of LOCALES) {
    test(`${locale} mangler ingen nøkler fra basespråket`, () => {
      expect(missingKeys(locale)).toEqual([]);
    });
  }
});
