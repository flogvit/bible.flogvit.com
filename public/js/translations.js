// Oversettelser-øy (#14): opplasting/parsing/import av egne bibler til
// IndexedDB, liste + sletting, og sync mot kontoen når man er innlogget
// (POST /api/sync/user-bibles + user-bible-chapters — endepunktene fantes på
// serveren i gamle appen, men klienten var aldri koblet på; det gjøres her).

import { parseBibleText } from './bible-text-parser.js';
import {
  addUserBible,
  getUserBibles,
  getAllUserBibles,
  deleteUserBible,
  storeChapters,
  getAllChapterKeys,
  getChapter,
} from './offline-db.js';

const $ = (sel) => document.querySelector(sel);
const listBox = $('[data-trans-list]');
if (listBox) init();

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Skylagring av egne bibler («husking») krever FLOGVIT.plus — fv-auth=2.
function hasPlus() {
  try {
    return /(?:^|;\s*)fv-auth=2/.test(document.cookie);
  } catch {
    return false;
  }
}

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
      el('span', 'user-note', ` ${totalVerses} vers · nummerering: ${bible.mappingId} · lastet opp ${new Date(bible.uploadedAt).toLocaleDateString('nb-NO')}`),
    );
    const del = el('button', 'user-btn-ghost', 'Slett');
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

// ── Sync mot konto ───────────────────────────────────────────────────
async function pushMetadata() {
  const all = await getAllUserBibles();
  const bibles = all.map((b) => ({
    id: b.id,
    name: b.name,
    mappingId: b.mappingId,
    verseCounts: b.verseCounts ?? null,
    uploadedAt: b.uploadedAt,
    deleted: !!b.deleted,
  }));
  const res = await fetch('/api/sync/user-bibles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bibles }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function pushChapters(bibleId) {
  const keys = (await getAllChapterKeys()).filter(([, , bible]) => bible === bibleId);
  for (let i = 0; i < keys.length; i += 100) {
    const batch = await Promise.all(
      keys.slice(i, i + 100).map(async ([bookId, chapter]) => {
        const stored = await getChapter(bookId, chapter, bibleId);
        return { bookId, chapter, data: stored };
      }),
    );
    const res = await fetch(`/api/sync/user-bible-chapters/${encodeURIComponent(bibleId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chapters: batch }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}

/** Hent bibler som finnes på kontoen, men ikke lokalt. */
async function pullFromAccount() {
  const server = await pushMetadata(); // sender lokale + får full serverliste
  const local = new Map((await getUserBibles()).map((b) => [b.id, b]));
  for (const bible of server.bibles || []) {
    if (bible.deleted || local.has(bible.id)) continue;
    const res = await fetch(`/api/sync/user-bible-chapters/${encodeURIComponent(bible.id)}`);
    if (!res.ok) continue;
    const { chapters } = await res.json();
    await storeChapters((chapters || []).map((ch) => ch.data).filter(Boolean));
    await addUserBible({
      id: bible.id,
      name: bible.name,
      mappingId: bible.mappingId,
      verseCounts: bible.verseCounts ?? null,
      uploadedAt: Number(bible.uploadedAt) || Date.now(),
    });
  }
  renderList();
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
    select.append(el('option', '', 'Kunne ikke laste nummereringer'));
  }
}

async function handleParse() {
  const result = $('[data-trans-result]');
  const text = $('[data-trans-text]').value;
  const mappingId = $('[data-trans-mapping]').value;
  result.hidden = false;
  result.textContent = '';
  if (!text.trim()) {
    result.append(el('p', 'trans-error', 'Ingen tekst å analysere — velg fil eller lim inn.'));
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
      result.append(el('p', 'trans-error', 'Fant ingen vers — sjekk at linjene har formatet «Boknavn kapittel,vers tekst».'));
      return;
    }
    result.append(
      el('p', '', `Fant ${parsed.stats.verses} vers i ${parsed.stats.chapters} kapitler fra ${parsed.stats.books} bøker.`),
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
    result.append(el('p', 'trans-error', 'Analysen feilet — prøv igjen.'));
  }
}

async function handleImport() {
  if (!parsed) return;
  if (!window.fvPlus?.gate('egne oversettelser')) return;
  const progress = $('[data-trans-progress]');
  const fill = $('[data-trans-fill]');
  const result = $('[data-trans-result]');
  const name = $('[data-trans-name]').value.trim() || 'Egen oversettelse';
  progress.hidden = false;
  const { chapters, bibleId, mappingId } = parsed;
  for (let i = 0; i < chapters.length; i += 100) {
    await storeChapters(chapters.slice(i, i + 100));
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
  result.append(el('p', '', `«${name}» er importert og kan velges som oversettelse på lesesidene.`));
  renderList();
  if (hasPlus()) {
    result.append(el('p', 'user-note', 'Laster opp til kontoen din…'));
    try {
      await pushMetadata();
      await pushChapters(bibleId);
      result.lastChild.textContent = 'Synkronisert til kontoen din.';
    } catch {
      result.lastChild.textContent = 'Kunne ikke synkronisere til kontoen nå — den ligger lokalt.';
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
  if (hasPlus()) pullFromAccount().catch(() => {});
}
