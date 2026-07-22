// Delt IndexedDB-lag for offline-innhold og egne oversettelser (#14).
// Samme databasenavn/skjema som gamle appen (bibel-offline v4): chapters er
// keyet på [bookId, chapter, bible] slik at innebygde og egne bibler
// ('user:<uuid>') bor i samme store.

const DB_NAME = 'bibel-offline';
const DB_VERSION = 4;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const has = (name) => db.objectStoreNames.contains(name);
      if (!has('userData')) db.createObjectStore('userData', { keyPath: 'key' });
      if (!has('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!has('chapters')) {
        const st = db.createObjectStore('chapters', { keyPath: ['bookId', 'chapter', 'bible'] });
        st.createIndex('by-book', 'bookId');
        st.createIndex('by-bible', 'bible');
      }
      if (!has('references')) {
        const st = db.createObjectStore('references', { keyPath: ['bookId', 'chapter', 'verse'] });
        st.createIndex('by-book-chapter', ['bookId', 'chapter']);
      }
      if (!has('readingPlans')) db.createObjectStore('readingPlans', { keyPath: 'id' });
      if (!has('cacheMetadata')) db.createObjectStore('cacheMetadata', { keyPath: 'key' });
      if (!has('timeline')) db.createObjectStore('timeline');
      if (!has('prophecies')) db.createObjectStore('prophecies');
      if (!has('persons')) db.createObjectStore('persons', { keyPath: 'id' });
      if (!has('syncState')) db.createObjectStore('syncState');
      if (!has('userBibles')) db.createObjectStore('userBibles', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Kapitler ─────────────────────────────────────────────────────────
export async function storeChapter(chapterData) {
  const db = await openDb();
  return tx(db, 'chapters', 'readwrite', (st) => st.put(chapterData));
}

export async function storeChapters(list) {
  const db = await openDb();
  return tx(db, 'chapters', 'readwrite', (st) => {
    for (const ch of list) st.put(ch);
  });
}

export async function getChapter(bookId, chapter, bible) {
  const db = await openDb();
  return reqToPromise(db.transaction('chapters').objectStore('chapters').get([bookId, chapter, bible]));
}

export async function getAllChapterKeys() {
  const db = await openDb();
  return reqToPromise(db.transaction('chapters').objectStore('chapters').getAllKeys());
}

export async function countChapters(bible) {
  const db = await openDb();
  const st = db.transaction('chapters').objectStore('chapters');
  if (!bible) return reqToPromise(st.count());
  return reqToPromise(st.index('by-bible').count(bible));
}

export async function deleteChaptersByBible(bible) {
  const db = await openDb();
  const keys = await reqToPromise(
    db.transaction('chapters').objectStore('chapters').index('by-bible').getAllKeys(bible),
  );
  return tx(db, 'chapters', 'readwrite', (st) => {
    for (const key of keys) st.delete(key);
  });
}

export async function deleteAllChapters() {
  const db = await openDb();
  return tx(db, 'chapters', 'readwrite', (st) => st.clear());
}

// ── Bøker og støttedata ──────────────────────────────────────────────
export async function storeBooks(books) {
  const db = await openDb();
  return tx(db, 'books', 'readwrite', (st) => {
    for (const b of books) st.put(b);
  });
}

export async function getBooks() {
  const db = await openDb();
  return reqToPromise(db.transaction('books').objectStore('books').getAll());
}

/** timeline/prophecies lagres out-of-line under nøkkelen 'data'. */
export async function putBlob(store, value) {
  const db = await openDb();
  return tx(db, store, 'readwrite', (st) => st.put(value, 'data'));
}

export async function getBlob(store) {
  const db = await openDb();
  return reqToPromise(db.transaction(store).objectStore(store).get('data'));
}

export async function putAll(store, rows) {
  const db = await openDb();
  return tx(db, store, 'readwrite', (st) => {
    for (const row of rows) st.put(row);
  });
}

export async function getAll(store) {
  const db = await openDb();
  return reqToPromise(db.transaction(store).objectStore(store).getAll());
}

export async function clearStore(store) {
  const db = await openDb();
  return tx(db, store, 'readwrite', (st) => st.clear());
}

// ── Metadata ─────────────────────────────────────────────────────────
export async function setMeta(key, value) {
  const db = await openDb();
  return tx(db, 'cacheMetadata', 'readwrite', (st) => st.put({ key, value }));
}

export async function getMeta(key) {
  const db = await openDb();
  const row = await reqToPromise(db.transaction('cacheMetadata').objectStore('cacheMetadata').get(key));
  return row ? row.value : undefined;
}

// ── Egne oversettelser ───────────────────────────────────────────────
export async function addUserBible(meta) {
  const db = await openDb();
  return tx(db, 'userBibles', 'readwrite', (st) => st.put(meta));
}

export async function getUserBibles() {
  return (await getAllUserBibles()).filter((b) => !b.deleted);
}

/** Inkluderer slettede (tombstones) — brukes av sync. */
export async function getAllUserBibles() {
  const db = await openDb();
  return reqToPromise(db.transaction('userBibles').objectStore('userBibles').getAll());
}

export async function deleteUserBible(id) {
  const db = await openDb();
  // Behold metadata som tombstone (deleted) så sync kan fjerne på serveren.
  const st = db.transaction('userBibles', 'readwrite').objectStore('userBibles');
  const existing = await reqToPromise(st.get(id));
  if (existing) {
    existing.deleted = true;
    existing.uploadedAt = Date.now();
    await reqToPromise(st.put(existing));
  }
  await deleteChaptersByBible(id);
}

// ── Full sletting ────────────────────────────────────────────────────
export function deleteDatabase() {
  dbPromise = null;
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}
