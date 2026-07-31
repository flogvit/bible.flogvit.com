/**
 * Hvor stor flate vi ber verden hente (#60).
 *
 * En intern lenke med QUERY er en handling eller en visningsvariant — aldri en
 * ny side. Canonical peker query-løst uansett (`Layout` bruker `path`, som er
 * uten query), så ingen av dem hører hjemme i en indeks, og de er heller ikke
 * verdt å hente: hver er unik, altså cache-miss, altså en render-plass i
 * semaforen.
 *
 * Tallene bak regelen: kapittelsidene lenket to sider per vers
 * (`/bidra?vers=…`, `/manuskripter/ny?vers=…`), som med 31 167 vers og åtte
 * språkprefikser ga 498 672 crawlbare URL-er mot 1 189 kapittelsider. Flata var
 * ~420 ganger større enn innholdet. GPTBot sto for 68 % av all trafikk i
 * målevinduet, 72 % av den mot `/bidra?vers=`, på 1,7 req/s — permanent rett
 * under de 1,8 req/s #19 slo fast at velter siden. Resultatet var 12 × 503 på
 * én time og 6,7 s til Googlebot på en helt vanlig kapittelside.
 *
 * `robots.txt` (routes/seo.ts) er den andre halvdelen: `nofollow` stopper
 * OPPDAGELSE, robots stopper HENTING av det crawleren allerede kjenner.
 */

/**
 * `rel` for en intern lenke.
 *
 * Tar hele stien, ikke et flagg: da er det stien selv som avgjør, og en lenke
 * som noen ganger har query og noen ganger ikke (bryterne på kapittelsiden,
 * som peker query-løst når valget er default) får riktig svar begge veier —
 * uten at kallstedet må gjenta betingelsen.
 */
export const relFor = (path: string): 'nofollow' | undefined => (path.includes('?') ? 'nofollow' : undefined);
