// CommandPalette — port av CommandPalette.tsx + CommandPaletteContext til
// vanilla (global øy). Åpnes med ⌘/Ctrl+K eller klikk på hurtigsøk-triggeren
// i headeren (som ellers faller tilbake til GET /sok uten JS).

import { langParam, localeHref } from './locale.js';

const PAGES = [
  { label: 'Hjem', to: '/', hint: 'Forside' },
  { label: 'Favoritter', to: '/favoritter', hint: 'Mitt · F' },
  { label: 'Emner', to: '/emner', hint: 'Mitt · E' },
  { label: 'Notater', to: '/notater', hint: 'Mitt · N' },
  { label: 'Verslister', to: '/lister', hint: 'Mitt · V' },
  { label: 'Leseplan', to: '/leseplan', hint: 'Mitt · L' },
  { label: 'Manuskripter', to: '/manuskripter', hint: 'Mitt · M' },
  { label: 'Skriv nytt manuskript', to: '/manuskripter/ny', hint: 'Manuskripter' },
  { label: 'Kjente vers', to: '/kjente-vers', hint: 'Studier · K' },
  { label: 'Temaer', to: '/temaer', hint: 'Studier · C' },
  { label: 'Bibelhistorier', to: '/historier', hint: 'Studier · B' },
  { label: 'Profetier', to: '/profetier', hint: 'Studier · P' },
  { label: 'Paralleller', to: '/paralleller', hint: 'Studier · A' },
  { label: 'Personer', to: '/personer', hint: 'Studier · O' },
  { label: 'Tall', to: '/tall', hint: 'Studier · Y' },
  { label: 'Tidslinje', to: '/tidslinje', hint: 'Oversikt · T' },
  { label: 'Lesetekster', to: '/lesetekster', hint: 'Oversikt' },
  { label: 'Statistikk', to: '/statistikk', hint: 'Oversikt · I' },
  { label: 'Oversettelser', to: '/oversettelser', hint: 'Oversikt' },
  { label: 'Søk i originalspråk', to: '/sok/original', hint: 'Søk' },
  { label: 'Innstillinger', to: '/innstillinger', hint: 'Konto · sync' },
  { label: 'Offline', to: '/offline', hint: 'Last ned bibel' },
  { label: 'Om', to: '/om' },
  { label: 'Tilgjengelighet', to: '/tilgjengelighet' },
];

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
  backdrop.setAttribute('aria-label', 'Hurtigsøk');
  backdrop.style.display = 'none';
  backdrop.innerHTML = `
    <div class="cmdk-palette">
      <div class="cmdk-input-row">
        <svg class="cmdk-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input type="text" class="cmdk-input" placeholder="Søk vers, person, tema, manuskript…" aria-label="Hurtigsøk" autocomplete="off" />
        <kbd class="cmdk-kbd-esc">Esc</kbd>
      </div>
      <ul class="cmdk-results" role="listbox"></ul>
      <div class="cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> velg</span>
        <span><kbd>↵</kbd> åpne</span>
        <span><kbd>Esc</kbd> lukk</span>
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
    out.push({ kind: 'search', label: `Søk etter «${q}» i bibelteksten`, hint: 'Fulltekstsøk', to: `/sok?q=${encodeURIComponent(q)}` });
    out.push({ kind: 'search', label: `Søk i originalspråk etter «${q}»`, hint: 'Hebraisk / gresk', to: `/sok/original?q=${encodeURIComponent(q)}` });
  }
  results = out;
  selectedIdx = 0;
}

function render() {
  computeResults();
  if (results.length === 0) {
    list.innerHTML = '<li class="cmdk-empty">Skriv for å søke. Prøv «Joh 3,16», «Salme 23», «nåde» eller et sidenavn.</li>';
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
          ? { kind: 'reference', label: data.reference.formatted || q, hint: 'Gå til vers', to: data.reference.url }
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
