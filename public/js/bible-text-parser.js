// Parser for opplastede bibeltekster (#14) — port av gamle bibleTextParser.
// Linjeformat: «1 Mos 1,1 I begynnelsen skapte Gud himmelen og jorden.»
// Boknavn matches greedy (lengste prefiks) mot mappingens bookNames, deretter
// «kapittel,vers tekst». Versene beholder opplastingens egen nummerering.

const MAX_WARNINGS = 50;

/**
 * @param {string} text - hele den opplastede teksten
 * @param {Record<string, number>} bookNames - «1 Mos» → bookId fra mappingen
 * @param {string} bibleId - 'user:<uuid>'
 * @returns {{chapters: object[], stats: {books:number, chapters:number, verses:number}, warnings: string[]}}
 */
export function parseBibleText(text, bookNames, bibleId) {
  // Lengste boknavn først så «1 Mos» ikke matches av «Mos»-lignende kortformer.
  const names = Object.keys(bookNames).sort((a, b) => b.length - a.length);
  const byChapter = new Map(); // 'bookId-chapter' → verse[]
  const warnings = [];
  let lineNo = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    lineNo++;
    const line = rawLine.trim();
    if (!line) continue;

    let bookId = null;
    let rest = null;
    for (const name of names) {
      if (line.startsWith(name + ' ')) {
        bookId = bookNames[name];
        rest = line.slice(name.length + 1);
        break;
      }
    }
    if (bookId == null) {
      if (warnings.length < MAX_WARNINGS) warnings.push(`Linje ${lineNo}: fant ikke boknavn — «${line.slice(0, 60)}»`);
      continue;
    }

    const m = rest.match(/^(\d+),(\d+)\s+(.+)$/);
    if (!m) {
      if (warnings.length < MAX_WARNINGS) warnings.push(`Linje ${lineNo}: forventet «kapittel,vers tekst» — «${rest.slice(0, 60)}»`);
      continue;
    }
    const chapter = parseInt(m[1], 10);
    const verse = parseInt(m[2], 10);
    const key = `${bookId}-${chapter}`;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key).push({ id: 0, book_id: bookId, chapter, verse, text: m[3], bible: bibleId });
  }

  const chapters = [];
  const books = new Set();
  let verses = 0;
  for (const [key, list] of byChapter) {
    const [bookId, chapter] = key.split('-').map(Number);
    list.sort((a, b) => a.verse - b.verse);
    books.add(bookId);
    verses += list.length;
    chapters.push({ bookId, chapter, bible: bibleId, cachedAt: Date.now(), verses: list });
  }
  chapters.sort((a, b) => a.bookId - b.bookId || a.chapter - b.chapter);

  return { chapters, stats: { books: books.size, chapters: chapters.length, verses }, warnings };
}
