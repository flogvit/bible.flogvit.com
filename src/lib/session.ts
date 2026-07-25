// Sesjonsvalidering mot den sentrale FLOGVIT-kontotjenesten (konto) — samme
// mønster som puzzles/lab/photosuite. Bibel eier ingen brukere selv:
// fv-session-cookien settes av konto på .flogvit.com (kanonisk domene er nå
// bible.flogvit.com), og hver request valideres her via kontoens session-API.
// I prod deler containerne docker-nettverk (http://konto:3020); lokalt kjører
// konto på localhost:3020. Alt er best-effort — feiler kallet, er man utlogget.

import type { Context, Next } from 'hono';
import type { Locale } from './i18n.ts';

// Leses ved kall-tid så tester kan peke på en mock-server.
function accountApiUrl(): string {
  return (
    process.env.ACCOUNT_API_URL ||
    (process.env.NODE_ENV === 'production' ? 'http://konto:3020' : 'http://localhost:3020')
  );
}

export const ACCOUNT_URL = process.env.ACCOUNT_URL || 'https://flogvit.com/konto/';

// Kort timeout: en treg kontotjeneste skal ikke holde sidevisninger som
// uansett fungerer utlogget.
const TIMEOUT_MS = 2500;

// Navnet på kontoens sesjonscookie — brukes bare til å slippe API-kallet for
// anonyme besøkende. Selve cookien leses av konto; vi videresender rått.
const SESSION_COOKIE = 'fv-session';

export interface SessionUser {
  id: number;
  email: string;
  displayName: string | null;
  verified: boolean;
  plus: boolean;
  plusUntil: string | null;
  csrf: string;
}

// `locale` settes av språkmonteringen i app.ts (I18N.md §2) og leses av
// layoutProps()/tFor() — UI-locale, ikke innholdsspråk eller bibelutgave.
export type AppEnv = { Variables: { user: SessionUser | null; locale: Locale } };

interface CentralSessionResponse {
  user?: {
    id: number;
    email: string;
    displayName: string | null;
    verified: boolean;
    plus: boolean;
    plusUntil: string | null;
  } | null;
  csrf?: string;
}

export async function getCentralSession(cookieHeader: string): Promise<SessionUser | null> {
  if (!cookieHeader || !cookieHeader.includes(`${SESSION_COOKIE}=`)) return null;
  try {
    const res = await fetch(`${accountApiUrl()}/api/auth/session`, {
      headers: { cookie: cookieHeader },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CentralSessionResponse | null;
    const u = data?.user;
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName ?? null,
      verified: !!u.verified,
      plus: !!u.plus,
      plusUntil: u.plusUntil ?? null,
      csrf: data?.csrf || '',
    };
  } catch {
    return null;
  }
}

// Ikke-HttpOnly markørcookie som speiler innloggings- og plus-status, slik at
// klient-øyer (sync.js) kan la være å kalle API-er som uansett gir 401/402.
// '1' = innlogget, '2' = innlogget med FLOGVIT.plus. Innholdet er verdiløst
// for en angriper; selve sesjonen ligger i fv-session, og all gating skjer
// server-side.
const AUTH_MARKER = 'fv-auth';

/** Løser konto-sesjonen inn på c.var.user for hver request (null = anonym). */
export async function withSession(c: Context<AppEnv>, next: Next): Promise<void> {
  const cookieHeader = c.req.header('cookie') ?? '';
  const user = await getCentralSession(cookieHeader);
  c.set('user', user);
  const current = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_MARKER}=([^;]+)`))?.[1] ?? null;
  const desired = user ? (user.plus ? '2' : '1') : null;
  if (desired && current !== desired) {
    c.header('Set-Cookie', `${AUTH_MARKER}=${desired}; Path=/; SameSite=Lax; Max-Age=2592000`);
  } else if (!desired && current) {
    c.header('Set-Cookie', `${AUTH_MARKER}=; Path=/; SameSite=Lax; Max-Age=0`);
  }
  await next();
}

/** 401 for API-ruter som krever innlogget bruker (sync m.m.). */
export async function requireUser(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  if (!c.var.user) return c.json({ error: 'unauthorized' }, 401);
  await next();
}

/**
 * 402 for API-ruter som krever FLOGVIT.plus — «husking» (skylagring/sync) er
 * en del av plus-abonnementet (Vegards beslutning 2026-07-22). Samme
 * responsform som kontos sync-API. Alt lokalt (localStorage/IndexedDB) er
 * gratis; kildekoden er åpen så selvhosting uten gating kan komme senere.
 */
export async function requirePlus(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  if (!c.var.user) return c.json({ error: 'unauthorized' }, 401);
  if (!c.var.user.plus) return c.json({ error: 'plus_required' }, 402);
  await next();
}
