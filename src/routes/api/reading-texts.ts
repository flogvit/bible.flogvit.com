import { Hono } from 'hono';
import {
  getAllReadingTexts,
  getReadingTextById,
  getReadingTextsByDate,
  getTodaysReadingTexts,
  normalizeBibleId,
} from '../../lib/bible.ts';
import { enrichWithVerseText } from '../../lib/reading-text-enrich.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/reading-texts — alle lesetekster (lett liste, uten slots). */
r.get('/', async (c) => {
  try {
    const texts = await getAllReadingTexts();
    return c.json({ readingTexts: texts }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching reading texts:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/reading-texts/today */
r.get('/today', async (c) => {
  try {
    return c.json(await getTodaysReadingTexts(), 200, NO_CACHE);
  } catch (error) {
    console.error("Error fetching today's reading texts:", error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/reading-texts/:dato — lesetekstene for en dag, med verstekster.
 *
 * Datoen er den stabile nøkkelen (#40): reading_texts.id renummereres ved hver
 * innholdsimport, så en id i en URL har kort levetid.
 */
r.get('/:date{[0-9]{4}-[0-9]{2}-[0-9]{2}}', async (c) => {
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
  const mapping = normalizeBibleId(c.req.query('mapping')) || 'osnb';
  try {
    const texts = await getReadingTextsByDate(c.req.param('date'));
    if (texts.length === 0) return c.json({ error: 'Reading text not found' }, 404);
    const enriched = [];
    for (const text of texts) enriched.push(await enrichWithVerseText(text, bible, mapping));
    return c.json(enriched, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching reading text:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/reading-texts/:id — full lesetekst med verstekster (ustabil id). */
r.get('/:id{[0-9]+}', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
  const mapping = normalizeBibleId(c.req.query('mapping')) || 'osnb';
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const text = await getReadingTextById(id);
    if (!text) return c.json({ error: 'Reading text not found' }, 404);
    const enriched = await enrichWithVerseText(text, bible, mapping);
    return c.json(enriched, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching reading text:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
