import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import styles from './VerseDisplay.module.scss';
import type { Verse, Prophecy, VerseVersion } from '@/lib/bible';
import { toUrlSlug } from '@/lib/url-utils';
import { useSettings } from '@/components/SettingsContext';
import { useFavorites } from '@/components/FavoritesContext';
import { useTopics, Topic, ItemType } from '@/components/TopicsContext';
import { useNotes, Note } from '@/components/NotesContext';
import { useVerseVersions } from '@/components/VerseVersionsContext';
import { useDevotionals } from '@/components/DevotionalsContext';
import { getBookInfoById } from '@/lib/books-data';
import { InlineRefs } from '@/components/InlineRefs';
import { Footnotes } from '@/components/Footnotes';

interface VerseDisplayProps {
  verse: Verse;
  bookId: number;
  originalText?: string;
  originalLanguage: 'hebrew' | 'greek';
  secondaryText?: string;
  initialWord4Word?: Word4WordData[];
  initialReferences?: ReferenceData[];
}

interface Word4WordData {
  word_index: number;
  word: string;
  original: string | null;
  pronunciation: string | null;
  explanation: string | null;
}

interface ReferenceData {
  to_book_id: number;
  to_chapter: number;
  to_verse_start: number;
  to_verse_end: number;
  description: string | null;
  book_short_name?: string;
}

interface VerseExtras {
  prayer: string | null;
  sermon: string | null;
}

type TabType = 'original' | 'references' | 'prophecies' | 'prayer' | 'sermon' | 'topics' | 'notes' | 'versions' | 'devotionals' | 'footnotes';

// Map a secondaryBible id to a short label shown above each undertekst strip.
function undertekstShortLabel(id: string | undefined): string {
  if (!id) return '';
  if (id === 'osnb2') return 'nb';
  if (id === 'osnn1') return 'nn';
  if (id === '1930') return '1930';
  if (id === 'dnb2024') return '2024';
  if (id.startsWith('user:')) return 'egen';
  return id;
}

// Hook to detect mobile
function useIsMobile(breakpoint = 600) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= breakpoint);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [breakpoint]);

  return isMobile;
}

export function VerseDisplay({ verse, bookId, originalText, originalLanguage, secondaryText, initialWord4Word, initialReferences }: VerseDisplayProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useSettings();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { topics, addTopic, addTopicToVerse, removeTopicFromVerse, getTopicsForVerse, searchTopics, addTopicToItem, removeTopicFromItem, getTopicsForItem } = useTopics();
  const { addNote, updateNote, deleteNote, getNotesForVerse } = useNotes();
  const { getSelectedVersion, setSelectedVersion, clearSelectedVersion } = useVerseVersions();
  const { getDevotionalsForVerse } = useDevotionals();

  // Build verse ref for devotional lookup
  const bookInfo = getBookInfoById(bookId);
  const verseRef = bookInfo
    ? `${bookInfo.short_name.toLowerCase()}-${verse.chapter}-${verse.verse}`
    : '';
  const verseDevotionals = getDevotionalsForVerse(verseRef);
  const hasDevotionals = verseDevotionals.length > 0;

  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  const [openSections, setOpenSections] = useState<Set<TabType>>(new Set(['original']));
  const favorited = isFavorite(bookId, verse.chapter, verse.verse);
  const verseTopics = getTopicsForVerse(bookId, verse.chapter, verse.verse);
  const verseNotes = getNotesForVerse(bookId, verse.chapter, verse.verse);
  const hasTopics = verseTopics.length > 0;
  const hasNotes = verseNotes.length > 0;

  // Verse versions support - filter out error versions for selection
  const selectableVersions = verse.versions?.filter(v => v.type !== 'error') || [];
  const hasVersions = selectableVersions.length > 0;
  const selectedVersionIndex = getSelectedVersion(bookId, verse.chapter, verse.verse);
  const displayText = selectedVersionIndex !== undefined && selectableVersions[selectedVersionIndex]
    ? selectableVersions[selectedVersionIndex].text
    : verse.text;

  // Word4word on translations is disabled - only available in original language tab
  const hasWord4Word = false;
  const [selectedWord, setSelectedWord] = useState<Word4WordData | null>(null);
  const [selectedOriginalWord, setSelectedOriginalWord] = useState<Word4WordData | null>(null);
  const [word4word, setWord4Word] = useState<Word4WordData[] | null>(null);
  const [originalWord4word, setOriginalWord4Word] = useState<Word4WordData[] | null>(null);
  const [references, setReferences] = useState<ReferenceData[] | null>(null);
  const [prophecies, setProphecies] = useState<Prophecy[] | null>(null);
  const [verseExtras, setVerseExtras] = useState<VerseExtras | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('original');
  const [loading, setLoading] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [noteTopicInput, setNoteTopicInput] = useState<Record<string, string>>({});
  const [showNoteTopicSuggestions, setShowNoteTopicSuggestions] = useState<string | null>(null);

  // Auto-expand if URL hash matches this verse with -open suffix
  useEffect(() => {
    const hash = window.location.hash;
    const verseMatch = hash.match(/^#v(\d+)-open(?:-w(\d+))?$/);
    if (verseMatch && parseInt(verseMatch[1]) === verse.verse) {
      setExpanded(true);
      loadData().then(data => {
        // If there's a word index in the hash, select that word
        if (verseMatch[2] && hasWord4Word) {
          const wordIndex = parseInt(verseMatch[2]);
          const wordData = data.find(w => w.word_index === wordIndex);
          if (wordData && wordData.original) {
            setSelectedWord(wordData);
          }
        }
      });
    }
  }, [verse.verse]);

  // Listen for other verses opening and close this one
  useEffect(() => {
    function handleVerseOpen(e: CustomEvent<number>) {
      if (e.detail !== verse.verse && expanded) {
        setExpanded(false);
        setSelectedWord(null);
      }
    }
    window.addEventListener('verse-opened', handleVerseOpen as EventListener);
    return () => window.removeEventListener('verse-opened', handleVerseOpen as EventListener);
  }, [verse.verse, expanded]);

  const words = displayText.split(/\s+/);

  async function loadData(): Promise<Word4WordData[]> {
    if (word4word !== null) return word4word;

    setLoading(true);
    try {
      // Use pre-loaded data if available (for offline support)
      const hasInitialData = initialWord4Word || initialReferences;

      // Determine language from current bible (osnb2 → nb, osnn1 → nn)
      const currentBible = searchParams.get('bible') || 'osnb2';
      const lang = currentBible.includes('nn') ? 'nn' : 'nb';

      // Build fetch list - only fetch what we don't already have
      const fetches: Promise<Response>[] = [];
      const fetchTypes: string[] = [];

      if (!initialWord4Word) {
        fetches.push(fetch(`/api/word4word?bookId=${bookId}&chapter=${verse.chapter}&verse=${verse.verse}&bible=original&lang=${lang}`));
        fetchTypes.push('word4word');
      }
      if (!initialReferences) {
        fetches.push(fetch(`/api/references?bookId=${bookId}&chapter=${verse.chapter}&verse=${verse.verse}&lang=${lang}`));
        fetchTypes.push('references');
      }
      fetches.push(fetch(`/api/prophecies?book=${bookId}&chapter=${verse.chapter}&verse=${verse.verse}`));
      fetchTypes.push('prophecies');
      fetches.push(fetch(`/api/verse-extras?bookId=${bookId}&chapter=${verse.chapter}&verse=${verse.verse}`));
      fetchTypes.push('extras');

      let origW4wData: Word4WordData[] = initialWord4Word || [];
      let refsData: ReferenceData[] = initialReferences || [];
      let propheciesData: { prophecies?: Prophecy[] } = { prophecies: [] };
      let extrasData: VerseExtras = { prayer: null, sermon: null };

      if (fetches.length > 0) {
        try {
          const responses = await Promise.all(fetches);

          for (let i = 0; i < responses.length; i++) {
            const type = fetchTypes[i];
            if (type === 'word4word') {
              origW4wData = await responses[i].json();
            } else if (type === 'references') {
              refsData = await responses[i].json();
            } else if (type === 'prophecies') {
              propheciesData = await responses[i].json();
            } else if (type === 'extras') {
              extrasData = await responses[i].json();
            }
          }
        } catch (fetchError) {
          // If fetching fails (offline), use what we have from initial data
          console.warn('Failed to fetch additional verse data:', fetchError);
        }
      }

      setWord4Word([]);
      setOriginalWord4Word(origW4wData);
      setReferences(refsData);
      setProphecies(propheciesData.prophecies || []);
      setVerseExtras(extrasData);
      setLoading(false);
      return [];
    } catch (error) {
      console.error('Failed to load verse data:', error);
      setLoading(false);
      return [];
    }
  }

  function handleVerseClick() {
    const newExpanded = !expanded;
    if (newExpanded) {
      loadData();
      // Update URL hash to remember this verse is open
      window.history.replaceState(null, '', `#v${verse.verse}-open`);
      // Notify other verses to close
      window.dispatchEvent(new CustomEvent('verse-opened', { detail: verse.verse }));
    } else {
      // Clear the hash when closing
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setExpanded(newExpanded);
    setSelectedWord(null);
  }

  async function handleWordClick(wordIndex: number) {
    const data = await loadData();
    const wordData = data.find(w => w.word_index === wordIndex + 1);
    if (wordData && wordData.original) {
      const isDeselecting = selectedWord?.word_index === wordData.word_index;
      setSelectedWord(isDeselecting ? null : wordData);
      // Update URL hash with word index
      if (isDeselecting) {
        window.history.replaceState(null, '', `#v${verse.verse}-open`);
      } else {
        window.history.replaceState(null, '', `#v${verse.verse}-open-w${wordData.word_index}`);
      }
    }
  }

  function formatReference(ref: ReferenceData): string {
    const verseRange = ref.to_verse_start === ref.to_verse_end
      ? `${ref.to_verse_start}`
      : `${ref.to_verse_start}-${ref.to_verse_end}`;
    return `${ref.book_short_name || ''} ${ref.to_chapter}:${verseRange}`;
  }

  function handleFavoriteClick() {
    toggleFavorite({ bookId, chapter: verse.chapter, verse: verse.verse });
  }

  function toggleSection(section: TabType) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  function getTopicSuggestions(): Topic[] {
    // Get existing topic IDs for this verse to filter them out
    const existingTopicIds = verseTopics.map(t => t.id);

    // If no input, show all available topics (not already on this verse)
    if (!topicInput.trim()) {
      return topics
        .filter(t => !existingTopicIds.includes(t.id))
        .slice(0, 8);
    }

    // Otherwise filter by search
    return searchTopics(topicInput)
      .filter(t => !existingTopicIds.includes(t.id))
      .slice(0, 8);
  }

  function handleAddTopic(existingTopic: Topic | null) {
    const trimmedInput = topicInput.trim();
    if (!trimmedInput && !existingTopic) return;

    let topic: Topic;
    if (existingTopic) {
      topic = existingTopic;
    } else {
      topic = addTopic(trimmedInput);
    }

    addTopicToVerse(bookId, verse.chapter, verse.verse, topic.id);
    setTopicInput('');
    setShowTopicSuggestions(false);
    setSelectedSuggestionIndex(0);
  }

  function getNoteTopicSuggestions(noteId: string): Topic[] {
    const noteTopics = getTopicsForItem('note', noteId);
    const existingTopicIds = noteTopics.map(t => t.id);
    const input = noteTopicInput[noteId] || '';

    if (!input.trim()) {
      return topics
        .filter(t => !existingTopicIds.includes(t.id))
        .slice(0, 8);
    }

    return searchTopics(input)
      .filter(t => !existingTopicIds.includes(t.id))
      .slice(0, 8);
  }

  function handleAddNoteTopicFromInput(noteId: string, existingTopic: Topic | null) {
    const input = noteTopicInput[noteId]?.trim() || '';
    if (!input && !existingTopic) return;

    let topic: Topic;
    if (existingTopic) {
      topic = existingTopic;
    } else {
      topic = addTopic(input);
    }

    addTopicToItem('note', noteId, topic.id);
    setNoteTopicInput(prev => ({ ...prev, [noteId]: '' }));
    setShowNoteTopicSuggestions(null);
  }

  return (
    <div id={`v${verse.verse}`} className={styles.verse} data-verse-num={verse.verse}>
      {settings.showVerseDetails ? (
        <span
          className={styles.verseNumber}
          onClick={handleVerseClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleVerseClick();
            }
          }}
          tabIndex={0}
          role="button"
          aria-expanded={expanded}
          aria-label={`Vers ${verse.verse}. Klikk for å se original tekst og referanser`}
        >
          {settings.showVerseIndicators && favorited && <span className={styles.favoriteIndicator} aria-label="Favoritt">★</span>}
          {settings.showVerseIndicators && hasTopics && <span className={styles.topicIndicator} aria-label={`${verseTopics.length} emne${verseTopics.length > 1 ? 'r' : ''}`} />}
          {settings.showVerseIndicators && hasNotes && <span className={styles.noteIndicator} aria-label={`${verseNotes.length} notat${verseNotes.length > 1 ? 'er' : ''}`} />}
          {verse.verse}
        </span>
      ) : (
        <span className={styles.verseNumberStatic}>
          {settings.showVerseIndicators && favorited && <span className={styles.favoriteIndicator} aria-label="Favoritt">★</span>}
          {verse.verse}
        </span>
      )}

      <span className={styles.verseText} data-verse-text>
        {words.map((word, index) => {
          const wordData = word4word?.find(w => w.word_index === index + 1);
          const isSelected = selectedWord?.word_index === index + 1;
          // Make word clickable if setting is enabled and we have word4word for this bible
          // Data will be loaded on click if not already loaded
          const isClickable = settings.showWord4Word && hasWord4Word;

          return (
            <span key={index}>
              {isClickable ? (
                <span
                  className={`${styles.word} ${styles.clickable} ${isSelected ? styles.selected : ''}`}
                  onClick={() => handleWordClick(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleWordClick(index);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`${word}. Klikk for ordforklaring`}
                >
                  {word}
                </span>
              ) : (
                <span className={styles.word}>{word}</span>
              )}
              {' '}
            </span>
          );
        })}
        {settings.showVerseFootnotes && verse.footnotes && verse.footnotes.length > 0 && (
          <Footnotes footnotes={verse.footnotes} />
        )}
      </span>

      {settings.showWord4Word && selectedWord && selectedWord.original && (
        <div className={styles.wordDetail}>
          <span className={styles.original}>{selectedWord.original}</span>
          {selectedWord.pronunciation && (
            <span className={styles.pronunciation}>{selectedWord.pronunciation}</span>
          )}
          {selectedWord.explanation && (
            <p className={styles.explanation}>{selectedWord.explanation}</p>
          )}
          <button
            className={styles.searchOriginalButton}
            onClick={() => navigate(`/sok/original?word=${encodeURIComponent(selectedWord.original!)}`)}
          >
            Søk alle forekomster
          </button>
        </div>
      )}

      {settings.showOriginalText && settings.secondaryBible === 'original' && originalText && (
        <div
          className={`${styles.originalVerse} ${originalLanguage === 'hebrew' ? styles.hebrew : styles.greek}`}
          dir={originalLanguage === 'hebrew' ? 'rtl' : 'ltr'}
          lang={originalLanguage === 'hebrew' ? 'he' : 'el'}
        >
          <span className={styles.undertekstLabel} aria-hidden="true">
            {originalLanguage === 'hebrew' ? 'hebr' : 'gresk'}
          </span>
          {originalText}
        </div>
      )}

      {settings.showOriginalText && settings.secondaryBible !== 'original' && secondaryText && (
        <div className={styles.secondaryVerse}>
          <span className={styles.undertekstLabel} aria-hidden="true">
            {undertekstShortLabel(settings.secondaryBible)}
          </span>
          {secondaryText}
        </div>
      )}

      {expanded && (
        <div className={styles.expanded}>
          {loading ? (
            <p className={styles.loading} role="status" aria-live="polite">Laster...</p>
          ) : (
            <>
              <div className={styles.expandedHeader}>
                <button
                  className={`${styles.favoriteToggle} ${favorited ? styles.favorited : ''}`}
                  onClick={handleFavoriteClick}
                >
                  {favorited ? '★ Fjern favoritt' : '☆ Legg til favoritt'}
                </button>
              </div>

              {/* Desktop: Tabs */}
              {!isMobile && (
                <>
                  <div className={styles.tabs}>
                    <button
                      className={`${styles.tab} ${activeTab === 'original' ? styles.active : ''}`}
                      onClick={() => setActiveTab('original')}
                    >
                      Grunntekst
                    </button>
                    <button
                      className={`${styles.tab} ${activeTab === 'references' ? styles.active : ''}`}
                      onClick={() => setActiveTab('references')}
                    >
                      Referanser
                    </button>
                    {prophecies && prophecies.length > 0 && (
                      <button
                        className={`${styles.tab} ${activeTab === 'prophecies' ? styles.active : ''}`}
                        onClick={() => setActiveTab('prophecies')}
                      >
                        Profetier ({prophecies.length})
                      </button>
                    )}
                    <button
                      className={`${styles.tab} ${activeTab === 'topics' ? styles.active : ''}`}
                      onClick={() => setActiveTab('topics')}
                    >
                      Emner {verseTopics.length > 0 && `(${verseTopics.length})`}
                    </button>
                    <button
                      className={`${styles.tab} ${activeTab === 'notes' ? styles.active : ''}`}
                      onClick={() => setActiveTab('notes')}
                    >
                      Notater {verseNotes.length > 0 && `(${verseNotes.length})`}
                    </button>
                    <button
                      className={`${styles.tab} ${activeTab === 'devotionals' ? styles.active : ''}`}
                      onClick={() => setActiveTab('devotionals')}
                    >
                      Manuskripter {hasDevotionals && `(${verseDevotionals.length})`}
                    </button>
                    {hasVersions && (
                      <button
                        className={`${styles.tab} ${activeTab === 'versions' ? styles.active : ''} ${selectedVersionIndex !== undefined ? styles.hasSelection : ''}`}
                        onClick={() => setActiveTab('versions')}
                      >
                        Versjoner {selectedVersionIndex !== undefined && '●'}
                      </button>
                    )}
                    {verse.footnotes && verse.footnotes.length > 0 && (
                      <button
                        className={`${styles.tab} ${activeTab === 'footnotes' ? styles.active : ''}`}
                        onClick={() => setActiveTab('footnotes')}
                      >
                        Fotnoter ({verse.footnotes.length})
                      </button>
                    )}
                  </div>

                  <div className={styles.tabContent}>
                {activeTab === 'original' && (
                  <div className={styles.originalTextTab}>
                    {originalText && (
                      <div
                        className={`${styles.fullOriginalText} ${originalLanguage === 'hebrew' ? styles.hebrew : styles.greek}`}
                        dir={originalLanguage === 'hebrew' ? 'rtl' : 'ltr'}
                        lang={originalLanguage === 'hebrew' ? 'he' : 'el'}
                      >
                        {originalText}
                      </div>
                    )}

                    {/* Word-for-word from original text (Hebrew/Greek) */}
                    {originalWord4word && originalWord4word.length > 0 && (
                      <>
                        <h3 className={styles.sectionTitle}>Ord for ord</h3>
                        <div
                          className={`${styles.originalText} ${originalLanguage === 'hebrew' ? styles.hebrewWords : ''}`}
                          dir={originalLanguage === 'hebrew' ? 'rtl' : 'ltr'}
                          lang={originalLanguage === 'hebrew' ? 'he' : 'el'}
                        >
                          {originalWord4word.map(w => (
                            <span
                              key={w.word_index}
                              className={`${styles.originalWord} ${styles.clickableWord} ${selectedOriginalWord?.word_index === w.word_index ? styles.selectedWord : ''}`}
                              onClick={() => setSelectedOriginalWord(selectedOriginalWord?.word_index === w.word_index ? null : w)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedOriginalWord(selectedOriginalWord?.word_index === w.word_index ? null : w);
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-pressed={selectedOriginalWord?.word_index === w.word_index}
                              aria-label={`${w.word}${w.pronunciation ? ` (${w.pronunciation})` : ''}. Klikk for forklaring`}
                            >
                              <span className={styles.originalScript}>{w.word}</span>
                              {w.pronunciation && (
                                <span className={styles.translatedWord}>{w.pronunciation}</span>
                              )}
                            </span>
                          ))}
                        </div>

                        {selectedOriginalWord && (
                          <div className={styles.wordExplanation}>
                            <strong>{selectedOriginalWord.word}</strong>
                            {selectedOriginalWord.pronunciation && (
                              <span className={styles.pronunciationInline}> ({selectedOriginalWord.pronunciation})</span>
                            )}
                            {selectedOriginalWord.explanation && (
                              <p>{selectedOriginalWord.explanation}</p>
                            )}
                            <button
                              className={styles.searchOriginalButton}
                              onClick={() => navigate(`/sok/original?word=${encodeURIComponent(selectedOriginalWord.word)}`)}
                            >
                              Søk alle forekomster
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {(!originalWord4word || originalWord4word.length === 0) && (
                      <p className="text-muted">Ingen orddata tilgjengelig</p>
                    )}
                  </div>
                )}

                {true && activeTab === 'references' && (
                  <div className={styles.referencesList}>
                    {references && references.length > 0 ? (
                      references.map((ref, index) => (
                        <a
                          key={index}
                          href={`/${toUrlSlug(ref.book_short_name || '')}/${ref.to_chapter}#v${ref.to_verse_start}`}
                          className={styles.reference}
                        >
                          <span className={styles.refLink}>{formatReference(ref)}</span>
                          {ref.description && (
                            <span className={styles.refDescription}><InlineRefs>{ref.description}</InlineRefs></span>
                          )}
                        </a>
                      ))
                    ) : (
                      <p className="text-muted">Ingen referanser</p>
                    )}
                  </div>
                )}

                {activeTab === 'prophecies' && prophecies && prophecies.length > 0 && (
                  <div className={styles.propheciesList}>
                    {prophecies.map((prophecy) => (
                      <a
                        key={prophecy.id}
                        href={`/profetier#${prophecy.id}`}
                        className={styles.prophecyItem}
                      >
                        <span className={styles.prophecyTitle}>{prophecy.title}</span>
                        <span className={styles.prophecyCategory}>{prophecy.category?.name}</span>
                        {prophecy.explanation && (
                          <p className={styles.prophecyExplanation}><InlineRefs>{prophecy.explanation}</InlineRefs></p>
                        )}
                      </a>
                    ))}
                  </div>
                )}

                {activeTab === 'topics' && (
                  <div className={styles.topicsContent}>
                    {verseTopics.length > 0 ? (
                      <div className={styles.topicsList}>
                        {verseTopics.map(topic => (
                          <span key={topic.id} className={styles.topicTag}>
                            {topic.name}
                            <button
                              className={styles.topicRemove}
                              onClick={() => removeTopicFromVerse(bookId, verse.chapter, verse.verse, topic.id)}
                              title="Fjern emne"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.noTopics}>Ingen emner lagt til ennå</p>
                    )}

                    <div className={styles.topicInputWrapper}>
                      <input
                        type="text"
                        className={styles.topicInput}
                        placeholder="Legg til emne..."
                        value={topicInput}
                        aria-label="Legg til emne for dette verset"
                        onChange={(e) => {
                          setTopicInput(e.target.value);
                          setShowTopicSuggestions(true);
                          setSelectedSuggestionIndex(0);
                        }}
                        onFocus={() => setShowTopicSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowTopicSuggestions(false), 150)}
                        onKeyDown={(e) => {
                          const suggestions = getTopicSuggestions();
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setSelectedSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setSelectedSuggestionIndex(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter' && topicInput.trim()) {
                            e.preventDefault();
                            if (suggestions.length > 0 && selectedSuggestionIndex < suggestions.length) {
                              handleAddTopic(suggestions[selectedSuggestionIndex]);
                            } else {
                              handleAddTopic(null);
                            }
                          } else if (e.key === 'Escape') {
                            setShowTopicSuggestions(false);
                          }
                        }}
                      />
                      {showTopicSuggestions && (getTopicSuggestions().length > 0 || topicInput.trim()) && (
                        <div className={styles.topicSuggestions}>
                          {getTopicSuggestions().map((topic, index) => (
                            <div
                              key={topic.id}
                              className={`${styles.topicSuggestion} ${index === selectedSuggestionIndex ? styles.selected : ''}`}
                              onClick={() => handleAddTopic(topic)}
                            >
                              {topic.name}
                            </div>
                          ))}
                          {topicInput.trim() && !topics.some(t => t.name.toLowerCase() === topicInput.trim().toLowerCase()) && (
                            <div
                              className={`${styles.topicSuggestion} ${getTopicSuggestions().length === selectedSuggestionIndex ? styles.selected : ''}`}
                              onClick={() => handleAddTopic(null)}
                            >
                              {topicInput.trim()}
                              <span className={styles.topicNewLabel}>(nytt emne)</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className={styles.notesContent}>
                    {verseNotes.length > 0 && (
                      <div className={styles.notesList}>
                        {verseNotes.map(note => {
                          const noteTopics = getTopicsForItem('note', note.id);
                          return (
                          <div key={note.id} className={styles.noteItem}>
                            {editingNoteId === note.id ? (
                              <div className={styles.noteEditForm}>
                                <textarea
                                  className={styles.noteTextarea}
                                  value={editNoteContent}
                                  onChange={(e) => setEditNoteContent(e.target.value)}
                                  rows={4}
                                  autoFocus
                                  aria-label="Rediger notat"
                                />
                                <div className={styles.noteActions}>
                                  <button
                                    className={styles.noteSaveButton}
                                    onClick={() => {
                                      if (editNoteContent.trim()) {
                                        updateNote(note.id, editNoteContent);
                                      }
                                      setEditingNoteId(null);
                                      setEditNoteContent('');
                                    }}
                                  >
                                    Lagre
                                  </button>
                                  <button
                                    className={styles.noteCancelButton}
                                    onClick={() => {
                                      setEditingNoteId(null);
                                      setEditNoteContent('');
                                    }}
                                  >
                                    Avbryt
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className={styles.noteText}>{note.content}</p>

                                {/* Emner for dette notatet */}
                                <div className={styles.noteTopics}>
                                  {noteTopics.length > 0 && (
                                    <div className={styles.topicsList}>
                                      {noteTopics.map(topic => (
                                        <span key={topic.id} className={styles.topicTag}>
                                          {topic.name}
                                          <button
                                            className={styles.topicRemove}
                                            onClick={() => removeTopicFromItem('note', note.id, topic.id)}
                                            title="Fjern emne"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <div className={styles.noteTopicInputWrapper}>
                                    <input
                                      type="text"
                                      className={styles.noteTopicInput}
                                      placeholder="Legg til emne..."
                                      value={noteTopicInput[note.id] || ''}
                                      onChange={(e) => {
                                        setNoteTopicInput(prev => ({ ...prev, [note.id]: e.target.value }));
                                        setShowNoteTopicSuggestions(note.id);
                                      }}
                                      onFocus={() => setShowNoteTopicSuggestions(note.id)}
                                      onBlur={() => setTimeout(() => setShowNoteTopicSuggestions(null), 150)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (noteTopicInput[note.id]?.trim() || getNoteTopicSuggestions(note.id).length > 0)) {
                                          e.preventDefault();
                                          const suggestions = getNoteTopicSuggestions(note.id);
                                          if (suggestions.length > 0) {
                                            handleAddNoteTopicFromInput(note.id, suggestions[0]);
                                          } else {
                                            handleAddNoteTopicFromInput(note.id, null);
                                          }
                                        } else if (e.key === 'Escape') {
                                          setShowNoteTopicSuggestions(null);
                                        }
                                      }}
                                    />
                                    {showNoteTopicSuggestions === note.id && (getNoteTopicSuggestions(note.id).length > 0 || noteTopicInput[note.id]?.trim()) && (
                                      <div className={styles.topicSuggestions}>
                                        {getNoteTopicSuggestions(note.id).map((topic) => (
                                          <div
                                            key={topic.id}
                                            className={styles.topicSuggestion}
                                            onClick={() => handleAddNoteTopicFromInput(note.id, topic)}
                                          >
                                            {topic.name}
                                          </div>
                                        ))}
                                        {noteTopicInput[note.id]?.trim() && !topics.some(t => t.name.toLowerCase() === noteTopicInput[note.id].trim().toLowerCase()) && (
                                          <div
                                            className={styles.topicSuggestion}
                                            onClick={() => handleAddNoteTopicFromInput(note.id, null)}
                                          >
                                            {noteTopicInput[note.id].trim()}
                                            <span className={styles.topicNewLabel}>(nytt emne)</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className={styles.noteFooter}>
                                  <span className={styles.noteDate}>
                                    {new Date(note.updatedAt).toLocaleDateString('nb-NO', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                  <div className={styles.noteActions}>
                                    <button
                                      className={styles.noteEditButton}
                                      onClick={() => {
                                        setEditingNoteId(note.id);
                                        setEditNoteContent(note.content);
                                      }}
                                      title="Rediger"
                                    >
                                      ✎
                                    </button>
                                    <button
                                      className={styles.noteDeleteButton}
                                      onClick={() => {
                                        if (confirm('Er du sikker på at du vil slette dette notatet?')) {
                                          deleteNote(note.id);
                                        }
                                      }}
                                      title="Slett"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    <div className={styles.noteInputWrapper}>
                      <textarea
                        className={styles.noteTextarea}
                        placeholder="Skriv et notat..."
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        rows={3}
                        aria-label="Skriv et notat for dette verset"
                      />
                      <button
                        className={styles.noteAddButton}
                        onClick={() => {
                          if (noteInput.trim()) {
                            addNote(bookId, verse.chapter, verse.verse, noteInput);
                            setNoteInput('');
                          }
                        }}
                        disabled={!noteInput.trim()}
                      >
                        Legg til notat
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'devotionals' && (
                  <div className={styles.devotionalsContent}>
                    {verseDevotionals.length > 0 ? (
                      <div className={styles.devotionalsList}>
                        {verseDevotionals.map(d => (
                          <Link key={d.id} to={`/manuskripter/${d.slug}`} className={styles.devotionalItem}>
                            <span className={styles.devotionalTitle}>{d.title}</span>
                            <span className={styles.devotionalDate}>
                              {new Date(d.date + 'T00:00:00').toLocaleDateString('nb-NO', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted">Ingen manuskripter for dette verset</p>
                    )}
                    <Link
                      to={`/manuskripter/ny?vers=${verseRef}`}
                      className={styles.writeDevotionalLink}
                    >
                      Skriv manuskript om dette verset
                    </Link>
                  </div>
                )}

                {activeTab === 'footnotes' && verse.footnotes && verse.footnotes.length > 0 && (
                  <div className={styles.footnotesContent}>
                    {verse.footnotes.map((fn, i) => (
                      <div key={i} className={styles.footnoteItem}>
                        {fn.source && (
                          <span className={styles.footnoteSource}>
                            {fn.source.charAt(0).toUpperCase() + fn.source.slice(1)}
                          </span>
                        )}
                        <p>{fn.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'versions' && hasVersions && (
                  <div className={styles.versionsContent}>
                    <p className={styles.versionsIntro}>
                      Velg hvilken oversettelse du vil bruke for dette verset:
                    </p>

                    <div className={styles.versionOption}>
                      <label className={styles.versionLabel}>
                        <input
                          type="radio"
                          name={`version-${verse.verse}`}
                          checked={selectedVersionIndex === undefined}
                          onChange={() => clearSelectedVersion(bookId, verse.chapter, verse.verse)}
                        />
                        <span className={styles.versionText}>
                          <span className={styles.versionTitle}>Standard versjon</span>
                          <span className={styles.versionPreview}>{verse.text}</span>
                        </span>
                      </label>
                    </div>

                    {selectableVersions.map((version, index) => (
                      <div key={index} className={styles.versionOption}>
                        <label className={styles.versionLabel}>
                          <input
                            type="radio"
                            name={`version-${verse.verse}`}
                            checked={selectedVersionIndex === index}
                            onChange={() => setSelectedVersion(bookId, verse.chapter, verse.verse, index)}
                          />
                          <span className={styles.versionText}>
                            <span className={styles.versionHeader}>
                              <span className={styles.versionTitle}>Alternativ {index + 1}</span>
                              {version.type && (
                                <span className={`${styles.versionBadge} ${styles[`badge${version.type.charAt(0).toUpperCase() + version.type.slice(1)}`]}`}>
                                  {version.type === 'suggestion' && 'Forslag'}
                                  {version.type === 'theological' && 'Teologisk'}
                                  {version.type === 'grammar' && 'Grammatikk'}
                                </span>
                              )}
                              {version.severity && (
                                <span className={`${styles.versionSeverity} ${styles[`severity${version.severity.charAt(0).toUpperCase() + version.severity.slice(1)}`]}`}>
                                  {version.severity === 'critical' && 'Kritisk'}
                                  {version.severity === 'major' && 'Viktig'}
                                  {version.severity === 'minor' && 'Liten'}
                                </span>
                              )}
                            </span>
                            <span className={styles.versionPreview}>{version.text}</span>
                            {version.explanation && (
                              <span className={styles.versionExplanation}>{version.explanation}</span>
                            )}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                  </div>
                </>
              )}

              {/* Mobile: Accordion */}
              {isMobile && (
                <div className={styles.accordion}>
                  {/* Grunntekst */}
                  <div className={styles.accordionItem}>
                    <button
                      className={`${styles.accordionHeader} ${openSections.has('original') ? styles.open : ''}`}
                      onClick={() => toggleSection('original')}
                      aria-expanded={openSections.has('original')}
                    >
                      <span>Grunntekst</span>
                      <span className={styles.accordionIcon}>{openSections.has('original') ? '−' : '+'}</span>
                    </button>
                    {openSections.has('original') && (
                      <div className={styles.accordionContent}>
                        <div className={styles.originalTextTab}>
                          {originalText && (
                            <div
                              className={`${styles.fullOriginalText} ${originalLanguage === 'hebrew' ? styles.hebrew : styles.greek}`}
                              dir={originalLanguage === 'hebrew' ? 'rtl' : 'ltr'}
                              lang={originalLanguage === 'hebrew' ? 'he' : 'el'}
                            >
                              {originalText}
                            </div>
                          )}
                          {originalWord4word && originalWord4word.length > 0 && (
                            <>
                              <h3 className={styles.sectionTitle}>Ord for ord</h3>
                              <div
                                className={`${styles.originalText} ${originalLanguage === 'hebrew' ? styles.hebrewWords : ''}`}
                                dir={originalLanguage === 'hebrew' ? 'rtl' : 'ltr'}
                                lang={originalLanguage === 'hebrew' ? 'he' : 'el'}
                              >
                                {originalWord4word.map(w => (
                                  <span
                                    key={w.word_index}
                                    className={`${styles.originalWord} ${styles.clickableWord} ${selectedOriginalWord?.word_index === w.word_index ? styles.selectedWord : ''}`}
                                    onClick={() => setSelectedOriginalWord(selectedOriginalWord?.word_index === w.word_index ? null : w)}
                                    tabIndex={0}
                                    role="button"
                                  >
                                    <span className={styles.originalScript}>{w.word}</span>
                                    {w.pronunciation && (
                                      <span className={styles.translatedWord}>{w.pronunciation}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {selectedOriginalWord && (
                                <div className={styles.wordExplanation}>
                                  <strong>{selectedOriginalWord.word}</strong>
                                  {selectedOriginalWord.pronunciation && (
                                    <span className={styles.pronunciationInline}> ({selectedOriginalWord.pronunciation})</span>
                                  )}
                                  {selectedOriginalWord.explanation && (
                                    <p>{selectedOriginalWord.explanation}</p>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {(!originalWord4word || originalWord4word.length === 0) && (
                            <p className="text-muted">Ingen orddata tilgjengelig</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Referanser */}
                  <div className={styles.accordionItem}>
                    <button
                      className={`${styles.accordionHeader} ${openSections.has('references') ? styles.open : ''}`}
                      onClick={() => toggleSection('references')}
                      aria-expanded={openSections.has('references')}
                    >
                      <span>Referanser {references && references.length > 0 && `(${references.length})`}</span>
                      <span className={styles.accordionIcon}>{openSections.has('references') ? '−' : '+'}</span>
                    </button>
                    {openSections.has('references') && (
                      <div className={styles.accordionContent}>
                        <div className={styles.referencesList}>
                          {references && references.length > 0 ? (
                            references.map((ref, index) => (
                              <a
                                key={index}
                                href={`/${toUrlSlug(ref.book_short_name || '')}/${ref.to_chapter}#v${ref.to_verse_start}`}
                                className={styles.reference}
                              >
                                <span className={styles.refLink}>{formatReference(ref)}</span>
                                {ref.description && (
                                  <span className={styles.refDescription}><InlineRefs>{ref.description}</InlineRefs></span>
                                )}
                              </a>
                            ))
                          ) : (
                            <p className="text-muted">Ingen referanser</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profetier */}
                  {prophecies && prophecies.length > 0 && (
                    <div className={styles.accordionItem}>
                      <button
                        className={`${styles.accordionHeader} ${openSections.has('prophecies') ? styles.open : ''}`}
                        onClick={() => toggleSection('prophecies')}
                        aria-expanded={openSections.has('prophecies')}
                      >
                        <span>Profetier ({prophecies.length})</span>
                        <span className={styles.accordionIcon}>{openSections.has('prophecies') ? '−' : '+'}</span>
                      </button>
                      {openSections.has('prophecies') && (
                        <div className={styles.accordionContent}>
                          <div className={styles.propheciesList}>
                            {prophecies.map((prophecy) => (
                              <a
                                key={prophecy.id}
                                href={`/profetier#${prophecy.id}`}
                                className={styles.prophecyItem}
                              >
                                <span className={styles.prophecyTitle}>{prophecy.title}</span>
                                <span className={styles.prophecyCategory}>{prophecy.category?.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Emner */}
                  <div className={styles.accordionItem}>
                    <button
                      className={`${styles.accordionHeader} ${openSections.has('topics') ? styles.open : ''}`}
                      onClick={() => toggleSection('topics')}
                      aria-expanded={openSections.has('topics')}
                    >
                      <span>Emner {verseTopics.length > 0 && `(${verseTopics.length})`}</span>
                      <span className={styles.accordionIcon}>{openSections.has('topics') ? '−' : '+'}</span>
                    </button>
                    {openSections.has('topics') && (
                      <div className={styles.accordionContent}>
                        <div className={styles.topicsContent}>
                          {verseTopics.length > 0 && (
                            <div className={styles.topicsList}>
                              {verseTopics.map(topic => (
                                <span key={topic.id} className={styles.topicTag}>
                                  {topic.name}
                                  <button
                                    className={styles.topicRemove}
                                    onClick={() => removeTopicFromVerse(bookId, verse.chapter, verse.verse, topic.id)}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className={styles.topicInputWrapper}>
                            <input
                              type="text"
                              className={styles.topicInput}
                              placeholder="Legg til emne..."
                              value={topicInput}
                              onChange={(e) => {
                                setTopicInput(e.target.value);
                                setShowTopicSuggestions(true);
                              }}
                              onFocus={() => setShowTopicSuggestions(true)}
                              onBlur={() => setTimeout(() => setShowTopicSuggestions(false), 150)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && topicInput.trim()) {
                                  e.preventDefault();
                                  const suggestions = getTopicSuggestions();
                                  if (suggestions.length > 0) {
                                    handleAddTopic(suggestions[0]);
                                  } else {
                                    handleAddTopic(null);
                                  }
                                }
                              }}
                            />
                            {showTopicSuggestions && getTopicSuggestions().length > 0 && (
                              <div className={styles.topicSuggestions}>
                                {getTopicSuggestions().map((topic) => (
                                  <div
                                    key={topic.id}
                                    className={styles.topicSuggestion}
                                    onClick={() => handleAddTopic(topic)}
                                  >
                                    {topic.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notater */}
                  <div className={styles.accordionItem}>
                    <button
                      className={`${styles.accordionHeader} ${openSections.has('notes') ? styles.open : ''}`}
                      onClick={() => toggleSection('notes')}
                      aria-expanded={openSections.has('notes')}
                    >
                      <span>Notater {verseNotes.length > 0 && `(${verseNotes.length})`}</span>
                      <span className={styles.accordionIcon}>{openSections.has('notes') ? '−' : '+'}</span>
                    </button>
                    {openSections.has('notes') && (
                      <div className={styles.accordionContent}>
                        <div className={styles.notesContent}>
                          {verseNotes.length > 0 && (
                            <div className={styles.notesList}>
                              {verseNotes.map(note => {
                                const noteTopics = getTopicsForItem('note', note.id);
                                return (
                                <div key={note.id} className={styles.noteItem}>
                                  <p className={styles.noteText}>{note.content}</p>

                                  {/* Emner for dette notatet */}
                                  <div className={styles.noteTopics}>
                                    {noteTopics.length > 0 && (
                                      <div className={styles.topicsList}>
                                        {noteTopics.map(topic => (
                                          <span key={topic.id} className={styles.topicTag}>
                                            {topic.name}
                                            <button
                                              className={styles.topicRemove}
                                              onClick={() => removeTopicFromItem('note', note.id, topic.id)}
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <div className={styles.noteTopicInputWrapper}>
                                      <input
                                        type="text"
                                        className={styles.noteTopicInput}
                                        placeholder="Legg til emne..."
                                        value={noteTopicInput[note.id] || ''}
                                        onChange={(e) => {
                                          setNoteTopicInput(prev => ({ ...prev, [note.id]: e.target.value }));
                                          setShowNoteTopicSuggestions(note.id);
                                        }}
                                        onFocus={() => setShowNoteTopicSuggestions(note.id)}
                                        onBlur={() => setTimeout(() => setShowNoteTopicSuggestions(null), 150)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && (noteTopicInput[note.id]?.trim() || getNoteTopicSuggestions(note.id).length > 0)) {
                                            e.preventDefault();
                                            const suggestions = getNoteTopicSuggestions(note.id);
                                            if (suggestions.length > 0) {
                                              handleAddNoteTopicFromInput(note.id, suggestions[0]);
                                            } else {
                                              handleAddNoteTopicFromInput(note.id, null);
                                            }
                                          }
                                        }}
                                      />
                                      {showNoteTopicSuggestions === note.id && getNoteTopicSuggestions(note.id).length > 0 && (
                                        <div className={styles.topicSuggestions}>
                                          {getNoteTopicSuggestions(note.id).map((topic) => (
                                            <div
                                              key={topic.id}
                                              className={styles.topicSuggestion}
                                              onClick={() => handleAddNoteTopicFromInput(note.id, topic)}
                                            >
                                              {topic.name}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className={styles.noteFooter}>
                                    <span className={styles.noteDate}>
                                      {new Date(note.updatedAt).toLocaleDateString('nb-NO')}
                                    </span>
                                    <button
                                      className={styles.noteDeleteButton}
                                      onClick={() => deleteNote(note.id)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          )}
                          <div className={styles.noteInputWrapper}>
                            <textarea
                              className={styles.noteTextarea}
                              placeholder="Skriv et notat..."
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              rows={3}
                            />
                            <button
                              className={styles.noteAddButton}
                              onClick={() => {
                                if (noteInput.trim()) {
                                  addNote(bookId, verse.chapter, verse.verse, noteInput);
                                  setNoteInput('');
                                }
                              }}
                              disabled={!noteInput.trim()}
                            >
                              Legg til
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manuskripter */}
                  <div className={styles.accordionItem}>
                    <button
                      className={`${styles.accordionHeader} ${openSections.has('devotionals') ? styles.open : ''}`}
                      onClick={() => toggleSection('devotionals')}
                      aria-expanded={openSections.has('devotionals')}
                    >
                      <span>Manuskripter {hasDevotionals && `(${verseDevotionals.length})`}</span>
                      <span className={styles.accordionIcon}>{openSections.has('devotionals') ? '−' : '+'}</span>
                    </button>
                    {openSections.has('devotionals') && (
                      <div className={styles.accordionContent}>
                        <div className={styles.devotionalsContent}>
                          {verseDevotionals.length > 0 ? (
                            <div className={styles.devotionalsList}>
                              {verseDevotionals.map(d => (
                                <Link key={d.id} to={`/manuskripter/${d.slug}`} className={styles.devotionalItem}>
                                  <span className={styles.devotionalTitle}>{d.title}</span>
                                  <span className={styles.devotionalDate}>
                                    {new Date(d.date + 'T00:00:00').toLocaleDateString('nb-NO', {
                                      day: 'numeric',
                                      month: 'short',
                                    })}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted">Ingen manuskripter</p>
                          )}
                          <Link
                            to={`/manuskripter/ny?vers=${verseRef}`}
                            className={styles.writeDevotionalLink}
                          >
                            Skriv manuskript
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Versjoner */}
                  {hasVersions && (
                    <div className={styles.accordionItem}>
                      <button
                        className={`${styles.accordionHeader} ${openSections.has('versions') ? styles.open : ''}`}
                        onClick={() => toggleSection('versions')}
                        aria-expanded={openSections.has('versions')}
                      >
                        <span>Versjoner {selectedVersionIndex !== undefined && '●'}</span>
                        <span className={styles.accordionIcon}>{openSections.has('versions') ? '−' : '+'}</span>
                      </button>
                      {openSections.has('versions') && (
                        <div className={styles.accordionContent}>
                          <div className={styles.versionsContent}>
                            <div className={styles.versionOption}>
                              <label className={styles.versionLabel}>
                                <input
                                  type="radio"
                                  name={`version-mobile-${verse.verse}`}
                                  checked={selectedVersionIndex === undefined}
                                  onChange={() => clearSelectedVersion(bookId, verse.chapter, verse.verse)}
                                />
                                <span className={styles.versionText}>
                                  <span className={styles.versionTitle}>Standard versjon</span>
                                  <span className={styles.versionPreview}>{verse.text}</span>
                                </span>
                              </label>
                            </div>
                            {selectableVersions.map((version, index) => (
                              <div key={index} className={styles.versionOption}>
                                <label className={styles.versionLabel}>
                                  <input
                                    type="radio"
                                    name={`version-mobile-${verse.verse}`}
                                    checked={selectedVersionIndex === index}
                                    onChange={() => setSelectedVersion(bookId, verse.chapter, verse.verse, index)}
                                  />
                                  <span className={styles.versionText}>
                                    <span className={styles.versionHeader}>
                                      <span className={styles.versionTitle}>Alternativ {index + 1}</span>
                                      {version.type && (
                                        <span className={`${styles.versionBadge} ${styles[`badge${version.type.charAt(0).toUpperCase() + version.type.slice(1)}`]}`}>
                                          {version.type === 'suggestion' && 'Forslag'}
                                          {version.type === 'theological' && 'Teologisk'}
                                          {version.type === 'grammar' && 'Grammatikk'}
                                        </span>
                                      )}
                                      {version.severity && (
                                        <span className={`${styles.versionSeverity} ${styles[`severity${version.severity.charAt(0).toUpperCase() + version.severity.slice(1)}`]}`}>
                                          {version.severity === 'critical' && 'Kritisk'}
                                          {version.severity === 'major' && 'Viktig'}
                                          {version.severity === 'minor' && 'Liten'}
                                        </span>
                                      )}
                                    </span>
                                    <span className={styles.versionPreview}>{version.text}</span>
                                    {version.explanation && (
                                      <span className={styles.versionExplanation}>{version.explanation}</span>
                                    )}
                                  </span>
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {verse.footnotes && verse.footnotes.length > 0 && (
                    <div className={styles.accordionSection}>
                      <button
                        className={`${styles.accordionHeader} ${openSections.has('footnotes') ? styles.open : ''}`}
                        onClick={() => toggleSection('footnotes')}
                        aria-expanded={openSections.has('footnotes')}
                      >
                        <span>Fotnoter ({verse.footnotes.length})</span>
                        <span className={styles.accordionIcon}>{openSections.has('footnotes') ? '−' : '+'}</span>
                      </button>
                      {openSections.has('footnotes') && (
                        <div className={styles.accordionContent}>
                          <div className={styles.footnotesContent}>
                            {verse.footnotes.map((fn, i) => (
                              <div key={i} className={styles.footnoteItem}>
                                {fn.source && (
                                  <span className={styles.footnoteSource}>
                                    {fn.source.charAt(0).toUpperCase() + fn.source.slice(1)}
                                  </span>
                                )}
                                <p>{fn.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
