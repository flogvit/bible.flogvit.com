// CommandPalette — port av CommandPalette.tsx + CommandPaletteContext til
// vanilla (global øy). Åpnes med ⌘/Ctrl+K eller klikk på hurtigsøk-triggeren
// i headeren (som ellers faller tilbake til GET /sok uten JS).

import { langParam, localeHref, readStrings } from './locale.js';

const t = readStrings(document.body);

/** Attributtsikker escaping for strengene som limes inn i malstrengen under. */
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Hele paletten var hardkodet norsk — 24 sidenavn, hintene, plassholderen og
// tomteksten — og den lastes på HVER side, altså norsk på alle åtte språk
// (samme hull som #33). Etikettene finnes allerede i ordboka som `nav.*`, så
// paletten gjenbruker dem framfor å innføre 24 nye nøkler; bare hintene og de
// palettspesifikke strengene er nye.
const PAGES = [
  { key: 'foot.home', to: '/', group: null },
  { key: 'nav.favorites', to: '/favoritter', group: 'nav.mine', k: 'F' },
  { key: 'nav.topicsMine', to: '/emner', group: 'nav.mine', k: 'E' },
  { key: 'nav.notes', to: '/notater', group: 'nav.mine', k: 'N' },
  { key: 'nav.verseLists', to: '/lister', group: 'nav.mine', k: 'V' },
  { key: 'nav.readingPlan', to: '/leseplan', group: 'nav.mine', k: 'L' },
  { key: 'nav.manuscripts', to: '/manuskripter', group: 'nav.mine', k: 'M' },
  { key: 'cmdk.newManuscript', to: '/manuskripter/ny', group: 'nav.manuscripts' },
  { key: 'nav.knownVerses', to: '/kjente-vers', group: 'nav.studies', k: 'K' },
  { key: 'nav.themes', to: '/temaer', group: 'nav.studies', k: 'C' },
  { key: 'nav.stories', to: '/historier', group: 'nav.studies', k: 'B' },
  { key: 'pub.catalog', to: '/manuskripter/katalog', group: 'nav.studies' },
  { key: 'nav.prophecies', to: '/profetier', group: 'nav.studies', k: 'P' },
  { key: 'nav.parallels', to: '/paralleller', group: 'nav.studies', k: 'A' },
  { key: 'nav.persons', to: '/personer', group: 'nav.studies', k: 'O' },
  { key: 'nav.numbers', to: '/tall', group: 'nav.studies', k: 'Y' },
  { key: 'nav.timeline', to: '/tidslinje', group: 'nav.overview', k: 'T' },
  { key: 'nav.readingTexts', to: '/lesetekster', group: 'nav.overview' },
  { key: 'nav.statistics', to: '/statistikk', group: 'nav.overview', k: 'I' },
  { key: 'nav.translations', to: '/oversettelser', group: 'nav.overview' },
  { key: 'nav.searchOriginal', to: '/sok/original', group: 'cmdk.searchGroup' },
  { key: 'chrome.settings', to: '/innstillinger', hintKey: 'cmdk.accountSync' },
  { key: 'foot.offline', to: '/offline', hintKey: 'cmdk.downloadBible' },
  { key: 'foot.about', to: '/om', group: null },
  { key: 'foot.a11y', to: '/tilgjengelighet', group: null },
].map((p) => ({
  label: t(p.key),
  to: p.to,
  hint: p.hintKey ? t(p.hintKey) : p.group ? `${t(p.group)}${p.k ? ` · ${p.k}` : ''}` : undefined,
}));

const KIND_ICON = { reference: '📖', page: '↗', search: '🔍', action: '⚙' };

let backdrop = null;
let input = null;
let list = null;
let results = [];
let selectedIdx = 0;
let refResult = null;
let refTimer = null;
let refFetchId = 0;

function build() {
  backdrop = document.createElement('div');
  backdrop.className = 'cmdk-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', t('cmdk.aria'));
  backdrop.style.display = 'none';
  backdrop.innerHTML = `
    <div class="cmdk-palette">
      <div class="cmdk-input-row">
        <svg class="cmdk-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input type="text" class="cmdk-input" placeholder="${esc(t('cmdk.placeholder'))}" aria-label="${esc(t('cmdk.aria'))}" autocomplete="off" />
        <kbd class="cmdk-kbd-esc">Esc</kbd>
      </div>
      <ul class="cmdk-results" role="listbox"></ul>
      <div class="cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> ${esc(t('cmdk.select'))}</span>
        <span><kbd>↵</kbd> ${esc(t('cmdk.open'))}</span>
        <span><kbd>Esc</kbd> ${esc(t('cmdk.close'))}</span>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  input = backdrop.querySelector('.cmdk-input');
  list = backdrop.querySelector('.cmdk-results');

  backdrop.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.cmdk-palette')) close();
  });
  input.addEventListener('input', onQuery);
  input.addEventListener('keydown', onKeyDown);
}

function open() {
  if (!backdrop) build();
  backdrop.style.display = 'flex';
  input.value = '';
  refResult = null;
  render();
  setTimeout(() => input.focus(), 10);
}

function close() {
  if (backdrop) backdrop.style.display = 'none';
}

function isOpen() {
  return backdrop && backdrop.style.display !== 'none';
}

function computeResults() {
  const q = input.value.trim();
  const out = [];
  if (refResult) out.push(refResult);
  out.push(...PAGES.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()))
    .map((p) => ({ kind: 'page', ...p }))
    .slice(0, 20));
  if (q) {
    out.push({ kind: 'search', label: t('cmdk.searchInText', { q }), hint: t('cmdk.fulltext'), to: `/sok?q=${encodeURIComponent(q)}` });
    out.push({ kind: 'search', label: t('cmdk.searchOriginalFor', { q }), hint: t('cmdk.hebrewGreek'), to: `/sok/original?q=${encodeURIComponent(q)}` });
  }
  results = out;
  selectedIdx = 0;
}

function render() {
  computeResults();
  if (results.length === 0) {
    list.textContent = '';
    const empty = document.createElement('li');
    empty.className = 'cmdk-empty';
    empty.textContent = t('cmdk.empty');
    list.appendChild(empty);
    return;
  }
  list.innerHTML = results
    .map(
      (r, i) => `
    <li role="option" aria-selected="${i === selectedIdx}" class="cmdk-row${i === selectedIdx ? ' selected' : ''}" data-idx="${i}">
      <span class="cmdk-kind cmdk-kind-${r.kind}">${KIND_ICON[r.kind] || ''}</span>
      <span class="cmdk-label"></span>
      ${r.hint ? '<span class="cmdk-hint"></span>' : ''}
    </li>`,
    )
    .join('');
  // Tekst settes via textContent (aldri innerHTML med brukertekst).
  list.querySelectorAll('.cmdk-row').forEach((row, i) => {
    row.querySelector('.cmdk-label').textContent = results[i].label;
    const hint = row.querySelector('.cmdk-hint');
    if (hint) hint.textContent = results[i].hint;
    row.addEventListener('mouseenter', () => setSelected(i));
    row.addEventListener('click', () => select(results[i]));
  });
}

function setSelected(i) {
  selectedIdx = i;
  list.querySelectorAll('.cmdk-row').forEach((row, j) => {
    row.classList.toggle('selected', j === i);
    row.setAttribute('aria-selected', String(j === i));
  });
}

function select(r) {
  if (r && r.to) location.href = localeHref(r.to);
  close();
}

function onQuery() {
  const q = input.value.trim();
  clearTimeout(refTimer);
  if (!q) {
    refResult = null;
    render();
    return;
  }
  render();
  const id = ++refFetchId;
  refTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/reference?q=${encodeURIComponent(q)}&${langParam()}`);
      const data = await res.json();
      if (id !== refFetchId) return;
      refResult =
        data.success && data.reference?.url
          ? { kind: 'reference', label: data.reference.formatted || q, hint: t('cmdk.goToVerse'), to: data.reference.url }
          : null;
      render();
    } catch {
      if (id === refFetchId) refResult = null;
    }
  }, 120);
}

function onKeyDown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSelected(Math.min(selectedIdx + 1, results.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSelected(Math.max(selectedIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    select(results[selectedIdx]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

// Triggere: header-knappen (ellers GET /sok-fallback) + ⌘/Ctrl+K.
const trigger = document.getElementById('cmdk-trigger');
if (trigger) {
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (isOpen()) close();
    else open();
  }
});
