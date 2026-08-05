// ADRESSEN VI PUBLISERER — ett opphav, og ÉN koding (#80).
//
// Interne stier er RÅ med vilje: rutene bærer `ø`/`æ`/`å` (`/1krøn/15`), og
// `toUrlSlug()` bevarer dem fordi det er den formen lenker og ruter bruker.
// Men en adresse vi sender ut som ABSOLUTT — canonical, hreflang, `og:image`,
// sitemap — leses av en maskin som ikke er vår, og den skal være
// prosentkodet. Sidemalen sendte rå bytes mens sitemapen kodet de samme
// adressene, altså var de to uenige om hva adressen ER: en crawler som fikk
// den rå formen sendte `GET /og/en/1kr` — prefikset fram til første
// ikke-ASCII-byte — og fikk 404 på delekortet.
//
// Kodingen hører derfor i det ene leddet som setter sti sammen med opphav, og
// INGEN andre steder. Særlig ikke i `toUrlSlug()`: den brukes også der rå form
// er riktig, og #42 viser hva som skjer når en verdi tar en runde gjennom en
// kodet representasjon og kodes på nytt (`%C3%B8` → `%25C3%25B8`, 95 kapitler
// 404 i alle åtte sitemaps). Én representasjon internt, én koding ved utsending.

// Ikke eksportert, og det er poenget: den ENESTE måten å bygge en absolutt
// adresse på er `absoluteUrl()`. Er konstanten tilgjengelig, er `SITE + sti`
// tilgjengelig — og det var nettopp fire slike konkateneringer som gikk utenom
// kodingen. Trenger en test opphavet, skriver den det selv.
const SITE = 'https://bible.flogvit.com';

/**
 * Absolutt, publisert adresse for en RÅ intern sti (`/en/1krøn/15`).
 *
 * `encodeURI`, ikke `encodeURIComponent`: stien er en sti, og `/`, `?`, `&`
 * og `=` skal stå som de er. Den er idempotent for ren ASCII, som er hvorfor
 * 62 av 66 bøker aldri viste feilen.
 */
export function absoluteUrl(path: string): string {
  return SITE + encodeURI(path);
}
