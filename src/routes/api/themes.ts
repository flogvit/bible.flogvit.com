import { Hono } from 'hono';
import { getAllThemes, getThemeByName } from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/themes — alle temaer. */
r.get('/', async (c) => {
  try {
    const themes = await getAllThemes();
    return c.json({ themes }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching themes:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/themes/:id — ett tema. */
r.get('/:id', async (c) => {
  try {
    const theme = await getThemeByName(c.req.param('id'));
    if (!theme) return c.json({ error: 'Theme not found' }, 404);
    return c.json(theme, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching theme:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
