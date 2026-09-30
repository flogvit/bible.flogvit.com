import { Hono } from 'hono';
import { getFavoriteVerses } from '../../lib/bible.ts';
import { bookNameByShort } from '../../lib/books-data.ts';
import { internFeil } from './util.ts';

const r = new Hono();

interface FavoriteInput {
  bookId: number;
  chapter: number;
  verse: number;
}

/** POST /api/favorites — verstekster for favoritter. */
r.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const { favorites } = (body ?? {}) as { favorites?: FavoriteInput[] };

    if (!favorites || !Array.isArray(favorites) || favorites.length === 0) {
      return c.json([]);
    }

    const results = (await getFavoriteVerses(favorites)).map((v) => ({
      bookId: v.bookId,
      chapter: v.chapter,
      verse: v.verse,
      bookName: bookNameByShort(v.bookShortName),
      bookShortName: v.bookShortName,
      text: v.text,
    }));

    return c.json(results);
  } catch (error) {
    return internFeil(c, 'Failed to get favorite verses', error, { error: 'Failed to get verses' });
  }
});

export default r;
