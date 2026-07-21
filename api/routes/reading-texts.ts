import { Router, Request, Response } from 'express';
import {
  getAllReadingTexts,
  getReadingTextById,
  getTodaysReadingTexts,
  getVerse,
} from '../../src/lib/bible';
import type { ReadingTextWithSlots, VerseRange } from '../../src/lib/bible';
import { UkvnMapper, loadUkvnMapping, ukvnEncode, ukvnDecode, sliceVersePart, resolveMappingId } from '@free-bible/kvn';

export const readingTextsRouter = Router();

const mapperCache = new Map<string, UkvnMapper>();
function getCachedMapper(mappingId: string): UkvnMapper {
  if (!mapperCache.has(mappingId)) {
    mapperCache.set(mappingId, new UkvnMapper(loadUkvnMapping(mappingId)));
  }
  return mapperCache.get(mappingId)!;
}

function osmainTo(bookId: number, chapter: number, verse: number, mappingId: string): { chapter: number; verse: number } {
  const mapper = getCachedMapper(mappingId);
  const osmainKvn = ukvnEncode(bookId, chapter, verse);
  const tkvn = mapper.toTkvn(osmainKvn);
  const decoded = ukvnDecode(tkvn);
  return { chapter: decoded.chapter, verse: decoded.verse };
}

interface EnrichedVerse {
  chapter: number;
  verse: number;
  text: string;
  part?: string;
}

/**
 * Resolve the verses for one VerseRange (osmain coords) into the requested bible text
 * and the requested display mapping. Returns an array of enriched verses in order.
 */
function rangeToVerses(range: VerseRange, bible: string, displayMapping: string): EnrichedVerse[] {
  const out: EnrichedVerse[] = [];
  const end = range.verse_end ?? range.verse_start;
  for (let v = range.verse_start; v <= end; v++) {
    const osnb2 = osmainTo(range.book_id, range.chapter, v, 'osnb2');
    const verse = getVerse(range.book_id, osnb2.chapter, osnb2.verse, bible);
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
    out.push({
      chapter: display.chapter,
      verse: display.verse,
      text: verseText,
      ...(part && { part }),
    });
  }
  return out;
}

/**
 * Enrich a reading text with verse texts. Builds a `verses` map keyed by each part's
 * display_ref so the UI can look up "the verses for this reading" by display string.
 */
function enrichWithVerseText(
  text: ReadingTextWithSlots,
  bible: string,
  mapping: string,
): ReadingTextWithSlots & { verses: Record<string, EnrichedVerse[]> } {
  const verses: Record<string, EnrichedVerse[]> = {};
  const resolvedMapping = resolveMappingId(mapping) || 'osnb2';

  for (const slot of text.slots) {
    for (const option of slot.options) {
      for (const part of option.parts) {
        const key = part.display_ref;
        if (verses[key]) continue;
        const aggregated: EnrichedVerse[] = [];
        for (const range of part.ranges) {
          aggregated.push(...rangeToVerses(range, bible, resolvedMapping));
        }
        verses[key] = aggregated;
      }
    }
  }

  return { ...text, verses };
}

/**
 * GET /api/reading-texts
 * Returns all reading texts (light list, no slots).
 */
readingTextsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const texts = getAllReadingTexts();
    res.set('Cache-Control', 'no-cache');
    res.json({ readingTexts: texts });
  } catch (error) {
    console.error('Error fetching reading texts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reading-texts/today
 */
readingTextsRouter.get('/today', (_req: Request, res: Response) => {
  try {
    const texts = getTodaysReadingTexts();
    res.set('Cache-Control', 'no-cache');
    res.json(texts);
  } catch (error) {
    console.error("Error fetching today's reading texts:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/reading-texts/:id
 */
readingTextsRouter.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  const bible = (req.query.bible as string) || 'osnb2';
  const mapping = (req.query.mapping as string) || 'osnb2';

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  try {
    const text = getReadingTextById(id);
    if (!text) {
      res.status(404).json({ error: 'Reading text not found' });
      return;
    }
    const enriched = enrichWithVerseText(text, bible, mapping);
    res.set('Cache-Control', 'no-cache');
    res.json(enriched);
  } catch (error) {
    console.error('Error fetching reading text:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
