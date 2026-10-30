// What every tool shares: the arguments that mean the same everywhere
// (`reference`, `language`), the annotations, and how an answer is written —
// labels in the reader's language, the site's markup stripped, and the licence
// line that follows quoted text. tools.ts and lookups.ts both build on it, so
// a reference reads, and a passage is labelled, the same way in every tool.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getBibleEditionById, getVerses, normalizeBibleId, type BibleEditionLicense, type LicenceCredit, type ProphecyReference, type Verse } from '../../src/lib/bible.ts';
import { bookName, getBookInfoById as bookById, type BookInfo } from '../../src/lib/books-data.ts';
import { IMPORTED_BIBLES } from '../../src/lib/editions.ts';
import { LOCALES } from '../../src/lib/i18n.ts';
import { listMappingIds, MAPPING_META, mapChapter, osnbToMapping, resolveMappingId } from '../../src/lib/verse-mapper.ts';
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

/** An osnb address as a label — in another verse numbering when `mapping` is given. */
export function refLabel(bookId: number, chapter: number, from: number, to: number, lang: string, mapping: string | null = null): string {
  const book = bookById(bookId);
  if (!book) return `${bookId} ${chapter}:${from}-${to}`;
  if (!mapping) return label(book, chapter, from, chapter, to, lang);
  const a = osnbToMapping(mapping, bookId, chapter, from);
  const b = osnbToMapping(mapping, bookId, chapter, to);
  return label(book, a.chapter, a.verse, b.chapter, b.verse, lang);
}

export const prophecyRefLabel = (r: ProphecyReference, lang: string, mapping: string | null = null) =>
  refLabel(r.book_id, r.chapter, r.verse_start, r.verse_end, lang, mapping);

type Parsed = { passages: Passage[]; notes: string; error?: undefined } | { error: CallToolResult };

/** `mapping`: the reference is in that verse numbering, so the mapping decides which chapters exist. */
export function parsed(input: string, mapping: string | null = null): Parsed {
  const { passages, errors } = parseReferences(input, { anyChapter: mapping !== null });
  if (passages.length === 0) {
    // A chapter osnb does not have is often one another numbering has.
    const hint = !mapping && errors.some((e) => e.includes('does not exist')) ? ' If the reference is in another verse numbering (the King James Version has a Malachi 4), pass mapping; list_verse_mappings gives the ids.' : '';
    return { error: failure(`Could not read the reference. ${errors.join(' ')}${hint}`.trim()) };
  }
  return { passages, notes: errors.length ? `\n\nSkipped: ${errors.join(' ')}` : '' };
}

/**
 * Where an edition's text comes from, in one short line: its sources with their
 * links and licences, from free-bible's license.json (`credits`). Given where
 * the MCP DESCRIBES an edition (list_editions), never in each answer — the
 * owner's decision (#206) — and never the licence's internal wording.
 */
export function creditLine(licence: BibleEditionLicense | null | undefined): string {
  const credits = licence?.credits ?? [];
  const source = (c: LicenceCredit) =>
    `${c.name} (${c.url}${c.license ? `, ${c.license}${c.license_url ? ` ${c.license_url}` : ''}` : ''})`;
  const shown = credits.filter((c) => c.relation === 'text').map(source);
  const translated = credits.filter((c) => c.relation === 'translated_from').map(source);
  return [shown.length ? `Text: ${shown.join(' and ')}.` : '', translated.length ? `Translated from ${translated.join(' and ')}.` : '']
    .filter(Boolean)
    .join(' ');
}

/** A verse as it is shown: numbered in the requested numbering, with where it stands in osnb. */
export type ShownVerse = Verse & { osnbChapter: number; osnbVerse: number };

/**
 * Verses of a passage in one edition, one query per chapter. With `mapping`
 * the passage is in that numbering, and the verses are found and numbered by
 * `mapChapter()` — the same remapping `/api/chapter?mapping=` does.
 */
export async function passageVerses(p: Passage, bible: string, mapping: string | null = null): Promise<ShownVerse[]> {
  const out: ShownVerse[] = [];
  for (const chapter of chaptersOf(p)) {
    if (!mapping) {
      for (const v of await getVerses(p.book.id, chapter, bible)) {
        if (contains(p, v.chapter, v.verse)) out.push({ ...v, osnbChapter: v.chapter, osnbVerse: v.verse });
      }
      continue;
    }
    for (const m of await mapChapter(p.book.id, chapter, mapping, bible)) {
      if (!contains(p, m.displayChapter, m.displayVerse)) continue;
      out.push({ ...m.verse, chapter: m.displayChapter, verse: m.displayVerse, text: m.text, osnbChapter: m.osnbChapter, osnbVerse: m.osnbVerse });
    }
  }
  return out;
}

/**
 * The verse numbering a reference is written in and an answer is numbered in.
 * Any of the KVN package's mapping files, by id or by the short name the site
 * uses ("kjv", "dnb2024").
 */
export const mapping = z
  .string()
  .min(2)
  .optional()
  .describe(
    'Verse numbering to read the reference in and to number the answer in: a mapping id from list_verse_mappings, e.g. "english_kj" (King James), "dnb2024_nb" (Bibelselskapet 2024), or a short name such as "kjv" or "dnb2024". Numberings differ where a psalm heading is a verse or not, and at chapter breaks: Malachi 4:5 in the King James numbering is Malachi 3:23 in osnb. Default: osnb, the site\'s own numbering, which follows the Hebrew and Greek.',
  );

/** `mapping` where the tool takes no reference, only gives them. */
export const labelMapping = z
  .string()
  .min(2)
  .optional()
  .describe(
    'Verse numbering to give the verse references in: a mapping id from list_verse_mappings, e.g. "english_kj" (King James) or "dnb2024_nb", or a short name such as "kjv". Default: osnb, the site\'s own numbering.',
  );

/** The mapping file id for an argument, null for osnb, or an error that says where to find the ids. */
export function resolveMapping(input: string | undefined): { id: string | null; error?: undefined } | { error: CallToolResult } {
  if (!input) return { id: null };
  const id = normalizeBibleId(input.trim());
  if (id === 'osnb') return { id: null };
  const found = resolveMappingId(id) ?? (listMappingIds().includes(id) ? id : undefined);
  if (!found) return { error: failure(`Unknown verse numbering "${input}". list_verse_mappings gives the ids.`) };
  return { id: found === 'osnb' ? null : found };
}

/** The line that says which numbering an answer is in. */
export const numberedAs = (mapping: string | null) => (mapping ? `\n\nNumbered as in ${MAPPING_META[mapping]?.displayName ?? mapping} (verse numbering ${mapping}).` : '');

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
export async function quote(
  p: Passage,
  bible: string,
  max: number,
  lang: string,
  mapping: string | null = null,
): Promise<{ lines: string[]; shown: number }> {
  const verses = await passageVerses(p, bible, mapping);
  const shown = verses.slice(0, Math.max(0, max));
  const lines = shown.map((v) => `  ${p.endChapter !== p.chapter ? `${v.chapter}:` : ''}${v.verse} ${v.text}`);
  if (verses.length > shown.length) {
    lines.push(`  (${verses.length - shown.length} more verses — read them with get_passage "${passageLabel(p, lang)}"${mapping ? ` and mapping "${mapping}"` : ''})`);
  }
  return { lines, shown: shown.length };
}

/**
 * Passages written in `mapping`, as where they stand in osnb — for the tools
 * whose data is stored by osnb address. A passage the mapping has no verses
 * for is left out.
 */
export async function toOsnb(passages: Passage[], mapping: string | null): Promise<Passage[]> {
  if (!mapping) return passages;
  const out: Passage[] = [];
  for (const p of passages) {
    const verses = await passageVerses(p, 'osnb', mapping);
    const first = verses[0];
    const last = verses.at(-1);
    if (first && last) out.push({ book: p.book, chapter: first.osnbChapter, verseStart: first.osnbVerse, endChapter: last.osnbChapter, verseEnd: last.osnbVerse });
  }
  return out;
}

/** An osnb passage as it is numbered in `mapping`; a whole chapter stays a whole chapter. */
export function inMapping(p: Passage, mapping: string | null): Passage {
  if (!mapping || p.verseStart === null || p.verseEnd === null) return p;
  const a = osnbToMapping(mapping, p.book.id, p.chapter, p.verseStart);
  const b = osnbToMapping(mapping, p.book.id, p.endChapter, p.verseEnd);
  return { book: p.book, chapter: a.chapter, verseStart: a.verse, endChapter: b.chapter, verseEnd: b.verse };
}
