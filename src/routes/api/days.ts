import { Hono } from 'hono';
import { getAllDays, getDayById, getTodaysDays } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/days — alle dager. */
r.get('/', async (c) => {
  try {
    const days = await getAllDays();
    return c.json({ days }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching days:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/days/today — dager som matcher dagens dato. */
r.get('/today', async (c) => {
  try {
    return c.json(await getTodaysDays(), 200, NO_CACHE);
  } catch (error) {
    console.error("Error fetching today's days:", error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/days/:id — én dag. */
r.get('/:id', async (c) => {
  try {
    const day = await getDayById(c.req.param('id'));
    if (!day) return c.json({ error: 'Day not found' }, 404);
    return c.json(day, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching day:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
