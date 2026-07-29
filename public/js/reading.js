// Lesesiden-øy: versdetaljer (toggle + faner + ord-for-ord + favoritt/notat/
// manuskript/versjons-paner), layout-modus (klikk + 'bibel:layout-mode' fra
// shortcuts.js), leseposisjon (IntersectionObserver → 'bible-reading-position')
// og kopiering med referanse. Samme localStorage-nøkler/JSON-former som gamle
// appen (datakompatibelt). Sidebar/panelfaner/mobil bor i studium.js.

import {
  dwellFloorMs,
  dwellCapMs,
  chapterComplete,
  versesToRanges,
  rangesToVerses,
  recordRead,
  recordOpen,
  emptyProgress,
} from './reading-progress.js';
import { intlLocale, localeHref } from './locale.js';

const KEYS = {
  favorites: 'bible-favorites',
  notes: 'bible-notes',
  settings: 'bible-settings',
  devotionals: 'bible-devotionals',
  verseVersions: 'bible-verse-versions',
  position: 'bible-reading-position',
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

const rootPage = document.querySelector('[data-reading-root]');
if (rootPage) {
  const settings = () => read(KEYS.settings, {});
  const bookId = parseInt(document.body.dataset.bookId || '0', 10);
  const chapter = parseInt(document.body.dataset.chapter || '0', 10);
  const bookSlug = document.body.dataset.bookSlug || '';
  const bookName = document.body.dataset.bookName || '';

  // ── Layout-modus (normal/reading/panel) ──────────────────────────
  const MODES = ['normal', 'reading', 'panel'];
  function applyMode(mode) {
    if (!MODES.includes(mode)) mode = 'normal';
    rootPage.classList.toggle('reading-mode', mode === 'reading');
    rootPage.classList.toggle('panel-mode', mode === 'panel');
    document.querySelectorAll('[data-layout-modes] [data-mode]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.mode === mode ? 'true' : 'false');
    });
  }
  function setMode(mode) {
    applyMode(mode);
    const s = settings();
    s.layoutMode = mode;
    write(KEYS.settings, s);
  }
  applyMode(settings().layoutMode || 'normal');
  document.querySelectorAll('[data-layout-modes] [data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  document.addEventListener('bibel:layout-mode', (e) => setMode(e.detail));

  // ── Skriftstørrelse (settings.fontSize → html[data-font-size]) ───
  function applyFontSize(size) {
    if (size === 'small' || size === 'large') document.documentElement.dataset.fontSize = size;
    else delete document.documentElement.dataset.fontSize;
  }
  applyFontSize(settings().fontSize);
  document.addEventListener('bibel:font-size', (e) => applyFontSize(e.detail));

  // ── Innstillinger som standardvalg for lesesiden ─────────────────
  // bible/secondaryBible/verseMapping fra /innstillinger brukes når URL-en
  // ikke sier noe annet. Knappene på siden (rail-chips, hjelpemidler) setter
  // et sesjonsflagg så de vinner for resten av økten.
  const OVERRIDE_FLAG = 'bibel-url-override';
  const overridden = () => {
    try {
      return sessionStorage.getItem(OVERRIDE_FLAG) === '1';
    } catch {
      return false;
    }
  };
  document.querySelectorAll('.rail-chip, [data-secondary-select], [data-mapping-select], .tools-bible-button').forEach((elm) => {
    elm.addEventListener(elm.tagName === 'SELECT' ? 'change' : 'click', () => {
      try {
        sessionStorage.setItem(OVERRIDE_FLAG, '1');
      } catch {}
    });
  });
  if (!overridden()) {
    const s = settings();
    const url = new URL(location.href);
    let changed = false;
    const applyParam = (name, value, def) => {
      if (url.searchParams.has(name)) return;
      if (value && value !== def) {
        url.searchParams.set(name, value);
        changed = true;
      }
    };
    applyParam('bible', s.bible, 'osnb');
    applyParam('secondary', s.secondaryBible, '');
    applyParam('mapping', s.verseMapping, 'osnb');
    if (changed) location.replace(url.pathname + url.search + url.hash);
  }

  // ── Visnings-toggles fra innstillingene ──────────────────────────
  {
    const s = settings();
    const hide = (sel) => document.querySelectorAll(sel).forEach((n) => (n.style.display = 'none'));
    if (s.showChapterInsights === false) hide('.insights-panel');
    if (s.showParallels === false) hide('.parallels-container');
    if (s.showTimeline === false) hide('.st-block[data-block-id="tidslinje"]');
    if (s.showBookSummary === false && s.showChapterSummary === false) hide('.st-block[data-block-id="sammendrag"]');
    if (s.showChapterSummary === false) hide('[data-summary-kind="chapter"]');
    if (s.showBookSummary === false) hide('[data-summary-kind="book"]');
    if (s.showChapterContext === false) hide('[data-summary-kind="context"]');
    if (s.showImportantWords === false) hide('.st-block[data-block-id="viktige-ord"]');
    if (s.showVerseFootnotes === false) hide('.footnotes');
  }

  // ── Versdetaljer: åpne/lukk (én åpen om gangen, som gamle appen) ──
  document.querySelectorAll('[data-verse-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (settings().showVerseDetails === false) return;
      const verse = btn.closest('.verse');
      const detail = verse && verse.querySelector('.verse-detail');
      if (!detail) return;
      const open = detail.hidden;
      document.querySelectorAll('.verse-detail:not([hidden])').forEach((d) => {
        d.hidden = true;
        const t = d.closest('.verse')?.querySelector('[data-verse-toggle]');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      detail.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) initDetail(detail);
    });
  });

  // ── Faner i versdetaljen ─────────────────────────────────────────
  document.querySelectorAll('.verse-detail').forEach((detail) => {
    detail.querySelectorAll('[data-vd-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.vdTab;
        detail.querySelectorAll('[data-vd-tab]').forEach((t) => t.classList.toggle('is-active', t === tab));
        detail.querySelectorAll('[data-vd-pane]').forEach((p) => {
          const active = p.dataset.vdPane === name;
          p.hidden = !active;
          p.classList.toggle('is-active', active);
        });
      });
    });
  });

  // ── Ord for ord: forklaring ved klikk ────────────────────────────
  document.querySelectorAll('[data-w4w-word-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pane = btn.closest('[data-vd-pane]');
      const box = pane && pane.querySelector('[data-w4w-explain]');
      if (!box) return;
      const same = btn.getAttribute('aria-pressed') === 'true';
      pane.querySelectorAll('[data-w4w-word-btn]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      if (same) {
        box.hidden = true;
        return;
      }
      btn.setAttribute('aria-pressed', 'true');
      box.querySelector('[data-w4w-out-word]').textContent = btn.dataset.word || '';
      box.querySelector('[data-w4w-out-pron]').textContent = btn.dataset.pron ? `(${btn.dataset.pron})` : '';
      box.querySelector('[data-w4w-out-expl]').textContent = btn.dataset.expl || 'Ingen forklaring tilgjengelig.';
      const search = box.querySelector('[data-w4w-search]');
      if (search) search.href = localeHref(`/sok/original?q=${encodeURIComponent(btn.dataset.word || '')}`);
      box.hidden = false;
    });
  });

  // ── Favoritter (bible-favorites: [{bookId, chapter, verse}]) ─────
  function favKeyOf(verse) {
    return { bookId, chapter: parseInt(verse.dataset.verseId.split('-')[1], 10), verse: parseInt(verse.dataset.verseNum, 10) };
  }
  function isFav(f, favs) {
    return favs.some((x) => x.bookId === f.bookId && x.chapter === f.chapter && x.verse === f.verse);
  }
  function paintFav(btn, on) {
    btn.textContent = on ? '★ Favoritt' : '☆ Legg til favoritt';
    btn.classList.toggle('is-active', on);
  }
  document.querySelectorAll('[data-fav-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!window.fvPlus?.gate('Favoritter')) return;
      const f = favKeyOf(btn.closest('.verse'));
      let favs = read(KEYS.favorites, []);
      const on = isFav(f, favs);
      favs = on
        ? favs.filter((x) => !(x.bookId === f.bookId && x.chapter === f.chapter && x.verse === f.verse))
        : [...favs, { ...f, addedAt: Date.now() }];
      write(KEYS.favorites, favs);
      paintFav(btn, !on);
    });
  });

  // ── Init av panerinnhold når en detalj åpnes ─────────────────────
  function initDetail(detail) {
    if (detail.dataset.inited) return;
    detail.dataset.inited = '1';
    const verse = detail.closest('.verse');
    const favBtn = detail.querySelector('[data-fav-toggle]');
    if (favBtn) paintFav(favBtn, isFav(favKeyOf(verse), read(KEYS.favorites, [])));
    renderNotes(detail);
    renderDevotionals(detail);
  }

  // ── Notater (bible-notes: [{id, bookId, chapter, verse, content, createdAt, updatedAt}]) ─
  function noteRef(detail) {
    const [b, c2, v] = detail.dataset.verseKey.split('-').map(Number);
    return { bookId: b, chapter: c2, verse: v };
  }
  function renderNotes(detail) {
    const listBox = detail.querySelector('[data-notes-list]');
    if (!listBox) return;
    const { bookId: b, chapter: c2, verse: v } = noteRef(detail);
    listBox.textContent = '';
    read(KEYS.notes, [])
      .filter((n) => n.bookId === b && n.chapter === c2 && n.verse === v)
      .sort((a, x) => x.updatedAt - a.updatedAt)
      .forEach((n) => {
        const card = el('div', 'note-item');
        card.appendChild(el('p', 'note-content', n.content));
        const meta = el('div', 'note-meta', new Date(n.updatedAt).toLocaleDateString(intlLocale()));
        const del = el('button', 'note-delete', 'Slett');
        del.type = 'button';
        del.addEventListener('click', () => {
          write(KEYS.notes, read(KEYS.notes, []).filter((x) => x.id !== n.id));
          renderNotes(detail);
        });
        meta.appendChild(del);
        card.appendChild(meta);
        listBox.appendChild(card);
      });
  }
  document.querySelectorAll('[data-verse-notes]').forEach((box) => {
    const input = box.querySelector('[data-note-input]');
    const add = box.querySelector('[data-note-add]');
    if (!input || !add) return;
    input.addEventListener('input', () => {
      add.disabled = input.value.trim() === '';
    });
    add.addEventListener('click', () => {
      if (!window.fvPlus?.gate('Notater')) return;
      const detail = box.closest('.verse-detail');
      const { bookId: b, chapter: c2, verse: v } = noteRef(detail);
      const now = Date.now();
      const notes = read(KEYS.notes, []);
      notes.push({ id: `note-${now}`, bookId: b, chapter: c2, verse: v, content: input.value.trim(), createdAt: now, updatedAt: now });
      write(KEYS.notes, notes);
      input.value = '';
      add.disabled = true;
      renderNotes(detail);
    });
  });

  // ── Manuskripter for verset (bible-devotionals, verses: ['joh-3-16']) ─
  function renderDevotionals(detail) {
    const box = detail.querySelector('[data-verse-devotionals]');
    const listBox = box && box.querySelector('[data-devotionals-list]');
    if (!listBox) return;
    const ref = box.dataset.verseRef;
    const devs = read(KEYS.devotionals, []).filter((d) => (d.verses || []).includes(ref));
    if (devs.length === 0) return;
    listBox.textContent = '';
    devs.forEach((d) => {
      const a = el('a', 'vd-devotional-link', d.title || '(uten tittel)');
      a.href = localeHref(`/manuskripter/${d.slug}`);
      listBox.appendChild(a);
    });
  }

  // ── Versjoner (bible-verse-versions: {'40-1-1': index}) ──────────
  const versionChoices = read(KEYS.verseVersions, {});
  document.querySelectorAll('.verse-detail').forEach((detail) => {
    const box = detail.querySelector('[data-versions]');
    if (!box) return;
    const key = detail.dataset.verseKey;
    let texts;
    try {
      texts = JSON.parse(box.dataset.versions);
    } catch {
      return;
    }
    const plain = detail.closest('.verse').querySelector('[data-verse-plain]');
    const standard = plain.textContent;
    const apply = (val) => {
      plain.textContent = val === '' ? standard : texts[parseInt(val, 10)] ?? standard;
    };
    const saved = versionChoices[key];
    if (saved != null && saved !== '') {
      apply(String(saved));
      const radio = box.querySelector(`[data-version-radio][value="${saved}"]`);
      if (radio) radio.checked = true;
    }
    box.querySelectorAll('[data-version-radio]').forEach((radio) => {
      radio.addEventListener('change', () => {
        apply(radio.value);
        const cur = read(KEYS.verseVersions, {});
        if (radio.value === '') delete cur[key];
        else cur[key] = radio.value;
        write(KEYS.verseVersions, cur);
      });
    });
  });

  // ── Leseposisjon ({bookSlug, bookName, chapter, verse}) ──────────
  const verseEls = document.querySelectorAll('.verse[data-verse-num]');
  if (verseEls.length > 0 && 'IntersectionObserver' in window) {
    const visible = new Set();
    let saveTimer = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = parseInt(entry.target.dataset.verseNum, 10);
          if (entry.isIntersecting) visible.add(n);
          else visible.delete(n);
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (visible.size === 0) return;
          const verse = Math.min(...visible);
          write(KEYS.position, { bookSlug, bookName, chapter, verse, updatedAt: Date.now() });
        }, 800);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    verseEls.forEach((v) => observer.observe(v));
  }

  // ── Lesesporing (#16) ────────────────────────────────────────────
  //
  // Tid måles PER VERS, ikke per side: måler man total tid og total dekning
  // hver for seg, kan begge oppfylles uten at noe er lest (parker fanen, scroll
  // så til bunns). Tid mens fanen er skjult teller ikke, og hvert vers har et
  // tak, så en side som blir stående åpen ikke bygger opp kreditt.
  //
  // `manual` skriver ingenting automatisk — verken lesing eller åpning. Det er
  // en personvern-innstilling, ikke bare en preferanse.
  const progressKeyOf = () => `${bookId}-${chapter}`;
  const readProgressAll = () => read(KEYS.progress, {}) || {};
  const progressEntry = () => readProgressAll()[progressKeyOf()] || emptyProgress();

  function saveProgress(entry) {
    const all = readProgressAll();
    all[progressKeyOf()] = entry;
    write(KEYS.progress, all);
    paintChapterRead(entry);
  }

  const trackingMode = () => settings().readTracking || 'suggest';

  function paintChapterRead(entry) {
    const btn = document.querySelector('[data-chapter-read]');
    if (!btn) return;
    const done = (entry.count ?? 0) > 0;
    btn.setAttribute('aria-pressed', done ? 'true' : 'false');
    btn.classList.toggle('is-read', done);
    const label = btn.querySelector('[data-crr-label]');
    if (!label) return;
    if (!done) {
      label.textContent = btn.dataset.labelMark || 'Marker som lest';
      return;
    }
    // Sidens språk, ikke nettleserens: en norsk side skal ikke vise 7/28/2026.
    const when = entry.lastAt
      ? new Date(entry.lastAt).toLocaleDateString(intlLocale())
      : null;
    const times = (entry.count ?? 0) > 1 ? ` · ${entry.count} ${btn.dataset.labelTimes || ''}`.trimEnd() : '';
    label.textContent = when
      ? `${btn.dataset.labelLastRead || 'Sist lest'} ${when}${times}`
      : `${btn.dataset.labelRead || 'Lest'}${times}`;
  }

  function markChapterRead(at) {
    if (!window.fvPlus?.gate('Lesesporing')) return;
    saveProgress(recordRead(progressEntry(), at === undefined ? Date.now() : at));
  }

  function unmarkChapter() {
    const all = readProgressAll();
    delete all[progressKeyOf()];
    write(KEYS.progress, all);
    paintChapterRead(emptyProgress());
  }

  const chapterBtn = document.querySelector('[data-chapter-read]');
  if (chapterBtn && bookId && chapter) {
    chapterBtn.hidden = false;
    paintChapterRead(progressEntry());
    chapterBtn.addEventListener('click', () => {
      if ((progressEntry().count ?? 0) > 0) unmarkChapter();
      else markChapterRead();
    });
  }

  // Vers-markering: samme mønster som favoritt-knappen i versdetaljene.
  function paintVerseRead(btn, on) {
    btn.textContent = on ? `● ${btn.dataset.labelRead || 'Lest'}` : `○ ${btn.dataset.labelRead || 'Lest'}`;
    btn.classList.toggle('is-active', on);
  }

  function markVersesRead(nums) {
    if (!nums.length) return;
    if (!window.fvPlus?.gate('Lesesporing')) return;
    const entry = progressEntry();
    const merged = versesToRanges([...rangesToVerses(entry.verses), ...nums]);
    const total = parseInt(document.body.dataset.totalVerses || '0', 10);
    if (chapterComplete(rangesToVerses(merged).length, total)) {
      saveProgress(recordRead(entry, Date.now()));
    } else {
      saveProgress({ ...entry, verses: merged });
    }
  }

  document.querySelectorAll('[data-verse-read-toggle]').forEach((btn) => {
    const n = parseInt(btn.dataset.verseNum, 10);
    paintVerseRead(btn, rangesToVerses(progressEntry().verses).includes(n) || (progressEntry().count ?? 0) > 0);
    btn.addEventListener('click', () => {
      markVersesRead([n]);
      paintVerseRead(btn, true);
    });
  });

  // Marker et tekstUTVALG som lest — «jeg leste Matt 5:1-20 i dag».
  const selectionBtn = document.querySelector('[data-mark-selection-read]');
  if (selectionBtn) {
    const versesRoot = document.querySelector('[data-verses]');
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      const inside =
        sel && !sel.isCollapsed && versesRoot && versesRoot.contains(sel.anchorNode) && versesRoot.contains(sel.focusNode);
      selectionBtn.hidden = !inside;
    });
    selectionBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const nums = [];
      document.querySelectorAll('.verse[data-verse-num]').forEach((v) => {
        if (range.intersectsNode(v)) nums.push(parseInt(v.dataset.verseNum, 10));
      });
      markVersesRead(nums.filter(Number.isFinite));
      sel.removeAllRanges();
      selectionBtn.hidden = true;
    });
  }

  if (verseEls.length > 0 && 'IntersectionObserver' in window && trackingMode() !== 'manual') {
    // Åpning telles én gang per sidelast — ikke lesing, bare «her var jeg».
    saveProgress(recordOpen(progressEntry()));

    const dwell = new Map(); // versnummer → akkumulerte ms
    const since = new Map(); // versnummer → tidspunkt det ble synlig
    const wordCount = new Map();
    const readVerses = new Set();
    const totalVerses = parseInt(document.body.dataset.totalVerses || '0', 10) || verseEls.length;

    verseEls.forEach((v) => {
      const n = parseInt(v.dataset.verseNum, 10);
      const text = v.querySelector('[data-verse-text]')?.textContent || v.textContent || '';
      wordCount.set(n, text.trim().split(/\s+/).filter(Boolean).length);
    });

    function settle(n, now) {
      const start = since.get(n);
      if (start == null) return;
      since.delete(n);
      const words = wordCount.get(n) ?? 0;
      const added = Math.min(now - start, dwellCapMs(words));
      const total = (dwell.get(n) ?? 0) + added;
      dwell.set(n, total);
      if (total >= dwellFloorMs(words)) readVerses.add(n);
    }

    function settleAll() {
      const now = Date.now();
      for (const n of [...since.keys()]) settle(n, now);
    }

    let completed = false;
    function checkComplete() {
      if (completed || !chapterComplete(readVerses.size, totalVerses)) return;
      completed = true;
      if (trackingMode() === 'auto') markChapterRead();
      else showSuggestion();
    }

    function showSuggestion() {
      const bar = document.querySelector('[data-read-suggestion]');
      if (!bar || (progressEntry().count ?? 0) > 0) return;
      bar.hidden = false;
      bar.querySelector('[data-suggestion-yes]')?.addEventListener(
        'click',
        () => {
          markChapterRead();
          bar.hidden = true;
        },
        { once: true },
      );
      bar.querySelector('[data-suggestion-no]')?.addEventListener('click', () => { bar.hidden = true; }, { once: true });
    }

    const dwellObserver = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          const n = parseInt(entry.target.dataset.verseNum, 10);
          if (entry.isIntersecting) {
            if (!document.hidden) since.set(n, now);
          } else {
            settle(n, now);
          }
        }
        checkComplete();
      },
      { threshold: 0.6 },
    );
    verseEls.forEach((v) => dwellObserver.observe(v));

    // Bakgrunnstid teller ikke: fryser ved skjult fane, starter på nytt etterpå.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        settleAll();
        checkComplete();
      } else {
        const now = Date.now();
        document.querySelectorAll('.verse[data-verse-num]').forEach((v) => {
          const rect = v.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) since.set(parseInt(v.dataset.verseNum, 10), now);
        });
      }
    });
    window.addEventListener('pagehide', () => {
      settleAll();
      const partial = versesToRanges([...readVerses]);
      const entry = progressEntry();
      if (partial && (entry.count ?? 0) === 0 && partial !== entry.verses) {
        saveProgress({ ...entry, verses: versesToRanges([...rangesToVerses(entry.verses), ...readVerses]) });
      }
    });
  }

  // ── Kopiering med referanse (settings.copyVerseNumbers) ──────────
  document.querySelector('[data-verses]')?.addEventListener('copy', (e) => {
    if (settings().copyVerseNumbers === false) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const inVerses = (node) => node && (node.nodeType === 1 ? node : node.parentElement)?.closest('.verse');
    const startV = inVerses(range.startContainer);
    const endV = inVerses(range.endContainer);
    if (!startV || !endV) return;
    const v1 = startV.dataset.verseNum;
    const v2 = endV.dataset.verseNum;
    const ref = `${bookName} ${chapter},${v1 === v2 ? v1 : `${v1}-${v2}`}`;
    e.clipboardData.setData('text/plain', `${sel.toString().trim()}\n— ${ref}`);
    e.preventDefault();
  });

  // ── Hopp til vers fra hash + åpne detalj ved behov ───────────────
  if (location.hash) {
    const m = location.hash.match(/^#v(\d+)$/);
    const target = m && document.getElementById(`v${m[1]}`);
    if (target) setTimeout(() => target.scrollIntoView({ block: 'center' }), 50);
  }
}
