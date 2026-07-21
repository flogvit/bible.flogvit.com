import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styles from './ResourcesPanel.module.scss';

interface ResourcesPanelProps {
  bookId: number;
  chapter: number;
  bookName: string;
}

interface ResourceItem {
  type: string;
  id: string | number;
  title: string;
  subtitle?: string;
  description?: string;
  url?: string;
  verses?: number[];
}

const typeLabels: Record<string, string> = {
  person: 'Personer',
  prophecy: 'Profetier',
  theme: 'Temaer',
  parallel: 'Paralleller',
  story: 'Historier',
  timeline: 'Tidslinje',
  word: 'Viktige ord',
  number: 'Tall',
  day: 'Dager',
  readingText: 'Lesetekster',
  plan: 'Leseplaner',
};

export function ResourcesPanel({ bookId, chapter, bookName }: ResourcesPanelProps) {
  const [query, setQuery] = useState('');
  const [chapterResults, setChapterResults] = useState<ResourceItem[]>([]);
  const [searchResults, setSearchResults] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Clean up highlights on unmount or chapter change
  useEffect(() => {
    return () => {
      document.querySelectorAll('.verse-resource-highlight').forEach(
        el => el.classList.remove('verse-resource-highlight')
      );
    };
  }, [bookId, chapter]);

  // Auto-load resources for current chapter
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIsSearchMode(false);
    setExpandedId(null);

    fetch(`/api/search/chapter-resources?bookId=${bookId}&chapter=${chapter}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const items: ResourceItem[] = [];
        if (data.persons) data.persons.forEach((p: any) => items.push({
          type: 'person', id: p.id, title: p.name, subtitle: p.title || p.era,
          description: p.summary, url: `/personer/${p.id}`, verses: p.verses,
        }));
        if (data.prophecies) data.prophecies.forEach((p: any) => items.push({
          type: 'prophecy', id: p.id, title: p.title, subtitle: p.category_name,
          description: p.explanation, url: '/profetier', verses: p.verses,
        }));
        if (data.themes) data.themes.forEach((t: any) => items.push({
          type: 'theme', id: t.id, title: t.title || t.name,
          description: t.description, url: `/temaer/${t.name}`, verses: t.verses,
        }));
        if (data.stories) data.stories.forEach((s: any) => items.push({
          type: 'story', id: s.slug, title: s.title, subtitle: s.category,
          description: s.description, url: `/historier/${s.slug}`, verses: s.verses,
        }));
        if (data.numbers) data.numbers.forEach((n: any) => items.push({
          type: 'number', id: n.number, title: `${n.number}`, subtitle: n.meaning,
          description: n.description, url: `/tall/${n.number}`, verses: n.verses,
        }));
        if (data.readingTexts) data.readingTexts.forEach((rt: any) => items.push({
          type: 'readingText', id: rt.id, title: rt.name,
          subtitle: rt.date, description: rt.title,
          url: `/lesetekster/${rt.id}`, verses: rt.verses,
        }));
        if (data.parallels) data.parallels.forEach((p: any) => items.push({
          type: 'parallel', id: p.id, title: p.title,
          subtitle: p.gospels?.join(', '),
          url: '/paralleller',
        }));
        if (data.words) data.words.forEach((w: any, i: number) => items.push({
          type: 'word', id: i, title: w.word,
          description: w.explanation,
        }));
        setChapterResults(items);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setChapterResults([]);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [bookId, chapter]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setLoading(true);
    setIsSearchMode(true);
    try {
      const res = await fetch(`/api/search/all?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      const items: ResourceItem[] = [];
      if (data.persons) data.persons.forEach((p: any) => items.push({
        type: 'person', id: p.id, title: p.name, subtitle: p.title || p.era, url: `/personer/${p.id}`,
      }));
      if (data.prophecies) data.prophecies.forEach((p: any) => items.push({
        type: 'prophecy', id: p.id, title: p.title, subtitle: p.category_name,
        url: '/profetier',
      }));
      if (data.themes) data.themes.forEach((t: any) => items.push({
        type: 'theme', id: t.id, title: t.name, url: `/temaer/${t.id}`,
      }));
      if (data.parallels) data.parallels.forEach((p: any) => items.push({
        type: 'parallel', id: p.id, title: p.title, url: `/paralleller/${p.id}`,
      }));
      if (data.stories) data.stories.forEach((s: any) => items.push({
        type: 'story', id: s.id, title: s.title, subtitle: s.category, url: `/historier/${s.slug}`,
      }));
      if (data.timeline) data.timeline.forEach((t: any) => items.push({
        type: 'timeline', id: t.id, title: t.title, subtitle: t.year_display,
        url: '/tidslinje',
      }));
      if (data.readingTexts) data.readingTexts.forEach((rt: any) => items.push({
        type: 'readingText', id: rt.id, title: rt.name, subtitle: rt.date,
        url: `/lesetekster/${rt.id}`,
      }));
      if (data.plans) data.plans.forEach((p: any) => items.push({
        type: 'plan', id: p.id, title: p.name, subtitle: `${p.total_days} dager`,
        url: `/leseplan`,
      }));
      if (data.words) data.words.forEach((w: any) => items.push({
        type: 'word', id: `${w.bookId}-${w.chapter}-${w.word}`, title: w.word,
        subtitle: w.bookName ? `${w.bookName} ${w.chapter}` : undefined,
        description: w.explanation,
      }));
      if (data.numberSymbolism) data.numberSymbolism.forEach((n: any) => items.push({
        type: 'number', id: n.number, title: `${n.number}`, subtitle: n.meaning,
        url: `/tall/${n.number}`,
      }));
      if (data.days) data.days.forEach((d: any) => items.push({
        type: 'day', id: d.id, title: d.name, subtitle: d.category,
        url: `/dager/${d.id}`,
      }));

      setSearchResults(items);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      performSearch(query.trim());
    }
  };

  const handleClearSearch = () => {
    setQuery('');
    setIsSearchMode(false);
    setSearchResults([]);
  };

  const results = isSearchMode ? searchResults : chapterResults;

  // Group results by type for display
  const groupedResults = results.reduce<Record<string, ResourceItem[]>>((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  return (
    <div className={styles.panel}>
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Søk i ressurser..."
          className={styles.searchInput}
        />
        <button type="submit" className={styles.searchButton} disabled={loading}>
          {loading ? '...' : 'Søk'}
        </button>
      </form>

      {isSearchMode && (
        <button className={styles.clearSearch} onClick={handleClearSearch}>
          ← Vis ressurser for dette kapittelet
        </button>
      )}

      {loading && results.length === 0 && (
        <div className={styles.loading}>Laster...</div>
      )}

      <div className={styles.results}>
        {Object.entries(groupedResults).map(([type, items]) => (
          <div key={type} className={styles.group}>
            <h3 className={styles.groupTitle}>{typeLabels[type] || type}</h3>
            {items.map(item => {
              const key = `${item.type}-${item.id}`;
              const isExpanded = expandedId === key;

              return (
                <div key={key} className={`${styles.item} ${isExpanded ? styles.expanded : ''}`}>
                  <div className={styles.itemHeader} onClick={() => {
                    const newExpanded = isExpanded ? null : key;
                    setExpandedId(newExpanded);
                    // Clear previous highlights
                    document.querySelectorAll('.verse-resource-highlight').forEach(
                      el => el.classList.remove('verse-resource-highlight')
                    );
                    // Highlight verses for newly expanded item
                    if (newExpanded && item.verses) {
                      item.verses.forEach(v => {
                        document.getElementById(`v${v}`)?.classList.add('verse-resource-highlight');
                      });
                    }
                  }}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    {item.subtitle && <span className={styles.itemSubtitle}>{item.subtitle}</span>}
                  </div>
                  {isExpanded && (
                    <div className={styles.itemDetail}>
                      {item.description && <p className={styles.description}>{item.description}</p>}
                      {item.verses && item.verses.length > 0 && (
                        <div className={styles.verseLinks}>
                          <span className={styles.verseLinksLabel}>Vers:</span>
                          {item.verses.map(v => (
                            <button
                              key={v}
                              className={styles.verseLink}
                              onClick={(e) => {
                                e.stopPropagation();
                                const el = document.getElementById(`v${v}`);
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  el.classList.add('verse-highlight');
                                  setTimeout(() => el.classList.remove('verse-highlight'), 3000);
                                }
                              }}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      )}
                      {item.url && (
                        <Link to={item.url} className={styles.detailLink}>
                          Les mer →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {!loading && results.length === 0 && (
          <div className={styles.empty}>
            {isSearchMode
              ? 'Ingen resultater funnet. Prøv andre søkeord.'
              : 'Ingen ressurser knyttet til dette kapittelet.'}
          </div>
        )}
      </div>
    </div>
  );
}
