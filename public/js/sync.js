// Sync-klient — SERVER-FØRST husking (Vegards modell 2026-07-22): serveren
// er sannhetskilden. Ved sidelast gjøres ett kall som pusher utboksen
// (uflushede lokale endringer, typisk fra offline) OG henter full servertilstand
// (lastSyncAt=0); serveren anvender push før pull med last-write-wins per item,
// så en les kan aldri overskrive offline-endringer. Lokal lagring er cache +
// utboks. Endringer underveis pushes i bakgrunnen umiddelbart (250 ms
// koalesering) — UI-et oppdateres optimistisk lokalt først, så alt føles raskt.
// Samme protokoll og dataTypes som gamle syncService/changeTracker.

const DEVICE_KEY = 'bible-device-id';
const LAST_SYNC_KEY = 'bible-last-sync';
const PENDING_KEY = 'bible-sync-pending';
const SHADOW_KEY = 'bible-sync-shadow';

import { mergeProgress } from './reading-progress.js';

// `merge` settes på typer der nyeste-vinner er feil: framdrift skal aldri
// kunne slettes av en enhet som lå bakpå. Serveren bruker samme funksjon.
const MAP = {
  'bible-settings': { type: 'settings', kind: 'singleton' },
  'bible-topics': { type: 'topics', kind: 'singleton' },
  'activeReadingPlan': { type: 'activePlan', kind: 'singleton' },
  'bible-reading-position': { type: 'readingPosition', kind: 'singleton' },
  'bible-verse-versions': { type: 'verseVersions', kind: 'singleton' },
  'readingPlanProgress': { type: 'planProgress', kind: 'record' },
  'bible-reading-progress': { type: 'readingProgress', kind: 'record', merge: mergeProgress },
  'bible-favorites': { type: 'favorites', kind: 'items', id: (f) => `${f.bookId}-${f.chapter}-${f.verse}`, at: (f) => f.addedAt },
  'bible-notes': { type: 'notes', kind: 'items', id: (n) => n.id, at: (n) => n.updatedAt },
  'bible-verse-lists': { type: 'verseLists', kind: 'items', id: (l) => l.id, at: (l) => l.updatedAt },
  'bible-devotionals': { type: 'devotionals', kind: 'items', id: (d) => d.id, at: (d) => d.updatedAt },
};
const TYPE_TO_KEY = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [v.type, k]));

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
let applying = false;
const rawSetItem = localStorage.setItem.bind(localStorage);
function writeRaw(key, value) {
  try {
    rawSetItem(key, JSON.stringify(value));
  } catch {}
}

// ── Endringsfangst: patch setItem, husk pending på tvers av sidelastinger ─
function markPending(key) {
  const pending = new Set(read(PENDING_KEY, []));
  if (!pending.has(key)) {
    pending.add(key);
    writeRaw(PENDING_KEY, [...pending]);
  }
  scheduleSync();
}
try {
  localStorage.setItem = function (key, value) {
    rawSetItem(key, value);
    if (!applying && key in MAP) markPending(key);
  };
} catch {}

// ── Bygg changes fra pending nøkler ────────────────────────────────
function buildChanges(pendingKeys) {
  const changes = [];
  const shadow = read(SHADOW_KEY, {});
  const now = Date.now();
  for (const key of pendingKeys) {
    const spec = MAP[key];
    if (!spec) continue;
    const data = read(key, null);
    if (spec.kind === 'singleton') {
      changes.push({ dataType: spec.type, itemId: '_singleton', data, updatedAt: now });
    } else if (spec.kind === 'record') {
      for (const [id, value] of Object.entries(data || {})) {
        changes.push({ dataType: spec.type, itemId: id, data: value, updatedAt: now });
      }
    } else {
      const items = Array.isArray(data) ? data : [];
      const seen = new Set();
      for (const item of items) {
        const id = spec.id(item);
        if (id == null) continue;
        seen.add(String(id));
        changes.push({ dataType: spec.type, itemId: String(id), data: item, updatedAt: spec.at(item) || now });
      }
      for (const oldId of shadow[spec.type] || []) {
        if (!seen.has(oldId)) {
          changes.push({ dataType: spec.type, itemId: oldId, data: null, updatedAt: now, deleted: true });
        }
      }
    }
  }
  return changes;
}

function updateShadow() {
  const shadow = {};
  for (const [key, spec] of Object.entries(MAP)) {
    if (spec.kind !== 'items') continue;
    const items = read(key, []);
    shadow[spec.type] = (Array.isArray(items) ? items : []).map((i) => String(spec.id(i))).filter((x) => x !== 'undefined');
  }
  writeRaw(SHADOW_KEY, shadow);
}

// ── Anvend serverendringer ─────────────────────────────────────────
function applyServerChanges(changes) {
  const byType = new Map();
  for (const ch of changes) {
    if (!byType.has(ch.dataType)) byType.set(ch.dataType, []);
    byType.get(ch.dataType).push(ch);
  }
  applying = true;
  try {
    for (const [type, list] of byType) {
      const key = TYPE_TO_KEY[type];
      const spec = key && MAP[key];
      if (!spec) continue;
      if (spec.kind === 'singleton') {
        const ch = list[list.length - 1];
        if (ch.deleted || ch.data == null) localStorage.removeItem(key);
        else writeRaw(key, ch.data);
      } else if (spec.kind === 'record') {
        const cur = read(key, {}) || {};
        for (const ch of list) {
          if (ch.deleted) delete cur[ch.itemId];
          // Framdrift flettes også lokalt: uten dette ville serversvaret
          // overskrive en lesing som skjedde mens kallet var underveis.
          else cur[ch.itemId] = spec.merge ? spec.merge(cur[ch.itemId], ch.data) : ch.data;
        }
        writeRaw(key, cur);
      } else {
        const cur = read(key, []);
        const arr = Array.isArray(cur) ? cur : [];
        for (const ch of list) {
          const idx = arr.findIndex((i) => String(spec.id(i)) === ch.itemId);
          // Ikke overskriv en lokal endring som er nyere enn serverversjonen
          // (kan skje for redigeringer gjort mens et synkkall var underveis).
          if (idx >= 0 && !ch.deleted && (spec.at(arr[idx]) || 0) > ch.updatedAt) continue;
          if (ch.deleted) {
            if (idx >= 0) arr.splice(idx, 1);
          } else if (idx >= 0) arr[idx] = ch.data;
          else arr.push(ch.data);
        }
        writeRaw(key, arr);
      }
    }
  } finally {
    applying = false;
  }
}

// ── Selve synken ───────────────────────────────────────────────────
let deviceId = read(DEVICE_KEY, null);
if (!deviceId) {
  deviceId = `web-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  writeRaw(DEVICE_KEY, deviceId);
}

// Husk utlogget-status for økten (som chrome.js: 401 = helt normalt).
let loggedOut = false;
try {
  loggedOut = sessionStorage.getItem('bible-sync-401') === '1';
} catch {}
let syncing = false;
let timer = null;

function setStatus(text) {
  const box = document.querySelector('[data-sync-status]');
  if (box && text) box.textContent = text;
}

// Serveren setter fv-auth (ikke-HttpOnly markør): '1' = innlogget, '2' =
// innlogget med FLOGVIT.plus. Husking (sync) krever plus, så uten '2' dropper
// vi API-kallet helt i stedet for å provosere 401/402 i konsollen på hver
// sidelast. Statuskode-håndteringen under står som fallback for en foreldet
// markør (utlogget/plus utløpt i en annen fane).
function hasPlusMarker() {
  try {
    return /(?:^|;\s*)fv-auth=2/.test(document.cookie);
  } catch {
    return false;
  }
}

async function syncNow(full) {
  if (loggedOut || syncing || !hasPlusMarker()) return;
  syncing = true;
  try {
    // Full sync (sidelast): server er sannhetskilden — les alt (lastSyncAt=0)
    // og push utboksen i SAMME kall, så offline-endringer aldri overskrives.
    const lastSyncAt = full ? 0 : read(LAST_SYNC_KEY, 0);
    let pending = read(PENDING_KEY, []);
    if (full && !read(LAST_SYNC_KEY, 0)) pending = Object.keys(MAP); // helt førstegangs: push alt lokalt
    const changes = buildChanges(pending);
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, lastSyncAt, changes }),
    });
    if (res.status === 401 || res.status === 402) {
      loggedOut = true;
      try {
        sessionStorage.setItem('bible-sync-401', '1');
      } catch {}
      return;
    }
    if (!res.ok) return; // utboksen står — prøver igjen ved neste endring/online
    const result = await res.json();
    if (full) {
      rebuildFromServer(result.changes || [], changes);
    } else if (Array.isArray(result.changes) && result.changes.length > 0) {
      applyServerChanges(result.changes);
    }
    writeRaw(LAST_SYNC_KEY, result.syncedAt || Date.now());
    writeRaw(PENDING_KEY, []);
    updateShadow();
    setStatus(`Synkronisert ${new Date(result.syncedAt || Date.now()).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })} — endringer lagres til kontoen din.`);
  } catch {
    // nettverksfeil — stille, prøver igjen senere
  } finally {
    syncing = false;
  }
}

function scheduleSync() {
  if (loggedOut) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(false), 250);
}

// ── Server-tilstand → lokal kopi (full sync ved sidelast) ──────────
// Svaret inneholder alt på serveren UNNTATT det vi selv pushet i kallet
// (serveren ekskluderer dem) — de beholdes fra lokal kopi. Var serveren
// nyere enn en pushet endring, ligger serverversjonen i svaret og vinner.
function rebuildFromServer(serverChanges, pushedChanges) {
  const pushedIds = new Set(pushedChanges.map((ch) => `${ch.dataType}:${ch.itemId}`));
  const byType = new Map();
  for (const ch of serverChanges) {
    if (!byType.has(ch.dataType)) byType.set(ch.dataType, new Map());
    byType.get(ch.dataType).set(ch.itemId, ch);
  }
  applying = true;
  try {
    for (const [key, spec] of Object.entries(MAP)) {
      const serverItems = byType.get(spec.type) || new Map();
      if (spec.kind === 'singleton') {
        const ch = serverItems.get('_singleton');
        if (ch) {
          if (ch.deleted || ch.data == null) localStorage.removeItem(key);
          else writeRaw(key, ch.data);
        } else if (!pushedIds.has(`${spec.type}:_singleton`)) {
          localStorage.removeItem(key);
        }
      } else if (spec.kind === 'record') {
        const cur = read(key, {}) || {};
        const next = {};
        for (const [id, value] of Object.entries(cur)) {
          if (pushedIds.has(`${spec.type}:${id}`)) next[id] = value; // vår push beholdes
        }
        for (const [id, ch] of serverItems) {
          if (ch.deleted) delete next[id];
          else next[id] = spec.merge ? spec.merge(next[id], ch.data) : ch.data;
        }
        if (Object.keys(next).length > 0) writeRaw(key, next);
        else localStorage.removeItem(key);
      } else {
        const cur = read(key, []);
        const arr = (Array.isArray(cur) ? cur : []).filter((i) => pushedIds.has(`${spec.type}:${spec.id(i)}`));
        for (const [id, ch] of serverItems) {
          if (ch.deleted) continue;
          const idx = arr.findIndex((i) => String(spec.id(i)) === id);
          if (idx >= 0) arr[idx] = ch.data;
          else arr.push(ch.data);
        }
        writeRaw(key, arr);
      }
    }
  } finally {
    applying = false;
  }
  document.dispatchEvent(new CustomEvent('bibel:sync-rebuilt'));
}

// ── Omdøpte bibel-ID-er (2026-07-26) ───────────────────────────────
// free-bible omdøpte osnb2→osnb og osnn1→osnn. Serveren migrerer sin kopi
// (schema.ts), men den lokale cachen leses av lesesidene FØR første sync
// svarer — uten dette ville første sidelast bedt om en bibel som ikke finnes.
// Kjøres rått (writeRaw) fordi verdien ikke er en brukerendring som skal pushes.
const LEGACY_BIBLE_IDS = { osnb2: 'osnb', osnn1: 'osnn' };
(function migrateLegacyBibleIds() {
  const settings = read('bible-settings', null);
  if (!settings) return;
  let changed = false;
  for (const key of ['bible', 'secondaryBible', 'verseMapping']) {
    const next = LEGACY_BIBLE_IDS[settings[key]];
    if (next) {
      settings[key] = next;
      changed = true;
    }
  }
  if (Array.isArray(settings.hiddenBibles)) {
    const mapped = settings.hiddenBibles.map((id) => LEGACY_BIBLE_IDS[id] || id);
    if (mapped.some((id, i) => id !== settings.hiddenBibles[i])) {
      settings.hiddenBibles = mapped;
      changed = true;
    }
  }
  if (changed) writeRaw('bible-settings', settings);
})();

// Ved last: full server-først-sync (push utboks + les alt). Ved skjuling:
// flush utboksen. Når nettet kommer tilbake: flush med en gang.
setTimeout(() => syncNow(true), 300);
window.addEventListener('online', () => syncNow(false));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && read(PENDING_KEY, []).length > 0) syncNow(false);
});
