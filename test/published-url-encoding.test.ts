// EN PUBLISERT ADRESSE ER PROSENTKODET (#80).
//
// Sidemalen sendte RÅ, ikke-prosentkodede UTF-8-bytes i `og:image`, `canonical`
// og hreflang-klyngen, mens sitemapen kodet de samme adressene. De to var altså
// uenige om hva adressen ER — og en crawler som fikk den rå formen sendte
// `GET /og/en/1kr` (prefikset fram til første ikke-ASCII-byte) og fikk 404,
// mens den kodede formen ga 200 i samme vindu.
//
// Hullet er av samme klasse som #42, #45 og #65: et delekort som ikke lar seg
// hente svarer ingen. Skraperen viser et kort uten bilde, og det gir verken
// 404, 5xx eller en logglinje hos oss — feilen er bare synlig for den som delte
// lenken. Og som i #42 er den usynlig med mindre man ser NØYAKTIG der:
// `encodeURI` er idempotent for ren ASCII, så 62 av 66 bøker ser riktige ut
// uansett. **En test på `/1mos/1` ville aldri sett dette.**
//
// Derfor velges sidene av DATAENE (som i #69 og #70): hver bok hvis slug bærer
// et tegn utenfor ASCII måles, så en ny slik bok arver vakta uten at noen fører
// den opp.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { booksData } from '../src/lib/books-data.ts';
import { LOCALES, type Locale } from '../src/lib/i18n.ts';
import { toUrlSlug } from '../src/lib/url-utils.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
await initBooks();

const SITE = 'https://bible.flogvit.com';

/** Bøkene saken gjelder — valgt av dataene, ikke ført opp for hånd. */
const NON_ASCII_BOOKS = booksData.filter((b) => /[^\x20-\x7e]/.test(toUrlSlug(b.short_name)));

/** Hver absolutte adresse siden PUBLISERER — meta-felt og lenker, ikke brødtekst. */
function publishedUrls(html: string): string[] {
  return [...html.matchAll(/(?:href|content)="(https:\/\/bible\.flogvit\.com[^"]*)"/g)].map((m) => m[1]!);
}

const one = (html: string, re: RegExp) => re.exec(html)?.[1];
const canonicalOf = (html: string) => one(html, /<link rel="canonical" href="([^"]*)"/);
const ogImageOf = (html: string) => one(html, /<meta property="og:image" content="([^"]*)"/);
const hreflangOf = (html: string) =>
  [...html.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]*)"/g)].map((m) => `${m[1]} ${m[2]}`);

const sitemaps = new Map<Locale, string>();
async function sitemap(locale: Locale): Promise<string> {
  if (!sitemaps.has(locale)) sitemaps.set(locale, await (await app.request(`/sitemap-${locale}.xml`)).text());
  return sitemaps.get(locale)!;
}

/** `<url>`-blokka i sitemapen som HAR denne `<loc>`-en. */
function sitemapEntry(xml: string, loc: string): string | undefined {
  return xml.split('  <url>').find((b) => b.includes(`<loc>${loc}</loc>`));
}

describe('publiserte adresser (#80)', () => {
  // Uten en slug med ø/å måler de andre halvdelene ingenting: `encodeURI` er
  // identiteten på ren ASCII, så alt ville vært grønt uten en eneste fiks.
  test('det finnes en sti med et ikke-ASCII-tegn å måle', () => {
    expect(NON_ASCII_BOOKS.map((b) => toUrlSlug(b.short_name))).not.toEqual([]);
  });

  // SELVE SAKEN. Formulert på BYTEN, ikke på ø: et hvilket som helst tegn
  // utenfor ASCII i en adresse vi sender til en maskin er feilen.
  test('ingen publisert adresse bærer et tegn utenfor ASCII', async () => {
    for (const book of NON_ASCII_BOOKS) {
      for (const locale of LOCALES) {
        const path = `/${locale}/${toUrlSlug(book.short_name)}/1`;
        const html = await (await app.request(encodeURI(path))).text();
        const rå = publishedUrls(html).filter((u) => /[^\x20-\x7e]/.test(u));
        expect({ path, rå }).toEqual({ path, rå: [] });
      }
    }
  });

  // Kodingen skal være en KODING, ikke en omskriving: adressen må dekode
  // tilbake til stien sida faktisk svarer på. `1kron-15.png` ville bestått
  // ASCII-kravet over og pekt på noe annet.
  test('den kodede adressen dekoder tilbake til sidas egen sti', async () => {
    for (const book of NON_ASCII_BOOKS) {
      const slug = toUrlSlug(book.short_name);
      for (const locale of LOCALES) {
        const html = await (await app.request(encodeURI(`/${locale}/${slug}/1`))).text();
        expect({
          slug,
          locale,
          canonical: decodeURI(canonicalOf(html)!),
          card: decodeURI(ogImageOf(html)!),
        }).toEqual({
          slug,
          locale,
          canonical: `${SITE}/${locale}/${slug}/1`,
          card: `${SITE}/og/${locale}/${slug}-1.png`,
        });
      }
    }
  });

  // At de var UENIGE er selve feilen. En test som bare krever at hver av dem
  // svarer 200 hver for seg, fanger den ikke — begge formene svarer 200.
  test('sitemapen og sida oppgir BIT-IDENTISK samme adresse', async () => {
    for (const book of NON_ASCII_BOOKS) {
      const slug = toUrlSlug(book.short_name);
      for (const locale of LOCALES) {
        const html = await (await app.request(encodeURI(`/${locale}/${slug}/1`))).text();
        const canonical = canonicalOf(html)!;
        const entry = sitemapEntry(await sitemap(locale), canonical);
        expect({ slug, locale, iSitemapen: !!entry }).toEqual({ slug, locale, iSitemapen: true });
        // Hreflang-klyngen er den samme adressen sagt et annet sted: er den
        // rå her og kodet der, har vi bare flyttet uenigheten.
        for (const alt of hreflangOf(html)) {
          const [hreflang, url] = alt.split(' ') as [string, string];
          expect({ slug, locale, alt }).toEqual({
            slug,
            locale,
            alt: entry!.includes(`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${url}"/>`) ? alt : `MANGLER i sitemapen: ${alt}`,
          });
        }
      }
    }
  });

  // STRUKTURELT, og det er halvdelen som holder neste rute i tømmene: en
  // adresse som settes sammen et annet sted enn `site-url.ts` er en adresse
  // ingen koding rører. Fire canonical-er ble bygget slik da saken ble
  // skrevet — to i lesesida, én i oversettelsene, én i endringsloggen — og
  // sveipene over ser bare de sidene de rendrer.
  //
  // Den andre veien dit er stengt av typesjekkeren: `SITE` eksporteres ikke,
  // så `SITE + sti` er en byggefeil. Da står bare den skrevne literalen igjen,
  // og det er den denne halvdelen leter etter.
  test('opphavet settes bare sammen med en sti i site-url.ts', async () => {
    const filer = [...new Bun.Glob('src/**/*.{ts,tsx}').scanSync('.')].sort();
    expect(filer.length).toBeGreaterThan(10);
    const treff: string[] = [];
    for (const f of filer) {
      if (f === 'src/lib/site-url.ts') continue;
      if ((await Bun.file(f).text()).includes(SITE)) treff.push(f);
    }
    expect(treff).toEqual([]);
  });

  // Adressen brukt NØYAKTIG slik den ble publisert må levere kortet. Det er
  // det crawleren gjør, og det er her 404-en i saken oppsto.
  test('delekortet svarer 200 på adressen slik den er publisert', async () => {
    for (const book of NON_ASCII_BOOKS) {
      const html = await (await app.request(encodeURI(`/en/${toUrlSlug(book.short_name)}/1`))).text();
      const url = ogImageOf(html)!;
      const res = await app.request(new URL(url).pathname);
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
      expect(res.headers.get('content-type')).toContain('image/png');
    }
  });
});
