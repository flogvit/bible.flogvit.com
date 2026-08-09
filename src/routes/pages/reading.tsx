// Lesesiden — port av bibel/src/pages/ChapterPage.tsx + ChapterContent og
// komponentene i bibel/src/components/bible/ (VerseDisplay, ChapterToc,
// Summary, ImportantWords, ChapterInsightsPanel, ChapterParallelsView,
// ReadingSidebar/sidebar/StudyPanel, MobileToolbar/MobileSidebarOverlay,
// LayoutModeButtons) + TextPage.tsx (/tekst).
//
// Alt innhold SSR-es (vers, grunntekst, undertekst, ord-for-ord, referanser,
// profetier, sammendrag, TOC, Studium-sidebar). Interaktivitet er øyer:
// public/js/reading.js (versdetaljer, layout-modus, leseposisjon, kopiering)
// og public/js/studium.js (sidebar-blokker, panelfaner, mobil-verktøylinje).
// Kontrakten mot shortcuts.js: <body data-book-slug data-chapter
// data-max-chapter data-next-book-slug data-bible-query> + CustomEvents
// 'bibel:layout-mode' og 'bibel:panel-tab' ([data-panel-tabs]-container).

import { Hono } from 'hono';
import { raw } from 'hono/html';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { Footnotes } from '../../views/footnotes.tsx';
import { InlineRefs } from '../../views/inline-refs.tsx';
import { Markdown } from '../../views/markdown.tsx';
import { ItemTagging } from '../../views/item-tagging.tsx';
import { VerseView } from '../../views/verse-display.tsx';
import { booksData, getBookInfoBySlug, getBookInfoById, bookName, bookNameById, bookAbbr, bookAbbrById } from '../../lib/books-data.ts';
import type { BookInfo } from '../../lib/books-data.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
// @ts-expect-error — delt klient-modul uten typer (formen bor ett sted, se #91)
import { verseHash } from '../../../public/js/verse-hash.js';
import { parseStandardRef, refSegmentToUrl } from '../../lib/standard-ref-parser.ts';
import { parseVerseTemplate } from '../../lib/verse-template.ts';
import { tCtx, tEnum } from '../../lib/i18n.ts';
import {
  getVerses,
  getOriginalVerses,
  getOriginalLanguage,
  getBookSummary,
  getChapterSummary,
  getChapterContext,
  getChapterInsight,
  getOriginalWord4WordByVerse,
  getReferencesByVerse,
  getImportantWords,
  getTimelineEventsForChapter,
  getPropheciesForChapter,
  getPersonsByChapter,
  getThemesByChapter,
  getStoriesByChapter,
  getNumberSymbolismByChapter,
  getReadingTextsByChapter,
  getGospelParallelsForChapter,
  getVersesWithOriginal,
  formatReference,
  normalizeBibleId,
  readableBibleCandidates,
  defaultBibleForLanguage,
} from '../../lib/bible.ts';
import type {
  BibleCandidate,
  Verse,
  Word4Word,
  Reference,
  Prophecy,
  TimelineEvent,
  GospelParallel,
  GospelParallelPassage,
  VerseRef,
} from '../../lib/bible.ts';
import { mapChapter, resolveMappingId, getAvailableMappings } from '../../lib/verse-mapper.ts';
import { getWorksForChapter, workHref, encodeKvn, type WorkRef } from '../../lib/works.ts';
import { layoutProps, tFor, type Translator, type MessageKey, lhref } from '../../lib/i18n.ts';
import { localeToContentLanguage } from '../../lib/lang.ts';
import { relFor } from '../../lib/crawl.ts';
import { chapterShareCard } from '../../lib/share-card.ts';
import { absoluteUrl } from '../../lib/site-url.ts';

const r = new Hono<AppEnv>();

// ── Hjelpere ──────────────────────────────────────────────────────────

/** Bevar bible/mapping/secondary i lenker (som gamle bibleQuery, utvidet). */
function buildQuery(
  bible: string,
  mapping: string | undefined,
  secondary: string | undefined,
  defaultBible = 'osnb',
): string {
  const params = new URLSearchParams();
  if (bible && bible !== defaultBible) params.set('bible', bible);
  if (mapping && mapping !== 'osnb') params.set('mapping', mapping);
  if (secondary) params.set('secondary', secondary);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * «Bidra» med kapittelet som opphav. Bygges ett sted fordi den står to steder:
 * i skinna (desktop) og i ⚙-arket (mobil) — se #56.
 */
const contribChapterHref = (bookSlug: string, chapter: number) => `/bidra?kap=${bookSlug}-${chapter}`;

/** Kort etikett over undertekst-stripen (som undertekstShortLabel). */
function undertekstShortLabel(id: string | undefined): string {
  if (!id) return '';
  if (id === 'osnb') return 'nb';
  if (id === 'osnn') return 'nn';
  if (id === '1930') return '1930';
  if (id === 'dnb2024') return '2024';
  return id;
}

/** Ren tekst-utdrag til meta description (fjerner klammer-refs og maler). */
function excerpt(text: string, max = 160): string {
  const plain = text
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\[[a-zæøå]+:([^\]|]+)(?:\|([^\]]+))?\]/gi, (_m, v: string, label?: string) => label || v)
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}…`;
}

// Samme bokgrupper som gamle ChapterToc
// Samme gruppenøkler som forsidens bokliste — etikettene bor ett sted.
const TOC_CATEGORIES: { key: MessageKey; range: [number, number] }[] = [
  { key: 'grp.pentateuch', range: [1, 5] },
  { key: 'grp.historical', range: [6, 17] },
  { key: 'grp.poetic', range: [18, 22] },
  { key: 'grp.prophets', range: [23, 39] },
  { key: 'grp.gospels', range: [40, 44] },
  { key: 'grp.pauline', range: [45, 57] },
  { key: 'grp.other', range: [58, 66] },
];

// ── Datamodell for SSR-kapittelet ────────────────────────────────────

interface DisplayVerse {
  verse: Verse; // verse.chapter/verse.verse er visningsnummerering
  osnbChapter: number;
  osnbVerse: number;
  originalText: string | null;
  secondaryText: string | null;
  word4word: Word4Word[];
  references: Reference[];
  prophecies: Prophecy[];
  works: WorkRef[];
}

interface ChapterData {
  verses: DisplayVerse[];
  bookSummary: string | null;
  summary: string | null;
  context: string | null;
  insight: unknown | null;
  importantWords: { word: string; explanation: string }[];
  timelineEvents: TimelineEvent[];
  persons: { id: string; name: string; verses: number[] }[];
  themes: { id: number; name: string; title: string; verses: number[] }[];
  stories: { slug: string; title: string; category: string }[];
  numbers: { number: number; meaning: string }[];
  readingTexts: { id: number; name: string; date: string }[];
  parallels: GospelParallel[];
  chapterProphecies: Prophecy[];
  chapterWorks: WorkRef[];
}

function versesInProphecy(p: Prophecy, bookId: number, chapter: number, verse: number): boolean {
  const hit = (ref: { book_id: number; chapter: number; verse_start: number; verse_end: number }) =>
    ref.book_id === bookId && ref.chapter === chapter && verse >= ref.verse_start && verse <= ref.verse_end;
  if (hit(p.prophecy)) return true;
  return p.fulfillments.some(hit);
}

async function loadChapterData(
  bookId: number,
  chapter: number,
  bible: string,
  mapping: string | null,
  secondary: string | undefined,
  contentLang = 'nb',
): Promise<ChapterData | null> {
  // Derivert innhold (sammendrag, referanser, ord-for-ord …) følger UI-ets
  // innholdsspråk, ikke bibelutgaven — getterne faller selv tilbake via
  // contentLanguageChain når språket mangler.
  const lang = contentLang;

  // Vers (med ev. KVN-mapping) — samme oppsett som /api/chapter.
  let base: { verse: Verse; osnbChapter: number; osnbVerse: number }[];
  if (mapping && mapping !== 'osnb') {
    const mapped = await mapChapter(bookId, chapter, mapping, bible);
    if (mapped.length === 0) return null;
    base = mapped.map((m) => ({
      verse: { ...m.verse, chapter: m.displayChapter, verse: m.displayVerse },
      osnbChapter: m.osnbChapter,
      osnbVerse: m.osnbVerse,
    }));
  } else {
    const versesRaw = await getVerses(bookId, chapter, bible);
    if (versesRaw.length === 0) return null;
    base = versesRaw.map((v) => ({ verse: v, osnbChapter: v.chapter, osnbVerse: v.verse }));
  }

  // Kapittelmetadata bruker osnb-kapittelet (primærinnholdet).
  const primaryChapter = base[0]?.osnbChapter ?? chapter;

  const [bookSummary, summary, context, insight, importantWords, timelineEvents, chapterProphecies] =
    await Promise.all([
      chapter === 1 ? getBookSummary(bookId, lang) : Promise.resolve(null),
      getChapterSummary(bookId, primaryChapter, lang),
      getChapterContext(bookId, primaryChapter, lang),
      getChapterInsight(bookId, primaryChapter, lang),
      getImportantWords(bookId, primaryChapter, lang),
      getTimelineEventsForChapter(bookId, primaryChapter, lang),
      getPropheciesForChapter(bookId, primaryChapter, lang),
    ]);

  // Studium-ressurser (samme kall som /api/search/chapter-resources).
  const [personsRaw, themesRaw, storiesRaw, numbersRaw, readingTextsRaw, parallels, allWorks] = await Promise.all([
    getPersonsByChapter(bookId, primaryChapter, lang),
    getThemesByChapter(bookId, primaryChapter, lang),
    getStoriesByChapter(bookId, primaryChapter, lang),
    getNumberSymbolismByChapter(bookId, primaryChapter, lang),
    getReadingTextsByChapter(bookId, primaryChapter, lang),
    getGospelParallelsForChapter(bookId, primaryChapter, lang),
    getWorksForChapter(bookId, primaryChapter),
  ]);
  // Presise treff (vers/passasje) legges paa hvert vers; kapittel-/bok-nivaa
  // samles i studium-blokka saa de ikke drukner de presise paa hvert vers.
  const preciseWorks = allWorks.filter((w) => w.level === 'verse' || w.level === 'passage');
  const chapterWorks = allWorks
    .filter((w) => w.level === 'chapter' || w.level === 'book')
    .filter((w, i, arr) => arr.findIndex((o) => o.work_id === w.work_id) === i);

  const persons = personsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    verses: (p.references || [])
      .filter((ref) => ref.bookId === bookId && ref.chapterId === primaryChapter)
      .map((ref) => ref.verseId),
  }));
  const themes = themesRaw.map((t) => ({ id: t.id, name: t.name, title: t.title, verses: t.verses }));
  const stories = storiesRaw.map((s) => ({ slug: s.slug, title: s.title, category: s.category }));
  const numbers = numbersRaw.map((n) => ({ number: n.number, meaning: n.meaning }));
  const readingTexts = readingTextsRaw.map((rt) => ({ id: rt.id, name: rt.name, date: rt.date }));

  // Per-vers data: grunntekst, undertekst, ord-for-ord, referanser, profetier.
  //
  // Hentes PER KAPITTEL, ikke per vers (#19). Løkka gjorde fire spørringer per
  // vers — 704 rundturer på Sal 119. Lokalt mot DBngin målte det 8–33 ms og var
  // altså ikke flaskehalsen, men mot en managed database over nett er latensen
  // en annen, og da er antallet rundturer selve kostnaden.
  //
  // Nøkkelen er OSNB-kapittelet, ikke det viste: med en KVN-mapping kan ett
  // visningskapittel spenne over to osnb-kapitler (og gjør det i Salmene). Vi
  // batcher derfor per distinkt osnb-kapittel — normalt ett, av og til to.
  const wantSecondary = !!secondary && secondary !== 'original' && secondary !== bible;
  const osnbChapters = [...new Set(base.map((b) => b.osnbChapter))];
  const perChapter = new Map(
    await Promise.all(
      osnbChapters.map(async (ch) => {
        const [original, sec, word4word, references] = await Promise.all([
          getOriginalVerses(bookId, ch),
          wantSecondary ? getVerses(bookId, ch, secondary) : Promise.resolve([]),
          getOriginalWord4WordByVerse(bookId, ch, lang),
          getReferencesByVerse(bookId, ch, lang),
        ]);
        const text = (rows: Verse[]) => new Map(rows.map((v) => [v.verse, v.text] as const));
        return [ch, { original: text(original), secondary: text(sec), word4word, references }] as const;
      }),
    ),
  );

  const verses: DisplayVerse[] = [];
  for (const b of base) {
    const ch = perChapter.get(b.osnbChapter)!;
    verses.push({
      verse: b.verse,
      osnbChapter: b.osnbChapter,
      osnbVerse: b.osnbVerse,
      originalText: ch.original.get(b.osnbVerse) ?? null,
      secondaryText: ch.secondary.get(b.osnbVerse) ?? null,
      word4word: ch.word4word.get(b.osnbVerse) ?? [],
      references: ch.references.get(b.osnbVerse) ?? [],
      prophecies: chapterProphecies.filter((p) => versesInProphecy(p, bookId, b.osnbChapter, b.osnbVerse)),
      works: preciseWorks.filter((w) => {
        const k = encodeKvn(bookId, b.osnbChapter, b.osnbVerse);
        return w.kvn_from <= k + 15 && w.kvn_to >= k;
      }),
    });
  }

  return {
    verses,
    chapterWorks,
    bookSummary,
    summary,
    context,
    insight,
    importantWords,
    timelineEvents,
    persons,
    themes,
    stories,
    numbers,
    readingTexts,
    parallels,
    chapterProphecies,
  };
}

/**
 * Prøver kandidat-utgavene i rekkefølge og serverer den første som har
 * kapittelet (GitHub #13). Gyldige bok/kapittel-referanser skal aldri 404-e
 * fordi språkets utgave (eller ett av kapitlene dens) mangler — de faller til
 * neste utgave i kjeden. Eksportert for test.
 */
export async function loadChapterWithFallback(
  bookId: number,
  chapter: number,
  candidates: BibleCandidate[],
  mapping: string | null,
  secondary: string | undefined,
  contentLang: string,
): Promise<{ data: ChapterData | null; bible: BibleCandidate }> {
  for (const candidate of candidates) {
    const data = await loadChapterData(bookId, chapter, candidate.id, mapping, secondary, contentLang);
    if (data) return { data, bible: candidate };
  }
  return { data: null, bible: candidates[0] ?? { id: 'osnb', lang: 'nb' } };
}

// ── Tekst med {{ref}}-maler (port av VerseTemplateText, server-side) ─

async function TemplateText({ text }: { text: string }) {
  const parts = parseVerseTemplate(text);
  if (!parts.some((p) => p.type === 'verse')) return <>{text}</>;

  const rendered = await Promise.all(
    parts.map(async (part) => {
      if (part.type === 'text') return <>{part.content}</>;
      const segments = parseStandardRef(part.refString || part.content);
      const first = segments[0];
      if (!first) return <span class="vtt-missing">[{part.content}]</span>;
      const verseNums = first.verses || (first.fromVerse ? [first.fromVerse] : []);
      const refObj: VerseRef = { bookId: first.bookId, chapter: first.chapter, verses: verseNums };
      const verses = await getVersesWithOriginal([refObj]);
      const textJoined = verses.map((v) => v.verse.text).join(' ');
      const label = `${first.bookShortName} ${first.chapter}`;
      if (!textJoined) return <span class="vtt-missing">[{part.content}]</span>;
      return (
        <a href={lhref(refSegmentToUrl(first))} class="inline-ref vtt-verse" data-ref={part.refString} title={label}>
          {textJoined}
        </a>
      );
    }),
  );
  return <span>{rendered}</span>;
}

// ── ChapterToc (venstre sidekolonne) ─────────────────────────────────

function ChapterToc({
  book,
  bookSlug,
  chapter,
  query,
  t,
}: {
  book: BookInfo;
  bookSlug: string;
  chapter: number;
  query: string;
  t: Translator;
}) {
  const category = TOC_CATEGORIES.find((c) => book.id >= c.range[0] && book.id <= c.range[1]);
  const siblings = category ? booksData.filter((b) => b.id >= category.range[0] && b.id <= category.range[1]) : [];

  return (
    <nav class="chapter-toc-nav" aria-label={t('rd.chapterNavAria')}>
      <div class="toc-group-label">{bookName(book)}</div>
      <div class="toc-chapter-grid">
        {Array.from({ length: book.chapters }, (_, i) => i + 1).map((ch) => (
          <a
            href={lhref(`/${bookSlug}/${ch}${query}`)}
            rel={relFor(query)}
            class={`toc-chapter-cell ${ch === chapter ? 'is-active' : ''}`}
            aria-current={ch === chapter ? 'page' : undefined}
          >
            {ch}
          </a>
        ))}
      </div>

      {category && siblings.length > 1 && (
        <>
          <div class="toc-group-label">{tCtx()(category.key)}</div>
          {siblings.map((b) => (
            <a
              href={lhref(`/${toUrlSlug(b.short_name)}/1${query}`)}
              rel={relFor(query)}
              class={`toc-item ${b.id === book.id ? 'is-active' : ''}`}
            >
              <span class="toc-item-name">{bookName(b)}</span>
              <span class="toc-item-chapters">{b.chapters}</span>
            </a>
          ))}
        </>
      )}

      <div class="toc-group-label">{t('rd.allBooks')}</div>
      <a href={lhref('/')} class="toc-item">
        <span class="toc-item-name">{t('rd.toFrontPage')}</span>
      </a>
    </nav>
  );
}

// ── Kapittelinnsikt (port av ChapterInsightsPanel) ───────────────────
// Data er JSON fra chapter_insights — samme typer som gamle
// data/chapterInsightTypes.ts (genealogy/list/two-column/person-list/
// creation/faith-heroes). Rendres som <details> (virker uten JS).

/* eslint-disable @typescript-eslint/no-explicit-any */
function ChapterInsights({ t, insight }: { t: Translator; insight: any }) {
  if (!insight || typeof insight !== 'object' || !insight.type) return null;
  return (
    <details class="insights-panel">
      <summary class="insights-toggle">
        <span class="insights-toggle-icon" aria-hidden="true">
          +
        </span>
        <span>{insight.buttonText}</span>
        <span class="insights-toggle-hint">{insight.hint}</span>
      </summary>
      <div class="insights-content">
        <p class="insights-intro">
          <TemplateText text={insight.intro || ''} />
        </p>
        <InsightContent t={t} insight={insight} />
      </div>
    </details>
  );
}

function InsightContent({ t, insight }: { t: Translator; insight: any }) {
  switch (insight.type) {
    case 'genealogy':
      return <GenealogyContent insight={insight} />;
    case 'list':
      return <ListContent insight={insight} />;
    case 'two-column':
      return <TwoColumnContent insight={insight} />;
    case 'person-list':
      return <PersonListContent insight={insight} />;
    case 'creation':
      return <CreationContent t={t} insight={insight} />;
    case 'faith-heroes':
      return <FaithHeroesContent insight={insight} />;
    default:
      return null;
  }
}

/**
 * Et navn i en ættetavle, personliste eller trosheltefortegnelse. Uten
 * `personId` er det ren tekst — den formen finnes allerede i dataene («Peres»,
 * «Hesron»), og den er også det ryddingen i `person-refs.ts` etterlater når
 * adressen ikke finnes (#61). Da er det navnet som blir stående, ikke en lenke
 * til 404.
 */
function PersonLink({ personId, name, className }: { personId?: string; name: string; className: string }) {
  if (personId) {
    return (
      <a href={lhref(`/personer/${personId}`)} class={className} title={tCtx()('pe.readMoreAbout', { name })}>
        {name}
      </a>
    );
  }
  return <span class={className}>{name}</span>;
}

function GenealogyContent({ insight }: { insight: any }) {
  return (
    <>
      <div class="ins-sections">
        {(insight.sections || []).map((section: any) => (
          <div class="ins-section">
            <h3 class="ins-section-title">
              {section.title}
              <span class="ins-verse-ref">
                v.{section.startVerse}-{section.endVerse}
              </span>
            </h3>
            <div class="ins-person-list">
              {(section.persons || []).map((person: any, i: number) => (
                <div class="ins-person-item">
                  {i > 0 && <span class="ins-arrow">→</span>}
                  <span class="ins-person">
                    <PersonLink personId={person.personId} name={person.name} className="ins-person-link" />
                    {person.years && <span class="ins-person-years">{person.years}</span>}
                    {person.note && <span class="ins-person-note">{person.note}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {insight.footer && (
        <div class="ins-footer">
          <h4>{insight.footer.title}</h4>
          <p>
            <TemplateText text={insight.footer.content || ''} />
            {insight.footer.links && (
              <>
                {' '}
                {insight.footer.links.map((link: any, i: number) => (
                  <span>
                    {i > 0 && ', '}
                    <PersonLink personId={link.personId} name={link.text} className="ins-footer-link" />
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
      )}
    </>
  );
}

function ListContent({ insight }: { insight: any }) {
  return (
    <div class="ins-list">
      {(insight.items || []).map((item: any) => (
        <div class="ins-list-item">
          {item.number != null && <span class="ins-list-number">{item.number}</span>}
          <div class="ins-list-content">
            <h4 class="ins-list-title">{item.title}</h4>
            <p class="ins-list-text">
              <TemplateText text={item.text || ''} />
            </p>
            <span class="ins-list-verses">v.{(item.verses || []).join(', ')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TwoColumnContent({ insight }: { insight: any }) {
  return (
    <>
      <div class="ins-two-column">
        <div class="ins-column">
          <h4 class="ins-column-title">{insight.leftTitle}</h4>
          <span class="ins-column-verses">v.{(insight.verses?.left || []).join('-')}</span>
          <ul class="ins-column-list">
            {(insight.leftItems || []).map((item: any) => (
              <li class="ins-column-item">
                <TemplateText text={item.text || ''} />
              </li>
            ))}
          </ul>
        </div>
        <div class="ins-column-divider" />
        <div class="ins-column">
          <h4 class="ins-column-title">{insight.rightTitle}</h4>
          <span class="ins-column-verses">v.{(insight.verses?.right || []).join('-')}</span>
          <ul class="ins-column-list">
            {(insight.rightItems || []).map((item: any) => (
              <li class="ins-column-item">
                <TemplateText text={item.text || ''} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {insight.footer && (
        <div class="ins-footer">
          <p>
            <TemplateText text={insight.footer} />
          </p>
        </div>
      )}
    </>
  );
}

function PersonListContent({ insight }: { insight: any }) {
  return (
    <div class="ins-person-grid">
      {(insight.persons || []).map((person: any, index: number) => (
        <div class="ins-person-card">
          <span class="ins-person-number">{index + 1}</span>
          <div class="ins-person-info">
            <PersonLink personId={person.personId} name={person.name} className="ins-person-card-name" />
            <p class="ins-person-description">
              <TemplateText text={person.description || ''} />
            </p>
            {person.note && <span class="ins-person-card-note">{person.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreationContent({ t, insight }: { t: Translator; insight: any }) {
  return (
    <div class="ins-creation">
      {(insight.days || []).map((day: any) => (
        <div class="ins-creation-day">
          <div class="ins-day-number">
            <span>Dag {day.day}</span>
          </div>
          <div class="ins-day-content">
            <h4 class="ins-day-title">{day.title}</h4>
            <ul class="ins-day-created">
              {(day.created || []).map((item: string) => (
                <li>{item}</li>
              ))}
            </ul>
            <span class="ins-day-verses">
              v.{day.verses?.[0]}-{day.verses?.[day.verses.length - 1]}
            </span>
          </div>
        </div>
      ))}
      <div class="ins-creation-day">
        <div class="ins-day-number ins-day-rest">
          <span>{t('rd.day7')}</span>
        </div>
        <div class="ins-day-content">
          <h4 class="ins-day-title">{t('rd.rest')}</h4>
          {/* De øvrige dagene har beskrivelsen fra dataene; dag 7 står i koden
              og er derfor UI-tekst som må gjennom ordboka. */}
          <p class="ins-day-description">{t('rd.day7Description')}</p>
        </div>
      </div>
    </div>
  );
}

function FaithHeroesContent({ insight }: { insight: any }) {
  return (
    <div class="ins-heroes-grid">
      {(insight.heroes || []).map((hero: any) => (
        <div class="ins-hero-card">
          <PersonLink personId={hero.personId} name={hero.name} className="ins-hero-name" />
          <p class="ins-hero-deed">
            <TemplateText text={hero.deed || ''} />
          </p>
          <span class="ins-hero-verses">v.{(hero.verses || []).join(', ')}</span>
        </div>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Parallelle tekster (port av ChapterParallelsView, SSR-utgave) ────

type Gospel = 'matthew' | 'mark' | 'luke' | 'john';
const GOSPELS: Gospel[] = ['matthew', 'mark', 'luke', 'john'];
/**
 * Evangelienavnene ER boknavn (40–43). De sto som en hardkodet norsk tabell, så
 * badgene og kolonnene i evangelieparallellene het «Matteus» på alle åtte
 * språk — samme klasse som #20: navnet skal komme fra bokdataene.
 */
const GOSPEL_BOOK_ID: Record<Gospel, number> = { matthew: 40, mark: 41, luke: 42, john: 43 };
const gospelName = (g: Gospel) => bookNameById(GOSPEL_BOOK_ID[g]);
const GOSPEL_COLORS: Record<Gospel, string> = {
  matthew: 'blue',
  mark: 'green',
  luke: 'orange',
  john: 'purple',
};
const BOOK_ID_TO_GOSPEL: Record<number, Gospel> = { 40: 'matthew', 41: 'mark', 42: 'luke', 43: 'john' };

function passageUrl(passage: GospelParallelPassage): string {
  return `/${toUrlSlug(passage.book_short_name || '')}/${passage.chapter}${verseHash(passage.verse_start, passage.verse_end)}`;
}

async function GospelColumn({
  gospel,
  passage,
  bible,
  isCurrentGospel,
}: {
  gospel: Gospel;
  passage: GospelParallelPassage | undefined;
  bible: string;
  isCurrentGospel: boolean;
}) {
  const t = tCtx();
  if (!passage) {
    return (
      <div class={`gospel-column gospel-${gospel}`}>
        <div class="gospel-column-header">
          <span class="gospel-badge">{gospelName(gospel)}</span>
        </div>
        <div class="gospel-no-passage">{t('rd.notInGospel', { gospel: gospelName(gospel) ?? gospel })}</div>
      </div>
    );
  }
  const chapterVerses = await getVerses(passage.book_id, passage.chapter, bible);
  const verses = chapterVerses.filter((v) => v.verse >= passage.verse_start && v.verse <= passage.verse_end);
  return (
    <div class={`gospel-column gospel-${gospel} ${isCurrentGospel ? 'is-current' : ''}`}>
      <div class="gospel-column-header">
        <span class="gospel-badge">
          {gospelName(gospel)}
          {isCurrentGospel && <span class="gospel-current-label">(du leser)</span>}
        </span>
        {!isCurrentGospel && (
          <a href={lhref(passageUrl(passage))} class="gospel-reference-link">
            {passage.reference}
          </a>
        )}
      </div>
      <div class="gospel-verses">
        {verses.map((v) => (
          <p class="gospel-verse">
            <span class="gospel-verse-num">{v.verse}</span>
            {v.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function ChapterParallels({
  bookId,
  chapter,
  parallels,
  bible,
  t,
}: {
  bookId: number;
  chapter: number;
  parallels: GospelParallel[];
  bible: string;
  t: Translator;
}) {
  const currentGospel = BOOK_ID_TO_GOSPEL[bookId];
  if (!currentGospel) return null;
  const relevant = parallels.filter((p) => {
    const passage = p.passages?.[currentGospel];
    return passage && passage.chapter === chapter;
  });
  if (relevant.length === 0) return null;

  return (
    <details class="parallels-container">
      <summary class="parallels-header">
        <span class="parallels-title">{t('rd.parallels')}</span>
        <span class="parallels-subtitle">
          {t('rd.parallelsInChapter', { n: relevant.length })}
        </span>
      </summary>
      <div class="parallels-list">
        {relevant.map((parallel) => {
          const gospelsIn = GOSPELS.filter((g) => parallel.passages?.[g]);
          return (
            <details class="parallel-item">
              <summary class="parallel-item-header">
                <span class="parallel-item-title">{parallel.title}</span>
                <span class="parallel-gospel-badges">
                  {gospelsIn.map((g) => (
                    <span
                      class={`parallel-badge parallel-${GOSPEL_COLORS[g]} ${g === currentGospel ? 'is-current' : ''}`}
                      title={gospelName(g)}
                    >
                      {gospelName(g).charAt(0)}
                    </span>
                  ))}
                </span>
              </summary>
              <div class="parallel-content">
                {parallel.notes && <p class="parallel-notes">{parallel.notes}</p>}
                <div class="parallel-columns" style={`--parallel-cols: ${gospelsIn.length}`}>
                  {gospelsIn.map((g) => (
                    <GospelColumn
                      gospel={g}
                      passage={parallel.passages?.[g]}
                      bible={bible}
                      isCurrentGospel={g === currentGospel}
                    />
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}

// ── Versblokk (port av VerseDisplay) ─────────────────────────────────

function VerseStrip({
  originalText,
  secondaryText,
  secondary,
  hebrew,
}: {
  originalText: string | null;
  secondaryText: string | null;
  secondary: string | undefined;
  hebrew: boolean;
}) {
  const t = tCtx();
  if (secondary === 'original' && originalText) {
    return (
      <div
        class={`original-verse ${hebrew ? 'hebrew' : 'greek'}`}
        dir={hebrew ? 'rtl' : 'ltr'}
        lang={hebrew ? 'he' : 'el'}
      >
        <span class="undertekst-label" aria-hidden="true">
          {t(hebrew ? 'lang.hebrewShort' : 'lang.greekShort')}
        </span>
        {originalText}
      </div>
    );
  }
  if (secondary && secondary !== 'original' && secondaryText) {
    return (
      <div class="secondary-verse">
        <span class="undertekst-label" aria-hidden="true">
          {undertekstShortLabel(secondary)}
        </span>
        {secondaryText}
      </div>
    );
  }
  return null;
}

const WORK_KIND_ORDER: Record<string, number> = { cites: 0, discusses: 1, covers_passage: 2 };

function WorkItem({ work, t }: { work: WorkRef; t: Translator }) {
  const target = workHref(work);
  const label = work.title || work.doi || work.isbn13 || work.work_id;
  const meta = [work.authors, work.year, work.container].filter(Boolean).join(' · ');
  return (
    <div class="vd-work">
      {target ? (
        <a href={target} rel="noopener" target="_blank" class="vd-work-title">{label}</a>
      ) : (
        <span class="vd-work-title">{label}</span>
      )}
      {meta && <span class="vd-work-meta">{meta}</span>}
      {work.where_page && (
        <span class="vd-work-meta">{t('contrib.worksPage')} {work.where_page}</span>
      )}
    </div>
  );
}

function VerseDetailPanel({
  data,
  bookId,
  hebrew,
  t,
}: {
  data: DisplayVerse;
  bookId: number;
  hebrew: boolean;
  t: Translator;
}) {
  const v = data.verse;
  const n = v.verse;
  const key = `${bookId}-${v.chapter}-${n}`;
  const selectableVersions = (v.versions || []).filter((ver) => ver.type !== 'error');
  const hasVersions = selectableVersions.length > 0;
  const hasFootnotes = !!v.footnotes && v.footnotes.length > 0;
  const book = getBookInfoById(bookId);
  const verseRef = book ? `${book.short_name.toLowerCase()}-${v.chapter}-${n}` : '';

  return (
    <div class="verse-detail" id={`v${n}-detail`} hidden data-verse-key={key}>
      <div class="vd-header">
        <button type="button" class="favorite-toggle" data-fav-toggle>
          ☆ {t('rd.addFavorite')}
        </button>
        <button
          type="button"
          class="verse-read-toggle"
          data-verse-read-toggle
          data-verse-num={n}
          data-label-read={t('rd.read')}
        >
          ○ {t('rd.read')}
        </button>
      </div>

      <div class="vd-tabs" role="tablist" aria-label={`${t('rd.verseDetails')} ${n}`}>
        <button type="button" class="vd-tab is-active" data-vd-tab="original">
          {t('u.originalText')}
        </button>
        <button type="button" class="vd-tab" data-vd-tab="references">
          {t('common.references')} {data.references.length > 0 && `(${data.references.length})`}
        </button>
        {data.works.length > 0 && (
          <button type="button" class="vd-tab" data-vd-tab="works">
            {t('contrib.worksTab')} ({data.works.length})
          </button>
        )}
        {data.prophecies.length > 0 && (
          <button type="button" class="vd-tab" data-vd-tab="prophecies">
            {t('nav.prophecies')} ({data.prophecies.length})
          </button>
        )}
        <button type="button" class="vd-tab" data-vd-tab="topics">
          {t('nav.topicsMine')}
        </button>
        <button type="button" class="vd-tab" data-vd-tab="notes">
          {t('nav.notes')}
        </button>
        <button type="button" class="vd-tab" data-vd-tab="devotionals">
          {t('nav.manuscripts')}
        </button>
        {hasVersions && (
          <button type="button" class="vd-tab" data-vd-tab="versions">
            {t('about.lbl.versions')}
          </button>
        )}
        {hasFootnotes && (
          <button type="button" class="vd-tab" data-vd-tab="footnotes">
            {t('common.footnotes')} ({v.footnotes!.length})
          </button>
        )}
      </div>

      <div class="vd-panes">
        {/* Grunntekst + Ord for ord — data ligger i DOM-et (data-attributter) */}
        <div class="vd-pane is-active" data-vd-pane="original">
          {data.originalText && (
            <div
              class={`full-original-text ${hebrew ? 'hebrew' : 'greek'}`}
              dir={hebrew ? 'rtl' : 'ltr'}
              lang={hebrew ? 'he' : 'el'}
            >
              {data.originalText}
            </div>
          )}
          {data.word4word.length > 0 ? (
            <>
              <h3 class="vd-section-title">{t('rd.wordByWord')}</h3>
              <div
                class={`w4w-words ${hebrew ? 'hebrew-words' : ''}`}
                dir={hebrew ? 'rtl' : 'ltr'}
                lang={hebrew ? 'he' : 'el'}
              >
                {data.word4word.map((w) => (
                  <button
                    type="button"
                    class="w4w-word"
                    data-w4w-word-btn
                    data-word={w.word}
                    data-pron={w.pronunciation || ''}
                    data-expl={w.explanation || ''}
                    aria-pressed="false"
                    aria-label={`${w.word}${w.pronunciation ? ` (${w.pronunciation})` : ''}. Klikk for forklaring`}
                  >
                    <span class="w4w-script">{w.word}</span>
                    {w.pronunciation && <span class="w4w-translit">{w.pronunciation}</span>}
                  </button>
                ))}
              </div>
              <div class="w4w-explain" hidden data-w4w-explain>
                <strong data-w4w-out-word></strong>
                <span class="w4w-pron-inline" data-w4w-out-pron></span>
                <p data-w4w-out-expl></p>
                <a class="search-original-button" data-w4w-search href={lhref('/sok/original')}>
                  {t('rd.searchAllOccurrences')}
                </a>
              </div>
            </>
          ) : (
            <p class="text-muted">{t('rd.noWordData')}</p>
          )}
        </div>

        {/* Referanser */}
        <div class="vd-pane" data-vd-pane="references" hidden>
          <div class="vd-references">
            {data.references.length > 0 ? (
              data.references.map((ref) => (
                <a
                  href={lhref(`/${toUrlSlug(ref.book_short_name || '')}/${ref.to_chapter}${verseHash(ref.to_verse_start, ref.to_verse_end)}`)}
                  class="vd-reference"
                >
                  <span class="vd-ref-link">{formatReference(ref)}</span>
                  {ref.description && (
                    <span class="vd-ref-description">
                      <InlineRefs text={ref.description} />
                    </span>
                  )}
                </a>
              ))
            ) : (
              <p class="text-muted">{t('rd.noRefs')}</p>
            )}
            <a href={lhref(`/bidra?vers=${verseRef}`)} rel="nofollow" class="write-devotional-link">
              {t('contrib.suggestWork')}
            </a>
          </div>
        </div>

        {/* Litteratur — verk fra contrib-pipelinen som treffer dette verset presist */}
        {data.works.length > 0 && (
          <div class="vd-pane" data-vd-pane="works" hidden>
            <div class="vd-works">
              {data.works
                .slice()
                .sort((a, b) => (WORK_KIND_ORDER[a.ref_kind] ?? 3) - (WORK_KIND_ORDER[b.ref_kind] ?? 3))
                .map((work) => (
                  <WorkItem work={work} t={t} />
                ))}
            </div>
          </div>
        )}

        {/* Profetier */}
        {data.prophecies.length > 0 && (
          <div class="vd-pane" data-vd-pane="prophecies" hidden>
            <div class="vd-prophecies">
              {data.prophecies.map((prophecy) => (
                <a href={lhref(`/profetier#${prophecy.id}`)} class="vd-prophecy">
                  <span class="vd-prophecy-title">{prophecy.title}</span>
                  <span class="vd-prophecy-category">{prophecy.category?.name}</span>
                  {prophecy.explanation && (
                    <p class="vd-prophecy-explanation">
                      <InlineRefs text={prophecy.explanation} />
                    </p>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Emner — item-tagging-skallet + tagging.js */}
        <div class="vd-pane" data-vd-pane="topics" hidden>
          <ItemTagging itemType="verse" itemId={key} />
        </div>

        {/* Notater — bygges av reading.js (localStorage 'bible-notes') */}
        <div class="vd-pane" data-vd-pane="notes" hidden>
          <div class="verse-notes" data-verse-notes>
            <div class="notes-list" data-notes-list></div>
            <div class="note-input-wrapper">
              <textarea
                class="note-textarea"
                rows={3}
                placeholder={t('rd.notePh')}
                aria-label={t('rd.noteAria')}
                data-note-input
              ></textarea>
              <button type="button" class="note-add-button" data-note-add disabled>
                {t('rd.addNote')}
              </button>
            </div>
            <noscript>
              <p class="text-muted">{t('rd.notesNeedJs')}</p>
            </noscript>
          </div>
        </div>

        {/* Manuskripter — lokale (localStorage 'bible-devotionals'), fylles av reading.js */}
        <div class="vd-pane" data-vd-pane="devotionals" hidden>
          <div class="vd-devotionals" data-verse-devotionals data-verse-ref={verseRef}>
            <div data-devotionals-list>
              <p class="text-muted">{t('rd.noManuscripts')}</p>
            </div>
            <a href={lhref(`/manuskripter/ny?vers=${verseRef}`)} rel="nofollow" class="write-devotional-link">
              {t('rd.noManuscripts')}
            </a>
          </div>
        </div>

        {/* Versjoner */}
        {hasVersions && (
          <div class="vd-pane" data-vd-pane="versions" hidden>
            <div class="vd-versions" data-versions={JSON.stringify(selectableVersions.map((ver) => ver.text))}>
              <p class="versions-intro">{t('rd.chooseVersion')}</p>
              <div class="version-option">
                <label class="version-label">
                  <input type="radio" name={`version-${key}`} value="" checked data-version-radio />
                  <span class="version-text">
                    <span class="version-title">{t('rd.defaultVersion')}</span>
                    <span class="version-preview">{v.text}</span>
                  </span>
                </label>
              </div>
              {selectableVersions.map((version, index) => (
                <div class="version-option">
                  <label class="version-label">
                    <input type="radio" name={`version-${key}`} value={String(index)} data-version-radio />
                    <span class="version-text">
                      <span class="version-header">
                        <span class="version-title">{t('rd.alternative', { n: index + 1 })}</span>
                        {version.type && (
                          <span class={`version-badge badge-${version.type}`}>
                            {tEnum(t, 'rd.vtype.', version.type)}
                          </span>
                        )}
                        {version.severity && (
                          <span class={`version-severity severity-${version.severity}`}>
                            {tEnum(t, 'rd.vsev.', version.severity)}
                          </span>
                        )}
                      </span>
                      <span class="version-preview">{version.text}</span>
                      {version.explanation && <span class="version-explanation">{version.explanation}</span>}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotnoter */}
        {hasFootnotes && (
          <div class="vd-pane" data-vd-pane="footnotes" hidden>
            <div class="vd-footnotes">
              {v.footnotes!.map((fn) => (
                <div class="vd-footnote">
                  {fn.source && (
                    <span class="vd-footnote-source">{tEnum(t, 'fn.', fn.source.toLowerCase())}</span>
                  )}
                  <p>{fn.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VerseBlock({
  t,
  data,
  bookId,
  secondary,
}: {
  t: Translator;
  data: DisplayVerse;
  bookId: number;
  secondary: string | undefined;
}) {
  const v = data.verse;
  const n = v.verse;
  const hebrew = getOriginalLanguage(bookId) === 'hebrew';

  return (
    <div id={`v${n}`} class="verse" data-verse-num={n} data-verse-id={`${bookId}-${v.chapter}-${n}`}>
      <button
        type="button"
        class="verse-number"
        data-verse-toggle
        aria-expanded="false"
        aria-controls={`v${n}-detail`}
        aria-label={tCtx()('rd.verseAria', { n })}
      >
        {n}
      </button>
      <span class="verse-text" data-verse-text>
        <span data-verse-plain>{v.text}</span>
        {v.footnotes && v.footnotes.length > 0 && <Footnotes footnotes={v.footnotes} />}
      </span>
      <VerseStrip
        originalText={data.originalText}
        secondaryText={data.secondaryText}
        secondary={secondary}
        hebrew={hebrew}
      />
      <VerseDetailPanel t={t} data={data} bookId={bookId} hebrew={hebrew} />
    </div>
  );
}

// ── Studium-sidebar (port av ReadingSidebar/StudyPanel) ──────────────

function StudyBlock({
  id,
  title,
  count,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children?: unknown;
}) {
  return (
    <details class="st-block" data-block-id={id} open={defaultOpen}>
      <summary class="st-block-head">
        <span class="st-block-title">{title}</span>
        {count !== undefined && count > 0 && <span class="st-block-count">{count}</span>}
        <span class="st-block-chevron" aria-hidden="true">
          ▸
        </span>
      </summary>
      <div class="st-block-body">{children}</div>
    </details>
  );
}

function SummaryItem({ title, content, kind }: { title: string; content: string; kind?: string }) {
  return (
    <div class="st-summary-item" data-summary-kind={kind}>
      <h4 class="st-summary-sub">{title}</h4>
      <div class="st-summary-text">
        <Markdown text={content} />
      </div>
    </div>
  );
}

function StudyPanel({
  data,
  book,
  chapter,
  t,
}: {
  data: ChapterData;
  book: BookInfo;
  chapter: number;
  t: Translator;
}) {
  const summaryCount = [data.bookSummary, data.summary, data.context].filter(Boolean).length;
  const newManuscriptRef = `${book.short_name.toLowerCase()}-${chapter}-1`;

  return (
    <div class="study-panel">
      <StudyBlock id="oppslag" title={t('rd.lookup')} defaultOpen={false}>
        <div class="st-lookup" data-lookup>
          <input
            type="search"
            class="st-lookup-input"
            placeholder={tCtx()('rd.refPlaceholder')}
            aria-label={t('rd.lookup')}
            data-lookup-input
          />
          <div data-lookup-results></div>
          <noscript>
            <p class="st-empty">
              {t('rd.lookupNeedsJs')} <a href={lhref('/sok')}>{t('rd.toSearchPage')}</a>.
            </p>
          </noscript>
        </div>
      </StudyBlock>

      <StudyBlock id="sammendrag" title={t('rd.summary')} count={summaryCount} defaultOpen>
        {data.summary && <SummaryItem title={`${t('common.chapter')} ${chapter}`} content={data.summary} kind="chapter" />}
        {data.bookSummary && <SummaryItem title={`${t('rd.aboutBook')} ${bookName(book)}`} content={data.bookSummary} kind="book" />}
        {data.context && <SummaryItem title={t('rd.historicalContext')} content={data.context} kind="context" />}
        {!data.summary && !data.bookSummary && !data.context && (
          <p class="st-empty">{t('rd.noSummary')}</p>
        )}
      </StudyBlock>

      <StudyBlock id="personer" title={t('nav.persons')} count={data.persons.length} defaultOpen>
        {data.persons.length > 0 ? (
          <>
            <div class="st-chip-row">
              {data.persons.map((p) => (
                <a href={lhref(`/personer/${p.id}`)} class="st-chip">
                  {p.name}
                  {p.verses.length > 0 && <span class="st-chip-num">{p.verses.length}</span>}
                </a>
              ))}
            </div>
            <a href={lhref('/personer')} class="st-see-all">
              {t('st.allOf', { what: t('nav.persons').toLowerCase() })} →
            </a>
          </>
        ) : (
          <p class="st-empty">{t('rd.noPersons')}</p>
        )}
      </StudyBlock>

      <StudyBlock id="viktige-ord" title={t('rd.keyWords')} count={data.importantWords.length} defaultOpen={false}>
        {data.importantWords.length > 0 ? (
          <ul class="st-word-list">
            {data.importantWords.slice(0, 8).map((w) => (
              <li class="st-word-item">
                <strong class="st-word-term">{w.word}</strong>
                {w.explanation && (
                  <span class="st-word-expl">
                    {' '}
                    — <InlineRefs text={w.explanation} />
                  </span>
                )}
              </li>
            ))}
            {data.importantWords.length > 8 && (
              <li class="st-word-more">{t('rd.andMore', { n: data.importantWords.length - 8 })}</li>
            )}
          </ul>
        ) : (
          <p class="st-empty">{t('rd.noKeyWords')}</p>
        )}
      </StudyBlock>

      <StudyBlock id="tidslinje" title={t('nav.timeline')} count={data.timelineEvents.length} defaultOpen={false}>
        {data.timelineEvents.length > 0 && (
          <ol class="st-timeline-list">
            {data.timelineEvents.slice(0, 6).map((e) => (
              <li class="st-timeline-item">
                <span class="st-timeline-year">{e.year_display || ''}</span>
                <a href={lhref(`/tidslinje#${e.id}`)} class="st-timeline-title">
                  {e.title}
                </a>
              </li>
            ))}
          </ol>
        )}
        <a href={lhref('/tidslinje')} class="st-see-all">
          {t('rd.seeWholeTimeline')} →
        </a>
      </StudyBlock>

      <StudyBlock id="temaer" title={t('nav.themes')} count={data.themes.length} defaultOpen={false}>
        {data.themes.length > 0 && (
          <div class="st-chip-row">
            {data.themes.map((t) => (
              <a href={lhref(`/temaer/${t.name || String(t.id)}`)} class="st-chip">
                {t.title || t.name}
                {t.verses.length > 0 && <span class="st-chip-num">{t.verses.length}</span>}
              </a>
            ))}
          </div>
        )}
        <a href={lhref('/temaer')} class="st-see-all">
          {t('st.allOf', { what: t('nav.themes').toLowerCase() })} →
        </a>
      </StudyBlock>

      <StudyBlock id="profetier" title={t('nav.prophecies')} count={data.chapterProphecies.length} defaultOpen={false}>
        {data.chapterProphecies.length > 0 && (
          <ul class="st-prop-list">
            {data.chapterProphecies.slice(0, 6).map((p) => (
              <li class="st-prop-item">
                <a href={lhref(`/profetier#${p.id}`)} class="st-prop-title">
                  {p.title}
                </a>
                {p.category?.name && <span class="st-prop-cat">{p.category.name}</span>}
              </li>
            ))}
          </ul>
        )}
        <a href={lhref('/profetier')} class="st-see-all">
          {t('st.allOf', { what: t('nav.prophecies').toLowerCase() })} →
        </a>
      </StudyBlock>

      <StudyBlock id="historier" title={t('nav.stories')} count={data.stories.length} defaultOpen={false}>
        {data.stories.length > 0 && (
          <ul class="st-prop-list">
            {data.stories.map((s) => (
              <li class="st-prop-item">
                <a href={lhref(`/historier/${s.slug}`)} class="st-prop-title">
                  {s.title}
                </a>
                {s.category && <span class="st-prop-cat">{tEnum(t, 'story.cat.', s.category)}</span>}
              </li>
            ))}
          </ul>
        )}
        <a href={lhref('/historier')} class="st-see-all">
          {t('st.allOf', { what: t('nav.stories').toLowerCase() })} →
        </a>
      </StudyBlock>

      <StudyBlock id="paralleller" title={t('rd.parallels')} count={data.parallels.length} defaultOpen={false}>
        {data.parallels.length > 0 && (
          <ul class="st-prop-list">
            {data.parallels.map((p) => {
              const gospels = GOSPELS.filter((g) => p.passages?.[g]).map((g) => gospelName(g));
              return (
                <li class="st-prop-item">
                  <a href={lhref('/paralleller')} class="st-prop-title">
                    {p.title}
                  </a>
                  {gospels.length > 0 && <span class="st-prop-cat">{gospels.join(' · ')}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <a href={lhref('/paralleller')} class="st-see-all">
          {t('st.allOf', { what: t('nav.parallels').toLowerCase() })} →
        </a>
      </StudyBlock>

      <StudyBlock id="tall" title={t('nav.numbers')} count={data.numbers.length} defaultOpen={false}>
        {data.numbers.length > 0 && (
          <div class="st-chip-row">
            {data.numbers.map((n) => (
              <a href={lhref(`/tall/${n.number}`)} class="st-chip">
                {n.number}
                {n.meaning && <span class="st-chip-num">{n.meaning}</span>}
              </a>
            ))}
          </div>
        )}
        <a href={lhref('/tall')} class="st-see-all">
          {t('st.allOf', { what: t('nav.numbers').toLowerCase() })} →
        </a>
      </StudyBlock>

      <StudyBlock id="lesetekster" title={t('nav.readingTexts')} count={data.readingTexts.length} defaultOpen={false}>
        {data.readingTexts.length > 0 && (
          <ul class="st-ms-list">
            {data.readingTexts.map((rt) => (
              <li class="st-ms-item">
                <a href={lhref(`/lesetekster/${rt.date}`)} class="st-ms-title">
                  {rt.name}
                </a>
                {rt.date && <span class="st-ms-type">{rt.date}</span>}
              </li>
            ))}
          </ul>
        )}
        <a href={lhref('/lesetekster')} class="st-see-all">
          {t('st.allOf', { what: t('nav.readingTexts').toLowerCase() })} →
        </a>
      </StudyBlock>

      {data.chapterWorks.length > 0 && (
        <StudyBlock id="litteratur" title={t('contrib.worksChapter')} count={data.chapterWorks.length} defaultOpen={false}>
          <div class="vd-works">
            {data.chapterWorks.map((work) => (
              <div class="vd-work-row">
                <WorkItem work={work} t={t} />
                <span class="vd-work-level">
                  {work.level === 'book' ? t('contrib.worksBook') : t('contrib.worksChapterLevel')}
                </span>
              </div>
            ))}
          </div>
        </StudyBlock>
      )}

      <StudyBlock id="manuskripter" title={t('nav.manuscripts')} defaultOpen>
        {/* Lokale manuskripter (localStorage) fylles inn av studium.js */}
        <ul class="st-ms-list" data-chapter-devotionals data-chapter-prefix={`${book.short_name.toLowerCase()}-${chapter}-`}></ul>
        <a href={lhref(`/manuskripter/ny?ref=${encodeURIComponent(newManuscriptRef)}`)} rel="nofollow" class="st-new-ms-link">
          + {`${t('rd.newManuscriptAbout')} ${bookName(book)} ${chapter}`}
        </a>
      </StudyBlock>
    </div>
  );
}

// ── Panelfaner (høyre sidebar i panelmodus, kontrakt bibel:panel-tab) ─

function PanelTimeline({ t, events, bookId, chapter }: { t: Translator; events: TimelineEvent[]; bookId: number; chapter: number }) {
  if (events.length === 0) {
    return (
      <div class="panel-timeline">
        <p class="st-empty">{t('rd.noTimelineEvents')}</p>
        <a href={lhref('/tidslinje')} class="st-see-all">
          {t('rd.seeWholeTimeline')} →
        </a>
      </div>
    );
  }
  return (
    <div class="panel-timeline">
      {events.map((event) => (
        <div class="pt-event" style={`--period-color: ${event.period?.color || 'var(--gold)'}`}>
          <div class="pt-event-header">
            <span class="pt-event-dot" aria-hidden="true" />
            <span class="pt-event-year">{event.year_display}</span>
            <h4 class="pt-event-title">{event.title}</h4>
          </div>
          {event.description && (
            <p class="pt-event-description">
              <InlineRefs text={event.description} />
            </p>
          )}
          {event.references && event.references.length > 0 && (
            <div class="pt-event-refs">
              {event.references.map((ref) => {
                const isCurrent = ref.book_id === bookId && ref.chapter === chapter;
                const range =
                  ref.verse_start === ref.verse_end ? `${ref.verse_start}` : `${ref.verse_start}-${ref.verse_end}`;
                return (
                  <a
                    href={lhref(`/${toUrlSlug(ref.book_short_name || '')}/${ref.chapter}${verseHash(ref.verse_start, ref.verse_end)}`)}
                    class={`pt-ref-link ${isCurrent ? 'is-current' : ''}`}
                  >
                    {bookAbbrById(ref.book_id)} {ref.chapter}:{range}
                    {isCurrent && <span class="pt-here"> ← {t('rd.youAreHere')}</span>}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <a href={lhref('/tidslinje')} class="st-see-all">
        {t('rd.seeWholeTimeline')} →
      </a>
    </div>
  );
}

// ── Mobil verktøylinje + overlegg (port av MobileToolbar) ────────────

function MobileToolbar({
  book,
  bookSlug,
  chapter,
  query,
  mapping,
  bible,
  secondary,
  defaultBible,
  t,
}: {
  book: BookInfo;
  bookSlug: string;
  chapter: number;
  query: string;
  mapping: string | undefined;
  bible: string;
  secondary: string | undefined;
  defaultBible: string;
  t: Translator;
}) {
  const maxChapter = book.chapters;
  const mappings = getAvailableMappings();
  const otBooks = booksData.filter((b) => b.testament === 'OT');
  const ntBooks = booksData.filter((b) => b.testament === 'NT');
  // Utgavebryterne — samme kapittel, annen utgave. Hoistet ut av JSX-en fordi
  // `rel` avhenger av om stien endte opp med en query (#60, relFor).
  const toolsOsnb = `/${bookSlug}/${chapter}${buildQuery('osnb', mapping, secondary, defaultBible)}`;
  const toolsOsnn = `/${bookSlug}/${chapter}${buildQuery('osnn', mapping, secondary, defaultBible)}`;
  const contribHref = contribChapterHref(bookSlug, chapter);

  return (
    <>
      <div class="mobile-toolbar" data-mobile-toolbar>
        <a
          href={chapter > 1 ? lhref(`/${bookSlug}/${chapter - 1}${query}`) : undefined}
          rel={relFor(query)}
          class={`mt-nav ${chapter === 1 ? 'is-disabled' : ''}`}
          aria-label={`${t('rd.prevChapter')}${chapter > 1 ? `: ${bookName(book)} ${chapter - 1}` : ` (${t('rd.unavailable')})`}`}
          aria-disabled={chapter === 1 ? 'true' : undefined}
        >
          ←
        </a>
        <button type="button" class="mt-title" data-open-picker>
          {bookName(book)} {chapter} <span class="mt-title-arrow" aria-hidden="true">▼</span>
        </button>
        <button type="button" class="mt-sidebar" data-open-studium title={t('rd.studyPanel')} aria-label={t('rd.openStudyPanel')}>
          ▥
        </button>
        <button type="button" class="mt-tools" data-open-tools title={t('rd.aids')} aria-label={t('rd.openAids')}>
          ⚙
        </button>
        <a
          href={chapter < maxChapter ? lhref(`/${bookSlug}/${chapter + 1}${query}`) : undefined}
          rel={relFor(query)}
          class={`mt-nav ${chapter === maxChapter ? 'is-disabled' : ''}`}
          aria-label={`${t('rd.nextChapter')}${chapter < maxChapter ? `: ${bookName(book)} ${chapter + 1}` : ` (${t('rd.unavailable')})`}`}
          aria-disabled={chapter === maxChapter ? 'true' : undefined}
        >
          →
        </a>
      </div>

      {/* Kapittelvelger */}
      <div class="mt-overlay" data-picker-overlay hidden>
        <div class="mt-sheet mt-picker-sheet">
          <div class="mt-sheet-header">
            <h3 data-picker-book-name>{bookName(book)}</h3>
            <button type="button" class="mt-sheet-close" data-close-overlay aria-label={t('common.close')}>
              ✕
            </button>
          </div>
          <div
            class="mt-chapter-grid"
            data-picker-grid
            data-current-slug={bookSlug}
            data-current-chapter={chapter}
            data-query={query}
          >
            {Array.from({ length: maxChapter }, (_, i) => i + 1).map((ch) => (
              <a
                href={lhref(`/${bookSlug}/${ch}${query}`)}
                rel={relFor(query)}
                class={`mt-chapter-cell ${ch === chapter ? 'is-active' : ''}`}
              >
                {ch}
              </a>
            ))}
          </div>
          <div class="mt-book-picker">
            <h4>{t('st.ot')}</h4>
            <div class="mt-book-grid">
              {otBooks.map((b) => (
                <button
                  type="button"
                  class={`mt-book-cell ${b.id === book.id ? 'is-active' : ''}`}
                  data-book-slug={toUrlSlug(b.short_name)}
                  data-book-name={bookName(b)}
                  data-book-chapters={b.chapters}
                >
                  {bookAbbr(b)}
                </button>
              ))}
            </div>
            <h4>{t('st.nt')}</h4>
            <div class="mt-book-grid">
              {ntBooks.map((b) => (
                <button
                  type="button"
                  class={`mt-book-cell ${b.id === book.id ? 'is-active' : ''}`}
                  data-book-slug={toUrlSlug(b.short_name)}
                  data-book-name={bookName(b)}
                  data-book-chapters={b.chapters}
                >
                  {bookAbbr(b)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hjelpemidler — URL-styrte valg (bible/undertekst/nummerering) + skriftstørrelse */}
      <div class="mt-overlay" data-tools-overlay hidden>
        <div class="mt-sheet mt-tools-sheet" role="region" aria-label={t('rd.aids')}>
          <div class="mt-sheet-header">
            <h3>{t('rd.aids')}</h3>
            <button type="button" class="mt-sheet-close" data-close-overlay aria-label={t('common.close')}>
              ✕
            </button>
          </div>
          <div class="tools-section">
            <span class="tools-section-title">{t('rd.translation')}</span>
            <div class="tools-bibles">
              <a
                href={lhref(toolsOsnb)}
                rel={relFor(toolsOsnb)}
                class={`tools-bible-button ${bible === 'osnb' ? 'is-active' : ''}`}
              >
                <span data-proper-names>OSNB (bokmål)</span>
              </a>
              <a
                href={lhref(toolsOsnn)}
                rel={relFor(toolsOsnn)}
                class={`tools-bible-button ${bible === 'osnn' ? 'is-active' : ''}`}
              >
                <span data-proper-names>OSNN (nynorsk)</span>
              </a>
            </div>
          </div>
          <div class="tools-section">
            <span class="tools-section-title">{t('rd.subtext')}</span>
            <select class="tools-select" data-secondary-select aria-label={t('rd.secondaryText')} data-proper-names>
              <option value="" selected={!secondary}>
                {t('common.none')}
              </option>
              <option value="original" selected={secondary === 'original'}>
                {t('u.originalText')}
              </option>
              <option value="osnb" selected={secondary === 'osnb'}>
                OSNB (bokmål)
              </option>
              <option value="osnn" selected={secondary === 'osnn'}>
                OSNN (nynorsk)
              </option>
            </select>
          </div>
          {mappings.length > 0 && (
            <div class="tools-section">
              <span class="tools-section-title">{t('u.versification')}</span>
              <select class="tools-select" data-mapping-select aria-label={t('rd.versification')} data-proper-names>
                {mappings.map((m) => (
                  <option value={m.id} selected={(mapping || 'osnb') === m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div class="tools-section">
            <span class="tools-section-title">{t('u.fontSize')}</span>
            <div class="tools-font-sizes">
              <button type="button" class="tools-font-button" data-font-size="small">
                {t('u.small')}
              </button>
              <button type="button" class="tools-font-button" data-font-size="medium">
                {t('u.medium')}
              </button>
              <button type="button" class="tools-font-button" data-font-size="large">
                {t('u.large')}
              </button>
            </div>
          </div>
          {/* Å bidra er ikke det leseren gjør mest, og skal ikke stå sidestilt
              med lesingen (#56). Her er den én tapp unna uten å konkurrere. */}
          <div class="tools-section">
            <a href={lhref(contribHref)} rel={relFor(contribHref)} class="tools-settings-link">
              {t('contrib.title')} →
            </a>
          </div>
          <div class="tools-section">
            <a href={lhref('/innstillinger')} class="tools-settings-link">
              {t('u.allSettings')} →
            </a>
          </div>
        </div>
      </div>

      {/* Studium-overlegg — studium.js flytter sidebar-innholdet hit */}
      <div class="studium-overlay" data-studium-overlay hidden>
        <div class="studium-overlay-header">
          <div class="studium-overlay-title">{t('rd.study')}</div>
          <button type="button" class="mt-sheet-close" data-close-overlay aria-label={t('rd.closePanel')}>
            ✕
          </button>
        </div>
        <div class="studium-overlay-content" data-studium-overlay-content></div>
      </div>
    </>
  );
}

// ── Kapittelsiden ────────────────────────────────────────────────────

r.get('/:book/:chapter', async (c) => {
  const t = tFor(c);
  const bookSlug = c.req.param('book');
  const chapterStr = c.req.param('chapter');

  // Bokoppslag med alias-støtte (som gamle getBookInfoBySlug via book-aliases).
  const book = getBookInfoBySlug(bookSlug);
  if (!book) return c.notFound();

  const chapter = parseInt(chapterStr, 10);
  if (isNaN(chapter) || chapter < 1 || !/^\d+$/.test(chapterStr)) return c.notFound();
  if (chapter > book.chapters) return c.notFound();

  // Utgavevalget følger locale (GitHub #13): kandidatene kommer fra
  // contentLanguageChain over importerte utgaver, så /en/ serverer osen den
  // dagen den finnes og faller til osnb (med hint) til da — per kapittel.
  // Et eksplisitt ?bible=-valg overstyrer og fallbacker ikke.
  const contentLang = localeToContentLanguage(c.get('locale'));
  const candidates = await readableBibleCandidates(contentLang);
  const localeDefault = candidates[0] ?? { id: 'osnb', lang: 'nb' };

  // Egne opplastede bibler ('user:<uuid>') bor i IndexedDB på klienten: SSR
  // rendrer osnb som grunnlag (studieverktøyene hentes derfra uansett, som i
  // gamle appen), og reading.js bytter ut versteksten fra IndexedDB (#14).
  const explicitBible = normalizeBibleId(c.req.query('bible')) || undefined;
  const requestedBible = explicitBible || localeDefault.id;
  const userBible = requestedBible.startsWith('user:') ? requestedBible : undefined;
  const mappingParam = normalizeBibleId(c.req.query('mapping'));
  const mapping = (mappingParam && mappingParam !== 'osnb' ? resolveMappingId(mappingParam) : null) ?? null;
  const requestedSecondary = c.req.query('secondary') || undefined;
  const userSecondary = requestedSecondary?.startsWith('user:') ? requestedSecondary : undefined;
  const secondary = userSecondary ? undefined : requestedSecondary;

  const canonicalSlug = toUrlSlug(book.short_name);
  const ssrCandidates: BibleCandidate[] =
    userBible ? [{ id: 'osnb', lang: 'nb' }]
    : explicitBible ? [{ id: explicitBible, lang: contentLang }]
    : candidates;
  const { data, bible: served } = await loadChapterWithFallback(
    book.id, chapter, ssrCandidates, mapping, secondary, contentLang,
  );
  if (!data) return c.notFound();
  const bible = served.id;
  // Hint når leseren ba om ett språk og fikk et annet (utgaven/kapittelet
  // er ikke oversatt ennå). Aldri ved eksplisitt valg.
  const untranslated = !explicitBible && !userBible && served.lang !== contentLang;

  const maxChapter = book.chapters;
  const nextBook = getBookInfoById(book.id + 1);
  const nextBookSlug = nextBook ? toUrlSlug(nextBook.short_name) : undefined;
  // Lenker bevarer det FORESPURTE valget (inkl. user:-bibler); locale-
  // defaulten holdes ute av URL-ene så fallbacken virker per kapittel.
  const query = buildQuery(requestedBible, mapping ?? undefined, requestedSecondary, localeDefault.id);

  const title = `${bookName(book)} ${chapter} — FLOGVIT.bible`;
  const description = data.summary
    ? excerpt(data.summary)
    : t('rd.chapterMeta', { book: bookName(book), chapter });

  const undertekstOn = !!secondary && secondary !== 'original';
  const grunntekstOn = secondary === 'original';
  const otherNorwegian = bible === 'osnn' ? 'osnb' : 'osnn';

  // Skinnebryterne — samme kapittel, annet visningsvalg. Hoistet ut av JSX-en
  // fordi `rel` avhenger av om stien endte opp med en query (#60, relFor).
  const railUndertekst = `/${canonicalSlug}/${chapter}${buildQuery(requestedBible, mapping ?? undefined, undertekstOn ? undefined : otherNorwegian, localeDefault.id)}`;
  const railGrunntekst = `/${canonicalSlug}/${chapter}${buildQuery(requestedBible, mapping ?? undefined, grunntekstOn ? undefined : 'original', localeDefault.id)}`;

  // Kontrakten mot shortcuts.js: data-attributter på <body>.
  const bodyData = `(function(d){d.bookSlug=${JSON.stringify(canonicalSlug)};d.chapter='${chapter}';d.maxChapter='${maxChapter}';${
    nextBookSlug ? `d.nextBookSlug=${JSON.stringify(nextBookSlug)};` : ''
  }d.bibleQuery=${JSON.stringify(query)};d.bookId='${book.id}';d.bookName=${JSON.stringify(bookName(book))};d.bibleName=${JSON.stringify(bible.toUpperCase())};d.totalVerses='${data.verses.length}';${
    userBible ? `d.userBible=${JSON.stringify(userBible)};` : ''
  }${userSecondary ? `d.userSecondary=${JSON.stringify(userSecondary)};` : ''}})(document.body.dataset);`;

  const props = layoutProps(c);

  return c.html(
    <Layout {...props}
      title={title}
      description={description}
      canonical={absoluteUrl(lhref(`/${canonicalSlug}/${chapter}`))}
      // Delekortet sier hvilket kapittel lenken peker på (#68). Det er
      // kapittellenkene folk deler, og det generiske kortet gjorde en delt
      // `/en/matt/5` umulig å skille fra en delt forside.
      shareCard={chapterShareCard(book.id, chapter, props.locale)}
      styles={['reading.css', 'studium.css']}
      scripts={['reading.js', 'studium.js', 'ref-preview.js', 'tagging.js', 'user-bibles.js']}
      // Sida er tre deler som deler bredden, ikke én spalte (#78) — lesebredden
      // `--maxw` ville tatt pikslene fra teksten og gitt dem til margen.
      wide
    >
      {raw(`<script>${bodyData}</script>`)}
      <div class="chapter-page" data-reading-root>
        <div class="chapter-layout" data-chapter-layout>
          <aside class="chapter-toc" aria-label={t('rd.chapterNavAria')}>
            <ChapterToc t={t} book={book} bookSlug={canonicalSlug} chapter={chapter} query={query} />
          </aside>

          <article class="chapter-content">
            <div class="chapter-meta">
              <Breadcrumbs
                items={[
                  { label: tCtx()('common.home'), href: '/' },
                  { label: bookName(book), href: `/${canonicalSlug}/1${query}` },
                  { label: tCtx()('rd.chapterCrumb', { n: chapter }) },
                ]}
              />
              <span class="chapter-meta-actions">
                <span class="layout-modes" role="group" aria-label={tCtx()('rd.layoutModesAria')} data-layout-modes>
                  <button type="button" class="layout-mode-btn" data-mode="normal" aria-pressed="true" title={`${tCtx()('kbd.normalView')} (N)`}>
                    <span aria-hidden="true">☰</span>
                    <span class="sr-only">Normal</span>
                  </button>
                  <button type="button" class="layout-mode-btn" data-mode="reading" aria-pressed="false" title={`${tCtx()('kbd.readingMode')} (R)`}>
                    <span aria-hidden="true">📖</span>
                    <span class="sr-only">{t('u.readingMode')}</span>
                  </button>
                  <button type="button" class="layout-mode-btn" data-mode="panel" aria-pressed="false" title={`${tCtx()('kbd.panelMode')} (P)`}>
                    <span aria-hidden="true">▥</span>
                    <span class="sr-only">{t('u.panelMode')}</span>
                  </button>
                </span>
              </span>
            </div>

            <header class="chapter-header">
              {/* Én h1 med bok + kapittel (SEO/skjermleser); visuelt to linjer som før. */}
              <h1 class="chapter-title">
                <span class="chapter-book">{bookName(book)}</span>
                <span class="chapter-number">{t('common.chapter')} {chapter}</span>
              </h1>
              {/* Progresjonsringen ER knappen (#16): den fyller seg selv i
                  auto/foreslå-modus, og klikkes i manuell. Skjult til
                  reading.js har bekreftet plus — ingen død knapp for gratis. */}
              <button
                type="button"
                class="chapter-read-ring"
                data-chapter-read
                hidden
                aria-pressed="false"
                data-label-mark={t('rd.markRead')}
                data-label-read={t('rd.read')}
                data-label-last-read={t('rd.lastRead')}
                data-label-times={t('rd.times')}
              >
                <span class="crr-dial" data-crr-dial aria-hidden="true"></span>
                <span class="crr-label" data-crr-label>{t('rd.markRead')}</span>
              </button>
            </header>

            {/* Foreslå-modus: heuristikken spør i stedet for å markere selv. */}
            <div class="read-suggestion" data-read-suggestion hidden>
              <span>{t('rd.markReadPrompt').replace('%s', `${bookName(book)} ${chapter}`)}</span>
              <button type="button" class="rs-yes" data-suggestion-yes>{t('rd.yes')}</button>
              <button type="button" class="rs-no" data-suggestion-no>{t('common.close')}</button>
            </div>

            {untranslated && (
              <p class="chapter-untranslated" data-untranslated>
                {t('rd.untranslated')}
              </p>
            )}

            <div class="chapter-rail">
              <a
                href={lhref(railUndertekst)}
                rel={relFor(railUndertekst)}
                class={`rail-chip ${undertekstOn ? 'is-on' : ''}`}
                aria-current={undertekstOn ? 'true' : undefined}
                title={t('rd.secondaryUnderVerse')}
              >
                + {t('rd.subtext')}
              </a>
              <a
                href={lhref(railGrunntekst)}
                rel={relFor(railGrunntekst)}
                class={`rail-chip ${grunntekstOn ? 'is-on' : ''}`}
                aria-current={grunntekstOn ? 'true' : undefined}
              >
                {t('u.originalText')}
              </a>
              {chapter > 1 && (
                <a href={lhref(`/${canonicalSlug}/${chapter - 1}${query}`)} rel={relFor(query)} class="rail-chip">
                  ← {t('rd.prevShort')}
                </a>
              )}
              {chapter < maxChapter ? (
                <a href={lhref(`/${canonicalSlug}/${chapter + 1}${query}`)} rel={relFor(query)} class="rail-chip">
                  {t('rd.nextShort')} →
                </a>
              ) : (
                nextBook &&
                nextBookSlug && (
                  <a href={lhref(`/${nextBookSlug}/1${query}`)} rel={relFor(query)} class="rail-chip">
                    {nextBook.name_no} →
                  </a>
                )
              )}
              <a
                href={lhref(contribChapterHref(canonicalSlug, chapter))}
                rel={relFor(contribChapterHref(canonicalSlug, chapter))}
                class="rail-chip"
              >
                {t('contrib.title')}
              </a>
            </div>

            <ChapterInsights t={t} insight={data.insight} />

            <ChapterParallels t={t} bookId={book.id} chapter={chapter} parallels={data.parallels} bible={bible} />

            {/* Vises kun mens et utvalg står inne i versene (reading.js). */}
            <button type="button" class="mark-selection-read" data-mark-selection-read hidden>
              {t('rd.markSelectionRead')}
            </button>

            <section class="verses" data-verses>
              {data.verses.map((v) => (
                <VerseBlock t={t} data={v} bookId={book.id} secondary={secondary} />
              ))}
            </section>

            <footer class="chapter-footer">
              <div class="nav-buttons">
                {chapter > 1 && (
                  <a href={lhref(`/${canonicalSlug}/${chapter - 1}${query}`)} rel={relFor(query)} class="nav-button">
                    ← {t('rd.prevChapter')}
                  </a>
                )}
                {chapter < maxChapter ? (
                  <a href={lhref(`/${canonicalSlug}/${chapter + 1}${query}`)} rel={relFor(query)} class="nav-button">
                    {t('rd.nextChapter')} →
                  </a>
                ) : (
                  nextBook &&
                  nextBookSlug && (
                    <a href={lhref(`/${nextBookSlug}/1${query}`)} rel={relFor(query)} class="nav-button">
                      {nextBook.name_no} →
                    </a>
                  )
                )}
              </div>
            </footer>
          </article>

          <aside class="reading-sidebar" aria-label={tCtx()('rd.toolPanelAria')} data-panel-tabs>
            <div
              class="sidebar-resize"
              data-sidebar-resize
              title={t('rd.resizeHint')}
            ></div>
            {/* studium.js flytter fanerada med inn i mobil-overlegget (#94) */}
            <div class="panel-tabbar" role="tablist" data-panel-tabbar aria-label={tCtx()('rd.panelTabsAria')}>
              <button type="button" class="panel-tab is-active" data-panel-tab="1">
                {t('rd.study')}
              </button>
              <button type="button" class="panel-tab" data-panel-tab="2">
                {t('nav.timeline')}
              </button>
              <button type="button" class="panel-tab" data-panel-tab="3">
                {t('nav.parallels')}
              </button>
              <button type="button" class="panel-tab" data-panel-tab="4">
                {t('rd.insight')}
              </button>
            </div>
            <div class="sidebar-content" data-sidebar-content>
              <section class="panel-section is-active" data-panel-section="1">
                <StudyPanel t={t} data={data} book={book} chapter={chapter} />
              </section>
              <section class="panel-section" data-panel-section="2" hidden>
                <PanelTimeline t={t} events={data.timelineEvents} bookId={book.id} chapter={chapter} />
              </section>
              <section class="panel-section" data-panel-section="3" hidden>
                {data.parallels.length > 0 ? (
                  <ul class="st-prop-list">
                    {data.parallels.map((p) => {
                      const gospels = GOSPELS.filter((g) => p.passages?.[g]).map((g) => gospelName(g));
                      return (
                        <li class="st-prop-item">
                          <a href={lhref('/paralleller')} class="st-prop-title">
                            {p.title}
                          </a>
                          {gospels.length > 0 && <span class="st-prop-cat">{gospels.join(' · ')}</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p class="st-empty">{t('rd.noParallels')}</p>
                )}
              </section>
              <section class="panel-section" data-panel-section="4" hidden>
                {data.insight ? (
                  <div class="insights-content">
                    <InsightContent t={t} insight={data.insight} />
                  </div>
                ) : (
                  <p class="st-empty">{t('rd.noInsight')}</p>
                )}
              </section>
            </div>
          </aside>
        </div>

        <MobileToolbar t={t}
          book={book}
          bookSlug={canonicalSlug}
          chapter={chapter}
          query={query}
          mapping={mapping ?? undefined}
          bible={bible}
          secondary={secondary}
          defaultBible={localeDefault.id}
        />
      </div>
    </Layout>,
  );
});

// ── /tekst — port av TextPage.tsx (query-baserte passasjer) ──────────

interface ParsedTextRef {
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

function parseRefs(refsParam: string | undefined): ParsedTextRef[] {
  if (!refsParam) return [];
  return refsParam
    .split(',')
    .map((ref) => {
      const parts = ref.trim().split('-');
      if (parts.length < 3) return null;
      const bookSlug = parts[0]!;
      const chapter = parseInt(parts[1]!, 10);
      const verseStart = parseInt(parts[2]!, 10);
      const verseEnd = parts[3] ? parseInt(parts[3], 10) : verseStart;
      if (isNaN(chapter) || isNaN(verseStart) || isNaN(verseEnd)) return null;
      return { bookSlug, chapter, verseStart, verseEnd };
    })
    .filter((ref): ref is ParsedTextRef => ref !== null);
}

r.get('/tekst', async (c) => {
  const t = tFor(c);
  const refsParam = c.req.query('refs');
  const bible = normalizeBibleId(c.req.query('bible')) || (await defaultBibleForLanguage());
  const parsedRefs = parseRefs(refsParam);

  // Slug → VerseRef via bok-metadata (alias-støtte som ellers).
  const verseRefs: VerseRef[] = [];
  for (const ref of parsedRefs) {
    const book = getBookInfoBySlug(ref.bookSlug);
    if (!book) continue;
    const verseNumbers: number[] = [];
    for (let v = ref.verseStart; v <= ref.verseEnd; v++) verseNumbers.push(v);
    verseRefs.push({ bookId: book.id, chapter: ref.chapter, verses: verseNumbers });
  }

  const verses = verseRefs.length > 0 ? await getVersesWithOriginal(verseRefs, bible) : [];

  // Grupper per bok/kapittel (som gamle TextPage).
  const grouped: { key: string; bookShortName: string; chapter: number; verses: typeof verses }[] = [];
  for (const verse of verses) {
    const key = `${verse.verse.book_id}-${verse.verse.chapter}`;
    let group = grouped.find((g) => g.key === key);
    if (!group) {
      group = { key, bookShortName: verse.bookShortName, chapter: verse.verse.chapter, verses: [] };
      grouped.push(group);
    }
    group.verses.push(verse);
  }

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('rd.passagesTitle')} — FLOGVIT.bible`}
      description={t('rd.passagesMeta')}
      canonical={absoluteUrl(lhref('/tekst'))}
      styles={['reading.css']}
      scripts={['ref-preview.js']}
    >
      <div class="text-page">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('rd.passagesCrumb') }]} />

          <h1>{t('rd.passages')}</h1>

          {(!refsParam || parsedRefs.length === 0) && (
            <div class="text-empty">
              <h2>{t('rd.noPassages')}</h2>
              <p>
                {t('rd.passagesUsage')}
                <br />
                {t('rd.passagesFormat')} <code>/tekst?refs=1mo-4-1-16,1mo-3-1-24</code>
              </p>
              <p>
                {t('rd.passagesRefFormat')} <code>{t('rd.passagesRefPattern')}</code>
              </p>
              {/* Boknavnene i eksemplene kommer fra bokdataene. Kodene i <code>
                  er NØKLER (en del av URL-formatet) og skal stå som de er. */}
              <ul>
                <li>
                  <code>1mo-1-1-5</code> = {bookNameById(1)} 1:1-5
                </li>
                <li>
                  <code>joh-3-16</code> = {bookNameById(43)} 3:16 ({t('rd.passagesExSingle')})
                </li>
                <li>
                  <code>mat-5-1-12,luk-6-20-26</code> = {t('rd.passagesExMultiple')}
                </li>
              </ul>
            </div>
          )}

          {refsParam && parsedRefs.length > 0 && grouped.length === 0 && (
            <p class="text-error">{t('rd.noValidRefs')}</p>
          )}

          {grouped.length > 0 && (
            <div class="text-passages">
              {grouped.map((group) => {
                const firstVerse = group.verses[0]?.verse.verse;
                const lastVerse = group.verses[group.verses.length - 1]?.verse.verse;
                const verseRange = firstVerse === lastVerse ? `${firstVerse}` : `${firstVerse}-${lastVerse}`;
                const contextUrl = `/${toUrlSlug(group.bookShortName)}/${group.chapter}${verseHash(firstVerse, lastVerse)}`;
                return (
                  <div class="text-passage">
                    <div class="text-passage-header">
                      <h2>
                        <a href={lhref(contextUrl)}>
                          {group.bookShortName} {group.chapter}:{verseRange}
                        </a>
                      </h2>
                      <a href={contextUrl} class="text-context-link">
                        {t('common.showInContext')} →
                      </a>
                    </div>
                    <div class="text-verse-list">
                      {group.verses.map((verseData) => (
                        <VerseView data={verseData} />
                      ))}
                    </div>
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

export default r;
