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
