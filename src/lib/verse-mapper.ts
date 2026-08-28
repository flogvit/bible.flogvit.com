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
  osnbChapter: number;
  osnbVerse: number;
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
}

// Cachede mappere og mapping-filer.
const mappingFiles = new Map<string, UkvnMappingFile>();
const mappers = new Map<string, UkvnMapper>();
const crossMappers = new Map<string, CrossMapper>();
/** Ferdig bygget MappingData per id — verseMap-en skannes over ALLE oppføringer. */
const mappingData = new Map<
  string,
  { id: string; name: string; bookNames: Record<string, number>; verseMap: Record<string, string> }
>();

/**
 * Mapping-fila for en id, lest ÉN gang per prosess.
 *
 * `loadUkvnMapping` leser fila med readFileSync og JSON.parser den, og filene
 * er store. Kall den ALDRI direkte herfra: `getAvailableMappings()` gjorde det
 * for hver mapping ved hvert kall, og den kalles fra kapittelsiden (verktøy-
 * linja) og /innstillinger. En CPU-profil av kapittelrenderen viste at 85 % av
 * tiden gikk til readFileSync + JSON.parse i nettopp den løkka — ~300 ms av
 * ~350 ms per sidevisning, uavhengig av hvor mange vers kapittelet har (#19).
 */
function mappingFile(id: string): UkvnMappingFile {
  let file = mappingFiles.get(id);
  if (!file) {
    file = loadUkvnMapping(id);
    mappingFiles.set(id, file);
  }
  return file;
}

function getMapper(mappingId: string): UkvnMapper {
  let mapper = mappers.get(mappingId);
  if (!mapper) {
    mapper = new UkvnMapper(mappingFile(mappingId));
    mappers.set(mappingId, mapper);
  }
  return mapper;
}

function getCrossMapper(mappingId: string): CrossMapper {
  const key = `osnb->${mappingId}`;
  let cross = crossMappers.get(key);
  if (!cross) {
    const osnbMapper = getMapper('osnb');
    const targetMapper = getMapper(mappingId);
    cross = new CrossMapper(osnbMapper, targetMapper);
    crossMappers.set(key, cross);
  }
  return cross;
}

/** Rå UkvnMappingFile for en mapping-id (serveres til frontend). */
export function getKvnMappingRaw(mappingId: string): UkvnMappingFile {
  return mappingFile(mappingId);
}

/** Id-ene vi har mapping-filer for, i katalogrekkefølge. */
export function listMappingIds(): string[] {
  return listUkvnMappings();
}

/**
 * Rå mapping-fil UTENOM fil-cachen — for den som skal gjennom ALLE 1158 (#104).
 *
 * Fil-cachen over er riktig for de mappingene en leser faktisk velger: de er
 * få (14 av 1158 resolver i det hele tatt), og de leses om igjen på hver
 * sidevisning. Den er FEIL for et gjennomløp av hele katalogen: da blir alle
 * 1158 liggende, og det er 232 MB beholdt heap / 925 MB RSS målt — altså
 * `FATAL ERROR: Reached heap limit` i en container med et minnetak.
 *
 * Samme avveining som i `getAvailableMappings()` under, og den er ikke ny her:
 * det som skal leses ÉN gang, skal ikke legges igjen i en cache som lever ut
 * prosessen. Den som kaller denne må derfor slippe fila før neste hentes.
 */
export function loadRawMappingUncached(id: string): UkvnMappingFile {
  return loadUkvnMapping(id);
}

/**
 * Tilgjengelige KVN-mappings — bygget av KATALOGEN, uten å åpne én eneste fil.
 *
 * Den leste alle 1158 mappingfilene (~109 MB JSON) for å hente tre felter per
 * fil, og det er 54 MB RSS PERMANENT (#106). Filene slippes med en gang og
 * heapen viser derfor ingenting galt — men allokatorens høyvannsmerke gis aldri
 * tilbake til OS-et, og RSS er tallet cgroup-en teller når den OOM-dreper
 * containeren. Av «162 MB grunnlast» var 54 denne løkka, brent på den FØRSTE
 * kapittelrenderen etter hver restart, altså på en leser hver gang.
 *
 * Å lese filene billigere er ikke fiksen: et rent byte-skann uten JSON.parse
 * ble målt til +55 MB, praktisk talt det samme. Kostnaden er å røre 109 MB i
 * det hele tatt, ikke hva man gjør med dem.
 *
 * Det gikk uten å miste noe fordi filene ikke bar noe vi ikke alt hadde:
 * `file.name` er ORDRETT id-en i alle 1158 (målt, og vaktet av DATA-halvdelen
 * i `mapping-list-memory.test.ts` — leser hodet av hver fil, ikke hele).
 * `entryCount` er den ene som TRENGTE fila, og den var det ingen som leste:
 * ikke nedtrekket på kapittelsida, ikke /innstillinger, ikke `translations.js`,
 * som er den eneste klienten av `/api/mappings/kvn`. Å beholde et felt ingen
 * ser til 54 MB på en container med 288 er ikke en handel verdt å gjøre.
 */
let availableMappings: MappingInfo[] | null = null;

export function getAvailableMappings(): MappingInfo[] {
  return (availableMappings ??= listUkvnMappings().map((id) => {
    const meta = MAPPING_META[id];
    return {
      id,
      name: meta?.displayName || id,
      shortname: meta?.shortname || id,
      displayName: meta?.displayName || id,
    };
  }));
}

/**
 * MappingData (bookNames + verseMap) fra en KVN-mapping, kompatibel med
 * bibleTextParsers importformat. verseMap: "bok-målkap-målvers" →
 * "bok-osnbkap-osnbvers" for vers som avviker fra osnb.
 */
export function getKvnMappingData(
  mappingId: string,
): { id: string; name: string; bookNames: Record<string, number>; verseMap: Record<string, string> } | null {
  const resolved = resolveMappingId(mappingId);
  if (!resolved) return null;
  const cached = mappingData.get(resolved);
  if (cached) return cached;

  const file = mappingFile(resolved);
  const meta = MAPPING_META[resolved];
  const cross = getCrossMapper(resolved);
  const verseMap: Record<string, string> = {};

  const osnbFile = mappingFile('osnb');
  const allEntries = [...osnbFile.map, ...file.map];
  for (const entry of allEntries) {
    const decoded = ukvnDecode(entry.kvnFrom);
    const bookId = decoded.book;
    if (bookId < 1 || bookId > 66) continue;

    const osnbKvn = ukvnEncode(bookId, decoded.chapter, decoded.verse);
    const result = cross.map(osnbKvn);
    const target = ukvnDecode(result.tkvn);

    if (target.chapter !== decoded.chapter || target.verse !== decoded.verse) {
      const targetKey = `${bookId}-${target.chapter}-${target.verse}`;
      verseMap[targetKey] = `${bookId}-${decoded.chapter}-${decoded.verse}`;
    }
  }

  const data = {
    id: resolved,
    name: meta?.displayName || file.name || resolved,
    bookNames: file.bookNames,
    verseMap,
  };
  mappingData.set(resolved, data);
  return data;
}

/**
 * Mapper et kapittel fra osnb til et mål-mappingsystem. Skanner nabokapitler
 * (±1) i osnb og samler versene som lander i mål-kapittelet — håndterer
 * kapittelgrense-forskyvninger.
 */
export async function mapChapter(
  bookId: number,
  targetChapter: number,
  mappingId: string,
  bible = 'osnb',
): Promise<MappedVerse[]> {
  if (mappingId === 'osnb') {
    // Identitet — ingen mapping nødvendig.
    const verses = await getVerses(bookId, targetChapter, bible);
    return verses.map((v) => ({
      displayChapter: v.chapter,
      displayVerse: v.verse,
      osnbChapter: v.chapter,
      osnbVerse: v.verse,
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
    osnbChapter: number;
    osnbVerse: number;
    partial: boolean;
    part: number;
    osmainBase: number;
    verse: Verse;
  }

  const rawMatches: RawMatch[] = [];

  for (const ch of chaptersToScan) {
    // osnb for koordinatoppslag; tekst fra ønsket bibel.
    const osnbVerses = await getVerses(bookId, ch, 'osnb');
    const bibleVerses = bible !== 'osnb' ? await getVerses(bookId, ch, bible) : osnbVerses;
    const bibleVerseMap = new Map(bibleVerses.map((v) => [v.verse, v]));

    for (const v of osnbVerses) {
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
          osnbChapter: v.chapter,
          osnbVerse: v.verse,
          partial: mapped.partial,
          part: osmainDecoded.part,
          osmainBase,
          verse: bibleVerse,
        });
      }
    }
  }

  // Hver osnb-vers inneholder allerede nøyaktig sin del av teksten — ingen
  // slicing; partial-flagget sier at verset er del av et osmain-vers.
  for (const match of rawMatches) {
    const totalParts = match.partial ? (partTracker.get(match.osmainBase)?.size ?? 1) : 1;
    result.push({
      displayChapter: match.displayChapter,
      displayVerse: match.displayVerse,
      osnbChapter: match.osnbChapter,
      osnbVerse: match.osnbVerse,
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
