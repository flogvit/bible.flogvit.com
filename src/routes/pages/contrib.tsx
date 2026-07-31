// Bidragssider: /bidra (verk-sentrisk innsendingsskjema for artikler/bøker
// med versreferanser) og /mine-bidrag (status per innsending, med svar-runde
// på needs_info). Krever konto men IKKE plus — bidrag er en donasjon til
// fellesskapet (free-bible), ikke «husking» av eget innhold.
//
// KVN-REGELEN: skjemaet ber bare om referansen slik den står i verket + hvilken
// bibelutgave den er sitert fra (context_translation). All oppløsning til
// kanonisk versnummer skjer i free-bibles pipeline/review — aldri her.

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs, type Crumb } from '../../views/breadcrumbs.tsx';
import type { Child } from 'hono/jsx';
import { layoutProps, tFor, href, type Locale, type Translator } from '../../lib/i18n.ts';
import { bookAbbr, bookName, getBookInfoBySlug, type BookInfo } from '../../lib/books-data.ts';
import { getChapterVerseCount } from '../../lib/verse-counts.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
import { MAPPING_META, resolveMappingId } from '../../lib/verse-mapper.ts';
import { listSubmissionsForUser, type ContribRow } from '../../lib/contrib.ts';
import { tCtx } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

// Samme skall som brukersidene (UserPage i user.tsx er privat der).
function ContribShell(props: {
  title: string;
  crumb: string;
  heading: string;
  intro?: string;
  page: string;
  children?: Child;
  locale: Locale;
  path: string;
  /** Teksten leseren kom fra, som et mellomledd i brødsmulene (#57). */
  origin?: Crumb;
}) {
  const crumbs: Crumb[] = [{ label: tCtx()('common.home'), href: '/' }];
  if (props.origin) crumbs.push(props.origin);
  crumbs.push({ label: props.crumb });
  return (
    <Layout locale={props.locale} path={props.path}
      title={`${props.title} — FLOGVIT.bible`}
      description={props.intro || props.heading}
      styles={['user.css', 'contrib.css']}
      scripts={['contrib.js']}
    >
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={crumbs} />
          <h1>{props.heading}</h1>
          {props.intro && <p class="user-intro">{props.intro}</p>}
          <div data-user-page={props.page}>{props.children}</div>
        </div>
      </div>
    </Layout>
  );
}

function LoginCta({ t, locale }: { t: Translator; locale: Locale }) {
  return (
    <div class="contrib-login">
      <p>{t('contrib.loginRequired')}</p>
      <p>
        <a class="contrib-login-cta" href={href(locale, '/logg-inn')}>{t('contrib.loginCta')}</a>
      </p>
    </div>
  );
}

/** Én referanserad — brukes både for første rad og i <template> for kloning. */
function RefRow({ t, raw, kind }: { t: Translator; raw?: string; kind?: string }) {
  return (
    <div class="contrib-ref" data-ref-row>
      <div class="contrib-ref-main">
        <input type="text" data-ref-raw value={raw ?? ''} placeholder={t('contrib.refPlaceholder')}
          maxlength={200} />
        <select data-ref-kind aria-label={t('contrib.refKind')}>
          <option value="discusses" selected={kind === undefined || kind === 'discusses'}>
            {t('contrib.kindDiscusses')}
          </option>
          <option value="cites">{t('contrib.kindCites')}</option>
          <option value="covers_passage" selected={kind === 'covers_passage'}>{t('contrib.kindCovers')}</option>
        </select>
        <button type="button" class="contrib-ref-remove" data-ref-remove aria-label={t('contrib.remove')}>
          ×
        </button>
      </div>
      <div class="contrib-ref-where">
        <input type="number" data-ref-page min={1} placeholder={t('contrib.wherePage')} />
        <input type="text" data-ref-section maxlength={200} placeholder={t('contrib.whereSection')} />
        <input type="text" data-ref-quote maxlength={300} placeholder={t('contrib.quote')} />
      </div>
      <p class="contrib-ref-preview" data-ref-preview hidden></p>
    </div>
  );
}

/**
 * Stedet siden ble åpnet fra: ?vers=slug-kap-vers, ?kap=slug-kap, ?bok=slug.
 * Slugen kan selv inneholde bindestrek, så tallene telles fra HØYRE.
 */
interface Origin {
  book: BookInfo;
  chapter?: number;
  verse?: number;
}

function parseOrigin(value: string, numbers: number): Origin | undefined {
  const segments = value.split('-');
  if (segments.length < numbers + 1) return undefined;
  const book = getBookInfoBySlug(segments.slice(0, segments.length - numbers).join('-'));
  if (!book) return undefined;
  const tail = segments.slice(segments.length - numbers);
  if (!tail.every((n) => /^\d+$/.test(n) && Number(n) >= 1)) return undefined;
  return { book, chapter: Number(tail[0]), verse: numbers > 1 ? Number(tail[1]) : undefined };
}

function originOf(c: Context<AppEnv>): Origin | undefined {
  const vers = c.req.query('vers');
  const kap = c.req.query('kap');
  const bok = c.req.query('bok');
  if (vers) {
    const origin = parseOrigin(vers, 2);
    if (origin) return origin;
  }
  if (kap) {
    const origin = parseOrigin(kap, 1);
    if (origin) return origin;
  }
  if (bok) {
    const book = getBookInfoBySlug(bok);
    if (book) return { book };
  }
  return undefined;
}

/** Prefill av referansefeltet. `short_name` er NØKKELEN parserne slår opp på. */
function prefillRef(origin: Origin | undefined): { raw?: string; kind?: string } {
  if (!origin) return {};
  const { book, chapter, verse } = origin;
  if (chapter === undefined) return { raw: book.short_name, kind: 'covers_passage' };
  if (verse === undefined) return { raw: `${book.short_name} ${chapter}` };
  return { raw: `${book.short_name} ${chapter},${verse}` };
}

/**
 * Veien TILBAKE til teksten, som et brødsmuleledd (#57). Uten den er /bidra en
 * blindvei: eneste vei ut av siden er forsiden, og leseren mister plassen sin.
 *
 * Parameteren kommer utenfra, så leddet rendres bare når adressen finnes
 * (#46-regelen): et kapittel forbi bokas antall gir INGEN lenke framfor en død
 * en, og et vers forbi kapittelslutten faller tilbake til kapittelet — siden
 * finnes, det er bare ankeret som ikke gjør det.
 *
 * Prefillen over er med vilje ikke like streng: en referanse slik den står i et
 * verk kan følge en annen versifisering, og den skal reviewen få se.
 */
function originCrumb(origin: Origin | undefined): Crumb | undefined {
  if (!origin) return undefined;
  const { book, chapter } = origin;
  const slug = toUrlSlug(book.short_name);
  if (chapter === undefined) return { label: bookName(book), href: `/${slug}/1` };
  if (chapter > book.chapters) return undefined;
  const verse = origin.verse !== undefined && origin.verse <= getChapterVerseCount(book.id, chapter)
    ? origin.verse
    : undefined;
  if (verse === undefined) return { label: `${bookAbbr(book)} ${chapter}`, href: `/${slug}/${chapter}` };
  return { label: `${bookAbbr(book)} ${chapter}:${verse}`, href: `/${slug}/${chapter}#v${verse}` };
}

r.get('/bidra', (c) => {
  const t = tFor(c);
  const { locale, path } = layoutProps(c);
  const user = c.var.user;
  // Veien tilbake gjelder også den som ikke er logget inn — hun møter en
  // login-vegg i tillegg til blindveien.
  const from = originOf(c);
  const origin = originCrumb(from);

  if (!user) {
    return c.html(
      <ContribShell title={t('contrib.title')} crumb={t('contrib.title')} heading={t('contrib.heading')}
        intro={t('contrib.intro')} page="contrib-form" locale={locale} path={path} origin={origin}>
        <LoginCta t={t} locale={locale} />
      </ContribShell>,
    );
  }

  const prefill = prefillRef(from);
  const requestedContext = resolveMappingId(c.req.query('bible') ?? '') ?? 'osnb';

  return c.html(
    <ContribShell title={t('contrib.title')} crumb={t('contrib.title')} heading={t('contrib.heading')}
      intro={t('contrib.intro')} page="contrib-form" locale={locale} path={path} origin={origin}>
      <form
        data-contrib-form
        data-msg-sent={t('contrib.sent')}
        data-msg-error={t('contrib.sendError')}
        data-msg-unparsed={t('contrib.unparsed')}
        data-msg-need-target={t('contrib.needTarget')}
        data-msg-need-ref={t('contrib.needRef')}
        data-mine-url={href(locale, '/mine-bidrag')}
      >
        <fieldset class="contrib-kind">
          <label>
            <input type="radio" name="kind" value="article_verse_refs" checked /> {t('contrib.kindArticle')}
          </label>
          <label>
            <input type="radio" name="kind" value="book_verse_refs" /> {t('contrib.kindBook')}
          </label>
          <label>
            <input type="radio" name="kind" value="song_verse_refs" /> {t('contrib.kindSong')}
          </label>
        </fieldset>

        <h2>{t('contrib.targetHeading')}</h2>
        <div class="contrib-target">
          <label data-kind-fields="article_verse_refs">
            <span>DOI</span>
            <input type="text" data-target-doi placeholder="10.…" maxlength={200} />
          </label>
          <label data-kind-fields="book_verse_refs" hidden>
            <span>ISBN</span>
            <input type="text" data-target-isbn maxlength={40} />
          </label>
          <label>
            <span>{t('contrib.url')}</span>
            <input type="url" data-target-url maxlength={500} />
          </label>
          <details class="contrib-freetext">
            <summary>{t('contrib.freetextHeading')}</summary>
            <label>
              <span>{t('contrib.workTitle')}</span>
              <input type="text" data-target-title maxlength={500} />
            </label>
            <label>
              <span>{t('contrib.authors')}</span>
              <input type="text" data-target-authors maxlength={500} />
            </label>
            <label>
              <span>{t('contrib.year')}</span>
              <input type="number" data-target-year min={1} max={2999} />
            </label>
            <label>
              <span>{t('contrib.journal')}</span>
              <input type="text" data-target-journal maxlength={300} />
            </label>
          </details>
        </div>

        <h2>{t('contrib.refsHeading')}</h2>
        <p class="contrib-help">{t('contrib.refsHelp')}</p>
        <label class="contrib-context">
          <span>{t('contrib.translationContext')}</span>
          <select data-context-translation>
            {Object.entries(MAPPING_META).map(([id, meta]) => (
              <option value={id} selected={id === requestedContext}>{meta.displayName}</option>
            ))}
          </select>
        </label>
        <p class="contrib-help">{t('contrib.translationContextHelp')}</p>

        <div data-ref-list>
          <RefRow t={t} raw={prefill.raw} kind={prefill.kind} />
        </div>
        <template data-ref-template>
          <RefRow t={t} />
        </template>
        <button type="button" class="contrib-add-ref" data-add-ref>{t('contrib.addRef')}</button>

        <label class="contrib-comment">
          <span>{t('contrib.comment')}</span>
          <textarea data-comment maxlength={2000} rows={3}></textarea>
        </label>

        <div class="contrib-credit">
          <label>
            <input type="checkbox" data-credit /> {t('contrib.credit')}
          </label>
          <label data-credit-name-row hidden>
            <span>{t('contrib.creditName')}</span>
            <input type="text" data-credit-name maxlength={120} value={user.displayName ?? ''} />
          </label>
        </div>

        <button type="submit" class="contrib-submit">{t('contrib.submit')}</button>
        <p class="contrib-status" data-form-status hidden></p>
      </form>
    </ContribShell>,
  );
});

const STATUS_KEYS = {
  pending: 'contrib.statusPending',
  needs_info: 'contrib.statusNeedsInfo',
  approved: 'contrib.statusApproved',
  rejected: 'contrib.statusRejected',
} as const;

function targetSummary(payload: Record<string, unknown>): string {
  const target = (payload.target ?? {}) as Record<string, unknown>;
  const freetext = target.freetext as { title?: string } | undefined;
  return (
    (freetext?.title as string) ||
    (target.doi as string) ||
    (target.isbn13 as string) ||
    (target.isbn10 as string) ||
    (target.openlibrary_id as string) ||
    (target.url as string) ||
    (target.catalog_id as string) ||
    '—'
  );
}

function refsSummary(payload: Record<string, unknown>): string {
  const refs = (payload.refs ?? []) as { raw?: string; kvnRef?: string }[];
  return refs.map((ref) => ref.kvnRef || ref.raw || '').filter(Boolean).join('; ');
}

function SubmissionCard({ row, t }: { row: ContribRow; t: Translator }) {
  const statusKey = STATUS_KEYS[row.status] ?? 'contrib.statusPending';
  return (
    <article class="user-card contrib-card" data-contrib-id={String(row.id)}>
      <div class="user-card-title">
        {targetSummary(row.payload)}{' '}
        <span class={`version-badge badge-${row.status}`}>{t(statusKey)}</span>
      </div>
      <div class="user-card-meta">{refsSummary(row.payload)}</div>
      {row.review_note && (
        <p class="contrib-review-note">
          <strong>{t('contrib.reviewNote')}:</strong> {row.review_note}
        </p>
      )}
      {row.status === 'needs_info' && (
        <div class="contrib-respond" data-respond-form data-id={String(row.id)}>
          <textarea data-respond-message maxlength={2000} rows={2}
            placeholder={t('contrib.respondPlaceholder')}></textarea>
          <button type="button" data-respond-send>{t('contrib.respondSend')}</button>
        </div>
      )}
    </article>
  );
}

r.get('/mine-bidrag', async (c) => {
  const t = tFor(c);
  const { locale, path } = layoutProps(c);
  const user = c.var.user;

  let content: Child;
  if (!user) {
    content = <LoginCta t={t} locale={locale} />;
  } else {
    const rows = await listSubmissionsForUser(user.id);
    content = (
      <div class="user-list" data-list>
        {rows.map((row) => (
          <SubmissionCard row={row} t={t} />
        ))}
        <p class="user-empty" data-empty hidden={rows.length > 0}>
          {t('contrib.empty')}{' '}
          <a href={href(locale, '/bidra')}>{t('contrib.emptyCta')}</a>
        </p>
      </div>
    );
  }

  return c.html(
    <ContribShell title={t('contrib.mine')} crumb={t('contrib.mine')} heading={t('contrib.mine')}
      page="contrib-mine" locale={locale} path={path}>
      {content}
    </ContribShell>,
  );
});

export default r;
