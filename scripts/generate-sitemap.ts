// Genererer public/sitemap.xml — port av gamle scripts/generate-sitemap.ts
// (better-sqlite3 → Bun.sql). Kjør: bun scripts/generate-sitemap.ts

import { getSql, closeSql } from '../src/lib/db.ts';

const BASE_URL = 'https://bibel.flogvit.com';

// Sitemapens egen slug-variant (ASCII-folder æøå) — beholdt som i originalen.
function toUrlSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[å]/g, 'a');
}

const sql = getSql();
const books = (await sql`SELECT id, name, chapters FROM books ORDER BY id`) as {
  id: number;
  name: string;
  chapters: number;
}[];

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
  ['/tilgjengelighet', 'monthly', '0.3'],
];

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const [p, changefreq, priority] of staticUrls) {
  xml += `  <url>\n    <loc>${BASE_URL}${p}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}
for (const book of books) {
  const slug = toUrlSlug(book.name);
  for (let chapter = 1; chapter <= book.chapters; chapter++) {
    xml += `  <url>\n    <loc>${BASE_URL}/${slug}/${chapter}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  }
}
xml += `</urlset>\n`;

await Bun.write('public/sitemap.xml', xml);
const urlCount = (xml.match(/<url>/g) || []).length;
console.log(`Sitemap generert: public/sitemap.xml (${urlCount} URL-er)`);
await closeSql();
