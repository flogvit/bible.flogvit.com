// Forside (/) + søk (/sok, /sok/original). Portert fra HomeContent/HomeHero/
// BookCategories/DiscoverGrid + SearchPage/OriginalSearchPage.
// Forsiden er SSR: dagens vers + bøker + utforsk + dagens lesetekst hentes
// server-side; «Fortsett å lese» og aktiv leseplan (localStorage) legges på av
// home.js-øya. Søk er SSR via ?q= (GET-skjema) med enkel paginering.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import {
  searchVerses,
  searchOriginalWord,
  getTodaysReadingTexts,
  getTodaysDays,
  searchStories,
  searchThemes,
  searchPersons,
  searchProphecies,
  searchTimelineEvents,
  searchGospelParallels,
  searchReadingPlans,
  searchImportantWords,
  searchNumberSymbolism,
  searchDays,
  getDailyVerse,
  type DayReference,
  type VerseRange,
  normalizeBibleId,
  defaultBibleForLanguage,
} from '../../lib/bible.ts';
import { readingTypeKey } from '../../lib/reading-text-enrich.ts';
import {
  booksData, getBookInfoById, bookName, bookNameById, bookNameByShort, bookAbbrById, type BookInfo,
} from '../../lib/books-data.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
import { layoutProps, tFor, type Translator, lhref, islandStrings, tEnum } from '../../lib/i18n.ts';
import { tCtx } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

// ---------- forside ----------

const bookGroups = (t: Translator): { label: string; books: BookInfo[] }[] => [
  { label: t('grp.pentateuch'), books: booksData.filter((b) => b.id >= 1 && b.id <= 5) },
  { label: t('grp.historical'), books: booksData.filter((b) => b.id >= 6 && b.id <= 17) },
  { label: t('grp.poetic'), books: booksData.filter((b) => b.id >= 18 && b.id <= 22) },
  { label: t('grp.prophets'), books: booksData.filter((b) => b.id >= 23 && b.id <= 39) },
  { label: t('grp.gospels'), books: booksData.filter((b) => b.id >= 40 && b.id <= 44) },
  { label: t('grp.pauline'), books: booksData.filter((b) => b.id >= 45 && b.id <= 57) },
  { label: t('grp.other'), books: booksData.filter((b) => b.id >= 58 && b.id <= 66) },
];

const discover = (t: Translator): { to: string; title: string; desc: string }[] => [
  { to: '/tidslinje', title: t('nav.timeline'), desc: t('disc.timeline') },
  { to: '/personer', title: t('nav.persons'), desc: t('disc.persons') },
  { to: '/profetier', title: t('nav.prophecies'), desc: t('disc.prophecies') },
  { to: '/temaer', title: t('nav.themes'), desc: t('disc.themes') },
  { to: '/paralleller', title: t('nav.parallels'), desc: t('disc.parallels') },
  { to: '/manuskripter', title: t('nav.manuscripts'), desc: t('disc.manuscripts') },
  { to: '/historier', title: t('nav.stories'), desc: t('disc.stories') },
  { to: '/tall', title: t('nav.numbers'), desc: t('disc.numbers') },
  { to: '/lesetekster', title: t('nav.readingTexts'), desc: t('disc.readingTexts') },
  { to: '/kjente-vers', title: t('nav.knownVerses'), desc: t('disc.knownVerses') },
  { to: '/lister', title: t('nav.verseLists'), desc: t('disc.verseLists') },
  { to: '/favoritter', title: t('nav.favorites'), desc: t('disc.favorites') },
  { to: '/emner', title: t('nav.topicsMine'), desc: t('disc.topics') },
  { to: '/notater', title: t('nav.notes'), desc: t('disc.notes') },
  { to: '/statistikk', title: t('nav.statistics'), desc: t('disc.statistics') },
  { to: '/oversettelser', title: t('nav.translations'), desc: t('disc.translations') },
];

/**
 * Ikon per utforsk-kort, portert fra gamle DiscoverGrid. Uten dem leser
 * rutenettet som en lenkeliste framfor en meny (#37). Nøkkelen er stien, så et
 * kort uten ikon rendrer stille uten — det er ikke verdt en byggefeil.
 */
const DISCOVER_ICONS: Record<string, () => unknown> = {
  '/tidslinje': () => (<><path d="M3 12l9-9 9 9-9 9z" /><path d="M12 3v18" /></>),
  '/personer': () => (<><circle cx="12" cy="8" r="4" /><path d="M4 22c0-4 4-7 8-7s8 3 8 7" /></>),
  '/profetier': () => (<path d="M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z" />),
  '/temaer': () => (<path d="M4 19h16M6 19V5h4v14M14 19V9h4v10" />),
  '/paralleller': () => (<><path d="M4 6h16v12H4z" /><path d="M4 10h16M9 6v12" /></>),
  '/manuskripter': () => (<><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h6" /></>),
  '/historier': () => (<><path d="M4 4h16v16H4z" /><path d="M4 8h16M8 4v16" /></>),
  '/tall': () => (<path d="M8 4v16M16 4v16M4 9h16M4 15h16" />),
  '/lesetekster': () => (<><path d="M2 4h7a4 4 0 0 1 4 4v13" /><path d="M22 4h-7a4 4 0 0 0-4 4v13" /></>),
  '/kjente-vers': () => (<path d="M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 9l6-1z" />),
  '/lister': () => (<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01" />),
  '/favoritter': () => (<path d="M19 14c-3 4-7 7-7 7s-4-3-7-7-3-8 0-10 6-1 7 2c1-3 4-4 7-2s3 6 0 10z" />),
  '/emner': () => (<><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V5a2 2 0 0 1 2-2h8l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="8" cy="8" r="1.5" /></>),
  '/notater': () => (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  '/statistikk': () => (<><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" /></>),
  '/oversettelser': () => (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>),
};

function DiscoverIcon({ to }: { to: string }) {
  const draw = DISCOVER_ICONS[to];
  if (!draw) return null;
  return (
    <svg class="home-disc-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" aria-hidden="true">
      {draw() as never}
    </svg>
  );
}

function dayRefLabel(ref: DayReference): string {
  const name = bookNameById(ref.bookId);
  if (!name) return `${ref.chapterId}:${ref.fromVerseId}`;
  return ref.fromVerseId === ref.toVerseId
    ? `${name} ${ref.chapterId}:${ref.fromVerseId}`
    : `${name} ${ref.chapterId}:${ref.fromVerseId}-${ref.toVerseId}`;
}

function dayRefUrl(ref: DayReference): string {
  const book = getBookInfoById(ref.bookId);
  return `/${book ? toUrlSlug(book.short_name) : ''}/${ref.chapterId}#v${ref.fromVerseId}`;
}

/** Kompakt referanse for en lesetekst-del: «Jer 1:17-19». */
function rangeLabel(range: VerseRange): string {
  const abbr = bookAbbrById(range.book_id);
  const end = range.verse_end && range.verse_end !== range.verse_start ? `-${range.verse_end}` : '';
  return `${abbr} ${range.chapter}:${range.verse_start}${end}`.trim();
}

function rangeUrl(range: VerseRange): string {
  const book = getBookInfoById(range.book_id);
  return `/${book ? toUrlSlug(book.short_name) : ''}/${range.chapter}#v${range.verse_start}`;
}

/** Strengene forside-øya bygger DOM med. Serveren oversetter, øya substituerer. */
const HOME_ISLAND_KEYS = [
  'home.continueReading', 'home.stoppedAtVerse', 'home.continueAtVerse', 'home.nextChapter',
  'home.clearPosition', 'home.nowReading', 'home.addFavorite', 'home.removeFavorite',
  'home.showMore', 'home.showLess', 'home.expandVerse', 'home.collapseVerse',
  'home.readingPlans', 'home.oneActive', 'home.noneActive', 'home.newPlan',
  'home.dayOf', 'home.daysInARow', 'home.todayLabel', 'home.choosePlan', 'home.noPlanYet',
] as const;

r.get('/', async (c) => {
  const t = tFor(c);
  const verse = await getDailyVerse();
  const todaysReading = await getTodaysReadingTexts();
  const todaysDays = await getTodaysDays();
  const strings = islandStrings(t, HOME_ISLAND_KEYS);

  const verseRange = verse && verse.verseEnd !== verse.verseStart
    ? `${verse.verseStart}-${verse.verseEnd}` : `${verse?.verseStart}`;

  return c.html(
    <Layout {...layoutProps(c)}
      title={`FLOGVIT.bible — ${t('home.metaTitle')}`}
      description={t('home.metaDesc')}
      styles={['home.css']}
      scripts={['home.js']}
    >
      <div class="home-wrap">
        <div class="home-hero">
          {/* Fortsett/velkommen — home.js bytter til «Fortsett å lese» hvis
              leseposisjon finnes i localStorage. */}
          <div class="home-continue" id="home-continue" data-state="welcome" data-strings={strings}>
            <div>
              <div class="eyebrow">{t('home.welcome')}</div>
              <h1 class="home-continue-title">{t('home.bible')}</h1>
              <div class="home-continue-sub">
                {t('home.startHint')}
              </div>
            </div>
            <div class="home-actions">
              <a href={lhref('/1mos/1')} class="home-btn home-btn-primary">{t('home.startGenesis')}</a>
              <a href={lhref('/joh/1')} class="home-btn home-btn-ghost">{t('home.orJohn')}</a>
            </div>
          </div>

          <div class="home-side">
            <div class="home-card home-vod" data-setting-show="showDailyVerse" data-strings={strings}>
              <h3>{t('home.verseOfDay')}</h3>
              {verse ? (
                <>
                  {/* Klippingen er CSS; home.js legger på «vis mer» først når
                      teksten faktisk flommer over. */}
                  <div class="home-vod-scroll" id="home-vod-scroll">
                    <p class="home-vod-text">«{verse.text}»</p>
                  </div>
                  <div class="home-vod-foot">
                    <div class="home-vod-ref">
                      <a href={lhref(`/${toUrlSlug(verse.shortName)}/${verse.chapter}#v${verse.verseStart}`)}>
                        {bookNameByShort(verse.shortName)} {verse.chapter}:{verseRange}
                      </a>
                      {verse.note && <span class="home-vod-note"> · {verse.note}</span>}
                    </div>
                    {/* Favorittknappen fylles av home.js: uten JS ville den vært
                        en knapp som ikke gjør noe. */}
                    <div class="home-vod-actions" id="home-vod-actions"
                      data-book-id={verse.bookId} data-chapter={verse.chapter} data-verse={verse.verseStart} />
                  </div>
                </>
              ) : (
                <div class="home-vod-empty">{t('home.noVerseToday')}</div>
              )}
            </div>

            {/* Aktiv leseplan fylles av home.js fra lagret plan + framdrift. */}
            <div class="home-card home-plans" id="home-plans" data-strings={strings}
              data-plan-href={lhref('/leseplan')}>
              <div class="home-plans-head">
                <h3>{t('home.readingPlans')}</h3>
                <span class="home-plans-count">{t('home.noneActive')}</span>
              </div>
              <div class="home-plans-empty">
                <p>{t('home.noPlanYet')}</p>
                <a href={lhref('/leseplan')} class="home-plans-btn">{t('home.choosePlan')}</a>
              </div>
            </div>
          </div>
        </div>

        {todaysDays.length > 0 && (
          <div class="home-todays-days" data-setting-show="showTodaysDay">
            {todaysDays.map((day) => (
              <div class="home-todays-day">
                <div class="home-todays-day-head">
                  <h3>
                    <a href={lhref(`/dager/${day.id}`)}>{day.name}</a>
                  </h3>
                  <span class="home-todays-day-cat">{tEnum(t, 'day.cat.', day.category)}</span>
                </div>
                <p class="home-todays-day-desc">{day.description}</p>
                {(day.references ?? []).length > 0 && (
                  <div class="home-todays-day-refs">
                    <span class="home-todays-day-reflabel">{t('home.todaysTexts')}</span>
                    {(day.references ?? [])
                      .filter((ref) => ref.relevance === 'primary')
                      .map((ref) => (
                        <a href={lhref(dayRefUrl(ref))} class="home-todays-day-ref">{dayRefLabel(ref)}</a>
                      ))}
                    {(day.references ?? [])
                      .filter((ref) => ref.relevance === 'secondary')
                      .map((ref) => (
                        <a href={lhref(dayRefUrl(ref))} class="home-todays-day-ref is-secondary">{dayRefLabel(ref)}</a>
                      ))}
                  </div>
                )}
                <a href={lhref(`/dager/${day.id}`)} class="home-todays-day-more">
                  {t('home.readMoreAbout', { name: day.name })}
                </a>
              </div>
            ))}
          </div>
        )}

        {todaysReading.length > 0 && (
          <div class="home-lesetekster" data-setting-show="showReadingTexts">
            {todaysReading.map((text) => (
              <div class="home-todays-reading">
                <div class="home-todays-eyebrow">
                  {t('home.lectionary')}
                  {text.series ? ` · ${t('home.lectionarySeries', { series: text.series })}` : ''}
                </div>
                <h3>
                  <a href={lhref(`/lesetekster/${text.date}`)}>{text.name}</a>
                </h3>
                {/* Selve lesningene: uten dem er kortet bare et navn, og
                    leseren må innom detaljsiden for å se hva dagen har (#36). */}
                <div class="home-todays-slots">
                  {text.slots.map((slot) => {
                    const parts = slot.options.flatMap((o) => o.parts).filter((p) => p.ranges.length > 0);
                    if (parts.length === 0) return null;
                    return (
                      <div class="home-todays-slot">
                        <span class="home-todays-slot-label">
                          {t(readingTypeKey(parts[0]!.ranges[0]!.book_id))}
                        </span>
                        <span class="home-todays-slot-refs">
                          {parts.map((part) =>
                            part.ranges.map((range) => (
                              <a href={lhref(rangeUrl(range))} class="home-todays-ref">{rangeLabel(range)}</a>
                            )),
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <a href={lhref('/lesetekster')} class="home-todays-day-more">{t('home.allReadingTexts')}</a>
              </div>
            ))}
          </div>
        )}

        <section class="home-books" aria-labelledby="books-heading" id="home-books" data-strings={strings}>
          <div class="home-section-head">
            <h2 id="books-heading">{t('home.booksOfBible')}</h2>
            {/* Visningsvalget er progressivt: uten JS står kategorivisningen,
                som er den SSR-en faktisk rendrer. */}
            <div class="home-book-views" id="home-book-views" role="tablist"
              aria-label={t('home.bookViewAria')} hidden>
              <button type="button" class="home-book-view is-on" data-view="categories" role="tab" aria-selected="true">
                {t('home.viewCategories')}
              </button>
              <button type="button" class="home-book-view" data-view="alphabetical" role="tab" aria-selected="false"
                data-group-label={t('grp.allAlphabetical')}>
                {t('home.viewAlphabetical')}
              </button>
              <button type="button" class="home-book-view" data-view="chronological" role="tab" aria-selected="false"
                data-ot-label={t('grp.otBookOrder')} data-nt-label={t('grp.ntBookOrder')}>
                {t('home.viewChronological')}
              </button>
            </div>
          </div>
          <div class="home-book-groups" id="home-book-groups">
            {bookGroups(t).map((group) => (
              <div class="home-book-group">
                <div class="home-book-group-label">{group.label}</div>
                <div class="home-book-grid">
                  {group.books.map((book) => (
                    <a href={lhref(`/${toUrlSlug(book.short_name)}/1`)} class="home-book"
                      data-slug={toUrlSlug(book.short_name)} data-book-id={book.id}
                      data-testament={book.testament}>
                      <span class="home-book-name">{bookName(book)}</span>
                      <span class="home-book-meta">{t('home.chapters', { n: book.chapters })}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section class="home-discover" aria-labelledby="discover-heading">
          <div class="home-section-head">
            <h2 id="discover-heading">{t('home.explore')}</h2>
            <span class="home-section-sub">{t('home.exploreSub')}</span>
          </div>
          <div class="home-discover-grid">
            {discover(t).map((item) => (
              <a href={lhref(item.to)} class="home-disc">
                <DiscoverIcon to={item.to} />
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </Layout>,
  );
});

// ---------- /sok ----------

const PAGE_SIZE = 50;

// ---------- ekstra søkeresultattyper (GitHub #2, paritet med gamle SearchPage) ----------

interface ExtraCard {
  href: string;
  title: string;
  badge?: string;
  meta?: string;
  desc?: string | null;
}

const EXTRA_MAX = 6;

function trunc(text: string | null | undefined, max = 100): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Én resultatseksjon; skjules per brukerinnstilling av search.js (data-search-type). */
function ExtraSection({ title, typeKey, cards }: { title: string; typeKey: string; cards: ExtraCard[] }) {
  const t = tCtx();
  if (cards.length === 0) return null;
  const Card = ({ card }: { card: ExtraCard }) => (
    <a href={lhref(card.href)} class="search-extra-card">
      <span class="search-extra-card-title">
        {card.title}
        {card.badge && <span class="search-type-badge">{card.badge}</span>}
      </span>
      {card.meta && <span class="search-extra-card-meta">{card.meta}</span>}
      {card.desc && <span class="search-extra-card-desc">{card.desc}</span>}
    </a>
  );
  return (
    <section class="search-extra-section" data-search-type={typeKey}>
      <h2 class="search-extra-title">{title}</h2>
      <div class="search-extra-cards">
        {cards.slice(0, EXTRA_MAX).map((card) => (
          <Card card={card} />
        ))}
      </div>
      {cards.length > EXTRA_MAX && (
        <details class="search-extra-more">
          <summary>{t('search.more')} ({cards.length})</summary>
          <div class="search-extra-cards">
            {cards.slice(EXTRA_MAX).map((card) => (
              <Card card={card} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

async function loadExtraResults(query: string) {
  const [stories, themes, persons, prophecies, timeline, parallels, plans, words, numbers, days] = await Promise.all([
    searchStories(query),
    searchThemes(query),
    searchPersons(query),
    searchProphecies(query),
    searchTimelineEvents(query),
    searchGospelParallels(query),
    searchReadingPlans(query),
    searchImportantWords(query),
    searchNumberSymbolism(query),
    searchDays(query),
  ]);
  const t = tCtx();
  const sections: { title: string; typeKey: string; cards: ExtraCard[] }[] = [
    {
      title: t('nav.stories'), typeKey: 'stories',
      cards: stories.map((s) => ({ href: `/historier/${s.slug}`, title: s.title, desc: trunc(s.description) })),
    },
    {
      title: t('nav.themes'), typeKey: 'themes',
      cards: themes.map((t) => ({ href: `/temaer/${encodeURIComponent(t.name)}`, title: t.name })),
    },
    {
      title: t('nav.persons'), typeKey: 'persons',
      cards: persons.map((p) => ({ href: `/personer/${p.id}`, title: p.name, badge: t('badge.person'), meta: p.title || undefined, desc: trunc(p.summary) })),
    },
    {
      title: t('nav.prophecies'), typeKey: 'prophecies',
      cards: prophecies.map((p) => ({ href: '/profetier', title: p.title, badge: t('badge.prophecy'), meta: `${p.category_name} · ${p.prophecy_ref}`, desc: trunc(p.explanation) })),
    },
    {
      title: t('nav.timeline'), typeKey: 'timeline',
      cards: timeline.map((e) => ({ href: '/tidslinje', title: e.title, badge: t('badge.timeline'), meta: e.year_display || undefined, desc: trunc(e.description) })),
    },
    {
      title: t('nav.parallels'), typeKey: 'parallels',
      cards: parallels.map((p) => ({ href: '/paralleller', title: p.title, badge: t('badge.parallel'), meta: p.section_name })),
    },
    {
      title: t('set.type.plans'), typeKey: 'plans',
      cards: plans.map((p) => ({ href: '/leseplan', title: p.name, badge: t('badge.readingPlan'), meta: p.category ? `${p.category} · ${p.days} dager` : undefined, desc: trunc(p.description) })),
    },
    {
      title: t('set.type.words'), typeKey: 'words',
      cards: words.map((w) => ({ href: `/${toUrlSlug(w.book_short_name)}/${w.chapter}`, title: w.word, badge: t('badge.keyWord'), meta: `${bookNameByShort(w.book_short_name)} ${w.chapter}`, desc: trunc(w.explanation) })),
    },
    {
      title: t('nav.numbers'), typeKey: 'numberSymbolism',
      cards: numbers.map((n) => ({ href: `/tall/${n.number}`, title: t('num.theNumber', { n: n.number }), badge: t('badge.number'), meta: n.meaning, desc: trunc(n.description) })),
    },
    {
      title: t('nav.days'), typeKey: 'days',
      cards: days.map((d) => ({ href: `/dager/${d.id}`, title: d.name, badge: t('badge.day'), desc: trunc(d.description) })),
    },
  ];
  return sections.filter((s) => s.cards.length > 0);
}

r.get('/sok', async (c) => {
  const t = tFor(c);
  const query = (c.req.query('q') || '').trim();
  const side = Math.max(1, parseInt(c.req.query('side') || '1', 10) || 1);
  const offset = (side - 1) * PAGE_SIZE;
  const bible = normalizeBibleId(c.req.query('bible')) || (await defaultBibleForLanguage());

  const res = query.length >= 2 ? await searchVerses(query, PAGE_SIZE, offset, bible) : null;
  // Andre ressurstyper vises kun på side 1 (som i gamle appen).
  const extra = query.length >= 2 && side === 1 ? await loadExtraResults(query) : [];

  return c.html(
    <Layout {...layoutProps(c)}
      title={query ? `${t('search.title')}: ${query} — FLOGVIT.bible` : `${t('search.title')} — FLOGVIT.bible`}
      description={t('search.meta')}
      // Med søketekst er URL-en angriperens, ikke vår (#41). Den tomme /sok er
      // en ekte landingsside og står i sitemapen — den skal fortsatt indekseres.
      noindex={query.length > 0}
      styles={['search.css']}
      scripts={['search.js']}
    >
      <div class="search-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('search.title') }]} />
          <h1>{t('search.inBible')}</h1>

          <form class="search-form" action="/sok" method="get" role="search">
            <input
              type="search"
              name="q"
              value={query}
              placeholder={t('search.placeholder')}
              aria-label={t('search.inBible')}
              class="search-input"
            />
            <button type="submit" class="search-submit">{t('search.title')}</button>
          </form>
          <p class="search-hint">
            {t('search.hintHead')} «Joh 3,16» {t('search.hintTail')}{' '}
            <a href={lhref('/sok/original')}>{t('search.inOriginal').toLowerCase()}</a>.
          </p>

          {extra.length > 0 && (
            <div class="search-extra">
              {extra.map((s) => (
                <ExtraSection title={s.title} typeKey={s.typeKey} cards={s.cards} />
              ))}
            </div>
          )}

          {query.length >= 2 && res && (
            <>
              <p class="search-count">
                {res.total === 0 ? t('search.noHits', { q: query }) : t('search.hits', { n: res.total, q: query })}
              </p>
              <div class="search-results">
                {res.results.map((v) => (
                  <a href={lhref(`/${toUrlSlug(v.book_short_name)}/${v.chapter}#v${v.verse}`)} class="search-result">
                    <span class="search-result-ref">
                      {bookNameByShort(v.book_short_name)} {v.chapter}:{v.verse}
                    </span>
                    <p class="search-result-text">{v.text}</p>
                  </a>
                ))}
              </div>
              <div class="search-pager">
                {side > 1 && (
                  <a href={lhref(`/sok?q=${encodeURIComponent(query)}&side=${side - 1}`)} class="search-page-link">
                    ← {t('rd.prevShort')}
                  </a>
                )}
                {res.hasMore && (
                  <a href={lhref(`/sok?q=${encodeURIComponent(query)}&side=${side + 1}`)} class="search-page-link">
                    {t('search.showMore')} →
                  </a>
                )}
              </div>
            </>
          )}
          {query.length === 1 && <p class="search-count">{t('search.minChars')}</p>}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /sok/original ----------

r.get('/sok/original', async (c) => {
  const t = tFor(c);
  const query = (c.req.query('q') || '').trim();
  const side = Math.max(1, parseInt(c.req.query('side') || '1', 10) || 1);
  const offset = (side - 1) * PAGE_SIZE;

  // Utgaven den lesbare teksten siteres fra — som på /sok: eksplisitt ?bible=
  // vinner, ellers språkets egen default.
  const bible = normalizeBibleId(c.req.query('bible')) || (await defaultBibleForLanguage());
  const res = query.length >= 1 ? await searchOriginalWord(query, PAGE_SIZE, offset, bible) : null;

  return c.html(
    <Layout {...layoutProps(c)}
      title={query ? `${t('search.originalTitle')}: ${query} — FLOGVIT.bible` : `${t('search.inOriginal')} — FLOGVIT.bible`}
      description={t('so.originalMeta')}
      noindex={query.length > 0}
      styles={['search.css']}
    >
      <div class="search-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: tCtx()('common.home'), href: '/' },
              { label: tCtx()('search.title'), href: '/sok' },
              { label: t('so.originalLangs') },
            ]}
          />
          <h1>{t('search.inOriginal')}</h1>

          <form class="search-form" action="/sok/original" method="get" role="search">
            <input
              type="search"
              name="q"
              value={query}
              placeholder={t('so.originalPh')}
              aria-label={t('so.searchOriginalAria')}
              class="search-input"
            />
            <button type="submit" class="search-submit">{t('search.title')}</button>
          </form>

          {query.length >= 1 && res && (
            <>
              <p class="search-count">
                {res.total === 0
                  ? t('so.noHits', { q: query })
                  : t('so.hitsIn', {
                      n: res.total,
                      lang: t(res.language === 'hebrew' ? 'lang.hebrew' : 'lang.greek'),
                    })}
              </p>
              <div class="search-results">
                {res.results.map((v) => (
                  <a href={lhref(`/${toUrlSlug(v.book_short_name)}/${v.chapter}#v${v.verse}`)} class="search-result">
                    <span class="search-result-ref">
                      {bookNameByShort(v.book_short_name)} {v.chapter}:{v.verse}
                    </span>
                    <p class="search-result-text">{v.text}</p>
                    <p
                      class="search-result-original"
                      lang={res.language === 'hebrew' ? 'he' : 'el'}
                      dir={res.language === 'hebrew' ? 'rtl' : 'ltr'}
                    >
                      {v.original_text}
                    </p>
                  </a>
                ))}
              </div>
              <div class="search-pager">
                {side > 1 && (
                  <a href={lhref(`/sok/original?q=${encodeURIComponent(query)}&side=${side - 1}`)} class="search-page-link">
                    ← {t('rd.prevShort')}
                  </a>
                )}
                {res.hasMore && (
                  <a href={lhref(`/sok/original?q=${encodeURIComponent(query)}&side=${side + 1}`)} class="search-page-link">
                    {t('search.showMore')} →
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>,
  );
});

export default r;
