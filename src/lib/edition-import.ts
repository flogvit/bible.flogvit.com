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
  raw.forEach((v) => {
    // The translation's own address is the order its pieces are joined in.
    const order = ukvnEncode(v.bookId, v.chapterId, v.verseId);
    const kvn = sourceKvn(order);
    const parts = kvn % UKVN_PART_SIZE === 0 ? osnbParts(kvn) : [];
    if (parts.length > 1) {
      split++;
      parts.forEach((t, i) => add(t, order, sliceVersePart(v.text, i + 1, parts.length), v));
    } else {
      add(osnbTkvn(kvn), order, v.text, v);
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
  return { verses, merged, split };
}
