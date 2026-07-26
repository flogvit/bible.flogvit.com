import { Hono } from 'hono';
import { getSql } from '../../lib/db.ts';

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

    const sql = getSql();
    const results = (
      await Promise.all(
        favorites.map(async (fav) => {
          const [verse] = (await sql`
            SELECT v.text, b.name_no AS book_name, b.short_name AS book_short_name
            FROM verses v
            JOIN books b ON v.book_id = b.id
            WHERE v.book_id = ${fav.bookId} AND v.chapter = ${fav.chapter}
              AND v.verse = ${fav.verse} AND v.bible = 'osnb'
          `) as { text: string; book_name: string; book_short_name: string }[];
          if (!verse) return null;
          return {
            bookId: fav.bookId,
            chapter: fav.chapter,
            verse: fav.verse,
            bookName: verse.book_name,
            bookShortName: verse.book_short_name,
            text: verse.text,
          };
        }),
      )
    ).filter(Boolean);

    return c.json(results);
  } catch (error) {
    console.error('Failed to get favorite verses:', error);
    return c.json({ error: 'Failed to get verses' }, 500);
  }
});

export default r;
