// Åpen katalog for manuskripter (#15, del 2) — forfatterens og reviewerens side.
//
// Tre adskilte flater i én fil, med hver sin port:
//
//   - Forfatteren (`requirePlus`): melde inn, se status, trekke tilbake.
//     Publisering forutsetter at manuskriptet er lagret i skyen, altså plus.
//   - Leseren (åpen): rapportere en oppføring. Ingen konto — den som ser noe
//     galt er som regel ikke innlogget, og et krav om konto ville gjort
//     rapportering til noe bare våre egne kunne gjøre.
//   - Reviewen (`x-review-token`): køen og avgjørelsen, transporten for
//     scripts/publications-review.ts. Samme mønster som contrib: uten
//     REVIEW_TOKEN i env FINNES ikke endepunktene (404), så en
//     feilkonfigurert prod lekker ingenting.

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { requirePlus } from '../../lib/session.ts';
import {
  decidePublication,
  getPublicationForReview,
  listOwnPublications,
  listPendingPublications,
  listReportedPublications,
  reportPublication,
  submitPublication,
  withdrawPublication,
} from '../../lib/publications.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono<AppEnv>();

// Rate-limit i minnet, samme mønster som contrib/sync. Publisering er sjeldent;
// dette stopper løpske klienter, ikke bruk.
function limiter(max: number, windowMs = 60_000) {
  const seen = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const entry = seen.get(key);
    if (!entry || now > entry.resetAt) {
      seen.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  };
}

// 30/min: en forfatter som retter og publiserer på nytt et par ganger skal ALDRI
// treffe taket — det er løpske klienter det stopper, ikke redigering.
const submitLimit = limiter(30);
// Rapportering er anonym, så nøkkelen er IP-en Caddy setter. Taket er lavt:
// tallet er et signal til en reviewer, og en enkelt kilde skal ikke kunne
// blåse det opp.
const reportLimit = limiter(5);

const clientKey = (c: Context<AppEnv>): string =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'ukjent';

async function requireReviewToken(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const token = process.env.REVIEW_TOKEN;
  if (!token) return c.json({ error: 'Not found' }, 404);
  if (c.req.header('x-review-token') !== token) return c.json({ error: 'forbidden' }, 403);
  await next();
}

// ── Leseren: rapportér ───────────────────────────────────────────────────
//
// Står FØRST fordi den er åpen: `requirePlus` under gjelder resten.
r.post('/report/:slug', async (c) => {
  if (!reportLimit(clientKey(c))) return c.json({ error: 'Too many requests' }, 429);
  await reportPublication(c.req.param('slug'));
  // Samme svar for ukjent og kjent slug: knappen skal ikke kunne brukes til å
  // kartlegge hva som finnes i katalogen.
  return c.json({ reported: true }, 200, NO_CACHE);
});

// ── Reviewen: kø og avgjørelse ───────────────────────────────────────────

// Begge køene er PAGINERT, og svaret bærer `total` (#81). Uten det kunne
// CLI-en bare skrive antallet den fikk — «Til vurdering (50)» — og en
// innsending bak sideskillet var usynlig for den eneste som kan slippe den ut.
r.get('/pending', requireReviewToken, async (c) => {
  const page = Number(c.req.query('side') ?? '1');
  const [pending, reported] = await Promise.all([listPendingPublications(page), listReportedPublications(page)]);
  return c.json({ pending, reported }, 200, NO_CACHE);
});

/**
 * GET /api/publications/review/:slug — én oppføring, uansett hvor i køen den
 * står. Det er dette som gjør at ingenting blir uavgjørbart bak et sideskille.
 */
r.get('/review/:slug', requireReviewToken, async (c) => {
  const publication = await getPublicationForReview(c.req.param('slug') ?? '');
  if (!publication) return c.json({ error: 'not_found' }, 404, NO_CACHE);
  return c.json({ publication }, 200, NO_CACHE);
});

r.post('/decide', requireReviewToken, async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { slug?: string; status?: string; note?: string }
    | null;
  const slug = body?.slug?.trim();
  const status = body?.status;
  if (!slug) return c.json({ error: 'slug_required' }, 400);
  if (status !== 'approved' && status !== 'rejected') return c.json({ error: 'bad_status' }, 400);
  const ok = await decidePublication(slug, status, body?.note?.trim() || null);
  return c.json({ decided: ok }, ok ? 200 : 404, NO_CACHE);
});

// ── Forfatteren ──────────────────────────────────────────────────────────

r.use('*', requirePlus);

/** GET /api/publications — forfatterens egne oppføringer, uansett status. */
r.get('/', async (c) => {
  const publications = await listOwnPublications(c.var.user!.id);
  return c.json({ publications }, 200, NO_CACHE);
});

/**
 * POST /api/publications — {itemId} → oppføringen, med status `pending`.
 *
 * Ny innsending av noe som alt er godkjent går tilbake til `pending` med den
 * nye teksten. Det er med vilje: reviewen godkjente en TEKST.
 */
r.post('/', async (c) => {
  const user = c.var.user!;
  if (!submitLimit(String(user.id))) return c.json({ error: 'Too many requests' }, 429);
  const body = (await c.req.json().catch(() => null)) as { itemId?: string } | null;
  const itemId = body?.itemId?.trim();
  if (!itemId) return c.json({ error: 'itemId_required' }, 400);

  const publication = await submitPublication(user.id, itemId, user.displayName ?? null);
  // Ikke funnet, ikke brukerens, eller tomt manuskript: samme svar.
  if (!publication) return c.json({ error: 'not_found' }, 404);
  return c.json({ publication }, 200, NO_CACHE);
});

/** DELETE /api/publications/:itemId — forfatteren trekker oppføringen. */
r.delete('/:itemId', async (c) => {
  const withdrawn = await withdrawPublication(c.var.user!.id, c.req.param('itemId'));
  return c.json({ withdrawn }, 200, NO_CACHE);
});

export default r;
