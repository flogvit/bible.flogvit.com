import { Hono } from 'hono';
import { getSql } from '../../lib/db.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/reading-plans — alle leseplaner (uten readings-data). */
r.get('/', async (c) => {
  try {
    const plans = await getSql()`
      SELECT id, name, description, category, days FROM reading_plans ORDER BY days, seq
    `;
    return c.json(plans, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching reading plans:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/reading-plans/:id — full plan med readings. */
r.get('/:id', async (c) => {
  try {
    const [plan] = (await getSql()`
      SELECT id, name, description, category, days, content
      FROM reading_plans WHERE id = ${c.req.param('id')}
    `) as { content: string }[];
    if (!plan) return c.json({ error: 'Reading plan not found' }, 404);
    return c.json(JSON.parse(plan.content), 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching reading plan:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
