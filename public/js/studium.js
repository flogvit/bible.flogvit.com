// Studium-øy: sidebar-blokker (åpen/lukket-tilstand), panelfaner (klikk +
// 'bibel:panel-tab' fra shortcuts.js), sidebar-resize, oppslag, kapittel-
// manuskripter og hele mobil-verktøylinja (kapittelvelger, hjelpemidler,
// studium-overlegg). reading.js eier versdetaljer/layout/posisjon/kopiering.

const KEYS = {
  settings: 'bible-settings',
  blocks: 'bible-studium-blocks',
  devotionals: 'bible-devotionals',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const sidebar = document.querySelector('[data-panel-tabs]');
if (sidebar) {
  // ── Sidebar-blokker: husk åpen/lukket per blokk ──────────────────
  const blockState = read(KEYS.blocks, {});
  sidebar.querySelectorAll('.st-block[data-block-id]').forEach((block) => {
    const id = block.dataset.blockId;
    if (id in blockState) block.open = !!blockState[id];
    block.addEventListener('toggle', () => {
      const cur = read(KEYS.blocks, {});
      cur[id] = block.open;
      write(KEYS.blocks, cur);
    });
  });

  // ── Panelfaner (1-4) ─────────────────────────────────────────────
  function activateTab(n) {
    sidebar.querySelectorAll('[data-panel-tab]').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.panelTab === String(n));
    });
    sidebar.querySelectorAll('[data-panel-section]').forEach((s) => {
      const active = s.dataset.panelSection === String(n);
      s.hidden = !active;
      s.classList.toggle('is-active', active);
    });
  }
  sidebar.querySelectorAll('[data-panel-tab]').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.panelTab));
  });
  document.addEventListener('bibel:panel-tab', (e) => activateTab(e.detail));

  // ── Sidebar-resize (dra; dobbelklikk → 50 %) ─────────────────────
  const resizer = sidebar.querySelector('[data-sidebar-resize]');
  const layout = document.querySelector('[data-chapter-layout]');
  if (resizer && layout) {
    const setWidth = (px) => {
      const w = Math.min(Math.max(px, 220), window.innerWidth * 0.6);
      layout.style.setProperty('--sidebar-width', `${Math.round(w)}px`);
    };
    const saved = read(KEYS.settings, {}).sidebarWidth;
    if (saved) setWidth(saved);
    let dragging = false;
    resizer.addEventListener('pointerdown', (e) => {
      dragging = true;
      resizer.classList.add('is-dragging');
      resizer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    resizer.addEventListener('pointermove', (e) => {
      if (dragging) setWidth(window.innerWidth - e.clientX);
    });
    resizer.addEventListener('pointerup', () => {
      dragging = false;
      resizer.classList.remove('is-dragging');
      const s = read(KEYS.settings, {});
      const w = layout.style.getPropertyValue('--sidebar-width');
      if (w) {
        s.sidebarWidth = parseInt(w, 10);
        write(KEYS.settings, s);
      }
    });
    resizer.addEventListener('dblclick', () => {
      layout.style.removeProperty('--sidebar-width');
      document.dispatchEvent(new CustomEvent('bibel:layout-mode', { detail: 'panel' }));
    });
  }

  // ── Oppslag: referanse via /api/reference, ellers søkelenker ─────
  const lookup = sidebar.querySelector('[data-lookup]');
  if (lookup) {
    const input = lookup.querySelector('[data-lookup-input]');
    const results = lookup.querySelector('[data-lookup-results]');
    let timer = null;
    let seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (!q) {
        results.textContent = '';
        return;
      }
      timer = setTimeout(async () => {
        const mySeq = ++seq;
        let items = [];
        try {
          const res = await fetch(`/api/reference?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (data.success && data.reference) {
            items.push({ label: data.reference.formatted, href: data.reference.url, cls: 'st-lookup-ref' });
          }
        } catch {}
        if (mySeq !== seq) return;
        items.push(
          { label: `Søk «${q}» i bibelteksten →`, href: `/sok?q=${encodeURIComponent(q)}` },
          { label: `Søk «${q}» i personer og temaer →`, href: `/sok?q=${encodeURIComponent(q)}` },
        );
        results.textContent = '';
        const listEl = el('ul', 'st-lookup-list');
        for (const item of items) {
          const li = el('li');
          const a = el('a', item.cls || 'st-lookup-link', item.label);
          a.href = item.href;
          li.appendChild(a);
          listEl.appendChild(li);
        }
        results.appendChild(listEl);
      }, 250);
    });
  }

  // ── Kapittel-manuskripter (lokale, prefix 'joh-3-') ──────────────
  const chDevs = sidebar.querySelector('[data-chapter-devotionals]');
  if (chDevs) {
    const prefix = chDevs.dataset.chapterPrefix || '';
    const devs = read(KEYS.devotionals, []).filter((d) => (d.verses || []).some((v) => v.startsWith(prefix)));
    devs.forEach((d) => {
      const li = el('li', 'st-ms-item');
      const a = el('a', 'st-ms-title', d.title || '(uten tittel)');
      a.href = `/manuskripter/${d.slug}`;
      li.appendChild(a);
      if (d.type) li.appendChild(el('span', 'st-ms-type', d.type));
      chDevs.appendChild(li);
    });
    if (devs.length === 0) {
      const li = el('li', 'st-empty', 'Ingen manuskripter for dette kapittelet ennå.');
      chDevs.appendChild(li);
    }
  }
}

// ── Mobil verktøylinje + overlegg ──────────────────────────────────
const toolbar = document.querySelector('[data-mobile-toolbar]');
if (toolbar) {
  const pickerOverlay = document.querySelector('[data-picker-overlay]');
  const toolsOverlay = document.querySelector('[data-tools-overlay]');
  const studiumOverlay = document.querySelector('[data-studium-overlay]');

  function closeAll() {
    [pickerOverlay, toolsOverlay, studiumOverlay].forEach((o) => o && (o.hidden = true));
    restoreSidebarContent();
    document.body.style.overflow = '';
  }
  function open(overlay) {
    closeAll();
    if (overlay) {
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  toolbar.querySelector('[data-open-picker]')?.addEventListener('click', () => open(pickerOverlay));
  toolbar.querySelector('[data-open-tools]')?.addEventListener('click', () => open(toolsOverlay));

  // Studium-overlegget viser sidebar-innholdet: flytt nodene inn og tilbake.
  const overlayContent = document.querySelector('[data-studium-overlay-content]');
  const sidebarContent = document.querySelector('[data-sidebar-content]');
  let moved = false;
  function restoreSidebarContent() {
    if (moved && sidebarContent && overlayContent) {
      while (overlayContent.firstChild) sidebarContent.appendChild(overlayContent.firstChild);
      moved = false;
    }
  }
  toolbar.querySelector('[data-open-studium]')?.addEventListener('click', () => {
    open(studiumOverlay);
    if (sidebarContent && overlayContent && !moved) {
      while (sidebarContent.firstChild) overlayContent.appendChild(sidebarContent.firstChild);
      moved = true;
    }
  });

  document.querySelectorAll('[data-close-overlay]').forEach((btn) => {
    btn.addEventListener('click', closeAll);
  });
  [pickerOverlay, toolsOverlay].forEach((overlay) => {
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) closeAll();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  // Kapittelvelger: bokvalg bygger kapittelgrida på nytt.
  const grid = document.querySelector('[data-picker-grid]');
  if (grid) {
    const query = grid.dataset.query || '';
    document.querySelectorAll('[data-book-slug][data-book-chapters]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.bookSlug;
        const chapters = parseInt(btn.dataset.bookChapters, 10);
        const nameEl = document.querySelector('[data-picker-book-name]');
        if (nameEl) nameEl.textContent = btn.dataset.bookName || '';
        document.querySelectorAll('.mt-book-cell').forEach((b) => b.classList.toggle('is-active', b === btn));
        grid.textContent = '';
        for (let ch = 1; ch <= chapters; ch++) {
          const a = el('a', 'mt-chapter-cell', String(ch));
          a.href = `/${slug}/${ch}${query}`;
          if (slug === grid.dataset.currentSlug && String(ch) === grid.dataset.currentChapter) {
            a.classList.add('is-active');
          }
          grid.appendChild(a);
        }
      });
    });
  }

  // Hjelpemidler: undertekst/nummerering navigerer med ny query.
  function navigateWithParam(name, value) {
    const url = new URL(location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    location.href = url.pathname + url.search + url.hash;
  }
  document.querySelector('[data-secondary-select]')?.addEventListener('change', (e) => {
    const s = read(KEYS.settings, {});
    s.secondaryBible = e.target.value;
    write(KEYS.settings, s);
    navigateWithParam('secondary', e.target.value);
  });
  document.querySelector('[data-mapping-select]')?.addEventListener('change', (e) => {
    const s = read(KEYS.settings, {});
    s.verseMapping = e.target.value;
    write(KEYS.settings, s);
    navigateWithParam('mapping', e.target.value === 'osnb2' ? '' : e.target.value);
  });

  // Skriftstørrelse: lagres i settings og brukes av reading.js.
  const fontButtons = document.querySelectorAll('[data-font-size]');
  function paintFontButtons(size) {
    fontButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.fontSize === (size || 'medium')));
  }
  paintFontButtons(read(KEYS.settings, {}).fontSize);
  fontButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = read(KEYS.settings, {});
      s.fontSize = btn.dataset.fontSize;
      write(KEYS.settings, s);
      paintFontButtons(s.fontSize);
      document.dispatchEvent(new CustomEvent('bibel:font-size', { detail: s.fontSize }));
    });
  });
}
