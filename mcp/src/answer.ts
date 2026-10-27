// What every tool shares: the arguments that mean the same everywhere
// (`reference`, `language`), the annotations, and how an answer is written —
// labels in the reader's language, the site's markup stripped, and the licence
// line that follows quoted text. tools.ts and lookups.ts both build on it, so
// a reference reads, and a passage is labelled, the same way in every tool.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getBibleEditionById, getVerses, type ProphecyReference, type Verse } from '../../src/lib/bible.ts';
import { bookName, getBookInfoById as bookById, type BookInfo } from '../../src/lib/books-data.ts';
import { IMPORTED_BIBLES } from '../../src/lib/editions.ts';
import { LOCALES } from '../../src/lib/i18n.ts';
import { pageUrl } from './links.ts';
import { chaptersOf, contains, parseReferences, type Passage } from './reference.ts';

/** Most verses one call returns per edition. Psalm 119 (176) fits. */
export const MAX_VERSES = 200;

export const READABLE = ['osnb', 'osnn', 'osen'] as const;

export const language = z
  .enum(LOCALES)
  .default('en')
  .describe(
    'Language for names, notes and study content, and for the links to bible.flogvit.com: en (English), nb (Norwegian Bokmål), nn (Norwegian Nynorsk), sv (Swedish), fr (French), es (Spanish), fi (Finnish), de (German). Content missing in a language falls back to English. Default: en.',
  );
export const reference = z
  .string()
  .min(2)
  .describe(
    'Bible reference in English or Norwegian style, e.g. "John 3:16", "Joh 3,16-18", "1 Cor 13:4-7", "Ps 23", "Gen 1:1-2:3". Several separated by ";": "Rom 8:28; 9:1; John 3:16".',
  );

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// --- formatting ---

// The generated study text links with the site's own markup,
// `[ref:Gen 22:2|Genesis 22:2]`, `[person:abraham]` (see `src/views/inline-refs.tsx`).
// A model needs the words, not the envelope: the label if there is one, else
// the value without its `@edition` suffix.
const MARKUP = /\[(?:vers|ref|manuskript|andakt|tema|person|profeti|parallell|historie):([^\]|]+)(?:\|([^\]]+))?\]/g;

export function plain(body: string): string {
  return body.replace(MARKUP, (_, value: string, shown?: string) => shown ?? value.replace(/@[\w-]+$/, '').trim());
}

export function text(body: string): CallToolResult {
  return { content: [{ type: 'text', text: plain(body) }] };
}

export function failure(body: string): CallToolResult {
  return { content: [{ type: 'text', text: body }], isError: true };
}

/** "John 3:16-18", "John 3", "Genesis 1:1-2:3" — in the requested language. */
export function label(book: BookInfo, chapter: number, from: number | null, endChapter: number, to: number | null, lang: string): string {
  const name = bookName(book, lang);
  if (from === null || to === null) return endChapter === chapter ? `${name} ${chapter}` : `${name} ${chapter}-${endChapter}`;
  if (endChapter !== chapter) return `${name} ${chapter}:${from}-${endChapter}:${to}`;
  return from === to ? `${name} ${chapter}:${from}` : `${name} ${chapter}:${from}-${to}`;
}

export const passageLabel = (p: Passage, lang: string) => label(p.book, p.chapter, p.verseStart, p.endChapter, p.verseEnd, lang);

export function refLabel(bookId: number, chapter: number, from: number, to: number, lang: string): string {
  const book = bookById(bookId);
  return book ? label(book, chapter, from, chapter, to, lang) : `${bookId} ${chapter}:${from}-${to}`;
}

export const prophecyRefLabel = (r: ProphecyReference, lang: string) => refLabel(r.book_id, r.chapter, r.verse_start, r.verse_end, lang);

type Parsed = { passages: Passage[]; notes: string; error?: undefined } | { error: CallToolResult };

export function parsed(input: string): Parsed {
  const { passages, errors } = parseReferences(input);
  if (passages.length === 0) {
    return { error: failure(`Could not read the reference. ${errors.join(' ')}`.trim()) };
  }
  return { passages, notes: errors.length ? `\n\nSkipped: ${errors.join(' ')}` : '' };
}

export async function attribution(editions: string[], lang: string): Promise<string> {
  const lines: string[] = [];
  for (const id of editions) {
    const e = await getBibleEditionById(id);
    if (!e) continue;
    lines.push(`${e.name_en} (${e.abbreviation ?? e.id}), ${e.license_spdx ?? e.license_name ?? ''}: ${pageUrl(lang, `/oversettelser/${e.id}`)}`);
  }
  return lines.length ? `\n\nSource: ${lines.join('; ')}` : '';
}

/** Verses of a passage in one edition, one query per chapter. */
export async function passageVerses(p: Passage, bible: string): Promise<Verse[]> {
  const out: Verse[] = [];
  for (const chapter of chaptersOf(p)) {
    for (const v of await getVerses(p.book.id, chapter, bible)) {
      if (contains(p, v.chapter, v.verse)) out.push(v);
    }
  }
  return out;
}

/** The edition quoted text comes from, where a tool quotes it. */
export const quoteEdition = z
  .enum(IMPORTED_BIBLES)
  .optional()
  .describe(
    'Edition to quote the verses from: osnb (Norwegian Bokmål), osnn (Norwegian Nynorsk), osen (English), sblgnt (Greek New Testament) or tanach (Hebrew Old Testament). Default: the edition for `language`.',
  );

/**
 * A passage from a row's address. `endVerse` null = to the end of the chapter,
 * `verse` null = the whole chapter. Null when the book id is not one we have.
 */
export function passageAt(bookId: number, chapter: number, verse: number | null, endChapter: number, endVerse: number | null): Passage | null {
  const book = bookById(bookId);
  return book ? { book, chapter, verseStart: verse, endChapter, verseEnd: endVerse } : null;
}

/** Do two passages share a verse? */
export function overlaps(a: Passage, b: Passage): boolean {
  if (a.book.id !== b.book.id) return false;
  const start = (p: Passage) => p.chapter * 1000 + (p.verseStart ?? 0);
  const end = (p: Passage) => p.endChapter * 1000 + (p.verseEnd ?? 999);
  return start(a) <= end(b) && start(b) <= end(a);
}

/**
 * The verses of a passage as quoted lines, at most `max`, and a line saying how
 * many are left and how to read them. `shown` is what it used of the caller's
 * budget.
 */
export async function quote(p: Passage, bible: string, max: number, lang: string): Promise<{ lines: string[]; shown: number }> {
  const verses = await passageVerses(p, bible);
  const shown = verses.slice(0, Math.max(0, max));
  const lines = shown.map((v) => `  ${p.endChapter !== p.chapter ? `${v.chapter}:` : ''}${v.verse} ${v.text}`);
  if (verses.length > shown.length) lines.push(`  (${verses.length - shown.length} more verses — read them with get_passage "${passageLabel(p, lang)}")`);
  return { lines, shown: shown.length };
}
