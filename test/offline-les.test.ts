// OFFLINE: ET KAPITTEL DU ALDRI HAR ÅPNET, UTEN NETT (#136)
//
// Plus lover «offline-nedlasting av hele Bibelen med grunntekst og studiedata».
// Etter en full nedlasting ga `/nb/jes/40` med nettet av likevel Chromes egen
// feilside, av fire grunner som hver for seg var nok:
//
// - SW-en precachet `/offline-fallback`, som svarer 302. En omdirigert respons
//   kan ikke besvare en navigasjon, så reserven feilet alltid.
// - Leseren matchet `/jes/40`, men ikke `/nb/jes/40` — og alle sidene ligger
//   under et språkprefiks.
// - Grunntekst og studiedata lå i IndexedDB, men bare versene ble tegnet.
// - Bare OSNB/OSNN kunne lastes ned, også på /en/offline.
//
// Alt dette er egenskaper ved service workeren, IndexedDB og rendringen i en
// ekte nettleser, så beviset er én: last ned, kutt nettet (serveren stoppes —
// det rammer også SW-ens egne kall, noe nettverksemulering per fane ikke gjør),
// og åpne et kapittel som aldri er besøkt.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import {
  getChapterSummary,
  getOriginalVerses,
  getOriginalWord4WordByVerse,
  getReferencesByVerse,
  getVerses,
  initBooks,
} from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { makeT } from '../src/lib/i18n.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { kontoUser, startMockKonto } from './mock-konto.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// 1 Mos 12: et kapittel med alt — innsikt (liste), kryssreferanser, ord for ord
// og sammendrag på bokmål. Testen besøker det ALDRI med nett.
const BOOK_ID = 1;
const CHAPTER = 12;
const PATH = '/nb/1mos/12';

let server: ReturnType<typeof Bun.serve>;
let mock: ReturnType<typeof Bun.serve>;
let chrome: Chrome;
let page: Page;
let base = '';

beforeAll(async () => {
  mock = startMockKonto({
    plus136: () => kontoUser({ id: 990136, plus: true, plusUntil: '2099-01-01T00:00:00.000Z' }),
  });
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  base = `http://localhost:${server.port}`;
}, 60_000);

afterAll(async () => {
  await page?.close();
  await chrome?.close();
  server?.stop(true);
  mock?.stop(true);
  await closeSql();
}, 30_000);

async function waitFor(what: string, fn: () => boolean | Promise<boolean>, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(fn)) return;
    } catch {
      // siden byttes — prøv igjen
    }
    await Bun.sleep(200);
  }
  throw new Error(`Ventet forgjeves på: ${what}`);
}

describe('offline-siden tilbyr utgavene språket har', () => {
  test('/en/offline tilbyr OSEN, og den er valgt', async () => {
    const html = await (await fetch(`${base}/en/offline`)).text();
    const boxes = [...html.matchAll(/<input[^>]*data-dl-bible="([^"]+)"[^>]*>/g)];
    expect(boxes[0]?.[1]).toBe('osen');
    expect(boxes[0]?.[0]).toContain('checked');
    // Bare den første er forhåndsvalgt — ellers laster alle ned alt.
    expect(boxes.slice(1).every((b) => !b[0].includes('checked'))).toBe(true);
  });

  test('/nb/offline har OSNB først', async () => {
    const html = await (await fetch(`${base}/nb/offline`)).text();
    expect(html.match(/data-dl-bible="([^"]+)"/)?.[1]).toBe('osnb');
  });

  test('skallet finnes under språket og svarer uten omdirigering', async () => {
    const res = await fetch(`${base}/nb/offline-fallback`, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});

test('nedlastet kapittel som aldri er besøkt, leses uten nett — med grunntekst og studiedata', async () => {
  const t = makeT('nb');
  const [verses, original, words, refs, summary] = await Promise.all([
    getVerses(BOOK_ID, CHAPTER, 'osnb'),
    getOriginalVerses(BOOK_ID, CHAPTER),
    getOriginalWord4WordByVerse(BOOK_ID, CHAPTER, 'nb'),
    getReferencesByVerse(BOOK_ID, CHAPTER, 'nb'),
    getChapterSummary(BOOK_ID, CHAPTER, 'nb'),
  ]);
  // Uten innhold i basen måler testen ingenting — da skal den si det.
  expect(verses.length).toBeGreaterThan(0);
  expect(original.length).toBeGreaterThan(0);
  expect(words.get(1)?.length ?? 0).toBeGreaterThan(0);
  expect(refs.size).toBeGreaterThan(0);
  expect(summary).toBeTruthy();

  chrome = await Chrome.launch();
  page = await chrome.open(`${base}/nb/om`);
  await page.evaluate(() => {
    document.cookie = 'fv-session=plus136; path=/';
  });
  await page.navigate(`${base}/nb/offline`);
  await waitFor('service workeren styrer siden', () => !!navigator.serviceWorker.controller);
  await waitFor('Pluss er gjenkjent', () => /(?:^|;\s*)fv-auth=2/.test(document.cookie));

  // ── Last ned (OSNB er forhåndsvalgt på /nb/) ────────────────────────
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-dl-start]')!.click());
  const done = t('is.downloadDone');
  await waitFor(
    'nedlastingen er ferdig',
    new Function(`return document.querySelector('[data-dl-text]')?.textContent === ${JSON.stringify(done)};`) as () => boolean,
    300_000,
  );

  // Ingen dobbel lagring: kapitlene ligger i IndexedDB, ikke OGSÅ i SW-cachen.
  const apiCopies = await page.evaluate(async () => {
    const cache = await caches.open('bibel-api-v1');
    return (await cache.keys()).filter((r) => r.url.includes('/api/chapter')).length;
  });
  expect(apiCopies).toBe(0);

  // ── Kutt nettet ─────────────────────────────────────────────────────
  server.stop(true);
  await page.navigate(`${base}${PATH}`);

  const shown = await page.evaluate(() => ({
    title: document.querySelector('.chapter-title')?.textContent ?? '',
    verses: document.querySelectorAll('.verses .verse').length,
    first: document.querySelector('#v1 .verse-text')?.textContent ?? '',
    original: document.querySelector('#v1 .original-verse')?.textContent ?? '',
    summary: document.querySelector('.st-summary-item .st-summary-text')?.textContent ?? '',
    insight: !!document.querySelector('.insights-panel'),
  }));
  expect(shown.title).toContain('1. Mosebok');
  expect(shown.verses).toBe(verses.length);
  expect(shown.first).toBe(verses[0]!.text);
  expect(shown.original).toContain(original[0]!.text);
  expect(shown.summary.replace(/\s+/g, ' ')).toContain(summary!.replace(/\*\*/g, '').split('\n')[0]!.trim().slice(0, 40));
  expect(shown.insight).toBe(true);

  // Grunnteksten under versene, som skinnens «Grunntekst» på nett.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.chapter-rail button.rail-chip')!.click());
  expect(await page.evaluate(() => (document.querySelector('#v1 .original-verse') as HTMLElement).offsetHeight > 0)).toBe(true);

  // Versdetaljen: ord for ord og kryssreferansene.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#v1 .verse-number')!.click());
  const detail = await page.evaluate(() => ({
    visible: (document.querySelector('#v1-detail') as HTMLElement).offsetHeight > 0,
    words: document.querySelectorAll('#v1-detail .w4w-word').length,
    refs: document.querySelectorAll('#v1-detail .vd-reference').length,
  }));
  expect(detail.visible).toBe(true);
  expect(detail.words).toBe(words.get(1)!.length);
  expect(detail.refs).toBe(refs.get(1)?.length ?? 0);

  // Et ord forklares, som på nett.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#v1-detail .w4w-word')!.click());
  expect(await page.evaluate(() => !(document.querySelector('#v1-detail .w4w-explain') as HTMLElement).hidden)).toBe(true);

  // ── Ingen bredere enn skjermen (320/390 px, 100/150 % tekst) ────────
  // Kapittelet tegnes bare offline, så det står utenfor `PAGES`-sveipen i
  // mobile-layout.test.ts. Målt med versdetaljen ÅPEN — det er den bredeste
  // formen (ord-for-ord-knappene og referansene).
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#v1-detail [data-vd-tab="references"]')!.click());
  for (const width of [320, 390]) {
    await page.setViewport({ width, height: 800 });
    for (const scale of [1, 1.5]) {
      const m = await page.evaluate((s: number) => {
        const els = [...document.querySelectorAll<HTMLElement>('*')];
        const original = els.map((el) => el.style.fontSize);
        const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
        if (s !== 1) els.forEach((el, i) => sizes[i] && (el.style.fontSize = `${sizes[i]! * s}px`));
        const de = document.documentElement;
        const out = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
        els.forEach((el, i) => (el.style.fontSize = original[i]!));
        return out;
      }, scale);
      expect(`${width}px/${scale * 100}%: ${m.scrollWidth}`).toBe(`${width}px/${scale * 100}%: ${m.clientWidth}`);
    }
  }
}, 420_000);
