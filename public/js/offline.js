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
import { readStrings, intlLocale, langParam, localeHref } from './locale.js';
import { el } from './dom.js';

const t = readStrings(document.body);

const $ = (sel) => document.querySelector(sel);
const statusBox = $('[data-offline-status]');
const contentBox = $('[data-offline-content]');
if (statusBox) init();

function fmtBytes(n) {
  if (!n) return '0 MB';
  return `${Math.round(n / 1024 / 1024)} MB`;
}

// ── Status ───────────────────────────────────────────────────────────
async function renderStatus() {
  // Utgavene siden tilbyr (#136) — ikke OSNB/OSNN hardkodet.
  const offered = [...document.querySelectorAll('[data-dl-bible]')].map((i) => i.dataset.dlBible);
  const [total, perBible, downloadedAt, syncVersion] = await Promise.all([
    countChapters(),
    Promise.all(offered.map(async (id) => `${id.toUpperCase()}: ${await countChapters(id)}`)),
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
  list.append(el('li', '', t('is.downloadedChapters', { total, detail: perBible.join(', ') })));
  const supportText = Object.entries(support)
    .map(([name, ok]) => `${name} ${ok ? '✓' : '—'}`)
    .join(' · ');
  list.append(el('li', '', t('is.supportData', { detail: supportText })));
  if (downloadedAt) list.append(el('li', '', t('is.lastDownloaded', { when: new Date(downloadedAt).toLocaleString(intlLocale()) })));
  if (syncVersion) list.append(el('li', '', t('is.contentVersion', { version: syncVersion })));
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
    contentBox.append(el('p', 'user-note', t('is.nothingDownloaded')));
    return;
  }
  const perBook = new Map();
  for (const [bookId] of builtin) perBook.set(bookId, (perBook.get(bookId) || 0) + 1);
  const list = el('div', 'offline-book-list');
  for (const book of books) {
    const n = perBook.get(book.id);
    if (!n) continue;
    const link = el('a', 'offline-book-link', `${book.name_no} (${n})`);
    link.href = localeHref(`/${(book.short_name || '').toLowerCase()}/1`);
    list.append(link);
  }
  contentBox.append(list);
}

// ── Nedlasting ───────────────────────────────────────────────────────
let controller = null;

async function fetchBooks() {
  const res = await fetch(`/api/books?${langParam()}`);
  const data = await res.json();
  return (data.books || data).map((b) => ({
    id: b.id,
    name_no: b.name_no || b.name,
    short_name: b.short_name,
    chapters: b.chapters,
  }));
}

/**
 * Merket ber service workeren slippe forespørselen rett gjennom (#136). Alt
 * nedlastingen henter lagres i IndexedDB; uten merket la SW-en en kopi av hvert
 * svar i API-cachen også, og innholdet tok dobbelt så mye plass.
 */
const DIRECT = { 'x-bibel-offline': '1' };

async function downloadSupportData(signal) {
  const get = (path) => fetch(`${path}?${langParam()}`, { signal, headers: DIRECT }).then((r) => r.json());
  const [timeline, prophecies, persons, plans] = await Promise.all([
    get('/api/timeline'),
    get('/api/prophecies'),
    get('/api/persons'),
    get('/api/reading-plans'),
  ]);
  await putBlob('timeline', timeline);
  await putBlob('prophecies', prophecies);
  const personRows = persons.persons || persons;
  if (Array.isArray(personRows)) await putAll('persons', personRows);
  const planRows = plans.plans || plans;
  if (Array.isArray(planRows)) await putAll('readingPlans', planRows.filter((p) => p && p.id != null));
}

async function startDownload() {
  if (!window.fvPlus?.gate(t('is.offlineDownload'))) return;
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
          // `lang`: sammendrag, kontekst, innsikt og kryssreferanser følger
          // sidens språk, som på lesesiden — uten den kom de på gulvet.
          const res = await fetch(`/api/chapter?book=${book.id}&chapter=${ch}&bible=${bible}&${langParam()}`, {
            signal,
            headers: DIRECT,
          });
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
            bookSummary: data.bookSummary ?? null,
            summary: data.summary ?? null,
            context: data.context ?? null,
            insight: data.insight ?? null,
            lang: document.documentElement.lang || null,
            cachedAt: Date.now(),
          });
        }),
      );
      done += batch.length;
      const pct = Math.round((done / jobs.length) * 100);
      fill.style.width = `${pct}%`;
      text.textContent = t('is.downloadProgress', { done, total: jobs.length, pct }) +
      (skipped ? t('is.downloadSkipped', { n: skipped }) : '');
    }

    text.textContent = t('is.downloadingSupport');
    await downloadSupportData(signal);
    try {
      const v = await fetch('/api/version', { signal }).then((r) => r.json());
      await setMeta('syncVersion', v.version);
    } catch {}
    await setMeta('downloadedAt', Date.now());
    await cacheOfflineShell();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    text.textContent = t('is.downloadDone');
  } catch (err) {
    if (err && err.name === 'AbortError') {
      text.textContent = t('is.downloadPaused');
    } else {
      text.textContent = t('is.downloadFailed');
    }
  } finally {
    controller = null;
    startBtn.disabled = false;
    pauseBtn.hidden = true;
    renderStatus();
    renderContent();
  }
}

/**
 * Be service workeren legge offline-skallet for dette språket klart, og vent
 * på svaret (#136). Nedlastingen er ikke ferdig før et kapittel man aldri har
 * åpnet faktisk kan vises uten nett — og det er skallet som viser det.
 */
async function cacheOfflineShell() {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // `ready` løses aldri når registreringen feilet — derfor et tak.
  const reg = await Promise.race([sw.ready, new Promise((r) => setTimeout(() => r(null), 5000))]);
  const worker = sw.controller || reg?.active;
  if (!worker) return;
  await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(resolve, 30_000);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve();
    };
    worker.postMessage({ type: 'CACHE_OFFLINE_SHELL', lang: document.documentElement.lang }, [channel.port2]);
  });
}

async function clearAll() {
  if (!confirm(t('is.deleteAllConfirm'))) return;
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
