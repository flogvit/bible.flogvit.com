import { Hono } from 'hono';
import { getAllVerseMappings, getVerseMappingById } from '../../lib/bible.ts';
import {
  getAvailableMappings,
  getKvnMappingData,
  listMappingIds,
  loadRawMappingUncached,
} from '../../lib/verse-mapper.ts';
import { NO_CACHE } from './util.ts';
import { loggFeil } from '../../lib/error-handler.ts';

const r = new Hono();

/** GET /api/mappings — tilgjengelige versmappinger (id, name, description). */
r.get('/', async (c) => {
  try {
    const mappings = await getAllVerseMappings();
    return c.json({ mappings }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching mappings', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/mappings/kvn/all — alle KVN-mappingfiler i én respons, keyed på id.
 *
 * Svaret er 73 MB, og det er STØRRE enn heapen vi har (#104). Bygget som ett
 * objekt tok denne ene anonyme forespørselen prosessen fra 1 MB til 232 MB
 * beholdt heap og 925 MB RSS — den la ALLE 1158 filene permanent i fil-cachen
 * (`getKvnMappingRaw`) og serialiserte dem så til én streng. I en container med
 * et minnetak er det `FATAL ERROR: Reached heap limit`, og prisen er ikke et
 * dårlig svar: det er hele appen, for alle lesere, til containeren er oppe
 * igjen. Ruta ligger dessuten under `/api/`, altså UTENFOR lastvernet
 * (`page-cache.ts`), så to samtidige kall er to ganger så mye.
 *
 * Derfor bygges svaret STYKKEVIS: `pull` kalles når mottakeren er klar, og hver
 * runde leser nøyaktig én mapping og slipper den. Toppen er da én fil (~0,6 MB)
 * uansett hvor stor responsen er, og mottakeren styrer farten.
 *
 * INNHOLDET er uendret — alle 1158 er fortsatt med, med samme nøkler og samme
 * verdier. Det er formen som er ny, ikke hva vi deler ut.
 */
r.get('/kvn/all', (c) => {
  const ids = listMappingIds();
  const enc = new TextEncoder();
  let i = 0;
  let åpnet = false;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        if (!åpnet) {
          åpnet = true;
          controller.enqueue(enc.encode('{'));
          return;
        }
        if (i >= ids.length) {
          controller.enqueue(enc.encode('}'));
          controller.close();
          return;
        }
        const id = ids[i]!;
        const skille = i === 0 ? '' : ',';
        i++;
        controller.enqueue(
          enc.encode(`${skille}${JSON.stringify(id)}:${JSON.stringify(loadRawMappingUncached(id))}`),
        );
      } catch (error) {
        // Hodene er alt sendt, så en 500 er ikke lenger mulig. Å avbryte
        // strømmen er det ærlige: en avkortet kropp er ugyldig JSON og kan
        // ikke forveksles med et fullstendig svar.
        loggFeil('Error fetching all KVN mappings', error);
        controller.error(error);
      }
    },
  });

  return c.body(body, 200, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'public, max-age=86400',
  });
});

/** GET /api/mappings/kvn — tilgjengelige KVN-mappings. */
r.get('/kvn', (c) => {
  try {
    return c.json({ mappings: getAvailableMappings() }, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching KVN mappings', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/mappings/kvn/:id — KVN-mapping som bookNames + verseMap. */
r.get('/kvn/:id', (c) => {
  try {
    const data = getKvnMappingData(c.req.param('id'));
    if (!data) return c.json({ error: 'KVN mapping not found' }, 404);
    return c.json(data, 200, NO_CACHE);
  } catch (error) {
    loggFeil('Error fetching KVN mapping data', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/mappings/:id — én mapping med full verseMap og bookNames. */
r.get('/:id', async (c) => {
  try {
    const mapping = await getVerseMappingById(c.req.param('id'));
    if (!mapping) return c.json({ error: 'Mapping not found' }, 404);
    return c.json(
      {
        id: mapping.id,
        name: mapping.name,
        description: mapping.description,
        bookNames: JSON.parse(mapping.book_names),
        verseMap: JSON.parse(mapping.verse_map),
        unmapped: mapping.unmapped ? JSON.parse(mapping.unmapped) : [],
      },
      200,
      NO_CACHE,
    );
  } catch (error) {
    loggFeil('Error fetching mapping', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
