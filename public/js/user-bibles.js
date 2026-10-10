// Egne oversettelser på lesesiden (#14): når ?bible=user:<id> rendrer serveren
// osnb som grunnlag (studieverktøyene hører til osnb, som i gamle appen) og
// denne øya bytter ut versteksten fra IndexedDB. ?secondary=user:<id> legges
// inn som undertekst-linje per vers. Øya utvider også bibelvelgeren med egne
// bibler og respekterer settings.hiddenBibles.

import { getChapter, getUserBibles } from './offline-db.js';
import { readStrings } from './locale.js';
import { readJSON } from './store.js';
import { hasPlus } from './fv-auth.js';
import { syncUserBibles } from './user-bibles-sync.js';

const t = readStrings(document.body);

/**
 * Navnet på utgaven studieverktøyene faller tilbake til. Sto hardkodet som
 * «OSNB» i begge notatene, som er både norsk og feil på en engelsk side —
 * lesesiden vet hvilken utgave den faktisk rendret.
 */
function fallbackName() {
  return document.body.dataset.bibleName || document.body.dataset.bible || '';
}

const ds = document.body.dataset;
const bookId = parseInt(ds.bookId || '', 10);
const chapter = parseInt(ds.chapter || '', 10);
if (bookId && chapter) init();

function currentQueryWith(name, value) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  return url.pathname + url.search + url.hash;
}

async function applyUserPrimary(userBibleId, bibles) {
  const stored = await getChapter(bookId, chapter, userBibleId);
  const meta = bibles.find((b) => b.id === userBibleId);
  const name = meta ? meta.name : t('is.ownTranslation');
  const rail = document.querySelector('.chapter-rail');
  // Kan kjøres to ganger: først fra den lokale kopien, så igjen når synken
  // har hentet bibelen (#134). Notatet fra første runde skal ikke bli stående.
  document.querySelector('.user-bible-note')?.remove();
  const note = document.createElement('p');
  note.className = 'user-bible-note';
  if (!stored) {
    note.textContent = t('is.chapterMissingInOwn', { name, fallback: fallbackName() });
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
  note.textContent = t('is.showingOwn', { name, fallback: fallbackName() });
  rail?.after(note);
}

async function applyUserSecondary(userSecondaryId, bibles) {
  const stored = await getChapter(bookId, chapter, userSecondaryId);
  if (!stored) return;
  const meta = bibles.find((b) => b.id === userSecondaryId);
  const label = meta ? meta.name : t('is.ownTranslation');
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
  const hidden = readJSON('bible-settings', {}).hiddenBibles || [];
  if (box) {
    box.querySelectorAll('.tools-bible-button').forEach((btn) => {
      const href = btn.getAttribute('href') || '';
      const value = /bible=osnn/.test(href) ? 'osnn' : 'osnb';
      // SSR markerer osnb aktiv når en egen bibel vises — flytt markeringen.
      if (userBibleId) btn.classList.remove('is-active');
      const active = !userBibleId && btn.classList.contains('is-active');
      if (hidden.includes(value) && !active) btn.hidden = true;
    });
    // Velgeren tegnes på nytt når synken har endret lista (#134) — de egne
    // knappene fra forrige runde må ut først, ellers dobles de.
    box.querySelectorAll('[data-user-bible]').forEach((a) => a.remove());
    for (const bible of bibles) {
      if (hidden.includes(bible.id) && bible.id !== userBibleId) continue;
      const a = document.createElement('a');
      a.className = `tools-bible-button ${bible.id === userBibleId ? 'is-active' : ''}`;
      a.dataset.userBible = bible.id;
      a.href = currentQueryWith('bible', bible.id);
      a.textContent = bible.name;
      box.append(a);
    }
  }
  const select = document.querySelector('[data-secondary-select]');
  if (select) {
    select.querySelectorAll('[data-user-bible]').forEach((o) => o.remove());
    for (const bible of bibles) {
      const opt = document.createElement('option');
      opt.dataset.userBible = bible.id;
      opt.value = bible.id;
      opt.textContent = bible.name;
      if (ds.userSecondary === bible.id) opt.selected = true;
      select.append(opt);
    }
  }
}

// Har velgeren fått egne knapper? Da må den tegnes på nytt også når lista
// blir TOM — ellers står en bibel som er slettet på en annen enhet igjen.
let extended = false;

async function render(bibles) {
  if (bibles.length > 0 || extended || ds.userBible || ds.userSecondary) {
    extended = true;
    extendSwitcher(bibles, ds.userBible);
    if (ds.userBible) await applyUserPrimary(ds.userBible, bibles);
    if (ds.userSecondary) await applyUserSecondary(ds.userSecondary, bibles);
  }
}

async function init() {
  let bibles = [];
  try {
    bibles = await getUserBibles();
  } catch {
    return;
  }
  await render(bibles);
  // Pluss lover egne oversettelser på ALLE enheter (#134). Uten denne var en
  // ny enhet blind for dem til leseren tilfeldigvis besøkte /oversettelser,
  // og en sletting på en annen enhet nådde aldri hit. Først tegnes det som
  // ligger lokalt (raskt, og virker offline), så avstemmes det med kontoen.
  if (!hasPlus()) return;
  try {
    if (await syncUserBibles()) await render(await getUserBibles());
  } catch {
    // nett borte eller utlogget — den lokale kopien står
  }
}
