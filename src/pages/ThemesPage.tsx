import { useState, useEffect } from 'react';
import { ThemeList } from '@/components/ThemeList';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import styles from '@/styles/pages/themes.module.scss';

interface ThemeItem {
  id: string;
  name: string;
  title: string;
  introduction: string;
  searchText: string;
}

export function ThemesPage() {
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchThemes() {
      try {
        const response = await fetch('/api/themes');
        if (!response.ok) throw new Error('Failed to fetch themes');

        const data = await response.json();
        const rawThemes = data.themes || [];

        // Process themes for display
        const themeList = rawThemes.map((theme: { id: string; name: string; content: string }) => {
          // Check if JSON format
          try {
            const parsed = JSON.parse(theme.content);
            const searchParts: string[] = [parsed.title];
            if (parsed.introduction) searchParts.push(parsed.introduction);
            for (const section of parsed.sections || []) {
              searchParts.push(section.title);
              if (section.description) searchParts.push(section.description);
            }
            return {
              id: theme.id,
              name: theme.name,
              title: parsed.title || theme.name,
              introduction: parsed.introduction || 'Tematisk bibelstudie',
              searchText: searchParts.join(' '),
            };
          } catch {
            // Old txt format
            const lines = theme.content.split('\n').filter((l: string) => l.trim());
            return {
              id: theme.id,
              name: theme.name,
              title: theme.name.charAt(0).toUpperCase() + theme.name.slice(1),
              introduction: lines[0]?.split(':')[0] || '',
              searchText: theme.content,
            };
          }
        });

        setThemes(themeList);
      } catch (err) {
        console.error('Failed to fetch themes:', err);
        setError('Kunne ikke laste temaer');
      } finally {
        setIsLoading(false);
      }
    }

    fetchThemes();
  }, []);

  if (isLoading) {
    return (
      <div className={styles.main}>
        <div className="container">
          <Breadcrumbs items={[
            { label: 'Hjem', href: '/' },
            { label: 'Temaer' }
          ]} />
          <h1>Tematiske bibelstudier</h1>
          <p>Laster temaer...</p>
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
            { label: 'Temaer' }
          ]} />
          <h1>Tematiske bibelstudier</h1>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className="container">
        <Breadcrumbs items={[
          { label: 'Hjem', href: '/' },
          { label: 'Temaer' }
        ]} />

        <h1>Tematiske bibelstudier</h1>

        <ThemeList themes={themes} />
      </div>
    </div>
  );
}
