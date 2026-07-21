import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/components/SettingsContext';
import { useAuth } from '@/components/AuthContext';
import { useSync } from '@/components/SyncContext';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { bibleVersions, defaultSearchResultTypes } from '@/lib/settings';
import { getUserBibles } from '@/lib/offline/userBibles';
import { useDataImportExport } from '@/hooks/useDataImportExport';
import type { FontSize, SearchResultTypes } from '@/lib/settings';
import styles from '@/styles/pages/settings.module.scss';

export function SettingsPage() {
  const { settings, toggleSetting, updateSetting } = useSettings();
  const { user, isAuthenticated, logout } = useAuth();
  const { status: syncStatus, lastSyncAt, syncNow } = useSync();
  const [allVersions, setAllVersions] = useState(bibleVersions);
  const [kvnMappings, setKvnMappings] = useState<{ id: string; displayName: string }[]>([]);
  const {
    fileInputRef,
    importData,
    importError,
    importSuccess,
    handleExport,
    handleFileSelect,
    handleImport,
    cancelImport,
    triggerFileSelect,
    getImportSummary,
  } = useDataImportExport();

  useEffect(() => {
    getUserBibles().then(userBibles => {
      if (userBibles.length > 0) {
        setAllVersions([
          ...bibleVersions,
          ...userBibles.map(ub => ({ value: ub.id, label: ub.name })),
        ]);
      }
    });
    fetch('/api/mappings/kvn')
      .then(r => r.json())
      .then(data => setKvnMappings(data.mappings || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = 'Innstillinger | bibel.flogvit.no';
  }, []);

  const hidden = settings.hiddenBibles || [];

  function toggleBibleVisibility(bibleValue: string) {
    // Can't hide the active bible
    if (bibleValue === settings.bible) return;

    const newHidden = hidden.includes(bibleValue)
      ? hidden.filter(v => v !== bibleValue)
      : [...hidden, bibleValue];
    updateSetting('hiddenBibles', newHidden);
  }

  const tools = [
    { key: 'showBookSummary' as const, label: 'Boksammendrag' },
    { key: 'showChapterSummary' as const, label: 'Kapittelsammendrag' },
    { key: 'showChapterContext' as const, label: 'Historisk kontekst' },
    { key: 'showChapterInsights' as const, label: 'Kapittelinnsikt' },
    { key: 'showImportantWords' as const, label: 'Viktige ord' },
    { key: 'showVerseDetails' as const, label: 'Versdetaljer' },
    { key: 'showVerseIndicators' as const, label: 'Versindikatorer' },
    { key: 'showTimeline' as const, label: 'Tidslinje' },
    { key: 'showParallels' as const, label: 'Parallelle tekster' },
  ];

  // Build secondary bible options (exclude current primary)
  const secondaryOptions = [
    { value: 'original', label: 'Grunntekst' },
    ...allVersions.filter(v => v.value !== settings.bible),
  ];

  const fontSizes: { value: FontSize; label: string }[] = [
    { value: 'small', label: 'Liten' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Stor' },
  ];

  return (
    <main className={styles.main}>
      <div className="container">
      <Breadcrumbs items={[
        { label: 'Hjem', href: '/' },
        { label: 'Innstillinger' },
      ]} />

      <h1>Innstillinger</h1>

      {/* Section: Account & Sync */}
      <div className={styles.section}>
        <h2>Konto og synkronisering</h2>
        <p>Logg inn for å synkronisere data mellom enheter.</p>
        {isAuthenticated && user ? (
          <div className={styles.accountInfo}>
            <div className={styles.userRow}>
              {user.pictureUrl && (
                <img src={user.pictureUrl} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
              )}
              <div>
                <div className={styles.userName}>{user.name}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
            </div>
            <div className={styles.syncRow}>
              <span className={styles.syncStatus}>
                {syncStatus === 'syncing' && 'Synkroniserer...'}
                {syncStatus === 'idle' && lastSyncAt && `Sist synkronisert: ${new Date(lastSyncAt).toLocaleString('nb-NO')}`}
                {syncStatus === 'idle' && !lastSyncAt && 'Ikke synkronisert ennå'}
                {syncStatus === 'error' && 'Synkronisering feilet'}
                {syncStatus === 'offline' && 'Frakoblet'}
              </span>
              <button
                className={styles.syncButton}
                onClick={syncNow}
                disabled={syncStatus === 'syncing'}
              >
                Synkroniser nå
              </button>
            </div>
            <button className={styles.logoutButton} onClick={logout}>
              Logg ut
            </button>
          </div>
        ) : (
          <GoogleLoginButton />
        )}
      </div>

      {/* Section 1: Translations */}
      <div className={styles.section}>
        <h2>Oversettelser</h2>
        <p>Klikk for å velge standard oversettelse. Bruk bryteren for å skjule fra hurtigpanelet.</p>
        <div className={styles.bibleList}>
          {allVersions.map(version => {
            const isActive = version.value === settings.bible;
            const isHidden = hidden.includes(version.value);
            const isUser = version.value.startsWith('user:');

            return (
              <div key={version.value} className={`${styles.bibleItem} ${isActive ? styles.bibleItemActive : ''}`}>
                <button
                  className={styles.bibleSelectButton}
                  onClick={() => {
                    updateSetting('bible', version.value);
                    // Unhide if hidden
                    if (isHidden) {
                      updateSetting('hiddenBibles', hidden.filter(v => v !== version.value));
                    }
                  }}
                >
                  <span className={styles.bibleName}>{version.label}</span>
                  {isActive && <span className={styles.activeBadge}>Standard</span>}
                  {isUser && <span className={styles.userBadge}>Egen</span>}
                </button>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    disabled={isActive}
                    onChange={() => toggleBibleVisibility(version.value)}
                  />
                  <span className={styles.toggleTrack}></span>
                </label>
              </div>
            );
          })}
        </div>
        <Link to="/oversettelser" className={styles.translationsLink}>
          Last opp egne oversettelser →
        </Link>

        {kvnMappings.length > 0 && (
          <>
            <h3 style={{ fontSize: '1rem', margin: '1.5rem 0 0.5rem 0' }}>Versnummerering</h3>
            <p>Velg hvilken versnummerering som brukes ved bibellesing.</p>
            <select
              className={styles.secondaryBibleSelect}
              value={settings.numberingSystem || 'osnb2'}
              onChange={(e) => updateSetting('numberingSystem', e.target.value)}
            >
              {kvnMappings.map(m => (
                <option key={m.id} value={m.id}>{m.displayName}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Section 2: Home page */}
      <div className={styles.section}>
        <h2>Forside</h2>
        <p>Velg hva som vises på forsiden.</p>
        <div className={styles.tools}>
          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.showContinueReading ?? true}
              onChange={() => toggleSetting('showContinueReading')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Fortsett lesing</span>
          </label>
          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.showDailyVerse ?? true}
              onChange={() => toggleSetting('showDailyVerse')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Dagens vers</span>
          </label>
          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.showTodaysDay ?? true}
              onChange={() => toggleSetting('showTodaysDay')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Dagens helligdag</span>
          </label>
          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.showReadingTexts ?? true}
              onChange={() => toggleSetting('showReadingTexts')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Dagens lesetekster</span>
          </label>
        </div>
      </div>

      {/* Section: Search result types */}
      <div className={styles.section}>
        <h2>Søkeresultater</h2>
        <p>Velg hvilke ressurstyper som vises i søkeresultatene.</p>
        <div className={styles.tools}>
          {([
            { key: 'stories', label: 'Bibelhistorier' },
            { key: 'themes', label: 'Temaer' },
            { key: 'persons', label: 'Personer' },
            { key: 'prophecies', label: 'Profetier' },
            { key: 'timeline', label: 'Tidslinje' },
            { key: 'parallels', label: 'Evangelieparalleller' },
            { key: 'plans', label: 'Leseplaner' },
            { key: 'words', label: 'Viktige ord' },
            { key: 'numberSymbolism', label: 'Tall' },
            { key: 'days', label: 'Dager' },
          ] as { key: keyof SearchResultTypes; label: string }[]).map(item => {
            const searchTypes = { ...defaultSearchResultTypes, ...settings.searchResultTypes };
            return (
              <label key={item.key} className={styles.tool}>
                <input
                  type="checkbox"
                  checked={searchTypes[item.key]}
                  onChange={() => {
                    const current = { ...defaultSearchResultTypes, ...settings.searchResultTypes };
                    updateSetting('searchResultTypes', { ...current, [item.key]: !current[item.key] });
                  }}
                />
                <span className={styles.checkmark}></span>
                <span className={styles.label}>{item.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Section 3: Display */}
      <div className={styles.section}>
        <h2>Visning</h2>
        <p>Velg hva som vises ved bibellesing.</p>
        <div className={styles.tools}>
          {tools.map(tool => (
            <label key={tool.key} className={styles.tool}>
              <input
                type="checkbox"
                checked={settings[tool.key] ?? false}
                onChange={() => toggleSetting(tool.key)}
              />
              <span className={styles.checkmark}></span>
              <span className={styles.label}>{tool.label}</span>
            </label>
          ))}

          <div className={styles.secondaryBibleRow}>
            <label className={styles.tool}>
              <input
                type="checkbox"
                checked={settings.showOriginalText ?? false}
                onChange={() => toggleSetting('showOriginalText')}
              />
              <span className={styles.checkmark}></span>
              <span className={styles.label}>Undertekst</span>
            </label>
            <div className={styles.secondaryBibleSelectWrapper}>
              <select
                className={styles.secondaryBibleSelect}
                value={settings.secondaryBible || 'original'}
                onChange={(e) => updateSetting('secondaryBible', e.target.value)}
              >
                {secondaryOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.layoutMode === 'reading'}
              onChange={() => updateSetting('layoutMode', settings.layoutMode === 'reading' ? 'normal' : 'reading')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Lesemodus</span>
          </label>
          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.copyVerseNumbers ?? true}
              onChange={() => toggleSetting('copyVerseNumbers')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Inkluder versnummer ved kopiering</span>
          </label>
          <label className={styles.tool}>
            <input
              type="checkbox"
              checked={settings.showVerseFootnotes ?? true}
              onChange={() => toggleSetting('showVerseFootnotes')}
            />
            <span className={styles.checkmark}></span>
            <span className={styles.label}>Vis fotnoter på vers</span>
          </label>
        </div>

      </div>

      {/* Section 3: Appearance */}
      <div className={styles.section}>
        <h2>Utseende</h2>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Skriftstørrelse</h3>
        <div className={styles.fontSizes}>
          {fontSizes.map(size => (
            <button
              key={size.value}
              className={`${styles.fontSizeButton} ${settings.fontSize === size.value ? styles.active : ''}`}
              onClick={() => updateSetting('fontSize', size.value)}
            >
              {size.label}
            </button>
          ))}
        </div>
        <label className={styles.tool}>
          <input
            type="checkbox"
            checked={settings.darkMode}
            onChange={() => toggleSetting('darkMode')}
          />
          <span className={styles.checkmark}></span>
          <span className={styles.label}>Mørk modus</span>
        </label>
      </div>

      {/* Section 4: Data */}
      <div className={styles.section}>
        <h2>Data</h2>
        <p>Eksporter eller importer favoritter, notater, emner og andre data.</p>
        <div className={styles.dataActions}>
          <button className={styles.dataButton} onClick={handleExport}>
            Eksporter data
          </button>
          <button className={styles.dataButton} onClick={triggerFileSelect}>
            Importer data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {importError && (
          <div className={styles.importError} role="alert">{importError}</div>
        )}

        {importSuccess && (
          <div className={styles.importSuccess} role="status" aria-live="polite">
            Data importert! Laster siden på nytt...
          </div>
        )}

        {importData && (
          <div className={styles.importPreview}>
            <p className={styles.importPreviewTitle}>Følgende data vil bli importert:</p>
            <ul className={styles.importList}>
              {getImportSummary(importData).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <p className={styles.importDate}>
              Eksportert: {new Date(importData.exportedAt).toLocaleDateString('nb-NO')}
            </p>
            <div className={styles.importButtons}>
              <button
                className={`${styles.importButton} ${styles.primary}`}
                onClick={() => handleImport(false)}
              >
                Erstatt alt
              </button>
              <button
                className={styles.importButton}
                onClick={() => handleImport(true)}
              >
                Slå sammen
              </button>
              <button
                className={`${styles.importButton} ${styles.cancel}`}
                onClick={cancelImport}
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
