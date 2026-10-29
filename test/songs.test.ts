// Songs from FLOGVIT.music on the pages they are about (#188).
//
// Four halves:
//   THE LOOKUP — pure logic on a hand-made index: a single verse, a range that
//                contains the verse (and one that does not), a passage that is
//                the whole chapter, a theme, a person, a story, old ids through
//                bibel's alias tables, and no songs.
//   THE FETCH  — a real server: the index is read and cached, a song file is
//                resolved against the index's address, a bad entry is dropped
//                without the others, and an unreachable or broken index is
//                "no songs" — never a throw.
//   THE PAGES  — the chapter page (study block and the verse's own tab), and the
//                theme, person and story pages show the songs, on every
//                language with that language's text.
//   NOTHING ELSE CHANGES — with the index unreachable, and on a page no song is
//                about, the same pages answer 200 with no trace of songs.

import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { clearPageCache } from '../src/lib/page-cache.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import {
  canonicalSlug,
  resetSongIndex,
  songIndex,
  songPageUrl,
  songsForPassage,
  songsTagged,
  type Song,
  type SongIndex,
} from '../src/lib/songs.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

function song(id: string, over: Partial<Song> = {}): Song {
  return {
    id,
    collection: 'bible',
    title: `Song ${id}`,
    style: ['folk'],
    references: [],
    tags: {},
    files: { mp3: `bible/${id}/audio.mp3` },
    audio: `https://media.example/music/bible/${id}/audio.mp3`,
    ...over,
  };
}

// Psalm 23 is book 19; Luke 15 is 42.
const PSALM_23 = song('psalm-23', {
  title: 'The Lord Is My Shepherd',
  style: ['worship', 'acoustic'],
  music: { duration: '3:41' },
  references: [{ bookId: 19, chapter: 23, verseStart: 1, verseEnd: 6 }],
  tags: { themes: [{ slug: 'hap' }], persons: [{ slug: 'david' }] },
});
const VERSE_4 = song('psalm-23-4', { references: [{ bookId: 19, chapter: 23, verseStart: 4, verseEnd: 4 }] });
const WHOLE_CHAPTER = song('psalm-23-all', { references: [{ bookId: 19, chapter: 23 }] });
const PRODIGAL = song('prodigal', {
  title: 'Running Home',
  references: [{ bookId: 42, chapter: 15, verseStart: 11, verseEnd: 32 }],
  // `jisreel-hoseas-sønn` is the spelling before free-bible#25; bibel serves `jisreel-hoseas-sonn`.
  tags: { stories: [{ slug: 'pasken-og-uttogget' }], persons: [{ slug: 'jisreel-hoseas-sønn' }] },
});
const INDEX: SongIndex = { url: 'https://media.example/music/index.json', songs: [PSALM_23, VERSE_4, WHOLE_CHAPTER, PRODIGAL] };
const ids = (songs: Song[]) => songs.map((s) => s.id);

describe('songs — the lookup', () => {
  test('a single verse is found on that verse and on no other', () => {
    expect(ids(songsForPassage(INDEX, 19, 23, 4))).toContain('psalm-23-4');
    expect(ids(songsForPassage(INDEX, 19, 23, 3))).not.toContain('psalm-23-4');
  });

  test('a range is found on every verse it contains, and not outside it', () => {
    for (const v of [11, 20, 32]) expect(ids(songsForPassage(INDEX, 42, 15, v))).toEqual(['prodigal']);
    expect(ids(songsForPassage(INDEX, 42, 15, 10))).toEqual([]);
    expect(ids(songsForPassage(INDEX, 42, 15, 33))).toEqual([]);
  });

  test('a passage without verses is the whole chapter', () => {
    expect(ids(songsForPassage(INDEX, 19, 23, 2))).toEqual(['psalm-23', 'psalm-23-all']);
  });

  test('without a verse, every song with a passage in the chapter', () => {
    expect(ids(songsForPassage(INDEX, 19, 23))).toEqual(['psalm-23', 'psalm-23-4', 'psalm-23-all']);
    expect(ids(songsForPassage(INDEX, 19, 24))).toEqual([]);
    expect(ids(songsForPassage(INDEX, 20, 23))).toEqual([]);
  });

  test('a theme, a person and a story', () => {
    expect(ids(songsTagged(INDEX, 'themes', 'hap'))).toEqual(['psalm-23']);
    expect(ids(songsTagged(INDEX, 'persons', 'david'))).toEqual(['psalm-23']);
    expect(ids(songsTagged(INDEX, 'themes', 'david'))).toEqual([]);
  });

  test('an old person or story id reaches the page bibel serves it on', () => {
    expect(canonicalSlug('persons', 'jisreel-hoseas-sønn')).toBe('jisreel-hoseas-sonn');
    expect(canonicalSlug('stories', 'pasken-og-uttogget')).toBe('pasken-og-uttoget');
    expect(ids(songsTagged(INDEX, 'persons', 'jisreel-hoseas-sonn'))).toEqual(['prodigal']);
    expect(ids(songsTagged(INDEX, 'stories', 'pasken-og-uttoget'))).toEqual(['prodigal']);
    // An id that is already canonical stays as it is.
    expect(canonicalSlug('persons', 'david')).toBe('david');
    expect(canonicalSlug('themes', 'guds-trofasthet')).toBe('guds-trofasthet');
  });

  test('no songs, and no index, is an empty list', () => {
    expect(songsTagged(INDEX, 'themes', 'nothing-here')).toEqual([]);
    expect(songsForPassage(null, 19, 23, 1)).toEqual([]);
    expect(songsTagged(null, 'persons', 'david')).toEqual([]);
  });

  test('the song on FLOGVIT.music opens in the reader’s language', () => {
    expect(songPageUrl(PSALM_23, 'nb')).toBe('https://music.flogvit.com/nb/?song=bible%2Fpsalm-23');
  });
});

// ── A real server for the fetch and the pages ─────────────────────────

/** The index as FLOGVIT.music publishes it: the files are relative to index.json. */
function published(songs: Song[]) {
  return { version: 1, songs: songs.map(({ audio: _audio, ...s }) => s) };
}

let body: unknown = published([]);
let status = 200;
let hits = 0;
const server = Bun.serve({
  port: 0,
  fetch(req) {
    if (new URL(req.url).pathname !== '/music/index.json') return new Response('no', { status: 404 });
    hits++;
    return status === 200 ? Response.json(body) : new Response('down', { status });
  },
});
const INDEX_URL = `http://localhost:${server.port}/music/index.json`;
// A port nothing listens on: refused at once, as when media.flogvit.com is gone.
const DEAD = Bun.serve({ port: 0, fetch: () => new Response() });
const DEAD_URL = `http://localhost:${DEAD.port}/music/index.json`;
DEAD.stop(true);

const before = process.env.MUSIC_INDEX_URL;
function useIndex(url: string) {
  process.env.MUSIC_INDEX_URL = url;
  resetSongIndex();
  clearPageCache();
}
afterAll(() => {
  if (before === undefined) delete process.env.MUSIC_INDEX_URL;
  else process.env.MUSIC_INDEX_URL = before;
  delete process.env.MUSIC_INDEX_TTL_MS;
  resetSongIndex();
  clearPageCache();
  server.stop(true);
});
beforeEach(() => {
  status = 200;
  hits = 0;
});

describe('songs — the fetch', () => {
  test('the index is read once and kept; the song file is resolved against its address', async () => {
    body = published([PSALM_23]);
    useIndex(INDEX_URL);
    const first = await songIndex();
    await songIndex();
    expect(hits).toBe(1);
    expect(first?.songs.map((s) => s.audio)).toEqual([`http://localhost:${server.port}/music/bible/psalm-23/audio.mp3`]);
  });

  test('a song without what a page needs is dropped, and the others stay', async () => {
    body = { songs: [{ id: 'broken', title: 'No files' }, ...published([PSALM_23]).songs] };
    useIndex(INDEX_URL);
    expect((await songIndex())?.songs.map((s) => s.id)).toEqual(['psalm-23']);
  });

  test('an unreachable index is no songs, not an error', async () => {
    useIndex(DEAD_URL);
    expect(await songIndex()).toBeNull();
  });

  test('an index that answers 500, or something that is not an index, is no songs', async () => {
    useIndex(INDEX_URL);
    status = 500;
    expect(await songIndex()).toBeNull();
    status = 200;
    body = { nothing: true };
    useIndex(INDEX_URL);
    expect(await songIndex()).toBeNull();
    expect(hits).toBe(2);
  });

  test('a stale index is served at once, refreshed behind, and kept when the refresh fails', async () => {
    body = published([PSALM_23]);
    process.env.MUSIC_INDEX_TTL_MS = '1';
    useIndex(INDEX_URL);
    expect((await songIndex())?.songs).toHaveLength(1);
    await Bun.sleep(5);
    status = 500;
    expect((await songIndex())?.songs).toHaveLength(1); // served stale while the refresh runs
    await Bun.sleep(20);
    expect((await songIndex())?.songs).toHaveLength(1); // the failed refresh kept the old copy
    delete process.env.MUSIC_INDEX_TTL_MS;
  });

  test('MUSIC_INDEX_URL= turns the songs off', async () => {
    useIndex('');
    expect(await songIndex()).toBeNull();
    expect(hits).toBe(0);
  });
});

// ── The pages ─────────────────────────────────────────────────────────

const app = createApp();
const PAGE_SONGS = [
  song('psalm-23', { ...PSALM_23, tags: {} }),
  song('theme', { title: 'Hope Song', references: [], tags: { themes: [{ slug: 'hap' }] } }),
  song('person', { title: 'Peter Song', references: [], tags: { persons: [{ slug: 'peter' }] } }),
  song('story', { title: 'Prodigal Song', references: [], tags: { stories: [{ slug: 'den-fortapte-sonn' }] } }),
];
const PAGES: { path: string; title: string }[] = [
  { path: '/sal/23', title: 'The Lord Is My Shepherd' },
  { path: '/temaer/hap', title: 'Hope Song' },
  { path: '/personer/peter', title: 'Peter Song' },
  { path: '/historier/den-fortapte-sonn', title: 'Prodigal Song' },
];

async function html(path: string): Promise<string> {
  const res = await app.request(path);
  expect(res.status).toBe(200);
  return res.text();
}

describe('songs — the pages', () => {
  beforeAll(() => {
    body = published(PAGE_SONGS);
  });

  test('each page shows its song with title, style, a player and the link, in every language', async () => {
    useIndex(INDEX_URL);
    for (const locale of LOCALES) {
      const d = DICTIONARIES[locale];
      for (const page of PAGES) {
        const text = await html(`/${locale}${page.path}`);
        const where = `/${locale}${page.path}`;
        expect(text, where).toContain(page.title);
        expect(text, where).toContain(`<audio class="song-audio" controls="" preload="none"`);
        expect(text, where).toContain(`https://music.flogvit.com/${locale}/?song=bible%2F`);
        expect(text, where).toContain(d['songs.open']);
        expect(text, where).toContain(d['songs.title']);
      }
      // Style through the dictionary, and the length.
      const chapter = await html(`/${locale}/sal/23`);
      expect(chapter).toContain(`${d['songs.style.worship']}, ${d['songs.style.acoustic']} · 3:41`);
    }
  });

  test('the chapter page has a study block, and the verse its own tab — only on the verses the song covers', async () => {
    body = published([...PAGE_SONGS, VERSE_4]);
    useIndex(INDEX_URL);
    const text = await html('/en/sal/23');
    expect(text).toContain('data-block-id="sanger"');
    const detail = (n: number) => text.slice(text.indexOf(`id="v${n}-detail"`), text.indexOf(`id="v${n + 1}-detail"`));
    expect(detail(4)).toContain('data-vd-tab="songs"');
    expect(detail(4)).toContain('Song psalm-23-4');
    expect(detail(3)).toContain('data-vd-tab="songs"'); // the whole psalm still covers verse 3
    expect(detail(3)).not.toContain('Song psalm-23-4');
    body = published(PAGE_SONGS);
  });
});

describe('songs — nothing else changes', () => {
  test('with the index unreachable, every page answers as before, with no songs', async () => {
    useIndex(DEAD_URL);
    for (const page of PAGES) {
      const text = await html(`/en${page.path}`);
      expect(text, page.path).not.toContain('song-');
      expect(text, page.path).not.toContain('data-vd-tab="songs"');
    }
  });

  test('a chapter no song is about has no songs block', async () => {
    body = published(PAGE_SONGS);
    useIndex(INDEX_URL);
    const text = await html('/en/sal/24');
    expect(text).not.toContain('data-block-id="sanger"');
    expect(text).not.toContain('class="song"');
  });
});
