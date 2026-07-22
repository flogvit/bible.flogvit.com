// Sync-klient (#12) — global øy mot /api/sync (konto-innlogget; 401 = hopp
// over, alt fungerer lokalt). Samme protokoll og dataTypes som gamle
// syncService/changeTracker: singletons (settings/topics/activePlan/
// readingPosition/verseVersions), per-item (favorites/notes/verseLists/
// devotionals) og per-plan (planProgress). Endringer fanges ved å patche
// localStorage.setItem for bibel-nøklene; slettinger oppdages mot et
// skygge-snapshot av sist synkede itemId-er.

const DEVICE_KEY = 'bible-device-id';
const LAST_SYNC_KEY = 'bible-last-sync';
const PENDING_KEY = 'bible-sync-pending';
const SHADOW_KEY = 'bible-sync-shadow';

const MAP = {
  'bible-settings': { type: 'settings', kind: 'singleton' },
  'bible-topics': { type: 'topics', kind: 'singleton' },
  'activeReadingPlan': { type: 'activePlan', kind: 'singleton' },
  'bible-reading-position': { type: 'readingPosition', kind: 'singleton' },
  'bible-verse-versions': { type: 'verseVersions', kind: 'singleton' },
  'readingPlanProgress': { type: 'planProgress', kind: 'record' },
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
          else cur[ch.itemId] = ch.data;
        }
        writeRaw(key, cur);
      } else {
        const cur = read(key, []);
        const arr = Array.isArray(cur) ? cur : [];
        for (const ch of list) {
          const idx = arr.findIndex((i) => String(spec.id(i)) === ch.itemId);
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

// Serveren setter fv-auth=1 (ikke-HttpOnly markør) når man er innlogget —
// uten den dropper vi API-kallet helt i stedet for å provosere en 401 i
// konsollen på hver sidelast. 401-håndteringen under står som fallback for
// en foreldet markør (utlogget i en annen fane/på konto).
function hasAuthMarker() {
  try {
    return /(?:^|;\s*)fv-auth=1/.test(document.cookie);
  } catch {
    return false;
  }
}

async function syncNow() {
  if (loggedOut || syncing || !hasAuthMarker()) return;
  syncing = true;
  try {
    const lastSyncAt = read(LAST_SYNC_KEY, 0);
    let pending = read(PENDING_KEY, []);
    if (!lastSyncAt) pending = Object.keys(MAP); // førstegangs: push alt
    const changes = buildChanges(pending);
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, lastSyncAt, changes }),
    });
    if (res.status === 401) {
      loggedOut = true;
      try {
        sessionStorage.setItem('bible-sync-401', '1');
      } catch {}
      return;
    }
    if (!res.ok) return; // prøver igjen ved neste endring/last
    const result = await res.json();
    if (Array.isArray(result.changes) && result.changes.length > 0) {
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
  timer = setTimeout(syncNow, 3000);
}

// Ved last: synk (pull + ev. pending push). Ved skjuling: flush.
setTimeout(syncNow, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && read(PENDING_KEY, []).length > 0) syncNow();
});
