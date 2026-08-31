// Hva appen svarer når en handler KASTER (#108).
//
// Appen hadde ingen `app.onError`, så et hvilket som helst ubehandlet kast ble
// Honos standardsvar: en naken **500**. Det er feil svar for den vanligste
// årsaken vi faktisk måler — at basen er borte en stund.
//
// `db.ts` gjentar lesninger gjennom et DB-avbrudd, men budsjettet er et TAK
// (#107, 25 s). Varer avbruddet lenger, kaster spørringen, og det kastet er
// ikke en defekt i siden — det er «kom tilbake om litt». Målt
// 2026-08-31T01:45:37–01:45:47Z fikk to bingbot-hentinger og én SemrushBot
// nettopp 500 der:
//
//     500  GET /en/1kr%C3%B8n/1                      22,0 s
//     500  GET /en/historier/daniel-i-lovehulen      25,7 s
//     500  GET /es/historier/babels-tarn             22,6 s
//
// **Forskjellen på 500 og 503 er hva crawleren gjør med SIDA etterpå.** 500
// sier «denne adressen er i stykker», og gjentatte 500-er tar den ut av
// indeksen. 503 + `Retry-After` er den dokumenterte måten å si «midlertidig,
// kom tilbake» — samme svar lastvernet i `page-cache.ts` allerede gir under
// overlast (`Retry-After: 30`), og samme sekundtall, siden det er samme
// beskjed. Den veien fantes; den var bare ikke koblet til DB-avbruddet.
//
// **Ikke alt blir 503, og det er hele skillet.** En ekte feil — en spørring mot
// en tabell som ikke finnes, en `undefined` i en view — er en defekt hos oss, og
// den skal stå som 500. «503 på alt» ville gjort hver eneste bug til en
// beskjed om å prøve igjen senere, altså gjemt den bak et løfte vi ikke kan
// holde. Klassifiseringen er `isConnectionError()` fra `db.ts`, altså SAMME
// regel som avgjør om spørringen gjentas i det hele tatt — to lister ville vært
// to steder å glemme neste feilkode.
//
// **Svaret er ren tekst, ikke 404-sidas HTML.** Å rendre `Layout` her ville
// kjørt chrome-komponentene på nytt i nettopp det øyeblikket noe er galt, og et
// kast INNE i `onError` gir Honos nakne 500 tilbake — altså den feilen vi
// fikser. En crawler leser statuskoden og `Retry-After`; en kropp den ikke
// trenger er ikke verdt den risikoen.

import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { isConnectionError } from './db.ts';
import type { AppEnv } from './session.ts';

/**
 * Hvor lenge vi ber klienten vente. Samme tall som lastvernets 503 i
 * `page-cache.ts`: det er samme beskjed, og de målte avbruddene er kortere
 * (12 s, 28 s, og ~28 s i denne saken).
 */
export const DB_NEDE_RETRY_AFTER_S = 30;

export const feilsvar: ErrorHandler<AppEnv> = (err, c) => {
  // En HTTPException bærer sitt EGET svar (status og kropp er allerede valgt av
  // den som kastet den). Å overskrive det med 500 ville gjort et bevisst 4xx om
  // til vår feil.
  if (err instanceof HTTPException) return err.getResponse();

  const nede = isConnectionError(err);

  // Loggen skiller de to like tydelig som svaret gjør: et DB-avbrudd er drift
  // og trenger bare én linje (det kommer én per forespørsel i en byge), mens en
  // ekte feil er den ene gangen vi vil ha hele stacktracen.
  if (nede) console.error(`[503] ${c.req.method} ${c.req.path} — DB utilgjengelig: ${(err as Error).message}`);
  else console.error(`[500] ${c.req.method} ${c.req.path}`, err);

  const status = nede ? 503 : 500;
  const headers: Record<string, string> = nede
    ? { 'retry-after': String(DB_NEDE_RETRY_AFTER_S) }
    : {};

  // API-stier svarer JSON, som `app.notFound()` allerede gjør — en klient som
  // ber om JSON skal ikke få ren tekst fordi noe gikk galt.
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: nede ? 'Service unavailable' : 'Internal error' }, status, headers);
  }

  return c.body(nede ? 'Database unavailable, try again shortly.\n' : 'Internal server error.\n', status, {
    'content-type': 'text/plain; charset=utf-8',
    ...headers,
  });
};
