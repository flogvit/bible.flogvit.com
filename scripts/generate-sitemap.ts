// Genererer public/sitemap.xml. Kjør: bun scripts/generate-sitemap.ts
//
// Kapittel-URL-ene bruker samme slugs som canonical på lesesidene
// (toUrlSlug(short_name), dvs. norske slugs som /1mos/1 og /1krøn/1) — tidligere
// genererte vi fra books.name (engelsk, mellomrom→bindestrek), som ga 237 URL-er
// appen ikke løste opp (GitHub #1). Bokdata leses fra den statiske books-data.ts,
// så scriptet trenger ingen DB.

import { booksData } from '../src/lib/books-data.ts';
import { toUrlSlug } from '../src/lib/url-utils.ts';
import { getBookInfoBySlug } from '../src/lib/books-data.ts';

const BASE_URL = 'https://bible.flogvit.com';

const staticUrls: [path: string, changefreq: string, priority: string][] = [
  ['/', 'weekly', '1.0'],
  ['/om', 'monthly', '0.5'],
  ['/sok', 'monthly', '0.7'],
  ['/sok/original', 'monthly', '0.6'],
  ['/tidslinje', 'monthly', '0.7'],
  ['/profetier', 'monthly', '0.7'],
  ['/personer', 'monthly', '0.7'],
  ['/temaer', 'monthly', '0.7'],
  ['/leseplan', 'monthly', '0.7'],
  ['/kjente-vers', 'monthly', '0.6'],
  ['/bidra', 'monthly', '0.4'],
  ['/tilgjengelighet', 'monthly', '0.3'],
];

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const [p, changefreq, priority] of staticUrls) {
  xml += `  <url>\n    <loc>${BASE_URL}${p}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
for (const book of booksData) {
  const slug = toUrlSlug(book.short_name);
  if (!getBookInfoBySlug(slug)) throw new Error(`Slug løses ikke opp av appen: ${slug}`);
  for (let chapter = 1; chapter <= book.chapters; chapter++) {
    xml += `  <url>\n    <loc>${BASE_URL}/${encodeURI(slug)}/${chapter}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }
}
xml += `</urlset>\n`;

await Bun.write('public/sitemap.xml', xml);
const urlCount = (xml.match(/<url>/g) || []).length;
console.log(`Sitemap generert: public/sitemap.xml (${urlCount} URL-er)`);
