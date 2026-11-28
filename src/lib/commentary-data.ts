// Bibelkommentarer fra basen (#269). Ren logikk (forankring, OSIS, rendrer,
// formingen leseren ser) står i `commentary.ts`; her er spørringene lesesiden,
// API-et og MCP-en deler.

import { getSql } from './db.ts';
import { contentLanguageChain, currentContentLanguage, localeToContentLanguage } from './lang.ts';
import { isLocale, isMessageKey, makeT } from './i18n.ts';
import { commentaryPlain, shapeCommentary, type CommentaryPart, type RawCommentarySection } from './commentary.ts';

// Spørringene står som faste tekster med `?`-parametre: ingen verdi settes
// sammen inn i SQL-en.
const SECTIONS_IN_CHAPTER_SQL = `
  SELECT source_chapter, section_no, osnb_chapter_from, osnb_verse_from, osnb_chapter_to, osnb_verse_to, paragraphs, models
  FROM commentary_sections
  WHERE work = ? AND book_id = ? AND language = ?
    AND osnb_chapter_from <= ? AND osnb_chapter_to >= ?
  ORDER BY osnb_chapter_from, osnb_verse_from, source_chapter, section_no`;
const SEARCH_SQL_HEAD = `
  SELECT s.work, w.title, w.author, s.book_id, s.osnb_chapter_from, s.osnb_verse_from,
         s.osnb_chapter_to, s.osnb_verse_to, s.source_chapter, s.section_no, s.paragraphs
  FROM commentary_sections s JOIN commentary_works w ON w.id = s.work
  WHERE s.language = ?`;
const SEARCH_SQL_TAIL = `
  ORDER BY s.book_id, s.osnb_chapter_from, s.osnb_verse_from, s.section_no
  LIMIT ?`;

export interface CommentaryWork {
  id: string;
  /** Tittelen på leserens språk (`cm.work.<id>`), ellers verkets egen. */
  title: string;
  /** Verkets egen tittel, fra meta.json. */
  sourceTitle: string;
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

/** En del leseren ser (#286): seksjon, kapittelinnledning eller bokas innledning. */
export type CommentarySectionView = CommentaryPart;

export interface CommentaryForChapter {
  work: CommentaryWork;
  /** Språket avsnittene står på. */
  language: string;
  /**
   * Leseren ba om et språk verket ikke er gjengitt på, så kilden vises. Siden
   * sier det, i stedet for å vise engelsk tekst uten forklaring.
   */
  sourceOnly: boolean;
  /** Bokas innledning (forordet i 1 Mos), aldri under en versrekke (#286). */
  bookIntro: CommentarySectionView | null;
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

const rawSection = (r: CommentaryRow): RawCommentarySection => ({
  sourceChapter: r.source_chapter,
  sectionNo: r.section_no,
  from: { chapter: r.osnb_chapter_from, verse: r.osnb_verse_from },
  to: { chapter: r.osnb_chapter_to, verse: r.osnb_verse_to },
  paragraphs: parseJsonList(r.paragraphs) ?? [],
  sourceParagraphs: null,
  models: parseJsonList(r.models),
});

/**
 * Verkets tittel på leserens språk (#286): `cm.work.<id>` i ordboka. Et verk
 * uten nøkkel viser sin egen tittel, så et nytt verk trenger ingen kode.
 */
export function commentaryWorkTitle(id: string, sourceTitle: string, lang: string): string {
  const key = `cm.work.${id}`;
  const locale = localeToContentLanguage(lang);
  return isMessageKey(key) ? makeT(isLocale(locale) ? locale : 'en')(key) : sourceTitle;
}

/** Verkene siden har, med tittel på leserens språk: én bryter hver i innstillingene (#286). */
export async function getCommentaryWorks(
  lang = currentContentLanguage(),
): Promise<{ id: string; title: string; sourceTitle: string; sourceLanguage: string }[]> {
  const rows = (await getSql()`SELECT id, title, source_language FROM commentary_works ORDER BY id`) as { id: string; title: string; source_language: string }[];
  return rows.map((r) => ({ id: r.id, title: commentaryWorkTitle(r.id, r.title, lang), sourceTitle: r.title, sourceLanguage: r.source_language }));
}

/**
 * Kommentarene til ett osnb-kapittel, verk for verk. En seksjon tas med når den
 * overlapper kapittelet; en seksjon som spenner over et kapittelskille (KJV 2
 * Mos 8:1–15 er osnb 7:26–8:11) står på begge.
 *
 * Språket følger `contentLanguageChain` som resten av innholdet, med kildens
 * språk sist: finnes ingen gjengivelse for kapittelet, vises kilden og
 * `sourceOnly` sier fra. En gjengivelse får kildens avsnitt med seg.
 *
 * Seksjonene er FORMET for leseren (#286, `shapeCommentary`): uten bibeltekst,
 * med bokas innledning skilt ut og kapittelets innledning som egen del.
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
    sql.unsafe(SECTIONS_IN_CHAPTER_SQL, [work, bookId, language, chapter, chapter]) as unknown as Promise<CommentaryRow[]>;

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
    const shaped = shapeCommentary(
      rows.map((r) => ({ ...rawSection(r), sourceParagraphs: source ? (source.get(`${r.source_chapter}:${r.section_no}`) ?? null) : null })),
    );
    result.push({
      work: {
        id: w.id,
        title: commentaryWorkTitle(w.id, w.title, lang),
        sourceTitle: w.title,
        author: w.author,
        written: w.written,
        license: w.license,
        url: w.url,
        sourceLanguage: w.source_language,
      },
      language,
      sourceOnly: language === w.source_language && requested !== w.source_language,
      bookIntro: shaped.bookIntro,
      sections: shaped.sections,
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
  /** Delen treffet står i (`CommentaryPart.id`): et treff i forordet åpner bokas innledning (#286). */
  part: string;
  /** Utdrag rundt treffet, uten markup. */
  snippet: string;
}

/**
 * Søk i kommentarteksten (#269), som søket i viktige ord: hvert ord må finnes,
 * språket følger kjeden (første språk med treff), og treffene sorteres i
 * bibelrekkefølge. Søket leser avsnittene som JSON-tekst; treffet sjekkes mot
 * den formede, rensede teksten, så et ord som bare står i en tagg eller i
 * bibelteksten seksjonen siterer ikke gir treff, og treffet lenker til delen
 * det står i (#286).
 */
export async function searchCommentary(query: string, lang = currentContentLanguage(), limit = 30): Promise<CommentarySearchHit[]> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const sql = getSql();
  // Ett fast `LIKE ?`-ledd per ord; ordene selv går som parametre.
  const searchSql =
    SEARCH_SQL_HEAD +
    words.map(() => ' AND LOWER(s.paragraphs) LIKE ?').join('') +
    SEARCH_SQL_TAIL;
  const rowLimit = Math.max(1, Math.min(100, limit * 2));
  for (const language of contentLanguageChain(lang)) {
    const rows = (await sql.unsafe(searchSql, [language, ...words.map((w) => `%${w}%`), rowLimit])) as unknown as (CommentaryRow & {
      work: string;
      title: string;
      author: string | null;
      book_id: number;
    })[];
    const hits: CommentarySearchHit[] = [];
    for (const r of rows) {
      const shaped = shapeCommentary([rawSection(r)]);
      const found = [shaped.bookIntro, ...shaped.sections]
        .filter((p): p is CommentaryPart => p !== null)
        .map((p) => ({ p, text: p.paragraphs.map(commentaryPlain).join(' ') }))
        .find(({ text }) => words.every((w) => text.toLowerCase().includes(w)));
      if (!found) continue;
      const { p, text } = found;
      const lower = text.toLowerCase();
      const at = lower.indexOf(words[0]!);
      const start = Math.max(0, at - 80);
      hits.push({
        work: r.work,
        workTitle: commentaryWorkTitle(r.work, r.title, language),
        author: r.author,
        bookId: Number(r.book_id),
        chapter: p.from.chapter,
        verse: p.from.verse,
        part: p.id,
        snippet: `${start > 0 ? '…' : ''}${text.slice(start, at + 160).trim()}${at + 160 < text.length ? '…' : ''}`,
      });
      if (hits.length >= limit) break;
    }
    if (hits.length > 0) return hits;
  }
  return [];
}
