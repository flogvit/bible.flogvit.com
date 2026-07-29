// Språket klient-øyene skal bruke. Serveren rendrer `<html lang>` per locale
// (sidekontrakten vokter det), så DOM-en er den ene kilden — klienten skal
// verken lese cookien eller gjette ut fra URL-en.
//
// Finnes fordi alternativet var å hardkode 'nb-NO' på hvert kallsted, og det
// ga norske datoer på alle åtte språk uten å feile noe sted (#25). Samme
// nøkkel brukes for `?lang=` mot /api/*, som ellers defaulter til gulvet (#24).

/** Locale-koden siden er rendret på ('en', 'nb', 'nn', …). */
export function pageLocale() {
  return document.documentElement.lang || 'en';
}

/**
 * Locale-argument til Intl/`toLocale*String`. De rene språkkodene våre er
 * gyldige BCP-47-tagger, så de kan sendes rått; `undefined` (nettleserens eget
 * språk) er feil svar her, for siden har allerede valgt språk.
 */
export function intlLocale() {
  return pageLocale();
}

/** `?lang=`-suffiks for API-kall, klart til å limes på en URL med `?` fra før. */
export function langParam() {
  return `lang=${encodeURIComponent(pageLocale())}`;
}

/**
 * Klient-sidens `lhref()`: prefiks en intern sti med sidens språk.
 *
 * Lenker en øy bygger uten prefiks 302-redirecter til den FORHANDLEDE
 * locale-en, ikke den leseren står på — nøyaktig #18, men i DOM-en, der
 * `link-prefix.test.ts` (som rendrer SSR-HTML) ikke ser den. `home.js` sendte
 * en engelsk leser til /nb/ på første klikk fra forsiden (#33).
 *
 * Unntakene fra SSR-siden gjelder her også: `/js/`, `/css/`, `/api/` og
 * eksterne URL-er skal IKKE prefikses.
 */
export function localeHref(path) {
  if (!path || !path.startsWith('/') || /^\/(js|css|api|img|fonts)\//.test(path)) return path;
  return `/${pageLocale()}${path === '/' ? '' : path}`;
}

/**
 * Strengene serveren la på et `data-strings`-attributt (`islandStrings()` i
 * lib/i18n.ts). Ordboka bor på serveren; øya får bare nøklene den bruker.
 * Mangler attributtet, returneres nøkkelen — synlig, men ikke ødeleggende.
 */
export function readStrings(el) {
  let dict = {};
  try {
    dict = JSON.parse(el?.dataset?.strings || '{}');
  } catch {
    dict = {};
  }
  return (key, params) => {
    let out = dict[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}
