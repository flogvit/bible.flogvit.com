import { Hono } from 'hono';
import { getReferences } from '../../lib/bible.ts';
import { intParam } from './util.ts';

const r = new Hono();

/** GET /api/references?bookId=&chapter=&verse=&lang= */
r.get('/', async (c) => {
  const bookId = intParam(c, 'bookId');
  const chapter = intParam(c, 'chapter');
  const verse = intParam(c, 'verse');
  const lang = c.req.query('lang') || 'nb';

  if (isNaN(bookId) || isNaN(chapter) || isNaN(verse)) {
    return c.json({ error: 'Missing parameters' }, 400);
  }
  return c.json(await getReferences(bookId, chapter, verse, lang));
});

export default r;
