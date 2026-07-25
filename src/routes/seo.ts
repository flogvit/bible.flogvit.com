// robots.txt + sitemap per språk (I18N.md §3).
//
// Ligger UTENFOR språkprefikset: robots og sitemap-indeksen er felles, og en
// bot som ber om /robots.txt skal ikke få en 302 inn i et språk.
//
// Den gamle public/sitemap.xml listet 1 200 UPREFIKSEDE URL-er. Etter
// omleggingen til /<lang>/ ville hver eneste av dem svart 302 — en sitemap full
// av redirects er verre enn ingen sitemap, fordi den bruker opp crawl-budsjettet
// på omdirigeringer. Stiene leses derfor derfra én gang og skrives ut på nytt,
// prefikset og med full hreflang-klynge per URL.
import { Hono } from 'hono';
import { DEFAULT_LOCALE, LOCALES, href, type Locale } from '../lib/i18n.ts';

export const seoRoutes = new Hono();

const SITE = 'https://bible.flogvit.com';

const xmlEsc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Prefiksløse stier, lest fra den gamle statiske sitemap-en. */
let cachedPaths: string[] | null = null;

async function sitemapPaths(): Promise<string[]> {
  if (cachedPaths) return cachedPaths;
  try {
    const xml = await Bun.file('./public/sitemap.xml').text();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1]!.replace(SITE, '').trim())
      .filter((p) => p.startsWith('/'))
      .map((p) => (p !== '/' ? p.replace(/\/$/, '') : '/'));
    cachedPaths = [...new Set(paths)];
  } catch {
    cachedPaths = ['/']; // fila mangler → fortsatt en gyldig sitemap
  }
  return cachedPaths;
}

seoRoutes.get('/robots.txt', (c) =>
  c.body(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`, 200, {
    'content-type': 'text/plain; charset=utf-8',
  }),
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
  seoRoutes.get(`/sitemap-${locale}.xml`, async (c) => {
    const paths = await sitemapPaths();
    const loc = (l: Locale, p: string) => xmlEsc(SITE + encodeURI(href(l, p)));
    const urls = paths
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
