import { Hono } from 'hono';
import type { Context } from 'hono';
import { getSql } from '../../lib/db.ts';
import { normalizeBibleId } from '../../lib/bible.ts';
import { DEFAULT_CONTENT_LANGUAGE } from '../../lib/lang.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

interface DailyVerseRow {
  date: string;
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  note: string | null;
}

async function dailyVerseResponse(c: Context, date: string): Promise<Response> {
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
  const sql = getSql();

  const [dailyVerse] = (await sql`
    SELECT date, book_id, chapter, verse_start, verse_end, note
    FROM daily_verses WHERE date = ${date} AND language = ${DEFAULT_CONTENT_LANGUAGE}
  `) as DailyVerseRow[];
  if (!dailyVerse) return c.json({ error: 'No verse for this date' }, 404);

  const [book] = (await sql`
    SELECT id, name_no, short_name FROM books WHERE id = ${dailyVerse.book_id}
  `) as { id: number; name_no: string; short_name: string }[];
  if (!book) return c.json({ error: 'Book not found' }, 404);

  const verses = (await sql`
    SELECT verse, text FROM verses
    WHERE book_id = ${dailyVerse.book_id} AND chapter = ${dailyVerse.chapter}
      AND verse >= ${dailyVerse.verse_start} AND verse <= ${dailyVerse.verse_end}
      AND bible = ${bible}
    ORDER BY verse
  `) as { verse: number; text: string }[];

  const verseText = verses.map((v) => v.text).join(' ');
  const verseDisplay =
    dailyVerse.verse_start === dailyVerse.verse_end
      ? `${dailyVerse.verse_start}`
      : `${dailyVerse.verse_start}-${dailyVerse.verse_end}`;

  return c.json(
    {
      date,
      reference: {
        bookId: dailyVerse.book_id,
        bookName: book.name_no,
        shortName: book.short_name,
        chapter: dailyVerse.chapter,
        verseStart: dailyVerse.verse_start,
        verseEnd: dailyVerse.verse_end,
        display: `${book.name_no} ${dailyVerse.chapter}:${verseDisplay}`,
      },
      text: verseText,
      note: dailyVerse.note,
    },
    200,
    NO_CACHE,
  );
}

/** GET /api/daily-verse — dagens vers med full tekst. */
r.get('/', async (c) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0]!;
    const res = await dailyVerseResponse(c, dateStr);
    // Original svarte «No verse for today» på rot-ruta.
    if (res.status === 404) return c.json({ error: 'No verse for today' }, 404);
    return res;
  } catch (error) {
    console.error('Error fetching daily verse:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/daily-verse/:date — verset for en dato (YYYY-MM-DD). */
r.get('/:date', async (c) => {
  try {
    const date = c.req.param('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
    }
    return await dailyVerseResponse(c, date);
  } catch (error) {
    console.error('Error fetching daily verse:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
