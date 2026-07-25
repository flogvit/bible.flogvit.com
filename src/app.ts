// FLOGVIT.bible — Hono + Bun, samme familie-stack som konto/puzzles/photosuite.
// Alle API-ruter fra Express-utgaven er montert på samme stier med samme
// JSON-kontrakt (bibel-hono/ISSUES.md #7). Gamle /api/auth finnes ikke lenger —
// innlogging bor sentralt i konto (#5). Sidene rendres server-side i hono/jsx.

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { contextStorage } from 'hono/context-storage';
import type { AppEnv } from './lib/session.ts';
import { ACCOUNT_URL, withSession } from './lib/session.ts';
import { withPageCache } from './lib/page-cache.ts';
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
import wellknownVerses from './routes/api/wellknown-verses.ts';
import word4word from './routes/api/word4word.ts';
import { getCookie } from 'hono/cookie';
import { LOCALES, href, layoutProps, negotiateLocale } from './lib/i18n.ts';
import { seoRoutes } from './routes/seo.ts';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // AsyncLocalStorage for request-konteksten, så chrome-komponentene (headerens
  // konto-chip) kan lese c.var.user server-side uten å tres gjennom hvert
  // Layout-kall. Ytterst, så den omslutter både cache og sesjon.
  app.use('*', contextStorage());

  // Mikrocache for anonyme sidevisninger — FØR withSession, så cache-treff
  // hverken rendrer eller validerer sesjon (GitHub #4).
  app.use('*', withPageCache);

  // Konto-sesjonen løses inn på c.var.user for hver request (fail-open til
  // anonym). Login/konto bor sentralt — vi bare redirecter dit.
  app.use('*', withSession);
  app.get('/logg-inn', (c) => c.redirect(ACCOUNT_URL, 302));
  app.get('/konto', (c) => c.redirect(ACCOUNT_URL, 302));

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
  app.route('/api/wellknown-verses', wellknownVerses);
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
  app.route('/api/sync', sync);

  // Crawler-flater FØR serveStatic, ellers vinner den gamle statiske
  // sitemap.xml med sine uprefiksede URL-er.
  app.route('/', seoRoutes);

  // Statiske filer (styles.css, /js/*) — registrert etter /api/* så API vinner,
  // og faller gjennom til siderutene når ingen fil matcher.
  app.use('/*', serveStatic({ root: './public' }));

  // Én montering per språk (I18N.md §2). Locale settes av monteringen, ikke av
  // cookie: URL-en vinner, ellers ville en delt lenke vist mottakerens språk.
  //
  // MERK: dette er UI-locale. Innholdsspråket (deriverte tekster) utledes fra
  // den via localeToContentLanguage() i lib/lang.ts, mens BIBELUTGAVEN
  // (osnb2/osnn1/SBLGNT/Tanach) er et eget brukervalg som ikke røres her —
  // norsk UI med gresk grunntekst er en gyldig kombinasjon.
  for (const locale of LOCALES) {
    const sub = new Hono<AppEnv>();
    sub.use('*', async (c, next) => {
      c.set('locale', locale);
      await next();
    });
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
