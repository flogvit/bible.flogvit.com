import { Hono, type Context } from 'hono';
import { getBibleStatistics, getTopOriginalWords, getTopWords, normalizeBibleId } from '../../lib/bible.ts';
import { NO_CACHE, intParam, internFeil } from './util.ts';

const r = new Hono();

/**
 * `?limit=` for ordlistene: 100 som standard, klemt til 1–500. Gulvet er ikke
 * pynt: `getTopWords` gjør `.slice(0, limit)`, og et negativt tall kutter da
 * bakfra — nesten hele ordlista (#131).
 */
const limitParam = (c: Context) => Math.max(1, Math.min(intParam(c, 'limit') || 100, 500));

/** GET /api/statistics — overordnet bibelstatistikk. */
r.get('/', async (c) => {
  try {
    const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
    return c.json(await getBibleStatistics(bible), 200, NO_CACHE);
  } catch (error) {
    return internFeil(c, 'Error fetching statistics', error);
  }
});

/** GET /api/statistics/top-words — hyppigste norske ord (?limit, ?all, ?bible). */
r.get('/top-words', async (c) => {
  try {
    const limit = limitParam(c);
    const includeStopWords = c.req.query('all') === 'true';
    const bible = normalizeBibleId(c.req.query('bible')) || 'osnb';
    const words = await getTopWords(bible, limit, includeStopWords);
    return c.json({ words }, 200, NO_CACHE);
  } catch (error) {
    return internFeil(c, 'Error fetching top words', error);
  }
});

/** GET /api/statistics/top-words/hebrew og /greek — hyppigste ord i grunnteksten. */
for (const [language, navn] of [['hebrew', 'Hebrew'], ['greek', 'Greek']] as const) {
  r.get(`/top-words/${language}`, async (c) => {
    try {
      const words = await getTopOriginalWords(language, limitParam(c));
      return c.json({ words, language }, 200, NO_CACHE);
    } catch (error) {
      return internFeil(c, `Error fetching ${navn} top words`, error);
    }
  });
}

export default r;
