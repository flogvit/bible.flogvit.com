import { Hono } from 'hono';
import { getOriginalWord4Word, getWord4Word } from '../../lib/bible.ts';
import { intParam } from './util.ts';

const r = new Hono();

// Bibel-kode → språkkode.
function getBibleLanguage(bible: string): string {
  if (bible.includes('nn') || bible === 'osnn1') return 'nn';
  return 'nb';
}

/** GET /api/word4word?bookId=&chapter=&verse=&bible=&lang= */
r.get('/', async (c) => {
  const bookId = intParam(c, 'bookId');
  const chapter = intParam(c, 'chapter');
  const verse = intParam(c, 'verse');
  const bible = c.req.query('bible') || 'osnb2';
  const langParam = c.req.query('lang');

  if (isNaN(bookId) || isNaN(chapter) || isNaN(verse)) {
    return c.json({ error: 'Missing parameters' }, 400);
  }

  // bible='original' → grunntekst (tanach/sblgnt) med språk fra lang-param
  // eller bibelen som leses.
  const lang = langParam || getBibleLanguage(bible);
  const data =
    bible === 'original'
      ? await getOriginalWord4Word(bookId, chapter, verse, lang)
      : await getWord4Word(bookId, chapter, verse, bible);
  return c.json(data);
});

export default r;
