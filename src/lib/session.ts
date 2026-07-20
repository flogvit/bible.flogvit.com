// Sesjonsvalidering mot den sentrale FLOGVIT-kontotjenesten (konto) — samme
// mønster som puzzles/lab/photosuite. Bibel eier ingen brukere selv:
// fv-session-cookien settes av konto på .flogvit.com (kanonisk domene er nå
// bibel.flogvit.com), og hver request valideres her via kontoens session-API.
// I prod deler containerne docker-nettverk (http://konto:3020); lokalt kjører
// konto på localhost:3020. Alt er best-effort — feiler kallet, er man utlogget.

import type { Context, Next } from 'hono';

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

export type AppEnv = { Variables: { user: SessionUser | null } };

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

/** Løser konto-sesjonen inn på c.var.user for hver request (null = anonym). */
export async function withSession(c: Context<AppEnv>, next: Next): Promise<void> {
  c.set('user', await getCentralSession(c.req.header('cookie') ?? ''));
  await next();
}

/** 401 for API-ruter som krever innlogget bruker (sync m.m.). */
export async function requireUser(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  if (!c.var.user) return c.json({ error: 'unauthorized' }, 401);
  await next();
}
