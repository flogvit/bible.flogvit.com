/**
 * En stand-in for kontotjenestens `/api/auth/session`, for testene som trenger
 * en innlogget leser. `session.ts` spør kontoen om hvem `fv-session`-cookien
 * tilhører; her avgjøres svaret av cookie-VERDIEN, så en test velger bruker ved
 * å sende den verdien den vil ha.
 *
 * Seks testfiler hadde hver sin kopi av denne serveren. Starter den, peker
 * `ACCOUNT_API_URL` dit — `session.ts` leser variabelen per kall, så den må
 * settes før første forespørsel, ikke før import.
 */

export interface MockKontoUser {
  id: number;
  plus: boolean;
  email?: string;
  displayName?: string;
  plusUntil?: string | null;
}

/** Kontoens svar for en innlogget bruker. */
export function kontoUser(user: MockKontoUser, csrf = 'csrf'): Response {
  return Response.json({
    user: {
      id: user.id,
      email: user.email ?? `test-${user.id}@flogvit.com`,
      displayName: user.displayName ?? 'Test',
      verified: true,
      plus: user.plus,
      plusUntil: user.plusUntil ?? null,
    },
    csrf,
  });
}

/**
 * `sessions` er cookie-verdi → svar, prøvd i rekkefølge med `includes` (som
 * kopiene gjorde). Alt annet får `fallback` — standard «ikke innlogget».
 */
export function startMockKonto(
  sessions: Record<string, () => Response>,
  fallback: () => Response = () => Response.json({ user: null }),
): ReturnType<typeof Bun.serve> {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const cookie = req.headers.get('cookie') ?? '';
      for (const [value, respond] of Object.entries(sessions)) {
        if (cookie.includes(`fv-session=${value}`)) return respond();
      }
      return fallback();
    },
  });
  process.env.ACCOUNT_API_URL = `http://localhost:${server.port}`;
  return server;
}
