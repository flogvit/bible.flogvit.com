// #157: the MCP server was there, and nobody who did not already know of it
// could find it — /en/mcp was 404, there was no llms.txt, and the server's own
// address answered three lines of plain text. Four halves:
//
// SIDA      — /<lang>/mcp on all eight languages carries the address, every
//             tool and every edition, in that language.
// VEIENE    — the page is reachable: footer, /om, the sitemap and llms.txt.
// LANDINGEN — mcp.bible.flogvit.com/ in a browser is the guide in short, in
//             the reader's language, and links to the page in that language.
// BREDDEN   — the landing page in real Chrome at 320/390 px, 100/150 % text.
//             The site page itself is measured by mobile-layout.test.ts: it is
//             in PAGES.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES, makeT } from '../src/lib/i18n.ts';
import { MCP_EDITIONS, MCP_TOOL_NAMES, MCP_URL, SNIPPETS } from '../src/lib/mcp-info.ts';
import { ABOUT, guideUrl, landingHtml, wantsHtml } from '../mcp/src/landing.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const get = (path: string) => app.request(path);
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

beforeAll(async () => {
  await initBooks();
});

describe('SIDA', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/mcp has the address, every tool and every edition — in ${locale}`, async () => {
      const res = await get(`/${locale}/mcp`);
      expect(res.status).toBe(200);
      const html = decode(await res.text());
      const t = makeT(locale);
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(t('mcp.h1'));
      expect(html).toContain(MCP_URL);
      for (const name of MCP_TOOL_NAMES) expect(html).toContain(`<code>${name}</code>`);
      for (const e of MCP_EDITIONS) expect(html).toContain(`href="/${locale}/oversettelser/${e.id}"`);
      // The snippets are code the reader pastes: they must arrive byte for byte.
      for (const code of Object.values(SNIPPETS)) expect(html).toContain(code);
    });
  }

  test('the page is not the same page on two languages', async () => {
    const en = await (await get('/en/mcp')).text();
    const nb = await (await get('/nb/mcp')).text();
    expect(makeT('nb')('mcp.intro')).not.toBe(makeT('en')('mcp.intro'));
    expect(nb).toContain(makeT('nb')('mcp.toolsH'));
    expect(en).not.toContain(makeT('nb')('mcp.toolsH'));
  });
});

describe('VEIENE', () => {
  for (const locale of ['en', 'de'] as const) {
    test(`the footer on /${locale}/ links to /${locale}/mcp`, async () => {
      const html = await (await get(`/${locale}`)).text();
      expect(html).toMatch(new RegExp(`<footer[\\s\\S]*href="/${locale}/mcp"[\\s\\S]*</footer>`));
    });
  }

  test('/om links to the guide, not to the bare server', async () => {
    const html = await (await get('/fr/om')).text();
    expect(html).toContain('href="/fr/mcp"');
  });

  test('the sitemap lists /mcp on every language', async () => {
    for (const locale of LOCALES) {
      const xml = await (await get(`/sitemap-${locale}.xml`)).text();
      expect(xml).toContain(`/${locale}/mcp</loc>`);
    }
  });

  test('llms.txt points to the server and to the guide', async () => {
    const res = await get('/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toStartWith('# FLOGVIT.bible\n');
    expect(body).toContain(MCP_URL);
    expect(body).toContain('/en/mcp');
    // Every link in it must answer — a pointer to a 404 is worse than none.
    for (const [, url] of body.matchAll(/\]\((https:\/\/bible\.flogvit\.com[^)]*)\)/g)) {
      const path = new URL(url!).pathname;
      expect(`${path} ${(await get(path)).status}`).toBe(`${path} 200`);
    }
  });
});

describe('LANDINGEN', () => {
  const req = (accept: string, lang = '') =>
    new Request('https://mcp.bible.flogvit.com/', { headers: { accept, ...(lang && { 'accept-language': lang }) } });

  test('a browser gets HTML; curl and MCP clients get the plain text', () => {
    expect(wantsHtml(req('text/html,application/xhtml+xml,*/*;q=0.8'))).toBe(true);
    expect(wantsHtml(req('*/*'))).toBe(false);
    expect(wantsHtml(req('application/json, text/event-stream'))).toBe(false);
    expect(ABOUT).toContain(MCP_URL);
    expect(ABOUT).toContain(guideUrl('en'));
  });

  for (const [header, locale] of [['de-DE,de;q=0.9,en;q=0.8', 'de'], ['no', 'nb'], ['pt-BR', 'en']] as const) {
    test(`Accept-Language ${header} gets the page in ${locale}, linking to /${locale}/mcp`, () => {
      const { html, locale: got } = landingHtml(req('text/html', header));
      expect(got).toBe(locale);
      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toContain(`href="${guideUrl(locale)}"`);
      expect(decode(html)).toContain(makeT(locale)('mcp.h1'));
      expect(html).toContain(MCP_URL);
    });
  }
});

describe('BREDDEN', () => {
  let server: ReturnType<typeof Bun.serve>;
  let chrome: Chrome;
  let page: Page;

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch: (r) => {
        const lang = new URL(r.url).searchParams.get('lang') ?? 'en';
        const { html } = landingHtml(new Request(r.url, { headers: { accept: 'text/html', 'accept-language': lang } }));
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
    });
    chrome = await Chrome.launch();
    page = await chrome.open('about:blank');
  }, 60_000);

  afterAll(async () => {
    await page?.close();
    await chrome?.close();
    server?.stop(true);
  }, 30_000);

  function measure(scale: number) {
    const de = document.documentElement;
    const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    if (scale !== 1) {
      const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
      els.forEach((el, i) => {
        if (sizes[i]) el.style.fontSize = `${sizes[i]! * scale}px`;
      });
    }
    return { clientWidth: de.clientWidth, scrollWidth: de.scrollWidth };
  }

  // Finnish and German have the longest words; English is the shortest (#70).
  for (const lang of ['en', 'fi', 'de']) {
    for (const width of [320, 390]) {
      for (const scale of [1, 1.5]) {
        test(`the landing page (${lang}) is not wider than ${width} px at ${scale * 100} % text`, async () => {
          await page.setViewport({ width, height: 800 });
          await page.navigate(`http://localhost:${server.port}/?lang=${lang}`);
          const { clientWidth, scrollWidth } = await page.evaluate(measure, scale);
          const overflyt = scrollWidth - clientWidth;
          expect(overflyt > 1 ? `${overflyt} px for bred` : 'ok').toBe('ok');
        });
      }
    }
  }
});
