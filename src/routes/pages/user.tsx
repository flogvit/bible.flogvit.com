// Brukersider: favoritter, emner, notater, lister, leseplan, manuskripter,
// innstillinger, offline, oversettelser. All brukerdata bor klient-side i
// localStorage/IndexedDB (samme nøkler som gamle appen — se user.js), så disse
// er SSR-skall + øyer. Leseplan-LISTA og innstillingsskjemaet rendres server-
// side der data finnes sentralt; resten fylles av user.js.
//
// TODO(#12): koble user.js til sync-klienten (push/pull mot /api/sync).
// TODO(#14): offline-nedlasting + service worker.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { ACCOUNT_URL } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import type { Child } from 'hono/jsx';
import { getSql } from '../../lib/db.ts';
import { bookNameByShort } from '../../lib/books-data.ts';
import { getUserItems, getUserSingleton, getReadingProgress } from '../../lib/user-data.ts';
import { summarizeProgress, fullHeat, stalestBooks } from '../../lib/reading-map.ts';
import { getBibleEditions, getAllReadingPlansList, type BibleEdition } from '../../lib/bible.ts';
import { getAvailableMappings } from '../../lib/verse-mapper.ts';
import { layoutProps, makeT, tFor, type Locale, type MessageKey, lhref } from '../../lib/i18n.ts';
import { tCtx } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

// Felles skall for de localStorage-drevne sidene.
function UserPage(props: {
  title: string;
  crumb: string;
  heading: string;
  intro?: string;
  page: string;
  children?: Child;
  wide?: boolean;
  styles?: string[];
  scripts?: string[];
  locale: Locale;
  path: string;
}) {
  return (
    <Layout locale={props.locale} path={props.path}
      title={`${props.title} — FLOGVIT.bible`}
      description={props.intro || props.heading}
      styles={['user.css', ...(props.styles ?? [])]}
      scripts={['user.js', ...(props.scripts ?? [])]}
    >
      <div class="user-main">
        <div class={props.wide ? 'container' : 'reading-container'}>
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: props.crumb }]} />
          <h1>{props.heading}</h1>
          {props.intro && <p class="user-intro">{props.intro}</p>}
          <div data-user-page={props.page}>{props.children}</div>
        </div>
      </div>
    </Layout>
  );
}

// ---------- /favoritter ----------
// Server-først (2026-07-22): for plus-brukere SSR-es innholdet fra sync_items;
// user.js re-rendrer identisk fra lokal kopi etter full sync.
interface FavoriteItem { bookId: number; chapter: number; verse: number; addedAt?: number }

r.get('/favoritter', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  let cards: { href: string; ref: string; text: string }[] = [];
  if (user?.plus) {
    const favs = await getUserItems<FavoriteItem>(user.id, 'favorites');
    const sql = getSql();
    cards = (
      await Promise.all(
        favs
          .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
          .map(async (f) => {
            const [v] = (await sql`
              SELECT v.text, b.name_no, b.short_name FROM verses v
              JOIN books b ON v.book_id = b.id
              WHERE v.book_id = ${f.bookId} AND v.chapter = ${f.chapter}
                AND v.verse = ${f.verse} AND v.bible = 'osnb'
            `) as { text: string; name_no: string; short_name: string }[];
            if (!v) return null;
            return {
              href: `/${v.short_name.toLowerCase()}/${f.chapter}#v${f.verse}`,
              ref: `${bookNameByShort(v.short_name)} ${f.chapter}:${f.verse}`,
              text: v.text,
            };
          }),
      )
    ).filter((x): x is NonNullable<typeof x> => x !== null);
  }
  return c.html(
    <UserPage {...layoutProps(c)} title={t('nav.favorites')} crumb={t('nav.favorites')} heading={t('u.favVerses')} page="favorites" intro={t('u.favIntro')}>
      <div class="user-list" data-list>
        {cards.map((card) => (
          <a class="user-card" href={lhref(card.href)}>
            <span class="user-card-ref">{card.ref}</span>
            <p class="user-card-text">{card.text}</p>
          </a>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={cards.length > 0}>{t('u.favEmpty')}</p>
    </UserPage>,
  );
});

// ---------- /emner ----------
interface TopicsData { topics?: { id: string; name: string }[]; verseTopics?: { topicId: string }[]; itemTopics?: { topicId: string }[] }

r.get('/emner', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const data: TopicsData = (user?.plus ? await getUserSingleton<TopicsData>(user.id, 'topics') : null) ?? {};
  const topics = (data.topics ?? []).map((t) => ({
    name: t.name,
    count:
      (data.itemTopics ?? []).filter((it) => it.topicId === t.id).length +
      (data.verseTopics ?? []).filter((vt) => vt.topicId === t.id).length,
  }));
  return c.html(
    <UserPage {...layoutProps(c)} title={t('nav.topicsMine')} crumb={t('nav.topicsMine')} heading={t('nav.topicsMine')} page="topics" intro={t('u.topicsIntro')}>
      <div class="user-list" data-list>
        {topics.map((t) => (
          <div class="user-card">
            <span class="user-card-title">{t.name}</span>
            <span class="user-card-meta">{tCtx()('is.taggedCount', { n: t.count })}</span>
          </div>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={topics.length > 0}>{t('u.noTopics')}</p>
    </UserPage>,
  );
});

// ---------- /notater ----------
interface NoteItem { id: string; bookId: number; chapter: number; verse: number; content: string; updatedAt: number }

r.get('/notater', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const notes = user?.plus ? (await getUserItems<NoteItem>(user.id, 'notes')).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  return c.html(
    <UserPage {...layoutProps(c)} title={t('nav.notes')} crumb={t('nav.notes')} heading={t('nav.notes')} page="notes" intro={t('u.notesIntro')}>
      <div class="user-list" data-list>
        {notes.map((n) => (
          <div class="user-card">
            <span class="user-card-ref">{`${n.bookId}-${n.chapter}-${n.verse}`}</span>
            <p class="user-card-text">{n.content}</p>
          </div>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={notes.length > 0}>{t('u.noNotes')}</p>
    </UserPage>,
  );
});

// ---------- /lister ----------
interface VerseListItem { id: string; name: string; refs?: unknown[]; updatedAt: number }

r.get('/lister', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const lists = user?.plus ? (await getUserItems<VerseListItem>(user.id, 'verseLists')).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  return c.html(
    <UserPage {...layoutProps(c)} title={t('nav.verseLists')} crumb={t('nav.verseLists')} heading={t('nav.verseLists')} page="verselists" intro={t('u.listsIntro')}>
      <form class="user-create" data-create-list>
        <input type="text" name="name" placeholder={t('u.newListPh')} aria-label={t('u.listNameAria')} class="user-input" />
        <button type="submit" class="user-btn">{t('u.createList')}</button>
      </form>
      <div class="user-list" data-list>
        {lists.map((l) => (
          <div class="user-card">
            <span class="user-card-title">{l.name}</span>
            <span class="user-card-meta">{t('is.verseCount', { n: (l.refs ?? []).length })}</span>
          </div>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={lists.length > 0}>{t('u.noLists')}</p>
    </UserPage>,
  );
});

// ---------- /lesekart ----------
//
// Kartet forteller hvor i Bibelen brukeren faktisk oppholder seg: varmere celle
// = flere gjenlesinger. Det er PULL — siden oppsøkes, den oppsøker ikke noen.
r.get('/lesekart', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const progress = user?.plus ? await getReadingProgress(user.id) : [];
  const summary = summarizeProgress(progress);
  const heat = fullHeat(progress);
  const stale = stalestBooks(progress);
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(c.get('locale'));

  return c.html(
    <UserPage {...layoutProps(c)}
      title={t('nav.readingMap')}
      crumb={t('nav.readingMap')}
      heading={t('map.heading')}
      page="readingmap"
      wide
      styles={['reading-map.css']}
    >
      <div class="map-stats" data-map-stats>
        <div class="map-stat">
          <strong data-stat-chapters>{summary.chaptersRead}</strong>
          <span>{t('map.chaptersRead')}</span>
        </div>
        <div class="map-stat">
          <strong data-stat-percent>{summary.percent.toFixed(1)} %</strong>
          <span>{t('map.ofBible')}</span>
        </div>
        <div class="map-stat">
          <strong>{summary.otRead}</strong>
          <span>GT</span>
        </div>
        <div class="map-stat">
          <strong>{summary.ntRead}</strong>
          <span>NT</span>
        </div>
        {summary.lastReadAt != null && (
          <div class="map-stat">
            <strong>{fmt(summary.lastReadAt)}</strong>
            <span>{t('rd.lastRead')}</span>
          </div>
        )}
        {summary.undatedChapters > 0 && (
          <div class="map-stat is-muted">
            <strong>{summary.undatedChapters}</strong>
            <span>{t('map.undated')}</span>
          </div>
        )}
      </div>

      {stale.length > 0 && (
        <ul class="map-stale">
          {stale.map((s) => (
            <li>
              {s.name} — {fmt(s.lastAt)}
            </li>
          ))}
        </ul>
      )}

      <div class="map-grid" data-reading-map>
        {heat.map((b) => (
          <section class="map-book" data-map-book={b.bookId} data-book-chapters={b.chapters.length}>
            <h2 class="map-book-name">{b.name}</h2>
            <div class="map-cells">
              {b.chapters.map((level, i) => (
                <span class="map-cell" data-level={level} data-chapter={i + 1} title={`${b.name} ${i + 1}`} />
              ))}
            </div>
            <button type="button" class="map-book-mark" data-mark-book={b.bookId} title={t('map.markBook')}>
              ✓
            </button>
          </section>
        ))}
      </div>

      {/* Bulk-markering: historikk fra før appen fantes. Tidspunkt er valgfritt —
          «vet ikke» er et gyldig svar og holdes utenfor tidslinjen. */}
      <div class="map-when" data-map-when hidden>
        <span data-map-when-label>{t('map.whenRead')}</span>
        <select data-map-when-year class="user-input" />
        <button type="button" class="user-btn" data-map-when-ok>OK</button>
        <button type="button" class="user-btn" data-map-when-unknown>{t('map.unknownWhen')}</button>
      </div>
    </UserPage>,
  );
});

// ---------- /leseplan ----------
r.get('/leseplan', async (c) => {
  const t = tFor(c);
  const plans = await getAllReadingPlansList();
  const user = c.var.user;
  const activePlan = user?.plus ? await getUserSingleton<string>(user.id, 'activePlan') : null;

  return c.html(
    <Layout {...layoutProps(c)} title={`${t('home.readingPlans')} — FLOGVIT.bible`} description={t('u.plansIntro')} styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.readingPlan') }]} />
          <h1>{t('home.readingPlans')}</h1>
          <p class="user-intro">
            {t('u.plansIntro')}
          </p>
          <div data-user-page="readingplan">
            <div class="plan-grid">
              {plans.map((p) => (
                <div class="plan-card" data-plan-id={p.id} data-plan-days={p.days}>
                  <h2 class="plan-name">{p.name}</h2>
                  {p.description && <p class="plan-desc">{p.description}</p>}
                  <div class="plan-meta">
                    <span class="plan-days">{t('u.planDays', { n: p.days })}</span>
                    {p.category && <span class="plan-cat">{p.category}</span>}
                  </div>
                  <div class="plan-actions">
                    <button type="button" class="user-btn plan-activate" data-plan={p.id}
                      data-active-label={t('u.activePlan')} data-gate-label={t('nav.readingPlan')}>
                      {activePlan === p.id ? t('u.activePlan') : t('u.choosePlanThis')}
                    </button>
                    <span class="plan-active-badge" hidden={activePlan !== p.id}>{t('u.active')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /manuskripter ----------
interface DevotionalItem { id: string; slug: string; title?: string; type?: string; updatedAt: number }

r.get('/manuskripter', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const devs = user?.plus ? (await getUserItems<DevotionalItem>(user.id, 'devotionals')).sort((a, b) => b.updatedAt - a.updatedAt) : [];
  return c.html(
    <UserPage {...layoutProps(c)} title={t('nav.manuscripts')} crumb={t('nav.manuscripts')} heading={t('nav.manuscripts')} page="devotionals" intro={t('u.manuscriptsIntro')} wide>
      <div class="user-toolbar">
        <a href={lhref('/manuskripter/ny')} class="user-btn">{t('u.newManuscript')}</a>
      </div>
      <div class="user-list" data-list>
        {devs.map((d) => (
          <a class="user-card" href={lhref(`/manuskripter/${d.slug}`)}>
            <span class="user-card-title">{d.title || '(uten tittel)'}</span>
            <span class="user-card-meta">{d.type || ''}</span>
          </a>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={devs.length > 0}>{t('u.noManuscripts')}</p>
    </UserPage>,
  );
});

// Editor (ny + rediger) — CodeMirror erstattet av textarea + markdown-preview i user.js.
function DevotionalEditor(props: { slug?: string; locale: Locale; path: string }) {
  const t = makeT(props.locale);
  return (
    <Layout locale={props.locale} path={props.path} title={`${t('u.editManuscript')} — FLOGVIT.bible`} description={t('u.manuscriptMeta')} styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.manuscripts'), href: '/manuskripter' }, { label: props.slug ? 'Rediger' : 'Nytt' }]} />
          <h1 class="sr-only">{props.slug ? 'Rediger manuskript' : 'Nytt manuskript'}</h1>
          <div data-user-page="devotional-editor" data-slug={props.slug || ''}>
            <div class="editor-head">
              <input type="text" data-editor-title placeholder={t('u.titlePh')} class="user-input editor-title" aria-label="Tittel" />
              <div class="editor-actions">
                <button type="button" class="user-btn" data-editor-save>{t('common.save')}</button>
                <a href={lhref('/manuskripter')} class="user-btn-ghost">{t('common.cancel')}</a>
              </div>
            </div>
            <p class="editor-hint">
              Bruk <code>[ref:Joh 3,16]</code> for versreferanser. Markdown støttes (overskrifter,
              <b>fet</b>, <i>kursiv</i>, lister).
            </p>
            <div class="editor-split">
              <textarea data-editor-content class="editor-textarea" placeholder={t('u.writeHerePh')} aria-label="Innhold"></textarea>
              <div class="editor-preview" data-editor-preview aria-live="polite"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
r.get('/manuskripter/ny', (c) => c.html(<DevotionalEditor {...layoutProps(c)} />));
r.get('/manuskripter/:slug/rediger', (c) => c.html(<DevotionalEditor {...layoutProps(c)} slug={c.req.param('slug')} />));
r.get('/manuskripter/:slug', (c) => {
  const t = tFor(c);
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('nav.manuscripts')} — FLOGVIT.bible`} description={t('u.manuscriptOne')} styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.manuscripts'), href: '/manuskripter' }, { label: '…' }]} />
          <div data-user-page="devotional-view" data-slug={c.req.param('slug')}>
            <article class="devotional-article" data-article></article>
            <p class="user-empty" data-empty hidden>{t('u.manuscriptNotFound')}</p>
          </div>
        </div>
      </div>
    </Layout>,
  );
});

/**
 * Etiketten for en utgave i velgerne. Navnet står på utgavens EGET språk
 * («Open Source Norsk Bokmål»), for det er slik utgaven heter — ikke noe som
 * skal oversettes. Forkortelsen tas med fordi den er det brukeren ser i
 * URL-er og delte lenker.
 */
function editionLabel(e: BibleEdition): string {
  return e.abbreviation ? `${e.name_native} (${e.abbreviation})` : e.name_native;
}

// ---------- /innstillinger ----------
const TOGGLE_KEYS = [
  'showBookSummary', 'showChapterSummary', 'showChapterContext', 'showChapterInsights',
  'showImportantWords', 'showVerseDetails', 'showWord4Word', 'showOriginalText',
  'showTimeline', 'showParallels', 'showDailyVerse', 'showTodaysDay', 'showReadingTexts',
  'showVerseFootnotes', 'copyVerseNumbers', 'showContinueReading',
] as const;

// Søkeresultat-typer (GitHub #2) — samme nøkler som gamle appen
// (bible-settings.searchResultTypes.*, default på).
// Etikettene gjenbruker nav-nøklene der de finnes — samme ord i menyen og i
// innstillingene skal ikke oversettes to steder.
const SEARCH_TYPE_TOGGLES: { key: string; label: MessageKey }[] = [
  { key: 'stories', label: 'nav.stories' },
  { key: 'themes', label: 'nav.themes' },
  { key: 'persons', label: 'nav.persons' },
  { key: 'prophecies', label: 'nav.prophecies' },
  { key: 'timeline', label: 'nav.timeline' },
  { key: 'parallels', label: 'nav.parallels' },
  { key: 'plans', label: 'set.type.plans' },
  { key: 'words', label: 'set.type.words' },
  { key: 'numberSymbolism', label: 'nav.numbers' },
  { key: 'days', label: 'nav.days' },
];
r.get('/innstillinger', async (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const mappings = getAvailableMappings();
  // Bare lesbare utgaver hører hjemme i «bibeloversettelse» — grunntekstene
  // (SBLGNT, Tanach) velges som UNDERTEKST, ikke som hovedtekst, og ligger
  // allerede der som «Grunntekst».
  const readable = (await getBibleEditions()).filter((e) => e.philosophy !== 'source_text');
  return c.html(
    <UserPage {...layoutProps(c)} title={t('chrome.settings')} crumb={t('chrome.settings')} heading={t('chrome.settings')} page="settings" intro={t('set.intro')}>
      <form data-settings-form class="settings-form">
        <fieldset class="settings-group">
          <legend>{t('settings.appearance')}</legend>
          {/* Global familie-pref (portal/PREFS.md). chrome.js speiler verdien
              og persisterer til cookie + konto — samme #fv-theme som før,
              flyttet hit fra FLOGVIT-menyen. */}
          <label class="settings-row">
            <span>Tema</span>
            <span class="fvmenu-seg" id="fv-theme" role="group" aria-label="Tema">
              <button type="button" class="fvmenu-segBtn" data-theme="system" aria-pressed="false">
                System
              </button>
              <button type="button" class="fvmenu-segBtn" data-theme="light" aria-pressed="false">
                Lys
              </button>
              <button type="button" class="fvmenu-segBtn" data-theme="dark" aria-pressed="false">
                Mørk
              </button>
            </span>
          </label>
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.accountSync')}</legend>
          {user ? (
            user.plus ? (
              <>
                <p class="settings-account">
                  Innlogget som <strong>{user.displayName || user.email}</strong> (FLOGVIT.plus).{' '}
                  <a href={ACCOUNT_URL}>{t('u.manageAccount')}</a>
                </p>
                <p class="settings-sync" data-sync-status>
                  Synkronisering er på — favoritter, notater og innstillinger lagres til kontoen din.
                </p>
              </>
            ) : (
              <>
                <p class="settings-account">
                  Innlogget som <strong>{user.displayName || user.email}</strong>.{' '}
                  <a href={ACCOUNT_URL}>{t('u.manageAccount')}</a>
                </p>
                <p class="settings-sync">
                  Husking — lagring av favoritter, notater m.m., både i nettleseren og mellom
                  enheter — er en del av <a href="https://flogvit.com/plus/">FLOGVIT.plus</a>.
                </p>
              </>
            )
          ) : (
            <p class="settings-account">
              {t('u.notLoggedIn')}{' '}
              <a href={ACCOUNT_URL}>FLOGVIT-konto</a> med{' '}
              <a href="https://flogvit.com/plus/">FLOGVIT.plus</a>.
            </p>
          )}
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.text')}</legend>
          <label class="settings-row">
            <span>{t('u.fontSize')}</span>
            <select data-setting="fontSize" class="user-input">
              <option value="small">{t('u.small')}</option>
              <option value="medium">{t('u.medium')}</option>
              <option value="large">{t('u.large')}</option>
            </select>
          </label>
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.readTracking')}</legend>
          <label class="settings-row">
            <span>{t('u.readTrackingMode')}</span>
            <select data-setting="readTracking" class="user-input">
              <option value="suggest">{t('u.readTrackingSuggest')}</option>
              <option value="auto">{t('u.readTrackingAuto')}</option>
              <option value="manual">{t('u.readTrackingManual')}</option>
            </select>
          </label>
          <p class="settings-hint">{t('u.readTrackingHint')}</p>
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.translationAndNumbering')}</legend>
          {/* Utgavene kommer fra bible_editions, ikke fra en liste her (#28).
              Hardkodet osnb/osnn betydde at OSEN aldri dukket opp — og at
              enhver ny oversettelse ville krevd en kodeendring, stikk i strid
              med hele poenget med tabellen. */}
          <label class="settings-row">
            <span>{t('u.bibleEdition')}</span>
            <select data-setting="bible" class="user-input" data-proper-names>
              {readable.map((e) => (
                <option value={e.id}>{editionLabel(e)}</option>
              ))}
            </select>
          </label>
          <label class="settings-row">
            <span>{t('u.secondaryText')}</span>
            <select data-setting="secondaryBible" class="user-input" data-proper-names>
              <option value="">{t('common.none')}</option>
              <option value="original">{t('u.originalText')}</option>
              {readable.map((e) => (
                <option value={e.id}>{editionLabel(e)}</option>
              ))}
            </select>
          </label>
          {mappings.length > 0 && (
            <label class="settings-row">
              <span>{t('u.versification')}</span>
              {/* Uten en standardoppføring vant den ALFABETISK første, så
                  «aceh» sto som brukerens valg — og ble skrevet inn i
                  innstillingene ved første lagring på siden (#27).
                  Versnummerering er en overstyring, ikke et valg de fleste
                  skal ta, så tom verdi = følg utgaven. */}
              <select data-setting="verseMapping" class="user-input" data-proper-names>
                <option value="">{t('u.followsEdition')}</option>
                {mappings.map((m) => (
                  <option value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </label>
          )}
          <p class="user-note">
            {t('u.textDefaults')}
          </p>
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('nav.translations')}</legend>
          <p class="user-note">
            {t('u.bibleVisibility')} <a href={lhref('/oversettelser')}>{t('nav.translations')}</a>-siden.
          </p>
          <div data-bible-visibility>
            <p class="user-note">{t('common.loading')}</p>
          </div>
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.display')}</legend>
          <label class="settings-row">
            <span>{t('u.defaultView')}</span>
            <select data-setting="layoutMode" class="user-input">
              <option value="normal">{t('u.normal')}</option>
              <option value="reading">{t('u.readingMode')}</option>
              <option value="panel">{t('u.panelMode')}</option>
            </select>
          </label>
          {/* Løkkevariabelen het `t` og skygget oversetteren — derfor kunne
              etikettene aldri ha vært annet enn hardkodet her (#22). */}
          {TOGGLE_KEYS.map((key) => (
            <label class="settings-toggle">
              <input type="checkbox" data-setting={key} />
              <span>{t(`set.${key}`)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.searchResults')}</legend>
          <p class="user-note">{t('set.searchTypesHelp')}</p>
          {SEARCH_TYPE_TOGGLES.map((type) => (
            <label class="settings-toggle">
              <input type="checkbox" data-setting={`searchResultTypes.${type.key}`} />
              <span>{t(type.label)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('u.yourData')}</legend>
          <div class="settings-data-buttons">
            <button type="button" class="user-btn" data-export-data>
              Eksporter alt (JSON)
            </button>
            <label class="user-btn-ghost settings-import-label">
              {t('u.importFromFile')}
              <input type="file" accept="application/json,.json" data-import-data hidden />
            </label>
          </div>
          <p class="user-note" data-data-status>
            Eksporten inneholder favoritter, notater, emner, verslister, manuskripter, leseplan og
            innstillinger.
          </p>
        </fieldset>
      </form>
    </UserPage>,
  );
});

// ---------- /offline ----------
r.get('/offline', (c) => {
  const t = tFor(c);
  return c.html(
    <UserPage {...layoutProps(c)}
      title="Offline"
      crumb="Offline"
      heading="Offline-tilgang"
      page="offline"
      intro={t('u.offlineIntro')}
      styles={['offline.css']}
      scripts={['offline.js']}
    >
      <section class="offline-section">
        <h2>Status</h2>
        <div data-offline-status class="offline-status">
          <p>{t('u.checkingStorage')}</p>
        </div>
      </section>

      <section class="offline-section">
        <h2>{t('u.download')}</h2>
        <div class="offline-download" data-offline-download>
          <label class="settings-toggle">
            <input type="checkbox" data-dl-bible="osnb" checked /> <span>OSNB (bokmål)</span>
          </label>
          <label class="settings-toggle">
            <input type="checkbox" data-dl-bible="osnn" /> <span>OSNN (nynorsk)</span>
          </label>
          <div class="offline-actions">
            <button type="button" class="user-btn" data-dl-start>{t('u.downloadOffline')}</button>
            <button type="button" class="user-btn-ghost" data-dl-pause hidden>Pause</button>
          </div>
          <div class="offline-progress" data-dl-progress hidden>
            <div class="offline-progress-bar"><div class="offline-progress-fill" data-dl-fill></div></div>
            <p class="user-note" data-dl-text></p>
          </div>
        </div>
        <p class="user-note">{t('u.offlineNote')}</p>
      </section>

      <section class="offline-section">
        <h2>{t('u.downloadedContent')}</h2>
        <div data-offline-content>
          <p class="user-note">{t('common.loading')}</p>
        </div>
        <div class="offline-actions">
          <button type="button" class="user-btn-ghost" data-dl-clear>{t('u.deleteDownloaded')}</button>
        </div>
      </section>
      <noscript>
        <p class="user-note">{t('u.offlineNeedsJs')}</p>
      </noscript>
    </UserPage>,
  );
});

// ---------- /oversettelser ----------
// «Innebygde» kommer fra bible_editions (fylt av importøren for hver oversettelse
// vi henter tekst for), ikke fra en hardkodet liste — en ny oversettelse dukker
// opp her og får info-side under /oversettelser/:id av seg selv.
r.get('/oversettelser', async (c) => {
  const t = tFor(c);
  const editions = await getBibleEditions();

  return c.html(
    <UserPage {...layoutProps(c)}
      title={t('nav.translations')}
      crumb={t('nav.translations')}
      heading={t('nav.translations')}
      page="translations"
      intro={t('tr.intro')}
      styles={['translations.css']}
      scripts={['translations.js']}
    >
      <section class="trans-section">
        <h2>{t('u.builtIn')}</h2>
        <ul class="trans-builtin">
          {editions.map((e) => (
            <li>
              <a href={lhref(`/oversettelser/${e.id}`)}>
                {e.name_native}
                {e.abbreviation ? ` (${e.abbreviation})` : ''}
              </a>
              {e.license_name ? <span class="trans-license"> {e.license_name}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section class="trans-section">
        <h2>{t('u.yourTranslations')}</h2>
        <div class="user-list" data-trans-list></div>
        <p class="user-empty" data-trans-empty hidden>{t('tr.noneUploaded')}</p>
      </section>

      <section class="trans-section" data-trans-upload>
        <h2>{t('u.uploadNew')}</h2>
        {/* Plus-kravet står FØR skjemaet, ikke i porten på siste steg (#29).
            Porten i translations.js står der fortsatt og er uendret — dette
            er ikke en innstramming, bare at brukeren får vite det før hen
            velger fil og venter på analysen. */}
        <p class="user-note trans-plus-notice">{t('u.uploadPlusNotice')}</p>
        <p class="user-note">
          {t('u.uploadHelp')}
        </p>
        <div class="trans-form">
          <label class="settings-row">
            <span>{t('u.versification')}</span>
            <select class="user-input" data-trans-mapping></select>
          </label>
          <label class="settings-row">
            <span>{t('u.name')}</span>
            <input type="text" class="user-input" data-trans-name placeholder={t('u.transNamePh')} />
          </label>
          <div class="trans-file-row">
            <label class="user-btn-ghost settings-import-label">
              {t('u.chooseFile')}
              <input type="file" accept=".txt,.text,text/plain" data-trans-file hidden />
            </label>
            <span class="user-note" data-trans-filename></span>
          </div>
          <textarea class="user-input trans-textarea" data-trans-text rows={6} placeholder={t('u.transPastePh')}></textarea>
          <div class="offline-actions">
            <button type="button" class="user-btn" data-trans-parse>{t('u.analyseText')}</button>
            <button type="button" class="user-btn" data-trans-import hidden>{t('u.import')}</button>
          </div>
          <div data-trans-result hidden></div>
          <div class="offline-progress" data-trans-progress hidden>
            <div class="offline-progress-bar"><div class="offline-progress-fill" data-trans-fill></div></div>
          </div>
        </div>
      </section>
      <noscript>
        <p class="user-note">{t('u.uploadNeedsJs')}</p>
      </noscript>
    </UserPage>,
  );
});

export default r;
