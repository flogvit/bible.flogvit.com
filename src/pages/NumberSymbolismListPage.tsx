import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import type { NumberSymbolismData } from '@/lib/bible';
import styles from '@/styles/pages/number-symbolism-list.module.scss';

interface NumberEntry {
  number: number;
  meaning: string;
  description: string;
  referenceCount: number;
}

export function NumberSymbolismListPage() {
  const [numbers, setNumbers] = useState<NumberEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/number-symbolism');
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        const entries = (data.symbolisms || []).map((s: { content: string }) => {
          const parsed: NumberSymbolismData = JSON.parse(s.content);
          return {
            number: parsed.number,
            meaning: parsed.meaning,
            description: parsed.description,
            referenceCount: parsed.references?.length || 0,
          };
        });

        setNumbers(entries);
      } catch (err) {
        console.error('Failed to fetch number symbolism:', err);
        setError('Kunne ikke laste tall');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[
            { label: 'Hjem', href: '/' },
            { label: 'Tall' }
          ]} />
          <h1>Tall i Bibelen</h1>
          <p>Laster...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[
            { label: 'Hjem', href: '/' },
            { label: 'Tall' }
          ]} />
          <h1>Tall i Bibelen</h1>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  const filtered = filter
    ? numbers.filter(n => {
        const q = filter.toLowerCase();
        // Exact match for pure number queries, substring for text
        if (/^\d+$/.test(q)) {
          return n.number === parseInt(q, 10);
        }
        return n.meaning.toLowerCase().includes(q)
          || n.description.toLowerCase().includes(q);
      })
    : numbers;

  return (
    <div className={styles.main}>
      <div className="container">
        <Breadcrumbs items={[
          { label: 'Hjem', href: '/' },
          { label: 'Tall' }
        ]} />

        <h1>Tall i Bibelen</h1>

        <p className={styles.intro}>
          Tall i Bibelen har ofte en dypere symbolsk betydning. Utforsk hva de ulike tallene representerer.
        </p>

        <div className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Søk etter tall eller betydning..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button className={styles.clearButton} onClick={() => setFilter('')} aria-label="Tøm søk">
              ×
            </button>
          )}
        </div>

        {filtered.length === 0 && filter && (
          <p className={styles.noResults}>Ingen tall matcher «{filter}»</p>
        )}

        <div className={styles.numberList}>
          {filtered.map((entry) => (
            <Link
              key={entry.number}
              to={`/tall/${entry.number}`}
              className={styles.numberCard}
            >
              <span className={styles.numberValue}>{entry.number}</span>
              <div className={styles.numberInfo}>
                <h2>{entry.meaning}</h2>
                <p className={styles.numberPreview}>
                  {entry.description.length > 120
                    ? entry.description.slice(0, 120) + '...'
                    : entry.description}
                </p>
                {entry.referenceCount > 0 && (
                  <span className={styles.refCount}>
                    {entry.referenceCount} {entry.referenceCount === 1 ? 'bibelreferanse' : 'bibelreferanser'}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
