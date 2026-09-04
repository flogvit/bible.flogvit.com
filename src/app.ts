// FLOGVIT.bible — Hono + Bun, samme familie-stack som konto/puzzles/photosuite.
// Alle API-ruter fra Express-utgaven er montert på samme stier med samme
// JSON-kontrakt (bibel-hono/ISSUES.md #7). Gamle /api/auth finnes ikke lenger —
// innlogging bor sentralt i konto (#5). Sidene rendres server-side i hono/jsx.

import { Hono, type MiddlewareHandler } from 'hono';
import { serveStatic } from 'hono/bun';
import { ensureBooks } from './lib/bible.ts';
import { STATIC_MOUNTS, staticCache, staticMountNotFound } from './lib/static-cache.ts';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from './lib/session.ts';
import { ACCOUNT_URL, withSession } from './lib/session.ts';
import { withPageCache } from './lib/page-cache.ts';
import { withRetryBudget } from './lib/db.ts';
import { feilsvar } from './lib/error-handler.ts';
import pages from './routes/pages.tsx';
import { NotFoundPage } from './routes/pages/misc.tsx';
import sync from './routes/sync.ts';
import books from './routes/api/books.ts';
import chapter from './routes/api/chapter.ts';
import chapterContext from './routes/api/chapter-context.ts';
import dailyVerse from './routes/api/daily-verse.ts';
import days from './routes/api/days.ts';
import favorites from './routes/api/favorites.ts';
import importantWords from './routes/api/important-words.ts';
import mappings from './routes/api/mappings.ts';
import numberSymbolism from './routes/api/number-symbolism.ts';
import parallels from './routes/api/parallels.ts';
import persons from './routes/api/persons.ts';
import prophecies from './routes/api/prophecies.ts';
import readingPlans from './routes/api/reading-plans.ts';
import readingTexts from './routes/api/reading-texts.ts';
import contrib from './routes/api/contrib.ts';
import shares from './routes/api/shares.ts';
import publications from './routes/api/publications.ts';
import reference from './routes/api/reference.ts';
import references from './routes/api/references.ts';
import search from './routes/api/search.ts';
import statistics from './routes/api/statistics.ts';
import stories from './routes/api/stories.ts';
import themes from './routes/api/themes.ts';
import timeline from './routes/api/timeline.ts';
import verseExtras from './routes/api/verse-extras.ts';
import verses from './routes/api/verses.ts';
import version from './routes/api/version.ts';
import word4word from './routes/api/word4word.ts';
import apiDocs from './routes/api/docs.tsx';
import { getCookie } from 'hono/cookie';
import { LOCALES, href, layoutProps, negotiateLocale, apiLocale } from './lib/i18n.ts';
import { ogRoutes } from './routes/og.ts';
import { seoRoutes } from './routes/seo.ts';
import { minneRegnskap } from './lib/minne-regnskap.ts';

/**
 * Bok-metadataen MÅ være der før en side eller et API-svar som slår opp en bok
 * (#109).
 *
 * `initBooks()` kjøres én gang ved oppstart. Bommet den fordi basen var borte i
 * det øyeblikket containeren startet, sto den tom for alltid — og «tom» er ikke
 * en forbindelsesfeil, så utfallet var naken 500 på hver personside, hver
 * historieside, `/statistikk` og hele `/api/books`, i det uendelige, mens basen
 * var frisk. Her er lastingen en del av forespørselen: innenfor retry-budsjettet
 * (#107), altså 503 med `Retry-After` mens avbruddet varer (#108), og et svar i
 * det øyeblikket basen er tilbake.
 *
 * Den er montert på sidene og på `/api/`, ikke på `*`. `/robots.txt`, sitemapene,
 * delekortene og `public/` slår ikke opp en bok, og en brems bak sin egen port
 * er ingen brems (#64).
 */
const medBokdata: MiddlewareHandler<AppEnv> = async (_c, next) => {
  await ensureBooks();
  await next();
};

export function createApp() {
  const app = new Hono<AppEnv>();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // HVA HOLDER DEN PÅ? — svaret som fire saker har manglet (#19, #105, #106,
  // #216). Se `lib/minne-regnskap.ts` for hvorfor den finnes.
  //
  // Egen rute og ikke et felt i `/api/health`: helsesvaret er en kontrakt
  // røyktesten og Caddy leser, og et svar som vokser med hver ny cache er ikke
  // lenger et helsesvar. Denne ruta har lov til å endre form.
  //
  // OFFENTLIG, med vilje. Innholdet er aggregerte tellere for våre egne
  // cacher — ingen brukerdata, ingen adresser, ingenting om maskinen den står
  // på. Prisen for å gjemme den ville vært en nøkkel å dele, og et tall ingen
  // rekker å lese klokka tre om natta er tallet som ikke finnes.
  app.get('/api/minne', (c) => c.json(minneRegnskap()));

  // Et ubehandlet kast er ikke automatisk en 500 (#108). Løper retry-budsjettet
  // fra #107 ut fordi basen er borte lenger enn 25 s, er sida ikke i stykker —
  // og 503 + `Retry-After` er beskjeden crawleren kan handle på. Begrunnelsen
  // for skillet står i `lib/error-handler.ts`.
  app.onError(feilsvar);

  // AsyncLocalStorage for request-konteksten, så chrome-komponentene (headerens
  // konto-chip) kan lese c.var.user server-side uten å tres gjennom hvert
  // Layout-kall. Ytterst, så den omslutter både cache og sesjon.
  app.use('*', contextStorage());

  // ETT retry-budsjett for hele forespørselen (#107). Budsjettet i db.ts ble
  // regnet ut på nytt per `sql`-kall, og en side gjør mange — `/personer/:id`
  // ett per familiemedlem — så taket var antall spørringer × 25 s. Ytterst, så
  // det gjelder både sider, API og versjonssjekken i mikrocachen.
  app.use('*', (_c, next) => withRetryBudget(next));

  // Mikrocache for anonyme sidevisninger — FØR withSession, så cache-treff
  // hverken rendrer eller validerer sesjon (GitHub #4).
  app.use('*', withPageCache);

  // Konto-sesjonen løses inn på c.var.user for hver request (fail-open til
  // anonym). Login/konto bor sentralt — vi bare redirecter dit.
  app.use('*', withSession);
  app.get('/logg-inn', (c) => c.redirect(ACCOUNT_URL, 302));
  app.get('/konto', (c) => c.redirect(ACCOUNT_URL, 302));

  // /api/* er montert uprefikset og arver ingen locale fra ruta slik sidene
  // gjør, så uten dette svarte hele API-et på gulvet uansett språk (#24).
  // Getterne i bible.ts leser locale fra contextStorage, så det holder å sette
  // den her — ingen av rutene trenger å ta imot språk selv.
  app.use('/api/*', async (c, next) => {
    c.set('locale', apiLocale(c.req, getCookie(c, 'fv-prefs')));
    await next();
  });
  app.use('/api/*', medBokdata);

  // API — samme stier som Express-utgaven (api/server.ts).
  app.route('/api/chapter', chapter);
  app.route('/api/books', books);
  app.route('/api/verses', verses);
  app.route('/api/timeline', timeline);
  app.route('/api/prophecies', prophecies);
  app.route('/api/persons', persons);
  app.route('/api/reading-plans', readingPlans);
  app.route('/api/search', search);
  app.route('/api/version', version);
  app.route('/api/themes', themes);
  app.route('/api/favorites', favorites);
  app.route('/api/word4word', word4word);
  app.route('/api/references', references);
  app.route('/api/verse-extras', verseExtras);
  app.route('/api/reference', reference);
  app.route('/api/important-words', importantWords);
  app.route('/api/daily-verse', dailyVerse);
  app.route('/api/parallels', parallels);
  app.route('/api/statistics', statistics);
  app.route('/api/mappings', mappings);
  app.route('/api/chapter-context', chapterContext);
  app.route('/api/stories', stories);
  app.route('/api/number-symbolism', numberSymbolism);
  app.route('/api/days', days);
  app.route('/api/reading-texts', readingTexts);
  app.route('/api/contrib', contrib);
  app.route('/api/shares', shares);
  app.route('/api/publications', publications);
  app.route('/api/sync', sync);

  // Referansen over de 74 endepunktene over — spesifikasjonen og sida som
  // leser den (#114). SIST, så en `/api/docs`-rute i en samling alltid vinner
  // over dokumentasjonen om den ene adressen skulle bli tatt i bruk.
  app.route('/api', apiDocs);

  // Crawler-flater FØR serveStatic, ellers vinner den gamle statiske
  // sitemap.xml med sine uprefiksede URL-er.
  app.route('/', seoRoutes);

  // Delekortene per kapittel (#68). Uprefikset, som `/og.png`: språket ligger
  // i STIEN og ikke i monteringen, fordi kortet hentes av en skraper som
  // hverken har cookie eller Accept-Language — bare URL-en fra lenken.
  app.route('/', ogRoutes);

  // Statiske filer (styles.css, /js/*) — registrert etter /api/* så API vinner,
  // og faller gjennom til siderutene når ingen fil matcher.
  //
  // staticCache FØRST: serveStatic sender ingen cache-headere i det hele tatt,
  // så etter en deploy satt leseren igjen med gammel CSS til ny HTML.
  // `/og.png` er delekortet (#65). Det hentes av skrapere, ikke av nettlesere,
  // og uten en validator laster hver av dem hele bildet på nytt hver gang.
  app.use('/*', staticCache(STATIC_MOUNTS));
  app.use('/*', serveStatic({ root: './public' }));
  // Fant serveStatic ingen fil under en statisk montering, er svaret 404 her —
  // ikke en locale-forhandling videre inn i side-navnerommet (#95).
  app.use('/*', staticMountNotFound(STATIC_MOUNTS));

  // Én montering per språk (I18N.md §2). Locale settes av monteringen, ikke av
  // cookie: URL-en vinner, ellers ville en delt lenke vist mottakerens språk.
  //
  // MERK: dette er UI-locale. Innholdsspråket (deriverte tekster) utledes fra
  // den via localeToContentLanguage() i lib/lang.ts, mens BIBELUTGAVEN
  // (osnb/osnn/SBLGNT/Tanach) er et eget brukervalg som ikke røres her —
  // norsk UI med gresk grunntekst er en gyldig kombinasjon.
  for (const locale of LOCALES) {
    const sub = new Hono<AppEnv>();
    sub.use('*', async (c, next) => {
      c.set('locale', locale);
      await next();
    });
    sub.use('*', medBokdata);
    // Samme snarveier som uprefikset (se over): /<lang>/logg-inn og
    // /<lang>/konto skal ikke 404 naar de uprefiksede virker. De redirecter
    // til sentral konto uansett spraak, saa locale spiller ingen rolle her.
    sub.get('/logg-inn', (c) => c.redirect(ACCOUNT_URL, 302));
    sub.get('/konto', (c) => c.redirect(ACCOUNT_URL, 302));
    sub.route('/', pages);
    app.route(`/${locale}`, sub);
  }

  // Alt uprefikset forhandles: fv-prefs > Accept-Language > en. 302 fordi
  // svaret avhenger av cookie og header, altså per bruker.
  //
  // Ligger språket ALLEREDE i stien, har vi bommet på en rute — da er 404 rett
  // svar, ikke enda et prefiks (det ville gitt /en/x → /en/en/x i det uendelige).
  app.all('*', (c) => {
    const url = new URL(c.req.url);
    const p = url.pathname;
    if (p.startsWith('/api/') || p.includes('.')) return c.notFound();
    if (new RegExp(`^/(${LOCALES.join('|')})(/|$)`).test(p)) {
      const trimmed = p.replace(/\/+$/, '') || '/';
      return trimmed !== p ? c.redirect(trimmed + url.search, 301) : c.notFound();
    }
    const locale = negotiateLocale(getCookie(c, 'fv-prefs'), c.req.header('accept-language'));
    return c.redirect(href(locale, p) + url.search, 302);
  });

  // 404: API-stier svarer JSON (som gamle Express-appen), sider får 404-siden.
  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
    return c.html(NotFoundPage(layoutProps(c)), 404);
  });

  return app;
}
