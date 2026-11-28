// Kommentarene på kapittelsiden (#269, #286), målt i ekte Chrome: SSR-HTML og
// happy-dom har ingen layout-motor og kan verken se bredde, avklipping, hva som
// er åpent eller hvor stor skriften er.
//
// #286: teksten leses i lesevisningen, ikke i et 280 px sidepanel. Vakta måler
//   - TELEFONEN (320 og 390 px, 100 % og 150 % tekst — telefonens
//     tekstskalering, ikke sidezoom, se public/CLAUDE.md, #50): smakebitene i
//     panelet og den åpne lesevisningen, uten sidelengs scroll og uten noe
//     klipt, med originalen lukket;
//   - DESKTOP (1280 px): lesevisningen er så bred som hovedspalten og står over
//     den, i versteksten skriftstørrelse — ellers ville «en smal boks midt på»
//     eller «panelets lille skrift» bestått;
//   - VEIEN: Tilbake lukker, og et verk leseren har slått av vises ingen steder
//     og åpnes ikke fra en adresse.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const CHAPTER = '/nb/1mos/1';

let server: ReturnType<typeof Bun.serve>;
let chrome: Chrome;
let page: Page;

beforeAll(async () => {
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  chrome = await Chrome.launch();
  page = await chrome.open('about:blank');
}, 60_000);

afterAll(async () => {
  await page?.close();
  await chrome?.close();
  server?.stop(true);
  await closeSql();
}, 30_000);

const run = <T,>(body: string, arg?: unknown) =>
  page.evaluate(new Function('arg', `return (async () => { ${body} })();`) as (a: unknown) => Promise<unknown>, arg) as unknown as Promise<T>;

const settle = `await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));`;

interface Opened {
  error?: string;
  vw: number;
  pageWide: boolean;
  clipped: string[];
  open: boolean;
  shown: number;
  reader: { left: number; right: number; width: number };
  column: { left: number; width: number };
  readerFont: number;
  verseFont: number;
  originalOpen: boolean;
  hash: string;
}

/** Åpner panelet og blokka slik leseren gjør, skalerer teksten, og åpner den andre delen. */
async function openSection(width: number, scale: number): Promise<Opened> {
  await page.setViewport({ width, height: 844, mobile: width < 700 });
  await page.navigate(`http://localhost:${server.port}${CHAPTER}`);
  return run<Opened>(
    `const scale = arg;
    const opener = document.querySelector('[data-open-studium]');
    if (opener && opener.offsetParent !== null) opener.click();
    const block = document.querySelector('.st-block[data-block-id="kommentar"]');
    if (!block) return { error: 'no commentary block' };
    block.open = true;
    if (scale !== 1) {
      const els = [...document.querySelectorAll('*')];
      const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
      els.forEach((el, i) => { if (sizes[i]) el.style.fontSize = sizes[i] * scale + 'px'; });
    }
    ${settle}
    const teasers = [...block.querySelectorAll('[data-cm-open]')];
    if (teasers.length < 2) return { error: 'fewer than two teasers' };
    teasers[1].click();
    ${settle}
    const vw = document.documentElement.clientWidth;
    const reader = document.querySelector('[data-cm-reader]');
    const current = reader.querySelector('.cm-read[data-current]');
    const rr = reader.getBoundingClientRect();
    const cr = document.querySelector('.chapter-content').getBoundingClientRect();
    const textEl = current?.querySelector('.cm-read-text .cm-p:not(.cm-heading-only)');
    const clipped = [...block.querySelectorAll('.cm-teaser, .cm-teaser-label, .cm-teaser-text, .cm-work-title'),
                     ...(current ? current.querySelectorAll('.cm-p, .cm-read-label, .cm-read-work, .cm-work-meta, .cm-original > summary, .cm-read-nav a') : [])]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > vw + 1)
      .map((el) => el.className + ': ' + (el.textContent || '').slice(0, 40));
    return {
      vw,
      pageWide: document.documentElement.scrollWidth > vw,
      clipped,
      open: reader.open,
      shown: [...reader.querySelectorAll('.cm-read')].filter((p) => p.getBoundingClientRect().height > 0).length,
      reader: { left: rr.left, right: rr.right, width: rr.width },
      column: { left: cr.left, width: cr.width },
      readerFont: textEl ? parseFloat(getComputedStyle(textEl).fontSize) : 0,
      verseFont: parseFloat(getComputedStyle(document.querySelector('.verse-text')).fontSize),
      originalOpen: !!current?.querySelector('details.cm-original[open]'),
      hash: location.hash,
    };`,
    scale,
  );
}

describe('the commentary on a phone', () => {
  for (const width of [320, 390]) {
    for (const scale of [1, 1.5]) {
      test(`${width} px at ${scale * 100} % text: the teasers and the open reader fit, nothing clipped, the original closed`, async () => {
        const m = await openSection(width, scale);
        expect(m.error).toBeUndefined();
        expect(m.open).toBe(true);
        expect(m.shown).toBe(1);
        expect(m.pageWide).toBe(false);
        expect(m.clipped).toEqual([]);
        expect(m.reader.left).toBeGreaterThanOrEqual(0);
        expect(m.reader.right).toBeLessThanOrEqual(m.vw);
        expect(m.originalOpen).toBe(false);
      });
    }
  }
});

test('on a desktop the reader is as wide as the main text column, over it, in the verse text size', async () => {
  const m = await openSection(1280, 1);
  expect(m.error).toBeUndefined();
  expect(m.open).toBe(true);
  expect(m.shown).toBe(1);
  expect(m.hash).toMatch(/^#cm-mhc-/);
  expect(Math.abs(m.reader.width - m.column.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(m.reader.left - m.column.left)).toBeLessThanOrEqual(2);
  expect(m.readerFont).toBe(m.verseFont);
});

test('Back closes the reader', async () => {
  const m = await openSection(1280, 1);
  expect(m.open).toBe(true);
  const after = await run<{ open: boolean; hash: string }>(
    `history.back();
    await new Promise((r) => setTimeout(r, 300));
    return { open: document.querySelector('[data-cm-reader]').open, hash: location.hash };`,
  );
  expect(after).toEqual({ open: false, hash: '' });
});

test('a work switched off in the settings shows nowhere on the page and does not open from its address', async () => {
  await page.setViewport({ width: 1280, height: 844, mobile: false });
  await page.navigate(`http://localhost:${server.port}${CHAPTER}`);
  const anchor = await run<string>(
    `const a = document.querySelector('.cm-read[id^="cm-mhc-"]:not([id$="-book"])').id;
    localStorage.setItem('bible-settings', JSON.stringify({ commentaries: { mhc: false } }));
    return a;`,
  );
  // Via about:blank, så adressen med hash er en ny lasting, ikke et hopp i sida.
  await page.navigate('about:blank');
  await page.navigate(`http://localhost:${server.port}${CHAPTER}#${anchor}`);
  const m = await run<{ open: boolean; visible: string[] }>(
    `${settle}
    const visible = [...document.querySelectorAll('[data-commentary-work="mhc"], .st-block[data-block-id="kommentar"]')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none')
      .map((el) => el.className);
    localStorage.removeItem('bible-settings');
    return { open: document.querySelector('[data-cm-reader]').open, visible };`,
  );
  expect(m.open).toBe(false);
  expect(m.visible).toEqual([]);
});

test('a work switched off is not in the search results either', async () => {
  const search = `http://localhost:${server.port}/nb/sok?q=skapelsen`;
  await page.setViewport({ width: 1280, height: 844, mobile: false });
  await page.navigate(search);
  const count = () =>
    run<{ cards: number; group: boolean }>(
      `${settle}
      const shown = (el) => el.getClientRects().length > 0;
      const group = document.querySelector('[data-search-type="commentary"]');
      return { cards: [...document.querySelectorAll('[data-commentary-work="mhc"]')].filter(shown).length, group: !!group && shown(group) };`,
    );
  const on = await count();
  expect(on.cards).toBeGreaterThan(0);
  expect(on.group).toBe(true);
  await run(`localStorage.setItem('bible-settings', JSON.stringify({ commentaries: { mhc: false } }));`);
  await page.navigate('about:blank');
  await page.navigate(search);
  const off = await count();
  await run(`localStorage.removeItem('bible-settings');`);
  expect(off).toEqual({ cards: 0, group: false });
});
