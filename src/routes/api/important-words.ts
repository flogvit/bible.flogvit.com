import { Hono } from 'hono';
import { getImportantWords } from '../../lib/bible.ts';
import { intParam, NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/** GET /api/important-words?bookId=1&chapter=1 */
r.get('/', async (c) => {
  try {
    const bookId = intParam(c, 'bookId');
    const chapter = intParam(c, 'chapter');

    if (isNaN(bookId) || isNaN(chapter)) {
      return c.json({ error: 'Missing or invalid bookId/chapter parameters' }, 400);
    }
    return c.json(await getImportantWords(bookId, chapter), 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching important words', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
