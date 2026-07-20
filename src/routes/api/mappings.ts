import { Hono } from 'hono';
import { getAllVerseMappings, getVerseMappingById } from '../../lib/bible.ts';
import { getAvailableMappings, getKvnMappingData, getKvnMappingRaw } from '../../lib/verse-mapper.ts';
import type { UkvnMappingFile } from '@free-bible/kvn';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/mappings — tilgjengelige versmappinger (id, name, description). */
r.get('/', async (c) => {
  try {
    const mappings = await getAllVerseMappings();
    return c.json({ mappings }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching mappings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/mappings/kvn/all — alle KVN-mappingfiler i én respons, keyed på id. */
r.get('/kvn/all', (c) => {
  try {
    const ids = getAvailableMappings();
    const all: Record<string, UkvnMappingFile> = {};
    for (const m of ids) {
      all[m.id] = getKvnMappingRaw(m.id);
    }
    return c.json(all, 200, { 'Cache-Control': 'public, max-age=86400' });
  } catch (error) {
    console.error('Error fetching all KVN mappings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/mappings/kvn — tilgjengelige KVN-mappings. */
r.get('/kvn', (c) => {
  try {
    return c.json({ mappings: getAvailableMappings() }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching KVN mappings:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/mappings/kvn/:id — KVN-mapping som bookNames + verseMap. */
r.get('/kvn/:id', (c) => {
  try {
    const data = getKvnMappingData(c.req.param('id'));
    if (!data) return c.json({ error: 'KVN mapping not found' }, 404);
    return c.json(data, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching KVN mapping data:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/mappings/:id — én mapping med full verseMap og bookNames. */
r.get('/:id', async (c) => {
  try {
    const mapping = await getVerseMappingById(c.req.param('id'));
    if (!mapping) return c.json({ error: 'Mapping not found' }, 404);
    return c.json(
      {
        id: mapping.id,
        name: mapping.name,
        description: mapping.description,
        bookNames: JSON.parse(mapping.book_names),
        verseMap: JSON.parse(mapping.verse_map),
        unmapped: mapping.unmapped ? JSON.parse(mapping.unmapped) : [],
      },
      200,
      NO_CACHE,
    );
  } catch (error) {
    console.error('Error fetching mapping:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
