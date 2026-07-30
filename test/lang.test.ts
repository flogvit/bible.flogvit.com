import { describe, expect, test } from 'bun:test';
import {
  BASE_CONTENT_LANGUAGE,
  DEFAULT_CONTENT_LANGUAGE,
  contentLanguageChain,
  isLanguageCode,
  localeToContentLanguage,
  localesWithContent,
  normalizeContentLanguage,
} from '../src/lib/lang.ts';
import { LOCALES } from '../src/lib/i18n.ts';

// Språkdimensjonen for innhold: locale (URL) vs innholdsspråk (free-bible-katalog
// og language-kolonnen), og fallback-kjeden der engelsk er gulvet (#26).

describe('normalizeContentLanguage', () => {
  test('tomt/ugyldig faller til gulvet', () => {
    expect(normalizeContentLanguage(null)).toBe(DEFAULT_CONTENT_LANGUAGE);
    expect(normalizeContentLanguage('')).toBe(DEFAULT_CONTENT_LANGUAGE);
    expect(normalizeContentLanguage('nb; DROP TABLE verses')).toBe(DEFAULT_CONTENT_LANGUAGE);
    expect(normalizeContentLanguage('../nb')).toBe(DEFAULT_CONTENT_LANGUAGE);
  });

  test('beholder skript-/regionsundertagger med riktig kasus', () => {
    expect(normalizeContentLanguage('ZH-hans')).toBe('zh-hans');
    expect(normalizeContentLanguage('zh-Hans')).toBe('zh-Hans');
    expect(normalizeContentLanguage(' EN ')).toBe('en');
  });
});

describe('localeToContentLanguage', () => {
  test('locale no → innholdsspråk nb', () => {
    expect(localeToContentLanguage('no')).toBe('nb');
  });

  test('andre koder går uendret gjennom', () => {
    expect(localeToContentLanguage('nn')).toBe('nn');
    expect(localeToContentLanguage('en')).toBe('en');
    expect(localeToContentLanguage('de')).toBe('de');
  });
});

describe('contentLanguageChain', () => {
  test('gulvet er terminalt — ingenting forsøkes etter en', () => {
    expect(contentLanguageChain('en')).toEqual(['en']);
    expect(contentLanguageChain(BASE_CONTENT_LANGUAGE)).toEqual(['en']);
  });

  test('norsk faller til engelsk, ikke omvendt (#26)', () => {
    expect(contentLanguageChain('nb')).toEqual(['nb', 'en']);
    expect(contentLanguageChain('no')).toEqual(['nb', 'en']);
  });

  test('nynorsk tar bokmål FØR engelsk — nabospråk før basespråk', () => {
    expect(contentLanguageChain('nn')).toEqual(['nn', 'nb', 'en']);
  });

  test('andre språk går rett til gulvet', () => {
    expect(contentLanguageChain('de')).toEqual(['de', 'en']);
    expect(contentLanguageChain('zh-Hans')).toEqual(['zh-Hans', 'en']);
  });

  test('ugyldig språk gir bare gulvet', () => {
    expect(contentLanguageChain('tøys!')).toEqual(['en']);
  });
});

// Hvilke av de åtte adressene som faktisk svarer 200 (#45). Utledet av
// fallback-kjeden, ikke av en liste noen må vedlikeholde.
describe('localesWithContent', () => {
  test('norsk-bare innhold gir nb + nn — nynorsk arver bokmål', () => {
    expect(localesWithContent(['nb'])).toEqual(['nb', 'nn']);
  });

  test('engelsk er gulvet i hver kjede, så en engelsk rad dekker alle åtte', () => {
    expect(localesWithContent(['en'])).toEqual([...LOCALES]);
  });

  test('et språk uten naboer dekker bare seg selv', () => {
    expect(localesWithContent(['de'])).toEqual(['de']);
  });

  test('flere språk union-es, i LOCALES-rekkefølge', () => {
    expect(localesWithContent(['de', 'nb'])).toEqual(['nb', 'nn', 'de']);
  });

  test('tomt innhold gir ingen locales — kalleren skal ikke annonsere noe', () => {
    expect(localesWithContent([])).toEqual([]);
  });

  test('ugyldig språkkode teller som gulvet, ikke som seg selv', () => {
    // normalizeContentLanguage sender søppel til `en`, og da er ALLE dekket —
    // det er den samme regelen spørringen følger, så klyngen kan ikke sprike.
    expect(localesWithContent(['tøys!'])).toEqual([...LOCALES]);
  });
});

describe('isLanguageCode', () => {
  test('godtar velformede koder', () => {
    expect(isLanguageCode('nb')).toBe(true);
    expect(isLanguageCode('zh-Hans')).toBe(true);
    expect(isLanguageCode('pt-BR')).toBe(true);
  });

  test('avviser alt annet — katalognavn og injeksjon', () => {
    expect(isLanguageCode('bibles_raw')).toBe(false);
    expect(isLanguageCode('..')).toBe(false);
    expect(isLanguageCode('nb/../..')).toBe(false);
    expect(isLanguageCode('')).toBe(false);
  });
});
