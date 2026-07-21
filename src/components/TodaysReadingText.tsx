import { useState, useEffect } from 'react';
import type * as React from 'react';
import { Link } from 'react-router-dom';
import { Reference } from './Reference';
import styles from './TodaysDay.module.scss';

interface VerseRange {
  book_id: number;
}

interface PartResponse {
  title: string | null;
  display_ref: string;
  refs: string[];
  ranges: VerseRange[];
}

function getReadingType(bookId: number): string {
  if (bookId === 19) return 'Salme';
  if (bookId <= 39) return 'GT';
  if (bookId === 44) return 'Apostlene';
  if (bookId >= 40 && bookId <= 43) return 'Evangelium';
  if (bookId === 66) return 'Åp';
  return 'Brev';
}

interface OptionResponse {
  parts: PartResponse[];
}

interface SlotResponse {
  options: OptionResponse[];
}

interface ReadingTextWithSlots {
  id: number;
  date: string;
  name: string;
  series: string | null;
  slots: SlotResponse[];
}

export function TodaysReadingText() {
  const [texts, setTexts] = useState<ReadingTextWithSlots[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reading-texts/today')
      .then(res => res.json())
      .then(data => setTexts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || texts.length === 0) return null;

  return (
    <>
      {texts.map(text => (
        <div key={text.id} className={styles.container}>
          <div style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-secondary, #8b7355)',
            fontWeight: 600,
            marginBottom: '0.25rem',
          }}>
            DnK lesetekster{text.series ? ` · Rekke ${text.series}` : ''}
          </div>
          <div className={styles.header}>
            <h3>
              <Link to={`/lesetekster/${text.id}`} className={styles.dayLink}>{text.name}</Link>
            </h3>
          </div>

          <div className={styles.references} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
            {text.slots.map((slot, slotIdx) => (
              <div key={slotIdx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.4rem' }}>
                {slot.options.flatMap((option, optIdx) => {
                  const items: React.ReactNode[] = [];
                  if (optIdx > 0) {
                    items.push(
                      <span key={`or-${optIdx}`} style={{ color: 'var(--color-text-muted, #999)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                        eller
                      </span>,
                    );
                  }
                  option.parts.forEach((part, partIdx) => {
                    const type = part.ranges.length > 0 ? getReadingType(part.ranges[0].book_id) : '';
                    items.push(
                      <span key={`${optIdx}-${partIdx}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.25rem' }}>
                        {type && (
                          <small style={{ color: 'var(--color-text-muted, #999)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type}:</small>
                        )}
                        {part.refs.map((r, ri) => (
                          <span key={ri}>
                            {ri > 0 && '; '}
                            <Reference text={r} className={styles.refLink} />
                          </span>
                        ))}
                      </span>,
                    );
                  });
                  return items;
                })}
              </div>
            ))}
          </div>

          <Link to={`/lesetekster/${text.id}`} className={styles.moreLink}>
            Se alle lesetekster →
          </Link>
        </div>
      ))}
    </>
  );
}
