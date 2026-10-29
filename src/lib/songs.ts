// Songs from FLOGVIT.music on the pages they are about (#188).
//
// The songs live in FLOGVIT.music's public index (flogvit/flogvit-bible-music
// publishes it to media.flogvit.com/music/). Bibel reads it, it never copies it:
// the index is fetched server-side, kept in memory for `MUSIC_INDEX_TTL_MS`, and
// looked up per page. Same shape as the konto call in session.ts — the address
// is read per call so a test can point it at a mock server, the timeout is short,
// and a failure is "no songs", never an error on a page that works without them.
//
// The index already speaks bibel's language: passages are osnb numbering, and
// themes, persons and stories carry bibel's own slugs (they are made from
// bibel's data). The one mapping is for addresses bibel has since renamed, and it
// goes through bibel's existing alias tables (`canonicalSlug`), so a renamed
// person or story never needs a second list here. `bun scripts/check-song-tags.ts`
// checks every slug in the live index against the database.

import type { Locale } from './i18n.ts';
import { PERSON_ID_ALIASES, normalizePersonId } from './person-id-aliases.ts';
import { STORY_SLUG_ALIASES } from './story-slug-aliases.ts';

export interface SongPassage {
  bookId: number;
  chapter: number;
  /** Without verses the passage is the whole chapter. */
  verseStart?: number;
  verseEnd?: number;
}

export interface Song {
  id: string;
  collection: string;
  title: string;
  style: string[];
  references: SongPassage[];
  tags: Partial<Record<SongTagKind, { slug: string }[]>>;
  music?: { duration?: string };
  /** Relative to index.json. */
  files: { mp3: string };
  /** `files.mp3` resolved against the index's address when it was read. */
  audio: string;
}

export interface SongIndex {
  url: string;
  songs: Song[];
}

export type SongTagKind = 'themes' | 'persons' | 'stories';

const DEFAULT_INDEX_URL = 'https://media.flogvit.com/music/index.json';
const MUSIC_SITE = 'https://music.flogvit.com';
const TIMEOUT_MS = 2500;
/** After a failed fetch, pages go on without (or with the old) songs this long before the next try. */
const RETRY_MS = 60_000;

/** `MUSIC_INDEX_URL=` (empty) turns the songs off; unset is FLOGVIT.music's own index. */
function indexUrl(): string {
  return process.env.MUSIC_INDEX_URL ?? DEFAULT_INDEX_URL;
}

function ttlMs(): number {
  return Number(process.env.MUSIC_INDEX_TTL_MS) || 10 * 60_000;
}

let cached: { index: SongIndex; at: number } | null = null;
let failedAt = 0;
let inflight: Promise<void> | null = null;

/** Only songs with what a page needs; one bad entry does not take the others with it. */
function readSongs(raw: unknown, url: string): Song[] | null {
  const songs = (raw as { songs?: unknown } | null)?.songs;
  if (!Array.isArray(songs)) return null;
  return songs
    .filter(
      (s): s is Omit<Song, 'audio'> =>
        !!s && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.files?.mp3 === 'string' &&
        Array.isArray(s.references) && Array.isArray(s.style) && typeof s.tags === 'object' && !!s.tags,
    )
    .map((s) => ({ ...s, audio: new URL(s.files.mp3, url).href }));
}

async function load(url: string): Promise<void> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const songs = readSongs(await res.json(), url);
    if (!songs) throw new Error('no songs array');
    cached = { index: { url, songs }, at: Date.now() };
    failedAt = 0;
  } catch (err) {
    failedAt = Date.now();
    console.warn(`[songs] ${url}: ${(err as Error).message} — pages go on without new songs`);
  }
}

/**
 * The index, or null when it is off or has never been read. A fresh copy is
 * returned at once; a stale one is returned at once and refreshed behind the
 * request; only the very first read waits (at most `TIMEOUT_MS`), so the page
 * that fills the microcache after a restart has its songs.
 */
export async function songIndex(): Promise<SongIndex | null> {
  const url = indexUrl();
  if (!url) return null;
  const mine = cached?.index.url === url ? cached : null;
  const now = Date.now();
  if (mine && now - mine.at < ttlMs()) return mine.index;
  if (now - failedAt < RETRY_MS) return mine?.index ?? null;
  const refresh = (inflight ??= load(url).finally(() => (inflight = null)));
  if (mine) return mine.index;
  await refresh;
  return cached?.index.url === url ? cached.index : null;
}

/** Forgets the cached index; for tests that point `MUSIC_INDEX_URL` somewhere new. */
export function resetSongIndex(): void {
  cached = null;
  failedAt = 0;
  inflight = null;
}

function covers(p: SongPassage, bookId: number, chapter: number, verse?: number): boolean {
  if (p.bookId !== bookId || p.chapter !== chapter) return false;
  if (verse === undefined || p.verseStart === undefined) return true;
  return p.verseStart <= verse && verse <= (p.verseEnd ?? p.verseStart);
}

/** Songs with a passage in the chapter, or — with a verse — a passage that contains that verse. */
export function songsForPassage(index: SongIndex | null, bookId: number, chapter: number, verse?: number): Song[] {
  return (index?.songs ?? []).filter((s) => s.references.some((p) => covers(p, bookId, chapter, verse)));
}

/** The address bibel serves a tag under today: an old person or story id goes through bibel's alias tables. */
export function canonicalSlug(kind: SongTagKind, slug: string): string {
  if (kind === 'persons') return PERSON_ID_ALIASES[slug] ?? normalizePersonId(slug);
  if (kind === 'stories') return STORY_SLUG_ALIASES[slug] ?? slug;
  return slug;
}

/** Songs tagged with the theme, person or story bibel serves as `slug`. */
export function songsTagged(index: SongIndex | null, kind: SongTagKind, slug: string): Song[] {
  return (index?.songs ?? []).filter((s) => (s.tags[kind] ?? []).some((n) => canonicalSlug(kind, n.slug) === slug));
}

/** The song in FLOGVIT.music's player, in the reader's language. */
export function songPageUrl(song: Song, locale: Locale): string {
  const url = new URL(`/${locale}/`, MUSIC_SITE);
  url.searchParams.set('song', `${song.collection}/${song.id}`);
  return url.href;
}
