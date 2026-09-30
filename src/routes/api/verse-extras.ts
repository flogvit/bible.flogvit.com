import { Hono } from 'hono';
import { getVersePrayer, getVerseSermon } from '../../lib/bible.ts';
import { verseQuery } from './util.ts';

const r = new Hono();

/** GET /api/verse-extras?bookId=&chapter=&verse= */
r.get('/', async (c) => {
  const v = verseQuery(c);
  if (!v) return c.json({ error: 'Missing parameters' }, 400);

  const prayer = await getVersePrayer(v.bookId, v.chapter, v.verse);
  const sermon = await getVerseSermon(v.bookId, v.chapter, v.verse);
  return c.json({ prayer, sermon });
});

export default r;
