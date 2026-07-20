import { Hono } from 'hono';
import { getVersePrayer, getVerseSermon } from '../../lib/bible.ts';
import { intParam } from './util.ts';

const r = new Hono();

/** GET /api/verse-extras?bookId=&chapter=&verse= */
r.get('/', async (c) => {
  const bookId = intParam(c, 'bookId');
  const chapter = intParam(c, 'chapter');
  const verse = intParam(c, 'verse');

  if (isNaN(bookId) || isNaN(chapter) || isNaN(verse)) {
    return c.json({ error: 'Missing parameters' }, 400);
  }
  const prayer = await getVersePrayer(bookId, chapter, verse);
  const sermon = await getVerseSermon(bookId, chapter, verse);
  return c.json({ prayer, sermon });
});

export default r;
