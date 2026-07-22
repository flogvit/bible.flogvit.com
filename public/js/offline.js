// Offline-side-øy (#14): nedlasting av hele bibelen (+ støttedata) til
// IndexedDB, status, oversikt over nedlastede kapitler og sletting.
// Port av gamle OfflineDownload/CacheStatus: batch på 5, pause via
// AbortController, 404 hoppes over.

import {
  storeChapter,
  storeBooks,
  getBooks,
  countChapters,
  getAllChapterKeys,
  putBlob,
  getBlob,
  putAll,
  getAll,
  setMeta,
  getMeta,
  deleteDatabase,
} from './offline-db.js';

const $ = (sel) => document.querySelector(sel);
const statusBox = $('[data-offline-status]');
const contentBox = $('[data-offline-content]');
if (statusBox) init();

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtBytes(n) {
  if (!n) return '0 MB';
  return `${Math.round(n / 1024 / 1024)} MB`;
}

// ── Status ───────────────────────────────────────────────────────────
async function renderStatus() {
  const [total, nb, nn, downloadedAt, syncVersion] = await Promise.all([
    countChapters(),
    countChapters('osnb2'),
    countChapters('osnn1'),
    getMeta('downloadedAt'),
    getMeta('syncVersion'),
  ]);
  const support = {
    Tidslinje: !!(await getBlob('timeline')),
    Profetier: !!(await getBlob('prophecies')),
    Personer: (await getAll('persons')).length > 0,
    Leseplaner: (await getAll('readingPlans')).length > 0,
  };
  statusBox.textContent = '';
  const list = el('ul', 'offline-status-list');
  list.append(el('li', '', `Nedlastede kapitler: ${total} (Bokmål: ${nb}, Nynorsk: ${nn})`));
  const supportText = Object.entries(support)
    .map(([name, ok]) => `${name} ${ok ? '✓' : '—'}`)
    .join(' · ');
  list.append(el('li', '', `Støttedata: ${supportText}`));
  if (downloadedAt) list.append(el('li', '', `Sist nedlastet: ${new Date(downloadedAt).toLocaleString('nb-NO')}`));
  if (syncVersion) list.append(el('li', '', `Innholdsversjon: ${syncVersion}`));
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    list.append(el('li', '', `Lagringsplass brukt: ${fmtBytes(est.usage)} av ${fmtBytes(est.quota)}`));
  }
  statusBox.append(list);
}

// ── Nedlastet innhold (per bok) ──────────────────────────────────────
async function renderContent() {
  const keys = await getAllChapterKeys();
  const books = await getBooks();
  contentBox.textContent = '';
  const builtin = keys.filter(([, , bible]) => !String(bible).startsWith('user:'));
  if (builtin.length === 0) {
    contentBox.append(el('p', 'user-note', 'Ingenting er lastet ned ennå.'));
    return;
  }
  const perBook = new Map();
  for (const [bookId] of builtin) perBook.set(bookId, (perBook.get(bookId) || 0) + 1);
  const list = el('div', 'offline-book-list');
  for (const book of books) {
    const n = perBook.get(book.id);
    if (!n) continue;
    const link = el('a', 'offline-book-link', `${book.name_no} (${n})`);
    link.href = `/${(book.short_name || '').toLowerCase()}/1`;
    list.append(link);
  }
  contentBox.append(list);
}

// ── Nedlasting ───────────────────────────────────────────────────────
let controller = null;

async function fetchBooks() {
  const res = await fetch('/api/books');
  const data = await res.json();
  return (data.books || data).map((b) => ({
    id: b.id,
    name_no: b.name_no || b.name,
    short_name: b.short_name,
    chapters: b.chapters,
  }));
}

async function downloadSupportData(signal) {
  const [timeline, prophecies, persons, plans] = await Promise.all([
    fetch('/api/timeline', { signal }).then((r) => r.json()),
    fetch('/api/prophecies', { signal }).then((r) => r.json()),
    fetch('/api/persons', { signal }).then((r) => r.json()),
    fetch('/api/reading-plans', { signal }).then((r) => r.json()),
  ]);
  await putBlob('timeline', timeline);
  await putBlob('prophecies', prophecies);
  const personRows = persons.persons || persons;
  if (Array.isArray(personRows)) await putAll('persons', personRows);
  const planRows = plans.plans || plans;
  if (Array.isArray(planRows)) await putAll('readingPlans', planRows.filter((p) => p && p.id != null));
}

async function startDownload() {
  const bibles = [...document.querySelectorAll('[data-dl-bible]:checked')].map((i) => i.dataset.dlBible);
  if (bibles.length === 0) return;
  const startBtn = $('[data-dl-start]');
  const pauseBtn = $('[data-dl-pause]');
  const progress = $('[data-dl-progress]');
  const fill = $('[data-dl-fill]');
  const text = $('[data-dl-text]');
  controller = new AbortController();
  const { signal } = controller;
  startBtn.disabled = true;
  pauseBtn.hidden = false;
  progress.hidden = false;

  try {
    const books = await fetchBooks();
    await storeBooks(books);
    const jobs = [];
    for (const bible of bibles) {
      for (const book of books) {
        for (let ch = 1; ch <= book.chapters; ch++) jobs.push({ book, ch, bible });
      }
    }
    let done = 0;
    let skipped = 0;
    // Hopp over kapitler som alt er lastet (gjenopptak).
    const existing = new Set((await getAllChapterKeys()).map((k) => k.join('|')));
    const pending = jobs.filter((j) => !existing.has(`${j.book.id}|${j.ch}|${j.bible}`));
    done = jobs.length - pending.length;

    for (let i = 0; i < pending.length; i += 5) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const batch = pending.slice(i, i + 5);
      await Promise.all(
        batch.map(async ({ book, ch, bible }) => {
          const res = await fetch(`/api/chapter?book=${book.id}&chapter=${ch}&bible=${bible}`, { signal });
          if (res.status === 404) {
            skipped++;
            return;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          await storeChapter({
            bookId: book.id,
            chapter: ch,
            bible,
            verses: data.verses || [],
            originalVerses: data.originalVerses || [],
            word4word: data.word4word || {},
            references: data.references || {},
            summary: data.summary ?? null,
            context: data.context ?? null,
            insight: data.insight ?? null,
            cachedAt: Date.now(),
          });
        }),
      );
      done += batch.length;
      const pct = Math.round((done / jobs.length) * 100);
      fill.style.width = `${pct}%`;
      text.textContent = `${done} av ${jobs.length} kapitler (${pct}%)${skipped ? `, ${skipped} hoppet over` : ''}`;
    }

    text.textContent = 'Laster ned støttedata…';
    await downloadSupportData(signal);
    try {
      const v = await fetch('/api/version', { signal }).then((r) => r.json());
      await setMeta('syncVersion', v.version);
    } catch {}
    await setMeta('downloadedAt', Date.now());
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    text.textContent = 'Nedlasting fullført — bibelen kan nå leses offline.';
  } catch (err) {
    if (err && err.name === 'AbortError') {
      text.textContent = 'Nedlasting satt på pause — trykk «Last ned» for å fortsette.';
    } else {
      text.textContent = 'Nedlastingen feilet — prøv igjen.';
    }
  } finally {
    controller = null;
    startBtn.disabled = false;
    pauseBtn.hidden = true;
    renderStatus();
    renderContent();
  }
}

async function clearAll() {
  if (!confirm('Slette alt nedlastet innhold? Egne oversettelser slettes også.')) return;
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' });
  await deleteDatabase();
  location.reload();
}

function init() {
  renderStatus();
  renderContent();
  $('[data-dl-start]')?.addEventListener('click', startDownload);
  $('[data-dl-pause]')?.addEventListener('click', () => controller?.abort());
  $('[data-dl-clear]')?.addEventListener('click', clearAll);
}
