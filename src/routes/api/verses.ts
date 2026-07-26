import { Hono } from 'hono';
import { getVersesWithOriginal, normalizeBibleId, type VerseRef } from '../../lib/bible.ts';
import { parseStandardRef, refSegmentsToVerseRefs } from '../../lib/standard-ref-parser.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/verses?ref=Joh+3,16-19&bible=osnb — norsk standardreferanse → vers. */
r.get('/', async (c) => {
  const ref = c.req.query('ref');
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';

  if (!ref) return c.json({ error: 'Missing ref parameter' }, 400);

  try {
    const segments = parseStandardRef(ref);
    if (segments.length === 0) return c.json({ error: 'Invalid reference' }, 400);

    const verseRefs = refSegmentsToVerseRefs(segments);
    const verses = await getVersesWithOriginal(verseRefs as VerseRef[], bible);
    return c.json(verses, 200, { 'Cache-Control': 'public, max-age=86400' });
  } catch (error) {
    console.error('Error fetching verses:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /api/verses — body: { refs: VerseRef[], bible? } */
r.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const { refs, bible: rawBible = 'osnb' } = (body ?? {}) as { refs?: VerseRef[]; bible?: string };
  const bible = normalizeBibleId(rawBible);

  if (!refs || !Array.isArray(refs)) return c.json({ error: 'Missing refs array' }, 400);

  try {
    const verses = await getVersesWithOriginal(refs, bible);
    return c.json(verses, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching verses:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
