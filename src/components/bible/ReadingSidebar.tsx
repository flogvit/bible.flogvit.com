import { useState, useCallback, useEffect, useRef } from 'react';
import { useSettings } from '@/components/SettingsContext';
import { StudyPanel } from './sidebar/StudyPanel';
import type { TimelineEvent } from '@/lib/bible';
import styles from './ReadingSidebar.module.scss';

interface ReadingSidebarProps {
  bookId: number;
  chapter: number;
  bookName: string;
  timelineEvents: TimelineEvent[];
  chapterEventIds: string[];
  bookSummary: string | null;
  chapterSummary: string | null;
  historicalContext: string | null;
  onWidthChange?: (width: number) => void;
}

// Single scrollable column matching the redesign's .read-context: no tabs,
// just stacked collapsible blocks. Search (Oppslag) lives as the first
// block; verse lookup also works globally via ⌘K.
export function ReadingSidebar({
  bookId,
  chapter,
  bookName,
  timelineEvents,
  chapterEventIds,
  bookSummary,
  chapterSummary,
  historicalContext,
  onWidthChange,
}: ReadingSidebarProps) {
  const { settings, updateSetting } = useSettings();
  const isPanelMode = settings.layoutMode === 'panel';

  // Drag resize state
  const [isDragging, setIsDragging] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const savedWidthRef = useRef(settings.sidebarWidth || 320);

  useEffect(() => {
    savedWidthRef.current = settings.sidebarWidth || 320;
  }, [settings.sidebarWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isPanelMode) return;
    e.preventDefault();
    setIsDragging(true);
  }, [isPanelMode]);

  const handleDoubleClick = useCallback(() => {
    if (isPanelMode) return;
    const halfScreen = Math.floor(window.innerWidth / 2);
    const currentWidth = settings.sidebarWidth || 320;
    const newWidth = currentWidth >= halfScreen - 20 ? 320 : halfScreen;
    updateSetting('sidebarWidth', newWidth);
  }, [isPanelMode, settings.sidebarWidth, updateSetting]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(
        Math.max(240, window.innerWidth - e.clientX),
        Math.floor(window.innerWidth * 0.5),
      );
      setDragWidth(newWidth);
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (dragWidth !== null) {
        updateSetting('sidebarWidth', dragWidth);
        setDragWidth(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, dragWidth, updateSetting, onWidthChange]);

  return (
    <div className={styles.sidebar}>
      {!isPanelMode && (
        <div
          className={`${styles.resizeHandle} ${isDragging ? styles.dragging : ''}`}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          title="Dra for å endre bredde, dobbelklikk for 50%"
        />
      )}

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
