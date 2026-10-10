// Offline-leser (#14, #136): SW-en serverer /<lang>/offline-fallback for
// navigasjoner uten nett, med original-URL-en intakt i location. Her rendres
// nedlastede kapitler fra IndexedDB; andre stier får en oversikt over
// nedlastet innhold.
//
// Kapittelet tegnes i SAMME FORM som lesesiden (#136): samme markup og klasser
// (reading.css og studium.css lastes av fallback-siden), med grunntekst,
// ord-for-ord, kryssreferanser, sammendrag, historisk kontekst og innsikt — alt
// som ligger i det nedlastede kapittelet. Første utgave rendret bare
// `stored.verses`, så det Plus lover («med grunntekst og studiedata») lå i
// IndexedDB uten at noen så det.
//
// Boknavn, slugs og utgaverekkefølge kommer fra fallback-siden selv
// (`data-books`/`data-editions`): den caches per språk, og IndexedDB har bare
// norske navn fra nedlastingstidspunktet.

import { getChapter, getAllChapterKeys, countChapters } from './offline-db.js';
import { readStrings, localeHref } from './locale.js';
import { el } from './dom.js';
import { readJSON } from './store.js';
import { verseHash } from './verse-hash.js';

const t = readStrings(document.body);

const root = document.querySelector('[data-offline-reader]');

function parseData(name) {
  try {
    return JSON.parse(root?.dataset[name] || '[]');
  } catch {
    return [];
  }
}
const BOOKS = parseData('books');
const EDITIONS = parseData('editions');
const bookById = new Map(BOOKS.map((b) => [b.id, b]));

/**
 * Stien leseren skal vise. Under `/<lang>/` (#136): den gamle matchen tok
 * `/jes/40`, men ikke `/nb/jes/40` — og alle sidene våre ligger under et
 * språkprefiks. Prefikset er valgfritt i mønsteret (bokmerker fra før #18), og
 * står det to bokstaver uten mer bak, er det en bok og ikke et språk: `/am/1`.
 */
const CHAPTER_PATH = /^(?:\/[a-z]{2})?\/([^/]+)\/(\d+)\/?$/;
const FALLBACK_PATH = /^(?:\/[a-z]{2})?\/offline-fallback\/?$/;

function resolvePath() {
  const params = new URLSearchParams(location.search);
  let path = location.pathname;
  // Ved direkte besøk på /<lang>/offline-fallback kan stien ligge i ?path=.
  if (FALLBACK_PATH.test(path)) path = params.get('path') || '/';
  const m = path.match(CHAPTER_PATH);
  if (!m) return { kind: 'other' };
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const chapter = parseInt(m[2], 10);
  const book = BOOKS.find((b) => b.slug === slug);
  if (!book || chapter < 1 || chapter > book.chapters) return { kind: 'other' };
  return { kind: 'chapter', book, chapter };
}

const chapterHref = (book, chapter) => localeHref(`/${book.slug}/${chapter}${location.search}`);
const editionLabel = (id) => {
  const e = EDITIONS.find((x) => x.id === id);
  return e ? e.label.split(' (')[0] : String(id).toUpperCase();
};

/**
 * Utgaven leseren ba om, og den vi faktisk har. Ønsket er `?bible=`, så
 * innstillingen, så språkets første utgave — som på lesesiden. Har vi ikke den,
 * prøves språkets øvrige utgaver i rekkefølge, så alt annet som er lastet ned.
 */
async function pickChapter(book, chapter) {
  const params = new URLSearchParams(location.search);
  const settings = readJSON('bible-settings', {}) || {};
  const wanted = params.get('bible') || settings.bible || EDITIONS[0]?.id || 'osnb';
  const order = [wanted, ...EDITIONS.map((e) => e.id)];
  for (const [bookId, ch, bible] of await getAllChapterKeys()) {
    if (bookId === book.id && ch === chapter && !String(bible).startsWith('user:')) order.push(bible);
  }
  let text = null;
  for (const bible of [...new Set(order)]) {
    text = await getChapter(book.id, chapter, bible);
    if (text) break;
  }
  if (!text) return null;
  // En egen oversettelse har bare versene; studiedataene hører til kapittelet,
  // ikke utgaven, så de hentes fra en innebygd utgave av samme kapittel.
  let study = text;
  if (!text.originalVerses) {
    for (const bible of EDITIONS.map((e) => e.id)) {
      const candidate = await getChapter(book.id, chapter, bible);
      if (candidate) {
        study = candidate;
        break;
      }
    }
  }
  return { wanted, text, study };
}

// ── Små byggesteiner ─────────────────────────────────────────────────

/** `{{matt 6,9-13}}`-maler i innsiktene: vises som referansen, ikke som kode. */
const templateText = (s) => String(s || '').replace(/\{\{([^}]+)\}\}/g, '$1');

/**
 * Samme markdown-dialekt som `views/markdown.tsx` på lesesiden: overskrifter,
 * lister og avsnitt per linje, **fet** og *kursiv* inline. Bygget med DOM-noder,
 * aldri innerHTML — teksten er innhold, ikke markup.
 */
function inline(target, text) {
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) target.append(templateText(text.slice(last, m.index)));
    target.append(el(m[1] ? 'strong' : 'em', '', templateText(m[1] || m[2])));
    last = re.lastIndex;
  }
  if (last < text.length) target.append(templateText(text.slice(last)));
  return target;
}

function markdown(text) {
  const box = el('div', 'st-summary-text');
  const md = el('div', 'md');
  box.append(md);
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!list) md.append((list = el('ul')));
      list.append(inline(el('li'), li[1]));
      continue;
    }
    list = null;
    if (h) md.append(inline(el(`h${Math.min(5, h[1].length + 1)}`), h[2]));
    else if (line.trim()) md.append(inline(el('p'), line));
  }
  return box;
}

function summaryItem(title, content) {
  const item = el('div', 'st-summary-item');
  item.append(el('h4', 'st-summary-sub', title), markdown(content));
  return item;
}

function referenceLabel(ref) {
  const book = bookById.get(ref.to_book_id);
  const range = ref.to_verse_end && ref.to_verse_end !== ref.to_verse_start
    ? `${ref.to_verse_start}-${ref.to_verse_end}`
    : `${ref.to_verse_start}`;
  return `${book ? book.abbr : ref.book_short_name || ''} ${ref.to_chapter}:${range}`;
}

function referenceHref(ref) {
  const book = bookById.get(ref.to_book_id);
  const slug = book ? book.slug : String(ref.book_short_name || '').toLowerCase();
  return localeHref(`/${slug}/${ref.to_chapter}`) + verseHash(ref.to_verse_start, ref.to_verse_end);
}

// ── Innsikt (samme typer som ChapterInsights på lesesiden) ──────────

function insightPanel(insight) {
  if (!insight || typeof insight !== 'object' || !insight.type) return null;
  const details = el('details', 'insights-panel');
  const summary = el('summary', 'insights-toggle');
  const icon = el('span', 'insights-toggle-icon', '+');
  icon.setAttribute('aria-hidden', 'true');
  summary.append(icon, el('span', '', insight.buttonText || insight.title || ''), el('span', 'insights-toggle-hint', insight.hint || ''));
  const content = el('div', 'insights-content');
  if (insight.intro) content.append(el('p', 'insights-intro', templateText(insight.intro)));
  content.append(insightBody(insight));
  details.append(summary, content);
  return details;
}

function insightBody(insight) {
  const box = el('div');
  switch (insight.type) {
    case 'genealogy':
      for (const section of insight.sections || []) {
        const s = el('div', 'ins-section');
        const h = el('h3', 'ins-section-title', section.title || '');
        h.append(el('span', 'ins-verse-ref', `v.${section.startVerse}-${section.endVerse}`));
        const list = el('div', 'ins-person-list');
        (section.persons || []).forEach((person, i) => {
          const item = el('div', 'ins-person-item');
          if (i > 0) item.append(el('span', 'ins-arrow', '→'));
          const p = el('span', 'ins-person');
          p.append(el('span', 'ins-person-link', person.name || ''));
          if (person.years) p.append(el('span', 'ins-person-years', person.years));
          if (person.note) p.append(el('span', 'ins-person-note', person.note));
          item.append(p);
          list.append(item);
        });
        s.append(h, list);
        box.append(s);
      }
      if (insight.footer?.content) box.append(el('p', 'ins-footer', templateText(insight.footer.content)));
      break;
    case 'list':
      box.className = 'ins-list';
      for (const item of insight.items || []) {
        const row = el('div', 'ins-list-item');
        if (item.number != null) row.append(el('span', 'ins-list-number', String(item.number)));
        const c = el('div', 'ins-list-content');
        c.append(el('h4', 'ins-list-title', item.title || ''), el('p', 'ins-list-text', templateText(item.text)));
        c.append(el('span', 'ins-list-verses', `v.${(item.verses || []).join(', ')}`));
        row.append(c);
        box.append(row);
      }
      break;
    case 'two-column': {
      box.className = 'ins-two-column';
      for (const side of ['left', 'right']) {
        const col = el('div', 'ins-column');
        col.append(el('h4', 'ins-column-title', insight[`${side}Title`] || ''));
        col.append(el('span', 'ins-column-verses', `v.${(insight.verses?.[side] || []).join('-')}`));
        const ul = el('ul', 'ins-column-list');
        for (const item of insight[`${side}Items`] || []) ul.append(el('li', 'ins-column-item', templateText(item.text)));
        col.append(ul);
        box.append(col);
      }
      break;
    }
    case 'person-list':
      box.className = 'ins-person-grid';
      (insight.persons || []).forEach((person, i) => {
        const card = el('div', 'ins-person-card');
        card.append(el('span', 'ins-person-number', String(i + 1)));
        const info = el('div', 'ins-person-info');
        info.append(el('span', 'ins-person-card-name', person.name || ''), el('p', 'ins-person-description', templateText(person.description)));
        if (person.note) info.append(el('span', 'ins-person-card-note', person.note));
        card.append(info);
        box.append(card);
      });
      break;
    case 'creation': {
      box.className = 'ins-creation';
      const day = (label, title, body) => {
        const d = el('div', 'ins-creation-day');
        const n = el('div', 'ins-day-number');
        n.append(el('span', '', label));
        const c = el('div', 'ins-day-content');
        c.append(el('h4', 'ins-day-title', title));
        c.append(body);
        d.append(n, c);
        return d;
      };
      for (const d of insight.days || []) {
        const ul = el('ul', 'ins-day-created');
        for (const item of d.created || []) ul.append(el('li', '', item));
        box.append(day(t('is.offlineDay', { n: d.day }), d.title || '', ul));
      }
      box.append(day(t('rd.day7'), t('rd.rest'), el('p', 'ins-day-description', t('rd.day7Description'))));
      break;
    }
    case 'faith-heroes':
      box.className = 'ins-heroes-grid';
      for (const hero of insight.heroes || []) {
        const card = el('div', 'ins-hero-card');
        card.append(el('span', 'ins-hero-name', hero.name || ''), el('p', 'ins-hero-deed', templateText(hero.deed)));
        card.append(el('span', 'ins-hero-verses', `v.${(hero.verses || []).join(', ')}`));
        box.append(card);
      }
      break;
    default:
      break;
  }
  return box;
}

// ── Versene ──────────────────────────────────────────────────────────

function verseBlock(v, study, book) {
  const n = v.verse;
  const hebrew = book.hebrew;
  const script = { dir: hebrew ? 'rtl' : 'ltr', lang: hebrew ? 'he' : 'el' };
  const original = (study.originalVerses || []).find((o) => o.verse === n)?.text || null;
  const words = study.word4word?.[n] || [];
  const refs = study.references?.[n] || [];

  const verse = el('div', 'verse');
  verse.id = `v${n}`;
  verse.dataset.verseNum = String(n);

  const num = el('button', 'verse-number', String(n));
  num.type = 'button';
  num.setAttribute('aria-expanded', 'false');
  num.setAttribute('aria-controls', `v${n}-detail`);
  num.setAttribute('aria-label', t('rd.verseAria', { n }));
  const text = el('span', 'verse-text', v.text);
  verse.append(num, text);

  // Grunntekst-stripen under verset (skinnens «Grunntekst», som på nett).
  if (original) {
    const strip = el('div', `original-verse ${hebrew ? 'hebrew' : 'greek'}`);
    strip.dir = script.dir;
    strip.lang = script.lang;
    strip.dataset.originalStrip = '';
    strip.hidden = true;
    const label = el('span', 'undertekst-label', t(hebrew ? 'lang.hebrewShort' : 'lang.greekShort'));
    label.setAttribute('aria-hidden', 'true');
    strip.append(label, original);
    verse.append(strip);
  }

  // Versdetaljen: grunntekst + ord for ord, og kryssreferanser.
  const detail = el('div', 'verse-detail');
  detail.id = `v${n}-detail`;
  detail.hidden = true;
  const tabs = el('div', 'vd-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', `${t('rd.verseDetails')} ${n}`);
  const panes = el('div', 'vd-panes');
  const tab = (name, label, active) => {
    const b = el('button', `vd-tab${active ? ' is-active' : ''}`, label);
    b.type = 'button';
    b.dataset.vdTab = name;
    tabs.append(b);
    const pane = el('div', `vd-pane${active ? ' is-active' : ''}`);
    pane.dataset.vdPane = name;
    pane.hidden = !active;
    panes.append(pane);
    return pane;
  };

  const origPane = tab('original', t('u.originalText'), true);
  if (original) {
    const full = el('div', `full-original-text ${hebrew ? 'hebrew' : 'greek'}`, original);
    full.dir = script.dir;
    full.lang = script.lang;
    origPane.append(full);
  }
  if (words.length > 0) {
    origPane.append(el('h3', 'vd-section-title', t('rd.wordByWord')));
    const list = el('div', `w4w-words${hebrew ? ' hebrew-words' : ''}`);
    list.dir = script.dir;
    list.lang = script.lang;
    const explain = el('div', 'w4w-explain');
    explain.hidden = true;
    const outWord = el('strong');
    const outPron = el('span', 'w4w-pron-inline');
    const outExpl = el('p');
    explain.append(outWord, outPron, outExpl);
    for (const w of words) {
      const b = el('button', 'w4w-word');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.append(el('span', 'w4w-script', w.word));
      if (w.pronunciation) b.append(el('span', 'w4w-translit', w.pronunciation));
      b.addEventListener('click', () => {
        const same = b.getAttribute('aria-pressed') === 'true';
        list.querySelectorAll('.w4w-word').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        if (same) {
          explain.hidden = true;
          return;
        }
        b.setAttribute('aria-pressed', 'true');
        outWord.textContent = w.word || '';
        outPron.textContent = w.pronunciation ? `(${w.pronunciation})` : '';
        outExpl.textContent = w.explanation || t('is.noExplanation');
        explain.hidden = false;
      });
      list.append(b);
    }
    origPane.append(list, explain);
  } else {
    origPane.append(el('p', 'text-muted', t('rd.noWordData')));
  }

  const refPane = tab('references', `${t('common.references')}${refs.length ? ` (${refs.length})` : ''}`, false);
  const refBox = el('div', 'vd-references');
  if (refs.length > 0) {
    for (const ref of refs) {
      const a = el('a', 'vd-reference');
      a.href = referenceHref(ref);
      a.append(el('span', 'vd-ref-link', referenceLabel(ref)));
      if (ref.description) a.append(el('span', 'vd-ref-description', templateText(ref.description)));
      refBox.append(a);
    }
  } else {
    refBox.append(el('p', 'text-muted', t('rd.noRefs')));
  }
  refPane.append(refBox);

  tabs.querySelectorAll('[data-vd-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      tabs.querySelectorAll('[data-vd-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
      panes.querySelectorAll('[data-vd-pane]').forEach((p) => {
        const active = p.dataset.vdPane === b.dataset.vdTab;
        p.hidden = !active;
        p.classList.toggle('is-active', active);
      });
    });
  });
  detail.append(tabs, panes);
  verse.append(detail);

  // Én åpen om gangen, som på lesesiden.
  num.addEventListener('click', () => {
    const open = detail.hidden;
    document.querySelectorAll('.verse-detail:not([hidden])').forEach((d) => {
      d.hidden = true;
      d.closest('.verse')?.querySelector('.verse-number')?.setAttribute('aria-expanded', 'false');
    });
    detail.hidden = !open;
    num.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  return verse;
}

// ── Kapittelet ───────────────────────────────────────────────────────

async function renderChapter(book, chapter) {
  const picked = await pickChapter(book, chapter);
  root.textContent = '';

  const crumbs = el('p', 'offline-crumbs');
  const home = el('a', '', t('foot.home'));
  home.href = localeHref('/');
  crumbs.append(home, ` / ${book.name} ${chapter} (offline)`);
  root.append(crumbs);

  const header = el('header', 'chapter-header');
  const h1 = el('h1', 'chapter-title');
  h1.append(el('span', 'chapter-book', book.name), el('span', 'chapter-number', t('is.chapterN', { n: chapter })));
  header.append(h1);
  root.append(header);

  if (!picked) {
    root.append(el('p', 'user-note', t('is.chapterNotDownloaded')));
    await renderIndex(false);
    return;
  }
  const { wanted, text, study } = picked;
  if (text.bible !== wanted && !String(text.bible).startsWith('user:')) {
    root.append(el('p', 'user-note', t('is.offlineEditionFallback', { wanted: editionLabel(wanted), shown: editionLabel(text.bible) })));
  }

  const rail = el('div', 'chapter-rail');
  if ((study.originalVerses || []).length > 0) {
    const toggle = el('button', 'rail-chip', t('u.originalText'));
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      const on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(on));
      toggle.classList.toggle('is-on', on);
      document.querySelectorAll('[data-original-strip]').forEach((s) => (s.hidden = !on));
    });
    rail.append(toggle);
  }
  const navChip = (label, target) => {
    const a = el('a', 'rail-chip', label);
    a.href = chapterHref(book, target);
    rail.append(a);
  };
  if (chapter > 1) navChip(`← ${t('rd.prevChapter')}`, chapter - 1);
  if (chapter < book.chapters) navChip(`${t('rd.nextChapter')} →`, chapter + 1);
  root.append(rail);

  const insight = insightPanel(study.insight);
  if (insight) root.append(insight);

  // Sammendragsblokka fra studiepanelet. På nett står den i sidekolonnen; her
  // er det én spalte, så den kommer før versene.
  const summaries = [
    study.summary && summaryItem(`${t('common.chapter')} ${chapter}`, study.summary),
    study.bookSummary && summaryItem(`${t('rd.aboutBook')} ${book.name}`, study.bookSummary),
    study.context && summaryItem(t('rd.historicalContext'), study.context),
  ].filter(Boolean);
  if (summaries.length > 0) {
    const panel = el('div', 'study-panel offline-study');
    const block = el('details', 'st-block');
    block.open = true;
    const head = el('summary', 'st-block-head');
    head.append(el('span', 'st-block-title', t('rd.summary')), el('span', 'st-block-count', String(summaries.length)));
    const body = el('div', 'st-block-body');
    body.append(...summaries);
    block.append(head, body);
    panel.append(block);
    root.append(panel);
  }

  const verses = el('section', 'verses');
  for (const v of text.verses || []) verses.append(verseBlock(v, study, book));
  root.append(verses);

  const footer = el('footer', 'chapter-footer');
  const nav = el('div', 'nav-buttons');
  const navButton = (label, target) => {
    const a = el('a', 'nav-button', label);
    a.href = chapterHref(book, target);
    nav.append(a);
  };
  if (chapter > 1) navButton(`← ${book.name} ${chapter - 1}`, chapter - 1);
  if (chapter < book.chapters) navButton(`${book.name} ${chapter + 1} →`, chapter + 1);
  footer.append(nav);
  root.append(footer);
  root.append(el('p', 'user-note', t('is.offlineNotice')));

  // Lenken pekte på et vers (`#v14`): rull dit når det finnes.
  const target = location.hash ? document.getElementById(location.hash.slice(1).split('-')[0]) : null;
  target?.scrollIntoView();
}

async function renderIndex(withHeading = true) {
  const keys = (await getAllChapterKeys()).filter(([, , bible]) => !String(bible).startsWith('user:'));
  if (withHeading) {
    root.textContent = '';
    root.append(el('h1', '', t('is.youAreOffline')));
  }
  if (keys.length === 0) {
    root.append(el('p', 'user-note', t('is.nothingDownloadedYet')));
    return;
  }
  root.append(el('p', '', t('is.chaptersAvailableOffline', { n: await countChapters() })));
  const downloaded = new Set(keys.map(([bookId]) => bookId));
  const list = el('div', 'offline-book-list');
  for (const book of BOOKS) {
    if (!downloaded.has(book.id)) continue;
    const link = el('a', 'offline-book-link', book.name);
    link.href = localeHref(`/${book.slug}/1`);
    list.append(link);
  }
  root.append(list);
}

try {
  const resolved = resolvePath();
  if (resolved.kind === 'chapter') await renderChapter(resolved.book, resolved.chapter);
  else await renderIndex();
} catch {
  root.textContent = '';
  root.append(el('h1', '', t('is.youAreOffline')), el('p', 'user-note', t('is.couldNotReadOffline')));
}
