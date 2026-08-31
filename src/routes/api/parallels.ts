import { Hono } from 'hono';
import {
  getGospelParallelById,
  getGospelParallels,
  getGospelParallelSections,
  getGospelParallelsForChapter,
  getVerses,
  normalizeBibleId,
} from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/** GET /api/parallels — seksjoner + evangelieparalleller. */
r.get('/', async (c) => {
  try {
    const sections = await getGospelParallelSections();
    const parallels = await getGospelParallels();
    return c.json({ sections, parallels }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching gospel parallels', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/parallels/chapter/:bookId/:chapter — paralleller for et kapittel. */
r.get('/chapter/:bookId/:chapter', async (c) => {
  const bookId = parseInt(c.req.param('bookId'), 10);
  const chapter = parseInt(c.req.param('chapter'), 10);
  if (isNaN(bookId) || isNaN(chapter)) {
    return c.json({ error: 'Invalid book ID or chapter' }, 400);
  }
  try {
    const parallels = await getGospelParallelsForChapter(bookId, chapter);
    return c.json({ parallels }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching chapter parallels', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/parallels/:id — én parallell. */
r.get('/:id', async (c) => {
  try {
    const parallel = await getGospelParallelById(c.req.param('id'));
    if (!parallel) return c.json({ error: 'Parallel not found' }, 404);
    return c.json(parallel, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching gospel parallel', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/parallels/:id/verses — versene for en parallell. Body: { bible? } */
r.post('/:id/verses', async (c) => {
  const body = await c.req.json().catch(() => null);
  const { bible: rawBible = 'osnb' } = (body ?? {}) as { bible?: string };
  const bible = normalizeBibleId(rawBible);

  try {
    const parallel = await getGospelParallelById(c.req.param('id'));
    if (!parallel) return c.json({ error: 'Parallel not found' }, 404);
    if (!parallel.passages) return c.json({ verses: {} });

    const verses: Record<string, Array<{ verse: number; text: string }>> = {};
    for (const [gospel, passage] of Object.entries(parallel.passages)) {
      const passageVerses = await getVerses(passage.book_id, passage.chapter, bible);
      verses[gospel] = passageVerses
        .filter((v) => v.verse >= passage.verse_start && v.verse <= passage.verse_end)
        .map((v) => ({ verse: v.verse, text: v.text }));
    }
    return c.json({ verses }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching parallel verses', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
