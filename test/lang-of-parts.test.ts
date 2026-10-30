// WCAG 3.1.2, Language of Parts (#166): a Hebrew or Greek word in prose of
// another language must sit in an element with lang="he" / lang="el". The
// marking happens on the rendered HTML (src/lib/lang-of-parts.ts); this holds
// the rule (pure) and the pages the issue was measured on (rendered), so a new
// component that prints a Hebrew word is measured without anyone listing it.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { Window } from 'happy-dom';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { markLanguageOfParts } from '../src/lib/lang-of-parts.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

describe('the rule', () => {
  test('a Hebrew word in English prose gets lang="he" and dir="rtl"', () => {
    expect(markLanguageOfParts(`<p>Abaddon (Hebrew: אֲבַדּוֹן, 'destruction')</p>`)).toBe(
      `<p>Abaddon (Hebrew: <span lang="he" dir="rtl">אֲבַדּוֹן</span>, 'destruction')</p>`,
    );
  });

  test('a Greek phrase is one run, across its spaces', () => {
    expect(markLanguageOfParts('<p>the word ἐν ἀρχῇ ἦν here</p>')).toBe('<p>the word <span lang="el">ἐν ἀρχῇ ἦν</span> here</p>');
  });

  test('a gershayim written as a quote stays inside the run (תנ"ך)', () => {
    expect(markLanguageOfParts('<a>תנ&quot;ך</a>')).toBe('<a><span lang="he" dir="rtl">תנ&quot;ך</span></a>');
  });

  test('text already in its language is left alone', () => {
    const html = '<div lang="he"><p>בְּרֵאשִׁית <b>בָּרָא</b></p></div><p lang="el">λόγος</p><p lang="hbo">אב</p>';
    expect(markLanguageOfParts(html)).toBe(html);
  });

  test('the language ends where its element does', () => {
    expect(markLanguageOfParts('<div><span lang="he">אב</span> and אם</div>')).toBe(
      '<div><span lang="he">אב</span> and <span lang="he" dir="rtl">אם</span></div>',
    );
  });

  test('attributes, comments and raw-text elements are not touched', () => {
    const html =
      '<a title="אב" data-x="λόγος">x</a><!-- אב --><script>const a = "אב" < 2;</script><style>/* אב */</style>' +
      '<title>אב</title><textarea>אב</textarea><select><option>אב</option></select>';
    expect(markLanguageOfParts(html)).toBe(html);
  });

  test('void and self-closing elements do not open a scope', () => {
    expect(markLanguageOfParts('<p lang="he"><br>אב<img src="x"/>אם</p>')).toBe('<p lang="he"><br>אב<img src="x"/>אם</p>');
  });

  test('marking twice changes nothing more', () => {
    const once = markLanguageOfParts('<p>Hebrew אב and Greek λόγος</p>');
    expect(markLanguageOfParts(once)).toBe(once);
  });

  test('a page with neither script is returned as it is', () => {
    const html = '<p>Only English, ä ø å.</p>';
    expect(markLanguageOfParts(html)).toBe(html);
  });
});

/** Hebrew and Greek letters in text that is not inside an element of their language. */
function unmarked(html: string): string[] {
  const window = new Window();
  window.document.write(html);
  const out: string[] = [];
  const walk = window.document.createTreeWalker(window.document.body, 4 /* SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? '';
    const he = /[א-ת]/.test(text);
    const el = /[Α-Ωα-ωἀ-῿]/.test(text);
    if (!he && !el) continue;
    const parent = n.parentElement;
    if (!parent || parent.closest('script, style, template, textarea, option, title')) continue;
    const lang = (parent.closest('[lang]')?.getAttribute('lang') ?? '').toLowerCase().split('-')[0];
    const right = he ? ['he', 'hbo'] : ['el', 'grc'];
    if (!right.includes(lang!)) out.push(`<${parent.tagName.toLowerCase()} class="${parent.className}"> «${text.trim().slice(0, 40)}» (lang="${lang}")`);
  }
  window.close();
  return [...new Set(out)];
}

describe('the pages #166 was measured on', () => {
  const app = createApp();
  const PAGES = [
    '/en/1mos/1',
    '/en/1mos/12',
    '/en/matt/1',
    '/en/personer',
    '/en/personer/abaddon',
    '/en/profetier',
    '/en/tall',
    '/en/tall/7',
    '/en/sok?q=gud',
    '/nb/1mos/1',
  ];
  for (const path of PAGES) {
    test(`${path}: every Hebrew and Greek run is in its language`, async () => {
      const res = await app.request(`http://x${path}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(unmarked(html)).toEqual([]);
    });
  }

  test('the sweep finds something to measure', async () => {
    // Without Hebrew or Greek on the pages, the sweep above measures nothing.
    const html = await (await app.request('http://x/en/personer/abaddon')).text();
    expect(html).toMatch(/<span lang="he" dir="rtl">[^<]*[א-ת]/);
  });
});
