import { Hono } from 'hono';
import {
  getChapterTimelineEventIds,
  getMultiTimeline,
  getTimelineEvents,
  getTimelinePeriods,
} from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/** GET /api/timeline — perioder + hendelser; ?bookId&chapter gir også kapittel-relevante id-er. */
r.get('/', async (c) => {
  try {
    const bookIdRaw = c.req.query('bookId');
    const chapterRaw = c.req.query('chapter');
    const bookId = bookIdRaw ? parseInt(bookIdRaw, 10) : undefined;
    const chapter = chapterRaw ? parseInt(chapterRaw, 10) : undefined;

    const periods = await getTimelinePeriods();
    const events = await getTimelineEvents();
    const chapterEventIds =
      bookId && chapter ? await getChapterTimelineEventIds(bookId, chapter) : undefined;

    return c.json({ periods, events, chapterEventIds }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching timeline', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/timeline/multi — alle tre tidslinjetypene (bible, world, books). */
r.get('/multi', async (c) => {
  try {
    return c.json(await getMultiTimeline(), 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching multi timeline', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
