// Bibelkommentarer som innholdsmodul (#269), på linje med sammendrag, personer,
// viktige ord og tidslinje. Matthew Henry er det første verket; flere verk og
// språk kommer som nye kataloger i free-bible, aldri som en liste her.
//
// Denne fila er ren logikk uten database, så den kan testes for seg:
//   - formen på free-bibles kapittelfiler (`generate/commentary.ts` → ChapterFile)
//   - forankringen fra verkets nummerering (KJV) til osnb-adresser
//   - OSIS-henvisningene i teksten (`<ref osisRef="Gen.1.1">`)
//   - en rendrer som slipper gjennom akkurat den markupen kilden har, og
//     escaper alt annet.
//
// HVORFOR forankringen: Matthew Henry følger KJV-nummereringen (SWORD-modulen
// MHC). Lesesiden er osnb, som følger hebraisk: KJV 2 Mos 8:1–4 er osnb 7:26–29,
// og en salme med overskrift har ett vers mer. Uten oversettelsen ville
// kommentaren til «Slipp mitt folk» stått ved froskene, og en lenke til Sal 51:1
// ville gått til overskriften. Reglene er de samme som utgaveimporten bruker
// (`toOsnbNumbering`, #200): egen nummerering → osmain → osnb.

import { UKVN_PART_SIZE, ukvnDecode, ukvnEncode, type UkvnMappingFile } from '@free-bible/kvn';

// Rendreren, OSIS-tabellen og markdown-formen deles med frakoblet lesing
// (public/js/commentary-render.js), så siden og det nedlastede kapittelet
// tegner kommentaren likt.
// @ts-expect-error — delt klient-modul uten typer (formen bor ett sted, som verse-hash.js, #91)
import * as shared from '../../public/js/commentary-render.js';

/** OSIS-bokkodene, slik `<ref osisRef>` skriver dem → bok-id. */
export const OSIS_BOOKS: Record<string, number> = shared.OSIS_BOOKS;
/** Begynnelsen på en OSIS-henvisning («Gen.1.14-Gen.1.15» → 1 Mos 1:14). */
export const parseOsisRef: (
  ref: string,
) => { book: number; chapter: number; verse: number; endChapter: number; endVerse: number } | null = shared.parseOsisRef;
/** Et avsnitt som trygg HTML: alt escapes, bare kildens egne tagger gjenopprettes. */
/** Hva en henvisning lenker til: en adresse, eller en adresse og nummereringen etiketten er skrevet i. */
export type CommentaryLink = string | { href: string; labelNumbering?: string } | null;
export const renderCommentaryParagraph: (text: string, link: (osisRef: string) => CommentaryLink) => string =
  shared.renderCommentaryParagraph;
/** Er avsnittet bare en overskrift? */
export const isHeadingOnly: (text: string) => boolean = shared.isHeadingOnly;
/** Et avsnitt som markdown, uten HTML. */
export const commentaryMarkdown: (text: string) => string = shared.commentaryMarkdown;
/** Et avsnitt som ren tekst. */
export const commentaryPlain: (text: string) => string = shared.commentaryPlain;
/** Begynnelsen av en ren tekst, kuttet ved et ordskille. */
export const commentaryTeaser: (text: string, max?: number) => string = shared.commentaryTeaser;

/** En seksjon slik den ligger i basen, før formingen (#286). */
export interface RawCommentarySection {
  /** Verkets eget kapittel og seksjonsnummer: nøkkelen kilden og gjengivelsen deler. */
  sourceChapter: number;
  sectionNo: number;
  /** Hvor seksjonen står i osnb. Vers 0 er en innledning. */
  from: OsnbAt;
  to: OsnbAt;
  paragraphs: string[];
  /** Kildens avsnitt til samme seksjon, når teksten over er en gjengivelse. */
  sourceParagraphs: string[] | null;
  /** Modellene som oversatte og kontrollerte; null for kildens egen tekst. */
  models: string[] | null;
}
/** En del leseren ser: en seksjon, en kapittelinnledning eller bokas innledning. */
export interface CommentaryPart extends RawCommentarySection {
  /** Delens adresse innen verket: `<kap>-<nr>`, `<kap>-<nr>-intro` eller `book`. */
  id: string;
}
/**
 * Formen leseren ser (#286): versitatene ute, bokas innledning skilt ut og
 * kapittelets innledning som egen del. Se `public/js/commentary-render.js`.
 */
export const shapeCommentary: (sections: RawCommentarySection[]) => { bookIntro: CommentaryPart | null; sections: CommentaryPart[] } =
  shared.shapeCommentary;

/**
 * Løft når forankringen eller det som lagres per seksjon endres: importens
 * hash tar den med, så alt importeres på nytt med de nye reglene framfor å stå
 * med de gamle til kilden endres.
 */
export const COMMENTARY_IMPORT_RULES = 1;

/** Én seksjon i en kapittelfil: verkets kommentar til versene `from`–`to`. */
export interface CommentarySection {
  /** Første vers; 0 er kapittelets innledning. */
  from: number;
  to: number;
  /** Avsnitt med lett markup. Avsnitt i i en gjengivelse er avsnitt i i kilden. */
  paragraphs: string[];
  /** Modellene som oversatte og kontrollerte seksjonen. */
  models?: string[];
}

/** `generate/commentary/<verk>/<språk>/<bok>/<kapittel>.json` */
export interface CommentaryChapterFile {
  work: string;
  language: string;
  /** Språket gjengivelsen er laget fra; mangler i kildespråket selv. */
  source?: string;
  book: number;
  /** 0 er bokas innledning. */
  chapter: number;
  sections: CommentarySection[];
}

/** `generate/commentary/<verk>/meta.json` */
export interface CommentaryWorkMeta {
  id: string;
  title: string;
  author?: string;
  written?: string;
  /** Kildespråket. */
  language: string;
  license: string;
  url?: string;
}

/** `generate/commentary/<verk>/<språk>/index.json`: bøkene som er ferdige på språket. */
export interface CommentaryLanguageIndex {
  work: string;
  language: string;
  source?: string;
  books: Record<string, { published?: string; models?: string[] }>;
}

/** Leser og sjekker en kapittelfil. Returnerer en feilmelding framfor å kaste. */
export function parseCommentaryChapter(text: string): CommentaryChapterFile | string {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch (e) {
    return `ugyldig JSON: ${(e as Error).message}`;
  }
  const f = d as Partial<CommentaryChapterFile>;
  if (typeof f?.work !== 'string' || typeof f.language !== 'string') return 'mangler work/language';
  if (!Number.isInteger(f.book) || !Number.isInteger(f.chapter)) return 'mangler book/chapter';
  if (!Array.isArray(f.sections)) return 'mangler sections';
  for (const [i, s] of f.sections.entries()) {
    if (!Number.isInteger(s?.from) || !Number.isInteger(s?.to)) return `seksjon ${i}: mangler from/to`;
    if (!Array.isArray(s.paragraphs) || s.paragraphs.some((p) => typeof p !== 'string')) return `seksjon ${i}: paragraphs er ikke tekst`;
  }
  return f as CommentaryChapterFile;
}

/** En adresse i osnb. Vers 0 er kapittelets innledning. */
export interface OsnbAt {
  chapter: number;
  verse: number;
}

/**
 * Oversetter (bok, kapittel, vers) i en mappings nummerering til osnb. `end`
 * velger SISTE osnb-vers når et osmain-vers er delt (en salmes overskrift og
 * tekst), ellers det første — så et område dekker hele det delte verset.
 */
export type ToOsnb = (book: number, chapter: number, verse: number, end?: boolean) => OsnbAt;

export function osnbTranslator(source: UkvnMappingFile, osnb: UkvnMappingFile): ToOsnb {
  const toKvn = new Map<number, number>();
  for (const e of source.map) if (!toKvn.has(e.tkvnFrom)) toKvn.set(e.tkvnFrom, e.kvnFrom);
  const kvnToOsnb = new Map<number, number>();
  for (const e of osnb.map) kvnToOsnb.set(e.kvnFrom, e.tkvnFrom);
  const sourceKvn = (tkvn: number): number => toKvn.get(tkvn) ?? tkvn;
  const osnbTkvn = (kvn: number): number => kvnToOsnb.get(kvn) ?? kvn;
  return (book, chapter, verse, end = false) => {
    if (verse === 0) {
      // Innledningen står foran kapittelets første vers, der det havner.
      const first = ukvnDecode(osnbTkvn(sourceKvn(ukvnEncode(book, chapter, 1))));
      return { chapter: first.chapter, verse: 0 };
    }
    const kvn = sourceKvn(ukvnEncode(book, chapter, verse));
    const parts: number[] = [];
    for (let p = 1; p < UKVN_PART_SIZE; p++) {
      const t = kvnToOsnb.get(kvn - (kvn % UKVN_PART_SIZE) + p);
      if (t === undefined) break;
      parts.push(t);
    }
    const target = parts.length ? parts[end ? parts.length - 1 : 0]! : osnbTkvn(kvn);
    const d = ukvnDecode(target);
    return { chapter: d.chapter, verse: d.verse };
  };
}

/** Hvor en seksjon står i osnb: fra og med `start` til og med `end`. */
export function anchorSection(toOsnb: ToOsnb, book: number, chapter: number, s: Pick<CommentarySection, 'from' | 'to'>): { start: OsnbAt; end: OsnbAt } {
  // Kapittel 0 er bokas innledning: den står foran kapittel 1.
  if (chapter === 0) return { start: { chapter: 1, verse: 0 }, end: { chapter: 1, verse: 0 } };
  const start = toOsnb(book, chapter, s.from);
  const end = s.to < s.from ? start : s.to === 0 ? start : toOsnb(book, chapter, s.to, true);
  return { start, end };
}

/**
 * Forankrer alle seksjonene i ett kapittel. Innledningen (vers 0) står i det
 * osnb-kapittelet der FLEST av kapittelets vers lander, ikke der vers 1 gjør:
 * innledningen til KJV 2 Mos 8 handler om froskene, myggen og fluene (osnb
 * 8:1–28), mens bare 8:1–4 lander i osnb 7. Like mange: det første kapittelet.
 */
export function anchorChapterSections(
  toOsnb: ToOsnb,
  book: number,
  chapter: number,
  sections: Pick<CommentarySection, 'from' | 'to'>[],
): { start: OsnbAt; end: OsnbAt }[] {
  const anchors = sections.map((s) => anchorSection(toOsnb, book, chapter, s));
  if (chapter === 0) return anchors;
  const weight = new Map<number, number>();
  for (const s of sections) {
    for (let v = Math.max(1, s.from); v <= s.to; v++) {
      const c = toOsnb(book, chapter, v).chapter;
      weight.set(c, (weight.get(c) ?? 0) + 1);
    }
  }
  if (weight.size === 0) return anchors;
  const main = [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  return anchors.map((a, i) =>
    sections[i]!.from === 0 ? { start: { chapter: main, verse: 0 }, end: { chapter: main, verse: 0 } } : a,
  );
}
