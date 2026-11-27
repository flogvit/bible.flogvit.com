// The text size in settings changes what the reader reads, on every page (#271).
//
// The owner, 26.11: «Det ser ikke ut som det hjelper å endre tekst størrelse i
// innstillingene på Bible.flogvit.com». Measured in prod: only `.verse-text` on
// the chapter page moved (18 → 20 px), and only after the reading page's own
// script ran. Verse numbers, headings, the study blocks, persons, the timeline,
// search and the front page stayed put: the root was a fixed `16px`, 194 font
// sizes were in px, and nothing but reading.js ever applied the choice.
//
// Four halves, in real Chrome (SSR has no computed style):
// - SCALE: on each page type a reader reads, EVERY visible element in <main>
//   that carries text grows by the step at «large» and shrinks at «small». The
//   elements are found by the page, not by class name, so a new block is
//   measured without anyone listing it.
// - BEFORE PAINT: the size is on <html> in the served page itself, not added
//   later by a module (a reload must not show the default first).
// - LIVE: choosing on the settings page changes the page at once.
// - PHONE: at 320 and 390 px, at 100 % and 150 % system text, at the smallest
//   and the largest choice, no page is wider than the screen.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Page types a reader reads. The chapter page carries the verse details,
 *  the chapter summary and the important words in its study panel. */
const PAGES = ['/nb/1mos/1', '/nb/1mos/12', '/nb/personer', '/nb/tidslinje', '/nb/sok?q=gud', '/nb', '/nb/temaer', '/nb/historier'];

/** The steps in styles.css, relative to «medium». */
const STEP = { small: 0.875, large: 1.25 } as const;

let server: ReturnType<typeof Bun.serve>;
let chrome: Chrome;
let page: Page;
let base = '';

beforeAll(async () => {
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  base = `http://localhost:${server.port}`;
  chrome = await Chrome.launch();
  page = await chrome.open('about:blank');
}, 60_000);

afterAll(async () => {
  await page?.close();
  await chrome?.close();
  server?.stop(true);
}, 30_000);

/** Save a choice the way the settings page does, then load `path`. */
async function loadWith(size: 'small' | 'medium' | 'large', path: string) {
  await page.navigate(`${base}/nb/om`);
  await page.evaluate((s: string) => {
    const settings = JSON.parse(localStorage.getItem('bible-settings') || '{}');
    settings.fontSize = s;
    localStorage.setItem('bible-settings', JSON.stringify(settings));
  }, size);
  await page.navigate(base + path);
}

/** Computed font size of every visible element in <main> that holds text of its own. */
function sizes() {
  const main = document.querySelector('main') ?? document.body;
  const out: { key: string; size: number }[] = [];
  const all = [main, ...main.querySelectorAll('*')] as HTMLElement[];
  all.forEach((el, i) => {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!own || !el.getClientRects().length) return;
    if (getComputedStyle(el).visibility === 'hidden') return;
    out.push({ key: `${i}:${el.tagName.toLowerCase()}.${el.className}`, size: parseFloat(getComputedStyle(el).fontSize) });
  });
  return { root: parseFloat(getComputedStyle(document.documentElement).fontSize), elements: out };
}

describe('SCALE — the choice reaches every text a reader reads', () => {
  for (const path of PAGES) {
    test(path, async () => {
      await page.setViewport({ width: 390, height: 844 });
      await loadWith('medium', path);
      const medium = await page.evaluate(sizes);
      expect(medium.elements.length, `${path}: text to measure`).toBeGreaterThan(5);
      for (const size of ['small', 'large'] as const) {
        await loadWith(size, path);
        const now = await page.evaluate(sizes);
        expect(now.root / medium.root).toBeCloseTo(STEP[size], 2);
        const byKey = new Map(now.elements.map((e) => [e.key, e.size]));
        const stuck = medium.elements
          .filter((e) => byKey.has(e.key))
          .filter((e) => Math.abs(byKey.get(e.key)! / e.size - STEP[size]) > 0.03)
          .map((e) => `${e.key} ${e.size}px → ${byKey.get(e.key)}px`);
        expect(stuck, `${path} at ${size}: text that did not follow`).toEqual([]);
      }
    });
  }

  test('the chapter page: verse text, verse numbers and headings all follow', async () => {
    await page.setViewport({ width: 390, height: 844 });
    const read = () => {
      const px = (s: string) => {
        const el = document.querySelector(s);
        return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
      };
      return { text: px('.verse-text'), num: px('.verse-number'), h1: px('main h1') };
    };
    await loadWith('medium', '/nb/1mos/1');
    const m = await page.evaluate(read);
    await loadWith('large', '/nb/1mos/1');
    const l = await page.evaluate(read);
    expect(m.text).toBeGreaterThan(0);
    for (const k of ['text', 'num', 'h1'] as const) expect(l[k] / m[k]).toBeCloseTo(STEP.large, 2);
  });
});

describe('BEFORE PAINT — the served page sets the size itself', () => {
  test('the size is on <html> before any module runs, and holds on the next page', async () => {
    const html = await (await fetch(`${base}/nb/1mos/1`)).text();
    const head = html.slice(0, html.indexOf('</head>'));
    // The snippet reads the choice in <head>; module scripts run after parsing.
    expect(head).toContain("localStorage.getItem('bible-settings')");
    expect(head).toContain('dataset.textSize');
    await loadWith('large', '/nb/1mos/1');
    await page.navigate(`${base}/nb/tidslinje`);
    expect(await page.evaluate(() => document.documentElement.dataset.textSize)).toBe('large');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('20px');
  });
});

describe('LIVE — the settings page changes the page at once', () => {
  test('choosing «large» and back to «medium»', async () => {
    await loadWith('medium', '/nb/innstillinger');
    const pick = (v: string) => {
      const sel = document.querySelector<HTMLSelectElement>('[data-setting="fontSize"]')!;
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return getComputedStyle(document.documentElement).fontSize;
    };
    expect(await page.evaluate(pick, 'large')).toBe('20px');
    expect(await page.evaluate(pick, 'medium')).toBe('16px');
  });
});

describe('PHONE — no page wider than the screen at either end', () => {
  /** Scale every element's text like the phone's accessibility setting does. */
  function overflow(scale: number) {
    const els = [...document.querySelectorAll<HTMLElement>('*')];
    const original = els.map((el) => el.style.fontSize);
    if (scale !== 1) {
      const s = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
      els.forEach((el, i) => {
        if (s[i]) el.style.fontSize = `${s[i]! * scale}px`;
      });
    }
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    els.forEach((el, i) => (el.style.fontSize = original[i]!));
    return over;
  }
  for (const width of [320, 390]) {
    for (const size of ['small', 'large'] as const) {
      test(`${width} px at «${size}», 100 % and 150 % text`, async () => {
        await page.setViewport({ width, height: 800 });
        const wide: string[] = [];
        for (const path of PAGES) {
          await loadWith(size, path);
          for (const scale of [1, 1.5]) {
            const over = await page.evaluate(overflow, scale);
            if (over > 1) wide.push(`${path} ${scale * 100} %: ${over} px too wide`);
          }
        }
        expect(wide).toEqual([]);
      });
    }
  }
});
