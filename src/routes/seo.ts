// robots.txt + sitemap per språk (I18N.md §3).
//
// Ligger UTENFOR språkprefikset: robots og sitemap-indeksen er felles, og en
// bot som ber om /robots.txt skal ikke få en 302 inn i et språk.
//
// Den gamle public/sitemap.xml listet 1 200 UPREFIKSEDE URL-er. Etter
// omleggingen til /<lang>/ ville hver eneste av dem svart 302 — en sitemap full
// av redirects er verre enn ingen sitemap, fordi den bruker opp crawl-budsjettet
// på omdirigeringer. Stiene bygges derfor her, prefikset og med full
// hreflang-klynge per URL.
//
// Stiene kommer fra lib/sitemap-paths.ts som RÅ tekst. Fram til #42 tok de en
// runde gjennom den genererte public/sitemap.xml og ble dermed kodet to ganger
// — les kommentaren der før du endrer noe på kodingen.
import { Hono } from 'hono';
import { DEFAULT_LOCALE, LOCALES, href, type Locale } from '../lib/i18n.ts';
import { sitemapPaths } from '../lib/sitemap-paths.ts';

export const seoRoutes = new Hono();

const SITE = 'https://bible.flogvit.com';

const xmlEsc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Prefiksløse, udekodede stier. Bygges én gang — booksData er statisk. */
let cachedPaths: string[] | null = null;
const paths = () => (cachedPaths ??= [...new Set(sitemapPaths())]);

/**
 * Query-parametere som gjør en URL til en HANDLING eller en VISNINGSVARIANT —
 * aldri til en ny side (#60).
 *
 * `vers`/`kap`/`bok`/`ref` åpner `/bidra` og `/manuskripter/ny` med stedet
 * leseren kom fra. Med 31 167 vers, to lenkefamilier og åtte språkprefikser var
 * det 498 672 crawlbare adresser mot 1 189 kapittelsider — en flate ~420 ganger
 * større enn innholdet, der ingen av adressene ER innhold. Hver er dessuten
 * unik, altså cache-miss, altså en render-plass i semaforen: 12 × 503 på én
 * time, og 6,7 s til Googlebot på en vanlig kapittelside.
 *
 * `bible`/`secondary`/`mapping`/`visning` er visningsvalg (kapittelsiden, /dager). Skinne­
 * bryterne lenker kapittelet til seg selv med et annet valg, og prev/neste
 * bærer valget videre — altså hele Bibelen på nytt per kombinasjon, i den DYRE
 * renderen. Canonical peker query-løst uansett, så ingen av dem har noe i en
 * indeks å gjøre.
 *
 * `rel="nofollow"` på lenkene stopper OPPDAGELSE; dette stopper HENTING av det
 * en crawler allerede kjenner. GPTBot hadde et halvt million adresser fra før,
 * og de forsvinner ikke av at vi merker lenkene i dag.
 *
 * IKKE med: `q` (søk). Søkeresultatsiden skal ut av indeksen, og der er
 * `noindex` direktivet (#41) — et robots-forbud ville hindret crawleren i å SE
 * det. Lenkene dit er `nofollow`, så nye søke-URL-er oppdages ikke uansett.
 */
const CRAWL_BLOCKED_PARAMS = ['vers', 'kap', 'bok', 'ref', 'bible', 'secondary', 'mapping', 'visning'] as const;

// Mønsteret matcher sti + query, og `/*?<param>=` treffer derfor alle åtte
// språkprefiksene i én linje. RFC 9309 §2.2: lengste treff vinner, så disse
// slår `Allow: /` (lengde 1).
//
// Merk hva som IKKE står her: et forbud mot STIEN. Det er den nærliggende
// fiksen, og den har to feller. `Disallow: /bidra` gjør ingenting i det hele
// tatt — mønstre er prefiksmatch, og hver eneste ekte adresse er prefikset
// (`/en/bidra`). Skriver du den så den treffer (`Disallow: /*bidra`), tar den
// samtidig `/bidra` selv, som står i sitemapen (STATIC_PATHS) på alle åtte
// språk: en sitemap full av adresser vår egen robots.txt forbyr tar siden ut
// av indeksen uten at noen ville det. Det er QUERYEN som er flata, ikke stien.
//
// Samme felle på den andre siden: `Disallow: /*manuskripter/ny` er prefiksmatch
// og stenger `/manuskripter/nytt-liv-a1b2c3` — en publisert tekst i den åpne
// katalogen (#15). Editoren holdes ute av `noindex`, ikke av robots.
const ROBOTS = [
  'User-agent: *',
  'Allow: /',
  ...CRAWL_BLOCKED_PARAMS.map((p) => `Disallow: /*?${p}=`),
  ...CRAWL_BLOCKED_PARAMS.map((p) => `Disallow: /*&${p}=`),
  '',
  `Sitemap: ${SITE}/sitemap.xml`,
  '',
].join('\n');

seoRoutes.get('/robots.txt', (c) =>
  c.body(ROBOTS, 200, { 'content-type': 'text/plain; charset=utf-8' }),
);

seoRoutes.get('/sitemap.xml', (c) =>
  c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      LOCALES.map((l) => `  <sitemap><loc>${xmlEsc(`${SITE}/sitemap-${l}.xml`)}</loc></sitemap>`).join('\n') +
      `\n</sitemapindex>\n`,
    200,
    { 'content-type': 'application/xml; charset=utf-8' },
  ),
);

// Én konkret rute per språk: ruteren matcher ikke en parameter etterfulgt av
// «.xml» pålitelig, og en eksplisitt liste gir 404 på ukjente koder gratis.
for (const locale of LOCALES) {
  seoRoutes.get(`/sitemap-${locale}.xml`, (c) => {
    const loc = (l: Locale, p: string) => xmlEsc(SITE + encodeURI(href(l, p)));
    const urls = paths()
      .map((p) => {
        const alts = [
          ...LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${loc(l, p)}"/>`),
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc(DEFAULT_LOCALE, p)}"/>`,
        ].join('\n');
        return `  <url>\n    <loc>${loc(locale, p)}</loc>\n${alts}\n  </url>`;
      })
      .join('\n');
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
      200,
      { 'content-type': 'application/xml; charset=utf-8' },
    );
  });
}
