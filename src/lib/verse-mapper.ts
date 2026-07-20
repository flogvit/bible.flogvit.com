// Port av api/lib/verse-mapper.ts — kvn-oppslagene er synkrone (leser vendored
// mapping-filer), men versoppslagene mot DB er nå async, så mapChapter er async.

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
import { getVerses } from './bible.ts';
import type { Verse } from './bible.ts';

export { MAPPING_META, resolveMappingId } from '@free-bible/kvn';

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

// Cachede mappere og mapping-filer.
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
  const key = `osnb2->${mappingId}`;
  let cross = crossMappers.get(key);
  if (!cross) {
    const osnb2Mapper = getMapper('osnb2');
    const targetMapper = getMapper(mappingId);
    cross = new CrossMapper(osnb2Mapper, targetMapper);
    crossMappers.set(key, cross);
  }
  return cross;
}

/** Rå UkvnMappingFile for en mapping-id (serveres til frontend). */
export function getKvnMappingRaw(mappingId: string): UkvnMappingFile {
  let file = mappingFiles.get(mappingId);
  if (!file) {
    file = loadUkvnMapping(mappingId);
    mappingFiles.set(mappingId, file);
  }
  return file;
}

/** Tilgjengelige KVN-mappings. */
export function getAvailableMappings(): MappingInfo[] {
  return listUkvnMappings().map((id) => {
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
 * MappingData (bookNames + verseMap) fra en KVN-mapping, kompatibel med
 * bibleTextParsers importformat. verseMap: "bok-målkap-målvers" →
 * "bok-osnb2kap-osnb2vers" for vers som avviker fra osnb2.
 */
export function getKvnMappingData(
  mappingId: string,
): { id: string; name: string; bookNames: Record<string, number>; verseMap: Record<string, string> } | null {
  const resolved = resolveMappingId(mappingId);
  if (!resolved) return null;

  const file = loadUkvnMapping(resolved);
  const meta = MAPPING_META[resolved];
  const cross = getCrossMapper(resolved);
  const verseMap: Record<string, string> = {};

  const osnb2File = loadUkvnMapping('osnb2');
  const allEntries = [...osnb2File.map, ...file.map];
  for (const entry of allEntries) {
    const decoded = ukvnDecode(entry.kvnFrom);
    const bookId = decoded.book;
    if (bookId < 1 || bookId > 66) continue;

    const osnb2Kvn = ukvnEncode(bookId, decoded.chapter, decoded.verse);
    const result = cross.map(osnb2Kvn);
    const target = ukvnDecode(result.tkvn);

    if (target.chapter !== decoded.chapter || target.verse !== decoded.verse) {
      const targetKey = `${bookId}-${target.chapter}-${target.verse}`;
      verseMap[targetKey] = `${bookId}-${decoded.chapter}-${decoded.verse}`;
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
 * Mapper et kapittel fra osnb2 til et mål-mappingsystem. Skanner nabokapitler
 * (±1) i osnb2 og samler versene som lander i mål-kapittelet — håndterer
 * kapittelgrense-forskyvninger.
 */
export async function mapChapter(
  bookId: number,
  targetChapter: number,
  mappingId: string,
  bible = 'osnb2',
): Promise<MappedVerse[]> {
  if (mappingId === 'osnb2') {
    // Identitet — ingen mapping nødvendig.
    const verses = await getVerses(bookId, targetChapter, bible);
    return verses.map((v) => ({
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

  const chaptersToScan = [targetChapter - 1, targetChapter, targetChapter + 1].filter(
    (ch) => ch >= 1,
  );

  // Holder styr på hvilke osmain-deler vi har sett, for totalParts.
  const partTracker = new Map<number, Set<number>>();

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
    // osnb2 for koordinatoppslag; tekst fra ønsket bibel.
    const osnb2Verses = await getVerses(bookId, ch, 'osnb2');
    const bibleVerses = bible !== 'osnb2' ? await getVerses(bookId, ch, bible) : osnb2Verses;
    const bibleVerseMap = new Map(bibleVerses.map((v) => [v.verse, v]));

    for (const v of osnb2Verses) {
      const kvn = ukvnEncode(bookId, v.chapter, v.verse);
      const mapped = cross.map(kvn);
      const target = ukvnDecode(mapped.tkvn);

      if (target.chapter === targetChapter) {
        const osmainDecoded = ukvnDecode(mapped.osmainKvn);
        const osmainBase = ukvnEncode(
          osmainDecoded.book,
          osmainDecoded.chapter,
          osmainDecoded.verse,
          0,
        );

        if (mapped.partial) {
          if (!partTracker.has(osmainBase)) partTracker.set(osmainBase, new Set());
          partTracker.get(osmainBase)!.add(osmainDecoded.part);
        }

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

  // Hver osnb2-vers inneholder allerede nøyaktig sin del av teksten — ingen
  // slicing; partial-flagget sier at verset er del av et osmain-vers.
  for (const match of rawMatches) {
    const totalParts = match.partial ? (partTracker.get(match.osmainBase)?.size ?? 1) : 1;
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

  result.sort((a, b) => a.displayVerse - b.displayVerse);
  return result;
}
