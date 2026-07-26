// Berikelse av lesetekster med verstekster — delt av API-ruten
// (routes/api/reading-texts.ts) og lesetekst-detaljsiden (routes/pages/
// overview.tsx). Håndterer KVN-mapping (osmain → osnb for tekst, osmain →
// visningsmapping for nummer) og del-slicing (a/b/c).

import { getVerse, type ReadingTextWithSlots, type VerseRange } from './bible.ts';
import { UkvnMapper, loadUkvnMapping, ukvnEncode, ukvnDecode, sliceVersePart, resolveMappingId } from '@free-bible/kvn';

const mapperCache = new Map<string, UkvnMapper>();
function getCachedMapper(mappingId: string): UkvnMapper {
  if (!mapperCache.has(mappingId)) {
    mapperCache.set(mappingId, new UkvnMapper(loadUkvnMapping(mappingId)));
  }
  return mapperCache.get(mappingId)!;
}

function osmainTo(
  bookId: number,
  chapter: number,
  verse: number,
  mappingId: string,
): { chapter: number; verse: number } {
  const mapper = getCachedMapper(mappingId);
  const decoded = ukvnDecode(mapper.toTkvn(ukvnEncode(bookId, chapter, verse)));
  return { chapter: decoded.chapter, verse: decoded.verse };
}

export interface EnrichedVerse {
  chapter: number;
  verse: number;
  text: string;
  part?: string;
}

/** Løser versene for én VerseRange (osmain-koordinater) i ønsket bibel + visningsmapping. */
async function rangeToVerses(
  range: VerseRange,
  bible: string,
  displayMapping: string,
): Promise<EnrichedVerse[]> {
  const out: EnrichedVerse[] = [];
  const end = range.verse_end ?? range.verse_start;
  for (let v = range.verse_start; v <= end; v++) {
    const osnb = osmainTo(range.book_id, range.chapter, v, 'osnb');
    const verse = await getVerse(range.book_id, osnb.chapter, osnb.verse, bible);
    if (!verse) continue;

    let verseText = verse.text;
    let part: string | undefined;
    const isFirst = v === range.verse_start;
    const isLast = v === end;
    if (isFirst && range.part_start) {
      const partNum = range.part_start.charCodeAt(0) - 96;
      verseText = sliceVersePart(verseText, partNum, partNum + 1);
      part = range.part_start;
    } else if (isLast && range.part_end && range.part_end !== range.part_start) {
      const partNum = range.part_end.charCodeAt(0) - 96;
      verseText = sliceVersePart(verseText, partNum, partNum + 1);
      part = range.part_end;
    }
    if (!verseText.trim()) continue;
    const display = osmainTo(range.book_id, range.chapter, v, displayMapping);
    out.push({ chapter: display.chapter, verse: display.verse, text: verseText, ...(part && { part }) });
  }
  return out;
}

/** Beriker en lesetekst med verstekster, keyed på hver dels display_ref. */
export async function enrichWithVerseText(
  text: ReadingTextWithSlots,
  bible: string,
  mapping: string,
): Promise<ReadingTextWithSlots & { verses: Record<string, EnrichedVerse[]> }> {
  const verses: Record<string, EnrichedVerse[]> = {};
  const resolvedMapping = resolveMappingId(mapping) || 'osnb';

  for (const slot of text.slots) {
    for (const option of slot.options) {
      for (const part of option.parts) {
        const key = part.display_ref;
        if (verses[key]) continue;
        const aggregated: EnrichedVerse[] = [];
        for (const range of part.ranges) {
          aggregated.push(...(await rangeToVerses(range, bible, resolvedMapping)));
        }
        verses[key] = aggregated;
      }
    }
  }
  return { ...text, verses };
}

/** Lesetype-etikett ut fra bok-id (som gamle ReadingTextPage). */
export function getReadingType(bookId: number): string {
  if (bookId === 19) return 'Salme';
  if (bookId <= 39) return 'GT-tekst';
  if (bookId === 44) return 'Lesning fra Apostlene';
  if (bookId >= 40 && bookId <= 43) return 'Evangelium';
  if (bookId === 66) return 'Åpenbaringen';
  return 'Brev';
}
