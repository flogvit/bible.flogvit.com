// Delekortene (#68). `/og/<språk>/<bok>-<kapittel>.png`
//
// Ruta finnes fordi kortet er FORSKJELLIG for 1189 kapitler × 8 språk og
// derfor ikke kan ligge som ferdige filer (se `lib/og-card.ts` for hvorfor
// begge veiene saken satte opp var stengt). Den setter sammen bildet av deler
// som er rastrert på forhånd — ~10 ms — og husker resultatet.
//
// Tre ting ruta MÅ gjøre riktig, alle av samme grunn: den svarer en SKRAPER,
// og en skraper prøver som regel bare én gang.
//
//   - **Den skal aldri svare med et halvt kort.** Kan teksten ikke tegnes,
//     serveres det generiske kortet. En tittel med hull i ser riktig ut fra en
//     200-linje i loggen og er bare synlig for den som fikk lenken.
//   - **Den ligger UTENFOR lastvernet**, fordi stien har et punktum
//     (`NOT_A_PAGE`, #64). Det er med vilje: en 503 på delekortet er et kort
//     som aldri kommer, og skraperen kommer ikke tilbake. Kostnaden er lav og
//     kjent, og cachen under gjør gjentakelsene gratis.
//   - **Den er IKKE forbudt i robots.txt.** Facebooks og LinkedIns skrapere
//     leser robots, så en `Disallow: /og/` ville tatt bort nettopp det bildet
//     som er hele poenget (#60 forbyr HANDLINGS-URL-er, ikke dette).

import { readFileSync } from 'node:fs';
import { Hono, type Context } from 'hono';
import { isLocale } from '../lib/i18n.ts';
import { bookByCardSlug, renderChapterCard } from '../lib/og-card.ts';

export const ogRoutes = new Hono();

/**
 * Kortene er deterministiske og endrer seg bare med en deploy, så en liten
 * cache tar hele crawl-runden. Taket er der fordi settet er 9512 kort: uten
 * det ville en crawler som går gjennom Bibelen dratt ~300 MB inn i heapen.
 */
const CACHE_MAX = 256;
const cache = new Map<string, Uint8Array>();

function remember(key: string, png: Uint8Array): Uint8Array {
  cache.set(key, png);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return png;
}

/**
 * Svaret til en klient som ALT har kuttet adressen (#84).
 *
 * Å gjøre kortstien ASCII-ren hindrer NYE kutt. Den hindrer ikke de avkortede
 * formene som allerede ligger i skrapernes indeks — 18 målte i saken — og de
 * blir hentet igjen. Saken sier hva som er galt med svaret de fikk:
 * «Skraperen får `text/html` der den ventet en PNG.»
 *
 * Så under `/og/` svarer vi aldri som en side: ingen HTML-kropp, og ingen
 * omvei. `/og/<språk>/` har ikke lenger et filsegment, falt derfor ut av
 * kortruta og videre i locale-forhandlingen — `302 /en/og/fr/` → `301
 * /en/og/fr` → `404` — altså to hopp for et bilde som ikke finnes, der det
 * siste er en adresse i SIDE-navnerommet som ikke fantes før vi fant den opp.
 * Det er klassen #46 og #60 stenger: vi lager ikke døde adresser til en
 * crawler.
 *
 * Prisen var dessuten en HEL SSR-RENDER. `NOT_A_PAGE` (#64) kjenner en fil på
 * punktumet, og et kutt fjerner nettopp punktumet — så en avkortet
 * kortadresse gikk gjennom lastvernet og rendret 404-SIDA, i nøyaktig det
 * øyeblikket kapasiteten er knapp (#19, #86). Den står fortsatt bak semaforen
 * (`NOT_A_PAGE` er et FILNAVN, ikke en liste over ruter, og det skillet er
 * #64s med vilje), men plassen holdes nå i mikrosekunder framfor en render.
 */
const avkortet = (c: Context) => c.body(null, 404);

ogRoutes.get('/og/:locale/:file', async (c) => {
  const { locale, file } = c.req.param();
  const match = /^(.+)-(\d+)\.png$/.exec(file);
  if (!isLocale(locale) || !match) return avkortet(c);

  // BEGGE formene av bokleddet: den ASCII-rene vi publiserer nå (#84), og den
  // prosentkodede som ligger i delte lenker og skrapernes indeks fra før.
  const book = bookByCardSlug(match[1]!);
  const chapter = Number(match[2]);
  // Et kapittel som ikke finnes skal ikke få et kort som lover en side: da
  // ville en delt lenke til en 404 sett riktig ut i forhåndsvisningen.
  // `books-data.ts` er ÉNE sannheten om kapittelantall (#46, bifunn).
  if (!book || chapter < 1 || chapter > book.chapters) return avkortet(c);

  const key = `${locale}/${book.id}-${chapter}`;
  const png = cache.get(key) ?? remember(key, renderChapterCard(book.id, chapter, locale) ?? generic());

  return c.body(png as unknown as ArrayBuffer, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=604800',
    ETag: `"${Bun.hash(png).toString(16)}"`,
  });
});

// Alt annet under `/og/` — også `/og/<språk>` og `/og/<språk>/`, som ikke har
// noe filsegment igjen å matche på. Den står SIST, så en hel adresse fortsatt
// vinner; den er ikke en mur, den er enden på et kutt.
ogRoutes.all('/og', avkortet);
ogRoutes.all('/og/*', avkortet);

/**
 * Nødutgangen: mangler malen en bokstav, eller er artefaktene ikke med i
 * imaget, faller kortet tilbake til det generiske framfor å bli borte.
 * `test/og-chapter-card.test.ts` er rød hvis det skjer for et boknavn vi har.
 */
let fallback: Uint8Array | null = null;
function generic(): Uint8Array {
  if (!fallback) {
    console.error('og-card: kunne ikke tegne kapittelkortet — serverer det generiske (#68)');
    fallback = new Uint8Array(readFileSync(new URL('../../public/og.png', import.meta.url)));
  }
  return fallback;
}
