// Temaets tittel utledes ETT sted (GitHub #44).
//
// `themes` har bare `id, name, content, language`. `name` ER slugen, og tittelen
// bor i JSON-en i `content`. /temaer parset `content`; søkeresultatene leste
// `name` direkte, og viste derfor «guds-hellighet» der /temaer viste «Guds
// hellighet» — samme tema, to utseender, avhengig av hvilken side du kom fra.
//
// Testen vokter utledningen, ikke rendringen: så lenge begge sidene kaller
// themeTitle() kan de ikke drive fra hverandre igjen.

import { describe, expect, test } from 'bun:test';
import { themeTitle } from '../src/lib/bible.ts';

describe('themeTitle', () => {
  test('tittelen kommer fra JSON-en, ikke fra slugen', () => {
    const row = {
      name: 'guds-hellighet',
      content: JSON.stringify({ title: 'Guds hellighet', sections: [] }),
    };
    expect(themeTitle(row)).toBe('Guds hellighet');
  });

  test('tom tittel i JSON-en faller til slugen med stor forbokstav', () => {
    const row = { name: 'guds-trofasthet', content: JSON.stringify({ title: '', sections: [] }) };
    expect(themeTitle(row)).toBe('Guds-trofasthet');
  });

  test('eldre temaer er ren tekst og ikke JSON', () => {
    const row = { name: 'nade', content: 'Nåde:Guds ufortjente godhet\n' };
    expect(themeTitle(row)).toBe('Nade');
  });

  test('utledningen returnerer aldri den rå slugen ubehandlet', () => {
    // Poenget i #44: en leser skal ikke møte «guds-hellighet» som overskrift.
    const rows = [
      { name: 'guds-hellighet', content: JSON.stringify({ title: 'Guds hellighet', sections: [] }) },
      { name: 'guds-hellighet', content: 'ikke json' },
      { name: 'guds-hellighet', content: '{}' },
    ];
    for (const row of rows) expect(themeTitle(row)).not.toBe(row.name);
  });
});
