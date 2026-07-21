import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../SettingsContext';
import styles from './PrefsPopover.module.scss';

interface PrefsPopoverProps {
  bibleOptions: { id: string; name: string }[];
  currentBible: string;
  onBibleChange: (id: string) => void;
}

export function PrefsPopover({ bibleOptions, currentBible, onBibleChange }: PrefsPopoverProps) {
  const { settings, updateSetting, toggleSetting } = useSettings();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fontSize = settings.fontSize ?? 'medium';
  const layoutMode = settings.layoutMode ?? 'normal';
  const isFocus = layoutMode === 'reading';
  const copyNums = settings.copyVerseNumbers ?? true;
  const parallelOn = !!settings.showParallels;
  const showOriginal = !!settings.showOriginalText;
  const secondary = settings.secondaryBible ?? 'osnn1';

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(v => !v)}
        aria-label="Lesevalg"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Lesevalg"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h10M4 12h4M4 18h14" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="20" cy="18" r="2" />
        </svg>
      </button>
      {open && (
        <div className={styles.pop} role="dialog" aria-label="Lesevalg">
          <div className={styles.sec}>
            <h5>Oversettelse</h5>
            <div className={styles.row}>
              <label htmlFor="prefMain">Hovedtekst</label>
              <select
                id="prefMain"
                className={styles.select}
                value={currentBible}
                onChange={e => onBibleChange(e.target.value)}
              >
                {bibleOptions.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.row}>
              <label htmlFor="prefUndertekst">
                Undertekst
                <span className={styles.hint}>Annen oversettelse under hvert vers</span>
              </label>
              <select
                id="prefUndertekst"
                className={styles.select}
                value={showOriginal ? secondary : 'off'}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'off') {
                    updateSetting('showOriginalText', false);
                  } else {
                    updateSetting('showOriginalText', true);
                    updateSetting('secondaryBible', val);
                  }
                }}
              >
                <option value="off">Av</option>
                <option value="osnb2">Bokmål 2011</option>
                <option value="osnn1">Nynorsk 2011</option>
                <option value="original">Grunntekst (gresk/hebr.)</option>
              </select>
            </div>
            <div className={styles.row}>
              <label>
                Parallelle tekster
                <span className={styles.hint}>Lenker til synoptiske passasjer</span>
              </label>
              <ToggleSwitch
                checked={parallelOn}
                onToggle={() => toggleSetting('showParallels')}
                label="Parallelle tekster"
              />
            </div>
          </div>

          <div className={styles.sec}>
            <h5>Tekst</h5>
            <div className={styles.row}>
              <label>Tekststørrelse</label>
              <div className={styles.seg}>
                {(['small', 'medium', 'large'] as const).map(sz => (
                  <button
                    key={sz}
                    type="button"
                    className={fontSize === sz ? styles.segOn : ''}
                    onClick={() => updateSetting('fontSize', sz)}
                    aria-pressed={fontSize === sz}
                  >
                    {sz === 'small' ? 'S' : sz === 'medium' ? 'M' : 'L'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.sec}>
            <h5>Visning</h5>
            <div className={styles.row}>
              <label>
                Versdetaljer
                <span className={styles.hint}>Kryssref, profetier osv.</span>
              </label>
              <ToggleSwitch
                checked={!!settings.showVerseDetails}
                onToggle={() => toggleSetting('showVerseDetails')}
                label="Versdetaljer"
              />
            </div>
            <div className={styles.row}>
              <label>Indikatorer (★ · notat)</label>
              <ToggleSwitch
                checked={settings.showVerseIndicators ?? true}
                onToggle={() => toggleSetting('showVerseIndicators')}
                label="Indikatorer"
              />
            </div>
            <div className={styles.row}>
              <label>Sammendrag i tekst</label>
              <ToggleSwitch
                checked={!!settings.showContextInline}
                onToggle={() => toggleSetting('showContextInline')}
                label="Sammendrag i tekst"
              />
            </div>
            <div className={styles.row}>
              <label>Kapittel-innsikt</label>
              <ToggleSwitch
                checked={settings.showChapterInsights ?? true}
                onToggle={() => toggleSetting('showChapterInsights')}
                label="Kapittel-innsikt"
              />
            </div>
            <div className={styles.row}>
              <label>Fokusmodus (F)</label>
              <ToggleSwitch
                checked={isFocus}
                onToggle={() => updateSetting('layoutMode', isFocus ? 'normal' : 'reading')}
                label="Fokusmodus"
              />
            </div>
          </div>

          <div className={styles.sec}>
            <h5>Kopier-til-Word</h5>
            <div className={styles.row}>
              <label>
                Inkluder versnummer
                <span className={styles.hint}>Når du kopierer tekst</span>
              </label>
              <ToggleSwitch
                checked={copyNums}
                onToggle={() => toggleSetting('copyVerseNumbers')}
                label="Versnummer ved kopi"
              />
            </div>
            <div className={styles.hintFull}>
              Kopierer ren tekst + Word-vennlig HTML. Slå av versnummer for ren prosatekst.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <div
      role="switch"
      tabIndex={0}
      aria-checked={checked}
      aria-label={label}
      className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle();
        }
      }}
    />
  );
}
