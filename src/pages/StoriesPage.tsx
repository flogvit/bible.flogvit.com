import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { InlineRefs } from '@/components/InlineRefs';
import styles from '@/styles/pages/stories.module.scss';

interface StoryItem {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  keywords: string;
}

const CATEGORIES: Record<string, string> = {
  skapelsen: 'Skapelsen',
  patriarkene: 'Patriarkene',
  moses: 'Moses',
  oerkenvandringen: 'Ørkenvandringen',
  landnaam: 'Landnåm',
  dommerne: 'Dommerne',
  kongetiden: 'Kongetiden',
  profetene: 'Profetene',
  eksil: 'Eksil',
  'jesus-liv': 'Jesu liv',
  'jesu-mirakler': 'Jesu mirakler',
  'jesu-lignelser': 'Jesu lignelser',
  'jesu-lidelse': 'Jesu lidelse',
  urkirken: 'Urkirken',
  paulus: 'Paulus',
};

export function StoriesPage() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStories() {
      try {
        const response = await fetch('/api/stories');
        if (!response.ok) throw new Error('Failed to fetch stories');

        const data = await response.json();
        setStories(data.stories || []);
      } catch (err) {
        console.error('Failed to fetch stories:', err);
        setError('Kunne ikke laste bibelhistorier');
      } finally {
        setIsLoading(false);
      }
    }

    fetchStories();
  }, []);

  const filteredStories = useMemo(() => {
    let result = stories;

    if (activeCategory) {
      result = result.filter(s => s.category === activeCategory);
    }

    if (!searchQuery.trim()) return result;

    const query = searchQuery.toLowerCase().trim();
    const words = query.split(/\s+/);

    return result
      .map(story => {
        let score = 0;
        const titleLower = story.title.toLowerCase();
        const keywordsLower = story.keywords.toLowerCase();
        const descLower = (story.description || '').toLowerCase();

        if (titleLower === query) score += 100;
        else if (titleLower.startsWith(query)) score += 50;
        else if (titleLower.includes(query)) score += 30;

        for (const word of words) {
          if (word.length < 2) continue;
          if (titleLower.includes(word)) score += 20;
          if (keywordsLower.includes(word)) score += 10;
          if (descLower.includes(word)) score += 5;
        }

        return { story, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.story);
  }, [stories, searchQuery, activeCategory]);

  const availableCategories = useMemo(() => {
    const cats = new Set(stories.map(s => s.category));
    return Object.entries(CATEGORIES).filter(([key]) => cats.has(key));
  }, [stories]);

  if (isLoading) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Bibelhistorier' }]} />
          <h1>Bibelhistorier</h1>
          <p>Laster historier...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Bibelhistorier' }]} />
          <h1>Bibelhistorier</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className="container">
        <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Bibelhistorier' }]} />

        <h1>Bibelhistorier</h1>

        <div className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Søk i bibelhistorier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Søk i bibelhistorier"
          />
          {searchQuery && (
            <button
              className={styles.clearButton}
              onClick={() => setSearchQuery('')}
              aria-label="Tøm søk"
            >
              ×
            </button>
          )}
        </div>

        <div className={styles.categories}>
          <button
            className={`${styles.categoryButton} ${!activeCategory ? styles.active : ''}`}
            onClick={() => setActiveCategory(null)}
          >
            Alle
          </button>
          {availableCategories.map(([key, label]) => (
            <button
              key={key}
              className={`${styles.categoryButton} ${activeCategory === key ? styles.active : ''}`}
              onClick={() => setActiveCategory(activeCategory === key ? null : key)}
            >
              {label}
            </button>
          ))}
        </div>

        {searchQuery && (
          <p className={styles.searchInfo}>
            {filteredStories.length} {filteredStories.length === 1 ? 'historie' : 'historier'} funnet
          </p>
        )}

        {filteredStories.length === 0 ? (
          <p className={styles.noStories}>
            {searchQuery || activeCategory ? 'Ingen historier matcher søket.' : 'Ingen historier tilgjengelig ennå.'}
          </p>
        ) : (
          <div className={styles.storyList}>
            {filteredStories.map((story) => (
              <Link
                key={story.slug}
                to={`/historier/${story.slug}`}
                className={styles.storyCard}
              >
                <h2>{story.title}</h2>
                {story.description && (
                  <p className={styles.storyDescription}><InlineRefs>{story.description}</InlineRefs></p>
                )}
                <div className={styles.storyMeta}>
                  <span className={styles.categoryBadge}>
                    {CATEGORIES[story.category] || story.category}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
