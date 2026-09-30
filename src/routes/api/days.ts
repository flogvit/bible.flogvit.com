import { Hono } from 'hono';
import { getAllDays, getDayById, getTodaysDays } from '../../lib/bible.ts';
import { NO_CACHE, internFeil } from './util.ts';

const r = new Hono();

/** GET /api/days — alle dager. */
r.get('/', async (c) => {
  try {
    const days = await getAllDays();
    return c.json({ days }, 200, NO_CACHE);
  } catch (error) {
    return internFeil(c, 'Error fetching days', error);
  }
});

/** GET /api/days/today — dager som matcher dagens dato. */
r.get('/today', async (c) => {
  try {
    return c.json(await getTodaysDays(), 200, NO_CACHE);
  } catch (error) {
    return internFeil(c, "Error fetching today's days", error);
  }
});

/** GET /api/days/:id — én dag. */
r.get('/:id', async (c) => {
  try {
    const day = await getDayById(c.req.param('id'));
    if (!day) return c.json({ error: 'Day not found' }, 404);
    return c.json(day, 200, NO_CACHE);
  } catch (error) {
    return internFeil(c, 'Error fetching day', error);
  }
});

export default r;
