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

/** Prefiks en sti med språkroten. Forsiden blir `/nb`, uten skråstrek til slutt. */
export function href(locale: Locale, path: string): string {
  const rest = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${rest}`;
}

/** Stien uten språkprefiks — grunnlaget for hreflang og språkbytte. */
export function stripLocale(path: string): string {
  const m = /^\/([a-z]{2})(?=\/|$)/.exec(path);
  return m && isLocale(m[1]) ? path.slice(3) || '/' : path;
}

import { DICTIONARIES } from './dictionaries.ts';
export type MessageKey = keyof (typeof DICTIONARIES)['en'];
export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

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
export function tFor(c: { get: (k: 'locale') => unknown }): Translator {
  const raw = c.get('locale');
  return makeT(isLocale(raw as string) ? (raw as Locale) : DEFAULT_LOCALE);
}
