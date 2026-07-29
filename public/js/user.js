// Brukersider-øy: leser/skriver localStorage med samme nøkler og JSON-former
// som gamle appen (datakompatibelt), og rendrer listene klient-side. Uten JS
// vises tom-tilstandene fra SSR.
// TODO(#12): synk mot /api/sync (push ved endring, pull ved last).
// TODO(#14): offline-nedlasting + service worker.

import { recordRead, mergeProgress, heatLevel } from './reading-progress.js';
import { readStrings, localeHref } from './locale.js';

const t = readStrings(document.body);

const KEYS = {
  favorites: 'bible-favorites',
  notes: 'bible-notes',
  topics: 'bible-topics',
  settings: 'bible-settings',
  verseLists: 'bible-verse-lists',
  devotionals: 'bible-devotionals',
  activePlan: 'activeReadingPlan',
  planProgress: 'readingPlanProgress',
  progress: 'bible-reading-progress',
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
function showList(root, hasItems) {
  const empty = root.querySelector('[data-empty]');
  if (empty) empty.hidden = hasItems;
}

const root = document.querySelector('[data-user-page]');
if (root) {
  const page = root.dataset.userPage;
  const list = root.querySelector('[data-list]');

  // ---- favoritter (henter verstekst fra /api/favorites) ----
  if (page === 'favorites' && list) {
    const renderFavorites = () => {
    const favs = read(KEYS.favorites, []);
    showList(root, favs.length > 0);
    if (!favs.length) { list.textContent = ''; return; }
    {
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ favorites: favs }),
      })
        .then((r) => r.json())
        .then((verses) => {
          list.textContent = '';
          for (const v of verses) {
            const a = el('a', 'user-card');
            a.href = localeHref(`/${v.bookShortName.toLowerCase()}/${v.chapter}#v${v.verse}`);
            a.appendChild(el('span', 'user-card-ref', `${v.bookName} ${v.chapter}:${v.verse}`));
            a.appendChild(el('p', 'user-card-text', v.text));
            list.appendChild(a);
          }
        })
        .catch(() => {});
    }
    };
    renderFavorites();
    document.addEventListener('bibel:sync-rebuilt', renderFavorites);
  }

  // ---- notater ----
  if (page === 'notes' && list) {
    const renderNotes = () => {
      list.textContent = '';
      const notes = read(KEYS.notes, []);
      showList(root, notes.length > 0);
      notes
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .forEach((n) => {
          const card = el('div', 'user-card');
          card.appendChild(el('span', 'user-card-ref', `${n.bookId}-${n.chapter}-${n.verse}`));
          card.appendChild(el('p', 'user-card-text', n.content));
          list.appendChild(card);
        });
    };
    renderNotes();
    document.addEventListener('bibel:sync-rebuilt', renderNotes);
  }

  // ---- emner ----
  if (page === 'topics' && list) {
    const renderTopics = () => {
      list.textContent = '';
      const data = read(KEYS.topics, { topics: [], verseTopics: [], itemTopics: [] });
      const topics = data.topics || [];
      showList(root, topics.length > 0);
      topics.forEach((t) => {
        const count =
          (data.itemTopics || []).filter((it) => it.topicId === t.id).length +
          (data.verseTopics || []).filter((vt) => vt.topicId === t.id).length;
        const card = el('div', 'user-card');
        card.appendChild(el('span', 'user-card-title', t.name));
        card.appendChild(el('span', 'user-card-meta', t('is.taggedCount', { n: count })));
        list.appendChild(card);
      });
    };
    renderTopics();
    document.addEventListener('bibel:sync-rebuilt', renderTopics);
  }

  // ---- verslister ----
  if (page === 'verselists' && list) {
    const render = () => {
      list.textContent = '';
      const lists = read(KEYS.verseLists, []);
      showList(root, lists.length > 0);
      lists
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .forEach((l) => {
          const card = el('div', 'user-card');
          card.appendChild(el('span', 'user-card-title', l.name));
          card.appendChild(el('span', 'user-card-meta', t('is.verseCount', { n: (l.refs || []).length })));
          list.appendChild(card);
        });
    };
    render();
    document.addEventListener('bibel:sync-rebuilt', render);
    const form = root.querySelector('[data-create-list]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const name = input.value.trim();
        if (!name) return;
        if (!window.fvPlus?.gate(t('nav.verseLists'))) return;
        const lists = read(KEYS.verseLists, []);
        const now = Date.now();
        lists.push({ id: `list-${now}`, name, refs: [], createdAt: now, updatedAt: now });
        write(KEYS.verseLists, lists);
        input.value = '';
        render();
      });
    }
  }

  // ---- manuskripter (liste) ----
  if (page === 'devotionals' && list) {
    // Husking er plus — stopp ved inngangen, ikke etter at teksten er skrevet.
    root.querySelectorAll('a[href="/manuskripter/ny"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        if (window.fvPlus?.has()) return;
        e.preventDefault();
        window.fvPlus?.cta(t('nav.manuscripts'));
      });
    });
    const renderDevotionals = () => {
      list.textContent = '';
      const devs = read(KEYS.devotionals, []);
      showList(root, devs.length > 0);
      devs
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .forEach((d) => {
          const a = el('a', 'user-card');
          a.href = localeHref(`/manuskripter/${d.slug}`);
          a.appendChild(el('span', 'user-card-title', d.title || t('is.untitled')));
          a.appendChild(el('span', 'user-card-meta', d.type || ''));
          list.appendChild(a);
        });
    };
    renderDevotionals();
    document.addEventListener('bibel:sync-rebuilt', renderDevotionals);
  }

  // ---- leseplan (marker aktiv) ----
  if (page === 'readingplan') {
    const active = read(KEYS.activePlan, null);
    root.querySelectorAll('.plan-card').forEach((card) => {
      const id = card.dataset.planId;
      const badge = card.querySelector('.plan-active-badge');
      const btn = card.querySelector('.plan-activate');
      if (id === active) {
        if (badge) badge.hidden = false;
        if (btn && btn.dataset.activeLabel) btn.textContent = btn.dataset.activeLabel;
      }
      if (btn) {
        btn.addEventListener('click', async () => {
          if (!window.fvPlus?.gate(btn.dataset.gateLabel || '')) return;
          // START planen, ikke bare merk den aktiv: framdriftsraden er det som
          // gir `startDate`, og uten den kan forsidens panel hverken vise «dag
          // X av Y» eller dagens lesning (#35).
          const plan = await import('./reading-plan.js');
          plan.startPlan(id);
          location.reload();
        });
      }
    });
  }

  // ---- innstillinger ----
  if (page === 'settings') {
    const s = read(KEYS.settings, {});
    // data-setting støtter dot-path for nestede objekter (searchResultTypes.stories).
    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    const setPath = (obj, path, value) => {
      const keys = path.split('.');
      let o = obj;
      for (const k of keys.slice(0, -1)) {
        if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
        o = o[k];
      }
      o[keys[keys.length - 1]] = value;
    };
    root.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      const cur = getPath(s, key);
      if (input.type === 'checkbox') input.checked = cur !== false;
      else if (cur !== undefined) input.value = cur;
      input.addEventListener('change', () => {
        const next = read(KEYS.settings, {});
        setPath(next, key, input.type === 'checkbox' ? input.checked : input.value);
        write(KEYS.settings, next);
      });
    });

    // Egne bibler i primær/sekundær-valgene + synlighets-toggles per
    // oversettelse (settings.hiddenBibles, #14). Egne bibler bor i IndexedDB.
    (async () => {
      let userBibles = [];
      try {
        const idb = await import('./offline-db.js');
        userBibles = await idb.getUserBibles();
      } catch {}
      // Fanges FØR løkka under, som legger egne bibler inn i samme select —
      // ellers ville de talt to ganger i synlighets-togglene.
      const fromServer = [...root.querySelectorAll('[data-setting="bible"] option')]
        .map((o) => ({ value: o.value, label: o.textContent }))
        .filter((o) => o.value);
      for (const sel of ['bible', 'secondaryBible']) {
        const select = root.querySelector(`[data-setting="${sel}"]`);
        if (!select) continue;
        for (const b of userBibles) {
          const opt = el('option');
          opt.value = b.id;
          opt.textContent = b.name;
          select.append(opt);
        }
        const cur = getPath(s, sel);
        if (cur !== undefined) select.value = cur;
      }
      const box = root.querySelector('[data-bible-visibility]');
      if (box) {
        box.textContent = '';
        // Utgavene kommer fra bibelvelgeren serveren allerede har rendret
        // (fra bible_editions) — ikke fra en egen liste her. Den lista var
        // hardkodet til osnb/osnn, så OSEN manglet i togglene selv når den
        // sto i velgeren rett over (#28). Én kilde, ingen drift.
        const versions = [
          ...fromServer,
          ...userBibles.map((b) => ({ value: b.id, label: b.name })),
        ];
        const hidden = new Set((read(KEYS.settings, {}).hiddenBibles || []));
        for (const v of versions) {
          const label = el('label');
          label.className = 'settings-toggle';
          const input = el('input');
          input.type = 'checkbox';
          input.checked = !hidden.has(v.value);
          const active = (read(KEYS.settings, {}).bible || 'osnb') === v.value;
          if (active) {
            input.checked = true;
            input.disabled = true;
            input.title = t('is.activeCantHide');
          }
          input.addEventListener('change', () => {
            const next = read(KEYS.settings, {});
            const set = new Set(next.hiddenBibles || []);
            if (input.checked) set.delete(v.value);
            else set.add(v.value);
            next.hiddenBibles = [...set];
            write(KEYS.settings, next);
          });
          const span = el('span');
          span.textContent = v.label;
          label.append(input, ' ', span);
          box.append(label);
        }
      }
    })();

    // Eksport/import av alle brukerdata (samme localStorage-nøkler).
    const EXPORT_KEYS = [
      'bible-favorites', 'bible-notes', 'bible-topics', 'bible-settings',
      'bible-verse-lists', 'bible-devotionals', 'bible-verse-versions',
      'bible-reading-position', 'activeReadingPlan', 'readingPlanProgress',
      'bible-reading-progress',
    ];
    const status = root.querySelector('[data-data-status]');
    root.querySelector('[data-export-data]')?.addEventListener('click', () => {
      const data = {};
      for (const key of EXPORT_KEYS) {
        const val = read(key, undefined);
        if (val !== undefined) data[key] = val;
      }
      const blob = new Blob([JSON.stringify({ app: 'flogvit-bibel', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
      const a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bibel-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    root.querySelector('[data-import-data]')?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const data = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        let n = 0;
        for (const key of EXPORT_KEYS) {
          if (key in data) {
            write(key, data[key]);
            n++;
          }
        }
        if (status) status.textContent = n > 0 ? t('is.importedDatasets', { n }) : t('is.noKnownData');
        if (n > 0) setTimeout(() => location.reload(), 800);
      } catch {
        if (status) status.textContent = t('is.importFailed');
      }
      e.target.value = '';
    });
  }

  // ---- offline-status ----
  if (page === 'offline') {
    const box = root.querySelector('[data-offline-status]');
    if (box && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const usedMb = Math.round((est.usage || 0) / 1e6);
        box.textContent = t('is.storageUsed', { mb: usedMb });
      });
    } else if (box) {
      box.textContent = t('is.storageUnavailable');
    }
  }

  // ---- oversettelser (list brukerbibler fra localStorage-cache om noen) ----
  if (page === 'translations' && list) {
    showList(root, false);
  }

  // ---- manuskript-editor ----
  if (page === 'devotional-editor') {
    const slug = root.dataset.slug || '';
    const titleEl = root.querySelector('[data-editor-title]');
    const contentEl = root.querySelector('[data-editor-content]');
    const previewEl = root.querySelector('[data-editor-preview]');
    const saveBtn = root.querySelector('[data-editor-save]');

    let current = null;
    if (slug) {
      current = read(KEYS.devotionals, []).find((d) => d.slug === slug) || null;
      if (current) {
        titleEl.value = current.title || '';
        const draft = (current.versions || []).find((v) => !v.locked) || current.versions?.[0];
        contentEl.value = draft?.content || '';
      }
    }

    const renderPreview = () => {
      previewEl.innerHTML = '';
      previewEl.appendChild(renderMarkdown(contentEl.value));
    };
    contentEl.addEventListener('input', renderPreview);
    renderPreview();

    // Uten plus: si fra MED EN GANG (før noen skriver en hel andakt) og
    // deaktiver Lagre — den stille lagringsgaten ville ellers latt «Lagre»
    // se ut som den virket.
    if (!window.fvPlus?.has()) {
      window.fvPlus?.cta(t('nav.manuscripts'));
      saveBtn.disabled = true;
      saveBtn.title = t('plus.requires', { what: t('nav.manuscripts') });
    }
    saveBtn.addEventListener('click', () => {
      if (!window.fvPlus?.gate(t('nav.manuscripts'))) return;
      const devs = read(KEYS.devotionals, []);
      const now = Date.now();
      const title = titleEl.value.trim() || t('is.untitledDoc');
      const content = contentEl.value;
      if (current) {
        current.title = title;
        current.updatedAt = now;
        const draft = (current.versions || []).find((v) => !v.locked);
        if (draft) draft.content = content;
        else (current.versions = current.versions || []).push({ id: `v-${now}`, name: '', content, createdAt: now, locked: false, presentations: [] });
      } else {
        const s = slugify(title) + '-' + now.toString(36);
        devs.push({
          id: `dev-${now}`,
          slug: s,
          title,
          date: new Date(now).toISOString().slice(0, 10),
          tags: [],
          verses: [],
          type: 'andakt',
          versions: [{ id: `v-${now}`, name: '', content, createdAt: now, locked: false, presentations: [] }],
          createdAt: now,
          updatedAt: now,
        });
        current = devs[devs.length - 1];
      }
      write(KEYS.devotionals, devs);
      location.href = localeHref(`/manuskripter/${current.slug}`);
    });
  }

  // ---- manuskript-visning ----
  if (page === 'devotional-view') {
    const slug = root.dataset.slug || '';
    const article = root.querySelector('[data-article]');
    const dev = read(KEYS.devotionals, []).find((d) => d.slug === slug);
    if (!dev) {
      showList(root, false);
    } else {
      showList(root, true);
      const h1 = el('h1', null, dev.title || t('is.untitled'));
      article.appendChild(h1);
      const draft = (dev.versions || []).find((v) => !v.locked) || dev.versions?.[0];
      article.appendChild(renderMarkdown(draft?.content || ''));
      const editLink = el('a', 'user-btn-ghost', t('common.edit'));
      editLink.href = localeHref(`/manuskripter/${slug}/rediger`);
      article.appendChild(editLink);
    }
  }
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[å]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Liten, avhengighetsfri markdown → DOM. Håndterer overskrifter, fet/kursiv,
// lister, [ref:...] → lenke, og avsnitt. (Ingen innerHTML med brukertekst.)
function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text || '').split('\n');
  let list = null;
  const flushList = () => {
    if (list) frag.appendChild(list);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const tag = 'h' + Math.min(6, h[1].length + 1);
      frag.appendChild(inlineInto(el(tag), h[2]));
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!list) list = el('ul');
      list.appendChild(inlineInto(el('li'), li[1]));
      continue;
    }
    flushList();
    if (line.trim() === '') continue;
    frag.appendChild(inlineInto(el('p'), line));
  }
  flushList();
  return frag;
}

// Inline-parsing: **fet**, *kursiv*, [ref:...]. Setter tekst trygt (textContent).
function inlineInto(node, text) {
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[ref:([^\]]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) node.appendChild(el('strong', null, m[1]));
    else if (m[2]) node.appendChild(el('em', null, m[2]));
    else if (m[3]) {
      const ref = m[3].split('@')[0].split('|')[0];
      const a = el('a', 'inline-ref', ref);
      a.href = localeHref(`/sok?q=${encodeURIComponent(ref)}`);
      a.dataset.ref = ref;
      node.appendChild(a);
    }
    last = re.lastIndex;
  }
  if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  return node;
}

// ── Lesekart: bulk-markering av hele bøker (#16) ────────────────────
//
// Nye .plus-brukere kommer med en leshistorikk fra før appen fantes. Uten
// bulk starter alle på null, og kartet føles feil fra dag én. Tidspunkt er
// VALGFRITT: «vet ikke» lagres som null og holdes utenfor tidslinjen.
const mapRoot = document.querySelector('[data-reading-map]');
if (mapRoot) {
  const whenBar = document.querySelector('[data-map-when]');
  const yearSelect = document.querySelector('[data-map-when-year]');
  let pendingBookId = null;

  if (yearSelect) {
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y >= thisYear - 40; y--) {
      const opt = el('option', null, String(y));
      opt.value = String(y);
      yearSelect.appendChild(opt);
    }
  }

  /**
   * Male cellene fra lokal framdrift. SSR-en rendrer fra SERVEREN, så et
   * kapittel du nettopp markerte ville vært usynlig her til neste sidelast
   * etter at sync har gått. Hydreringen fjerner det etterslepet.
   */
  function hydrate() {
    const all = read(KEYS.progress, {}) || {};
    for (const [key, entry] of Object.entries(all)) {
      const [bookId, chapter] = key.split('-');
      const cell = mapRoot.querySelector(`[data-map-book="${bookId}"] .map-cell[data-chapter="${chapter}"]`);
      if (!cell) continue;
      const level = heatLevel(entry);
      if (level > (parseFloat(cell.dataset.level) || 0)) cell.dataset.level = String(level);
    }
  }
  hydrate();

  function applyBook(bookId, at) {
    if (!window.fvPlus?.gate(t('is.readingMap'))) return;
    const section = mapRoot.querySelector(`[data-map-book="${bookId}"]`);
    if (!section) return;
    const chapters = parseInt(section.dataset.bookChapters, 10) || 0;
    const all = read(KEYS.progress, {}) || {};
    for (let ch = 1; ch <= chapters; ch++) {
      const key = `${bookId}-${ch}`;
      all[key] = mergeProgress(all[key], recordRead(all[key], at));
    }
    write(KEYS.progress, all);
    hydrate();
  }

  mapRoot.querySelectorAll('[data-mark-book]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingBookId = btn.dataset.markBook;
      if (whenBar) whenBar.hidden = false;
      else applyBook(pendingBookId, Date.now());
    });
  });

  document.querySelector('[data-map-when-ok]')?.addEventListener('click', () => {
    if (pendingBookId == null) return;
    const year = parseInt(yearSelect?.value, 10);
    // Midt i året: vi vet bare årstallet, og skal ikke late som vi vet dagen.
    applyBook(pendingBookId, Number.isFinite(year) ? Date.UTC(year, 6, 1) : Date.now());
    pendingBookId = null;
    if (whenBar) whenBar.hidden = true;
  });

  document.querySelector('[data-map-when-unknown]')?.addEventListener('click', () => {
    if (pendingBookId == null) return;
    applyBook(pendingBookId, null);
    pendingBookId = null;
    if (whenBar) whenBar.hidden = true;
  });
}
