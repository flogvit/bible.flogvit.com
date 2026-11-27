// Kommentarblokka på telefon (#269), målt i ekte Chrome: SSR-HTML og happy-dom
// har ingen layout-motor og kan verken se bredde, avklipping eller hva som står
// under hva.
//
// På 320 og 390 px, ved 100 % og 150 % tekst (telefonens tekstskalering, ikke
// sidezoom — se public/CLAUDE.md, #50), med studieoverlegget åpnet slik leseren
// gjør det (▥):
//   - ingen side bredere enn skjermen, og ingenting i blokka er klipt;
//   - nesten ingen sidemarg: teksten bruker skjermen;
//   - kildens avsnitt står UNDER det norske.
// Og den motsatte halvdelen: der blokka er bred nok (overlegget på 900 px),
// står de SIDE OM SIDE — ellers ville «stable alltid» bestått.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const CHAPTER = '/nb/1mos/1';
/** Høyeste sidemarg vi godtar rundt teksten på en telefon, i px. */
const MAX_SIDE_MARGIN = 32;

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

/** Åpner overlegget og blokka slik leseren gjør, skalerer teksten, og måler. */
async function measure(width: number, height: number, scale: number) {
  await page.setViewport({ width, height, mobile: width < 700 });
  await page.navigate(`http://localhost:${server.port}${CHAPTER}`);
  return page.evaluate(
    new Function(
      'scale',
      `return (async () => {
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
        // La layouten sette seg: to bilder etter siste endring.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const vw = document.documentElement.clientWidth;
        const pairs = [...block.querySelectorAll('.cm-pair')].slice(0, 12);
        const clipped = [...block.querySelectorAll('.cm-text, .cm-source, .cm-section-head, .cm-work-meta')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.className + ': ' + (el.textContent || '').slice(0, 40));
        const texts = [...block.querySelectorAll('.cm-text')].slice(0, 12).map((el) => el.getBoundingClientRect());
        return {
          vw,
          pageWide: document.documentElement.scrollWidth > vw,
          clipped,
          leftMargin: Math.min(...texts.map((r) => r.left)),
          rightMargin: Math.min(...texts.map((r) => vw - r.right)),
          pairs: pairs.map((p) => {
            const t = p.querySelector('.cm-text').getBoundingClientRect();
            const s = p.querySelector('.cm-source')?.getBoundingClientRect();
            return s ? { under: s.top >= t.bottom - 1, beside: s.left >= t.right - 1 } : null;
          }).filter(Boolean),
        };
      })();`,
    ) as (scale: number) => Promise<unknown>,
    scale,
  ) as unknown as Promise<{
    error?: string;
    vw: number;
    pageWide: boolean;
    clipped: string[];
    leftMargin: number;
    rightMargin: number;
    pairs: { under: boolean; beside: boolean }[];
  }>;
}

describe('the commentary block on a phone', () => {
  for (const width of [320, 390]) {
    for (const scale of [1, 1.5]) {
      test(`${width} px at ${scale * 100} % text: no sideways scroll, nothing clipped, little margin, the source under`, async () => {
        const m = await measure(width, 844, scale);
        expect(m.error).toBeUndefined();
        expect(m.pageWide).toBe(false);
        expect(m.clipped).toEqual([]);
        expect(m.leftMargin).toBeLessThanOrEqual(MAX_SIDE_MARGIN);
        expect(m.rightMargin).toBeLessThanOrEqual(MAX_SIDE_MARGIN);
        expect(m.pairs.length).toBeGreaterThan(0);
        expect(m.pairs.every((p) => p.under)).toBe(true);
      });
    }
  }
});

test('where the block is wide (the panel on a 900 px tablet), the source stands beside', async () => {
  const m = await measure(900, 844, 1);
  expect(m.error).toBeUndefined();
  expect(m.pairs.length).toBeGreaterThan(0);
  expect(m.pairs.every((p) => p.beside)).toBe(true);
});
