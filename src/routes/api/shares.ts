// Delingslenker for manuskripter (#15, del 1) — eierens side av flaten.
//
// Alt her krever innlogging OG plus: å dele forutsetter at manuskriptet er
// lagret i skyen, og lagring er husking (plus). Å LESE en delt lenke er gratis
// og skjer på /delt/<token>, uten sesjon — se routes/pages/shared.tsx.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { requirePlus } from '../../lib/session.ts';
import { createShare, listShares, regenerateShare, revokeShare } from '../../lib/shares.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono<AppEnv>();

r.use('*', requirePlus);

/** GET /api/shares — brukerens egne delingslenker. */
r.get('/', async (c) => {
  const shares = await listShares(c.var.user!.id);
  return c.json({ shares }, 200, NO_CACHE);
});

/**
 * POST /api/shares — {itemId} → lenken for manuskriptet.
 *
 * Idempotent: finnes en lenke, kommer den samme tilbake. `regenerate: true` gir
 * et nytt token og gjør det gamle ugyldig.
 */
r.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { itemId?: string; regenerate?: boolean } | null;
  const itemId = body?.itemId?.trim();
  if (!itemId) return c.json({ error: 'itemId_required' }, 400);

  const share = body?.regenerate
    ? await regenerateShare(c.var.user!.id, itemId)
    : await createShare(c.var.user!.id, itemId);
  // Ikke funnet ELLER ikke brukerens: samme svar. Et eget «finnes, men ikke
  // din» ville vært et oppslagsverktøy for andres manuskript-id-er.
  if (!share) return c.json({ error: 'not_found' }, 404);
  return c.json({ share }, 200, NO_CACHE);
});

/** DELETE /api/shares/:itemId — trekker tilbake lenken. */
r.delete('/:itemId', async (c) => {
  const revoked = await revokeShare(c.var.user!.id, c.req.param('itemId'));
  return c.json({ revoked }, 200, NO_CACHE);
});

export default r;
