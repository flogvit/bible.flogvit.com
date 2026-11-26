// Bibelkommentarer fra basen (#269). Ren logikk (forankring, OSIS, rendrer) står
// i `commentary.ts`; her er spørringene lesesiden, API-et og MCP-en deler.

import { getSql } from './db.ts';
import { contentLanguageChain, currentContentLanguage, localeToContentLanguage } from './lang.ts';

export interface CommentaryWork {
  id: string;
  title: string;
  author: string | null;
  written: string | null;
  license: string;
  url: string | null;
  sourceLanguage: string;
}

export interface CommentaryAt {
  chapter: number;
  verse: number;
}

export interface CommentarySectionView {
  /** Verkets eget kapittel og seksjonsnummer: nøkkelen kilden og gjengivelsen deler. */
  sourceChapter: number;
  sectionNo: number;
  /** Hvor seksjonen står i osnb. Vers 0 er en innledning. */
  from: CommentaryAt;
  to: CommentaryAt;
  paragraphs: string[];
  /** Kildens avsnitt til samme seksjon, når teksten over er en gjengivelse. */
  sourceParagraphs: string[] | null;
  /** Modellene som oversatte og kontrollerte; null for kildens egen tekst. */
  models: string[] | null;
}

export interface CommentaryForChapter {
  work: CommentaryWork;
  /** Språket avsnittene står på. */
  language: string;
  /**
   * Leseren ba om et språk verket ikke er gjengitt på, så kilden vises. Siden
   * sier det, i stedet for å vise engelsk tekst uten forklaring.
   */
  sourceOnly: boolean;
  sections: CommentarySectionView[];
}

interface CommentaryRow {
  source_chapter: number;
  section_no: number;
  osnb_chapter_from: number;
  osnb_verse_from: number;
  osnb_chapter_to: number;
  osnb_verse_to: number;
  paragraphs: string;
  models: string | null;
}

const parseJsonList = (s: string | null): string[] | null => {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return null;
  }
};

/**
 * Kommentarene til ett osnb-kapittel, verk for verk. En seksjon tas med når den
 * overlapper kapittelet; en seksjon som spenner over et kapittelskille (KJV 2
 * Mos 8:1–15 er osnb 7:26–8:11) står på begge.
 *
 * Språket følger `contentLanguageChain` som resten av innholdet, med kildens
 * språk sist: finnes ingen gjengivelse for kapittelet, vises kilden og
 * `sourceOnly` sier fra. En gjengivelse får kildens avsnitt med seg.
 */
export async function getCommentaryForChapter(
  bookId: number,
  chapter: number,
  lang = currentContentLanguage(),
): Promise<CommentaryForChapter[]> {
  const sql = getSql();
  const works = (await sql`
    SELECT id, title, author, written, license, url, source_language FROM commentary_works ORDER BY id
  `) as { id: string; title: string; author: string | null; written: string | null; license: string; url: string | null; source_language: string }[];
  const rowsFor = (work: string, language: string) =>
    sql`
      SELECT source_chapter, section_no, osnb_chapter_from, osnb_verse_from, osnb_chapter_to, osnb_verse_to, paragraphs, models
      FROM commentary_sections
      WHERE work = ${work} AND book_id = ${bookId} AND language = ${language}
        AND osnb_chapter_from <= ${chapter} AND osnb_chapter_to >= ${chapter}
      ORDER BY osnb_chapter_from, osnb_verse_from, source_chapter, section_no
    ` as Promise<CommentaryRow[]>;

  const requested = localeToContentLanguage(lang);
  const result: CommentaryForChapter[] = [];
  for (const w of works) {
    const chain = [...contentLanguageChain(lang).filter((l) => l !== w.source_language), w.source_language];
    let language = w.source_language;
    let rows: CommentaryRow[] = [];
    for (const candidate of chain) {
      rows = await rowsFor(w.id, candidate);
      if (rows.length > 0) {
        language = candidate;
        break;
      }
    }
    if (rows.length === 0) continue;
    const source =
      language === w.source_language
        ? null
        : new Map((await rowsFor(w.id, w.source_language)).map((r) => [`${r.source_chapter}:${r.section_no}`, parseJsonList(r.paragraphs)]));
    result.push({
      work: { id: w.id, title: w.title, author: w.author, written: w.written, license: w.license, url: w.url, sourceLanguage: w.source_language },
      language,
      sourceOnly: language === w.source_language && requested !== w.source_language,
      sections: rows.map((r) => ({
        sourceChapter: r.source_chapter,
        sectionNo: r.section_no,
        from: { chapter: r.osnb_chapter_from, verse: r.osnb_verse_from },
        to: { chapter: r.osnb_chapter_to, verse: r.osnb_verse_to },
        paragraphs: parseJsonList(r.paragraphs) ?? [],
        sourceParagraphs: source ? (source.get(`${r.source_chapter}:${r.section_no}`) ?? null) : null,
        models: parseJsonList(r.models),
      })),
    });
  }
  return result;
}

export interface CommentarySearchHit {
  work: string;
  workTitle: string;
  author: string | null;
  bookId: number;
  chapter: number;
  verse: number;
  sourceChapter: number;
  sectionNo: number;
  /** Utdrag rundt treffet, uten markup. */
  snippet: string;
}

const plain = (s: string) =>
  s.replace(/<ref osisRef="[^"]*">([\s\S]*?)<\/ref>/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Søk i kommentarteksten (#269), som søket i viktige ord: hvert ord må finnes,
 * språket følger kjeden (første språk med treff), og treffene sorteres i
 * bibelrekkefølge. Søket leser avsnittene som JSON-tekst; treffet sjekkes mot
 * den rensede teksten, så et ord som bare står i en tagg ikke gir treff.
 */
export async function searchCommentary(query: string, lang = currentContentLanguage(), limit = 30): Promise<CommentarySearchHit[]> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const sql = getSql();
  const conditions = words.map(() => 'LOWER(s.paragraphs) LIKE ?').join(' AND ');
  for (const language of contentLanguageChain(lang)) {
    const rows = (await sql.unsafe(
      `SELECT s.work, w.title, w.author, s.book_id, s.osnb_chapter_from, s.osnb_verse_from,
              s.source_chapter, s.section_no, s.paragraphs
       FROM commentary_sections s JOIN commentary_works w ON w.id = s.work
       WHERE s.language = ? AND ${conditions}
       ORDER BY s.book_id, s.osnb_chapter_from, s.osnb_verse_from, s.section_no
       LIMIT ${Math.max(1, Math.min(100, limit * 2))}`,
      [language, ...words.map((w) => `%${w}%`)],
    )) as { work: string; title: string; author: string | null; book_id: number; osnb_chapter_from: number; osnb_verse_from: number; source_chapter: number; section_no: number; paragraphs: string }[];
    const hits: CommentarySearchHit[] = [];
    for (const r of rows) {
      const text = (parseJsonList(r.paragraphs) ?? []).map(plain).join(' ');
      const lower = text.toLowerCase();
      if (!words.every((w) => lower.includes(w))) continue;
      const at = lower.indexOf(words[0]!);
      const start = Math.max(0, at - 80);
      hits.push({
        work: r.work,
        workTitle: r.title,
        author: r.author,
        bookId: Number(r.book_id),
        chapter: r.osnb_chapter_from,
        verse: r.osnb_verse_from,
        sourceChapter: r.source_chapter,
        sectionNo: r.section_no,
        snippet: `${start > 0 ? '…' : ''}${text.slice(start, at + 160).trim()}${at + 160 < text.length ? '…' : ''}`,
      });
      if (hits.length >= limit) break;
    }
    if (hits.length > 0) return hits;
  }
  return [];
}

/** Bøkene et verk har en gjengivelse av på et språk (oversiktssidene, MCP-en). */
export async function commentaryBooks(language: string): Promise<{ work: string; books: number[] }[]> {
  const rows = (await getSql()`
    SELECT work, book_id FROM commentary_sections WHERE language = ${language} GROUP BY work, book_id ORDER BY work, book_id
  `) as { work: string; book_id: number }[];
  const byWork = new Map<string, number[]>();
  for (const r of rows) byWork.set(r.work, [...(byWork.get(r.work) ?? []), Number(r.book_id)]);
  return [...byWork].map(([work, books]) => ({ work, books }));
}
