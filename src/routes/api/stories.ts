import { Hono } from 'hono';
import {
  getAllStories,
  getStoriesByCategory,
  getStoryBySlug,
  searchStories,
} from '../../lib/bible.ts';
import { withApiId, withApiIds } from '../../lib/api-ids.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** Historien adresseres av slugen — rad-id-en er vår egen og renummereres (#61). */
const PATH = '/api/stories';

/** GET /api/stories — alle historier, ev. filtrert på ?category. */
r.get('/', async (c) => {
  try {
    const category = c.req.query('category');
    const stories = category ? await getStoriesByCategory(category) : await getAllStories();
    return c.json({ stories: withApiIds(PATH, stories) }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching stories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/stories/search?q=josef — søk i tittel, nøkkelord og beskrivelse. */
r.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query || query.length < 2) return c.json({ stories: [] });
  try {
    const stories = await searchStories(query);
    return c.json({ stories: withApiIds(PATH, stories) }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error searching stories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/stories/:slug — én historie. */
r.get('/:slug', async (c) => {
  try {
    const story = await getStoryBySlug(c.req.param('slug'));
    if (!story) return c.json({ error: 'Story not found' }, 404);
    return c.json(withApiId(PATH, story), 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching story:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
