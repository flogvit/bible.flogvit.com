// Åpen katalog for manuskripter — /manuskripter/katalog (#15, del 2).
//
// Motstykket til den skjulte lenken i del 1: her er alt listbart, offentlig og
// indekserbart. Det er nettopp derfor oppføringene er reviewet — se
// lib/publications.ts for review-modellen og hvorfor teksten er frosset.
//
// VIKTIG OM RUTEREKKEFØLGE: `/manuskripter/:slug` finnes i user.tsx og ville
// slukt `/manuskripter/katalog`. Denne fila monteres derfor FØR user i
// pages.tsx, og `test/publications.test.ts` pinner det — et bytte ville ellers
// stille gjort katalogen om til brukerens egen manuskriptside.
//
// Innholdet er BRUKERTEKST og rendres med den samme markdown-/referanse-
// rendereren som resten av appen (views/markdown.tsx), altså aldri som rå HTML.

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { Markdown } from '../../views/markdown.tsx';
import { layoutProps, tFor, tCtx, lhref, currentIntlTag } from '../../lib/i18n.ts';
import { catalogPagePath, getPublication, listCatalog } from '../../lib/publications.ts';

const r = new Hono<AppEnv>();

const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat(currentIntlTag(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(ms));

/**
 * Katalogen er PAGINERT PÅ STI, ikke på query (#75).
 *
 * `?side=2` ville vært en handlings-URL etter #60 — altså `nofollow` og
 * forbudt i robots.txt — og side 2 dermed like uoppdagbar som oppføringene den
 * skulle vise. To segmenter kolliderer heller ikke med `:slug` under.
 */
r.get('/manuskripter/katalog', async (c) => renderCatalog(c, 1));

r.get('/manuskripter/katalog/side/:page', async (c) => {
  const raw = c.req.param('page');
  // Alt annet enn et ekte sidetall er 404: en side som ikke finnes skal ikke
  // svare 200 med en tom liste — det er en uendelig flate for en crawler.
  if (!/^[1-9][0-9]*$/.test(raw)) return c.notFound();
  const page = Number(raw);
  // Side 1 har ÉN adresse, og det er den korte — den som ligger i sitemapen.
  if (page === 1) return c.redirect(lhref('/manuskripter/katalog'), 301);
  return renderCatalog(c, page);
});

async function renderCatalog(c: Context<AppEnv>, page: number) {
  const t = tFor(c);
  const { items, pageCount, page: current } = await listCatalog(page);
  // Et sidetall forbi siste side er 404, ikke en tom side med 200.
  if (page > pageCount) return c.notFound();
  const pageHref = (n: number) => lhref(catalogPagePath(n));
  const crumbs = [{ label: tCtx()('common.home'), href: '/' }];
  if (current > 1) crumbs.push({ label: tCtx()('pub.catalog'), href: '/manuskripter/katalog' });

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('pub.catalog')} — FLOGVIT.bible`}
      description={t('pub.intro')}
      styles={['user.css']}
    >
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              ...crumbs,
              current > 1 ? { label: tCtx()('pub.pageN', { page: String(current) }) } : { label: tCtx()('pub.catalog') },
            ]}
          />
          <h1>{t('pub.catalog')}</h1>
          <p class="user-intro">{t('pub.intro')}</p>

          <div class="user-list">
            {items.map((p) => (
              <a class="user-card" href={lhref(`/manuskripter/katalog/${p.slug}`)}>
                <span class="user-card-title">{p.title}</span>
                <span class="user-card-meta">
                  {p.authorName ? t('pub.by', { name: p.authorName }) : t('pub.byAnonymous')}
                  {p.decidedAt != null ? ` · ${fmtDate(p.decidedAt)}` : ''}
                </span>
              </a>
            ))}
          </div>
          {items.length === 0 && <p class="user-empty">{t('pub.empty')}</p>}

          {/* Veien videre. Uten den er oppføringene på side 2 godkjent,
              publisert og uoppdagbare (#75) — de ligger med vilje ikke i
              sitemapen, så DENNE lenka er hele oppdagelsesveien. */}
          {pageCount > 1 && (
            <nav class="pager" aria-label={t('pub.catalog')}>
              {current > 1 ? (
                <a class="pager-link" data-pager="prev" rel="prev" href={pageHref(current - 1)}>
                  {t('pub.prevPage')}
                </a>
              ) : <span class="pager-gap" />}
              <span class="pager-status">
                {t('pub.pageOf', { page: String(current), pages: String(pageCount) })}
              </span>
              {current < pageCount ? (
                <a class="pager-link" data-pager="next" rel="next" href={pageHref(current + 1)}>
                  {t('pub.nextPage')}
                </a>
              ) : <span class="pager-gap" />}
            </nav>
          )}

          <p class="user-note">{t('pub.ownHint')} <a href={lhref('/manuskripter')}>{t('nav.manuscripts')}</a></p>
        </div>
      </div>
    </Layout>,
  );
}

/**
 * Én oppføring. Teksten er ØYEBLIKKSBILDET som ble godkjent, ikke forfatterens
 * gjeldende utkast — se lib/publications.ts.
 *
 * Siden står utenfor mikrocachen (`NEVER_CACHED` i page-cache.ts): trekker
 * forfatteren oppføringen, eller trekkes den etter en rapport, skal teksten
 * være borte MED EN GANG. Lista tåler derimot cache — en oppføring som er
 * trukket gir 404 når noen klikker, og det er hele skaden.
 */
r.get('/manuskripter/katalog/:slug', async (c) => {
  const t = tFor(c);
  const pub = await getPublication(c.req.param('slug'));
  // Ukjent, ikke godkjent, trukket og slettet gir samme svar: 404.
  if (!pub) return c.notFound();

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${pub.title} — ${t('pub.catalog')} — FLOGVIT.bible`}
      description={t('pub.detailMeta', { name: pub.authorName || t('pub.anonymous') })}
      styles={['user.css']}
      scripts={['publication.js']}
    >
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: tCtx()('common.home'), href: '/' },
              { label: tCtx()('pub.catalog'), href: '/manuskripter/katalog' },
              { label: pub.title },
            ]}
          />
          <article class="devotional-article">
            <h1>{pub.title}</h1>
            <p class="user-card-meta">
              {pub.authorName ? t('pub.by', { name: pub.authorName }) : t('pub.byAnonymous')}
              {pub.decidedAt != null ? ` · ${fmtDate(pub.decidedAt)}` : ''}
            </p>
            <Markdown text={pub.content} />
          </article>

          {/* Rapportering krever ingen konto: den som ser noe galt er som regel
              ikke innlogget. Knappen teller opp et signal til den som reviewer
              og skjuler ingenting av seg selv. */}
          <p class="user-note">
            <button type="button" class="user-btn-ghost" data-report-publication={pub.slug}>
              {t('pub.report')}
            </button>
            <span data-report-status />
          </p>
          <p class="user-note">
            <a href={lhref('/manuskripter/katalog')}>{t('pub.backToCatalog')}</a>
          </p>
        </div>
      </div>
    </Layout>,
  );
});

export default r;
