import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import type { DayData } from '@/lib/bible';
import styles from '@/styles/pages/days-list.module.scss';

const categoryLabels: Record<string, string> = {
  advent: 'Advent',
  christmas: 'Jul',
  epiphany: 'Åpenbaring',
  lent: 'Faste',
  easter: 'Påske',
  ascension: 'Himmelfart',
  pentecost: 'Pinse',
  trinity: 'Treenighetstiden',
  special: 'Spesielle dager',
  jewish: 'Jødiske høytider',
};

const categoryOrder = ['advent', 'christmas', 'epiphany', 'lent', 'easter', 'ascension', 'pentecost', 'trinity', 'special', 'jewish'];

interface DayEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  nextDate: string | null;
}

function getNextDate(dates: Record<string, string>): string | null {
  const today = new Date().toISOString().substring(0, 10);
  const future = Object.values(dates).filter(d => d >= today).sort();
  return future[0] || null;
}

export function DaysListPage() {
  const [days, setDays] = useState<DayEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'chronological' | 'thematic'>('chronological');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/days');
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        const entries = (data.days || []).map((d: { content: string }) => {
          const parsed: DayData = JSON.parse(d.content);
          return {
            id: parsed.id,
            name: parsed.name,
            description: parsed.description,
            category: parsed.category,
            nextDate: getNextDate(parsed.dates),
          };
        });

        // Sort by next date within each category
        entries.sort((a: DayEntry, b: DayEntry) => {
          const catA = categoryOrder.indexOf(a.category);
          const catB = categoryOrder.indexOf(b.category);
          if (catA !== catB) return catA - catB;
          // Within same category, sort by next date (nulls last)
          if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
          if (a.nextDate) return -1;
          if (b.nextDate) return 1;
          return a.name.localeCompare(b.name, 'nb');
        });

        setDays(entries);
      } catch (err) {
        console.error('Failed to fetch days:', err);
        setError('Kunne ikke laste dager');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const filtered = filter
    ? days.filter(d => {
        const q = filter.toLowerCase();
        return d.name.toLowerCase().includes(q)
          || d.description.toLowerCase().includes(q)
          || (categoryLabels[d.category] || d.category).toLowerCase().includes(q);
      })
    : days;

  // Group by category
  const grouped = filtered.reduce<Record<string, DayEntry[]>>((acc, day) => {
    if (!acc[day.category]) acc[day.category] = [];
    acc[day.category].push(day);
    return acc;
  }, {});

  // Chronological: sort all by next date
  const chronological = [...filtered].sort((a, b) => {
    if (a.nextDate && b.nextDate) return a.nextDate.localeCompare(b.nextDate);
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return a.name.localeCompare(b.name, 'nb');
  });

  if (isLoading) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Dager' }]} />
          <h1>Kirkelige dager og høytider</h1>
          <p>Laster...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Dager' }]} />
          <h1>Kirkelige dager og høytider</h1>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className="container">
        <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Dager' }]} />

        <h1>Kirkelige dager og høytider</h1>

        <div className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Søk etter dag eller høytid..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button className={styles.clearButton} onClick={() => setFilter('')} aria-label="Tøm søk">
              ×
            </button>
          )}
        </div>

        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewButton} ${viewMode === 'chronological' ? styles.active : ''}`}
            onClick={() => setViewMode('chronological')}
          >
            Kronologisk
          </button>
          <button
            className={`${styles.viewButton} ${viewMode === 'thematic' ? styles.active : ''}`}
            onClick={() => setViewMode('thematic')}
          >
            Tematisk
          </button>
        </div>

        {filtered.length === 0 && filter && (
          <p className={styles.noResults}>Ingen dager matcher «{filter}»</p>
        )}

        {viewMode === 'thematic' ? (
          categoryOrder.filter(cat => grouped[cat]).map(cat => (
            <section key={cat} className={styles.categorySection}>
              <h2>{categoryLabels[cat] || cat}</h2>
              <div className={styles.dayList}>
                {grouped[cat].map(day => (
                  <Link key={day.id} to={`/dager/${day.id}`} className={styles.dayCard}>
                    <div className={styles.dayInfo}>
                      <h3>{day.name}</h3>
                      <p>{day.description}</p>
                    </div>
                    {day.nextDate && (
                      <span className={styles.nextDate}>
                        {new Date(day.nextDate).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className={styles.dayList}>
            {chronological.map(day => (
              <Link key={day.id} to={`/dager/${day.id}`} className={styles.dayCard}>
                <div className={styles.dayInfo}>
                  <h3>{day.name}</h3>
                  <p>{day.description}</p>
                </div>
                <div className={styles.chronoMeta}>
                  <span className={styles.categoryTag}>{categoryLabels[day.category] || day.category}</span>
                  {day.nextDate && (
                    <span className={styles.nextDate}>
                      {new Date(day.nextDate).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
