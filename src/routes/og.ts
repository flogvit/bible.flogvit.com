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
import { Hono } from 'hono';
import { getBookInfoBySlug } from '../lib/books-data.ts';
import { isLocale } from '../lib/i18n.ts';
import { renderChapterCard } from '../lib/og-card.ts';

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

ogRoutes.get('/og/:locale/:file', async (c) => {
  const { locale, file } = c.req.param();
  const match = /^(.+)-(\d+)\.png$/.exec(file);
  if (!isLocale(locale) || !match) return c.notFound();

  const book = getBookInfoBySlug(match[1]!);
  const chapter = Number(match[2]);
  // Et kapittel som ikke finnes skal ikke få et kort som lover en side: da
  // ville en delt lenke til en 404 sett riktig ut i forhåndsvisningen.
  // `books-data.ts` er ÉNE sannheten om kapittelantall (#46, bifunn).
  if (!book || chapter < 1 || chapter > book.chapters) return c.notFound();

  const key = `${locale}/${book.id}-${chapter}`;
  const png = cache.get(key) ?? remember(key, renderChapterCard(book.id, chapter, locale) ?? generic());

  return c.body(png as unknown as ArrayBuffer, 200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=604800',
    ETag: `"${Bun.hash(png).toString(16)}"`,
  });
});

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
