import { Hono } from 'hono';
import { getAllBooks, getBookSummary } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/** GET /api/books — alle bøker med metadata + sammendrag. */
r.get('/', async (c) => {
  try {
    const books = getAllBooks();
    const booksWithSummaries = await Promise.all(
      books.map(async (book) => ({ ...book, summary: await getBookSummary(book.id) })),
    );
    return c.json({ books: booksWithSummaries }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching books', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
