// Studie-innhold: /temaer, /historier, /tall, /dager (+ detaljsider).
// Portert fra ThemesPage/ThemePage/StoriesPage/StoryPage/NumberSymbolism*/Days*.
// Innholdet er JSON i DB-en (noen temaer i gammelt txt-format) og parses her.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { InlineRefs } from '../../views/inline-refs.tsx';
import { Footnotes } from '../../views/footnotes.tsx';
import { ItemTagging } from '../../views/item-tagging.tsx';
import { VerseRefList } from '../../views/verse-display.tsx';
import {
  getAllThemes,
  getThemeByName,
  getAllStories,
  getStoryBySlug,
  getAllNumberSymbolism,
  getNumberSymbolismByNumber,
  getAllDays,
  getDayById,
  type ThemeData,
  type ThemeVerseRef,
  type StoryData,
  type NumberSymbolismData,
  type DayData,
  type DayReference,
} from '../../lib/bible.ts';
import { getBookInfoById } from '../../lib/books-data.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
import { layoutProps, tFor, lhref, currentIntlTag } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

const STORY_CATEGORIES: Record<string, string> = {
  skapelsen: 'Skapelsen', patriarkene: 'Patriarkene', moses: 'Moses',
  oerkenvandringen: 'Ørkenvandringen', landnaam: 'Landnåm', dommerne: 'Dommerne',
  kongetiden: 'Kongetiden', profetene: 'Profetene', eksil: 'Eksil',
  'jesus-liv': 'Jesu liv', 'jesu-mirakler': 'Jesu mirakler',
  'jesu-lignelser': 'Jesu lignelser', 'jesu-lidelse': 'Jesu lidelse',
  urkirken: 'Urkirken', paulus: 'Paulus',
};

const DAY_CATEGORIES: Record<string, string> = {
  advent: 'Advent', christmas: 'Jul', epiphany: 'Åpenbaring', lent: 'Faste',
  easter: 'Påske', ascension: 'Himmelfart', pentecost: 'Pinse',
  trinity: 'Treenighetstiden', special: 'Spesielle dager', jewish: 'Jødiske høytider',
};

// ---------- /temaer ----------

r.get('/temaer', async (c) => {
  const t = tFor(c);
  const themes = await getAllThemes();
  const items = themes.map((t) => {
    try {
      const parsed = JSON.parse(t.content) as ThemeData;
      const parts = [parsed.title, parsed.introduction ?? ''];
      for (const s of parsed.sections || []) parts.push(s.title, s.description ?? '');
      return {
        id: t.name,
        title: parsed.title || t.name,
        introduction: parsed.introduction || 'Tematisk bibelstudie',
        search: parts.join(' ').toLowerCase(),
      };
    } catch {
      const lines = t.content.split('\n').filter((l) => l.trim());
      return {
        id: t.name,
        title: t.name.charAt(0).toUpperCase() + t.name.slice(1),
        introduction: lines[0]?.split(':')[0] || '',
        search: t.content.toLowerCase(),
      };
    }
  });

  return c.html(
    <Layout {...layoutProps(c)} title={`${t('themes.title')} — FLOGVIT.bible`} description={t('themes.meta')} styles={['study.css']} scripts={['card-filter.js']}>
      <div class="study-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Temaer' }]} />
          <h1>{t('themes.title')}</h1>
          <div class="study-search-container">
            <input type="text" class="study-search-input" data-card-search placeholder={t('themes.searchPh')} aria-label="Søk etter tema" autocomplete="off" />
          </div>
          <div class="study-grid" data-card-list>
            {items.map((t) => (
              <a href={lhref(`/temaer/${t.id}`)} class="study-card" data-search={t.search}>
                <h2 class="study-card-title">{t.title}</h2>
                <p class="study-card-desc">{t.introduction}</p>
              </a>
            ))}
          </div>
          <p class="study-empty" data-card-empty hidden>{t('themes.noMatch')}</p>
        </div>
      </div>
    </Layout>,
  );
});

r.get('/temaer/:tema', async (c) => {
  const t = tFor(c);
  const tema = c.req.param('tema');
  const theme = await getThemeByName(tema);
  if (!theme) return c.notFound();

  let json: ThemeData | null = null;
  try {
    json = JSON.parse(theme.content) as ThemeData;
  } catch {
    json = null;
  }

  const title = json?.title || tema.charAt(0).toUpperCase() + tema.slice(1);

  return c.html(
    <Layout {...layoutProps(c)} title={`${title} — FLOGVIT.bible`} description={json?.introduction?.slice(0, 155) || `Tematisk bibelstudie: ${title}`} styles={['study.css']} scripts={['tagging.js']}>
      <div class="study-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Temaer', href: '/temaer' }, { label: title }]} />
          <h1>{title}</h1>
          <div class="study-tagging"><ItemTagging itemType="theme" itemId={tema} /></div>

          {json ? (
            <>
              {json.introduction && (
                <p class="study-introduction">
                  <InlineRefs text={json.introduction} />
                </p>
              )}
              <div class="study-sections">
                {json.sections.map((section) => (
                  <div class="study-section">
                    <h2>{section.title}</h2>
                    {section.description && (
                      <p class="study-section-desc">
                        <InlineRefs text={section.description} />
                      </p>
                    )}
                    <VerseRefList refs={section.verses as ThemeVerseRef[]} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div class="study-sections">
              {theme.content
                .split('\n')
                .filter((l) => l.trim())
                .map((line) => {
                  const idx = line.indexOf(':');
                  const t = idx > 0 ? line.slice(0, idx).trim() : line;
                  const d = idx > 0 ? line.slice(idx + 1).trim() : '';
                  return (
                    <div class="study-section">
                      <h2>{t}</h2>
                      {d && (
                        <p>
                          <InlineRefs text={d} />
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /historier ----------

r.get('/historier', async (c) => {
  const t = tFor(c);
  const stories = await getAllStories();
  const cats = new Set(stories.map((s) => s.category));
  const availableCategories = Object.entries(STORY_CATEGORIES).filter(([k]) => cats.has(k));

  return c.html(
    <Layout {...layoutProps(c)} title={`${t('stories.title')} — FLOGVIT.bible`} description={t('stories.meta')} styles={['study.css']} scripts={['card-filter.js']}>
      <div class="study-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Bibelhistorier' }]} />
          <h1>{t('stories.title')}</h1>
          <div class="study-search-container">
            <input type="text" class="study-search-input" data-card-search placeholder={t('stories.searchPh')} aria-label="Søk etter historie" autocomplete="off" />
          </div>
          <div class="study-filter-buttons" data-card-catfilter>
            <button type="button" class="persons-filter-button active" data-value="">{t('common.all')}</button>
            {availableCategories.map(([key, label]) => (
              <button type="button" class="persons-filter-button" data-value={key}>{label}</button>
            ))}
          </div>
          <div class="study-grid" data-card-list>
            {stories.map((s) => (
              <a
                href={lhref(`/historier/${s.slug}`)}
                class="study-card"
                data-cat={s.category}
                data-search={`${s.title} ${s.keywords} ${s.description ?? ''}`.toLowerCase()}
              >
                <span class="study-card-cat">{STORY_CATEGORIES[s.category] || s.category}</span>
                <h2 class="study-card-title">{s.title}</h2>
                {s.description && <p class="study-card-desc">{s.description}</p>}
              </a>
            ))}
          </div>
          <p class="study-empty" data-card-empty hidden>{t('stories.noMatch')}</p>
        </div>
      </div>
    </Layout>,
  );
});

r.get('/historier/:slug', async (c) => {
  const t = tFor(c);
  const story = await getStoryBySlug(c.req.param('slug'));
  if (!story) return c.notFound();
  let data: StoryData;
  try {
    data = JSON.parse(story.content) as StoryData;
  } catch {
    return c.notFound();
  }

  return c.html(
    <Layout {...layoutProps(c)} title={`${data.title} — FLOGVIT.bible`} description={data.description?.slice(0, 155)} styles={['study.css']} scripts={['tagging.js']}>
      <div class="study-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Bibelhistorier', href: '/historier' }, { label: data.title }]} />
          <span class="study-card-cat">{STORY_CATEGORIES[data.category] || data.category}</span>
          <h1>{data.title}</h1>
          {data.description && (
            <p class="study-introduction">
              <InlineRefs text={data.description} />
            </p>
          )}
          <div class="study-sections">
            {data.references.map((ref) => {
              const book = getBookInfoById(ref.bookId);
              const sameChapter = ref.startChapter === ref.endChapter;
              const label = book
                ? sameChapter
                  ? `${book.name_no} ${ref.startChapter},${ref.startVerse}${ref.startVerse !== ref.endVerse ? `-${ref.endVerse}` : ''}`
                  : `${book.name_no} ${ref.startChapter},${ref.startVerse}-${ref.endChapter},${ref.endVerse}`
                : '';
              // Bygg eksplisitte verslister per kapittel (som gamle StoryPage:
              // 1..200 for mellomkapitler, endVerse for siste). Ikke-eksisterende
              // vers filtreres bort server-side i getVersesWithOriginal.
              const refsForRange: ThemeVerseRef[] = [];
              for (let ch = ref.startChapter; ch <= ref.endChapter; ch++) {
                const from = ch === ref.startChapter ? ref.startVerse : 1;
                const to = ch === ref.endChapter ? ref.endVerse : 200;
                refsForRange.push({
                  bookId: ref.bookId,
                  chapter: ch,
                  verses: Array.from({ length: to - from + 1 }, (_, k) => from + k),
                });
              }
              return (
                <div class="study-section">
                  {label && <h2>{label}</h2>}
                  <VerseRefList refs={refsForRange} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /tall ----------

r.get('/tall', async (c) => {
  const t = tFor(c);
  const numbers = await getAllNumberSymbolism();
  const items = numbers.map((n) => {
    try {
      const d = JSON.parse(n.content) as NumberSymbolismData;
      return { number: n.number, meaning: d.meaning, search: `${n.number} ${d.meaning} ${d.description}`.toLowerCase() };
    } catch {
      return { number: n.number, meaning: '', search: String(n.number) };
    }
  });

  return c.html(
    <Layout {...layoutProps(c)} title={`${t('nav.numbers')} — FLOGVIT.bible`} description={t('numbers.meta')} styles={['study.css']} scripts={['card-filter.js']}>
      <div class="study-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Tall' }]} />
          <h1>{t('numbers.title')}</h1>
          <div class="study-search-container">
            <input type="text" class="study-search-input" data-card-search placeholder={t('numbers.searchPh')} aria-label="Søk" autocomplete="off" />
          </div>
          <div class="study-grid study-grid-numbers" data-card-list>
            {items.map((n) => (
              <a href={lhref(`/tall/${n.number}`)} class="study-number-card" data-search={n.search}>
                <span class="study-big-number">{n.number}</span>
                <span class="study-number-meaning">{n.meaning}</span>
              </a>
            ))}
          </div>
          <p class="study-empty" data-card-empty hidden>{t('numbers.noMatch')}</p>
        </div>
      </div>
    </Layout>,
  );
});

r.get('/tall/:number', async (c) => {
  const t = tFor(c);
  const num = parseInt(c.req.param('number'), 10);
  if (isNaN(num)) return c.notFound();
  const row = await getNumberSymbolismByNumber(num);
  if (!row) return c.notFound();
  let data: NumberSymbolismData;
  try {
    data = JSON.parse(row.content) as NumberSymbolismData;
  } catch {
    return c.notFound();
  }

  function refUrl(ref: { bookId: number; chapterId: number; fromVerseId: number }): string {
    const book = getBookInfoById(ref.bookId);
    return `/${book ? toUrlSlug(book.short_name) : ''}/${ref.chapterId}#v${ref.fromVerseId}`;
  }
  function refLabel(ref: { bookId: number; chapterId: number; fromVerseId: number; toVerseId: number }): string {
    const book = getBookInfoById(ref.bookId);
    const name = book?.name_no || `Bok ${ref.bookId}`;
    return ref.fromVerseId === ref.toVerseId
      ? `${name} ${ref.chapterId}:${ref.fromVerseId}`
      : `${name} ${ref.chapterId}:${ref.fromVerseId}-${ref.toVerseId}`;
  }

  return c.html(
    <Layout {...layoutProps(c)} title={`Tallet ${data.number}: ${data.meaning} — FLOGVIT.bible`} description={data.description.slice(0, 155)} styles={['study.css']} scripts={['tagging.js']}>
      <div class="study-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Tall', href: '/tall' }, { label: `Tallet ${data.number}` }]} />
          <div class="study-number-header">
            <span class="study-big-number">{data.number}</span>
            <h1>{data.meaning}</h1>
          </div>
          <div class="study-tagging"><ItemTagging itemType="number-symbolism" itemId={String(data.number)} /></div>
          <div class="study-description">
            <p>
              {data.description}
              {data.footnotes && data.footnotes.length > 0 && <Footnotes footnotes={data.footnotes} defaultOpen />}
            </p>
          </div>
          {data.references.length > 0 && (
            <div class="study-refs">
              <h2>Bibelreferanser ({data.references.length})</h2>
              <div class="study-ref-list">
                {data.references.map((ref) => (
                  <a href={lhref(refUrl(ref))} class="person-ref-chip">{refLabel(ref)}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /dager ----------

// Kronologisk/tematisk-visning som i gamle DaysListPage; SSR via ?visning=.
const DAY_CATEGORY_ORDER = ['advent', 'christmas', 'epiphany', 'lent', 'easter', 'ascension', 'pentecost', 'trinity', 'special', 'jewish'];

function nextDayDate(dates: Record<string, string> | undefined): string | null {
  if (!dates) return null;
  const today = new Date().toISOString().slice(0, 10);
  const future = Object.values(dates).filter((d) => d >= today).sort();
  return future[0] ?? null;
}

function formatDayDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(currentIntlTag(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

r.get('/dager', async (c) => {
  const t = tFor(c);
  const thematic = c.req.query('visning') === 'tematisk';
  const days = await getAllDays();
  const items = days.map((d) => {
    try {
      const data = JSON.parse(d.content) as DayData;
      return { id: d.id, name: data.name, category: data.category, description: data.description, nextDate: nextDayDate(data.dates), search: `${data.name} ${data.description}`.toLowerCase() };
    } catch {
      return { id: d.id, name: d.name, category: '', description: '', nextDate: null as string | null, search: d.name.toLowerCase() };
    }
  });

  const byNextDate = (a: (typeof items)[number], b: (typeof items)[number]) => {
    if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return a.name.localeCompare(b.name, 'nb');
  };

  const DayCard = ({ d }: { d: (typeof items)[number] }) => (
    <a href={lhref(`/dager/${d.id}`)} class="study-card" data-search={d.search}>
      {d.category && <span class="study-card-cat">{DAY_CATEGORIES[d.category] || d.category}</span>}
      <h2 class="study-card-title">{d.name}</h2>
      {d.description && <p class="study-card-desc">{d.description}</p>}
      {d.nextDate && <p class="study-card-date">{formatDayDate(d.nextDate)}</p>}
    </a>
  );

  const groups = thematic
    ? DAY_CATEGORY_ORDER.map((cat) => ({
        title: DAY_CATEGORIES[cat] || cat,
        items: items.filter((d) => d.category === cat).sort(byNextDate),
      })).filter((g) => g.items.length > 0)
    : [{ title: '', items: [...items].sort(byNextDate) }];

  return c.html(
    <Layout {...layoutProps(c)} title={`${t('days.title')} — FLOGVIT.bible`} description={t('days.meta')} styles={['study.css']} scripts={['card-filter.js']}>
      <div class="study-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Dager' }]} />
          <h1>{t('days.title')}</h1>
          <nav class="study-view-tabs" aria-label="Visning">
            <a href={lhref('/dager')} class={`study-view-tab ${thematic ? '' : 'is-active'}`} aria-current={thematic ? undefined : 'true'}>{t('days.chronological')}</a>
            <a href={lhref('/dager?visning=tematisk')} class={`study-view-tab ${thematic ? 'is-active' : ''}`} aria-current={thematic ? 'true' : undefined}>{t('days.thematic')}</a>
          </nav>
          <div class="study-search-container">
            <input type="text" class="study-search-input" data-card-search placeholder={t('days.searchPh')} aria-label="Søk" autocomplete="off" />
          </div>
          <div data-card-list>
            {groups.map((g) => (
              <section class="study-group">
                {g.title && <h2 class="study-group-title">{g.title}</h2>}
                <div class="study-grid">
                  {g.items.map((d) => (
                    <DayCard d={d} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p class="study-empty" data-card-empty hidden>{t('days.noMatch')}</p>
        </div>
      </div>
    </Layout>,
  );
});

r.get('/dager/:dayId', async (c) => {
  const t = tFor(c);
  const row = await getDayById(c.req.param('dayId'));
  if (!row) return c.notFound();
  let data: DayData;
  try {
    data = JSON.parse(row.content) as DayData;
    data.references = data.references || [];
  } catch {
    return c.notFound();
  }

  function refUrl(ref: DayReference): string {
    const book = getBookInfoById(ref.bookId);
    return `/${book ? toUrlSlug(book.short_name) : ''}/${ref.chapterId}#v${ref.fromVerseId}`;
  }
  function refLabel(ref: DayReference): string {
    const book = getBookInfoById(ref.bookId);
    const name = book?.name_no || `Bok ${ref.bookId}`;
    return ref.fromVerseId === ref.toVerseId
      ? `${name} ${ref.chapterId}:${ref.fromVerseId}`
      : `${name} ${ref.chapterId}:${ref.fromVerseId}-${ref.toVerseId}`;
  }

  const primary = (data.references || []).filter((ref) => ref.relevance === 'primary');
  const secondary = (data.references || []).filter((ref) => ref.relevance === 'secondary');
  const sections: { title: string; text: string }[] = [];
  if (data.biblicalBasis) sections.push({ title: 'Bibelsk grunnlag', text: data.biblicalBasis });
  if (data.significance) sections.push({ title: 'Betydning', text: data.significance });
  if (data.otConnections) sections.push({ title: 'GT-forbindelser', text: data.otConnections });
  if (data.liturgicalContext) sections.push({ title: 'Liturgisk kontekst', text: data.liturgicalContext });
  if (data.history) sections.push({ title: 'Historie', text: data.history });

  return c.html(
    <Layout {...layoutProps(c)} title={`${data.name} — FLOGVIT.bible`} description={data.description.slice(0, 155)} styles={['study.css']} scripts={['tagging.js']}>
      <div class="study-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Dager', href: '/dager' }, { label: data.name }]} />
          <header class="study-day-header">
            <h1>{data.name}</h1>
            <div class="study-day-meta">
              <span class="study-card-cat">{DAY_CATEGORIES[data.category] || data.category}</span>
            </div>
          </header>
          <div class="study-tagging"><ItemTagging itemType="day" itemId={data.id} /></div>
          <div class="study-description">
            <p>
              {data.description}
              {data.footnotes && data.footnotes.length > 0 && <Footnotes footnotes={data.footnotes} defaultOpen />}
            </p>
          </div>
          {sections.map((s) => (
            <section class="study-section">
              <h2>{s.title}</h2>
              <p>
                <InlineRefs text={s.text} />
              </p>
            </section>
          ))}
          {primary.length > 0 && (
            <section class="study-refs">
              <h2>{t('days.mainTexts')}</h2>
              <div class="study-ref-cards">
                {primary.map((ref) => (
                  <a href={lhref(refUrl(ref))} class="study-ref-card">
                    <span class="study-ref-name">{refLabel(ref)}</span>
                    {ref.reason && <span class="study-ref-reason">{ref.reason}</span>}
                  </a>
                ))}
              </div>
            </section>
          )}
          {secondary.length > 0 && (
            <section class="study-refs">
              <h2>{t('rd.parallels')}</h2>
              <div class="study-ref-cards">
                {secondary.map((ref) => (
                  <a href={lhref(refUrl(ref))} class="study-ref-card">
                    <span class="study-ref-name">{refLabel(ref)}</span>
                    {ref.reason && <span class="study-ref-reason">{ref.reason}</span>}
                  </a>
                ))}
              </div>
            </section>
          )}
          {Object.keys(data.dates).length > 0 && (
            <section class="study-refs">
              <h2>Datoer</h2>
              <div class="study-date-list">
                {Object.entries(data.dates)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([year, date]) => (
                    <div class="study-date-item">
                      <span class="study-date-year">{year}</span>
                      <span class="study-date-value">{date}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Layout>,
  );
});

export default r;
