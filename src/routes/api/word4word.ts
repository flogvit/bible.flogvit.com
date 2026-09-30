import { Hono } from 'hono';
import { getOriginalWord4Word, getWord4Word, normalizeBibleId } from '../../lib/bible.ts';
import { verseQuery } from './util.ts';

const r = new Hono();

// Bibel-kode → språkkode.
function getBibleLanguage(bible: string): string {
  if (bible.includes('nn')) return 'nn';
  return 'nb';
}

/** GET /api/word4word?bookId=&chapter=&verse=&bible=&lang= */
r.get('/', async (c) => {
  const v = verseQuery(c);
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
  const langParam = c.req.query('lang');

  if (!v) return c.json({ error: 'Missing parameters' }, 400);

  // bible='original' → grunntekst (tanach/sblgnt) med språk fra lang-param
  // eller bibelen som leses.
  const lang = langParam || getBibleLanguage(bible);
  const data =
    bible === 'original'
      ? await getOriginalWord4Word(v.bookId, v.chapter, v.verse, lang)
      : await getWord4Word(v.bookId, v.chapter, v.verse, bible);
  return c.json(data);
});

export default r;
