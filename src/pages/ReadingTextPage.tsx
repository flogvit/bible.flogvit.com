import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSettings } from '@/components/SettingsContext';
import { Reference } from '@/components/Reference';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import styles from '@/styles/pages/day.module.scss';

interface EnrichedVerse {
  chapter: number;
  verse: number;
  text: string;
  part?: string;
}

interface VerseRange {
  book_id: number;
}

interface PartResponse {
  title: string | null;
  display_ref: string;       // unique key for verses lookup
  refs: string[];            // individual ref markups (with @source) for the Reference component
  ranges: VerseRange[];
}

interface OptionResponse {
  parts: PartResponse[];
}

function getReadingType(bookId: number): string {
  if (bookId === 19) return 'Salme';
  if (bookId <= 39) return 'GT-tekst';
  if (bookId === 44) return 'Lesning fra Apostlene';
  if (bookId >= 40 && bookId <= 43) return 'Evangelium';
  if (bookId === 66) return 'Åpenbaringen';
  return 'Brev';
}

interface SlotResponse {
  options: OptionResponse[];
}

interface ReadingTextResponse {
  id: number;
  date: string;
  name: string;
  series: string | null;
  slots: SlotResponse[];
  verses: Record<string, EnrichedVerse[]>;
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatVerseNum(v: EnrichedVerse): string {
  return `${v.verse}${v.part || ''}`;
}

function PartView({ part, verses }: { part: PartResponse; verses: EnrichedVerse[] }) {
  const readingType = part.ranges.length > 0 ? getReadingType(part.ranges[0].book_id) : '';
  return (
    <div className={styles.partBlock}>
      {readingType && (
        <div style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-secondary, #8b7355)',
          fontWeight: 600,
          marginBottom: '0.25rem',
        }}>
          {readingType}
        </div>
      )}
      <h2 style={{ marginTop: 0 }}>{part.title || part.refs.join('; ')}</h2>
      <p className={styles.nextDate} style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
        {part.refs.map((r, i) => (
          <span key={i}>
            {i > 0 && '; '}
            <Reference text={r} />
          </span>
        ))}
      </p>
      {verses.length > 0 ? (
        <div style={{ lineHeight: 1.8, fontSize: '1.05rem' }}>
          {verses.map((v, vi) => {
            const prevChapter = vi > 0 ? verses[vi - 1].chapter : v.chapter;
            const showChapter = vi === 0 || v.chapter !== prevChapter;
            return (
              <span key={vi}>
                <sup style={{ color: 'var(--color-secondary, #8b7355)', marginRight: '0.25rem', fontSize: '0.75rem' }}>
                  {showChapter ? `${v.chapter}:` : ''}{formatVerseNum(v)}
                </sup>
                {v.text}{' '}
              </span>
            );
          })}
        </div>
      ) : (
        <p style={{ color: 'var(--color-text-muted, #999)', fontStyle: 'italic' }}>
          Verstekst ikke tilgjengelig for denne oversettelsen.
        </p>
      )}
    </div>
  );
}

export function ReadingTextPage() {
  const { id } = useParams<{ id: string }>();
  const { settings } = useSettings();
  const [data, setData] = useState<ReadingTextResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const bible = settings.bible || 'osnb2';
  const mapping = settings.numberingSystem || 'osnb2';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (bible !== 'osnb2') params.set('bible', bible);
    if (mapping !== 'osnb2') params.set('mapping', mapping);
    const qs = params.toString();
    fetch(`/api/reading-texts/${id}${qs ? '?' + qs : ''}`)
      .then(res => res.json())
      .then(result => {
        setData(result);
        document.title = `${result.name} | bibel.flogvit.no`;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, bible, mapping]);

  if (loading) return <main className={styles.main}><div className="reading-container"><p>Laster...</p></div></main>;
  if (!data || !data.slots) return <main className={styles.main}><div className="reading-container"><p>Fant ikke leseteksten.</p></div></main>;

  return (
    <main className={styles.main}>
      <div className="reading-container">
        <Breadcrumbs items={[
          { label: 'Lesetekster', href: '/lesetekster' },
          { label: data.name },
        ]} />

        <h1>{data.name}</h1>
        <div className={styles.meta}>
          <span className={styles.nextDate}>{formatDate(data.date)}</span>
          {data.series && <span className={styles.categoryBadge}>Rekke {data.series}</span>}
        </div>

        {data.slots.map((slot, slotIdx) => {
          const hasAlternatives = slot.options.length > 1;
          return (
            <section key={slotIdx} className={styles.contentSection}>
              {slot.options.map((option, optIdx) => (
                <div
                  key={optIdx}
                  style={hasAlternatives ? {
                    borderLeft: '3px solid var(--color-accent, #c9a959)',
                    paddingLeft: '1rem',
                    marginBottom: optIdx < slot.options.length - 1 ? '1rem' : 0,
                  } : undefined}
                >
                  {optIdx > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      margin: '1.25rem 0',
                    }}>
                      <span style={{ flex: 1, height: 1, background: 'var(--color-border, #e5e0d8)' }} />
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'var(--color-accent, #c9a959)',
                        color: '#fff',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>eller</span>
                      <span style={{ flex: 1, height: 1, background: 'var(--color-border, #e5e0d8)' }} />
                    </div>
                  )}
                  {option.parts.map((part, partIdx) => (
                    <PartView
                      key={partIdx}
                      part={part}
                      verses={data.verses[part.display_ref] || []}
                    />
                  ))}
                </div>
              ))}
            </section>
          );
        })}

        <Link to="/lesetekster" style={{ color: 'var(--color-secondary, #8b7355)', fontSize: '0.9rem' }}>
          ← Alle lesetekster
        </Link>
      </div>
    </main>
  );
}
