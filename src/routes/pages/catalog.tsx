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
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { Markdown } from '../../views/markdown.tsx';
import { layoutProps, tFor, tCtx, lhref, currentIntlTag } from '../../lib/i18n.ts';
import { getPublication, listCatalog } from '../../lib/publications.ts';

const r = new Hono<AppEnv>();

const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat(currentIntlTag(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(ms));

r.get('/manuskripter/katalog', async (c) => {
  const t = tFor(c);
  const items = await listCatalog();

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('pub.catalog')} — FLOGVIT.bible`}
      description={t('pub.intro')}
      styles={['user.css']}
    >
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('pub.catalog') }]} />
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

          <p class="user-note">{t('pub.ownHint')} <a href={lhref('/manuskripter')}>{t('nav.manuscripts')}</a></p>
        </div>
      </div>
    </Layout>,
  );
});

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
