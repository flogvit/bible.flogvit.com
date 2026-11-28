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
 * Et avsnitt som ren tekst: henvisninger blir teksten sin, all markup går.
 * Brukes av søket og av smakebiten i studiepanelet.
 * @param {string} text
 */
export function commentaryPlain(text) {
  return String(text)
    .replace(/<ref osisRef="[^"]*">([\s\S]*?)<\/ref>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Begynnelsen av en tekst, kuttet ved et ordskille (#286): smakebiten i
 * studiepanelet. Teksten er ren (`commentaryPlain`), så kuttet kan ikke dele
 * en tagg.
 * @param {string} text
 * @param {number} [max]
 */
export function commentaryTeaser(text, max = 160) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

// ── Formen leseren ser (#286) ─────────────────────────────────────────
// Kilden (SWORD MHC) har to vaner som gjorde blokka uleselig:
//   1. Hver seksjon begynner med bibelteksten den kommenterer, som et avsnitt
//      som starter med `<sup>N</sup>`. Leseren har teksten i hovedspalten.
//   2. I 64 bøker står bokas innledning — i 1 Mos hele forordet til de fem
//      Mosebøkene — og kapittelets innledning limt inn FORAN første seksjon av
//      kapittel 1, altså under «Vers 1–2». Målt over alle 66 bøkene: det SISTE
//      avsnittet i det innlimte (som ikke er en overskrift) er alltid
//      kapittelets innledning («We have three things in this chapter»), resten
//      er bokas.
// Formingen skjer her, ett sted, så siden, API-et, MCP-en og et kapittel som
// ble lastet ned før denne regelen fikk samme form.

const VERSE_QUOTE = /^\s*<sup>\d+<\/sup>/;

/**
 * Hvor mange avsnitt foran seksjonens egen kommentar som er innlimt
 * innledning: alt foran overskriften som står foran første versitat. Ingen
 * versitat = ingen innlimt innledning.
 * @param {string[]} paragraphs
 */
function leadLength(paragraphs) {
  const quote = paragraphs.findIndex((p) => VERSE_QUOTE.test(p));
  if (quote <= 0) return 0;
  return isHeadingOnly(paragraphs[quote - 1]) ? quote - 1 : quote;
}

/**
 * @typedef {{ chapter: number, verse: number }} At
 * @typedef {{ sourceChapter: number, sectionNo: number, from: At, to: At, paragraphs: string[], sourceParagraphs: string[] | null, models: string[] | null }} RawSection
 * @typedef {RawSection & { id: string }} CommentaryPart
 */

/**
 * Ett verks seksjoner for et kapittel, formet for leseren: versitatene ute,
 * bokas innledning skilt ut (`bookIntro`, id `book`), og kapittelets
 * innledning som egen del (vers 0, id `<kap>-<nr>-intro`). Avsnitt i i
 * gjengivelsen er avsnitt i i kilden, så delingen regnes på KILDENS indekser
 * når antallet stemmer — ellers på gjengivelsen alene, og delen får da ingen
 * original (en forskjøvet original er verre enn ingen).
 * @param {RawSection[]} sections
 * @returns {{ bookIntro: CommentaryPart | null, sections: CommentaryPart[] }}
 */
export function shapeCommentary(sections) {
  const isIntro = (s) => s.from.verse === 0 && s.to.verse === 0;
  const first = sections
    .filter((s) => s.sourceChapter === 1 && !isIntro(s))
    .reduce((a, s) => (a && a.sectionNo <= s.sectionNo ? a : s), null);

  /** @type {CommentaryPart | null} */
  let book = null;
  const seenHeadings = new Set();
  /** @type {CommentaryPart[]} */
  const out = [];

  for (const s of sections) {
    const aligned = !!s.sourceParagraphs && s.sourceParagraphs.length === s.paragraphs.length;
    const key = aligned ? s.sourceParagraphs : s.paragraphs;
    const pick = (start, end, keep = () => true) => {
      const idx = [];
      for (let i = start; i < end; i++) if (!VERSE_QUOTE.test(key[i]) && keep(i)) idx.push(i);
      return {
        paragraphs: idx.map((i) => s.paragraphs[i]),
        sourceParagraphs: aligned ? idx.map((i) => s.sourceParagraphs[i]) : null,
      };
    };
    const toBook = (start, end) => {
      const p = pick(start, end, (i) => {
        if (!isHeadingOnly(key[i])) return true;
        const h = commentaryPlain(key[i]).toLowerCase();
        if (seenHeadings.has(h)) return false;
        seenHeadings.add(h);
        return true;
      });
      if (!book) {
        book = { ...s, id: 'book', sourceChapter: 0, sectionNo: 0, from: { chapter: s.from.chapter, verse: 0 }, to: { chapter: s.from.chapter, verse: 0 }, ...p };
      } else {
        book.paragraphs.push(...p.paragraphs);
        book.sourceParagraphs = book.sourceParagraphs && p.sourceParagraphs ? [...book.sourceParagraphs, ...p.sourceParagraphs] : null;
      }
    };

    if (s.sourceChapter === 0) {
      toBook(0, s.paragraphs.length);
      continue;
    }
    let start = 0;
    if (s === first) {
      const lead = leadLength(key);
      let lastBody = lead - 1;
      while (lastBody >= 0 && isHeadingOnly(key[lastBody])) lastBody--;
      if (lastBody >= 0) {
        if (lastBody > 0) toBook(0, lastBody);
        const at = { chapter: s.from.chapter, verse: 0 };
        out.push({ ...s, id: `${s.sourceChapter}-${s.sectionNo}-intro`, from: at, to: at, ...pick(lastBody, lead) });
        start = lead;
      }
    }
    // En del som alt er formet, beholder adressen sin: formingen er stabil.
    const part = { ...s, id: s.id ?? `${s.sourceChapter}-${s.sectionNo}`, ...pick(start, s.paragraphs.length) };
    // En seksjon som bare var overskrift og bibeltekst har ingenting å si.
    if (part.paragraphs.some((p) => !isHeadingOnly(p))) out.push(part);
  }
  return { bookIntro: book, sections: out };
}

/**
 * Er verket slått på for leseren (#286)? Ett bryter per verk i innstillingene
 * (`commentaries.<id>`), på som standard. Den gamle felles bryteren
 * (`showCommentary`, #269) gjelder til leseren har valgt per verk.
 * @param {Record<string, any>} settings
 * @param {string} work
 */
export function commentaryOn(settings, work) {
  const own = settings?.commentaries?.[work];
  if (typeof own === 'boolean') return own;
  return settings?.showCommentary !== false;
}

/**
 * Skjuler alt som viser et verk leseren har slått av: hvert element med
 * `data-commentary-work`, og en samling (`data-commentary-group`) som da står
 * uten noe synlig verk.
 * @param {Record<string, any>} settings
 * @param {ParentNode} [root]
 */
export function hideCommentariesTurnedOff(settings, root = document) {
  root.querySelectorAll('[data-commentary-work]').forEach((el) => {
    if (!commentaryOn(settings, el.getAttribute('data-commentary-work'))) el.style.display = 'none';
  });
  root.querySelectorAll('[data-commentary-group]').forEach((g) => {
    const shown = [...g.querySelectorAll('[data-commentary-work]')].some((el) => el.style.display !== 'none');
    if (!shown) g.style.display = 'none';
  });
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
