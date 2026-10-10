// Oversettelser-øy (#14): opplasting/parsing/import av egne bibler til
// IndexedDB, liste + sletting, og sync mot kontoen når man er innlogget
// (POST /api/sync/user-bibles + user-bible-chapters). Selve synken bor i
// user-bibles-sync.js, fordi lesesiden må kjøre den samme (#134).

import { parseBibleText } from './bible-text-parser.js';
import { addUserBible, getUserBibles, deleteUserBible, putAll } from './offline-db.js';
import { pushMetadata, pushChapters, syncUserBibles } from './user-bibles-sync.js';
import { readStrings, intlLocale } from './locale.js';
import { el } from './dom.js';
import { hasPlus } from './fv-auth.js';

const t = readStrings(document.body);

const $ = (sel) => document.querySelector(sel);
const listBox = $('[data-trans-list]');
if (listBox) init();

// ── Liste ────────────────────────────────────────────────────────────
async function renderList() {
  const bibles = await getUserBibles();
  listBox.textContent = '';
  $('[data-trans-empty]').hidden = bibles.length > 0;
  for (const bible of bibles) {
    const row = el('div', 'trans-row');
    const info = el('div', 'trans-row-info');
    info.append(el('strong', '', bible.name));
    const totalVerses = Object.values(bible.verseCounts || {}).reduce((a, b) => a + b, 0);
    info.append(
      el('span', 'user-note', ` ${t('is.uploadedMeta', {
        verses: totalVerses,
        mapping: bible.mappingId,
        when: new Date(bible.uploadedAt).toLocaleDateString(intlLocale()),
      })}`),
    );
    const del = el('button', 'user-btn-ghost', t('is.delete'));
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm(`Slette «${bible.name}»?`)) return;
      await deleteUserBible(bible.id);
      if (hasPlus()) pushMetadata().catch(() => {});
      renderList();
    });
    row.append(info, del);
    listBox.append(row);
  }
}

// ── Opplasting ───────────────────────────────────────────────────────
let parsed = null;

async function loadMappings() {
  const select = $('[data-trans-mapping]');
  try {
    const res = await fetch('/api/mappings/kvn');
    const data = await res.json();
    for (const m of data.mappings || []) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.displayName || m.name;
      select.append(opt);
    }
    select.addEventListener('change', () => {
      const name = $('[data-trans-name]');
      if (!name.value) name.value = select.selectedOptions[0]?.textContent || '';
    });
  } catch {
    select.append(el('option', '', t('is.numberingsFailed')));
  }
}

async function handleParse() {
  const result = $('[data-trans-result]');
  const text = $('[data-trans-text]').value;
  const mappingId = $('[data-trans-mapping]').value;
  result.hidden = false;
  result.textContent = '';
  if (!text.trim()) {
    result.append(el('p', 'trans-error', t('is.noTextToParse')));
    return;
  }
  try {
    const mapRes = await fetch(`/api/mappings/kvn/${encodeURIComponent(mappingId)}`);
    if (!mapRes.ok) throw new Error('mapping');
    const mapping = await mapRes.json();
    const bibleId = `user:${crypto.randomUUID()}`;
    parsed = { ...parseBibleText(text, mapping.bookNames || {}, bibleId), bibleId, mappingId };
    if (parsed.stats.verses === 0) {
      parsed = null;
      result.append(el('p', 'trans-error', t('is.noVersesFound')));
      return;
    }
    result.append(
      el('p', '', t('is.parsedSummary', {
        verses: parsed.stats.verses, chapters: parsed.stats.chapters, books: parsed.stats.books,
      })),
    );
    if (parsed.warnings.length > 0) {
      const details = el('details', 'trans-warnings');
      details.append(el('summary', '', `${parsed.warnings.length} advarsler`));
      const ul = el('ul');
      for (const w of parsed.warnings) ul.append(el('li', '', w));
      details.append(ul);
      result.append(details);
    }
    $('[data-trans-import]').hidden = false;
  } catch {
    result.append(el('p', 'trans-error', t('is.parseFailed')));
  }
}

async function handleImport() {
  if (!parsed) return;
  if (!window.fvPlus?.gate(t('is.ownTranslations'))) return;
  const progress = $('[data-trans-progress]');
  const fill = $('[data-trans-fill]');
  const result = $('[data-trans-result]');
  const name = $('[data-trans-name]').value.trim() || t('is.ownTranslation');
  progress.hidden = false;
  const { chapters, bibleId, mappingId } = parsed;
  for (let i = 0; i < chapters.length; i += 100) {
    await putAll('chapters', chapters.slice(i, i + 100));
    fill.style.width = `${Math.round(((i + 100) / chapters.length) * 100)}%`;
  }
  const verseCounts = {};
  for (const ch of chapters) verseCounts[ch.bookId] = (verseCounts[ch.bookId] || 0) + ch.verses.length;
  await addUserBible({ id: bibleId, name, mappingId, verseCounts, uploadedAt: Date.now() });
  parsed = null;
  $('[data-trans-import]').hidden = true;
  $('[data-trans-text]').value = '';
  progress.hidden = true;
  fill.style.width = '0';
  result.textContent = '';
  result.append(el('p', '', t('is.importedTranslation', { name })));
  renderList();
  if (hasPlus()) {
    result.append(el('p', 'user-note', t('is.uploadingToAccount')));
    try {
      await pushMetadata();
      await pushChapters(bibleId);
      await addUserBible({ id: bibleId, name, mappingId, verseCounts, uploadedAt: Date.now(), syncedAt: Date.now() });
      result.lastChild.textContent = t('is.syncedToAccount');
    } catch {
      result.lastChild.textContent = t('is.uploadFailedRetry');
    }
  }
}

function init() {
  renderList();
  loadMappings();
  $('[data-trans-file]')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    $('[data-trans-filename]').textContent = file.name;
    $('[data-trans-text]').value = await file.text();
    const name = $('[data-trans-name]');
    if (!name.value) name.value = file.name.replace(/\.(txt|text)$/i, '');
  });
  $('[data-trans-parse]')?.addEventListener('click', handleParse);
  $('[data-trans-import]')?.addEventListener('click', handleImport);
  if (hasPlus()) syncUserBibles().then(renderList, () => {});
}
