// Every answer points back to the page on bible.flogvit.com it came from. That
// is what makes the assistant cite US and send the reader on — and the address
// is built exactly as the site builds its own: the locale prefix, the
// Norwegian short name as slug (`getBookUrlSlug`), `#v<verse>` as anchor, and
// `absoluteUrl()` for the one encoding (#80).

import type { BookInfo } from '../../src/lib/books-data.ts';
import { absoluteUrl } from '../../src/lib/site-url.ts';
import { toUrlSlug } from '../../src/lib/url-utils.ts';

/** The site locale whose default edition IS this edition — so no `?bible=` is needed. */
const EDITION_LOCALE: Record<string, string> = { osnb: 'nb', osnn: 'nn', osen: 'en' };

export function chapterUrl(book: BookInfo, chapter: number, locale: string, verse?: number | null, edition?: string): string {
  const own = edition ? EDITION_LOCALE[edition] : undefined;
  const prefix = own ?? locale;
  const query = edition && !own ? `?bible=${edition}` : '';
  const anchor = verse ? `#v${verse}` : '';
  return absoluteUrl(`/${prefix}/${toUrlSlug(book.short_name)}/${chapter}${query}`) + anchor;
}

export function pageUrl(locale: string, path: string): string {
  return absoluteUrl(`/${locale}${path}`);
}
