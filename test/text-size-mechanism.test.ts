// The text size setting reaches every text through ONE mechanism (#271), checked
// without a browser.
//
// test/font-size-setting.test.ts measures the result in real Chrome. This file
// guards the three parts that result rests on, so a gate without Chrome still
// goes red when one of them is lost:
// - STYLESHEETS: the root is a percentage, the two steps scale it, and no font
//   size is in px (a px size ignores the root and stays put whatever is chosen;
//   main had 194 of them).
// - BEFORE PAINT: the layout's <head> carries a snippet that puts the saved
//   choice on <html> before the page paints.
// - LIVE: public/js/text-size.js applies the saved choice, follows the settings
//   page's `bibel:font-size` event, and is loaded on every page by chrome.js.

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const STYLESHEETS = ['public/styles.css', ...readdirSync(join(ROOT, 'public/css')).filter((f) => f.endsWith('.css')).map((f) => `public/css/${f}`)];

describe('STYLESHEETS — every font size follows the root', () => {
  test('no font-size is in px', () => {
    const px: string[] = [];
    for (const file of STYLESHEETS) {
      read(file)
        .split('\n')
        .forEach((line, i) => {
          if (/font-size\s*:[^;}]*\dpx/.test(line)) px.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(px).toEqual([]);
  });

  test('the root is a percentage, and «small»/«large» scale it', () => {
    const css = read('public/styles.css');
    const rootRule = css.match(/(?:^|\n)html\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rootRule).toMatch(/font-size:\s*100%/);
    expect(css).toMatch(/html\[data-text-size=['"]small['"]\]\s*\{\s*font-size:\s*87\.5%/);
    expect(css).toMatch(/html\[data-text-size=['"]large['"]\]\s*\{\s*font-size:\s*125%/);
  });
});

/** A stand-in for the browser globals the snippet and the module touch. */
function fakeBrowser(saved: unknown) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const html = { dataset: {} as Record<string, string> };
  const store = new Map<string, string>();
  if (saved !== undefined) store.set('bible-settings', JSON.stringify(saved));
  return {
    html,
    localStorage: { getItem: (k: string) => store.get(k) ?? null },
    document: {
      documentElement: html,
      addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] ??= []).push(f),
      dispatch: (t: string, e: unknown) => listeners[t]?.forEach((f) => f(e)),
    },
    window: { addEventListener: () => {} },
  };
}

describe('BEFORE PAINT — the served <head> sets the size itself', () => {
  test('the layout puts the snippet in <head>', () => {
    const src = read('src/views/layout.tsx');
    const at = src.indexOf('{raw(TEXT_SIZE_SNIPPET)}');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(src.indexOf('<title>{props.title}</title>'));
  });

  // Read from the source, not imported: layout.tsx reaches the database module,
  // and this file stays a pure-logic test (db-test-timeout.test.ts).
  test('the snippet puts the saved choice on <html>', () => {
    const snippet = read('src/views/layout.tsx').match(/TEXT_SIZE_SNIPPET = `<script>([\s\S]*?)<\/script>`/)?.[1];
    expect(snippet).toBeString();
    const body = snippet!;
    const run = (saved: unknown) => {
      const b = fakeBrowser(saved);
      new Function('localStorage', 'document', body)(b.localStorage, b.document);
      return b.html.dataset.textSize;
    };
    expect(run({ fontSize: 'large' })).toBe('large');
    expect(run({ fontSize: 'small' })).toBe('small');
    expect(run({ fontSize: 'medium' })).toBeUndefined();
    expect(run(undefined)).toBeUndefined();
  });
});

describe('LIVE — the module follows the choice on every page', () => {
  test('text-size.js applies the saved size and follows `bibel:font-size`', async () => {
    const b = fakeBrowser({ fontSize: 'large' });
    const g = globalThis as Record<string, unknown>;
    const before = { localStorage: g.localStorage, document: g.document, window: g.window };
    Object.assign(g, { localStorage: b.localStorage, document: b.document, window: b.window });
    try {
      const { followTextSize } = (await import(`../public/js/text-size.js?t=${Date.now()}`)) as {
        followTextSize: () => void;
      };
      followTextSize();
      expect(b.html.dataset.textSize).toBe('large');
      b.document.dispatch('bibel:font-size', { detail: 'small' });
      expect(b.html.dataset.textSize).toBe('small');
      b.document.dispatch('bibel:font-size', { detail: 'medium' });
      expect(b.html.dataset.textSize).toBeUndefined();
    } finally {
      Object.assign(g, before);
    }
  });

  test('chrome.js (every page) starts it, and the settings page tells it', () => {
    expect(read('public/js/chrome.js')).toMatch(/import\s*\{\s*followTextSize\s*\}\s*from\s*'\.\/text-size\.js'/);
    expect(read('public/js/chrome.js')).toMatch(/^followTextSize\(\);/m);
    expect(read('public/js/user.js')).toMatch(/new CustomEvent\('bibel:font-size'/);
  });
});
