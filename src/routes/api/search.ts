import { Hono } from 'hono';
import {
  searchVerses,
  searchOriginalWord,
  searchStories,
  searchThemes,
  searchPersons,
  searchProphecies,
  searchTimelineEvents,
  searchGospelParallels,
  searchReadingPlans,
  searchImportantWords,
  searchNumberSymbolism,
  searchDays,
  searchReadingTexts,
  getPersonsByChapter,
  getPropheciesForChapter,
  getNumberSymbolismByChapter,
  getThemesByChapter,
  getStoriesByChapter,
  getReadingTextsByChapter,
  getGospelParallelsForChapter,
  getImportantWords,
  normalizeBibleId,
} from '../../lib/bible.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/search?q=&limit=&offset=&bible= — verssøk. */
r.get('/', async (c) => {
  const query = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';

  if (query.length < 2) {
    return c.json({ results: [], total: 0, hasMore: false, message: 'Søket må være minst 2 tegn' });
  }
  try {
    const { results, total, hasMore } = await searchVerses(query, limit, offset, bible);
    return c.json({ results, total, hasMore }, 200, NO_CACHE);
  } catch (error) {
    console.error('Error searching verses:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/search/all — kombinert søk på tvers av ressurstypene. */
r.get('/all', async (c) => {
  const query = c.req.query('q') || '';

  if (query.length < 2 && !/^\d+$/.test(query.trim())) {
    return c.json({
      stories: [], themes: [], persons: [], prophecies: [], timeline: [],
      parallels: [], plans: [], words: [], numberSymbolism: [], days: [], readingTexts: [],
    });
  }
  try {
    const stories = await searchStories(query);
    const themes = await searchThemes(query);
    const persons = await searchPersons(query);
    const prophecies = await searchProphecies(query);
    const timeline = await searchTimelineEvents(query);
    const parallels = await searchGospelParallels(query);
    const plans = await searchReadingPlans(query);
    const words = await searchImportantWords(query);
    const numberSymbolism = await searchNumberSymbolism(query);
    const days = await searchDays(query);
    const readingTexts = await searchReadingTexts(query);
    return c.json(
      { stories, themes, persons, prophecies, timeline, parallels, plans, words, numberSymbolism, days, readingTexts },
      200,
      NO_CACHE,
    );
  } catch (error) {
    console.error('Error in combined search:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/search/chapter-resources?bookId=&chapter= — ressurser knyttet til kapittel. */
r.get('/chapter-resources', async (c) => {
  const bookId = parseInt(c.req.query('bookId') ?? '', 10);
  const chapter = parseInt(c.req.query('chapter') ?? '', 10);

  if (!bookId || !chapter) {
    return c.json({ persons: [], prophecies: [], numbers: [], themes: [], stories: [] });
  }
  try {
    const persons = (await getPersonsByChapter(bookId, chapter)).map((p) => {
      const chapterVerses = (p.references || [])
        .filter((ref) => ref.bookId === bookId && ref.chapterId === chapter)
        .map((ref) => ref.verseId);
      return {
        id: p.id,
        name: p.name,
        title: p.title,
        era: p.era,
        summary: p.summary,
        verses: chapterVerses,
      };
    });

    const prophecies = (await getPropheciesForChapter(bookId, chapter)).map((p) => {
      const verses: number[] = [];
      if (p.prophecy.book_id === bookId && p.prophecy.chapter === chapter) {
        for (let v = p.prophecy.verse_start; v <= p.prophecy.verse_end; v++) verses.push(v);
      }
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

    const numbers = (await getNumberSymbolismByChapter(bookId, chapter)).map((n) => {
      const chapterVerses = n.references
        .filter((ref) => ref.bookId === bookId && ref.chapterId === chapter)
        .map((ref) => ref.fromVerseId);
      return {
        number: n.number,
        meaning: n.meaning,
        description: n.description,
        verses: chapterVerses,
      };
    });

    const themes = (await getThemesByChapter(bookId, chapter)).map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title,
      description: t.introduction,
      verses: t.verses,
    }));

    const stories = (await getStoriesByChapter(bookId, chapter)).map((s) => ({
      slug: s.slug,
      title: s.title,
      category: s.category,
      description: s.description,
      verses: s.verses,
    }));

    const readingTexts = (await getReadingTextsByChapter(bookId, chapter)).map((rt) => ({
      id: rt.id,
      name: rt.name,
      date: rt.date,
      title: rt.title,
      displayRef: rt.display_ref,
      verses:
        rt.verse_start && rt.verse_end
          ? Array.from({ length: rt.verse_end - rt.verse_start + 1 }, (_, i) => rt.verse_start + i)
          : rt.verse_start
            ? [rt.verse_start]
            : [],
    }));

    const parallels = (await getGospelParallelsForChapter(bookId, chapter)).map((p) => ({
      id: p.id,
      title: p.title,
      section: p.section,
      gospels: Object.keys(p.passages || {}).filter(
        (g) => p.passages?.[g as keyof typeof p.passages],
      ),
    }));

    const words = await getImportantWords(bookId, chapter);

    return c.json(
      { persons, prophecies, numbers, themes, stories, readingTexts, parallels, words },
      200,
      NO_CACHE,
    );
  } catch (error) {
    console.error('Error fetching chapter resources:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/search/original?q=&limit=&offset= — søk i grunnteksten. */
r.get('/original', async (c) => {
  const query = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  if (query.length < 1) return c.json({ results: [], total: 0, hasMore: false });
  try {
    return c.json(await searchOriginalWord(query, limit, offset), 200, NO_CACHE);
  } catch (error) {
    console.error('Error searching original text:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
