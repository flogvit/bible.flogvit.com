// Kommentaravsnittenes markup (#269), delt av serveren (lesesiden, MCP-en) og
// frakoblet lesing — samme grep som verse-hash.js: ÉN rendrer, så siden og
// det nedlastede kapittelet ikke kan drive fra hverandre.
//
// Kilden har `<h>`, `<i>`, `<b>`, `<sup>` og `<ref osisRef="…">`. Teksten
// escapes FØRST og de kjente taggene gjenopprettes etterpå, så ingenting fra
// kilden når siden som rå HTML — heller ikke et attributt på en kjent tagg.

/**
 * OSIS-bokkodene, slik `<ref osisRef>` skriver dem. Skrevet ut framfor å
 * avledes av en visningsliste: en endret forkortelse i grensesnittet skal ikke
 * kunne bryte lenkene.
 */
export const OSIS_BOOKS = {
  Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8, '1Sam': 9, '2Sam': 10,
  '1Kgs': 11, '2Kgs': 12, '1Chr': 13, '2Chr': 14, Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19,
  Prov: 20, Eccl: 21, Song: 22, Isa: 23, Jer: 24, Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29,
  Amos: 30, Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36, Hag: 37, Zech: 38, Mal: 39,
  Matt: 40, Mark: 41, Luke: 42, John: 43, Acts: 44, Rom: 45, '1Cor': 46, '2Cor': 47, Gal: 48,
  Eph: 49, Phil: 50, Col: 51, '1Thess': 52, '2Thess': 53, '1Tim': 54, '2Tim': 55, Titus: 56,
  Phlm: 57, Heb: 58, Jas: 59, '1Pet': 60, '2Pet': 61, '1John': 62, '2John': 63, '3John': 64,
  Jude: 65, Rev: 66,
};

/**
 * Begynnelsen på en OSIS-henvisning («Gen.1.14-Gen.1.15» → 1 Mos 1:14).
 * @param {string} ref
 * @returns {{ book: number, chapter: number, verse: number } | null}
 */
export function parseOsisRef(ref) {
  const first = String(ref).split(/[-\s;,]/)[0] ?? '';
  const m = first.match(/^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const book = OSIS_BOOKS[m[1]];
  if (!book) return null;
  return { book, chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : 0 };
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Et avsnitt som trygg HTML. `link` gir adressen til en henvisning, eller null
 * når den ikke kan løses (da står teksten uten lenke).
 * @param {string} text
 * @param {(osisRef: string) => string | null} link
 * @returns {string}
 */
export function renderCommentaryParagraph(text, link) {
  let html = escapeHtml(String(text));
  html = html.replace(/&lt;(\/?)(i|b|sup)&gt;/g, '<$1$2>');
  html = html.replace(/&lt;h&gt;([\s\S]*?)&lt;\/h&gt;/g, '<strong class="cm-heading">$1</strong>');
  html = html.replace(/&lt;ref osisRef=&quot;([^&]*)&quot;&gt;([\s\S]*?)&lt;\/ref&gt;/g, (_m, ref, label) => {
    const href = link(ref);
    return href ? `<a class="cm-ref" href="${escapeHtml(href)}">${label}</a>` : label;
  });
  return html;
}

/**
 * Er avsnittet bare en overskrift? Da står det som overskrift, ikke som brødtekst.
 * @param {string} text
 */
export function isHeadingOnly(text) {
  return /^\s*<h>[\s\S]*<\/h>\s*$/.test(String(text));
}

/**
 * Et avsnitt som markdown, for MCP-svaret og andre tekstflater: overskrifter og
 * kursiv beholdes, en henvisning blir teksten sin, og ingen HTML slipper ut.
 * @param {string} text
 */
export function commentaryMarkdown(text) {
  return String(text)
    .replace(/<h>([\s\S]*?)<\/h>/g, '**$1**')
    .replace(/<\/?(?:i|b)>/g, '*')
    .replace(/<\/?sup>/g, '')
    .replace(/<ref osisRef="[^"]*">([\s\S]*?)<\/ref>/g, '$1')
    .replace(/<[^>]+>/g, '');
}
