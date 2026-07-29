import { Hono } from 'hono';
import { bookNameById } from '../../lib/books-data.ts';
import {
  getBookById,
  getBookSummary,
  getChapterContext,
  getChapterSummary,
  getTimelineEventsForChapter,
} from '../../lib/bible.ts';

const r = new Hono();

interface ChapterRequest {
  bookId: number;
  chapter: number;
}

/**
 * POST /api/chapter-context — batch: kapittelsammendrag, kontekst,
 * boksammendrag og tidslinjehendelser. Body: { chapters: [{bookId, chapter}] } (maks 20).
 */
r.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const { chapters } = (body ?? {}) as { chapters?: ChapterRequest[] };

  if (!Array.isArray(chapters) || chapters.length === 0) {
    return c.json({ error: 'Missing or empty chapters array' }, 400);
  }
  if (chapters.length > 20) {
    return c.json({ error: 'Maximum 20 chapters per request' }, 400);
  }

  try {
    // Boksammendrag caches per bok innen requesten.
    const bookSummaries = new Map<number, string | null>();
    const results = [];

    for (const ch of chapters) {
      const bookId = Number(ch.bookId);
      const chapter = Number(ch.chapter);

      if (isNaN(bookId) || isNaN(chapter) || bookId < 1 || bookId > 66 || chapter < 1) {
        results.push({ bookId, chapter, error: 'Invalid bookId or chapter' });
        continue;
      }

      const book = getBookById(bookId);
      const summary = await getChapterSummary(bookId, chapter);
      const context = await getChapterContext(bookId, chapter);

      if (!bookSummaries.has(bookId)) {
        bookSummaries.set(bookId, await getBookSummary(bookId));
      }

      const timelineEvents = (await getTimelineEventsForChapter(bookId, chapter)).map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        year_display: e.year_display,
        period_name: e.period?.name ?? null,
        period_color: e.period?.color ?? null,
      }));

      results.push({
        bookId,
        chapter,
        bookName: bookNameById(bookId) || null,
        bookShortName: book?.short_name ?? null,
        bookSummary: bookSummaries.get(bookId) ?? null,
        summary,
        context,
        timelineEvents,
      });
    }

    return c.json(results);
  } catch (error) {
    console.error('Error fetching chapter context:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
