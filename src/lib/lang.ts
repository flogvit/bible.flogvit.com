// Språkdimensjonen for bibelINNHOLD (det deriverte innholdet som importeres fra
// free-bible/generate/<type>/<språk>/).
//
// To akser som er lette å blande sammen:
//
// - **UI-locale** — koden i URL-prefikset (portal/I18N.md §2). Der heter norsk
//   `no`, og engelsk (`en`) er basespråk og `x-default`.
// - **Innholdsspråk** — katalognavnet i free-bible og verdien i `language`-
//   kolonnen. Norsk finnes der i to skriftformer, `nb` (bokmål) og `nn`
//   (nynorsk), så locale `no` må mappes eksplisitt til ett av dem.
//
// Derfor: bruk `localeToContentLanguage()` i grensesnittet mellom URL/locale og
// databasen, aldri locale-koden rått i en spørring.
//
// **Norsk er gulvet.** I18N.md §1: opphavsspråket finnes for alt innhold, så en
// forespørsel om et språk vi ikke har generert ender alltid på `nb` framfor å
// vise en tom side. Fallback-kjeden er språkbevisst: nynorsk faller til bokmål
// (ikke til engelsk), og `nb` er terminal.
//
// Nye språk krever INGEN kodeendring her: importøren oppdager språk-kataloger på
// disk, og et språk vi ikke har innhold for faller bare gjennom kjeden.

/** Innholdsspråket alt annet faller tilbake til. Finnes for alt innhold. */
export const DEFAULT_CONTENT_LANGUAGE = 'nb';

/** Basespråk for oversettelser (I18N.md §1) — forsøkes før gulvet. */
export const BASE_CONTENT_LANGUAGE = 'en';

/**
 * Nærmeste nabospråk, forsøkt FØR basespråket. Nynorsk-lesere skal få bokmål
 * framfor engelsk når nynorsk mangler.
 */
const NEIGHBOUR_LANGUAGES: Record<string, string[]> = {
  nn: [DEFAULT_CONTENT_LANGUAGE],
};

/**
 * Formen på en språkkode: ISO 639-1/-3 pluss valgfrie undertagger
 * (`nb`, `en`, `zh-Hans`, `pt-BR`). Vi validerer på FORM, ikke mot en liste —
 * en hardkodet liste ville måttet vedlikeholdes for hvert nye språk, og et språk
 * vi ikke har innhold for faller uansett trygt gjennom fallback-kjeden.
 */
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Er dette en velformet språkkode (og dermed trygg å bruke i en spørring)? */
export function isLanguageCode(value: string): boolean {
  return LANGUAGE_CODE.test(value);
}

/**
 * Normaliserer et innholdsspråk fra utsiden (query-param, cookie, katalognavn).
 * Ugyldige verdier faller til gulvet framfor å nå databasen.
 */
export function normalizeContentLanguage(value: string | null | undefined): string {
  if (!value) return DEFAULT_CONTENT_LANGUAGE;
  const trimmed = value.trim();
  // Bare skriptet/regionen er versal-følsom i BCP-47 (zh-Hans, pt-BR).
  const [primary, ...rest] = trimmed.split('-');
  const candidate = [primary!.toLowerCase(), ...rest].join('-');
  return isLanguageCode(candidate) ? candidate : DEFAULT_CONTENT_LANGUAGE;
}

/**
 * UI-locale (URL-prefiks) → innholdsspråk. `no` er locale-koden for norsk i
 * I18N.md, mens innholdet ligger under `nb`/`nn`.
 */
export function localeToContentLanguage(locale: string | null | undefined): string {
  const lang = normalizeContentLanguage(locale);
  return lang === 'no' ? DEFAULT_CONTENT_LANGUAGE : lang;
}

/**
 * Fallback-kjeden for et forespurt språk, i prioritert rekkefølge og uten
 * duplikater. Første språk med innhold vinner (se `bible.ts`).
 *
 *   nb      → nb                (gulvet er terminalt)
 *   nn      → nn, nb            (nabospråk framfor engelsk)
 *   en      → en, nb
 *   de      → de, en, nb
 */
export function contentLanguageChain(requested: string | null | undefined): string[] {
  const lang = localeToContentLanguage(requested);
  const chain = [lang, ...(NEIGHBOUR_LANGUAGES[lang] ?? []), BASE_CONTENT_LANGUAGE, DEFAULT_CONTENT_LANGUAGE];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of chain) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
    // Gulvet er terminalt: ingenting forsøkes etter nb.
    if (candidate === DEFAULT_CONTENT_LANGUAGE) break;
  }
  return result;
}
