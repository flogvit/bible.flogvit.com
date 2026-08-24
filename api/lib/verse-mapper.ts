import {
  UkvnMapper,
  CrossMapper,
  loadUkvnMapping,
  listUkvnMappings,
  ukvnEncode,
  ukvnDecode,
  MAPPING_META,
  resolveMappingId,
} from '@free-bible/kvn';
import type { UkvnMappingFile } from '@free-bible/kvn';
import { getVerses, getVerse } from '../../src/lib/bible';
import type { Verse } from '../../src/lib/bible';

export { MAPPING_META, resolveMappingId } from '@free-bible/kvn';

/**
 * KVN-id-en for grunntekstens EGEN versnummerering — mappingfila hver
 * kryssmapping går gjennom.
 *
 * Dette er IKKE bibel-id-en. `verses.bible` heter fortsatt `osnb2`/`osnn1` i
 * basen denne flata leser, og de strengene skal stå. free-bible døpte om selve
 * NUMMERERINGSFILA `osnb2.ukvn.json` → `osnb.ukvn.json` 2026-07-26, og de to
 * navnene var like fram til den dagen — derfor ble den gamle stående her.
 * `loadUkvnMapping` gjør `readFileSync` uten fallback, så hver forespørsel med
 * `mapping=` kastet ENOENT og ble en 500 (#101). Uten `mapping=` rører vi
 * aldri fila, og det er derfor bare parallellnummereringen døde.
 *
 * Skriv den ALDRI som en literal ved siden av: da er det to steder å glemme
 * neste omdøping, og `verse-mapper.test.ts` er vakta som holder på det.
 */
export const OSNB_MAPPING_ID = 'osnb';

export interface MappedVerse {
  displayChapter: number;
  displayVerse: number;
  osnb2Chapter: number;
  osnb2Verse: number;
  partial: boolean;
  part: number;
  totalParts: number;
  text: string;
  verse: Verse;
}

interface MappingInfo {
  id: string;
  name: string;
  shortname: string;
  displayName: string;
  entryCount: number;
}

// Cached mappers and mapping files
const mappingFiles = new Map<string, UkvnMappingFile>();
const mappers = new Map<string, UkvnMapper>();
const crossMappers = new Map<string, CrossMapper>();

function getMapper(mappingId: string): UkvnMapper {
  let mapper = mappers.get(mappingId);
  if (!mapper) {
    let file = mappingFiles.get(mappingId);
    if (!file) {
      file = loadUkvnMapping(mappingId);
      mappingFiles.set(mappingId, file);
    }
    mapper = new UkvnMapper(file);
    mappers.set(mappingId, mapper);
  }
  return mapper;
}

function getCrossMapper(mappingId: string): CrossMapper {
  const key = `${OSNB_MAPPING_ID}->${mappingId}`;
  let cross = crossMappers.get(key);
  if (!cross) {
    const osnbMapper = getMapper(OSNB_MAPPING_ID);
    const targetMapper = getMapper(mappingId);
    cross = new CrossMapper(osnbMapper, targetMapper);
    crossMappers.set(key, cross);
  }
  return cross;
}

/**
 * Get raw UkvnMappingFile for a given mapping ID (for serving to frontend).
 */
export function getKvnMappingRaw(mappingId: string): UkvnMappingFile {
  let file = mappingFiles.get(mappingId);
  if (!file) {
    file = loadUkvnMapping(mappingId);
    mappingFiles.set(mappingId, file);
  }
  return file;
}

/**
 * List available KVN mappings.
 */
export function getAvailableMappings(): MappingInfo[] {
  return listUkvnMappings().map(id => {
    const file = loadUkvnMapping(id);
    const meta = MAPPING_META[id];
    return {
      id,
      name: meta?.displayName || file.name || id,
      shortname: meta?.shortname || id,
      displayName: meta?.displayName || file.name || id,
      entryCount: file.map.length,
    };
  });
}

/**
 * Build a MappingData object (bookNames + verseMap) from a KVN mapping,
 * compatible with the bibleTextParser's import format.
 *
 * The verseMap maps "bookId-targetChapter-targetVerse" -> "bookId-osnb2Chapter-osnb2Verse"
 * for all verses that differ between the target system and osnb2.
 */
export function getKvnMappingData(mappingId: string): { id: string; name: string; bookNames: Record<string, number>; verseMap: Record<string, string> } | null {
  const resolved = resolveMappingId(mappingId);
  if (!resolved) return null;

  const file = loadUkvnMapping(resolved);
  const meta = MAPPING_META[resolved];

  // Build verseMap from the mapping entries using CrossMapper
  // For each entry in the mapping, map osnb2 verse -> target verse
  // and create the reverse entry (target -> osnb2)
  const cross = getCrossMapper(resolved);
  const verseMap: Record<string, string> = {};

  // The mapping file entries tell us which verses differ.
  // For each entry, the osnb2 mapper converts osnb2->osmain,
  // then the target mapper converts osmain->target.
  // We iterate the osnb2 mapping entries and the target mapping entries
  // to find all verses that differ.
  const osnb2File = loadUkvnMapping(OSNB_MAPPING_ID);

  // Collect all book IDs that have any mapping entries
  const allEntries = [...osnb2File.map, ...file.map];
  for (const entry of allEntries) {
    const decoded = ukvnDecode(entry.kvnFrom);
    const bookId = decoded.book;
    if (bookId < 1 || bookId > 66) continue;

    // For each osnb2 verse involved, map to target
    const osnb2Kvn = ukvnEncode(bookId, decoded.chapter, decoded.verse);
    const result = cross.map(osnb2Kvn);
    const target = ukvnDecode(result.tkvn);

    if (target.chapter !== decoded.chapter || target.verse !== decoded.verse) {
      // Target differs from osnb2 — add to verseMap (target -> osnb2)
      const targetKey = `${bookId}-${target.chapter}-${target.verse}`;
      const osnb2Val = `${bookId}-${decoded.chapter}-${decoded.verse}`;
      verseMap[targetKey] = osnb2Val;
    }
  }

  return {
    id: resolved,
    name: meta?.displayName || file.name || resolved,
    bookNames: file.bookNames,
    verseMap,
  };
}

/**
 * Map a chapter from osnb2 to a target mapping system.
 *
 * Strategy: fetch osnb2 verses from neighboring chapters (ch-1, ch, ch+1),
 * map each forward to the target system, and collect those that land in the
 * requested target chapter. This handles chapter boundary shifts.
 */
export function mapChapter(
  bookId: number,
  targetChapter: number,
  mappingId: string,
  bible = 'osnb2',
): MappedVerse[] {
  if (mappingId === OSNB_MAPPING_ID) {
    // Identity — no mapping needed
    const verses = getVerses(bookId, targetChapter, bible);
    return verses.map(v => ({
      displayChapter: v.chapter,
      displayVerse: v.verse,
      osnb2Chapter: v.chapter,
      osnb2Verse: v.verse,
      partial: false,
      part: 0,
      totalParts: 1,
      text: v.text,
      verse: v,
    }));
  }

  const cross = getCrossMapper(mappingId);
  const result: MappedVerse[] = [];

  // Scan osnb2 chapters that might contribute verses to the target chapter.
  // Boundary shifts are at most ±1 chapter in practice.
  const chaptersToScan = [targetChapter - 1, targetChapter, targetChapter + 1]
    .filter(ch => ch >= 1);

  // Track which osmain parts we've seen, to calculate totalParts
  // Key: osmainKvn (with part=0), Value: set of part numbers seen
  const partTracker = new Map<number, Set<number>>();

  // First pass: collect all matching verses and track parts
  interface RawMatch {
    displayChapter: number;
    displayVerse: number;
    osnb2Chapter: number;
    osnb2Verse: number;
    partial: boolean;
    part: number;
    osmainBase: number;
    verse: Verse;
  }

  const rawMatches: RawMatch[] = [];

  for (const ch of chaptersToScan) {
    // Use osnb2 for coordinate lookup
    const osnb2Verses = getVerses(bookId, ch, 'osnb2');
    // Fetch text from requested bible (may differ from osnb2)
    const bibleVerses = bible !== 'osnb2' ? getVerses(bookId, ch, bible) : osnb2Verses;
    const bibleVerseMap = new Map(bibleVerses.map(v => [v.verse, v]));

    for (const v of osnb2Verses) {
      const kvn = ukvnEncode(bookId, v.chapter, v.verse);
      const mapped = cross.map(kvn);
      const target = ukvnDecode(mapped.tkvn);

      if (target.chapter === targetChapter) {
        const osmainDecoded = ukvnDecode(mapped.osmainKvn);
        const osmainBase = ukvnEncode(osmainDecoded.book, osmainDecoded.chapter, osmainDecoded.verse, 0);

        // Track parts for this osmain verse
        if (mapped.partial) {
          if (!partTracker.has(osmainBase)) {
            partTracker.set(osmainBase, new Set());
          }
          partTracker.get(osmainBase)!.add(osmainDecoded.part);
        }

        // Use text from the requested bible, fall back to osnb2
        const bibleVerse = bibleVerseMap.get(v.verse) || v;

        rawMatches.push({
          displayChapter: target.chapter,
          displayVerse: target.verse,
          osnb2Chapter: v.chapter,
          osnb2Verse: v.verse,
          partial: mapped.partial,
          part: osmainDecoded.part,
          osmainBase,
          verse: bibleVerse,
        });
      }
    }
  }

  // Second pass: build final result with totalParts
  // Note: each osnb2 verse already contains exactly its portion of text,
  // so no slicing is needed. The partial flag indicates that this verse
  // corresponds to only part of an osmain verse.
  for (const match of rawMatches) {
    const totalParts = match.partial
      ? (partTracker.get(match.osmainBase)?.size ?? 1)
      : 1;

    result.push({
      displayChapter: match.displayChapter,
      displayVerse: match.displayVerse,
      osnb2Chapter: match.osnb2Chapter,
      osnb2Verse: match.osnb2Verse,
      partial: match.partial,
      part: match.part,
      totalParts,
      text: match.verse.text,
      verse: match.verse,
    });
  }

  // Sort by display verse number
  result.sort((a, b) => a.displayVerse - b.displayVerse);

  return result;
}
