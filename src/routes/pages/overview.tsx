// Oversiktssider. FERDIG her: /kjente-vers (rent innhold) og /lesetekster
// (liste; detalj /lesetekster/:id). De øvrige oversiktssidene (tidslinje-viz,
// profetier, paralleller, statistikk) har tunge interaktive visninger og
// bygges av side-agenten — se ISSUES.md #9. /oversettelser hører til
// brukersidene (opplasting til IndexedDB/sync), ikke her.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { InlineRefs } from '../../views/inline-refs.tsx';
import { ItemTagging } from '../../views/item-tagging.tsx';
import { VerseRefList } from '../../views/verse-display.tsx';
import {
  getAllWellKnownVerses,
  getAllReadingTexts,
  getReadingTextById,
  getProphecies,
  getProphecyCategories,
  getGospelParallels,
  getGospelParallelSections,
  getVerses,
  getMultiTimeline,
  getBibleStatistics,
  getTopWords,
  type ProphecyReference,
  type VerseRef,
} from '../../lib/bible.ts';
import { enrichWithVerseText, getReadingType } from '../../lib/reading-text-enrich.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';

const r = new Hono<AppEnv>();

// Prophecy/fulfillment-referanse → VerseRef (eksplisitt versliste).
function toVerseRef(ref: ProphecyReference): VerseRef {
  const verses: number[] = [];
  for (let v = ref.verse_start; v <= ref.verse_end; v++) verses.push(v);
  return { bookId: ref.book_id, chapter: ref.chapter, verses };
}
function prophecyRefUrl(ref: ProphecyReference): string {
  return `/${toUrlSlug(ref.book_short_name || '')}/${ref.chapter}#v${ref.verse_start}`;
}

// ---------- /kjente-vers ----------

r.get('/kjente-vers', async (c) => {
  const verses = await getAllWellKnownVerses();
  const ot = verses.filter((v) => v.book_id <= 39);
  const nt = verses.filter((v) => v.book_id >= 40);

  function card(v: (typeof verses)[number]) {
    return (
      <a
        href={`/${toUrlSlug(v.book_short_name)}/${v.chapter}#v${v.verse}`}
        class="famous-verse-card"
      >
        <span class="famous-verse-ref">
          {v.book_name_no} {v.chapter}:{v.verse}
        </span>
        <p class="famous-verse-text">{v.verse_text}</p>
      </a>
    );
  }

  return c.html(
    <Layout
      title="Kjente bibelvers — FLOGVIT.bibel"
      description="En samling kjente og ofte siterte bibelvers. Klikk på et vers for å lese det i kontekst."
      styles={['overview.css']}
    >
      <div class="overview-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Kjente vers' }]} />
          <header>
            <h1>Kjente bibelvers</h1>
            <p class="overview-intro">
              En samling av kjente og ofte siterte bibelvers. Klikk på et vers for å lese det i
              kontekst.
            </p>
          </header>

          <section class="overview-section">
            <h2>Det nye testamente ({nt.length} vers)</h2>
            <div class="famous-verse-list">{nt.map(card)}</div>
          </section>

          <section class="overview-section">
            <h2>Det gamle testamente ({ot.length} vers)</h2>
            <div class="famous-verse-list">{ot.map(card)}</div>
          </section>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /lesetekster ----------

const MONTHS: Record<string, string> = {
  '01': 'Januar', '02': 'Februar', '03': 'Mars', '04': 'April', '05': 'Mai', '06': 'Juni',
  '07': 'Juli', '08': 'August', '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};
const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

// Deterministisk norsk datoformat uten locale-avhengighet.
function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const wd = WEEKDAYS[d.getUTCDay()] ?? '';
  const month = MONTHS[date.slice(5, 7)]?.toLowerCase() ?? '';
  return `${wd} ${d.getUTCDate()}. ${month}`;
}

r.get('/lesetekster', async (c) => {
  const texts = await getAllReadingTexts();
  // Kronologisk fremover (som gamle appens standardvisning): dato ≥ i dag.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = texts.filter((t) => t.date >= today);

  const groups = new Map<string, typeof texts>();
  for (const t of upcoming) {
    const key = t.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return c.html(
    <Layout
      title="Lesetekster — FLOGVIT.bibel"
      description="Lesetekster fra Den norske kirkes tekstrekkesystem — GT, brev og evangelium for hver søndag og helligdag."
      styles={['overview.css']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Lesetekster' }]} />
          <h1>Lesetekster</h1>
          <p class="overview-intro">
            Lesetekster fra Den norske kirkes tekstrekkesystem. Hver søndag og helligdag har tre
            lesetekster fra Det gamle testamente, brevlitteraturen og evangeliene.
          </p>

          {upcoming.length === 0 ? (
            <p>Ingen kommende lesetekster funnet.</p>
          ) : (
            [...groups.entries()].map(([key, group]) => (
              <section class="overview-section">
                <h2>
                  {MONTHS[key.slice(5, 7)]} {key.slice(0, 4)}
                </h2>
                <div class="reading-text-list">
                  {group.map((t) => (
                    <a href={`/lesetekster/${t.id}`} class="reading-text-card">
                      <span class="reading-text-name">
                        {t.name}
                        {t.series && <span class="reading-text-series">{t.series}</span>}
                      </span>
                      <span class="reading-text-date">{formatDate(t.date)}</span>
                    </a>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </Layout>,
  );
});

// Deterministisk fulldato (lørdag 5. juli 2026-stil) uten locale.
function formatFullDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const wd = WEEKDAYS[d.getUTCDay()] ?? '';
  const month = MONTHS[date.slice(5, 7)]?.toLowerCase() ?? '';
  return `${wd} ${d.getUTCDate()}. ${month} ${d.getUTCFullYear()}`;
}

r.get('/lesetekster/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.notFound();
  const text = await getReadingTextById(id);
  if (!text) return c.notFound();

  // Prefs (bibel/mapping) er klient-side i dag; osnb2 er standard server-side.
  const bible = c.req.query('bible') || 'osnb2';
  const mapping = c.req.query('mapping') || 'osnb2';
  const enriched = await enrichWithVerseText(text, bible, mapping);

  return c.html(
    <Layout
      title={`${text.name} — Lesetekster — FLOGVIT.bibel`}
      description={`Lesetekster for ${text.name}: GT, brev og evangelium.`}
      styles={['overview.css']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: 'Hjem', href: '/' },
              { label: 'Lesetekster', href: '/lesetekster' },
              { label: text.name },
            ]}
          />
          <h1>{text.name}</h1>
          <div class="reading-text-detail-meta">
            <span class="reading-text-date">{formatFullDate(text.date)}</span>
            {text.series && <span class="reading-text-series">Rekke {text.series}</span>}
          </div>

          {enriched.slots.map((slot) => {
            const hasAlternatives = slot.options.length > 1;
            return (
              <section class="reading-text-slot">
                {slot.options.map((option, optIdx) => (
                  <div class={hasAlternatives ? 'reading-text-option reading-text-alt' : 'reading-text-option'}>
                    {optIdx > 0 && (
                      <div class="reading-text-or">
                        <span>eller</span>
                      </div>
                    )}
                    {option.parts.map((part) => {
                      const type =
                        part.ranges.length > 0 ? getReadingType(part.ranges[0]!.book_id) : '';
                      const verses = enriched.verses[part.display_ref] || [];
                      return (
                        <div class="reading-text-part">
                          {type && <div class="reading-text-type">{type}</div>}
                          <h2>{part.title || part.refs.join('; ')}</h2>
                          <p class="reading-text-ref-line">{part.refs.join('; ')}</p>
                          {verses.length > 0 ? (
                            <div class="reading-text-verses">
                              {verses.map((v, vi) => {
                                const prev = vi > 0 ? verses[vi - 1]!.chapter : v.chapter;
                                const showChapter = vi === 0 || v.chapter !== prev;
                                return (
                                  <span>
                                    <sup class="reading-text-vnum">
                                      {showChapter ? `${v.chapter}:` : ''}
                                      {v.verse}
                                      {v.part || ''}
                                    </sup>
                                    {v.text}{' '}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <p class="reading-text-missing">
                              Verstekst ikke tilgjengelig for denne oversettelsen.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            );
          })}

          <a href="/lesetekster" class="reading-text-back">
            ← Alle lesetekster
          </a>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /profetier ----------

r.get('/profetier', async (c) => {
  const categories = await getProphecyCategories();
  const prophecies = await getProphecies();
  const catName = new Map(categories.map((cat) => [cat.id, cat.name]));

  return c.html(
    <Layout
      title="Profetier og oppfyllelser — FLOGVIT.bibel"
      description="Profetier i Det gamle testamente og hvordan de ble oppfylt i Det nye testamente."
      styles={['overview.css', 'persons.css']}
      scripts={['card-filter.js', 'tagging.js']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Profetier' }]} />
          <h1>Profetier og oppfyllelser</h1>
          <p class="overview-intro">
            En oversikt over profetier i Det gamle testamente og hvordan de ble oppfylt i Det nye
            testamente. Klikk på en profeti for å se forklaringen og bibelversene.
          </p>

          <div class="study-filter-buttons" data-card-catfilter>
            <button type="button" class="persons-filter-button active" data-value="">
              Alle kategorier
            </button>
            {categories.map((cat) => (
              <button type="button" class="persons-filter-button" data-value={cat.id}>
                {cat.name}
              </button>
            ))}
          </div>

          <div class="prophecy-list" data-card-list>
            {prophecies.map((p) => (
              <details class="prophecy-card" data-cat={p.category_id}>
                <summary class="prophecy-summary">
                  <span class="prophecy-title">{p.title}</span>
                  <span class="prophecy-cat">{catName.get(p.category_id) || p.category_id}</span>
                </summary>
                <div class="prophecy-body">
                  <div class="prophecy-refs">
                    <span class="prophecy-ref">
                      <span class="prophecy-ref-label">Profeti:</span>{' '}
                      <a href={prophecyRefUrl(p.prophecy)}>{p.prophecy.reference}</a>
                    </span>
                    <span class="prophecy-arrow" aria-hidden="true">→</span>
                    <span class="prophecy-ref">
                      <span class="prophecy-ref-label">
                        {p.category_id === 'endtimes' ? 'NT-referanse:' : 'Oppfylt:'}
                      </span>{' '}
                      {p.fulfillments.map((f, i) => (
                        <>
                          {i > 0 && ', '}
                          <a href={prophecyRefUrl(f)}>{f.reference}</a>
                        </>
                      ))}
                    </span>
                  </div>

                  {p.explanation && (
                    <p class="prophecy-explanation">
                      <InlineRefs text={p.explanation} />
                    </p>
                  )}

                  <div class="study-tagging">
                    <ItemTagging itemType="prophecy" itemId={p.id} />
                  </div>

                  <details class="prophecy-verses">
                    <summary>Vis bibelvers</summary>
                    <div class="prophecy-verse-section">
                      <h4>Profetien ({p.prophecy.reference})</h4>
                      <VerseRefList refs={[toVerseRef(p.prophecy)]} />
                    </div>
                    {p.fulfillments.map((f) => (
                      <div class="prophecy-verse-section">
                        <h4>
                          {p.category_id === 'endtimes' ? 'NT-referanse' : 'Oppfyllelse'} ({f.reference})
                        </h4>
                        <VerseRefList refs={[toVerseRef(f)]} />
                      </div>
                    ))}
                  </details>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /paralleller ----------

const GOSPEL_NAMES: Record<string, string> = {
  matthew: 'Matteus', mark: 'Markus', luke: 'Lukas', john: 'Johannes',
};
const GOSPEL_ORDER = ['matthew', 'mark', 'luke', 'john'];

r.get('/paralleller', async (c) => {
  const sections = await getGospelParallelSections();
  const parallels = await getGospelParallels();
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));

  // SSR av selve tekstene (som gamle appen lazy-lastet per parallell):
  // hent hvert kapittel bare én gang — mange passasjer deler kapittel.
  const chapterCache = new Map<string, Awaited<ReturnType<typeof getVerses>>>();
  for (const p of parallels) {
    for (const passage of Object.values(p.passages ?? {})) {
      const key = `${passage.book_id}-${passage.chapter}`;
      if (!chapterCache.has(key)) {
        chapterCache.set(key, await getVerses(passage.book_id, passage.chapter));
      }
    }
  }
  const passageVerses = (passage: { book_id: number; chapter: number; verse_start: number; verse_end: number }) =>
    (chapterCache.get(`${passage.book_id}-${passage.chapter}`) ?? []).filter(
      (v) => v.verse >= passage.verse_start && v.verse <= passage.verse_end,
    );

  return c.html(
    <Layout
      title="Parallelle evangelietekster — FLOGVIT.bibel"
      description="Sammenlign parallelle tekster fra de fire evangeliene side ved side."
      styles={['overview.css', 'persons.css']}
      scripts={['card-filter.js']}
    >
      <div class="overview-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Paralleller' }]} />
          <h1>Parallelle evangelietekster</h1>
          <p class="overview-intro">
            Sammenlign parallelle tekster fra de fire evangeliene. Mange av Jesu ord og gjerninger
            er gjengitt i flere evangelier, ofte med små forskjeller i ordlyd og vinkling. Klikk på
            en parallell for å se hvilke evangelier den finnes i.
          </p>

          <div class="study-filter-buttons" data-card-catfilter>
            <button type="button" class="persons-filter-button active" data-value="">
              Alle deler
            </button>
            {sections.map((s) => (
              <button type="button" class="persons-filter-button" data-value={s.id}>
                {s.name}
              </button>
            ))}
          </div>

          <div class="parallel-list" data-card-list>
            {parallels.map((p) => (
              <details class="parallel-card" data-cat={p.section_id}>
                <summary class="parallel-summary">
                  <span class="parallel-title">{p.title}</span>
                  <span class="parallel-section">{sectionName.get(p.section_id) || ''}</span>
                </summary>
                <div class="parallel-body">
                  {p.notes && (
                    <p class="parallel-notes">
                      <InlineRefs text={p.notes} />
                    </p>
                  )}
                  <div class="parallel-columns">
                    {GOSPEL_ORDER.map((g) => {
                      const passage = p.passages?.[g];
                      return (
                        <div class={`parallel-column parallel-${g}`}>
                          <span class="parallel-gospel">{GOSPEL_NAMES[g]}</span>
                          {passage ? (
                            <>
                              <a
                                href={`/${toUrlSlug(passage.book_short_name || '')}/${passage.chapter}#v${passage.verse_start}`}
                                class="parallel-passage-ref"
                              >
                                {passage.reference}
                              </a>
                              <div class="parallel-verses">
                                {passageVerses(passage).map((v) => (
                                  <p class="parallel-verse">
                                    <span class="parallel-verse-num">{v.verse}</span> {v.text}
                                  </p>
                                ))}
                              </div>
                            </>
                          ) : (
                            <span class="parallel-no-passage">Ikke i {GOSPEL_NAMES[g]}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /tidslinje ----------
// SSR-innhold: periodene med sine hendelser (kronologisk). Den grafiske
// tidslinje-visualiseringen (MultiTimelineView) kan legges på som øy senere;
// dette innholdet er fullt lesbart og SEO-vennlig uten JS.

r.get('/tidslinje', async (c) => {
  const data = await getMultiTimeline();
  // Gruppér bibelhendelsene under periodene (rekkefølge fra periods-lista).
  const byPeriod = new Map<string, typeof data.bible.events>();
  for (const p of data.bible.periods) byPeriod.set(p.id, []);
  const orphans: typeof data.bible.events = [];
  for (const e of data.bible.events) {
    const bucket = e.period_id ? byPeriod.get(e.period_id) : undefined;
    if (bucket) bucket.push(e);
    else orphans.push(e);
  }

  return c.html(
    <Layout
      title="Bibelens tidslinje — FLOGVIT.bibel"
      description="En kronologisk oversikt over de viktigste hendelsene i Bibelen og verdenshistorien."
      styles={['overview.css']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Tidslinje' }]} />
          <h1>Bibelens tidslinje</h1>
          <p class="overview-intro">
            En kronologisk oversikt over de viktigste hendelsene i Bibelen og verdenshistorien, fra
            skapelsen til den tidlige kirkens tid.
          </p>

          {data.bible.periods.map((period) => {
            const events = byPeriod.get(period.id) || [];
            if (events.length === 0) return null;
            return (
              <section class="timeline-period">
                <h2 class="timeline-period-name" style={period.color ? `border-left-color: ${period.color}` : ''}>
                  {period.name}
                </h2>
                {period.description && <p class="timeline-period-desc">{period.description}</p>}
                <ol class="timeline-events">
                  {events.map((e) => (
                    <li class="timeline-event">
                      <div class="timeline-event-head">
                        <span class="timeline-event-title">{e.title}</span>
                        {e.year_display && <span class="timeline-event-year">{e.year_display}</span>}
                      </div>
                      {e.description && <p class="timeline-event-desc">{e.description}</p>}
                      {e.references && e.references.length > 0 && (
                        <div class="timeline-event-refs">
                          {e.references.map((ref) => (
                            <a
                              href={`/${toUrlSlug(ref.book_short_name || '')}/${ref.chapter}#v${ref.verse_start}`}
                              class="person-ref-chip"
                            >
                              {ref.book_short_name} {ref.chapter}:{ref.verse_start}
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
          {orphans.length > 0 && (
            <section class="timeline-period">
              <h2 class="timeline-period-name">Øvrige hendelser</h2>
              <ol class="timeline-events">
                {orphans.map((e) => (
                  <li class="timeline-event">
                    <div class="timeline-event-head">
                      <span class="timeline-event-title">{e.title}</span>
                      {e.year_display && <span class="timeline-event-year">{e.year_display}</span>}
                    </div>
                    {e.description && <p class="timeline-event-desc">{e.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /statistikk ----------

// Tusenskille med tynt mellomrom (nb-NO), deterministisk.
function nf(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

r.get('/statistikk', async (c) => {
  const bible = c.req.query('bible') || 'osnb2';
  const stats = await getBibleStatistics(bible);
  const topWords = await getTopWords(bible, 100, false);
  const ot = stats.books.filter((b) => b.testament === 'OT');
  const nt = stats.books.filter((b) => b.testament === 'NT');

  function statCard(value: number, label: string) {
    return (
      <div class="stat-card">
        <div class="stat-value">{nf(value)}</div>
        <div class="stat-label">{label}</div>
      </div>
    );
  }
  function bookRows(books: typeof stats.books) {
    return books.map((b) => (
      <tr>
        <td>
          <a href={`/${toUrlSlug(b.shortName)}/1`}>{b.bookName}</a>
        </td>
        <td class="num">{nf(b.chapters)}</td>
        <td class="num">{nf(b.verses)}</td>
        <td class="num">{nf(b.words)}</td>
        <td class="num">{nf(b.originalWords)}</td>
      </tr>
    ));
  }

  return c.html(
    <Layout
      title="Bibelstatistikk — FLOGVIT.bibel"
      description="Oversikt over bøker, kapitler, vers og ord i Bibelen, samt de hyppigste ordene."
      styles={['overview.css']}
      scripts={['statistics.js']}
    >
      <div class="overview-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Statistikk' }]} />
          <h1>Bibelstatistikk</h1>

          <section class="overview-section">
            <h2>Oversikt</h2>
            <div class="stat-grid">
              {statCard(stats.totalBooks, 'Bøker')}
              {statCard(stats.totalChapters, 'Kapitler')}
              {statCard(stats.totalVerses, 'Vers')}
              {statCard(stats.totalWords, 'Ord')}
            </div>
            {ot.length > 0 && nt.length > 0 && (
              <div class="stat-comparison">
                <div class="stat-comparison-card">
                  <h3>Det gamle testamente</h3>
                  <div class="stat-comparison-row"><span>Bøker</span><span>{nf(stats.otBooks)}</span></div>
                  <div class="stat-comparison-row"><span>Kapitler</span><span>{nf(stats.otChapters)}</span></div>
                  <div class="stat-comparison-row"><span>Vers</span><span>{nf(stats.otVerses)}</span></div>
                  <div class="stat-comparison-row"><span>Ord</span><span>{nf(stats.otWords)}</span></div>
                </div>
                <div class="stat-comparison-card">
                  <h3>Det nye testamente</h3>
                  <div class="stat-comparison-row"><span>Bøker</span><span>{nf(stats.ntBooks)}</span></div>
                  <div class="stat-comparison-row"><span>Kapitler</span><span>{nf(stats.ntChapters)}</span></div>
                  <div class="stat-comparison-row"><span>Vers</span><span>{nf(stats.ntVerses)}</span></div>
                  <div class="stat-comparison-row"><span>Ord</span><span>{nf(stats.ntWords)}</span></div>
                </div>
              </div>
            )}
          </section>

          <section class="overview-section">
            <h2>Bøker</h2>
            <div class="stat-table-wrap">
              <table class="stat-table">
                <thead>
                  <tr>
                    <th>Bok</th>
                    <th class="num">Kapitler</th>
                    <th class="num">Vers</th>
                    <th class="num">Ord</th>
                    <th class="num">Grunntekst</th>
                  </tr>
                </thead>
                <tbody>
                  {bookRows(ot)}
                  {bookRows(nt)}
                </tbody>
              </table>
            </div>
          </section>

          <section class="overview-section">
            <h2>Hyppigste ord</h2>
            <div class="stat-word-tabs" role="group" aria-label="Ordkilde">
              <button type="button" class="stat-word-tab active" data-wordtab="translation" aria-pressed="true">
                Oversettelse
              </button>
              <button type="button" class="stat-word-tab" data-wordtab="hebrew" aria-pressed="false">
                Hebraisk
              </button>
              <button type="button" class="stat-word-tab" data-wordtab="greek" aria-pressed="false">
                Gresk
              </button>
            </div>
            <ol class="stat-word-list" id="stat-words" data-bible={bible}>
              {topWords.map((w) => (
                <li class="stat-word-item">
                  <span class="stat-word">{w.word}</span>
                  <span class="stat-word-count">{nf(w.count)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Layout>,
  );
});

export default r;
