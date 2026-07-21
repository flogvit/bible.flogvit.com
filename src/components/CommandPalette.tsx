import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandPalette } from './CommandPaletteContext';
import styles from './CommandPalette.module.scss';

type ResultKind = 'reference' | 'page' | 'action' | 'search';

interface Result {
  kind: ResultKind;
  label: string;
  hint?: string;
  to?: string;
  onSelect?: () => void;
}

const PAGES: Result[] = [
  { kind: 'page', label: 'Hjem', to: '/', hint: 'Forside' },
  { kind: 'page', label: 'Favoritter', to: '/favoritter', hint: 'Mitt · F' },
  { kind: 'page', label: 'Emner', to: '/emner', hint: 'Mitt · E' },
  { kind: 'page', label: 'Notater', to: '/notater', hint: 'Mitt · N' },
  { kind: 'page', label: 'Verslister', to: '/lister', hint: 'Mitt · V' },
  { kind: 'page', label: 'Leseplan', to: '/leseplan', hint: 'Mitt · L' },
  { kind: 'page', label: 'Manuskripter', to: '/manuskripter', hint: 'Mitt · M' },
  { kind: 'page', label: 'Skriv nytt manuskript', to: '/manuskripter/ny', hint: 'Manuskripter' },
  { kind: 'page', label: 'Kjente vers', to: '/kjente-vers', hint: 'Studier · K' },
  { kind: 'page', label: 'Temaer', to: '/temaer', hint: 'Studier · C' },
  { kind: 'page', label: 'Bibelhistorier', to: '/historier', hint: 'Studier · B' },
  { kind: 'page', label: 'Profetier', to: '/profetier', hint: 'Studier · P' },
  { kind: 'page', label: 'Paralleller', to: '/paralleller', hint: 'Studier · A' },
  { kind: 'page', label: 'Personer', to: '/personer', hint: 'Studier · O' },
  { kind: 'page', label: 'Tall', to: '/tall', hint: 'Studier · Y' },
  { kind: 'page', label: 'Tidslinje', to: '/tidslinje', hint: 'Oversikt · T' },
  { kind: 'page', label: 'Lesetekster', to: '/lesetekster', hint: 'Oversikt' },
  { kind: 'page', label: 'Statistikk', to: '/statistikk', hint: 'Oversikt · I' },
  { kind: 'page', label: 'Oversettelser', to: '/oversettelser', hint: 'Oversikt' },
  { kind: 'page', label: 'Søk i originalspråk', to: '/sok/original', hint: 'Søk' },
  { kind: 'page', label: 'Innstillinger', to: '/innstillinger', hint: 'Konto · sync' },
  { kind: 'page', label: 'Offline', to: '/offline', hint: 'Last ned bibel' },
  { kind: 'page', label: 'Om', to: '/om' },
  { kind: 'page', label: 'Tilgjengelighet', to: '/tilgjengelighet' },
];

function fuzzyMatch(q: string, label: string): boolean {
  if (!q) return true;
  const qLower = q.toLowerCase();
  return label.toLowerCase().includes(qLower);
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [refResult, setRefResult] = useState<Result | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery('');
      setSelectedIdx(0);
      setRefResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRefResult(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reference?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.reference?.url) {
          setRefResult({
            kind: 'reference',
            label: data.reference.label || q,
            hint: 'Gå til vers',
            to: data.reference.url,
          });
        } else {
          setRefResult(null);
        }
      } catch {
        if (!cancelled) setRefResult(null);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const results: Result[] = useMemo(() => {
    const q = query.trim();
    const list: Result[] = [];
    if (refResult) list.push(refResult);
    const pageHits = PAGES.filter(p => fuzzyMatch(q, p.label));
    list.push(...pageHits.slice(0, 20));
    if (q) {
      list.push({
        kind: 'search',
        label: `Søk etter «${q}» i bibelteksten`,
        hint: 'Fulltekstsøk',
        to: `/sok?q=${encodeURIComponent(q)}`,
      });
      list.push({
        kind: 'search',
        label: `Søk i originalspråk etter «${q}»`,
        hint: 'Hebraisk / gresk',
        to: `/sok/original?q=${encodeURIComponent(q)}`,
      });
    }
    return list;
  }, [query, refResult]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, refResult]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selectedIdx];
      if (!r) return;
      select(r);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function select(r: Result) {
    if (r.to) navigate(r.to);
    else r.onSelect?.();
    close();
  }

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Hurtigsøk" onMouseDown={close}>
      <div className={styles.palette} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <svg className={styles.icon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Søk vers, person, tema, manuskript…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Hurtigsøk"
            autoComplete="off"
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>
        <ul className={styles.results} role="listbox">
          {results.length === 0 && (
            <li className={styles.empty}>Skriv for å søke. Prøv «Joh 3,16», «Salme 23», «nåde» eller et sidenavn.</li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.label}-${i}`}
              role="option"
              aria-selected={i === selectedIdx}
              className={`${styles.row} ${i === selectedIdx ? styles.selected : ''}`}
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => select(r)}
            >
              <span className={`${styles.kind} ${styles[`kind_${r.kind}`]}`}>
                {r.kind === 'reference' && '📖'}
                {r.kind === 'page' && '↗'}
                {r.kind === 'search' && '🔍'}
                {r.kind === 'action' && '⚙'}
              </span>
              <span className={styles.label}>{r.label}</span>
              {r.hint && <span className={styles.hint}>{r.hint}</span>}
            </li>
          ))}
        </ul>
        <div className={styles.footer}>
          <span><kbd>↑</kbd><kbd>↓</kbd> velg</span>
          <span><kbd>↵</kbd> åpne</span>
          <span><kbd>Esc</kbd> lukk</span>
        </div>
      </div>
    </div>
  );
}
