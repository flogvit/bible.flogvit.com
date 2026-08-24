import { Hono } from 'hono';
import {
  findBook,
  formatParsedReference,
  getBookSuggestions,
  looksLikeReference,
  parseReference,
  referenceErrorText,
} from '../../lib/reference-parser.ts';
import { getAllBooks, getVerseCount } from '../../lib/bible.ts';
import { tFor } from '../../lib/i18n.ts';

const r = new Hono();

/**
 * GET /api/reference?q= — parse en bibelreferanse.
 *
 * Feiltekstene går gjennom ordboka (#71). Ruta har alt riktig locale
 * (`apiLocale`, #24), og parseren gir en NØKKEL framfor ferdig tekst — sto
 * teksten der, sto den på norsk for alle åtte språk.
 */
r.get('/', async (c) => {
  const t = tFor(c);
  const query = c.req.query('q') || '';

  if (!query || query.length < 1) {
    return c.json({ success: false, error: t('ref.err.missingQuery') });
  }
  if (!looksLikeReference(query)) {
    return c.json({ success: false, isReference: false, error: t('ref.err.notReference') });
  }

  const result = parseReference(query);

  if (result.success && result.reference) {
    const verseCount = await getVerseCount(result.reference.book.id, result.reference.chapter);

    if (result.reference.verseStart && result.reference.verseStart > verseCount) {
      return c.json({
        success: false,
        isReference: true,
        error: referenceErrorText(t, {
          key: 'ref.err.verseCount',
          bookId: result.reference.book.id,
          params: {
            book: result.reference.book.name_no,
            chapter: result.reference.chapter,
            count: verseCount,
          },
        }),
        partial: {
          book: result.reference.book,
          chapter: result.reference.chapter,
          verseCount,
        },
      });
    }

    return c.json({
      success: true,
      isReference: true,
      reference: {
        book: result.reference.book,
        chapter: result.reference.chapter,
        verseStart: result.reference.verseStart,
        verseEnd: result.reference.verseEnd,
        url: result.reference.url,
        formatted: formatParsedReference(result.reference),
        verseCount,
      },
    });
  }

  return c.json({
    success: false,
    isReference: true,
    error: result.error ? referenceErrorText(t, result.error) : undefined,
    suggestions: result.suggestions?.map((s) => ({ book: s.book, matchedAlias: s.matchedAlias })),
    partial: result.partial
      ? { book: result.partial.book, chapter: result.partial.chapter }
      : undefined,
  });
});

/** GET /api/reference/suggest?q=&book=&chapter= — autofullfør. */
r.get('/suggest', async (c) => {
  const query = c.req.query('q') || '';
  const bookId = c.req.query('book');
  const chapter = c.req.query('chapter');

  if (bookId && chapter) {
    const verseCount = await getVerseCount(parseInt(bookId, 10), parseInt(chapter, 10));
    return c.json({ verseCount });
  }

  if (!query) {
    const books = getAllBooks();
    return c.json({
      suggestions: books.map((book) => ({ book, matchedAlias: book.short_name })),
    });
  }

  const suggestions = getBookSuggestions(query);
  const exactBook = findBook(query);
  if (exactBook) {
    return c.json({
      suggestions:
        suggestions.length > 0 ? suggestions : [{ book: exactBook, matchedAlias: query }],
      selectedBook: exactBook,
    });
  }
  return c.json({ suggestions });
});

export default r;
