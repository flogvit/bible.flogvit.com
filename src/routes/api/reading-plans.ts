import { Hono } from 'hono';
import { getAllReadingPlansList, getReadingPlanById } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/**
 * Leseplaner er språk-scopet innhold, men begge rutene her spurte rått uten
 * språkfilter: lista returnerte HVER plan én gang per språk (74 rader for 37
 * planer), og detaljruta plukket en tilfeldig rad — i praksis den norske, også
 * for en engelsk leser. Getterne i bible.ts filtrerer på locale fra
 * contextStorage (satt av /api/*-middlewaren, #24) og har fallback-kjeden.
 */

/** GET /api/reading-plans — alle leseplaner (uten readings-data). */
r.get('/', async (c) => {
  try {
    return c.json(await getAllReadingPlansList(), 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching reading plans', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/reading-plans/:id — full plan med readings. */
r.get('/:id', async (c) => {
  try {
    const plan = await getReadingPlanById(c.req.param('id'));
    if (!plan) return c.json({ error: 'Reading plan not found' }, 404);
    return c.json(plan, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching reading plan', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
