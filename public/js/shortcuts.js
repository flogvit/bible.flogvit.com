// Tastatursnarveier — port av KeyboardShortcuts.tsx til vanilla (global øy,
// lastes fra layout på alle sider). Kapittelnavigasjon leser data-attributter
// som lesesiden setter på <body>: data-book-slug, data-chapter,
// data-max-chapter, data-next-book-slug, data-bible-query.
// Layout-modus (R/N/P) og panelfaner (1-4) sendes som CustomEvent
// ('bibel:layout-mode' / 'bibel:panel-tab') som lesesiden lytter på.

const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);

const NAV = {
  KeyH: '/', KeyS: '/sok', KeyL: '/leseplan', KeyT: '/tidslinje', KeyP: '/profetier',
  KeyF: '/favoritter', KeyE: '/emner', KeyN: '/notater', KeyK: '/kjente-vers',
  KeyO: '/personer', KeyV: '/lister', KeyA: '/paralleller', KeyI: '/statistikk',
  KeyM: '/manuskripter', KeyC: '/temaer', KeyD: '/dager', KeyY: '/tall',
};

function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    el.getAttribute('contenteditable') === 'true';
}

// ---- hjelpeoverlay ----

let overlay = null;

function mod(key) {
  return isMac ? `<kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>${key}</kbd>` : `<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>${key}</kbd>`;
}

const NAV_LABELS = [
  ['H', 'Hjem (bokliste)'], ['S', 'Søk'], ['L', 'Leseplan'], ['T', 'Tidslinje'],
  ['P', 'Profetier'], ['F', 'Favoritter'], ['E', 'Emner'], ['N', 'Notater'],
  ['K', 'Kjente vers'], ['O', 'Personer'], ['V', 'Verslister'], ['A', 'Paralleller'],
  ['I', 'Statistikk'], ['M', 'Manuskripter'], ['C', 'Temaer'], ['D', 'Dager'], ['Y', 'Tall'],
];

function buildOverlay() {
  const el = document.createElement('div');
  el.className = 'kbd-overlay';
  el.innerHTML = `
    <div class="kbd-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div class="kbd-header">
        <h2 id="shortcuts-title">Hurtigtaster</h2>
        <button class="kbd-close" aria-label="Lukk">×</button>
      </div>
      <div class="kbd-content">
        <section class="kbd-section">
          <h3>Generelt</h3>
          <dl class="kbd-shortcuts">
            <div class="kbd-shortcut"><dt><kbd>?</kbd></dt><dd>Vis/skjul denne hjelpen</dd></div>
            <div class="kbd-shortcut"><dt><kbd>/</kbd></dt><dd>Gå til søkefeltet</dd></div>
            <div class="kbd-shortcut"><dt><kbd>N</kbd></dt><dd>Normal visning</dd></div>
            <div class="kbd-shortcut"><dt><kbd>R</kbd></dt><dd>Lesemodus</dd></div>
            <div class="kbd-shortcut"><dt><kbd>P</kbd></dt><dd>Panelmodus (50/50)</dd></div>
            <div class="kbd-shortcut"><dt><kbd>Esc</kbd></dt><dd>Lukk dialoger</dd></div>
          </dl>
        </section>
        <section class="kbd-section">
          <h3>Kapittelnavigasjon</h3>
          <p class="kbd-hint">Fungerer kun på kapittelsider</p>
          <dl class="kbd-shortcuts">
            <div class="kbd-shortcut"><dt><kbd>←</kbd></dt><dd>Forrige kapittel</dd></div>
            <div class="kbd-shortcut"><dt><kbd>→</kbd></dt><dd>Neste kapittel</dd></div>
            <div class="kbd-shortcut"><dt><kbd>1</kbd>-<kbd>4</kbd></dt><dd>Bytt panelfane</dd></div>
            <div class="kbd-shortcut"><dt><kbd>5</kbd>-<kbd>9</kbd></dt><dd>Hopp til vers 5-9</dd></div>
          </dl>
        </section>
        <section class="kbd-section">
          <h3>Hurtignavigasjon</h3>
          <p class="kbd-hint">${isMac ? 'Bruk ⌥ Option + ⇧ Shift + bokstav' : 'Bruk Alt + Shift + bokstav'}</p>
          <dl class="kbd-shortcuts">
            ${NAV_LABELS.map(([k, label]) => `<div class="kbd-shortcut"><dt>${mod(k)}</dt><dd>${label}</dd></div>`).join('')}
          </dl>
        </section>
      </div>
    </div>`;
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('.kbd-close')) hideHelp();
  });
  return el;
}

function showHelp() {
  if (!overlay) {
    overlay = buildOverlay();
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}

function hideHelp() {
  if (overlay) overlay.style.display = 'none';
}

function helpVisible() {
  return overlay && overlay.style.display !== 'none';
}

// ---- global keydown ----

document.addEventListener('keydown', (e) => {
  if (isInputFocused() && e.key !== 'Escape') return;

  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    if (helpVisible()) hideHelp();
    else showHelp();
    return;
  }

  if (e.key === 'Escape' && helpVisible()) {
    e.preventDefault();
    hideHelp();
    return;
  }

  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const trigger = document.getElementById('cmdk-trigger');
    if (trigger) {
      e.preventDefault();
      trigger.click();
    }
    return;
  }

  // Layout-modus (håndteres av lesesiden via CustomEvent).
  if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    const modes = { r: 'reading', n: 'normal', p: 'panel' };
    const m = modes[e.key.toLowerCase()];
    if (m && document.body.dataset.bookSlug) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('bibel:layout-mode', { detail: m }));
      document.activeElement?.blur();
      return;
    }
  }

  // Kapittelnavigasjon (kun på kapittelsider — data-attributter fra lesesiden).
  const { bookSlug, chapter, maxChapter, nextBookSlug, bibleQuery } = document.body.dataset;
  if (bookSlug && chapter && maxChapter) {
    const cur = parseInt(chapter, 10);
    const max = parseInt(maxChapter, 10);
    const q = bibleQuery || '';

    if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (cur > 1) location.href = `/${bookSlug}/${cur - 1}${q}`;
      return;
    }
    if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (cur < max) location.href = `/${bookSlug}/${cur + 1}${q}`;
      else if (nextBookSlug) location.href = `/${nextBookSlug}/1${q}`;
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
      const n = parseInt(e.key, 10);
      if (n <= 4 && document.querySelector('[data-panel-tabs]')) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('bibel:panel-tab', { detail: n }));
        return;
      }
      const verseEl = document.getElementById(`v${e.key}`);
      if (verseEl) {
        e.preventDefault();
        verseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        history.replaceState(null, '', `#v${e.key}`);
      }
      return;
    }
  }

  if (e.altKey && e.shiftKey && NAV[e.code]) {
    e.preventDefault();
    location.href = NAV[e.code];
  }
});
