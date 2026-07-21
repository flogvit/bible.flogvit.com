import { Router, Request, Response } from 'express';
import { getAllVerseMappings, getVerseMappingById } from '../../src/lib/bible';
import { getAvailableMappings, getKvnMappingData, getKvnMappingRaw } from '../lib/verse-mapper';

export const mappingsRouter = Router();

/**
 * GET /api/mappings
 * Returns list of available verse mappings (id, name, description)
 */
mappingsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const mappings = getAllVerseMappings();
    res.set('Cache-Control', 'no-cache');
    res.json({ mappings });
  } catch (error) {
    console.error('Error fetching mappings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/mappings/kvn/all
 * Returns all KVN mapping files bundled in one response for frontend use.
 * Keyed by mapping ID.
 */
mappingsRouter.get('/kvn/all', (_req: Request, res: Response) => {
  try {
    const ids = getAvailableMappings();
    const all: Record<string, any> = {};
    for (const m of ids) {
      all[m.id] = getKvnMappingRaw(m.id);
    }
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(all);
  } catch (error) {
    console.error('Error fetching all KVN mappings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/mappings/kvn
 * Returns list of available KVN verse mappings
 */
mappingsRouter.get('/kvn', (_req: Request, res: Response) => {
  try {
    const mappings = getAvailableMappings();
    res.set('Cache-Control', 'no-cache');
    res.json({ mappings });
  } catch (error) {
    console.error('Error fetching KVN mappings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/mappings/kvn/:id
 * Returns a KVN mapping as bookNames + verseMap for the bible text parser
 */
mappingsRouter.get('/kvn/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const data = getKvnMappingData(id);
    if (!data) {
      res.status(404).json({ error: 'KVN mapping not found' });
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.json(data);
  } catch (error) {
    console.error('Error fetching KVN mapping data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/mappings/:id
 * Returns a specific mapping with full verseMap and bookNames
 */
mappingsRouter.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const mapping = getVerseMappingById(id);

    if (!mapping) {
      res.status(404).json({ error: 'Mapping not found' });
      return;
    }

    res.set('Cache-Control', 'no-cache');
    res.json({
      id: mapping.id,
      name: mapping.name,
      description: mapping.description,
      bookNames: JSON.parse(mapping.book_names),
      verseMap: JSON.parse(mapping.verse_map),
      unmapped: mapping.unmapped ? JSON.parse(mapping.unmapped) : [],
    });
  } catch (error) {
    console.error('Error fetching mapping:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
