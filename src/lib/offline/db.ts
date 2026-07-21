import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Database version - increment when schema changes
const DB_VERSION = 4;
const DB_NAME = 'bibel-offline';
const DELETE_FLAG_KEY = 'bibel-offline-delete-pending';

// Promise that resolves when any pending deletion is complete
// All getOfflineDb() calls must wait for this
let deletionCompletePromise: Promise<void> | null = null;

// Check for pending deletion IMMEDIATELY when module loads (before any DB access)
if (typeof window !== 'undefined') {
  const pendingDeletion = localStorage.getItem(DELETE_FLAG_KEY);
  console.log('[DB] Module loaded, pending deletion flag:', pendingDeletion);

  if (pendingDeletion === 'true') {
    console.log('[DB] IMMEDIATE: Deleting database before any connections...');
    localStorage.removeItem(DELETE_FLAG_KEY);

    // Create a promise that all DB access will wait for
    deletionCompletePromise = new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => {
        console.log('[DB] IMMEDIATE: Database deleted successfully');
        resolve();
      };
      request.onerror = (e) => {
        console.error('[DB] IMMEDIATE: Database deletion error', e);
        resolve(); // Resolve anyway so app can continue
      };
      request.onblocked = () => {
        console.warn('[DB] IMMEDIATE: Database deletion blocked, waiting...');
        // Don't resolve yet - wait for onsuccess or onerror
      };
      // Timeout after 10 seconds
      setTimeout(() => {
        console.warn('[DB] IMMEDIATE: Database deletion timed out');
        resolve();
      }, 10000);
    });
  }
}

// Types for stored data
export interface StoredVerse {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
  bible: string;
  versions?: {
    text: string;
    explanation: string;
    type?: string;
    severity?: string;
  }[];
}

export interface StoredWord4Word {
  word_index: number;
  word: string;
  original: string | null;
  pronunciation: string | null;
  explanation: string | null;
}

export interface ChapterReference {
  to_book_id: number;
  to_chapter: number;
  to_verse_start: number;
  to_verse_end: number;
  description: string | null;
  book_short_name?: string;
}

export interface StoredChapter {
  bookId: number;
  chapter: number;
  bible: string;
  verses: StoredVerse[];
  originalVerses?: { verse: number; text: string }[];
  word4word?: Record<number, StoredWord4Word[]>; // verse number -> word4word data
  references?: Record<number, ChapterReference[]>; // verse number -> references
  bookSummary?: string | null;
  summary?: string | null;
  context?: string | null;
  insight?: unknown | null;
  cachedAt: number;
}

export interface StoredBook {
  id: number;
  name: string;
  name_no: string;
  short_name: string;
  testament: string;
  chapters: number;
}

export interface StoredReference {
  bookId: number;
  chapter: number;
  verse: number;
  references: {
    to_book_id: number;
    to_chapter: number;
    to_verse_start: number;
    to_verse_end: number;
    description: string | null;
    book_short_name?: string;
  }[];
}

export interface CacheMetadata {
  key: string;
  cachedAt: number;
  size?: number;
}

export interface ReadingPlanData {
  id: string;
  name: string;
  description: string;
  category: string;
  days: number;
  readings: {
    day: number;
    chapters: { bookId: number; chapter: number }[];
  }[];
}

// Timeline types
export interface StoredTimelinePeriod {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  sort_order: number;
}

export interface StoredTimelineReference {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  book_short_name?: string;
  book_name_no?: string;
}

export interface StoredTimelineEvent {
  id: string;
  title: string;
  description: string | null;
  year: number | null;
  year_display: string | null;
  period_id: string | null;
  importance: string;
  sort_order: number;
  references?: StoredTimelineReference[];
  period?: StoredTimelinePeriod;
}

export interface StoredTimelineData {
  periods: StoredTimelinePeriod[];
  events: StoredTimelineEvent[];
  cachedAt: number;
}

// Prophecy types
export interface StoredProphecyCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface StoredProphecyReference {
  book_id: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  book_short_name?: string;
  book_name_no?: string;
  reference?: string;
}

export interface StoredProphecy {
  id: string;
  category_id: string;
  title: string;
  explanation: string | null;
  prophecy: StoredProphecyReference;
  fulfillments: StoredProphecyReference[];
  category?: StoredProphecyCategory;
}

export interface StoredProphecyData {
  categories: StoredProphecyCategory[];
  prophecies: StoredProphecy[];
  cachedAt: number;
}

// Person types
export interface StoredPersonVerseRef {
  bookId: number;
  chapter: number;
  verse?: number;
  verses?: number[];
}

export interface StoredPersonKeyEvent {
  title: string;
  description: string;
  verses: StoredPersonVerseRef[];
}

export interface StoredPersonFamily {
  father?: string | null;
  mother?: string | null;
  siblings?: string[];
  spouse?: string | null;
  children?: string[];
}

export interface StoredPersonData {
  id: string;
  name: string;
  title: string;
  era: string;
  lifespan?: string;
  summary: string;
  roles: string[];
  family?: StoredPersonFamily;
  relatedPersons?: string[];
  keyEvents: StoredPersonKeyEvent[];
}

// User-uploaded bible translations
export interface StoredUserBible {
  id: string; // 'user:{uuid}'
  name: string;
  mappingId: string;
  uploadedAt: number;
  verseCounts?: { books: number; chapters: number; verses: number };
}

// Sync state for incremental updates
export interface SyncState {
  syncVersion: number;
  lastSyncedAt: string;
}

// IndexedDB Schema definition
interface BibelDBSchema extends DBSchema {
  userData: {
    key: string;
    value: {
      key: string;
      data: unknown;
      updatedAt: number;
    };
  };
  books: {
    key: number;
    value: StoredBook;
  };
  chapters: {
    key: [number, number, string]; // [bookId, chapter, bible]
    value: StoredChapter;
    indexes: {
      'by-book': number;
      'by-bible': string;
    };
  };
  references: {
    key: [number, number, number]; // [bookId, chapter, verse]
    value: StoredReference;
    indexes: {
      'by-book-chapter': [number, number];
    };
  };
  readingPlans: {
    key: string;
    value: ReadingPlanData;
  };
  cacheMetadata: {
    key: string;
    value: CacheMetadata;
  };
  // New stores for supporting data (version 2)
  timeline: {
    key: 'data';
    value: StoredTimelineData;
  };
  prophecies: {
    key: 'data';
    value: StoredProphecyData;
  };
  persons: {
    key: string;
    value: StoredPersonData;
  };
  // Version 3: Add syncState store for incremental sync
  syncState: {
    key: 'state';
    value: SyncState;
  };
  // Version 4: User-uploaded bible translations
  userBibles: {
    key: string;
    value: StoredUserBible;
  };
}

let dbPromise: Promise<IDBPDatabase<BibelDBSchema>> | null = null;

// Track if we've already executed pending deletion this session
let deletionChecked = false;
// Track in-progress deletion to prevent race conditions
let deletionInProgress: Promise<boolean> | null = null;

export async function getOfflineDb(): Promise<IDBPDatabase<BibelDBSchema>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available on server'));
  }

  // Wait for module-level deletion to complete first (if any)
  if (deletionCompletePromise) {
    console.log('[DB] Waiting for module-level deletion to complete...');
    await deletionCompletePromise;
    deletionCompletePromise = null;
    console.log('[DB] Module-level deletion complete, proceeding...');
  }

  // Wait for any in-progress deletion to complete
  if (deletionInProgress) {
    console.log('[DB] Waiting for in-progress deletion...');
    await deletionInProgress;
  }

  // Also check localStorage in case of HMR (module state persists but localStorage doesn't)
  if (checkPendingDeletion()) {
    console.log('[DB] Pending deletion found, executing...');

    // Close any existing connection first
    if (dbPromise) {
      try {
        const existingDb = await Promise.race([
          dbPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
        ]);
        if (existingDb) {
          console.log('[DB] Closing existing connection before deletion...');
          existingDb.close();
        }
      } catch {
        // Ignore errors
      }
      dbPromise = null;
    }

    deletionInProgress = executePendingDeletion().finally(() => {
      deletionInProgress = null;
    });
    await deletionInProgress;
    deletionChecked = true;
  }

  if (!dbPromise) {
    dbPromise = openDatabaseWithRetry();
  }

  return dbPromise;
}

// Separate function to handle database opening with retry logic
async function openDatabaseWithRetry(retryCount = 0): Promise<IDBPDatabase<BibelDBSchema>> {
  const MAX_RETRIES = 2;

  // Add timeout to prevent hanging forever if database is blocked
  const timeoutPromise = new Promise<IDBPDatabase<BibelDBSchema>>((_, reject) => {
    setTimeout(() => {
      reject(new Error('IndexedDB timeout'));
    }, 5000); // 5 second timeout
  });

  const openPromise = openDB<BibelDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      console.log(`[DB] Upgrading from version ${oldVersion} to ${DB_VERSION}`);
      // Handle migrations based on oldVersion
      if (oldVersion < 1) {
        // Create userData store
        db.createObjectStore('userData', { keyPath: 'key' });

        // Create books store
        db.createObjectStore('books', { keyPath: 'id' });

        // Create chapters store with compound key
        const chaptersStore = db.createObjectStore('chapters', {
          keyPath: ['bookId', 'chapter', 'bible'],
        });
        chaptersStore.createIndex('by-book', 'bookId');
        chaptersStore.createIndex('by-bible', 'bible');

        // Create references store
        const referencesStore = db.createObjectStore('references', {
          keyPath: ['bookId', 'chapter', 'verse'],
        });
        referencesStore.createIndex('by-book-chapter', ['bookId', 'chapter']);

        // Create reading plans store
        db.createObjectStore('readingPlans', { keyPath: 'id' });

        // Create cache metadata store
        db.createObjectStore('cacheMetadata', { keyPath: 'key' });
      }

      // Version 2: Add stores for timeline, prophecies, persons
      if (oldVersion < 2) {
        // Create timeline store (single entry with all data)
        db.createObjectStore('timeline');

        // Create prophecies store (single entry with all data)
        db.createObjectStore('prophecies');

        // Create persons store (one entry per person)
        db.createObjectStore('persons', { keyPath: 'id' });
      }

      // Version 3: Add syncState store for incremental sync
      if (oldVersion < 3) {
        // Create syncState store (single entry with sync version)
        db.createObjectStore('syncState');
      }

      // Version 4: User-uploaded bible translations
      if (oldVersion < 4) {
        db.createObjectStore('userBibles', { keyPath: 'id' });
      }
    },
    blocked() {
      console.warn('[DB] Database blocked - another connection has an older version');
    },
    blocking(currentVersion, blockedVersion, event) {
      console.warn('[DB] This connection is blocking another - closing');
      const db = event.target as IDBDatabase | null;
      db?.close();
      dbPromise = null;
    },
    terminated() {
      console.error('[DB] Connection terminated unexpectedly');
      dbPromise = null;
    },
  });

  try {
    return await Promise.race([openPromise, timeoutPromise]);
  } catch (error) {
    dbPromise = null; // Reset for retry

    if (retryCount < MAX_RETRIES) {
      console.warn(`[DB] Connection failed, attempting recovery (retry ${retryCount + 1}/${MAX_RETRIES})...`);

      // Try to delete the database and start fresh
      await new Promise<void>((resolve) => {
        console.log('[DB] Deleting database for recovery...');
        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
        deleteRequest.onsuccess = () => {
          console.log('[DB] Database deleted for recovery');
          resolve();
        };
        deleteRequest.onerror = () => {
          console.error('[DB] Failed to delete database for recovery');
          resolve();
        };
        deleteRequest.onblocked = () => {
          console.warn('[DB] Database deletion blocked during recovery');
        };
        // Timeout for deletion
        setTimeout(resolve, 3000);
      });

      // Retry opening
      return openDatabaseWithRetry(retryCount + 1);
    }

    console.error('[DB] All retries exhausted, database unavailable');
    throw new Error('IndexedDB blocked');
  }
}

// Close the database connection (useful for testing)
export async function closeOfflineDb(): Promise<void> {
  if (dbPromise) {
    try {
      // Add timeout to prevent hanging if database is blocked
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 2000)
      );
      const db = await Promise.race([dbPromise, timeoutPromise]);
      if (db) {
        db.close();
      }
    } catch {
      // Ignore errors - we're just trying to close
    }
    dbPromise = null;
  }
}

// Check if database deletion is pending (call this BEFORE getOfflineDb)
export function checkPendingDeletion(): boolean {
  if (typeof window === 'undefined') return false;
  const isPending = localStorage.getItem(DELETE_FLAG_KEY) === 'true';
  console.log('[DB] checkPendingDeletion:', isPending);
  return isPending;
}

// Execute pending database deletion (call this BEFORE any IndexedDB access)
export async function executePendingDeletion(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!checkPendingDeletion()) return false;

  console.log('[DB] Executing pending deletion...');

  // Clear the flag first
  localStorage.removeItem(DELETE_FLAG_KEY);
  console.log('[DB] Flag cleared from localStorage');

  // Delete the database (no connections should be open at this point)
  return new Promise<boolean>((resolve) => {
    console.log('[DB] Calling indexedDB.deleteDatabase...');
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      console.log('[DB] Database deleted successfully');
      resolve(true);
    };
    request.onerror = () => {
      console.error('[DB] Database deletion error:', request.error);
      resolve(false);
    };
    request.onblocked = () => {
      console.warn('[DB] Database deletion blocked - other connections exist');
      // Even if blocked, wait for it to complete
    };
    // Timeout
    setTimeout(() => {
      console.warn('[DB] Database deletion timed out');
      resolve(false);
    }, 5000);
  });
}

// Schedule database deletion for next page load
export function scheduleDbDeletion(): void {
  if (typeof window !== 'undefined') {
    console.log('[DB] Scheduling database deletion for next page load');
    localStorage.setItem(DELETE_FLAG_KEY, 'true');
    console.log('[DB] Flag set in localStorage:', localStorage.getItem(DELETE_FLAG_KEY));
  }
}

// Force delete database immediately (nuclear option)
// This closes any open connection and deletes the database synchronously
export async function forceDeleteDatabase(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  console.log('[DB] Force deleting database...');

  // Close our connection if we have one
  if (dbPromise) {
    try {
      const db = await Promise.race([
        dbPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))
      ]);
      if (db) {
        console.log('[DB] Closing existing connection...');
        db.close();
      }
    } catch {
      // Ignore
    }
    dbPromise = null;
  }

  // Reset state
  deletionChecked = false;
  deletionInProgress = null;
  deletionCompletePromise = null;

  // Delete the database
  return new Promise<boolean>((resolve) => {
    console.log('[DB] Calling indexedDB.deleteDatabase...');
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      console.log('[DB] Force delete successful');
      resolve(true);
    };

    request.onerror = () => {
      console.error('[DB] Force delete failed:', request.error);
      resolve(false);
    };

    request.onblocked = () => {
      console.warn('[DB] Force delete blocked - waiting...');
      // Wait for onsuccess, don't resolve yet
    };

    // Timeout
    setTimeout(() => {
      console.warn('[DB] Force delete timed out');
      resolve(false);
    }, 10000);
  });
}

// Delete the entire database - schedules deletion and reloads
export async function deleteOfflineDb(): Promise<void> {
  console.log('[DB] deleteOfflineDb called');
  // Schedule deletion for next page load
  scheduleDbDeletion();

  // Reset the promise so we don't block
  dbPromise = null;
  deletionChecked = false; // Reset so deletion check runs on next getOfflineDb call
}

// Check if IndexedDB is available and working
export async function isOfflineStorageAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('indexedDB' in window)) return false;

  try {
    const db = await getOfflineDb();
    return !!db;
  } catch {
    return false;
  }
}

// Export types for use elsewhere
export type { BibelDBSchema };
