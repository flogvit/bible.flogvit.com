import { Link } from 'react-router-dom';
import { Suspense, useState, useEffect, useRef } from 'react';
import styles from './Header.module.scss';
import { LoadingIndicator } from './LoadingIndicator';
import { SyncStatusIndicator } from './sync/SyncStatusIndicator';
import { LayoutModeButtons } from '@/components/bible/LayoutModeButtons';
import { useCommandPalette } from './CommandPaletteContext';
import { useSettings } from './SettingsContext';

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isMac, setIsMac] = useState(false);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { open: openPalette } = useCommandPalette();
  const { settings, toggleSetting } = useSettings();
  const isDark = !!settings.darkMode;

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const refs = dropdownRefs.current;
      const clickedInside = Object.values(refs).some(
        ref => ref && ref.contains(e.target as Node)
      );
      if (!clickedInside) setOpenDropdown(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('menu-open');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('menu-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('menu-open');
    };
  }, [menuOpen]);

  function handleNavClick() {
    setMenuOpen(false);
    setOpenDropdown(null);
  }

  function toggleDropdown(name: string) {
    setOpenDropdown(prev => prev === name ? null : name);
  }

  const mod = isMac ? '⌥⇧' : 'Alt+Shift+';
  const cmdK = isMac ? '⌘ K' : 'Ctrl K';

  function shortcut(key: string) {
    return <span className={styles.shortcutHint}>{mod}{key}</span>;
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand} aria-label="Bibelen — forside">
          <span className={styles.brandMark} aria-hidden="true">B</span>
          <span className={styles.brandText}>Bibelen</span>
        </Link>

        <SyncStatusIndicator />
        <Suspense fallback={null}>
          <LoadingIndicator />
        </Suspense>

        <button
          type="button"
          className={styles.cmdkTrigger}
          onClick={openPalette}
          aria-label="Åpne hurtigsøk"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span className={styles.cmdkLabel}>Søk vers, person, tema…</span>
          <kbd className={styles.cmdkKbd}>{cmdK}</kbd>
        </button>

        <LayoutModeButtons />

        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => toggleSetting('darkMode')}
          aria-label={isDark ? 'Bytt til lys modus' : 'Bytt til mørk modus'}
          aria-pressed={isDark}
          title={isDark ? 'Lys modus' : 'Mørk modus'}
        >
          {isDark ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>

        <Link to="/innstillinger" className={styles.iconBtn} aria-label="Innstillinger" title="Innstillinger">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>

        <button
          className={styles.menuButton}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Lukk meny' : 'Åpne meny'}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          type="button"
        >
          <span className={styles.hamburger} aria-hidden="true"></span>
        </button>

        <nav id="main-nav" className={`${styles.nav} ${menuOpen ? styles.open : ''}`} aria-label="Hovednavigasjon">
          <div className={styles.dropdown} ref={el => { dropdownRefs.current['mitt'] = el; }}>
            <button
              type="button"
              className={`${styles.navLink} ${styles.dropdownTrigger}`}
              onClick={() => toggleDropdown('mitt')}
              aria-expanded={openDropdown === 'mitt'}
              aria-haspopup="true"
            >
              Mitt
              <span className={`${styles.dropdownArrow} ${openDropdown === 'mitt' ? styles.open : ''}`} aria-hidden="true">▾</span>
            </button>
            <div className={`${styles.dropdownMenu} ${openDropdown === 'mitt' ? styles.open : ''}`} role="menu">
              <Link to="/favoritter" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Favoritter {shortcut('F')}</Link>
              <Link to="/emner" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Emner {shortcut('E')}</Link>
              <Link to="/notater" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Notater {shortcut('N')}</Link>
              <Link to="/lister" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Verslister {shortcut('V')}</Link>
              <Link to="/leseplan" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Leseplan {shortcut('L')}</Link>
              <Link to="/manuskripter" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Manuskripter {shortcut('M')}</Link>
            </div>
          </div>

          <div className={styles.dropdown} ref={el => { dropdownRefs.current['studier'] = el; }}>
            <button
              type="button"
              className={`${styles.navLink} ${styles.dropdownTrigger}`}
              onClick={() => toggleDropdown('studier')}
              aria-expanded={openDropdown === 'studier'}
              aria-haspopup="true"
            >
              Studier
              <span className={`${styles.dropdownArrow} ${openDropdown === 'studier' ? styles.open : ''}`} aria-hidden="true">▾</span>
            </button>
            <div className={`${styles.dropdownMenu} ${openDropdown === 'studier' ? styles.open : ''}`} role="menu">
              <Link to="/kjente-vers" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Kjente vers {shortcut('K')}</Link>
              <Link to="/temaer" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Temaer {shortcut('C')}</Link>
              <Link to="/historier" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Bibelhistorier {shortcut('B')}</Link>
              <Link to="/profetier" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Profetier {shortcut('P')}</Link>
              <Link to="/paralleller" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Paralleller {shortcut('A')}</Link>
              <Link to="/personer" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Personer {shortcut('O')}</Link>
              <Link to="/tall" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Tall {shortcut('Y')}</Link>
            </div>
          </div>

          <div className={styles.dropdown} ref={el => { dropdownRefs.current['oversikt'] = el; }}>
            <button
              type="button"
              className={`${styles.navLink} ${styles.dropdownTrigger}`}
              onClick={() => toggleDropdown('oversikt')}
              aria-expanded={openDropdown === 'oversikt'}
              aria-haspopup="true"
            >
              Oversikt
              <span className={`${styles.dropdownArrow} ${openDropdown === 'oversikt' ? styles.open : ''}`} aria-hidden="true">▾</span>
            </button>
            <div className={`${styles.dropdownMenu} ${openDropdown === 'oversikt' ? styles.open : ''}`} role="menu">
              <Link to="/tidslinje" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Tidslinje {shortcut('T')}</Link>
              <Link to="/lesetekster" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Lesetekster</Link>
              <Link to="/statistikk" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Statistikk {shortcut('I')}</Link>
              <Link to="/oversettelser" className={styles.dropdownLink} onClick={handleNavClick} role="menuitem">Oversettelser</Link>
            </div>
          </div>

          <div className={styles.mobileDropdownItems}>
            <div className={styles.mobileGroup}>
              <span className={styles.mobileGroupTitle}>Mitt</span>
              <Link to="/favoritter" className={styles.navLink} onClick={handleNavClick}>Favoritter</Link>
              <Link to="/emner" className={styles.navLink} onClick={handleNavClick}>Emner</Link>
              <Link to="/notater" className={styles.navLink} onClick={handleNavClick}>Notater</Link>
              <Link to="/lister" className={styles.navLink} onClick={handleNavClick}>Verslister</Link>
              <Link to="/leseplan" className={styles.navLink} onClick={handleNavClick}>Leseplan</Link>
              <Link to="/manuskripter" className={styles.navLink} onClick={handleNavClick}>Manuskripter</Link>
            </div>
            <div className={styles.mobileGroup}>
              <span className={styles.mobileGroupTitle}>Studier</span>
              <Link to="/kjente-vers" className={styles.navLink} onClick={handleNavClick}>Kjente vers</Link>
              <Link to="/temaer" className={styles.navLink} onClick={handleNavClick}>Temaer</Link>
              <Link to="/historier" className={styles.navLink} onClick={handleNavClick}>Bibelhistorier</Link>
              <Link to="/profetier" className={styles.navLink} onClick={handleNavClick}>Profetier</Link>
              <Link to="/paralleller" className={styles.navLink} onClick={handleNavClick}>Paralleller</Link>
              <Link to="/personer" className={styles.navLink} onClick={handleNavClick}>Personer</Link>
              <Link to="/tall" className={styles.navLink} onClick={handleNavClick}>Tall</Link>
            </div>
            <div className={styles.mobileGroup}>
              <span className={styles.mobileGroupTitle}>Oversikt</span>
              <Link to="/tidslinje" className={styles.navLink} onClick={handleNavClick}>Tidslinje</Link>
              <Link to="/lesetekster" className={styles.navLink} onClick={handleNavClick}>Lesetekster</Link>
              <Link to="/statistikk" className={styles.navLink} onClick={handleNavClick}>Statistikk</Link>
              <Link to="/oversettelser" className={styles.navLink} onClick={handleNavClick}>Oversettelser</Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
