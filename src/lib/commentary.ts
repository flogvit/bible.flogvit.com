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

/**
 * OSIS-bokkodene, slik `<ref osisRef>` skriver dem. Skrevet ut her framfor å
 * avledes av en visningsliste: en endret forkortelse i grensesnittet skal ikke
 * kunne bryte lenkene.
 */
export const OSIS_BOOKS: Record<string, number> = {
  Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8, '1Sam': 9, '2Sam': 10,
  '1Kgs': 11, '2Kgs': 12, '1Chr': 13, '2Chr': 14, Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19,
  Prov: 20, Eccl: 21, Song: 22, Isa: 23, Jer: 24, Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29,
  Amos: 30, Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36, Hag: 37, Zech: 38, Mal: 39,
  Matt: 40, Mark: 41, Luke: 42, John: 43, Acts: 44, Rom: 45, '1Cor': 46, '2Cor': 47, Gal: 48,
  Eph: 49, Phil: 50, Col: 51, '1Thess': 52, '2Thess': 53, '1Tim': 54, '2Tim': 55, Titus: 56,
  Phlm: 57, Heb: 58, Jas: 59, '1Pet': 60, '2Pet': 61, '1John': 62, '2John': 63, '3John': 64,
  Jude: 65, Rev: 66,
};

/** Begynnelsen på en OSIS-henvisning («Gen.1.14-Gen.1.15» → 1 Mos 1:14). */
export function parseOsisRef(ref: string): { book: number; chapter: number; verse: number } | null {
  const first = ref.split(/[-\s;,]/)[0] ?? '';
  const m = first.match(/^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const book = OSIS_BOOKS[m[1]!];
  if (!book) return null;
  return { book, chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : 0 };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/**
 * Et avsnitt som trygg HTML. Kilden har `<h>`, `<i>`, `<b>`, `<sup>` og
 * `<ref osisRef="…">`; alt annet escapes, også tagger vi ikke kjenner. Teksten
 * escapes FØRST og taggene gjenopprettes etterpå, så ingenting fra kilden når
 * siden som rå HTML. `link` gir adressen til en henvisning, eller null når den
 * ikke kan løses (da står teksten uten lenke).
 */
export function renderCommentaryParagraph(text: string, link: (osisRef: string) => string | null): string {
  let html = escapeHtml(text);
  html = html.replace(/&lt;(\/?)(i|b|sup)&gt;/g, '<$1$2>');
  html = html.replace(/&lt;h&gt;([\s\S]*?)&lt;\/h&gt;/g, '<strong class="cm-heading">$1</strong>');
  html = html.replace(/&lt;ref osisRef=&quot;([^&]*)&quot;&gt;([\s\S]*?)&lt;\/ref&gt;/g, (_m, ref: string, label: string) => {
    const href = link(ref);
    return href ? `<a class="cm-ref" href="${escapeHtml(href)}">${label}</a>` : label;
  });
  return html;
}

/** Er avsnittet bare en overskrift? Da står det som overskrift, ikke som brødtekst. */
export function isHeadingOnly(text: string): boolean {
  return /^\s*<h>[\s\S]*<\/h>\s*$/.test(text);
}

/**
 * Et avsnitt som markdown, for MCP-svaret og andre tekstflater: overskrifter
 * og kursiv beholdes, en henvisning blir teksten sin, og ingen HTML slipper ut.
 */
export function commentaryMarkdown(text: string): string {
  return text
    .replace(/<h>([\s\S]*?)<\/h>/g, '**$1**')
    .replace(/<\/?(?:i|b)>/g, '*')
    .replace(/<\/?sup>/g, '')
    .replace(/<ref osisRef="[^"]*">([\s\S]*?)<\/ref>/g, '$1')
    .replace(/<[^>]+>/g, '');
}
