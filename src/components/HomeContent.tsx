import { useSettings } from '@/components/SettingsContext';
import { HomeHero } from '@/components/home/HomeHero';
import { BookCategories } from '@/components/home/BookCategories';
import { DiscoverGrid } from '@/components/home/DiscoverGrid';
import { TodaysReadingText } from '@/components/TodaysReadingText';
import styles from '@/styles/pages/home.module.scss';

export function HomeContent() {
  const { settings } = useSettings();

  return (
    <main className={styles.main}>
      <div className={styles.wrap}>
        <HomeHero />
        {(settings.showReadingTexts ?? true) && (
          <div className={styles.lesetekster}>
            <TodaysReadingText />
          </div>
        )}
        <BookCategories />
        <DiscoverGrid />
      </div>
    </main>
  );
}
