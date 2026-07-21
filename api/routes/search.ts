import { Router, Request, Response } from 'express';
import {
  searchVerses, searchOriginalWord, searchStories, searchThemes,
  searchPersons, searchProphecies, searchTimelineEvents,
  searchGospelParallels, searchReadingPlans, searchImportantWords,
  searchNumberSymbolism,
  searchDays,
  searchReadingTexts,
  getPersonsByChapter, getPropheciesForChapter,
  getNumberSymbolismByChapter, getThemesByChapter, getStoriesByChapter,
  getReadingTextsByChapter,
  getGospelParallelsForChapter,
  getImportantWords,
} from '../../src/lib/bible';

export const searchRouter = Router();

/**
 * GET /api/search
 * Query params: q (search query), limit, offset, bible
 */
searchRouter.get('/', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const offset = parseInt((req.query.offset as string) || '0', 10);
  const bible = (req.query.bible as string) || 'osnb2';

  if (query.length < 2) {
    res.json({ results: [], total: 0, hasMore: false, message: 'Søket må være minst 2 tegn' });
    return;
  }

  try {
    const { results, total, hasMore } = searchVerses(query, limit, offset, bible);

    res.set('Cache-Control', 'no-cache');
    res.json({ results, total, hasMore });
  } catch (error) {
    console.error('Error searching verses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/all
 * Combined search across stories and themes
 * Query params: q
 */
searchRouter.get('/all', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';

  if (query.length < 2 && !/^\d+$/.test(query.trim())) {
    res.json({ stories: [], themes: [], persons: [], prophecies: [], timeline: [], parallels: [], plans: [], words: [], numberSymbolism: [], days: [], readingTexts: [] });
    return;
  }

  try {
    const stories = searchStories(query);
    const themes = searchThemes(query);
    const persons = searchPersons(query);
    const prophecies = searchProphecies(query);
    const timeline = searchTimelineEvents(query);
    const parallels = searchGospelParallels(query);
    const plans = searchReadingPlans(query);
    const words = searchImportantWords(query);
    const numberSymbolism = searchNumberSymbolism(query);
    const days = searchDays(query);
    const readingTexts = searchReadingTexts(query);

    res.set('Cache-Control', 'no-cache');
    res.json({ stories, themes, persons, prophecies, timeline, parallels, plans, words, numberSymbolism, days, readingTexts });
  } catch (error) {
    console.error('Error in combined search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/chapter-resources
 * Resources related to a specific chapter (by reference, not text search)
 * Query params: bookId, chapter
 */
searchRouter.get('/chapter-resources', (req: Request, res: Response) => {
  const bookId = parseInt(req.query.bookId as string, 10);
  const chapter = parseInt(req.query.chapter as string, 10);

  if (!bookId || !chapter) {
    res.json({ persons: [], prophecies: [], numbers: [], themes: [], stories: [] });
    return;
  }

  try {
    const persons = getPersonsByChapter(bookId, chapter).map(p => {
      const chapterVerses = (p.references || [])
        .filter((r: any) => r.bookId === bookId && r.chapterId === chapter)
        .map((r: any) => r.verseId);
      return {
        id: p.id,
        name: p.name,
        title: p.title,
        era: p.era,
        summary: p.summary,
        verses: chapterVerses,
      };
    });

    const prophecies = getPropheciesForChapter(bookId, chapter).map(p => {
      const verses: number[] = [];
      // Check prophecy origin
      if (p.prophecy.book_id === bookId && p.prophecy.chapter === chapter) {
        for (let v = p.prophecy.verse_start; v <= p.prophecy.verse_end; v++) verses.push(v);
      }
      // Check fulfillments
      for (const f of p.fulfillments) {
        if (f.book_id === bookId && f.chapter === chapter) {
          for (let v = f.verse_start; v <= f.verse_end; v++) verses.push(v);
        }
      }
      return {
        id: p.id,
        title: p.title,
        category_name: p.category?.name || '',
        explanation: p.explanation,
        verses,
      };
    });

    const numbers = getNumberSymbolismByChapter(bookId, chapter).map(n => {
      const chapterVerses = n.references
        .filter(r => r.bookId === bookId && r.chapterId === chapter)
        .map(r => r.fromVerseId);
      return {
        number: n.number,
        meaning: n.meaning,
        description: n.description,
        verses: chapterVerses,
      };
    });

    const themes = getThemesByChapter(bookId, chapter).map(t => ({
      id: t.id,
      name: t.name,
      title: t.title,
      description: t.introduction,
      verses: t.verses,
    }));

    const stories = getStoriesByChapter(bookId, chapter).map(s => ({
      slug: s.slug,
      title: s.title,
      category: s.category,
      description: s.description,
      verses: s.verses,
    }));

    const readingTexts = getReadingTextsByChapter(bookId, chapter).map(rt => ({
      id: rt.id,
      name: rt.name,
      date: rt.date,
      title: rt.title,
      displayRef: rt.display_ref,
      verses: rt.verse_start && rt.verse_end
        ? Array.from({ length: rt.verse_end - rt.verse_start + 1 }, (_, i) => rt.verse_start + i)
        : rt.verse_start ? [rt.verse_start] : [],
    }));

    const parallels = getGospelParallelsForChapter(bookId, chapter).map(p => ({
      id: p.id,
      title: p.title,
      section: p.section,
      gospels: Object.keys(p.passages || {}).filter(g => p.passages?.[g as keyof typeof p.passages]),
    }));

    const words = getImportantWords(bookId, chapter);

    res.set('Cache-Control', 'no-cache');
    res.json({ persons, prophecies, numbers, themes, stories, readingTexts, parallels, words });
  } catch (error) {
    console.error('Error fetching chapter resources:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/search/original
 * Search in original language (Hebrew/Greek)
 * Query params: q, limit, offset
 */
searchRouter.get('/original', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const offset = parseInt((req.query.offset as string) || '0', 10);

  if (query.length < 1) {
    res.json({ results: [], total: 0, hasMore: false });
    return;
  }

  try {
    const result = searchOriginalWord(query, limit, offset);

    res.set('Cache-Control', 'no-cache');
    res.json(result);
  } catch (error) {
    console.error('Error searching original text:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
