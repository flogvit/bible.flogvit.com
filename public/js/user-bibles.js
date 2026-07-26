// Egne oversettelser på lesesiden (#14): når ?bible=user:<id> rendrer serveren
// osnb som grunnlag (studieverktøyene hører til osnb, som i gamle appen) og
// denne øya bytter ut versteksten fra IndexedDB. ?secondary=user:<id> legges
// inn som undertekst-linje per vers. Øya utvider også bibelvelgeren med egne
// bibler og respekterer settings.hiddenBibles.

import { getChapter, getUserBibles } from './offline-db.js';

const ds = document.body.dataset;
const bookId = parseInt(ds.bookId || '', 10);
const chapter = parseInt(ds.chapter || '', 10);
if (bookId && chapter) init();

function settings() {
  try {
    return JSON.parse(localStorage.getItem('bible-settings') || '{}');
  } catch {
    return {};
  }
}

function currentQueryWith(name, value) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  return url.pathname + url.search + url.hash;
}

async function applyUserPrimary(userBibleId, bibles) {
  const stored = await getChapter(bookId, chapter, userBibleId);
  const meta = bibles.find((b) => b.id === userBibleId);
  const name = meta ? meta.name : 'Egen oversettelse';
  const rail = document.querySelector('.chapter-rail');
  const note = document.createElement('p');
  note.className = 'user-bible-note';
  if (!stored) {
    note.textContent = `«${name}» har ikke dette kapittelet — viser OSNB.`;
    rail?.after(note);
    return;
  }
  const byVerse = new Map(stored.verses.map((v) => [v.verse, v.text]));
  document.querySelectorAll('.verse').forEach((verseEl) => {
    const n = parseInt(verseEl.dataset.verseNum || '', 10);
    const plain = verseEl.querySelector('[data-verse-plain]');
    if (!plain) return;
    const text = byVerse.get(n);
    if (text !== undefined) {
      plain.textContent = text;
      verseEl.querySelector('.footnotes')?.remove(); // fotnotene hører til osnb-teksten
    } else {
      verseEl.classList.add('user-bible-missing');
    }
  });
  note.textContent = `Viser «${name}» (egen oversettelse). Studieverktøyene følger OSNB.`;
  rail?.after(note);
}

async function applyUserSecondary(userSecondaryId, bibles) {
  const stored = await getChapter(bookId, chapter, userSecondaryId);
  if (!stored) return;
  const meta = bibles.find((b) => b.id === userSecondaryId);
  const label = meta ? meta.name : 'egen';
  const byVerse = new Map(stored.verses.map((v) => [v.verse, v.text]));
  document.querySelectorAll('.verse').forEach((verseEl) => {
    const n = parseInt(verseEl.dataset.verseNum || '', 10);
    const text = byVerse.get(n);
    if (text === undefined || verseEl.querySelector('.secondary-verse')) return;
    const div = document.createElement('div');
    div.className = 'secondary-verse';
    const span = document.createElement('span');
    span.className = 'undertekst-label';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = label;
    div.append(span, text);
    verseEl.querySelector('[data-verse-text]')?.after(div);
  });
}

function extendSwitcher(bibles, userBibleId) {
  const box = document.querySelector('.tools-bibles');
  const hidden = settings().hiddenBibles || [];
  if (box) {
    box.querySelectorAll('.tools-bible-button').forEach((btn) => {
      const href = btn.getAttribute('href') || '';
      const value = /bible=osnn/.test(href) ? 'osnn' : 'osnb';
      // SSR markerer osnb aktiv når en egen bibel vises — flytt markeringen.
      if (userBibleId) btn.classList.remove('is-active');
      const active = !userBibleId && btn.classList.contains('is-active');
      if (hidden.includes(value) && !active) btn.hidden = true;
    });
    for (const bible of bibles) {
      if (hidden.includes(bible.id) && bible.id !== userBibleId) continue;
      const a = document.createElement('a');
      a.className = `tools-bible-button ${bible.id === userBibleId ? 'is-active' : ''}`;
      a.href = currentQueryWith('bible', bible.id);
      a.textContent = bible.name;
      box.append(a);
    }
  }
  const select = document.querySelector('[data-secondary-select]');
  if (select) {
    for (const bible of bibles) {
      const opt = document.createElement('option');
      opt.value = bible.id;
      opt.textContent = bible.name;
      if (ds.userSecondary === bible.id) opt.selected = true;
      select.append(opt);
    }
  }
}

async function init() {
  let bibles = [];
  try {
    bibles = await getUserBibles();
  } catch {
    return;
  }
  if (bibles.length > 0 || ds.userBible || ds.userSecondary) {
    extendSwitcher(bibles, ds.userBible);
    if (ds.userBible) await applyUserPrimary(ds.userBible, bibles);
    if (ds.userSecondary) await applyUserSecondary(ds.userSecondary, bibles);
  }
}
