// Lesekartet (GitHub #16): utleder statistikk og varmekart av hendelsesloggen
// i `readingProgress`. Rene funksjoner — sidene henter dataene med
// getReadingProgress() og mater dem hit.
//
// Merk skillet mellom «lest noen gang» og «lest nylig»: et kapittel markert
// uten tidspunkt (bulk-markert historikk, `lastAt: null`) teller i kartet, men
// kan ikke plasseres på en tidslinje. Derfor telles de for seg som
// `undatedChapters` framfor å gjettes inn i ferskhets-visningen.

import { booksData, getBookInfoById, bookName, bookNameById } from './books-data.ts';
import type { ChapterProgress } from './user-data.ts';
// @ts-expect-error — delt klient-modul uten typer
import { heatLevel, HEAT_LEVELS as SHARED_HEAT_LEVELS } from '../../public/js/reading-progress.js';

/** Antall intensitetsnivåer i varmekartet (1 = lest én gang, HEAT_LEVELS = ofte). */
export const HEAT_LEVELS: number = SHARED_HEAT_LEVELS;

export const TOTAL_CHAPTERS = booksData.reduce((sum, b) => sum + b.chapters, 0);

export interface ProgressSummary {
  chaptersRead: number;
  otRead: number;
  ntRead: number;
  totalChapters: number;
  percent: number;
  lastReadAt: number | null;
  undatedChapters: number;
  totalReads: number;
}

const isRead = (p: ChapterProgress) => (p.count ?? 0) > 0;

export function summarizeProgress(progress: ChapterProgress[]): ProgressSummary {
  // Flere oppføringer for samme kapittel skal telle som ETT lest kapittel.
  const readChapters = new Set<string>();
  let otRead = 0;
  let ntRead = 0;
  let lastReadAt: number | null = null;
  let undatedChapters = 0;
  let totalReads = 0;

  for (const p of progress) {
    if (!isRead(p)) continue;
    const key = `${p.bookId}-${p.chapter}`;
    if (readChapters.has(key)) continue;
    readChapters.add(key);
    totalReads += p.count ?? 0;

    const book = getBookInfoById(p.bookId);
    if (book?.testament === 'NT') ntRead++;
    else if (book) otRead++;

    if (p.lastAt == null) undatedChapters++;
    else if (lastReadAt == null || p.lastAt > lastReadAt) lastReadAt = p.lastAt;
  }

  const chaptersRead = readChapters.size;
  return {
    chaptersRead,
    otRead,
    ntRead,
    totalChapters: TOTAL_CHAPTERS,
    percent: TOTAL_CHAPTERS ? (chaptersRead * 100) / TOTAL_CHAPTERS : 0,
    lastReadAt,
    undatedChapters,
    totalReads,
  };
}

export interface BookHeat {
  bookId: number;
  name: string;
  testament: 'OT' | 'NT';
  /** Én verdi per kapittel: 0 = ulest, 0.5 = delvis, 1..HEAT_LEVELS = lest. */
  chapters: number[];
}

/**
 * Intensitet per kapittel for én bok. Gjenlesing gir varmere farge, så kartet
 * viser HVOR i Bibelen man faktisk oppholder seg — ikke bare hva som er krysset av.
 */
export function bookHeat(progress: ChapterProgress[], bookId: number): BookHeat | null {
  const book = getBookInfoById(bookId);
  if (!book) return null;

  const chapters = new Array<number>(book.chapters).fill(0);
  for (const p of progress) {
    if (p.bookId !== bookId) continue;
    const idx = p.chapter - 1;
    if (idx < 0 || idx >= chapters.length) continue;

    chapters[idx] = Math.max(chapters[idx]!, heatLevel(p) as number);
  }
  return { bookId, name: bookName(book), testament: book.testament, chapters };
}

/** Varmekart for hele Bibelen, i kanonisk rekkefølge. */
export function fullHeat(progress: ChapterProgress[]): BookHeat[] {
  return booksData.map((b) => bookHeat(progress, b.id)!).filter(Boolean);
}

/**
 * En leseplan sett som DEKNING framfor rute (#16): hvor mye av kapittelsettet
 * ligger allerede i kartet?
 *
 * Formen tas inn strukturelt (ikke importert fra `bible.ts`) så modulen forblir
 * ren og testbar uten database.
 */
export interface PlanChapters {
  id: string;
  name: string;
  chapters: { bookId: number; chapter: number }[];
}

export interface PlanCoverage extends PlanChapters {
  total: number;
  read: number;
  missing: number;
}

/** Kapitler som er lest minst én gang, som `bookId-chapter`. */
function readKeys(progress: ChapterProgress[]): Set<string> {
  const keys = new Set<string>();
  for (const p of progress) if (isRead(p)) keys.add(`${p.bookId}-${p.chapter}`);
  return keys;
}

export function planCoverage(progress: ChapterProgress[], plans: PlanChapters[]): PlanCoverage[] {
  const read = readKeys(progress);
  return plans.map((plan) => {
    const hits = plan.chapters.filter((c) => read.has(`${c.bookId}-${c.chapter}`)).length;
    return { ...plan, total: plan.chapters.length, read: hits, missing: plan.chapters.length - hits };
  });
}

/**
 * «Paulus-brevene — du mangler 3»: planer som er PÅBEGYNT men ikke fullført,
 * nærmest først.
 *
 * Upåbegynte planer holdes utenfor med vilje. De ville fylt lista med hele
 * bibelen-planer for en bruker som ikke har lest noe, og forslaget er ment å si
 * «du er nesten i mål», ikke «her er katalogen» — den står på /leseplan.
 */
export function suggestedPlans(
  progress: ChapterProgress[],
  plans: PlanChapters[],
  limit = 5,
): PlanCoverage[] {
  return planCoverage(progress, plans)
    .filter((p) => p.total > 0 && p.read > 0 && p.missing > 0)
    .sort((a, b) => a.missing - b.missing || a.total - b.total || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Kapitler du ikke har vært innom på lengst tid — kun daterte. */
export function stalestBooks(progress: ChapterProgress[], limit = 5): { name: string; lastAt: number }[] {
  const newestPerBook = new Map<number, number>();
  for (const p of progress) {
    if (!isRead(p) || p.lastAt == null) continue;
    const cur = newestPerBook.get(p.bookId);
    if (cur == null || p.lastAt > cur) newestPerBook.set(p.bookId, p.lastAt);
  }
  return [...newestPerBook.entries()]
    .map(([bookId, lastAt]) => ({ name: bookNameById(bookId) || String(bookId), lastAt }))
    .sort((a, b) => a.lastAt - b.lastAt)
    .slice(0, limit);
}
