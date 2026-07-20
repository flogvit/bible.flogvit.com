import { Hono } from 'hono';
import { getAllNumberSymbolism, getNumberSymbolismByNumber } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/number-symbolism — alle tallsymbolikk-oppføringer. */
r.get('/', async (c) => {
  try {
    const symbolisms = await getAllNumberSymbolism();
    return c.json({ symbolisms }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching number symbolism:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/number-symbolism/:number — én oppføring. */
r.get('/:number', async (c) => {
  const num = parseInt(c.req.param('number'), 10);
  if (isNaN(num)) return c.json({ error: 'Invalid number' }, 400);
  try {
    const symbolism = await getNumberSymbolismByNumber(num);
    if (!symbolism) return c.json({ error: 'Number symbolism not found' }, 404);
    return c.json(symbolism, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching number symbolism:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
