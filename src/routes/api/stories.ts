import { Hono } from 'hono';
import {
  getAllStories,
  getStoriesByCategory,
  getStoryBySlug,
  searchStories,
} from '../../lib/bible.ts';
import { resolveId } from '../../lib/canonical-id.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/stories — alle historier, ev. filtrert på ?category. */
r.get('/', async (c) => {
  try {
    const category = c.req.query('category');
    const stories = category ? await getStoriesByCategory(category) : await getAllStories();
    return c.json({ stories }, 200, NO_CACHE);
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
    return c.json({ stories }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error searching stories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/stories/:slug — én historie. */
r.get('/:slug', async (c) => {
  try {
    // Skrivemåten kollasjonen godtok er ikke adressen — raden bærer den (#49).
    // Sida 301-er, og API-et gjør det samme: samme adresse, samme app, ett svar.
    const resolved = await resolveId(c.req.param('slug'), {
      lookup: (slug) => getStoryBySlug(slug),
      idOf: (row) => row.slug,
    });
    if (resolved.kind === 'redirect') {
      const query = new URL(c.req.url).search;
      return c.redirect(`/api/stories/${resolved.to}${query}`, 301);
    }
    if (resolved.kind === 'missing') return c.json({ error: 'Story not found' }, 404);
    return c.json(resolved.row, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching story:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
