import { Hono } from 'hono';
import { getReferences } from '../../lib/bible.ts';
import { verseQuery } from './util.ts';

const r = new Hono();

/** GET /api/references?bookId=&chapter=&verse=&lang= */
r.get('/', async (c) => {
  const v = verseQuery(c);
  const lang = c.req.query('lang') || 'nb';

  if (!v) return c.json({ error: 'Missing parameters' }, 400);
  return c.json(await getReferences(v.bookId, v.chapter, v.verse, lang));
});

export default r;
