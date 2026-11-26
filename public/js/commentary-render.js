// Kommentaravsnittenes markup (#269), delt av serveren (lesesiden, MCP-en) og
// frakoblet lesing — samme grep som verse-hash.js: ÉN rendrer, så siden og
// det nedlastede kapittelet ikke kan drive fra hverandre.
//
// Kilden har `<h>`, `<i>`, `<b>`, `<sup>` og `<ref osisRef="…">`. Teksten
// escapes FØRST og de kjente taggene gjenopprettes etterpå, så ingenting fra
// kilden når siden som rå HTML — heller ikke et attributt på en kjent tagg.

/**
 * OSIS-bokkodene, slik `<ref osisRef>` skriver dem, i kanonisk rekkefølge:
 * plass + 1 er bok-id-en. Skrevet ut framfor å avledes av en visningsliste: en
 * endret forkortelse i grensesnittet skal ikke kunne bryte lenkene.
 */
export const OSIS_BOOKS = Object.fromEntries(
  (
    'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song ' +
    'Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal ' +
    'Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas ' +
    '1Pet 2Pet 1John 2John 3John Jude Rev'
  )
    .split(' ')
    .map((code, i) => [code, i + 1]),
);

/**
 * En OSIS-henvisning: starten, og slutten når den er en rekke i samme bok
 * («Gen.1.14-Gen.1.15» → 1 Mos 1:14–15). Flere henvisninger etter hverandre
 * («Gen.1.1 Gen.1.3») gir den første.
 * @param {string} ref
 * @returns {{ book: number, chapter: number, verse: number, endChapter: number, endVerse: number } | null}
 */
export function parseOsisRef(ref) {
  const [first = '', second = ''] = String(ref).split(/\s+/)[0].split('-');
  const point = (s) => s.match(/^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?$/);
  const a = point(first);
  if (!a) return null;
  const book = OSIS_BOOKS[a[1]];
  if (!book) return null;
  const chapter = Number(a[2]);
  const verse = a[3] ? Number(a[3]) : 0;
  const b = second ? point(second) : null;
  const sameBook = b && OSIS_BOOKS[b[1]] === book;
  return {
    book,
    chapter,
    verse,
    endChapter: sameBook ? Number(b[2]) : chapter,
    endVerse: sameBook ? (b[3] ? Number(b[3]) : 0) : verse,
  };
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
    // `link` gir en adresse, eller { href, labelNumbering } når etiketten er i
    // verkets egen nummerering og adressen i lesesidens (KJV Sal 38:13 er osnb
    // 38:14): siden sier det i HTML-en, så versrekke-vakta (#91) vet hvorfor.
    const target = link(ref);
    if (!target) return label;
    const href = typeof target === 'string' ? target : target.href;
    const numbering = typeof target === 'string' ? '' : target.labelNumbering || '';
    const attr = numbering ? ` data-label-numbering="${escapeHtml(numbering)}"` : '';
    return `<a class="cm-ref" href="${escapeHtml(href)}"${attr}>${label}</a>`;
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
