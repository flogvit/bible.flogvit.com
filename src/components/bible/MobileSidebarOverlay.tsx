import { StudyPanel } from './sidebar/StudyPanel';
import type { TimelineEvent } from '@/lib/bible';
import styles from './MobileSidebarOverlay.module.scss';

interface MobileSidebarOverlayProps {
  bookId: number;
  chapter: number;
  bookName: string;
  timelineEvents: TimelineEvent[];
  chapterEventIds?: string[];
  bookSummary: string | null;
  chapterSummary: string | null;
  historicalContext: string | null;
  onClose: () => void;
}

export function MobileSidebarOverlay({
  bookId,
  chapter,
  bookName,
  timelineEvents,
  chapterEventIds = [],
  bookSummary,
  chapterSummary,
  historicalContext,
  onClose,
}: MobileSidebarOverlayProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <div className={styles.title}>Studium</div>
        <button className={styles.closeButton} onClick={onClose} aria-label="Lukk panel">
          ✕
        </button>
      </div>

      <div className={styles.content}>
        <StudyPanel
          bookId={bookId}
          chapter={chapter}
          bookName={bookName}
          bookSummary={bookSummary}
          chapterSummary={chapterSummary}
          historicalContext={historicalContext}
          timelineEvents={timelineEvents}
          chapterEventIds={chapterEventIds}
        />
      </div>
    </div>
  );
}
