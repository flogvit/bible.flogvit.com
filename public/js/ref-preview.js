// Øy: hover-forhåndsvisning av bibelreferanser (progressiv forbedring).
// Server-rendrede lenker a.inline-ref[data-ref] virker uten JS; med JS hentes
// verseteksten fra GET /api/verses?ref=... og vises i en posisjonert tooltip.
// Erstatter klikk-ekspanderingen i gamle React-InlineRefs.

import { readStrings } from './locale.js';

const t = readStrings(document.body);

const cache = new Map(); // "ref|bible" -> Promise<VerseWithOriginal[]>
let tip = null;
let currentLink = null;
let showToken = 0;

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'ref-preview';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function fetchVerses(ref, bible) {
  const key = `${ref}|${bible || ''}`;
  let p = cache.get(key);
  if (!p) {
    const url = `/api/verses?ref=${encodeURIComponent(ref)}${bible ? `&bible=${encodeURIComponent(bible)}` : ''}`;
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    cache.set(key, p);
  }
  return p;
}

function renderTip(verses) {
  const t = ensureTip();
  t.textContent = '';
  if (!Array.isArray(verses) || verses.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'ref-preview-empty';
    empty.textContent = t('ref.notFound');
    t.appendChild(empty);
    return;
  }
  // Maks 6 vers i forhåndsvisningen; resten antydes med «…»
  for (const v of verses.slice(0, 6)) {
    const row = document.createElement('div');
    row.className = 'ref-preview-verse';
    const num = document.createElement('span');
    num.className = 'ref-preview-num';
    num.textContent = `${v.bookShortName} ${v.verse.chapter},${v.verse.verse}`;
    const text = document.createElement('span');
    text.className = 'ref-preview-text';
    text.textContent = v.verse.text;
    row.appendChild(num);
    row.appendChild(text);
    t.appendChild(row);
  }
  if (verses.length > 6) {
    const more = document.createElement('div');
    more.className = 'ref-preview-more';
    more.textContent = '…';
    t.appendChild(more);
  }
}

function positionTip(link) {
  const t = ensureTip();
  const rect = link.getBoundingClientRect();
  t.hidden = false;
  // Midlertidig plassering for å kunne måle
  t.style.left = '0px';
  t.style.top = '0px';
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  const margin = 8;

  let left = window.scrollX + rect.left;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - tw - margin;
  if (left > maxLeft) left = Math.max(window.scrollX + margin, maxLeft);

  let top = window.scrollY + rect.bottom + 6;
  const viewportBottom = window.scrollY + window.innerHeight;
  if (top + th > viewportBottom - margin && rect.top > th + 12) {
    top = window.scrollY + rect.top - th - 6; // over lenken hvis bedre plass
  }

  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

async function show(link) {
  currentLink = link;
  const token = ++showToken;
  const verses = await fetchVerses(link.dataset.ref, link.dataset.bible);
  if (token !== showToken || currentLink !== link) return; // avbrutt i mellomtiden
  renderTip(verses);
  positionTip(link);
}

function hide() {
  currentLink = null;
  showToken++;
  if (tip) tip.hidden = true;
}

function refLinkFrom(target) {
  return target instanceof Element ? target.closest('a.inline-ref[data-ref]') : null;
}

document.addEventListener('mouseover', (e) => {
  const link = refLinkFrom(e.target);
  if (link && link !== currentLink) show(link);
});

document.addEventListener('mouseout', (e) => {
  const link = refLinkFrom(e.target);
  if (!link || link !== currentLink) return;
  // Ikke lukk hvis pekeren gikk inn i tooltipen
  const to = e.relatedTarget;
  if (to instanceof Element && tip && tip.contains(to)) return;
  hide();
});

document.addEventListener('focusin', (e) => {
  const link = refLinkFrom(e.target);
  if (link) show(link);
});

document.addEventListener('focusout', (e) => {
  if (refLinkFrom(e.target)) hide();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hide();
});

// Lukk også når tooltipen selv forlates med pekeren
document.addEventListener(
  'mouseleave',
  (e) => {
    if (tip && e.target === tip) hide();
  },
  true,
);
