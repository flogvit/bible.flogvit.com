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
import { registrerMinnekilde } from './minne-regnskap.ts';

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

// Å slippe en mapping igjen koster ~300 ms på neste kapittelrender (#19), mens
// å beholde den koster minne som aldri gis tilbake — alle 1158 gjennom
// fil-cachen er 93 MB heap og 409 MB RSS. Siden når bare de 14 id-ene
// `resolveMappingId()` svarer på, men MCP-serveren (#169) slår opp hvilken som
// helst av de 1158 filene, og en klient som går gjennom katalogen ville fylt
// alle fire. Derfor et TAK over det siden bruker: på siden nås det aldri, i
// MCP-prosessen holder det en gjennomgang av katalogen nede. Antallet meldes
// som før, se
// `minne-regnskap.ts` og #110.
const MAX_CACHED_MAPPINGS = 32;

/** Map.set med tak: den eldste oppføringen går ut når taket er nådd. */
function remember<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= MAX_CACHED_MAPPINGS) cache.delete(cache.keys().next().value as K);
  cache.set(key, value);
  return value;
}
registrerMinnekilde('verse-mapper/mappingFiles', () => ({ oppforinger: mappingFiles.size }));
registrerMinnekilde('verse-mapper/mappers', () => ({ oppforinger: mappers.size }));
registrerMinnekilde('verse-mapper/crossMappers', () => ({ oppforinger: crossMappers.size }));
registrerMinnekilde('verse-mapper/mappingData', () => ({ oppforinger: mappingData.size }));

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
  return mappingFiles.get(id) ?? remember(mappingFiles, id, loadUkvnMapping(id));
}

function getMapper(mappingId: string): UkvnMapper {
  return mappers.get(mappingId) ?? remember(mappers, mappingId, new UkvnMapper(mappingFile(mappingId)));
}

function getCrossMapper(mappingId: string): CrossMapper {
  const key = `osnb->${mappingId}`;
  return crossMappers.get(key) ?? remember(crossMappers, key, new CrossMapper(getMapper('osnb'), getMapper(mappingId)));
}

const PSALMS = 19;

/**
 * Er osnb-verset en del av salmeoverskriften i en nummerering som trykker den
 * UTEN nummer (#173)? Da er det vers 0.
 *
 * osnb nummererer overskriften som egne vers, slik hebraisk gjør (Sal 51:1–2
 * er overskriften, 51:3 «Miskunn deg»). KVNs osmain bretter overskriften inn i
 * vers 1, og King James arver det: alle tre landet i KJV 51:1, så «Sal 51:1»
 * fra en trykt KJV ga overskriften. Regelen er den kvn selv bruker i
 * `sliceVersePart()`: av det som lander i vers 1, er alt UNNTATT det siste
 * overskriften. Den uttrykkes uten å kjenne datakilden — enten osmain-verset
 * har deler (51:1a–c) eller mappingfila peker to vers til samme mål (18:1–2).
 * En nummerering som nummererer overskriften selv (osnb, dnb2024) har ingenting
 * annet i vers 1, og der slår regelen aldri til.
 */
function isFoldedTitle(cross: CrossMapper, bookId: number, chapter: number, verse: number, target: { chapter: number; verse: number }): boolean {
  if (bookId !== PSALMS || target.chapter !== chapter || target.verse !== 1) return false;
  const next = ukvnDecode(cross.map(ukvnEncode(bookId, chapter, verse + 1)).tkvn);
  return next.chapter === chapter && next.verse === 1;
}

/**
 * Hvor et osnb-vers står i en annen nummerering — samme kryssmapping som
 * `getKvnMappingData()` bygger verseMap av, for ett vers. `mappingId` er en
 * fil-id fra `listMappingIds()`. En salmeoverskrift uten nummer er vers 0.
 */
export function osnbToMapping(mappingId: string, bookId: number, chapter: number, verse: number): { chapter: number; verse: number } {
  if (mappingId === 'osnb') return { chapter, verse };
  const cross = getCrossMapper(mappingId);
  const target = ukvnDecode(cross.map(ukvnEncode(bookId, chapter, verse)).tkvn);
  return { chapter: target.chapter, verse: isFoldedTitle(cross, bookId, chapter, verse, target) ? 0 : target.verse };
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
  const verseMap: Record<string, string> = {};

  const osnbFile = mappingFile('osnb');
  const allEntries = [...osnbFile.map, ...file.map];
  for (const entry of allEntries) {
    const decoded = ukvnDecode(entry.kvnFrom);
    const bookId = decoded.book;
    if (bookId < 1 || bookId > 66) continue;

    const target = osnbToMapping(resolved, bookId, decoded.chapter, decoded.verse);

    // Vers 0 (en salmeoverskrift) er ingen adresse noen skriver.
    if (target.verse !== 0 && (target.chapter !== decoded.chapter || target.verse !== decoded.verse)) {
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

  // Holder styr på hvilke osmain-deler vi har sett, for totalParts. En
  // overskrift (vers 0) teller ikke: KJV 51:1 er HELE osnb 51:3.
  const partTracker = new Map<number, Set<number>>();
  const foldedTitles = new Set<number>();

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

        const title = isFoldedTitle(cross, bookId, v.chapter, v.verse, target);
        if (title) foldedTitles.add(osmainBase);
        else if (mapped.partial) {
          if (!partTracker.has(osmainBase)) partTracker.set(osmainBase, new Set());
          partTracker.get(osmainBase)!.add(osmainDecoded.part);
        }

        const bibleVerse = bibleVerseMap.get(v.verse) || v;
        rawMatches.push({
          displayChapter: target.chapter,
          displayVerse: title ? 0 : target.verse,
          osnbChapter: v.chapter,
          osnbVerse: v.verse,
          partial: mapped.partial && !title,
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
    // Verset en overskrift var brettet inn i, står alene når overskriften er ute.
    const partial = match.partial && !(foldedTitles.has(match.osmainBase) && totalParts === 1);
    result.push({
      displayChapter: match.displayChapter,
      displayVerse: match.displayVerse,
      osnbChapter: match.osnbChapter,
      osnbVerse: match.osnbVerse,
      partial,
      part: match.part,
      totalParts,
      text: match.verse.text,
      verse: match.verse,
    });
  }

  result.sort((a, b) => a.displayVerse - b.displayVerse);
  return result;
}
