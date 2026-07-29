// UI-flerspråk for bibel. Kontrakt: portal/I18N.md.
//
// TRE AKSER som ikke må blandes — bibel er det eneste produktet med alle tre:
//
//   1. UI-locale        — denne fila. URL-prefikset `/<lang>/`, chrome, knapper.
//   2. Innholdsspråk    — lib/lang.ts. Hvilket språk de deriverte tekstene
//                         (sammendrag, kontekst, temaer) er generert på.
//   3. Bibelutgave      — osnb, osnn, SBLGNT, Tanach. Et EGET, eksplisitt
//                         brukervalg som IKKE skal rives med av språkvalget:
//                         norsk UI + gresk grunntekst er en bevisst, gyldig
//                         kombinasjon.
//
// Akse 1 og 2 møtes i `localeToContentLanguage()` (lib/lang.ts). Akse 3 røres
// ikke herfra.

import { getContext } from 'hono/context-storage';


export const LOCALES = ['en', 'nb', 'nn', 'sv', 'fr', 'es', 'fi', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = LOCALES[0];

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

// Nynorsk faller til bokmål FØR engelsk (I18N.md §1) — nabospråket ligger nærare.
const FALLBACKS: Record<Locale, readonly Locale[]> = {
  en: [], nb: ['en'], nn: ['nb', 'en'], sv: ['en'],
  fr: ['en'], es: ['en'], fi: ['en'], de: ['en'],
};

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English', nb: 'Norsk bokmål', nn: 'Norsk nynorsk', sv: 'Svenska',
  fr: 'Français', es: 'Español', fi: 'Suomi', de: 'Deutsch',
};

const INTL_TAG: Record<Locale, string> = {
  en: 'en-GB', nb: 'nb-NO', nn: 'nn-NO', sv: 'sv-SE',
  fr: 'fr-FR', es: 'es-ES', fi: 'fi-FI', de: 'de-DE',
};
export const ogLocale = (l: Locale) => INTL_TAG[l].replace('-', '_');
export const intlTag = (l: Locale) => INTL_TAG[l];

/**
 * BCP-47-taggen for forespørselens locale, hentet fra contextStorage — samme
 * kilde som `lhref()`. Finnes fordi datoformatering skjer dypt nede i
 * komponenter som ikke har noen annen grunn til å kjenne språket, og fordi
 * alternativet (`toLocaleDateString('nb-NO')`) gir norske datoer på alle
 * språk uten å feile noe sted (#25).
 */
export function currentIntlTag(): string {
  try {
    return INTL_TAG[getContext<{ Variables: { locale?: Locale } }>().var.locale ?? DEFAULT_LOCALE];
  } catch {
    return INTL_TAG[DEFAULT_LOCALE];
  }
}

/** Makrospråket `no` er tvetydig og normaliseres til bokmål (I18N.md §2). */
export function normalizeLocale(code: string | undefined | null): Locale | null {
  const c = (code || '').toLowerCase().split('-')[0]!;
  if (c === 'no') return 'nb';
  return isLocale(c) ? c : null;
}

export function negotiateAcceptLanguage(header: string | undefined | null): Locale | null {
  if (!header) return null;
  const ranked = header.split(',').map((part) => {
    const [tag, ...params] = part.trim().split(';');
    const qp = params.find((p) => p.trim().startsWith('q='));
    const q = qp ? Number(qp.split('=')[1]) : 1;
    return { tag: (tag || '').trim(), q: Number.isFinite(q) ? q : 0 };
  }).filter((x) => x.tag).sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const l = normalizeLocale(tag);
    if (l) return l;
  }
  return null;
}

export function localeFromPrefsCookie(raw: string | undefined | null): Locale | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(decodeURIComponent(raw)) as { lang?: unknown };
    return typeof p.lang === 'string' ? normalizeLocale(p.lang) : null;
  } catch { return null; }
}

export function negotiateLocale(cookie: string | undefined | null, accept: string | undefined | null): Locale {
  return localeFromPrefsCookie(cookie) ?? negotiateAcceptLanguage(accept) ?? DEFAULT_LOCALE;
}

/** Språkprefikset i en URL-sti, om det er der. `/en/1mos/1` → `en`. */
export function localeFromPath(path: string | undefined | null): Locale | null {
  const m = /^\/([a-z]{2})(?=\/|$)/.exec(path || '');
  return m && isLocale(m[1]) ? m[1] : null;
}

/**
 * Locale for et API-kall (#24). `/api/*` er montert uprefikset og får derfor
 * ingen locale fra ruta slik sidene gjør, så uten dette svarte hele API-et på
 * gulvet uansett hvilket språk leseren sto på — og alt studieinnhold som
 * hentes etter sidevisningen ble feil språk.
 *
 * Rekkefølgen holder på regelen om at URL-en vinner over cookien: et
 * eksplisitt `?lang=` først, så språkprefikset i siden som gjorde kallet
 * (Referer er sidens URL, ikke brukerens preferanse), og først til slutt
 * cookie/Accept-Language.
 */
export function apiLocale(req: {
  query: (k: string) => string | undefined;
  header: (k: string) => string | undefined;
}, cookie: string | undefined | null): Locale {
  const explicit = normalizeLocale(req.query('lang'));
  if (explicit) return explicit;
  const referer = req.header('referer');
  if (referer) {
    try {
      const fromPage = localeFromPath(new URL(referer).pathname);
      if (fromPage) return fromPage;
    } catch {
      // Ugyldig Referer — gå videre til forhandling.
    }
  }
  return negotiateLocale(cookie, req.header('accept-language'));
}

/** Prefiks en sti med språkroten. Forsiden blir `/nb`, uten skråstrek til slutt. */
export function href(locale: Locale, path: string): string {
  const rest = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${rest}`;
}


/**
 * Som `href()`, men henter locale fra request-konteksten (GitHub #18).
 *
 * Uprefiksede lenker 302-redirecter til den FORHANDLEDE locale-en, ikke den
 * leseren er på — en norsk nettleser som leser den engelske utgaven ble kastet
 * til /nb/ ved første klikk, og hvert klikk kostet en ekstra rundtur.
 *
 * Locale hentes fra AsyncLocalStorage (contextStorage-middleware i app.ts, samme
 * mekanisme som konto-chipen i layout) framfor å tres gjennom hvert
 * komponentkall: lenkene ligger dypt nede i komponenter som ikke har noen annen
 * grunn til å kjenne språket.
 *
 * Utenfor request-kontekst (tester, statisk generering) faller den til
 * basespråket framfor å kaste.
 */
export function lhref(path: string): string {
  try {
    const locale = getContext<{ Variables: { locale?: Locale } }>().var.locale;
    return href(locale ?? DEFAULT_LOCALE, path);
  } catch {
    return href(DEFAULT_LOCALE, path);
  }
}

/** Stien uten språkprefiks — grunnlaget for hreflang og språkbytte. */
export function stripLocale(path: string): string {
  const m = /^\/([a-z]{2})(?=\/|$)/.exec(path);
  return m && isLocale(m[1]) ? path.slice(3) || '/' : path;
}

import { DICTIONARIES } from './dictionaries.ts';
export type MessageKey = keyof (typeof DICTIONARIES)['en'];
export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Er dette en nøkkel ordboka faktisk har? Trengs fordi noen nøkler settes
 * sammen først ved kjøretid fra enum-verdier i dataene (`era.exodus`,
 * `story.cat.paulus`, `day.cat.trinity`, #21). Uten sjekken må kalleren caste,
 * og da forsvinner nettopp den typesikkerheten som gjør at en glemt
 * oversettelse blir en byggefeil.
 */
export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(DICTIONARIES.en, key);
}

/**
 * Oppslag for slike sammensatte nøkler. En enum-verdi vi ikke har etikett for
 * viser seg selv (`divided-kingdom`) framfor å bli tom — synlig, men ikke
 * ødeleggende, og lett å oppdage.
 */
export function tEnum(t: Translator, prefix: string, value: string): string {
  const key = `${prefix}${value}`;
  return isMessageKey(key) ? t(key) : value;
}

/**
 * Strengene en klient-øy trenger, som JSON til et `data-strings`-attributt.
 *
 * Finnes fordi øyene i `public/js/` bygger DOM selv og dermed sto HELT utenfor
 * ordboka: de fire strengene `home.js` skriver var norske på alle åtte språk,
 * og hverken nøkkelsveipen eller norsk-vakta kunne se dem — de rendrer SSR-HTML
 * (#33). Ordboka blir værende på serveren; øya får bare nøklene den bruker, med
 * `{plassholdere}` i behold og `fillIn()` som substitusjon.
 */
export function islandStrings(t: Translator, keys: readonly MessageKey[]): string {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = t(k);
  return JSON.stringify(out);
}

/**
 * Visningsnavn for en språkkode (ISO 639-1 eller -3) på sidens språk.
 *
 * Utgavedataene har over 70 språkkoder og 17 skriftkoder; å legge dem i
 * ordboka ville vært ~700 strenger som ICU alt kan. `Intl.DisplayNames` er
 * innebygd og web-standard, altså førstevalget her (jf. minimal deps).
 * Ordboka får overstyre først, fordi ICU mangler et par bibelspråk (`hbo`).
 * En kode ICU ikke kjenner viser seg selv framfor å bli tom — samme regel som
 * `tEnum`.
 */
export function langName(t: Translator, code: string): string {
  const override = `ed.lang.${code}`;
  if (isMessageKey(override)) return t(override);
  return displayName('language', code);
}

/** Visningsnavn for en ISO 15924-skriftkode (`Latn` → «latinsk»). */
export function scriptName(code: string): string {
  return displayName('script', code);
}

function displayName(type: 'language' | 'script', code: string): string {
  try {
    return new Intl.DisplayNames([currentIntlTag()], { type, fallback: 'none' }).of(code) ?? code;
  } catch {
    // Strukturelt ugyldig kode — Intl kaster, koden vises rå.
    return code;
  }
}

export function makeT(locale: Locale): Translator {
  const chain: Locale[] = [locale, ...(FALLBACKS[locale] ?? ['en'])];
  return (key, params) => {
    let text: string | undefined;
    for (const l of chain) {
      const hit = (DICTIONARIES[l] as Record<string, string>)[key as string];
      if (hit) { text = hit; break; }
    }
    let out = text ?? (key as string);
    if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}

export function missingKeys(locale: Locale): string[] {
  return Object.keys(DICTIONARIES.en).filter((k) => !(DICTIONARIES[locale] as Record<string, string>)[k]);
}

/**
 * Layout-props utledet fra requesten. Locale settes av språkmonteringen i
 * app.ts (URL-en vinner, I18N.md §2), og `path` er stien uten prefiks — altså
 * nøyaktig det hreflang-klyngen trenger.
 *
 * Finnes som helper fordi bibel har 31 Layout-kallsteder: å utlede det ett sted
 * er både kortere og vanskeligere å glemme enn å sende to props hver gang.
 */
export function layoutProps(c: { get: (k: 'locale') => unknown; req: { path: string } }): {
  locale: Locale;
  path: string;
} {
  const raw = c.get('locale');
  const locale = isLocale(raw as string) ? (raw as Locale) : DEFAULT_LOCALE;
  return { locale, path: stripLocale(c.req.path) };
}

/** Oversetteren for gjeldende request. */
/**
 * Oversetteren for forespørselen vi står i, uten å tre `c` gjennom hvert
 * komponentkall — samme contextStorage-kilde som `lhref()`. Dype
 * presentasjonskomponenter (`views/`) har ingen annen grunn til å kjenne
 * konteksten, og uten dette endte teksten deres som hardkodede strenger (#22).
 */
export function tCtx(): Translator {
  try {
    const locale = getContext<{ Variables: { locale?: Locale } }>().var.locale;
    return makeT(isLocale(locale) ? locale : DEFAULT_LOCALE);
  } catch {
    return makeT(DEFAULT_LOCALE);
  }
}

export function tFor(c: { get: (k: 'locale') => unknown }): Translator {
  const raw = c.get('locale');
  return makeT(isLocale(raw as string) ? (raw as Locale) : DEFAULT_LOCALE);
}
