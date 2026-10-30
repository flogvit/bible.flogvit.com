// WCAG 2.1 SC 3.1.2, Language of Parts (#166): a Hebrew or Greek word quoted in
// prose of another language — «Abaddon (Hebrew: אֲבַדּוֹן, 'destruction')» in a
// footnote, a person card, a study note — must sit in an element with
// `lang="he"` / `lang="el"`, or a screen reader reads it with the page
// language's pronunciation.
//
// The prose comes from the content data and is rendered by about a dozen
// components, so the marking is done ONCE, on the rendered HTML, rather than
// in each component (where the next one would forget it). It runs inside the
// microcache (app.ts), so a cached page carries the marks and the cost is paid
// once per render, not once per visit: a page without a single Hebrew or Greek
// letter is returned untouched after one regex test.
//
// What is NOT touched: attributes, comments, and the content of `<script>`,
// `<style>`, `<textarea>`, `<title>`, `<option>` and `<template>` — a span
// there is either text or invalid. Text already inside an element with the
// right `lang` (the Bible text in Tanach/SBLGNT, the original-text strip) is
// left as it is.

const HE_LETTER = '\\u05D0-\\u05EA\\uFB1D-\\uFB4F';
const HE = `\\u0591-\\u05F4\\uFB1D-\\uFB4F`;
/** A Hebrew run: letters and points, across spaces, maqaf and a gershayim written as a quote. */
const HE_RUN = new RegExp(`[${HE}]+(?:(?:[ \\u00A0\\u05BE]+|&quot;|")[${HE}]+)*`, 'g');
const EL = '\\u0370-\\u03FF\\u1F00-\\u1FFF';
/** A Greek run: letters with their accents, across single spaces. */
const EL_RUN = new RegExp(`[${EL}](?:[\\u0300-\\u036F${EL}]|[ \\u00A0](?=[${EL}]))*`, 'g');
const HAS_SCRIPT = new RegExp(`[${HE_LETTER}\\u0391-\\u03C9\\u1F00-\\u1FFF]`);
const HE_HAS_LETTER = new RegExp(`[${HE_LETTER}]`);
const EL_HAS_LETTER = /[Α-Ωα-ωἀ-῿]/;

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'option', 'template']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// A tag ends at the first `>`: hono escapes `>` in attribute values.
/** a-z, A-Z, 0-9, '-', ':' — the characters of a tag name. */
const isNameChar = (c: number) =>
  (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 58) || c === 45;
const SCRIPT = new RegExp(HAS_SCRIPT.source, 'g');

const baseLang = (lang: string | null) => (lang ?? '').toLowerCase().split('-')[0]!;

/** Wrap the Hebrew and Greek runs of one text node that are not already in their language. */
function markText(text: string, lang: string): string {
  if (!HAS_SCRIPT.test(text)) return text;
  let out = text;
  if (lang !== 'he' && lang !== 'hbo') {
    out = out.replace(HE_RUN, (run) => (HE_HAS_LETTER.test(run) ? `<span lang="he" dir="rtl">${run}</span>` : run));
  }
  if (lang !== 'el' && lang !== 'grc') {
    // Greek after Hebrew: a span the Hebrew pass made has only Hebrew in it, and
    // its own markup is ASCII, so the Greek pass cannot reach into it.
    out = out.replace(EL_RUN, (run) => (EL_HAS_LETTER.test(run) ? `<span lang="el">${run}</span>` : run));
  }
  return out;
}

/** Mark every Hebrew and Greek run in prose of another language (WCAG 3.1.2). */
export function markLanguageOfParts(html: string): string {
  const findScript = (from: number) => {
    SCRIPT.lastIndex = from;
    return SCRIPT.exec(html)?.index ?? Infinity;
  };
  let next = findScript(0);
  if (next === Infinity) return html;
  // Only the TAGS are scanned; a text node is looked at only when the next
  // Hebrew or Greek letter falls inside it. Most of a page has neither, and a
  // tokenizer that visited every text node cost as much as the render itself.
  // Unchanged HTML is copied in slices between the text nodes that change.
  const out: string[] = [];
  let copied = 0;
  // Open elements and the `lang` each one sets ('' when it sets none).
  const tags: string[] = [];
  const langs: string[] = [];
  const currentLang = () => {
    for (let i = langs.length - 1; i >= 0; i--) if (langs[i]) return langs[i]!;
    return '';
  };
  const text = (from: number, to: number) => {
    const node = html.slice(from, to);
    const marked = markText(node, currentLang());
    if (marked === node) return;
    out.push(html.slice(copied, from), marked);
    copied = to;
  };
  // The tags are found with indexOf, not a regex: on a 650 kB chapter page a
  // regex over the tags cost four times as much (measured in the same run).
  const langAt: number[] = [];
  for (let i = html.indexOf(' lang='); i >= 0; i = html.indexOf(' lang=', i + 6)) langAt.push(i);
  let li = 0;
  let pos = 0; // the end of the last tag: text runs from here to the next tag
  for (let lt = html.indexOf('<'); lt >= 0; lt = html.indexOf('<', pos)) {
    if (next < lt && next >= pos) text(pos, lt);
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      pos = end < 0 ? html.length : end + 3;
    } else {
      const gt = html.indexOf('>', lt);
      if (gt < 0) break;
      pos = gt + 1;
      const closing = html.charCodeAt(lt + 1) === 47; // '/'
      const start = lt + (closing ? 2 : 1);
      let stop = start;
      while (stop < gt && isNameChar(html.charCodeAt(stop))) stop++;
      if (stop > start) {
        const tag = html.slice(start, stop).toLowerCase();
        if (closing) {
          const at = tags.lastIndexOf(tag);
          if (at >= 0) tags.length = langs.length = at;
        } else if (RAW_TEXT.has(tag)) {
          // Skipped up to its own closing tag. Our markup is lower case; a
          // lower-cased copy of the page per tag made this quadratic (a chapter
          // page has ~1 160 <option>s: 67 s for one page).
          const end = html.indexOf(`</${tag}`, pos);
          pos = end < 0 ? html.length : end;
        } else if (!VOID.has(tag) && html.charCodeAt(gt - 1) !== 47) {
          tags.push(tag);
          // The `lang=` positions are found once for the page and walked in
          // step: slicing every tag's attributes to look for one cost three
          // times the rest of the pass (a page with Hebrew is two bytes a char).
          while (li < langAt.length && langAt[li]! < lt) li++;
          const at = langAt[li];
          langs.push(at !== undefined && at < gt ? baseLang(/^ lang=["']([^"']*)/.exec(html.slice(at, Math.min(gt, at + 24)))?.[1] ?? null) : '');
        }
      }
    }
    if (next < pos) next = findScript(pos);
  }
  if (next < html.length) text(pos, html.length);
  if (copied === 0) return html;
  out.push(html.slice(copied));
  return out.join('');
}

/** Middleware: marks the HTML responses on their way out (#166). */
export async function withLanguageOfParts(
  c: { res: Response },
  next: () => Promise<void>,
): Promise<void> {
  await next();
  const type = c.res.headers.get('content-type') ?? '';
  if (!type.startsWith('text/html') || !c.res.body) return;
  const body = await c.res.text();
  const marked = markLanguageOfParts(body);
  const headers = new Headers(c.res.headers);
  headers.delete('content-length');
  c.res = new Response(marked, { status: c.res.status, statusText: c.res.statusText, headers });
}
