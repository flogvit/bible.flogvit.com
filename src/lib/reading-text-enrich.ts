// Berikelse av lesetekster med verstekster — delt av API-ruten
// (routes/api/reading-texts.ts) og lesetekst-detaljsiden (routes/pages/
// overview.tsx). Håndterer KVN-mapping (osmain → osnb for tekst, osmain →
// visningsmapping for nummer) og del-slicing (a/b/c).

import { getVerse, type ReadingTextWithSlots, type VerseRange } from './bible.ts';
import { UkvnMapper, loadUkvnMapping, ukvnEncode, ukvnDecode, sliceVersePart, resolveMappingId } from '@free-bible/kvn';
import { bookAbbrById } from './books-data.ts';
import { getChapterVerseCount } from './verse-counts.ts';

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

/**
 * Ordboksnøkkelen for lesningstypen en bok hører til.
 *
 * Returnerer NØKKELEN, ikke teksten. Funksjonen returnerte norske etiketter
 * («Salme», «GT-tekst»), og den lekkasjen var usynlig for norsk-vakta fordi
 * lesetekstene bare finnes på `nb` og blokka derfor aldri rendres under `/en/`
 * (#34). Kallstedene oversetter selv.
 */
export function readingTypeKey(bookId: number):
  'rt.psalm' | 'rt.ot' | 'rt.acts' | 'rt.gospel' | 'rt.revelation' | 'rt.epistle' {
  if (bookId === 19) return 'rt.psalm';
  if (bookId <= 39) return 'rt.ot';
  if (bookId === 44) return 'rt.acts';
  if (bookId >= 40 && bookId <= 43) return 'rt.gospel';
  if (bookId === 66) return 'rt.revelation';
  return 'rt.epistle';
}

/**
 * Referanselinja leseren ser — bygget av VERSENE som faktisk vises (#92).
 *
 * Den sto som `Jes 64,6b-65,2@dnb2024`: rå markup med mapping-id-en i behold.
 * `@dnb2024` er en intern nøkkel — den sier hvilken utgaves nummerering
 * adressen er skrevet i — og leseren har verken bruk for den eller mulighet til
 * å tolke den. Å bare STRIPPE den ville gjort etiketten pen og fortsatt gal:
 * versene rendres i leserens valgte nummerering, så en etikett i kildens
 * nummerering lover et annet sted enn blokka viser. Etiketten bygges derfor av
 * de samme versene som står under den, og kan da ikke lyve.
 *
 * Kapittelskillet slås sammen bare når forrige vers ER kapittelets siste — ellers
 * ville «Rom 9,2-5» + «Rom 10,1-4» blitt til «Rom 9,2-10,4», altså to lesninger
 * slått sammen til én sammenhengende som ikke finnes.
 */
export function formatVerseRefLabel(bookId: number, verses: EnrichedVerse[]): string {
  if (verses.length === 0) return '';
  interface Run { fromCh: number; from: number; fromPart?: string; toCh: number; to: number; toPart?: string }
  const runs: Run[] = [];
  for (const v of verses) {
    const last = runs[runs.length - 1];
    const contiguous =
      last &&
      ((v.chapter === last.toCh && v.verse === last.to + 1) ||
        (v.chapter === last.toCh + 1 && v.verse === 1 && last.to === getChapterVerseCount(bookId, last.toCh)));
    if (contiguous) {
      last!.toCh = v.chapter;
      last!.to = v.verse;
      last!.toPart = v.part;
    } else {
      runs.push({ fromCh: v.chapter, from: v.verse, fromPart: v.part, toCh: v.chapter, to: v.verse, toPart: v.part });
    }
  }
  const spans = runs.map((r) => {
    const start = `${r.fromCh},${r.from}${r.fromPart ?? ''}`;
    if (r.fromCh === r.toCh && r.from === r.to) return start;
    const end = r.toCh === r.fromCh ? `${r.to}${r.toPart ?? ''}` : `${r.toCh},${r.to}${r.toPart ?? ''}`;
    return `${start}-${end}`;
  });
  return `${bookAbbrById(bookId)} ${spans.join('; ')}`;
}

/**
 * Reserveetiketten når vi ikke har ett eneste vers å bygge den av — mapping-id-en
 * fjernes, for den er intern uansett hvorfor teksten mangler.
 */
export function refTextWithoutSystem(ref: string): string {
  const atIdx = ref.lastIndexOf('@');
  return atIdx === -1 ? ref : ref.slice(0, atIdx).trim();
}
