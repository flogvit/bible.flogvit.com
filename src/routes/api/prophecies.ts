import { Hono } from 'hono';
import { getProphecies, getPropheciesForVerse, getProphecyCategories } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/** GET /api/prophecies — kategorier + profetier; ?book&chapter&verse filtrerer til verset. */
r.get('/', async (c) => {
  try {
    const { book, chapter, verse } = c.req.query();

    if (book && chapter && verse) {
      const prophecies = await getPropheciesForVerse(Number(book), Number(chapter), Number(verse));
      return c.json({ prophecies }, 200, NO_CACHE);
    }

    const categories = await getProphecyCategories();
    const prophecies = await getProphecies();
    return c.json({ categories, prophecies }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching prophecies', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
