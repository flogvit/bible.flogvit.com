// Delt manuskript — /delt/<token> (#15, del 1).
//
// Leseren trenger IKKE konto: lenken er tilgangen. Siden er derfor SSR uten
// sesjon, og manuskriptet hentes med tokenet alene (lib/shares.ts).
//
// Tre ting følger av at dette er en capability-URL:
//
//   1. `noindex` — en hemmelig lenke skal ikke havne i en søkeindeks. Den står
//      heller ikke i sitemapen (lib/sitemap-paths.ts lister bare faste sider).
//   2. UTENFOR mikrocachen (page-cache.ts). En cachet kopi ville overlevd at
//      eieren trakk tilbake lenken — inntil en time med den nye TTL-en (#19).
//   3. Ingen liste, ingen søk, ingen «neste». Tokenet er den eneste veien inn.
//
// Innholdet er BRUKERTEKST og rendres med den samme markdown-/referanse-
// rendereren som resten av appen (views/markdown.tsx → InlineRefs), altså aldri
// som rå HTML.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { Markdown } from '../../views/markdown.tsx';
import { layoutProps, tFor, tCtx, lhref } from '../../lib/i18n.ts';
import { resolveShare, sharedContent } from '../../lib/shares.ts';

const r = new Hono<AppEnv>();

r.get('/delt/:token', async (c) => {
  const t = tFor(c);
  const dev = await resolveShare(c.req.param('token'));
  // Ukjent, tilbaketrukket og slettet gir samme svar: 404. Et eget «trukket
  // tilbake» ville bekreftet at tokenet en gang var gyldig.
  if (!dev) return c.notFound();

  const title = dev.title?.trim() || t('is.untitled');
  // `no-store`: uten en Cache-Control kan leseren (og enhver mellomtjener)
  // heuristisk beholde en kopi, og da ville en tilbaketrukket lenke fortsatt
  // vist teksten hos mottakeren. Det er samme grunn som at siden står utenfor
  // mikrocachen — tilbaketrekking skal virke overalt, med en gang.
  c.header('cache-control', 'private, no-store');
  return c.html(
    <Layout {...layoutProps(c)}
      title={`${title} — FLOGVIT.bible`}
      description={t('sh.meta')}
      noindex
      styles={['user.css']}
    >
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: t('sh.crumb') }]} />
          <article class="devotional-article">
            <h1>{title}</h1>
            <p class="user-note">{t('sh.sharedNote')}</p>
            <Markdown text={sharedContent(dev)} />
          </article>
          <p class="user-note">
            <a href={lhref('/')}>{t('sh.exploreBible')}</a>
          </p>
        </div>
      </div>
    </Layout>,
  );
});

export default r;
