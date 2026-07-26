import { Hono } from 'hono';
import { getBibleStatistics, getTopOriginalWords, getTopWords, normalizeBibleId } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/statistics — overordnet bibelstatistikk. */
r.get('/', async (c) => {
  try {
    const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
    return c.json(await getBibleStatistics(bible), 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/statistics/top-words — hyppigste norske ord (?limit, ?all, ?bible). */
r.get('/top-words', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '', 10) || 100, 500);
    const includeStopWords = c.req.query('all') === 'true';
    const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
    const words = await getTopWords(bible, limit, includeStopWords);
    return c.json({ words }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching top words:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/statistics/top-words/hebrew — hyppigste hebraiske ord. */
r.get('/top-words/hebrew', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '', 10) || 100, 500);
    const words = await getTopOriginalWords('hebrew', limit);
    return c.json({ words, language: 'hebrew' }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching Hebrew top words:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/statistics/top-words/greek — hyppigste greske ord. */
r.get('/top-words/greek', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') ?? '', 10) || 100, 500);
    const words = await getTopOriginalWords('greek', limit);
    return c.json({ words, language: 'greek' }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching Greek top words:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
