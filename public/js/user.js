// Brukersider-øy: leser/skriver localStorage med samme nøkler og JSON-former
// som gamle appen (datakompatibelt), og rendrer listene klient-side. Uten JS
// vises tom-tilstandene fra SSR.
// TODO(#12): synk mot /api/sync (push ved endring, pull ved last).
// TODO(#14): offline-nedlasting + service worker.

const KEYS = {
  favorites: 'bible-favorites',
  notes: 'bible-notes',
  topics: 'bible-topics',
  settings: 'bible-settings',
  verseLists: 'bible-verse-lists',
  devotionals: 'bible-devotionals',
  activePlan: 'activeReadingPlan',
  planProgress: 'readingPlanProgress',
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
    const favs = read(KEYS.favorites, []);
    showList(root, favs.length > 0);
    if (favs.length) {
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ favorites: favs }),
      })
        .then((r) => r.json())
        .then((verses) => {
          for (const v of verses) {
            const a = el('a', 'user-card');
            a.href = `/${v.bookShortName.toLowerCase()}/${v.chapter}#v${v.verse}`;
            a.appendChild(el('span', 'user-card-ref', `${v.bookName} ${v.chapter}:${v.verse}`));
            a.appendChild(el('p', 'user-card-text', v.text));
            list.appendChild(a);
          }
        })
        .catch(() => {});
    }
  }

  // ---- notater ----
  if (page === 'notes' && list) {
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
  }

  // ---- emner ----
  if (page === 'topics' && list) {
    const data = read(KEYS.topics, { topics: [], verseTopics: [], itemTopics: [] });
    const topics = data.topics || [];
    showList(root, topics.length > 0);
    topics.forEach((t) => {
      const count =
        (data.itemTopics || []).filter((it) => it.topicId === t.id).length +
        (data.verseTopics || []).filter((vt) => vt.topicId === t.id).length;
      const card = el('div', 'user-card');
      card.appendChild(el('span', 'user-card-title', t.name));
      card.appendChild(el('span', 'user-card-meta', `${count} merket`));
      list.appendChild(card);
    });
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
          card.appendChild(el('span', 'user-card-meta', `${(l.refs || []).length} vers`));
          list.appendChild(card);
        });
    };
    render();
    const form = root.querySelector('[data-create-list]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const name = input.value.trim();
        if (!name) return;
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
    const devs = read(KEYS.devotionals, []);
    showList(root, devs.length > 0);
    devs
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((d) => {
        const a = el('a', 'user-card');
        a.href = `/manuskripter/${d.slug}`;
        a.appendChild(el('span', 'user-card-title', d.title || '(uten tittel)'));
        a.appendChild(el('span', 'user-card-meta', d.type || ''));
        list.appendChild(a);
      });
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
        if (btn) btn.textContent = 'Aktiv plan';
      }
      if (btn) {
        btn.addEventListener('click', () => {
          write(KEYS.activePlan, id);
          location.reload();
        });
      }
    });
  }

  // ---- innstillinger ----
  if (page === 'settings') {
    const s = read(KEYS.settings, {});
    root.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      if (input.type === 'checkbox') input.checked = s[key] !== false;
      else if (key in s) input.value = s[key];
      input.addEventListener('change', () => {
        const cur = read(KEYS.settings, {});
        cur[key] = input.type === 'checkbox' ? input.checked : input.value;
        write(KEYS.settings, cur);
      });
    });
  }

  // ---- offline-status ----
  if (page === 'offline') {
    const box = root.querySelector('[data-offline-status]');
    if (box && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const usedMb = Math.round((est.usage || 0) / 1e6);
        box.textContent = `Brukt lagringsplass i nettleseren: ~${usedMb} MB.`;
      });
    } else if (box) {
      box.textContent = 'Lagringsstatus er ikke tilgjengelig i denne nettleseren.';
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

    saveBtn.addEventListener('click', () => {
      const devs = read(KEYS.devotionals, []);
      const now = Date.now();
      const title = titleEl.value.trim() || 'Uten tittel';
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
      location.href = `/manuskripter/${current.slug}`;
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
      const h1 = el('h1', null, dev.title || '(uten tittel)');
      article.appendChild(h1);
      const draft = (dev.versions || []).find((v) => !v.locked) || dev.versions?.[0];
      article.appendChild(renderMarkdown(draft?.content || ''));
      const editLink = el('a', 'user-btn-ghost', 'Rediger');
      editLink.href = `/manuskripter/${slug}/rediger`;
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
      a.href = `/sok?q=${encodeURIComponent(ref)}`;
      a.dataset.ref = ref;
      node.appendChild(a);
    }
    last = re.lastIndex;
  }
  if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  return node;
}
