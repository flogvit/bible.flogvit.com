import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/components/SettingsContext';
import type { LayoutMode } from '@/lib/offline/userData';

interface ChapterKeyboardShortcutsProps {
  bookSlug: string;
  currentChapter: number;
  maxChapter: number;
  nextBookSlug?: string | null;
  bibleQuery?: string;
}

// Sidebar no longer has tabs — number keys are reserved for jump-to-verse.

export function ChapterKeyboardShortcuts({
  bookSlug,
  currentChapter,
  maxChapter,
  nextBookSlug,
  bibleQuery = '',
}: ChapterKeyboardShortcutsProps) {
  const navigate = useNavigate();
  const { settings, updateSetting } = useSettings();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle shortcuts when typing in input fields
      const activeElement = document.activeElement;
      if (activeElement) {
        const tagName = activeElement.tagName.toLowerCase();
        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          activeElement.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
      }

      // Arrow key navigation for chapters
      if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (currentChapter > 1) {
          navigate(`/${bookSlug}/${currentChapter - 1}${bibleQuery}`);
        }
        return;
      }

      if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (currentChapter < maxChapter) {
          navigate(`/${bookSlug}/${currentChapter + 1}${bibleQuery}`);
        } else if (nextBookSlug) {
          navigate(`/${nextBookSlug}/1${bibleQuery}`);
        }
        return;
      }

      // F: toggle focus mode (layoutMode: reading <-> normal)
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const next: LayoutMode = settings.layoutMode === 'reading' ? 'normal' : 'reading';
        updateSetting('layoutMode', next);
        return;
      }

      // Number keys 1-9: jump to verse
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const verseElement = document.getElementById(`v${e.key}`);
        if (verseElement) {
          e.preventDefault();
          verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.history.replaceState(null, '', `#v${e.key}`);
        }
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [bookSlug, currentChapter, maxChapter, nextBookSlug, bibleQuery, navigate, updateSetting, settings.layoutMode]);

  // This component doesn't render anything - it just adds keyboard handlers
  return null;
}
