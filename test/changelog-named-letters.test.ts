// EN BOKSTAV SOM NEVNES ER SITERT NORSK — ET ORD ER DET IKKE.
//
// Bibels deploy sto stille fra 17:31 2026-08-07 med fire kort i «Ferdig, ikke
// levert» bak seg. Testporten ER merge- og deploy-porten, og én test var rød:
//
//     (fail) sidekontrakt > ingen æ/ø/å i synlig tekst under /en/ > endringslogg
//       norske: ["æ", "ø", "å"]   side: /changes
//
// `RELEASE.md` er engelsk, som den skal være. Posten handlet om #49 og #61 —
// altså om norske bokstaver i person-id-er — og måtte navngi dem:
//
//     Links to people with æ, ø or å in their names now lead somewhere.
//
// Å skrive om posten ville virket denne gangen og feilet neste: repoet har fire
// åpne saker om nettopp de bokstavene i adresser. En endringslogg som ikke kan
// si hva den fikset, er ikke en endringslogg. Se #88.
//
// FAREN VED FIKSEN er at den svekker vakta. Derfor er den viktigste prøven her
// den NEGATIVE: et norsk ORD skal fortsatt fanges. Regelen er tokenet — en
// bokstav ALENE — ikke tegnet.

import { describe, expect, test } from 'bun:test';
import { namedLetterParts } from '../src/routes/pages/changes.tsx';

/** Samme sveip `page-contract.test.ts` gjør: `lang="nb"` er sitert norsk. */
const synligTekst = (html: string) =>
  html
    .replace(/<([a-z]+)[^>]*\blang="(?:nb|nn)"[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n');

/** Antall deler som ble MERKET (alt annet er ren tekst). */
const merkede = (t: string) => namedLetterParts(t).filter((p) => typeof p !== 'string').length;

describe('en bokstav som staar ALENE blir merket', () => {
  test('den maalte setningen fra RELEASE.md', () => {
    expect(merkede('Links to people with æ, ø or å in their names')).toBe(3);
  });

  test('stor bokstav teller likt', () => {
    expect(merkede('The letter Ø is not the letter O')).toBe(1);
  });

  test('en ren engelsk setning roeres ikke', () => {
    expect(namedLetterParts('Share cards now render correctly')).toEqual([
      'Share cards now render correctly',
    ]);
  });
});

describe('et norsk ORD merkes ALDRI — ellers svekker fiksen vakta', () => {
  // DEN VIKTIGSTE. Blir denne merket, kan en glemt oversettelse gjemme seg bak
  // fiksen, og invariant 2 slutter aa vaere en port.
  test('«Mørk» er ikke en omtalt bokstav', () => {
    expect(merkede('Mørk')).toBe(0);
  });

  test('flere norske ord i samme setning slipper heller ikke gjennom', () => {
    expect(merkede('Endringsloggen støttes på søkesiden')).toBe(0);
  });

  // Bokstaven inni et ord er ikke omtalt, uansett hvilket ord det er.
  test('bokstaven inni et ord merkes ikke', () => {
    expect(merkede('bokmål')).toBe(0);
  });
});

describe('og sveipen ser resultatet', () => {
  // Uten dette ville regelen vaert groenn mens sida fortsatt viste tegnet
  // umerket — det er RENDRINGEN som avgjoer hva vakta leser.
  test('den merkede bokstaven forsvinner ut av synlig tekst', () => {
    const html = `<li lang="en">with ${'<span lang="nb">æ</span>'} in names</li>`;

    expect(synligTekst(html)).not.toContain('æ');
    expect(synligTekst(html)).toContain('in names');
  });

  test('en UMERKET bokstav blir staaende — sveipen ville fortsatt sett den', () => {
    expect(synligTekst('<li lang="en">with æ in names</li>')).toContain('æ');
  });
});
