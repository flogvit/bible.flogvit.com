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
import { getUserItems, getUserSingleton } from '../../lib/user-data.ts';
import { getBibleEditions } from '../../lib/bible.ts';
import { getAvailableMappings } from '../../lib/verse-mapper.ts';
import { layoutProps, makeT, tFor, type Locale } from '../../lib/i18n.ts';

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
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: props.crumb }]} />
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
                AND v.verse = ${f.verse} AND v.bible = 'osnb2'
            `) as { text: string; name_no: string; short_name: string }[];
            if (!v) return null;
            return {
              href: `/${v.short_name.toLowerCase()}/${f.chapter}#v${f.verse}`,
              ref: `${v.name_no} ${f.chapter}:${f.verse}`,
              text: v.text,
            };
          }),
      )
    ).filter((x): x is NonNullable<typeof x> => x !== null);
  }
  return c.html(
    <UserPage {...layoutProps(c)} title={t('nav.favorites')} crumb={t('nav.favorites')} heading={t('u.favVerses')} page="favorites" intro="Dine merkede vers. Husking er en del av FLOGVIT.plus.">
      <div class="user-list" data-list>
        {cards.map((card) => (
          <a class="user-card" href={card.href}>
            <span class="user-card-ref">{card.ref}</span>
            <p class="user-card-text">{card.text}</p>
          </a>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={cards.length > 0}>Du har ingen favoritter ennå. Klikk hjertet på et vers for å legge det til.</p>
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
    <UserPage {...layoutProps(c)} title={t('nav.topicsMine')} crumb={t('nav.topicsMine')} heading={t('nav.topicsMine')} page="topics" intro="Egne emner du har tagget vers, personer og annet innhold med.">
      <div class="user-list" data-list>
        {topics.map((t) => (
          <div class="user-card">
            <span class="user-card-title">{t.name}</span>
            <span class="user-card-meta">{t.count} merket</span>
          </div>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={topics.length > 0}>Du har ingen emner ennå. Tag innhold med «Emner»-knappen på vers- og innholdssider.</p>
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
    <UserPage {...layoutProps(c)} title={t('nav.notes')} crumb={t('nav.notes')} heading={t('nav.notes')} page="notes" intro="Dine notater på vers.">
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
    <UserPage {...layoutProps(c)} title={t('nav.verseLists')} crumb={t('nav.verseLists')} heading={t('nav.verseLists')} page="verselists" intro="Samle vers i navngitte lister for manuskripter, bibeltimer og studier.">
      <form class="user-create" data-create-list>
        <input type="text" name="name" placeholder={t('u.newListPh')} aria-label="Navn på liste" class="user-input" />
        <button type="submit" class="user-btn">{t('u.createList')}</button>
      </form>
      <div class="user-list" data-list>
        {lists.map((l) => (
          <div class="user-card">
            <span class="user-card-title">{l.name}</span>
            <span class="user-card-meta">{(l.refs ?? []).length} vers</span>
          </div>
        ))}
      </div>
      <p class="user-empty" data-empty hidden={lists.length > 0}>{t('u.noLists')}</p>
    </UserPage>,
  );
});

// ---------- /leseplan ----------
r.get('/leseplan', async (c) => {
  const t = tFor(c);
  const plans = (await getSql()`
    SELECT id, name, description, category, days FROM reading_plans ORDER BY days, seq
  `) as { id: string; name: string; description: string | null; category: string | null; days: number }[];
  const user = c.var.user;
  const activePlan = user?.plus ? await getUserSingleton<string>(user.id, 'activePlan') : null;

  return c.html(
    <Layout {...layoutProps(c)} title={`${t('home.readingPlans')} — FLOGVIT.bible`} description="Ulike planer for systematisk bibellesing." styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Leseplan' }]} />
          <h1>{t('home.readingPlans')}</h1>
          <p class="user-intro">
            Velg en plan for systematisk bibellesing. Fremdrift og rekke lagres i nettleseren og
            husking er en del av FLOGVIT.plus.
          </p>
          <div data-user-page="readingplan">
            <div class="plan-grid">
              {plans.map((p) => (
                <div class="plan-card" data-plan-id={p.id} data-plan-days={p.days}>
                  <h2 class="plan-name">{p.name}</h2>
                  {p.description && <p class="plan-desc">{p.description}</p>}
                  <div class="plan-meta">
                    <span class="plan-days">{p.days} dager</span>
                    {p.category && <span class="plan-cat">{p.category}</span>}
                  </div>
                  <div class="plan-actions">
                    <button type="button" class="user-btn plan-activate" data-plan={p.id}>
                      {activePlan === p.id ? 'Aktiv plan' : 'Velg denne'}
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
    <UserPage {...layoutProps(c)} title={t('nav.manuscripts')} crumb={t('nav.manuscripts')} heading={t('nav.manuscripts')} page="devotionals" intro="Andakter, prekener og bibeltimer med versreferanser." wide>
      <div class="user-toolbar">
        <a href="/manuskripter/ny" class="user-btn">{t('u.newManuscript')}</a>
      </div>
      <div class="user-list" data-list>
        {devs.map((d) => (
          <a class="user-card" href={`/manuskripter/${d.slug}`}>
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
    <Layout locale={props.locale} path={props.path} title={`${t('u.editManuscript')} — FLOGVIT.bible`} description="Skriv andakt, preken eller bibeltime." styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Manuskripter', href: '/manuskripter' }, { label: props.slug ? 'Rediger' : 'Nytt' }]} />
          <h1 class="sr-only">{props.slug ? 'Rediger manuskript' : 'Nytt manuskript'}</h1>
          <div data-user-page="devotional-editor" data-slug={props.slug || ''}>
            <div class="editor-head">
              <input type="text" data-editor-title placeholder={t('u.titlePh')} class="user-input editor-title" aria-label="Tittel" />
              <div class="editor-actions">
                <button type="button" class="user-btn" data-editor-save>{t('common.save')}</button>
                <a href="/manuskripter" class="user-btn-ghost">{t('common.cancel')}</a>
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
    <Layout {...layoutProps(c)} title={`${t('nav.manuscripts')} — FLOGVIT.bible`} description="Manuskript." styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Manuskripter', href: '/manuskripter' }, { label: '…' }]} />
          <div data-user-page="devotional-view" data-slug={c.req.param('slug')}>
            <article class="devotional-article" data-article></article>
            <p class="user-empty" data-empty hidden>{t('u.manuscriptNotFound')}</p>
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /innstillinger ----------
const TOGGLES: { key: string; label: string }[] = [
  { key: 'showBookSummary', label: 'Vis boksammendrag' },
  { key: 'showChapterSummary', label: 'Vis kapittelsammendrag' },
  { key: 'showChapterContext', label: 'Vis historisk kontekst' },
  { key: 'showChapterInsights', label: 'Vis kapittelinnsikter' },
  { key: 'showImportantWords', label: 'Vis viktige ord i sidepanelet' },
  { key: 'showVerseDetails', label: 'Åpne versdetaljer ved klikk på vers' },
  { key: 'showWord4Word', label: 'Vis ord-for-ord (grunntekst)' },
  { key: 'showOriginalText', label: 'Vis grunntekst under vers' },
  { key: 'showTimeline', label: 'Vis tidslinje i sidepanel' },
  { key: 'showParallels', label: 'Vis parallelle tekster' },
  { key: 'showDailyVerse', label: 'Vis dagens vers på forsiden' },
  { key: 'showTodaysDay', label: 'Vis dagens helligdag på forsiden' },
  { key: 'showReadingTexts', label: 'Vis dagens lesetekst på forsiden' },
  { key: 'showVerseFootnotes', label: 'Vis fotnoter' },
  { key: 'copyVerseNumbers', label: 'Ta med versnummer ved kopiering' },
  { key: 'showContinueReading', label: 'Vis «fortsett lesing» på forsiden' },
];

// Søkeresultat-typer (GitHub #2) — samme nøkler som gamle appen
// (bible-settings.searchResultTypes.*, default på).
const SEARCH_TYPE_TOGGLES: { key: string; label: string }[] = [
  { key: 'stories', label: 'Bibelhistorier' },
  { key: 'themes', label: 'Temaer' },
  { key: 'persons', label: 'Personer' },
  { key: 'prophecies', label: 'Profetier' },
  { key: 'timeline', label: 'Tidslinje' },
  { key: 'parallels', label: 'Evangelieparalleller' },
  { key: 'plans', label: 'Leseplaner' },
  { key: 'words', label: 'Viktige ord' },
  { key: 'numberSymbolism', label: 'Tall' },
  { key: 'days', label: 'Dager' },
];
r.get('/innstillinger', (c) => {
  const t = tFor(c);
  const user = c.var.user;
  const mappings = getAvailableMappings();
  return c.html(
    <UserPage {...layoutProps(c)} title={t('chrome.settings')} crumb={t('chrome.settings')} heading={t('chrome.settings')} page="settings" intro="Lagres i nettleseren; innlogget synker de mot kontoen din.">
      <form data-settings-form class="settings-form">
        <fieldset class="settings-group">
          <legend>Utseende</legend>
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
          <legend>Konto og synkronisering</legend>
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
              Du er ikke innlogget. Husking — lagring av favoritter, notater m.m. — krever{' '}
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
          <legend>{t('u.translationAndNumbering')}</legend>
          <label class="settings-row">
            <span>{t('u.bibleEdition')}</span>
            <select data-setting="bible" class="user-input">
              <option value="osnb2">OSNB2 (bokmål)</option>
              <option value="osnn1">OSNN1 (nynorsk)</option>
            </select>
          </label>
          <label class="settings-row">
            <span>{t('u.secondaryText')}</span>
            <select data-setting="secondaryBible" class="user-input">
              <option value="">{t('common.none')}</option>
              <option value="original">{t('u.originalText')}</option>
              <option value="osnb2">OSNB2 (bokmål)</option>
              <option value="osnn1">OSNN1 (nynorsk)</option>
            </select>
          </label>
          {mappings.length > 0 && (
            <label class="settings-row">
              <span>{t('u.versification')}</span>
              <select data-setting="verseMapping" class="user-input">
                {mappings.map((m) => (
                  <option value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </label>
          )}
          <p class="user-note">
            Valgene brukes som standard på lesesidene; knappene på selve siden overstyrer for
            økten.
          </p>
        </fieldset>
        <fieldset class="settings-group">
          <legend>{t('nav.translations')}</legend>
          <p class="user-note">
            Velg hvilke oversettelser som vises i bibelvelgeren på lesesidene. Egne bibler lastes
            opp på <a href="/oversettelser">{t('nav.translations')}</a>-siden.
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
              <option value="reading">Lesemodus</option>
              <option value="panel">Panelmodus</option>
            </select>
          </label>
          {TOGGLES.map((t) => (
            <label class="settings-toggle">
              <input type="checkbox" data-setting={t.key} />
              <span>{t.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset class="settings-group">
          <legend>Søkeresultater</legend>
          <p class="user-note">Velg hvilke resultattyper som vises på søkesiden i tillegg til bibelteksten.</p>
          {SEARCH_TYPE_TOGGLES.map((t) => (
            <label class="settings-toggle">
              <input type="checkbox" data-setting={`searchResultTypes.${t.key}`} />
              <span>{t.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset class="settings-group">
          <legend>Dine data</legend>
          <div class="settings-data-buttons">
            <button type="button" class="user-btn" data-export-data>
              Eksporter alt (JSON)
            </button>
            <label class="user-btn-ghost settings-import-label">
              Importer fra fil
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
      intro="Last ned bibeltekst og støttedata for lesing uten internett. Nedlasting er en del av FLOGVIT.plus."
      styles={['offline.css']}
      scripts={['offline.js']}
    >
      <section class="offline-section">
        <h2>Status</h2>
        <div data-offline-status class="offline-status">
          <p>Sjekker lagringsstatus…</p>
        </div>
      </section>

      <section class="offline-section">
        <h2>Last ned</h2>
        <div class="offline-download" data-offline-download>
          <label class="settings-toggle">
            <input type="checkbox" data-dl-bible="osnb2" checked /> <span>OSNB2 (bokmål)</span>
          </label>
          <label class="settings-toggle">
            <input type="checkbox" data-dl-bible="osnn1" /> <span>OSNN1 (nynorsk)</span>
          </label>
          <div class="offline-actions">
            <button type="button" class="user-btn" data-dl-start>Last ned for offline-bruk</button>
            <button type="button" class="user-btn-ghost" data-dl-pause hidden>Pause</button>
          </div>
          <div class="offline-progress" data-dl-progress hidden>
            <div class="offline-progress-bar"><div class="offline-progress-fill" data-dl-fill></div></div>
            <p class="user-note" data-dl-text></p>
          </div>
        </div>
        <p class="user-note">
          Nedlastingen henter alle 1189 kapitler per valgt oversettelse (med grunntekst, ord-for-ord
          og kryssreferanser) pluss tidslinje, profetier, personer og leseplaner. Regn med noen
          minutter og et par hundre MB lagringsplass.
        </p>
      </section>

      <section class="offline-section">
        <h2>Nedlastet innhold</h2>
        <div data-offline-content>
          <p class="user-note">{t('common.loading')}</p>
        </div>
        <div class="offline-actions">
          <button type="button" class="user-btn-ghost" data-dl-clear>Slett nedlastet innhold</button>
        </div>
      </section>
      <noscript>
        <p class="user-note">Offline-nedlasting krever JavaScript.</p>
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
      title="Oversettelser"
      crumb="Oversettelser"
      heading="Oversettelser"
      page="translations"
      intro="Innebygde oversettelser og dine egne opplastede bibler."
      styles={['translations.css']}
      scripts={['translations.js']}
    >
      <section class="trans-section">
        <h2>Innebygde</h2>
        <ul class="trans-builtin">
          {editions.map((e) => (
            <li>
              <a href={`/oversettelser/${e.id}`}>
                {e.name_native}
                {e.abbreviation ? ` (${e.abbreviation})` : ''}
              </a>
              {e.license_name ? <span class="trans-license"> {e.license_name}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section class="trans-section">
        <h2>Dine oversettelser</h2>
        <div class="user-list" data-trans-list></div>
        <p class="user-empty" data-trans-empty hidden>Du har ikke lastet opp egne oversettelser ennå.</p>
      </section>

      <section class="trans-section" data-trans-upload>
        <h2>Last opp ny</h2>
        <p class="user-note">
          Last opp en tekstfil (eller lim inn) der hver linje er «Boknavn kapittel,vers tekst», f.eks.
          «1 Mos 1,1 I begynnelsen skapte Gud himmelen og jorden.» Ulike oversettelser kan ha
          forskjellig versinndeling — velg riktig nummerering, så kobles versene til kryssreferanser
          og verktøy automatisk.
        </p>
        <div class="trans-form">
          <label class="settings-row">
            <span>{t('u.versification')}</span>
            <select class="user-input" data-trans-mapping></select>
          </label>
          <label class="settings-row">
            <span>Navn</span>
            <input type="text" class="user-input" data-trans-name placeholder="F.eks. Bibelen 2024" />
          </label>
          <div class="trans-file-row">
            <label class="user-btn-ghost settings-import-label">
              Velg fil
              <input type="file" accept=".txt,.text,text/plain" data-trans-file hidden />
            </label>
            <span class="user-note" data-trans-filename></span>
          </div>
          <textarea class="user-input trans-textarea" data-trans-text rows={6} placeholder="…eller lim inn teksten her"></textarea>
          <div class="offline-actions">
            <button type="button" class="user-btn" data-trans-parse>Analyser tekst</button>
            <button type="button" class="user-btn" data-trans-import hidden>Importer</button>
          </div>
          <div data-trans-result hidden></div>
          <div class="offline-progress" data-trans-progress hidden>
            <div class="offline-progress-bar"><div class="offline-progress-fill" data-trans-fill></div></div>
          </div>
        </div>
      </section>
      <noscript>
        <p class="user-note">Opplasting av egne oversettelser krever JavaScript.</p>
      </noscript>
    </UserPage>,
  );
});

export default r;
