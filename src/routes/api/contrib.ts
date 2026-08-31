// Contrib-API: bruker-innsendte artikler/bøker med versreferanser.
//
// Brukerdelen krever innlogget konto (requireUser — IKKE plus: bidrag er en
// donasjon til fellesskapet og skal aldri bak betalingsmur). Admin-delen
// (/pending, /apply) er transporten for scripts/contrib-pull.ts og
// contrib-apply.ts og gates med CONTRIB_TOKEN fra env — uten env-variabelen
// finnes ikke endepunktene (404), så en feilkonfigurert prod lekker ingenting.

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { requireUser } from '../../lib/session.ts';
import {
  applyReviewedPayload,
  createSubmission,
  listPendingSubmissions,
  listSubmissionsForUser,
  respondToSubmission,
  validateContribInput,
} from '../../lib/contrib.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

// Rate-limit per bruker i minnet (samme mønster som sync.ts) — innsending er
// en sjelden handling, så 10/minutt stopper bare løpske klienter.
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

async function requireContribToken(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const token = process.env.CONTRIB_TOKEN;
  if (!token) return c.json({ error: 'Not found' }, 404);
  if (c.req.header('x-contrib-token') !== token) return c.json({ error: 'forbidden' }, 403);
  await next();
}

const contrib = new Hono<AppEnv>();

/** POST / — ny innsending fra innlogget bruker. */
contrib.post('/', requireUser, async (c) => {
  const user = c.var.user!;
  if (!checkRateLimit(user.id)) return c.json({ error: 'Too many requests' }, 429);
  const body = await c.req.json().catch(() => null);
  const result = validateContribInput(body);
  if (!result.ok) return c.json({ error: result.error }, 400);
  try {
    const id = await createSubmission(result.input, user);
    return c.json({ id, status: 'pending' }, 201);
  } catch (error) {
    loggFeil('Contrib create error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /mine — egne innsendinger med status, nyeste først. */
contrib.get('/mine', requireUser, async (c) => {
  try {
    const rows = await listSubmissionsForUser(c.var.user!.id);
    return c.json(
      {
        submissions: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          payload: r.payload,
          review_note: r.review_note,
          created_at: r.created_at,
          updated_at: r.updated_at,
        })),
      },
      200,
      NO_CACHE,
    );
  } catch (error) {
    loggFeil('Contrib list error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /:id/respond — svar fra bidragsyter når status er needs_info. */
contrib.post('/:id/respond', requireUser, async (c) => {
  const id = parseInt(c.req.param('id') ?? '', 10);
  if (!Number.isInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400);
  const body = await c.req.json().catch(() => null);
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
    return c.json({ error: 'Missing message' }, 400);
  }
  try {
    const ok = await respondToSubmission(id, c.var.user!.id, message);
    if (!ok) return c.json({ error: 'Not found' }, 404);
    return c.json({ id, status: 'pending' });
  } catch (error) {
    loggFeil('Contrib respond error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /pending — alle ventende innsendinger (for contrib-pull.ts). */
contrib.get('/pending', requireContribToken, async (c) => {
  try {
    const rows = await listPendingSubmissions();
    return c.json(
      { submissions: rows.map((r) => ({ id: r.id, status: r.status, payload: r.payload })) },
      200,
      NO_CACHE,
    );
  } catch (error) {
    loggFeil('Contrib pending error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** POST /apply — skriv reviewede payloads tilbake (for contrib-apply.ts). */
contrib.post('/apply', requireContribToken, async (c) => {
  const body = await c.req.json().catch(() => null);
  const updates = (body as { updates?: unknown } | null)?.updates;
  if (!Array.isArray(updates)) return c.json({ error: 'Missing updates array' }, 400);
  const failed: number[] = [];
  let applied = 0;
  try {
    for (const update of updates as { id?: unknown; payload?: unknown }[]) {
      const id = Number(update?.id);
      if (!Number.isInteger(id) || id < 1 || !(await applyReviewedPayload(id, update?.payload))) {
        failed.push(Number(update?.id) || 0);
        continue;
      }
      applied++;
    }
    return c.json({ applied, failed });
  } catch (error) {
    loggFeil('Contrib apply error', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default contrib;
