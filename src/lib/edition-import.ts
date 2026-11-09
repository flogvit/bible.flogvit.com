// The path a translation from free-bible takes into bible.flogvit.com and the
// MCP server (#170, #200): the GATE that decides whether it may be imported,
// and the RENUMBERING from the translation's own verse numbers to osnb's.
//
// The database holds every edition in osnb numbering: the chapter page, the
// study panel and the MCP all look a verse up by its osnb address, and a KVN
// mapping (`?mapping=`) is applied on top of that at display (verse-mapper.ts).
// The five editions we started with are osnb-numbered already and are stored
// as they are (`OSNB_NUMBERED`). A harvested translation is not: the KJV has
// four chapters in Malachi and no verse for a psalm's title. Its text is
// therefore moved to osnb addresses through its own KVN mapping on import —
// which is why the mapping has to be verified against the text first (#201): a
// mapping that is right by arithmetic and wrong by text (albanian Revelation
// 1–12, one verse low) would put every verse under the wrong number.
//
// The gate reads its two answers from free-bible, never from a list here:
// `license.json` → `verification.status` (#199) and the mapping file →
// `textVerification.status` (#201). A translation listed in `IMPORTED_BIBLES`
// that fails either is refused with the reason, and the import stops.

import * as fs from 'fs';
import * as path from 'path';
import { ukvnDecode, ukvnEncode, UKVN_PART_SIZE, sliceVersePart } from '@free-bible/kvn';
import type { UkvnMappingFile } from '@free-bible/kvn';
import { OSNB_NUMBERED } from './editions.ts';

/** A verse as free-bible stores it, in the translation's own numbering. */
export interface RawVerse {
  bookId: number;
  chapterId: number;
  verseId: number;
  text: string;
  versions?: unknown;
  footnotes?: unknown;
}

/** The licence file's verification, as free-bible writes it (#199). */
export interface LicenceVerification {
  status?: string;
  checked?: string;
  evidence?: { url?: string; quote?: string }[];
  note?: string;
}

/** The mapping file's text verification, as free-bible writes it (#201). */
export interface MappingTextVerification {
  status?: string;
  checked?: string;
}

export type GateResult = { ok: true } | { ok: false; reason: string };

/**
 * May this translation be published? Its licence must be confirmed against the
 * source, and — unless it is osnb-numbered already — its KVN mapping verified
 * against the text.
 */
export function editionGate(
  id: string,
  licence: { verification?: LicenceVerification } | null,
  mapping: (Pick<UkvnMappingFile, 'system'> & { textVerification?: MappingTextVerification }) | null,
): GateResult {
  if (!licence) return { ok: false, reason: `${id}: no license.json in free-bible` };
  const status = licence.verification?.status;
  if (status !== 'confirmed') {
    return {
      ok: false,
      reason: `${id}: the licence is not confirmed against its source (verification.status: ${status ?? 'missing'})`,
    };
  }
  if ((OSNB_NUMBERED as readonly string[]).includes(id)) return { ok: true };
  if (!mapping) return { ok: false, reason: `${id}: no KVN mapping (kvn/mappings/${id}.ukvn.json)` };
  const kvn = mapping.textVerification?.status;
  if (kvn !== 'verified') {
    return {
      ok: false,
      reason: `${id}: the KVN mapping is not verified against the text (textVerification.status: ${kvn ?? 'missing'})`,
    };
  }
  return { ok: true };
}

/**
 * The gate, with its two answers read from free-bible: `license.json` under
 * `generate/bibles_raw/<id>/`, and the mapping file through `loadMapping`
 * (null when there is none).
 */
export function checkEdition(
  id: string,
  generatePath: string,
  loadMapping: (id: string) => UkvnMappingFile | null,
): GateResult {
  const licencePath = path.join(generatePath, 'bibles_raw', id, 'license.json');
  let licence: { verification?: LicenceVerification } | null = null;
  if (fs.existsSync(licencePath)) {
    try {
      licence = JSON.parse(fs.readFileSync(licencePath, 'utf-8'));
    } catch {
      return { ok: false, reason: `${id}: license.json is not valid JSON` };
    }
  }
  const needsMapping = !(OSNB_NUMBERED as readonly string[]).includes(id);
  return editionGate(id, licence, needsMapping ? loadMapping(id) : null);
}

/**
 * A translator's note written into verse text (#207). Notes belong in
 * `footnotes`; in the text they stood in the middle of the verse on the page,
 * and in search, the songs and the MCP. These are the forms that were found in
 * free-bible (its tests/verse-text-clean.test.ts holds the same list).
 */
export const INLINE_NOTE =
  /\[\s*\*?\s*(?:Footnote|Fotnote|Nota|Note)\s*:|\[\*|\[\^[\w-]+\]|<fn>|(?:^|\n\n)\s*\*\S|\*[ \t]+\*\S/i;

/**
 * The verses whose text carries a note, as `book:chapter:verse`. A source
 * placeholder is not a note: it is left out at renumbering (#216), and its
 * asterisks must not refuse the whole edition here.
 */
export function versesWithInlineNotes(verses: RawVerse[]): string[] {
  return verses
    .filter((v) => !SOURCE_PLACEHOLDER.test(v.text) && INLINE_NOTE.test(v.text))
    .map((v) => `${v.bookId}:${v.chapterId}:${v.verseId}`);
}

/**
 * Another numbering printed inside the text (#216). The Vietnamese Cadman
 * Bible marks where the Hebrew or its own printed numbering starts a verse:
 * «(40:20) Ngươi có thể câu sấu…» at the KJV's Job 41:1, or «… (9:51) Các
 * ngươi phải…» in the middle of Mark 9:50. The KVN mapping already carries
 * that numbering; in the text it is noise in front of the reader. The Finnish
 * 1776 marks the Hebrew number the same way with an H, «(H 3:2)» (#221).
 */
export const VERSE_NUMBER_MARK = /\s*\((?:H\s*)?\d{1,3}[:.]\d{1,3}\)\s*/g;

/**
 * A paragraph mark printed before a verse (#221: hcv, he_modern «¶ מזמור…»).
 * The page has its own paragraphs; in the text it is a stray sign.
 */
export const PARAGRAPH_MARK = /\s*¶\s*/g;

/**
 * Inline HTML from the source (#222): Sagradas Escrituras marks italic words
 * «por <I>la</I> concupiscencia». The page escapes it, so the reader would see
 * the tags; the words stay, the tags go.
 */
export const INLINE_TAG = /<\/?(?:i|b|em|strong|u|sup|sub|span|font)\b[^>]*>/gi;

/**
 * Emphasis printed as stars round words (#224): Weymouth's New Testament
 * «But *I* have prayed for *you*». The page shows plain text, so the stars
 * would stand in front of the reader; the words stay. A pair only: the opening
 * star stands after a space or punctuation and before a letter, the closing
 * one after a letter and before no letter. dnb30's footnote stars follow
 * the word they mark («datter***»), so they never open a pair and stay.
 */
export const EMPHASIS_STARS = /(?<![\p{L}\p{N}*])\*([\p{L}\p{N}](?:[^*\n]{0,60}?[\p{L}\p{N}.,!?])?)\*(?![\p{L}\p{N}*])/gu;

/**
 * A placeholder the source wrote where it had no text (#216): bungo's Exodus
 * 7:24 is «*** POSSIBLE ERROR IN BIBLE, TEXT MISSING HERE ***». Such a verse is
 * left out, so the reader sees an empty verse rather than the message. Only a
 * verse that IS the message counts: dnb30 marks footnotes with *, ** and ***
 * inside real text (Dan 11:17 «…sin egen datter***»), and that text stays.
 */
export const SOURCE_PLACEHOLDER = /^\s*\*{3}[^*]*(?:POSSIBLE ERROR|TEXT MISSING)[^*]*\*{3}\s*$/i;

/** Han characters and the CJK punctuation and full-width forms around them. */
const CJK = '\\p{Script=Han}\\u3000-\\u303f\\uff00-\\uffef';
const CJK_SPACE = new RegExp(`([${CJK}]) +(?=[${CJK}])`, 'gu');

/**
 * Chinese printed one character at a time (#216): the Chinese Union Version
 * came with a space after every character, «神 爱 世 人», which reads as
 * broken text. Only a verse spaced like that throughout is closed up — the
 * Bungo-yaku's spaces between phrases are the edition's own and stay. The
 * ideographic space before 神 (U+3000, a mark of respect) is a character, not
 * a gap, and stays too.
 */
function closeSpacedCjk(text: string): string {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (han < 4) return text;
  const gaps = text.match(CJK_SPACE)?.length ?? 0;
  return gaps >= han * 0.6 ? text.replace(CJK_SPACE, '$1') : text;
}

/**
 * Raise when readerText(), SOURCE_PLACEHOLDER or the renumbering changes what
 * is stored: the import's content hash carries it, so every harvested edition
 * is imported again with the new rules instead of keeping the old text until
 * its source changes.
 */
export const READER_TEXT_RULES = 4;

/** The verse text a reader is shown: other numberings out, spaced Chinese closed up, spaces tidied. */
export function readerText(text: string): string {
  // [ \t\n], not \s: \s takes the ideographic space (U+3000) too.
  return closeSpacedCjk(text.replace(INLINE_TAG, '').replace(EMPHASIS_STARS, '$1').replace(VERSE_NUMBER_MARK, ' ').replace(PARAGRAPH_MARK, ' ').replace(/[ \t\n]{2,}/g, ' ').trim());
}

/** A verse at its osnb address, ready for the `verses` table. */
export interface OsnbVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
  versions: unknown;
  footnotes: unknown;
}

export interface Renumbered {
  verses: OsnbVerse[];
  /** osnb verses that got text from more than one verse of the translation. */
  merged: number;
  /** verses of the translation split over more than one osnb verse. */
  split: number;
  /** the translation's own addresses (`book:chapter:verse`) whose text was a source placeholder, left out. */
  placeholders: string[];
}

/**
 * Move a translation's verses to osnb addresses: own number → osmain (through
 * its mapping) → osnb (through osnb's). Several verses that land on one osnb
 * verse are joined in their own order; a verse whose osmain verse osnb divides
 * into parts is divided the same way (`sliceVersePart`). No text is dropped.
 */
export function toOsnbNumbering(raw: RawVerse[], source: UkvnMappingFile, osnb: UkvnMappingFile): Renumbered {
  const toKvn = new Map<number, number>();
  for (const e of source.map) if (!toKvn.has(e.tkvnFrom)) toKvn.set(e.tkvnFrom, e.kvnFrom);
  const kvnToOsnb = new Map<number, number>();
  for (const e of osnb.map) kvnToOsnb.set(e.kvnFrom, e.tkvnFrom);

  const sourceKvn = (tkvn: number): number => {
    const exact = toKvn.get(tkvn);
    if (exact !== undefined) return exact;
    const part = tkvn % UKVN_PART_SIZE;
    const base = part > 0 ? toKvn.get(tkvn - part) : undefined;
    return base !== undefined ? base + part : tkvn;
  };
  const osnbTkvn = (kvn: number): number => {
    const exact = kvnToOsnb.get(kvn);
    if (exact !== undefined) return exact;
    const part = kvn % UKVN_PART_SIZE;
    const base = part > 0 ? kvnToOsnb.get(kvn - part) : undefined;
    return base !== undefined ? base + part : kvn;
  };
  /** The osnb verses a WHOLE osmain verse is divided into, in order (empty: not divided). */
  const osnbParts = (kvn: number): number[] => {
    const parts: number[] = [];
    for (let p = 1; p < UKVN_PART_SIZE; p++) {
      const t = kvnToOsnb.get(kvn + p);
      if (t === undefined) break;
      parts.push(t);
    }
    return parts;
  };

  // osnb address → pieces, each with a sort key (its own order, then part).
  const pieces = new Map<string, { order: number; text: string; raw: RawVerse }[]>();
  const add = (tkvn: number, order: number, text: string, raw: RawVerse) => {
    const d = ukvnDecode(tkvn);
    const key = `${d.book}:${d.chapter}:${d.verse}`;
    const list = pieces.get(key) ?? [];
    list.push({ order: order * UKVN_PART_SIZE + d.part, text, raw });
    pieces.set(key, list);
  };

  let split = 0;
  const placeholders: string[] = [];
  raw.forEach((v) => {
    if (SOURCE_PLACEHOLDER.test(v.text)) {
      placeholders.push(`${v.bookId}:${v.chapterId}:${v.verseId}`);
      return;
    }
    const text = readerText(v.text);
    // The translation's own address is the order its pieces are joined in.
    const order = ukvnEncode(v.bookId, v.chapterId, v.verseId);
    const kvn = sourceKvn(order);
    const parts = kvn % UKVN_PART_SIZE === 0 ? osnbParts(kvn) : [];
    if (parts.length > 1) {
      split++;
      parts.forEach((t, i) => add(t, order, sliceVersePart(text, i + 1, parts.length), v));
    } else {
      add(osnbTkvn(kvn), order, text, v);
    }
  });

  let merged = 0;
  const verses: OsnbVerse[] = [];
  for (const [key, list] of pieces) {
    const [book, chapter, verse] = key.split(':').map(Number) as [number, number, number];
    list.sort((a, b) => a.order - b.order);
    const texts = list.map((p) => p.text.trim()).filter(Boolean);
    if (list.length > 1) merged++;
    // Alternative readings and notes belong to ONE verse of the translation;
    // on a merged osnb verse they would be attached to the wrong words.
    const only = list.length === 1 ? list[0]!.raw : null;
    verses.push({
      book,
      chapter,
      verse,
      text: texts.join(' '),
      versions: only?.versions ?? null,
      footnotes: only?.footnotes ?? null,
    });
  }
  verses.sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
  return { verses, merged, split, placeholders };
}
