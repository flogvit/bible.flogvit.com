// Offline-leser (#14): SW-en serverer /offline-fallback-siden for navigasjoner
// uten nett, med original-URL-en intakt i location. Her rendres nedlastede
// kapitler fra IndexedDB; andre stier får en oversikt over nedlastet innhold.

import { getBooks, getChapter, countChapters } from './offline-db.js';
import { readStrings, localeHref } from './locale.js';

const t = readStrings(document.body);

const root = document.querySelector('[data-offline-reader]');

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('bible-settings') || '{}');
  } catch {
    return {};
  }
}

function slugFor(book) {
  return (book.short_name || '').toLowerCase();
}

async function resolvePath() {
  // SW-en svarer med denne siden for original-URL-en; ved direkte besøk på
  // /offline-fallback kan stien ligge i ?path=.
  const params = new URLSearchParams(location.search);
  let path = location.pathname;
  if (path === '/offline-fallback') path = params.get('path') || '/';
  const m = path.match(/^\/([^/]+)\/(\d+)$/);
  if (!m) return { kind: 'other', path };
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const chapter = parseInt(m[2], 10);
  const books = await getBooks();
  const book = books.find((b) => slugFor(b) === slug);
  if (!book) return { kind: 'other', path };
  return { kind: 'chapter', book, chapter, books };
}

async function renderChapter(book, chapter, books) {
  const settings = readSettings();
  const params = new URLSearchParams(location.search);
  const bible = params.get('bible') || settings.bible || 'osnb';
  let stored = await getChapter(book.id, chapter, bible);
  if (!stored && bible !== 'osnb') stored = await getChapter(book.id, chapter, 'osnb');
  root.textContent = '';

  const crumbs = el('p', 'offline-crumbs');
  const home = el('a', '', t('foot.home'));
  home.href = localeHref('/');
  crumbs.append(home, ` / ${book.name_no} ${chapter} (offline)`);
  root.append(crumbs);

  if (!stored) {
    root.append(el('h1', '', `${book.name_no} ${chapter}`));
    root.append(el('p', 'user-note', t('is.chapterNotDownloaded')));
    await renderIndex(false);
    return;
  }

  const h1 = el('h1', '', '');
  h1.append(el('span', 'chapter-book', book.name_no), el('span', 'chapter-number', t('is.chapterN', { n: chapter })));
  h1.className = 'chapter-title';
  root.append(h1);

  const verses = el('div', 'offline-verses');
  for (const v of stored.verses || []) {
    const p = el('p', 'offline-verse');
    p.id = `v${v.verse}`;
    p.append(el('sup', 'offline-verse-num', String(v.verse)), ` ${v.text}`);
    verses.append(p);
  }
  root.append(verses);

  const nav = el('nav', 'offline-chapter-nav');
  if (chapter > 1) {
    const prev = el('a', 'offline-nav-link', `← ${book.name_no} ${chapter - 1}`);
    prev.href = localeHref(`/${slugFor(book)}/${chapter - 1}`);
    nav.append(prev);
  }
  if (chapter < book.chapters) {
    const next = el('a', 'offline-nav-link', `${book.name_no} ${chapter + 1} →`);
    next.href = localeHref(`/${slugFor(book)}/${chapter + 1}`);
    nav.append(next);
  }
  root.append(nav);
  root.append(el('p', 'user-note', t('is.offlineNotice')));
}

async function renderIndex(withHeading = true) {
  const count = await countChapters();
  if (withHeading) {
    root.textContent = '';
    root.append(el('h1', '', t('is.youAreOffline')));
  }
  if (count === 0) {
    root.append(
      el('p', 'user-note', t('is.nothingDownloadedYet')),
    );
    return;
  }
  root.append(el('p', '', t('is.chaptersAvailableOffline', { n: count })));
  const books = await getBooks();
  const list = el('div', 'offline-book-list');
  for (const book of books) {
    const link = el('a', 'offline-book-link', book.name_no);
    link.href = localeHref(`/${slugFor(book)}/1`);
    list.append(link);
  }
  root.append(list);
}

try {
  const resolved = await resolvePath();
  if (resolved.kind === 'chapter') await renderChapter(resolved.book, resolved.chapter, resolved.books);
  else await renderIndex();
} catch {
  root.textContent = '';
  root.append(el('h1', '', t('is.youAreOffline')), el('p', 'user-note', t('is.couldNotReadOffline')));
}
