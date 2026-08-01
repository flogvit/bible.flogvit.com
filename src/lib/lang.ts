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
// **Engelsk er gulvet** (GitHub #26, endret fra `nb` 2026-07-29). I18N.md §1:
// engelsk er basespråket, og med osen og alt avledet innhold på plass finnes
// engelsk for praktisk talt alt. En forespørsel om et språk vi ikke har
// generert ender derfor på `en` framfor å vise norsk tekst på en side som ikke
// er norsk. Kjeden er fortsatt språkbevisst: nynorsk faller til bokmål før
// engelsk, fordi nabospråket ligger nærmere enn basespråket.
//
// Konsekvensen er bevisst: mangler noe også på engelsk, vises INGENTING framfor
// norsk. Norsk-spesifikt innhold (`reading_texts`) blir
// dermed tomt på andre språk — det er riktig, ikke et hull å tette.
//
// Nye språk krever INGEN kodeendring her: importøren oppdager språk-kataloger på
// disk, og et språk vi ikke har innhold for faller bare gjennom kjeden.

import { getContext } from 'hono/context-storage';
import { LOCALES, type Locale } from './i18n.ts';

/**
 * Innholdsspråket alt annet faller tilbake til, og terminalt i kjeden.
 * Sammenfaller med basespråket etter #26 — de to var skilt så lenge
 * opphavsspråket (norsk) var det eneste komplette.
 */
export const DEFAULT_CONTENT_LANGUAGE = 'en';

/** Basespråk for oversettelser (I18N.md §1). Se over: nå samme som gulvet. */
export const BASE_CONTENT_LANGUAGE = 'en';

/** Norsk bokmål — opphavsspråket for innholdet, og nynorskens nabospråk. */
const NORWEGIAN_BOKMAAL = 'nb';

/**
 * Nærmeste nabospråk, forsøkt FØR basespråket. Nynorsk-lesere skal få bokmål
 * framfor engelsk når nynorsk mangler.
 */
const NEIGHBOUR_LANGUAGES: Record<string, string[]> = {
  nn: [NORWEGIAN_BOKMAAL],
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
  // `no` er norsk, ikke «gulvet» — den skal til bokmål selv etter at gulvet ble
  // engelsk (#26). Å bruke DEFAULT_CONTENT_LANGUAGE her ville sendt norske
  // lesere til engelsk innhold.
  return lang === 'no' ? NORWEGIAN_BOKMAAL : lang;
}

/**
 * Innholdsspråket for forespørselen vi står i, hentet fra AsyncLocalStorage
 * (contextStorage-middleware i `app.ts`) — samme mekanisme som `lhref()`.
 *
 * Dette er DEFAULTEN til getterne i `bible.ts`. Grunnen: en getter som
 * defaulter til et fast språk gjør «glemte å sende lang» til et USYNLIG valg
 * — siden rendrer fint, bare på feil språk. Det var nettopp det som skjedde:
 * kun `reading.tsx` sendte språk, så alle de andre sidene (personer,
 * historier, temaer, tidslinje, dager …) serverte norsk innhold under /en/
 * selv om det engelske lå i basen.
 *
 * Utenfor request-kontekst (tester, skript, statisk generering) faller den til
 * gulvet framfor å kaste. Et eksplisitt `lang`-argument vinner alltid.
 */
export function currentContentLanguage(): string {
  try {
    const locale = getContext<{ Variables: { locale?: string } }>().var.locale;
    return locale ? localeToContentLanguage(locale) : DEFAULT_CONTENT_LANGUAGE;
  } catch {
    // getContext() kaster utenfor request — det er den forventede veien hit.
    return DEFAULT_CONTENT_LANGUAGE;
  }
}

/**
 * Fallback-kjeden for et forespurt språk, i prioritert rekkefølge og uten
 * duplikater. Første språk med innhold vinner (se `bible.ts`).
 *
 *   en      → en                (gulvet er terminalt)
 *   nb      → nb, en
 *   nn      → nn, nb, en        (nabospråk framfor basespråket)
 *   de      → de, en
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

/**
 * UI-locale-ene som faktisk får innhold når innholdet bare finnes i
 * `languages` — altså hvilke av de åtte adressene som svarer 200 (GitHub #45).
 *
 * Utledet av SAMME fallback-kjede som spørringen bruker, ikke av en egen liste:
 * finnes en lesetekst bare på `nb`, får `nn` den likevel (nabospråk før
 * basespråket), mens `de`/`en`/`sv`/… ender tomme og siden 404-er. Svaret blir
 * dermed `['nb', 'nn']` uten at noen har ført det opp noe sted.
 *
 * Finnes fordi hreflang-klyngen ble generert generisk fra STIEN: hver norsk
 * lesetekst-side annonserte alle åtte språk, og sju av dem var 404. Vi lenket
 * dem ikke i navigasjonen, men en crawler trenger ingen lenke når
 * `<link rel="alternate">` sier at siden finnes — 1228 av 1542 feillinjer på én
 * time var nettopp disse.
 *
 * Rekkefølgen følger `LOCALES` slik at klyngen er stabil mellom render.
 */
export function localesWithContent(languages: readonly string[]): Locale[] {
  const have = new Set(languages.map((l) => normalizeContentLanguage(l)));
  return LOCALES.filter((locale) => contentLanguageChain(locale).some((c) => have.has(c)));
}

/**
 * Plukker teksten for leserens språk ut av et språkkart, via samme
 * fallback-kjede som alt annet innhold.
 *
 * Returnerer også hvilket språk som faktisk vant, slik at kalleren kan sette
 * `lang` på elementet når teksten ikke er på sidens språk. Uten det leser en
 * skjermleser engelsk tekst med tysk uttale.
 *
 * Tåler at `value` er en ren streng: `legacy[].text` var det fram til
 * free-bible#23, og de to formene lever side om side til dataene er lagt om.
 * En streng har ukjent språk, så `lang` er null — merking ville vært en gjetning.
 */
export function pickLocalisedText(
  value: string | Record<string, string> | null | undefined,
  requested?: string | null,
): { text: string; lang: string | null } | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    return value ? { text: value, lang: null } : null;
  }
  const pageLanguage = localeToContentLanguage(requested ?? currentContentLanguage());
  for (const candidate of contentLanguageChain(requested ?? currentContentLanguage())) {
    const text = value[candidate];
    if (typeof text === 'string' && text) {
      return { text, lang: candidate === pageLanguage ? null : candidate };
    }
  }
  return null;
}
