// Forside (/) + søk (/sok, /sok/original). Portert fra HomeContent/HomeHero/
// BookCategories/DiscoverGrid + SearchPage/OriginalSearchPage.
// Forsiden er SSR: dagens vers + bøker + utforsk + dagens lesetekst hentes
// server-side; «Fortsett å lese» og aktiv leseplan (localStorage) legges på av
// home.js-øya. Søk er SSR via ?q= (GET-skjema) med enkel paginering.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { getSql } from '../../lib/db.ts';
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
  type DayReference,
  normalizeBibleId,
  defaultBibleForLanguage,
} from '../../lib/bible.ts';
import { DEFAULT_CONTENT_LANGUAGE } from '../../lib/lang.ts';
import { booksData, getBookInfoById, bookName, bookNameById, bookNameByShort, type BookInfo } from '../../lib/books-data.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
import { layoutProps, tFor, type Translator, lhref } from '../../lib/i18n.ts';
import { tCtx } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

// ---------- forside ----------

interface DailyVerse {
  bookName: string;
  shortName: string;
  chapter: number;
  verseStart: number;
  display: string;
  text: string;
  note: string | null;
}

async function loadDailyVerse(bible?: string): Promise<DailyVerse | null> {
  bible = bible ?? (await defaultBibleForLanguage());
  const sql = getSql();
  const date = new Date().toISOString().slice(0, 10);
  const [dv] = (await sql`
    SELECT book_id, chapter, verse_start, verse_end, note
    FROM daily_verses WHERE date = ${date} AND language = ${DEFAULT_CONTENT_LANGUAGE}
  `) as { book_id: number; chapter: number; verse_start: number; verse_end: number; note: string | null }[];
  if (!dv) return null;
  const [book] = (await sql`
    SELECT name_no, short_name FROM books WHERE id = ${dv.book_id}
  `) as { name_no: string; short_name: string }[];
  if (!book) return null;
  const verses = (await sql`
    SELECT text FROM verses
    WHERE book_id = ${dv.book_id} AND chapter = ${dv.chapter}
      AND verse >= ${dv.verse_start} AND verse <= ${dv.verse_end} AND bible = ${bible}
    ORDER BY verse
  `) as { text: string }[];
  const range = dv.verse_start === dv.verse_end ? `${dv.verse_start}` : `${dv.verse_start}-${dv.verse_end}`;
  return {
    bookName: bookNameByShort(book.short_name),
    shortName: book.short_name,
    chapter: dv.chapter,
    verseStart: dv.verse_start,
    display: `${bookNameByShort(book.short_name)} ${dv.chapter}:${range}`,
    text: verses.map((v) => v.text).join(' '),
    note: dv.note,
  };
}

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

const DAY_CATEGORY_LABELS: Record<string, string> = {
  advent: 'Advent', christmas: 'Jul', epiphany: 'Åpenbaring', lent: 'Faste',
  easter: 'Påske', ascension: 'Himmelfart', pentecost: 'Pinse',
  trinity: 'Treenighetstiden', special: 'Spesielle dager', jewish: 'Jødiske høytider',
};

function dayRefLabel(ref: DayReference): string {
  const name = bookNameById(ref.bookId) || `Bok ${ref.bookId}`;
  return ref.fromVerseId === ref.toVerseId
    ? `${name} ${ref.chapterId}:${ref.fromVerseId}`
    : `${name} ${ref.chapterId}:${ref.fromVerseId}-${ref.toVerseId}`;
}

function dayRefUrl(ref: DayReference): string {
  const book = getBookInfoById(ref.bookId);
  return `/${book ? toUrlSlug(book.short_name) : ''}/${ref.chapterId}#v${ref.fromVerseId}`;
}

r.get('/', async (c) => {
  const t = tFor(c);
  const verse = await loadDailyVerse();
  const todaysReading = await getTodaysReadingTexts();
  const todaysDays = await getTodaysDays();

  return c.html(
    <Layout {...layoutProps(c)}
      title={`FLOGVIT.bible — ${t('home.metaTitle')}`}
      description="Les, studér og søk i Bibelen med grunntekst, kryssreferanser, tidslinje, temaer og personer."
      styles={['home.css']}
      scripts={['home.js']}
    >
      <div class="home-wrap">
        <div class="home-hero">
          {/* Fortsett/velkommen — home.js bytter til «Fortsett å lese» hvis
              leseposisjon finnes i localStorage. */}
          <div class="home-continue" id="home-continue" data-state="welcome">
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
            <div class="home-card home-vod" data-setting-show="showDailyVerse">
              <h3>{t('home.verseOfDay')}</h3>
              {verse ? (
                <>
                  <p class="home-vod-text">«{verse.text}»</p>
                  <div class="home-vod-foot">
                    <a href={lhref(`/${toUrlSlug(verse.shortName)}/${verse.chapter}#v${verse.verseStart}`)}>
                      {verse.display}
                    </a>
                    {verse.note && <span class="home-vod-note"> · {verse.note}</span>}
                  </div>
                </>
              ) : (
                <div class="home-vod-empty">{t('home.noVerseToday')}</div>
              )}
            </div>

            {/* Aktiv leseplan fylles av home.js fra localStorage. */}
            <div class="home-card home-plans" id="home-plans">
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
                  <span class="home-todays-day-cat">{DAY_CATEGORY_LABELS[day.category] || day.category}</span>
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
                <a href={lhref(`/dager/${day.id}`)} class="home-todays-day-more">Les mer om {day.name} →</a>
              </div>
            ))}
          </div>
        )}

        {todaysReading.length > 0 && (
          <div class="home-lesetekster" data-setting-show="showReadingTexts">
            {todaysReading.map((t) => (
              <div class="home-todays-reading">
                <div class="home-todays-eyebrow">
                  DnK lesetekster{t.series ? ` · Rekke ${t.series}` : ''}
                </div>
                <h3>
                  <a href={lhref(`/lesetekster/${t.id}`)}>{t.name}</a>
                </h3>
              </div>
            ))}
          </div>
        )}

        <section class="home-books" aria-labelledby="books-heading">
          <div class="home-section-head">
            <h2 id="books-heading">{t('home.booksOfBible')}</h2>
          </div>
          {bookGroups(t).map((group) => (
            <div class="home-book-group">
              <div class="home-book-group-label">{group.label}</div>
              <div class="home-book-grid">
                {group.books.map((book) => (
                  <a href={lhref(`/${toUrlSlug(book.short_name)}/1`)} class="home-book">
                    <span class="home-book-name">{bookName(book)}</span>
                    <span class="home-book-meta">{book.chapters} kap.</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section class="home-discover" aria-labelledby="discover-heading">
          <div class="home-section-head">
            <h2 id="discover-heading">{t('home.explore')}</h2>
            <span class="home-section-sub">{t('home.exploreSub')}</span>
          </div>
          <div class="home-discover-grid">
            {discover(t).map((item) => (
              <a href={lhref(item.to)} class="home-disc">
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

  const res = query.length >= 1 ? await searchOriginalWord(query, PAGE_SIZE, offset) : null;

  return c.html(
    <Layout {...layoutProps(c)}
      title={query ? `${t('search.originalTitle')}: ${query} — FLOGVIT.bible` : `${t('search.inOriginal')} — FLOGVIT.bible`}
      description="Søk i den hebraiske og greske grunnteksten."
      styles={['search.css']}
    >
      <div class="search-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: tCtx()('common.home'), href: '/' },
              { label: 'Søk', href: '/sok' },
              { label: 'Originalspråk' },
            ]}
          />
          <h1>{t('search.inOriginal')}</h1>

          <form class="search-form" action="/sok/original" method="get" role="search">
            <input
              type="search"
              name="q"
              value={query}
              placeholder="Skriv et hebraisk eller gresk ord…"
              aria-label="Søk i grunnteksten"
              class="search-input"
            />
            <button type="submit" class="search-submit">{t('search.title')}</button>
          </form>

          {query.length >= 1 && res && (
            <>
              <p class="search-count">
                {res.total === 0
                  ? `Ingen treff på «${query}».`
                  : `${res.total} treff (${res.language === 'hebrew' ? 'hebraisk' : 'gresk'}).`}
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
