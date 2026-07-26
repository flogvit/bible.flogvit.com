import { Hono } from 'hono';
import {
  getVerse,
  getVerses,
  getOriginalVerses,
  getOriginalVerse,
  getBookSummary,
  getChapterSummary,
  getChapterContext,
  getChapterInsight,
  getOriginalWord4Word,
  getReferences,
  normalizeBibleId,
} from '../../lib/bible.ts';
import { mapChapter, resolveMappingId } from '../../lib/verse-mapper.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/**
 * GET /api/chapter?book=&chapter=&bible=&mapping=&secondary=
 * Med `mapping` remappes versnummereringen fra osnb til målsystemet (KVN).
 */
r.get('/', async (c) => {
  const bookIdStr = c.req.query('book');
  const chapterStr = c.req.query('chapter');
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
  const mapping = normalizeBibleId(c.req.query('mapping'));

  if (!bookIdStr || !chapterStr) {
    return c.json({ error: 'Missing required parameters: book and chapter' }, 400);
  }
  const bookId = parseInt(bookIdStr, 10);
  const chapter = parseInt(chapterStr, 10);
  if (isNaN(bookId) || isNaN(chapter)) {
    return c.json({ error: 'Invalid book or chapter number' }, 400);
  }
  if (bookId < 1 || bookId > 66) {
    return c.json({ error: 'Book ID must be between 1 and 66' }, 400);
  }
  if (chapter < 1 || chapter > 150) {
    return c.json({ error: 'Invalid chapter number' }, 400);
  }

  try {
    // KVN-kryssmapping når mapping er oppgitt.
    if (mapping && mapping !== 'osnb') {
      const resolvedMapping = resolveMappingId(mapping);
      if (!resolvedMapping) {
        return c.json({ error: `Unknown mapping: ${mapping}` }, 400);
      }
      const mapped = await mapChapter(bookId, chapter, resolvedMapping, bible);
      if (mapped.length === 0) return c.json({ error: 'Chapter not found' }, 404);

      // Vers med visningsnummerering; osnb-koordinatene bevares.
      const verses = mapped.map((m) => ({
        ...m.verse,
        chapter: m.displayChapter,
        verse: m.displayVerse,
        osnbChapter: m.osnbChapter,
        osnbVerse: m.osnbVerse,
        partial: m.partial,
      }));

      const originalVerses: { verse: number; text: string }[] = [];
      for (const m of mapped) {
        const orig = await getOriginalVerse(bookId, m.osnbChapter, m.osnbVerse);
        if (orig) originalVerses.push({ verse: m.displayVerse, text: orig.text });
      }

      const lang = bible === 'osnn' ? 'nn' : 'nb';
      const word4word: Record<number, unknown[]> = {};
      for (const m of mapped) {
        const w4w = await getOriginalWord4Word(bookId, m.osnbChapter, m.osnbVerse, lang);
        if (w4w.length > 0) word4word[m.displayVerse] = w4w;
      }

      const references: Record<number, unknown[]> = {};
      for (const m of mapped) {
        const refs = await getReferences(bookId, m.osnbChapter, m.osnbVerse, lang);
        if (refs.length > 0) references[m.displayVerse] = refs;
      }

      const secondary = c.req.query('secondary');
      let secondaryVerses: { verse: number; text: string }[] | undefined;
      if (secondary && secondary !== 'original' && secondary !== bible) {
        const secVerses: { verse: number; text: string }[] = [];
        for (const m of mapped) {
          const sv = await getVerse(bookId, m.osnbChapter, m.osnbVerse, secondary);
          if (sv) secVerses.push({ verse: m.displayVerse, text: sv.text });
        }
        if (secVerses.length > 0) secondaryVerses = secVerses;
      }

      // Kapittelmetadata bruker osnb-kapittelet (primærinnholdet).
      const primaryChapter = mapped[0]?.osnbChapter ?? chapter;
      const bookSummary = chapter === 1 ? await getBookSummary(bookId) : null;
      const summary = await getChapterSummary(bookId, primaryChapter);
      const context = await getChapterContext(bookId, primaryChapter);
      const insight = await getChapterInsight(bookId, primaryChapter);

      return c.json(
        {
          bookId,
          chapter,
          bible,
          mapping,
          verses,
          originalVerses,
          ...(secondaryVerses && { secondaryVerses }),
          word4word,
          references,
          bookSummary,
          summary,
          context,
          insight,
          cachedAt: Date.now(),
        },
        200,
        NO_CACHE,
      );
    }

    // Standardsti: ingen mapping, direkte osnb-nummerering.
    const verses = await getVerses(bookId, chapter, bible);
    if (verses.length === 0) return c.json({ error: 'Chapter not found' }, 404);

    const originalVersesRaw = await getOriginalVerses(bookId, chapter);
    const originalVerses = originalVersesRaw.map((v) => ({ verse: v.verse, text: v.text }));

    const secondary = c.req.query('secondary');
    let secondaryVerses: { verse: number; text: string }[] | undefined;
    if (secondary && secondary !== 'original' && secondary !== bible) {
      const secondaryRaw = await getVerses(bookId, chapter, secondary);
      if (secondaryRaw.length > 0) {
        secondaryVerses = secondaryRaw.map((v) => ({ verse: v.verse, text: v.text }));
      }
    }

    const lang = bible === 'osnn' ? 'nn' : 'nb';
    const word4word: Record<number, unknown[]> = {};
    for (const verse of verses) {
      const w4w = await getOriginalWord4Word(bookId, chapter, verse.verse, lang);
      if (w4w.length > 0) word4word[verse.verse] = w4w;
    }

    const references: Record<number, unknown[]> = {};
    for (const verse of verses) {
      const refs = await getReferences(bookId, chapter, verse.verse, lang);
      if (refs.length > 0) references[verse.verse] = refs;
    }

    const bookSummary = chapter === 1 ? await getBookSummary(bookId) : null;
    const summary = await getChapterSummary(bookId, chapter);
    const context = await getChapterContext(bookId, chapter);
    const insight = await getChapterInsight(bookId, chapter);

    return c.json(
      {
        bookId,
        chapter,
        bible,
        verses,
        originalVerses,
        ...(secondaryVerses && { secondaryVerses }),
        word4word,
        references,
        bookSummary,
        summary,
        context,
        insight,
        cachedAt: Date.now(),
      },
      200,
      NO_CACHE,
    );
  } catch (error) {
    console.error('Error fetching chapter:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
