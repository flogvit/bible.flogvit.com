import { Hono } from 'hono';
import { getAllWellKnownVerses } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/wellknown-verses — alle kjente bibelvers. */
r.get('/', async (c) => {
  try {
    return c.json(await getAllWellKnownVerses(), 200, NO_CACHE);
  } catch (error) {
    console.error('Failed to get well-known verses:', error);
    return c.json({ error: 'Failed to get well-known verses' }, 500);
  }
});

export default r;
