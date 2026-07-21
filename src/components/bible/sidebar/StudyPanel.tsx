import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDevotionals } from '@/components/DevotionalsContext';
import { useSettings } from '@/components/SettingsContext';
import { getBookInfoById } from '@/lib/books-data';
import { InlineRefs } from '@/components/InlineRefs';
import type { TimelineEvent } from '@/lib/bible';
import styles from './StudyPanel.module.scss';

interface StudyPanelProps {
  bookId: number;
  chapter: number;
  bookName: string;
  bookSummary: string | null;
  chapterSummary: string | null;
  historicalContext: string | null;
  timelineEvents: TimelineEvent[];
  chapterEventIds: string[];
}

interface ChapterResources {
  persons?: Array<{ id: string | number; name: string; title?: string; era?: string; verses?: number[] }>;
  themes?: Array<{ id: string | number; name?: string; title?: string; verses?: number[] }>;
  prophecies?: Array<{ id: string | number; title: string; category_name?: string; verses?: number[] }>;
  words?: Array<{ word: string; explanation?: string }>;
  stories?: Array<{ id: string | number; slug: string; title: string; category?: string; description?: string }>;
  numbers?: Array<{ number: number; meaning?: string; description?: string }>;
  readingTexts?: Array<{ id: string | number; name: string; date?: string; title?: string }>;
  parallels?: Array<{ id: string | number; title: string; gospels?: string[] }>;
}

interface ImportantWord {
  word: string;
  explanation?: string;
}

interface BlockProps {
  id: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

// Compact search box inside the Oppslag block. Hits /api/reference first
// (so "Joh 3,16" jumps straight to the verse), then /api/search/all (resources
// across persons/themes/prophecies/parallels/stories/timeline/words/numbers)
// and shows the top hits as link rows.
interface SearchHit {
  type: 'reference' | 'person' | 'theme' | 'prophecy' | 'parallel' | 'story' | 'timeline' | 'word' | 'number' | 'day' | 'readingText' | 'plan';
  label: string;
  sub?: string;
  to: string;
}

function LookupSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const out: SearchHit[] = [];
      try {
        const refRes = await fetch(`/api/reference?q=${encodeURIComponent(term)}`).then(r => r.ok ? r.json() : null);
        if (refRes?.success && refRes.reference?.url) {
          out.push({ type: 'reference', label: refRes.reference.label || term, sub: 'Gå til vers', to: refRes.reference.url });
        }
        const searchRes = await fetch(`/api/search/all?q=${encodeURIComponent(term)}`).then(r => r.ok ? r.json() : null);
        if (searchRes) {
          if (searchRes.persons) searchRes.persons.slice(0, 5).forEach((p: { id: string; name: string; title?: string; era?: string }) => out.push({ type: 'person', label: p.name, sub: p.title || p.era, to: `/personer/${p.id}` }));
          if (searchRes.themes) searchRes.themes.slice(0, 5).forEach((t: { id: string; name?: string; title?: string }) => out.push({ type: 'theme', label: t.title || t.name || '', to: `/temaer/${t.name || t.id}` }));
          if (searchRes.prophecies) searchRes.prophecies.slice(0, 3).forEach((p: { id: string; title: string; category_name?: string }) => out.push({ type: 'prophecy', label: p.title, sub: p.category_name, to: '/profetier' }));
          if (searchRes.stories) searchRes.stories.slice(0, 3).forEach((s: { slug: string; title: string; category?: string }) => out.push({ type: 'story', label: s.title, sub: s.category, to: `/historier/${s.slug}` }));
          if (searchRes.timeline) searchRes.timeline.slice(0, 3).forEach((t: { id: string; title: string; year_display?: string }) => out.push({ type: 'timeline', label: t.title, sub: t.year_display, to: '/tidslinje' }));
          if (searchRes.readingTexts) searchRes.readingTexts.slice(0, 2).forEach((rt: { id: string; name: string; date?: string }) => out.push({ type: 'readingText', label: rt.name, sub: rt.date, to: `/lesetekster/${rt.id}` }));
          if (searchRes.numberSymbolism) searchRes.numberSymbolism.slice(0, 2).forEach((n: { number: number; meaning?: string }) => out.push({ type: 'number', label: String(n.number), sub: n.meaning, to: `/tall/${n.number}` }));
        }
        if (!cancelled) setHits(out);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  function recordRecent(term: string) {
    const t = term.trim();
    if (!t) return;
    setRecent(prev => [t, ...prev.filter(x => x !== t)].slice(0, 5));
  }

  return (
    <div className={styles.lookup}>
      <input
        type="search"
        className={styles.lookupInput}
        placeholder='"Joh 3,16", "Abraham", "nåde"…'
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {loading && <p className={styles.empty}>Søker…</p>}
      {!loading && hits.length === 0 && q.trim() && (
        <p className={styles.empty}>Ingen treff.</p>
      )}
      {!loading && hits.length > 0 && (
        <ul className={styles.lookupHits}>
          {hits.map((h, i) => (
            <li key={i}>
              <Link to={h.to} className={styles.lookupHit} onClick={() => recordRecent(q)}>
                <span className={`${styles.lookupKind} ${styles[`lookupKind_${h.type}`]}`}>{kindShort(h.type)}</span>
                <span className={styles.lookupLabel}>{h.label}</span>
                {h.sub && <span className={styles.lookupSub}>{h.sub}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!q.trim() && recent.length > 0 && (
        <div className={styles.lookupRecent}>
          <div className={styles.lookupRecentLabel}>Nylige søk</div>
          {recent.map(t => (
            <button key={t} type="button" className={styles.lookupRecentItem} onClick={() => setQ(t)}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function kindShort(type: SearchHit['type']): string {
  switch (type) {
    case 'reference': return 'vers';
    case 'person': return 'person';
    case 'theme': return 'tema';
    case 'prophecy': return 'profeti';
    case 'parallel': return 'parallell';
    case 'story': return 'historie';
    case 'timeline': return 'år';
    case 'word': return 'ord';
    case 'number': return 'tall';
    case 'day': return 'dag';
    case 'readingText': return 'lesetekst';
    case 'plan': return 'plan';
  }
}

function Block({ id, title, count, defaultOpen = true, children }: BlockProps) {
  const { settings, updateSetting } = useSettings();
  const map = settings.studyPanelOpen ?? {};
  const open = map[id] ?? defaultOpen;
  function toggle() {
    updateSetting('studyPanelOpen', { ...map, [id]: !open });
  }
  return (
    <section className={styles.block}>
      <button
        type="button"
        className={`${styles.blockHead} ${open ? styles.blockHeadOpen : ''}`}
        onClick={toggle}
        aria-expanded={open}
      >
        <span className={styles.blockTitle}>{title}</span>
        {count !== undefined && count > 0 && <span className={styles.blockCount}>{count}</span>}
        <span className={styles.blockChevron} aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={styles.blockBody}>{children}</div>}
    </section>
  );
}

export function StudyPanel({
  bookId,
  chapter,
  bookName,
  bookSummary,
  chapterSummary,
  historicalContext,
  timelineEvents,
  chapterEventIds,
}: StudyPanelProps) {
  const [resources, setResources] = useState<ChapterResources | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [importantWords, setImportantWords] = useState<ImportantWord[]>([]);
  const { devotionals, loaded: devotionalsLoaded } = useDevotionals();

  // Fetch chapter resources (persons, prophecies, themes)
  useEffect(() => {
    let cancelled = false;
    setResourcesLoading(true);
    fetch(`/api/search/chapter-resources?bookId=${bookId}&chapter=${chapter}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        setResources(d || {});
        setResourcesLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setResources({});
          setResourcesLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [bookId, chapter]);

  // Fetch important words for current chapter
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/important-words?bookId=${bookId}&chapter=${chapter}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled) return;
        if (Array.isArray(d)) setImportantWords(d);
        else if (d?.words) setImportantWords(d.words);
        else setImportantWords([]);
      })
      .catch(() => { if (!cancelled) setImportantWords([]); });
    return () => { cancelled = true; };
  }, [bookId, chapter]);

  // Manuscripts (devotionals) that cite any verse in this chapter
  const bookInfo = getBookInfoById(bookId);
  const chapterPrefix = bookInfo ? `${bookInfo.short_name.toLowerCase()}-${chapter}-` : '';
  const chapterDevotionals = useMemo(() => {
    if (!devotionalsLoaded || !chapterPrefix) return [];
    return devotionals
      .filter(d => d.verses.some(v => v.startsWith(chapterPrefix)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [devotionals, devotionalsLoaded, chapterPrefix]);

  // Timeline events for this chapter
  const chapterTimelineEvents = useMemo(() => {
    if (!chapterEventIds.length) return [];
    const ids = new Set(chapterEventIds);
    return timelineEvents.filter(e => ids.has(e.id));
  }, [timelineEvents, chapterEventIds]);

  const persons = resources?.persons ?? [];
  const themes = resources?.themes ?? [];
  const prophecies = resources?.prophecies ?? [];
  const stories = resources?.stories ?? [];
  const numbers = resources?.numbers ?? [];
  const readingTexts = resources?.readingTexts ?? [];
  const parallels = resources?.parallels ?? [];

  const newManuscriptRef = bookInfo ? `${bookInfo.short_name.toLowerCase()}-${chapter}-1` : '';

  return (
    <div className={styles.panel}>
      <Block id="oppslag" title="Oppslag" count={0} defaultOpen={false}>
        <LookupSearch />
      </Block>

      <Block id="sammendrag" title="Sammendrag" count={[bookSummary, chapterSummary, historicalContext].filter(Boolean).length}>
        {chapterSummary && (
          <div className={styles.summaryItem}>
            <h4 className={styles.summarySub}>Kapittel {chapter}</h4>
            <div className={styles.summaryText}>
              <InlineRefs markdown>{chapterSummary}</InlineRefs>
            </div>
          </div>
        )}
        {bookSummary && (
          <div className={styles.summaryItem}>
            <h4 className={styles.summarySub}>Om {bookName}</h4>
            <div className={styles.summaryText}>
              <InlineRefs markdown>{bookSummary}</InlineRefs>
            </div>
          </div>
        )}
        {historicalContext && (
          <div className={styles.summaryItem}>
            <h4 className={styles.summarySub}>Historisk kontekst</h4>
            <div className={styles.summaryText}>
              <InlineRefs markdown>{historicalContext}</InlineRefs>
            </div>
          </div>
        )}
        {!chapterSummary && !bookSummary && !historicalContext && (
          <p className={styles.empty}>Ingen sammendrag for dette kapittelet ennå.</p>
        )}
      </Block>

      <Block id="personer" title="Personer" count={persons.length}>
        {resourcesLoading ? (
          <p className={styles.empty}>Laster…</p>
        ) : persons.length > 0 ? (
          <>
            <div className={styles.chipRow}>
              {persons.map(p => (
                <Link key={p.id} to={`/personer/${p.id}`} className={styles.chip}>
                  {p.name}
                  {p.verses && p.verses.length > 0 && (
                    <span className={styles.chipNum}>{p.verses.length}</span>
                  )}
                </Link>
              ))}
            </div>
            <Link to="/personer" className={styles.seeAll}>
              Alle personer →
            </Link>
          </>
        ) : (
          <p className={styles.empty}>Ingen kjente personer i dette kapittelet.</p>
        )}
      </Block>

      <Block id="viktige-ord" title="Viktige ord" count={importantWords.length} defaultOpen={false}>
        {importantWords.length > 0 ? (
          <ul className={styles.wordList}>
            {importantWords.slice(0, 8).map((w, i) => (
              <li key={i} className={styles.wordItem}>
                <strong className={styles.wordTerm}>{w.word}</strong>
                {w.explanation && <span className={styles.wordExpl}> — {w.explanation}</span>}
              </li>
            ))}
            {importantWords.length > 8 && (
              <li className={styles.wordMore}>+ {importantWords.length - 8} til</li>
            )}
          </ul>
        ) : (
          <p className={styles.empty}>Ingen viktige ord ennå for dette kapittelet.</p>
        )}
      </Block>

      <Block id="tidslinje" title="Tidslinje" count={chapterTimelineEvents.length} defaultOpen={false}>
        {chapterTimelineEvents.length > 0 && (
          <ol className={styles.timelineList}>
            {chapterTimelineEvents.slice(0, 6).map(e => (
              <li key={e.id} className={styles.timelineItem}>
                <span className={styles.timelineYear}>{e.year_display || ''}</span>
                <Link to={`/tidslinje#${e.id}`} className={styles.timelineTitle}>{e.title}</Link>
              </li>
            ))}
          </ol>
        )}
        <Link to="/tidslinje" className={styles.seeAll}>
          Se hele tidslinjen →
        </Link>
      </Block>

      <Block id="temaer" title="Temaer" count={themes.length} defaultOpen={false}>
        {themes.length > 0 && (
          <div className={styles.chipRow}>
            {themes.map(t => {
              const label = t.title || t.name || '';
              const slug = t.name || String(t.id);
              return (
                <Link key={t.id} to={`/temaer/${slug}`} className={styles.chip}>
                  {label}
                  {t.verses && t.verses.length > 0 && (
                    <span className={styles.chipNum}>{t.verses.length}</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        <Link to="/temaer" className={styles.seeAll}>
          Alle temaer →
        </Link>
      </Block>

      <Block id="profetier" title="Profetier" count={prophecies.length} defaultOpen={false}>
        {prophecies.length > 0 && (
          <ul className={styles.propList}>
            {prophecies.slice(0, 6).map(p => (
              <li key={p.id} className={styles.propItem}>
                <Link to="/profetier" className={styles.propTitle}>{p.title}</Link>
                {p.category_name && <span className={styles.propCat}>{p.category_name}</span>}
              </li>
            ))}
          </ul>
        )}
        <Link to="/profetier" className={styles.seeAll}>
          Alle profetier →
        </Link>
      </Block>

      <Block id="historier" title="Bibelhistorier" count={stories.length} defaultOpen={false}>
        {stories.length > 0 && (
          <ul className={styles.propList}>
            {stories.map(s => (
              <li key={s.id} className={styles.propItem}>
                <Link to={`/historier/${s.slug}`} className={styles.propTitle}>{s.title}</Link>
                {s.category && <span className={styles.propCat}>{s.category}</span>}
              </li>
            ))}
          </ul>
        )}
        <Link to="/historier" className={styles.seeAll}>Alle bibelhistorier →</Link>
      </Block>

      <Block id="paralleller" title="Parallelle tekster" count={parallels.length} defaultOpen={false}>
        {parallels.length > 0 && (
          <ul className={styles.propList}>
            {parallels.map(p => (
              <li key={p.id} className={styles.propItem}>
                <Link to="/paralleller" className={styles.propTitle}>{p.title}</Link>
                {p.gospels && p.gospels.length > 0 && (
                  <span className={styles.propCat}>{p.gospels.join(' · ')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link to="/paralleller" className={styles.seeAll}>Alle paralleller →</Link>
      </Block>

      <Block id="tall" title="Tall i Bibelen" count={numbers.length} defaultOpen={false}>
        {numbers.length > 0 && (
          <div className={styles.chipRow}>
            {numbers.map(n => (
              <Link key={n.number} to={`/tall/${n.number}`} className={styles.chip}>
                {n.number}
                {n.meaning && <span className={styles.chipNum}>{n.meaning}</span>}
              </Link>
            ))}
          </div>
        )}
        <Link to="/tall" className={styles.seeAll}>Alle tall →</Link>
      </Block>

      <Block id="lesetekster" title="Lesetekster" count={readingTexts.length} defaultOpen={false}>
        {readingTexts.length > 0 && (
          <ul className={styles.msList}>
            {readingTexts.map(rt => (
              <li key={rt.id} className={styles.msItem}>
                <Link to={`/lesetekster/${rt.id}`} className={styles.msTitle}>{rt.name}</Link>
                {rt.date && <span className={styles.msType}>{rt.date}</span>}
              </li>
            ))}
          </ul>
        )}
        <Link to="/lesetekster" className={styles.seeAll}>Alle lesetekster →</Link>
      </Block>

      <Block id="manuskripter" title="Manuskripter" count={chapterDevotionals.length}>
        {chapterDevotionals.length > 0 && (
          <ul className={styles.msList}>
            {chapterDevotionals.slice(0, 5).map(d => (
              <li key={d.id} className={styles.msItem}>
                <Link to={`/manuskripter/${d.slug}`} className={styles.msTitle}>{d.title || 'Uten tittel'}</Link>
                <span className={styles.msType}>{d.type}</span>
              </li>
            ))}
            {chapterDevotionals.length > 5 && (
              <li className={styles.msMore}>
                <Link to="/manuskripter">+ {chapterDevotionals.length - 5} flere →</Link>
              </li>
            )}
          </ul>
        )}
        <Link
          to={`/manuskripter/ny${newManuscriptRef ? `?ref=${encodeURIComponent(newManuscriptRef)}` : ''}`}
          className={styles.newMsLink}
        >
          + Skriv nytt manuskript om {bookName} {chapter}
        </Link>
      </Block>
    </div>
  );
}
