// The song lists (#188) in a real browser: WCAG 2.1 AA with axe, visible focus,
// and no page wider than the screen at 320 and 390 px with 100 and 150 % text.
//
// The other sweeps (mobile-layout, tilgjengelighet) run with the songs OFF —
// test/preload.ts keeps the suite off the network — so they never see this
// markup. Here a local index serves songs made to be hard on the layout (a long
// title, one long compound word, many styles, enough songs to fold), and every
// page type that shows songs is opened with all of it visible: the chapter's
// study block (in the overlay on a phone), a verse's «Songs» tab, and the folded
// rest. Light and dark, since the link and toggle colours are the theme's.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';
import { LOCALES, type Locale } from '../src/lib/i18n.ts';
import { clearPageCache } from '../src/lib/page-cache.ts';
import { resetSongIndex } from '../src/lib/songs.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { axeKilde, beskriv, fokusUsynlig, kjørAxe, tekstForstørret } from './tilgjengelighet-sjekk.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));
const STYLES = ['orchestral', 'children', 'worship', 'acoustic', 'celtic'];
const tagged = (id: string, title: string, tags: Record<string, { slug: string }[]>, refs: unknown[] = []) => ({
  id, collection: 'bible', title, style: STYLES, music: { duration: '4:04' },
  references: refs, tags, files: { mp3: `bible/${id}/audio.mp3` },
});
const SONGS = [
  tagged('psalm-23', 'The Unfathomable Steadfastness of the Everlasting Shepherd', {}, [
    { bookId: 19, chapter: 23, verseStart: 1, verseEnd: 6 },
  ]),
  tagged('psalm-23-4', 'Barmhjertighetsgjerningenessangen', {}, [{ bookId: 19, chapter: 23, verseStart: 4, verseEnd: 4 }]),
  ...Array.from({ length: 7 }, (_, i) => tagged(`hope-${i}`, `A Song of Hope Number ${i + 1}`, { themes: [{ slug: 'hap' }] })),
  tagged('peter', 'Peter on the Water', { persons: [{ slug: 'peter' }] }),
  tagged('prodigal', 'Running Home Again', { stories: [{ slug: 'den-fortapte-sonn' }] }),
];

const PAGES = ['/sal/23', '/temaer/hap', '/personer/peter', '/historier/den-fortapte-sonn'];
const VIEWPORTS = [
  { width: 320, height: 693 },
  { width: 390, height: 844 },
];
/** English, Norwegian, and whichever language writes the song texts longest. */
const LONGEST = LOCALES.reduce((a, b) => (DICTIONARIES[b]['songs.open'].length > DICTIONARIES[a]['songs.open'].length ? b : a));
const MEASURED: Locale[] = [...new Set<Locale>(['en', 'nb', LONGEST])];

let index: ReturnType<typeof Bun.serve>;
let server: ReturnType<typeof Bun.serve>;
let chrome: Chrome;
let page: Page;
let kilde: string;
const before = process.env.MUSIC_INDEX_URL;

beforeAll(async () => {
  kilde = axeKilde(ROOT);
  index = Bun.serve({ port: 0, fetch: () => Response.json({ version: 1, songs: SONGS }) });
  process.env.MUSIC_INDEX_URL = `http://localhost:${index.port}/music/index.json`;
  resetSongIndex();
  clearPageCache();
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  chrome = await Chrome.launch();
  page = await chrome.open('about:blank');
  await page.emulateFocus();
}, 120_000);

afterAll(async () => {
  await page?.close();
  await chrome?.close();
  server?.stop(true);
  index?.stop(true);
  if (before === undefined) delete process.env.MUSIC_INDEX_URL;
  else process.env.MUSIC_INDEX_URL = before;
  resetSongIndex();
  clearPageCache();
}, 30_000);

/** Makes every song on the page visible: the study overlay, verse 4's tab, and the folded rest. */
async function showSongs(): Promise<number> {
  return page.evaluate(async () => {
    const opener = document.querySelector('[data-open-studium]') as HTMLElement | null;
    if (opener && opener.offsetParent) opener.click();
    const detail = document.getElementById('v4-detail');
    if (detail) {
      detail.hidden = false;
      (detail.querySelector('[data-vd-tab="songs"]') as HTMLElement | null)?.click();
    }
    document.querySelectorAll('details.song-more, details.st-block').forEach((d) => ((d as HTMLDetailsElement).open = true));
    await new Promise((r) => setTimeout(r, 50));
    return [...document.querySelectorAll('.song')].filter((el) => (el as HTMLElement).offsetParent).length;
  });
}

/** A song list adds no side margin of its own: it is as wide as the box it sits in. */
function insetLists(): string[] {
  return [...document.querySelectorAll('.song-list')]
    .filter((el) => (el as HTMLElement).offsetParent)
    .flatMap((el) => {
      const p = el.parentElement!;
      const cs = getComputedStyle(p);
      const inner = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const w = el.getBoundingClientRect().width;
      return w + 1 < inner ? [`.song-list ${Math.round(w)} px in a ${Math.round(inner)} px box`] : [];
    });
}

function setTheme(theme: string) {
  document.cookie = `fv-prefs=${encodeURIComponent(JSON.stringify({ theme }))}; path=/`;
}

const url = (locale: Locale, path: string) => `http://localhost:${server.port}/${locale}${path}`;

describe('songs in a real browser (#188)', () => {
  for (const locale of MEASURED) {
    for (const path of PAGES) {
      test(`/${locale}${path}: fits 320/390 px at 100/150 % text, no inset, axe and focus clean in light and dark`, async () => {
        const problems: string[] = [];
        for (const theme of ['light', 'dark']) {
          await page.navigate(url(locale, path));
          await page.evaluate(setTheme, theme);
          for (const vp of VIEWPORTS) {
            await page.setViewport(vp);
            await page.navigate(url(locale, path));
            const shown = await showSongs();
            // No silent pass: the songs must be on screen to be measured.
            expect(shown, `${path} at ${vp.width} px`).toBeGreaterThan(0);
            const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
            if (width[0]! > width[1]! + 1) problems.push(`${vp.width} px, 100 %: ${width[0]} px wide`);
            problems.push(...(await page.evaluate(insetLists)).map((p) => `${vp.width} px: ${p}`));
            if (vp.width === 390) {
              const funn = await kjørAxe(page, kilde);
              if (funn.length) problems.push(beskriv(`${path} (${theme})`, funn));
              const usynlig = await fokusUsynlig(page);
              if (usynlig.length) problems.push(`${theme}: focus not visible on ${usynlig.join(', ')}`);
            }
            // Last, since it leaves the text enlarged.
            problems.push(...(await tekstForstørret(page, 1.5)).map((p) => `${vp.width} px, 150 %: ${p}`));
          }
        }
        expect(problems).toEqual([]);
      }, 120_000);
    }
  }
});
