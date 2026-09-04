// ET API SOM IKKE KAN FINNES, ER ET API SOM IKKE FINNES (#114)
//
// Flata har 74 endepunkter — dagens vers, bibelteksten, studieinnholdet,
// brukerens egne notater — og ingen av dem sto skrevet noe sted. Den eneste
// måten å lære hva `/api/chapter` tar imot, var å lese `src/routes/api/`.
// For en som skal bygge noe mot bible.flogvit.com finnes API-et da ikke.
//
// SPESIFIKASJONEN ER KILDEN, IKKE EN KOPI AV DEN
// ----------------------------------------------
// `API_OPERATIONS` er ETT sted, og den brukes tre steder: OpenAPI-dokumentet
// (`/api/openapi.json`), utforskersida (`/api/docs`) og vakta
// (`test/api-docs.test.ts`). Hadde sida hatt sin egen liste, ville vakta målt
// at dokumentet er enig med seg selv — samme grep som `API_COLLECTIONS` (#61)
// og `CONTENT_SOURCES` (#58).
//
// Hver operasjon bærer `route` NØYAKTIG slik den står i rutetabellen, med
// hono-formen på parametrene (`:date{[0-9]{4}-…}`). Det er dét som gjør at
// vakta kan gå den andre veien også: en rute uten en operasjon er rød, og en
// operasjon uten en rute likeså. Et dokument som beskriver et endepunkt som
// ikke finnes, er verre enn ingen dokumentasjon — det sender en klient til en
// 404 med vår egen signatur på.
//
// `prove` ER EKSEMPELET, OG DET ER MÅLT
// -------------------------------------
// Adressen leseren ser på sida, er den vakta faktisk henter. Et eksempel som
// ikke er kjørt, er en påstand: parameternavnet kan ha endret seg, og
// dokumentet ville stått og lovet det gamle uten at noe ble rødt. `forventet`
// er statusene svaret HAR LOV til å ha, og de må selv være dokumentert —
// ellers kunne en 500 passert som «den er jo dokumentert».

import { absoluteUrl } from './site-url.ts';

/** API-ets egen versjon. Ikke databaseversjonen (`/api/version`). */
export const API_VERSION = '1.0.0';

export interface ApiParam {
  name: string;
  in: 'query' | 'path';
  required?: boolean;
  type?: 'string' | 'integer' | 'boolean';
  description: string;
  example?: string;
}

export interface ApiOperation {
  /** Stien slik den står i RUTETABELLEN — hono-form, med regexen i behold. */
  route: string;
  method: 'get' | 'post' | 'delete';
  tag: string;
  summary: string;
  description?: string;
  params?: ApiParam[];
  /** Legger på det delte `lang`-parameteret (#24). */
  lang?: boolean;
  body?: { description: string; example: unknown; required?: boolean };
  /** Statuskode → beskrivelse. */
  responses: Record<number, string>;
  /** Porten foran endepunktet, hvis noen. */
  auth?: 'session' | 'plus' | 'contribToken' | 'reviewToken';
  /** Svarets medietype når den ikke er JSON. */
  produces?: string;
  /** Adressen vakta HENTER, og statusene svaret har lov til å ha. */
  prove?: { url: string; body?: unknown; forventet: number[] };
  /** Satt når operasjonen ikke kan hentes av vakta, med grunnen. */
  ikkeProvd?: string;
}

export const API_TAGS: { name: string; description: string }[] = [
  { name: 'Bible text', description: 'Chapters, verses, the original text and word-for-word data.' },
  { name: 'Daily verse', description: 'The verse of the day, with its full text.' },
  { name: 'Study content', description: 'Stories, themes, number symbolism, prophecies, the timeline and gospel parallels.' },
  { name: 'People', description: 'The people of the Bible, their family graph and where they appear.' },
  { name: 'Search', description: 'Free-text search and reference parsing.' },
  { name: 'Reading', description: 'Reading plans and the lectionary (reading texts per date).' },
  { name: 'Verse numbering', description: 'Verse mappings (KVN) between editions with different versification.' },
  { name: 'Your data', description: 'Notes, highlights, lists, favourites and reading progress — the signed-in user’s own data.' },
  { name: 'Sharing', description: 'Share links for manuscripts, and the open catalogue.' },
  { name: 'Contributions', description: 'Reader-submitted works with verse references.' },
  { name: 'Service', description: 'Health, versions and this documentation.' },
];

const qp = (name: string, description: string, extra: Partial<ApiParam> = {}): ApiParam => ({
  name,
  in: 'query',
  description,
  type: 'string',
  ...extra,
});

const pp = (
  name: string,
  description: string,
  example: string,
  type: ApiParam['type'] = 'string',
): ApiParam => ({ name, in: 'path', required: true, description, type, example });

const BIBLE = qp('bible', 'Bible edition id (`osnb`, `osnn`, `sblgnt`, `tanach`, …).', {
  example: 'osnb',
});

const SERVER_ERROR = 'Something failed on our side.';

/**
 * Alle endepunktene under `/api`. Rekkefølgen er den sida viser dem i.
 *
 * BESKRIVELSENE ER PÅ ENGELSK, kommentarene rundt dem på norsk — som resten av
 * repoet. Engelsk er gulvet i innholdskjeden (#26), og en API-referanse leses
 * av en utvikler som ikke nødvendigvis kan norsk. Sida er ikke lokalisert, og
 * det er derfor den ikke bor i `PAGES` (se `routes/api/docs.tsx`).
 */
export const API_OPERATIONS: ApiOperation[] = [
  // ── Bibelteksten ─────────────────────────────────────────────────────
  {
    route: '/api/books',
    method: 'get',
    tag: 'Bible text',
    summary: 'All 66 books',
    description:
      'Book metadata (id, names, chapter count, testament) with the book summary where we have one. ' +
      'The `id` is the address every other endpoint uses for a book.',
    lang: true,
    responses: { 200: 'The books, under `books`.', 500: SERVER_ERROR },
    prove: { url: '/api/books', forventet: [200] },
  },
  {
    route: '/api/chapter',
    method: 'get',
    tag: 'Bible text',
    summary: 'One chapter, with everything the reading page shows',
    description:
      'Verses, the original text, word-for-word data, cross references and the chapter summary, ' +
      'context and insight. With `mapping` the verse numbering is remapped from `osnb` to another ' +
      'system (KVN) — the osnb coordinates stay in the response as `osnbChapter`/`osnbVerse`.',
    params: [
      qp('book', 'Book id, 1–66.', { required: true, type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { required: true, type: 'integer', example: '1' }),
      BIBLE,
      qp('mapping', 'Verse mapping id to renumber into. See `/api/mappings/kvn`.'),
      qp('secondary', 'A second edition to include as `secondaryVerses`.'),
    ],
    lang: true,
    responses: {
      200: 'The chapter.',
      400: 'Missing or invalid `book`/`chapter`, or an unknown `mapping`.',
      404: 'No such chapter in this edition.',
      500: SERVER_ERROR,
    },
    prove: { url: '/api/chapter?book=1&chapter=1', forventet: [200] },
  },
  {
    route: '/api/verses',
    method: 'get',
    tag: 'Bible text',
    summary: 'Verses from a Norwegian standard reference',
    description:
      'Takes a reference the way it is written in Norwegian — `Joh 3,16-19`, `Sal 23`, ' +
      '`1 Mos 1,1-3; 2,4` — and returns the verses with the original text alongside.',
    params: [
      qp('ref', 'The reference to look up.', { required: true, example: 'Joh 3,16-19' }),
      BIBLE,
    ],
    lang: true,
    responses: {
      200: 'The verses, in order.',
      400: 'Missing `ref`, or a reference we cannot read.',
      500: SERVER_ERROR,
    },
    prove: { url: '/api/verses?ref=Joh+3%2C16-19', forventet: [200] },
  },
  {
    route: '/api/verses',
    method: 'post',
    tag: 'Bible text',
    summary: 'Verses from explicit coordinates',
    description: 'The batch form: ask for many verses by book/chapter/verse in one request.',
    body: {
      required: true,
      description: '`refs` is the list of verses; `bible` picks the edition.',
      example: { refs: [{ bookId: 43, chapter: 3, verse: 16 }], bible: 'osnb' },
    },
    responses: { 200: 'The verses, in the order they were asked for.', 400: 'Missing `refs` array.', 500: SERVER_ERROR },
    prove: {
      url: '/api/verses',
      body: { refs: [{ bookId: 43, chapter: 3, verse: 16 }] },
      forventet: [200],
    },
  },
  {
    route: '/api/word4word',
    method: 'get',
    tag: 'Bible text',
    summary: 'Word-for-word data for one verse',
    description:
      'Set `bible=original` to get the Hebrew/Greek word-for-word rows with the gloss in `lang`.',
    params: [
      qp('bookId', 'Book id, 1–66.', { required: true, type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { required: true, type: 'integer', example: '1' }),
      qp('verse', 'Verse number.', { required: true, type: 'integer', example: '1' }),
      BIBLE,
      qp('lang', 'Gloss language for the original text (`nb`, `nn`).'),
    ],
    responses: { 200: 'The rows, in word order.', 400: 'Missing or non-numeric parameters.' },
    prove: { url: '/api/word4word?bookId=1&chapter=1&verse=1&bible=original', forventet: [200] },
  },
  {
    route: '/api/references',
    method: 'get',
    tag: 'Bible text',
    summary: 'Cross references for one verse',
    params: [
      qp('bookId', 'Book id, 1–66.', { required: true, type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { required: true, type: 'integer', example: '1' }),
      qp('verse', 'Verse number.', { required: true, type: 'integer', example: '1' }),
      qp('lang', 'Content language (`nb`, `nn`, `en`).', { example: 'nb' }),
    ],
    responses: { 200: 'The references.', 400: 'Missing or non-numeric parameters.' },
    prove: { url: '/api/references?bookId=1&chapter=1&verse=1', forventet: [200] },
  },
  {
    route: '/api/verse-extras',
    method: 'get',
    tag: 'Bible text',
    summary: 'Prayer and sermon for one verse',
    params: [
      qp('bookId', 'Book id, 1–66.', { required: true, type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { required: true, type: 'integer', example: '1' }),
      qp('verse', 'Verse number.', { required: true, type: 'integer', example: '1' }),
    ],
    lang: true,
    responses: { 200: '`{ prayer, sermon }` — either may be `null`.', 400: 'Missing or non-numeric parameters.' },
    prove: { url: '/api/verse-extras?bookId=1&chapter=1&verse=1', forventet: [200] },
  },
  {
    route: '/api/important-words',
    method: 'get',
    tag: 'Bible text',
    summary: 'Key words in a chapter',
    params: [
      qp('bookId', 'Book id, 1–66.', { required: true, type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { required: true, type: 'integer', example: '1' }),
    ],
    lang: true,
    responses: { 200: 'The words.', 400: 'Missing or non-numeric parameters.', 500: SERVER_ERROR },
    prove: { url: '/api/important-words?bookId=1&chapter=1', forventet: [200] },
  },
  {
    route: '/api/chapter-context',
    method: 'post',
    tag: 'Bible text',
    summary: 'Summaries and context for up to 20 chapters',
    description:
      'The batch form used when a list of chapters needs its headings — book summary, chapter ' +
      'summary, context and the timeline events that belong to the chapter.',
    body: {
      required: true,
      description: 'Up to 20 `{bookId, chapter}` pairs.',
      example: { chapters: [{ bookId: 1, chapter: 1 }, { bookId: 43, chapter: 3 }] },
    },
    lang: true,
    responses: {
      200: 'One result per chapter, in the order asked. An unusable pair gets an `error` field of its own.',
      400: 'Empty list, or more than 20 chapters.',
      500: SERVER_ERROR,
    },
    prove: { url: '/api/chapter-context', body: { chapters: [{ bookId: 1, chapter: 1 }] }, forventet: [200] },
  },
  {
    route: '/api/favorites',
    method: 'post',
    tag: 'Bible text',
    summary: 'Verse text for a list of favourites',
    description:
      'Read-only: it takes coordinates and returns the text, so a client that stores favourites ' +
      'locally can render them. It does not store anything — see `POST /api/sync` for that.',
    body: {
      required: true,
      description: 'The verses to resolve.',
      example: { favorites: [{ bookId: 43, chapter: 3, verse: 16 }] },
    },
    responses: { 200: 'The verses that exist; the rest are dropped.', 500: SERVER_ERROR },
    prove: { url: '/api/favorites', body: { favorites: [{ bookId: 43, chapter: 3, verse: 16 }] }, forventet: [200] },
  },
  {
    route: '/api/statistics',
    method: 'get',
    tag: 'Bible text',
    summary: 'Bible statistics',
    params: [BIBLE],
    lang: true,
    responses: { 200: 'Counts of books, chapters, verses and words.', 500: SERVER_ERROR },
    prove: { url: '/api/statistics', forventet: [200] },
  },
  {
    route: '/api/statistics/top-words',
    method: 'get',
    tag: 'Bible text',
    summary: 'Most frequent words in the translation',
    params: [
      qp('limit', 'How many words, max 500.', { type: 'integer', example: '25' }),
      qp('all', 'Include stop words (`true`).', { type: 'boolean' }),
      BIBLE,
    ],
    responses: { 200: 'The words with their counts.', 500: SERVER_ERROR },
    prove: { url: '/api/statistics/top-words?limit=5', forventet: [200] },
  },
  {
    route: '/api/statistics/top-words/hebrew',
    method: 'get',
    tag: 'Bible text',
    summary: 'Most frequent Hebrew words',
    params: [qp('limit', 'How many words, max 500.', { type: 'integer', example: '25' })],
    responses: { 200: 'The words with their counts.', 500: SERVER_ERROR },
    prove: { url: '/api/statistics/top-words/hebrew?limit=5', forventet: [200] },
  },
  {
    route: '/api/statistics/top-words/greek',
    method: 'get',
    tag: 'Bible text',
    summary: 'Most frequent Greek words',
    params: [qp('limit', 'How many words, max 500.', { type: 'integer', example: '25' })],
    responses: { 200: 'The words with their counts.', 500: SERVER_ERROR },
    prove: { url: '/api/statistics/top-words/greek?limit=5', forventet: [200] },
  },

  // ── Dagens vers ──────────────────────────────────────────────────────
  {
    route: '/api/daily-verse',
    method: 'get',
    tag: 'Daily verse',
    summary: 'Today’s verse',
    description: 'The reference, the full verse text and the note that goes with it.',
    params: [BIBLE],
    responses: { 200: 'Today’s verse.', 404: 'No verse is set for today.', 500: SERVER_ERROR },
    prove: { url: '/api/daily-verse', forventet: [200, 404] },
  },
  {
    route: '/api/daily-verse/:date',
    method: 'get',
    tag: 'Daily verse',
    summary: 'The verse for a given date',
    params: [pp('date', 'Date as `YYYY-MM-DD`.', '2026-12-25'), BIBLE],
    responses: {
      200: 'The verse for that date.',
      400: 'The date is not `YYYY-MM-DD`.',
      404: 'No verse for that date.',
      500: SERVER_ERROR,
    },
    prove: { url: '/api/daily-verse/2026-12-25', forventet: [200, 404] },
  },

  // ── Studieinnhold ────────────────────────────────────────────────────
  {
    route: '/api/stories',
    method: 'get',
    tag: 'Study content',
    summary: 'All Bible stories',
    description: '`id` is the slug — the address `/api/stories/{slug}` serves (#61).',
    params: [qp('category', 'Filter by category.')],
    lang: true,
    responses: { 200: 'The stories, under `stories`.', 500: SERVER_ERROR },
    prove: { url: '/api/stories', forventet: [200] },
  },
  {
    route: '/api/stories/search',
    method: 'get',
    tag: 'Study content',
    summary: 'Search the stories',
    params: [qp('q', 'At least two characters.', { required: true, example: 'josef' })],
    lang: true,
    responses: { 200: 'Matching stories; an empty list for a query under two characters.', 500: SERVER_ERROR },
    prove: { url: '/api/stories/search?q=josef', forventet: [200] },
  },
  {
    route: '/api/stories/:slug',
    method: 'get',
    tag: 'Study content',
    summary: 'One story',
    params: [pp('slug', 'The story slug, as handed out in `id`.', 'daniel-i-lovehulen')],
    lang: true,
    responses: { 200: 'The story.', 404: 'No such story.', 500: SERVER_ERROR },
    prove: { url: '/api/stories/daniel-i-lovehulen', forventet: [200, 404] },
  },
  {
    route: '/api/themes',
    method: 'get',
    tag: 'Study content',
    summary: 'All themes',
    description: '`id` is the theme name — the address `/api/themes/{id}` serves (#61).',
    lang: true,
    responses: { 200: 'The themes, under `themes`.', 500: SERVER_ERROR },
    prove: { url: '/api/themes', forventet: [200] },
  },
  {
    route: '/api/themes/:id',
    method: 'get',
    tag: 'Study content',
    summary: 'One theme',
    params: [pp('id', 'The theme name, as handed out in `id`.', 'abraham')],
    lang: true,
    responses: { 200: 'The theme.', 404: 'No such theme.', 500: SERVER_ERROR },
    prove: { url: '/api/themes/abraham', forventet: [200, 404] },
  },
  {
    route: '/api/number-symbolism',
    method: 'get',
    tag: 'Study content',
    summary: 'Number symbolism',
    description: '`id` is the number itself — the address `/api/number-symbolism/{number}` serves (#61).',
    lang: true,
    responses: { 200: 'The entries, under `symbolisms`.', 500: SERVER_ERROR },
    prove: { url: '/api/number-symbolism', forventet: [200] },
  },
  {
    route: '/api/number-symbolism/:number',
    method: 'get',
    tag: 'Study content',
    summary: 'One number',
    params: [pp('number', 'The number.', '7', 'integer')],
    lang: true,
    responses: { 200: 'The entry.', 400: 'Not a number.', 404: 'Nothing for that number.', 500: SERVER_ERROR },
    prove: { url: '/api/number-symbolism/7', forventet: [200, 404] },
  },
  {
    route: '/api/days',
    method: 'get',
    tag: 'Study content',
    summary: 'Days of the church year',
    lang: true,
    responses: { 200: 'The days, under `days`.', 500: SERVER_ERROR },
    prove: { url: '/api/days', forventet: [200] },
  },
  {
    route: '/api/days/today',
    method: 'get',
    tag: 'Study content',
    summary: 'The days that match today’s date',
    lang: true,
    responses: { 200: 'The days, possibly none.', 500: SERVER_ERROR },
    prove: { url: '/api/days/today', forventet: [200] },
  },
  {
    route: '/api/days/:id',
    method: 'get',
    tag: 'Study content',
    summary: 'One day',
    params: [pp('id', 'The day id, as handed out in `id`.', 'julaften')],
    lang: true,
    responses: { 200: 'The day.', 404: 'No such day.', 500: SERVER_ERROR },
    prove: { url: '/api/days/julaften', forventet: [200, 404] },
  },
  {
    route: '/api/timeline',
    method: 'get',
    tag: 'Study content',
    summary: 'The biblical timeline',
    description: 'Periods and events. With `bookId` and `chapter` the response also names the events that belong to that chapter.',
    params: [
      qp('bookId', 'Book id, 1–66.', { type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { type: 'integer', example: '12' }),
    ],
    lang: true,
    responses: { 200: '`{ periods, events, chapterEventIds? }`.', 500: SERVER_ERROR },
    prove: { url: '/api/timeline?bookId=1&chapter=12', forventet: [200] },
  },
  {
    route: '/api/timeline/multi',
    method: 'get',
    tag: 'Study content',
    summary: 'All three timelines',
    description: 'The biblical, the world and the book timelines side by side.',
    lang: true,
    responses: { 200: 'The three timelines.', 500: SERVER_ERROR },
    prove: { url: '/api/timeline/multi', forventet: [200] },
  },
  {
    route: '/api/prophecies',
    method: 'get',
    tag: 'Study content',
    summary: 'Prophecies and their fulfilments',
    description: 'Without parameters: every category and every prophecy. With `book`, `chapter` and `verse`: only the ones that touch that verse.',
    params: [
      qp('book', 'Book id, 1–66.', { type: 'integer', example: '23' }),
      qp('chapter', 'Chapter number.', { type: 'integer', example: '53' }),
      qp('verse', 'Verse number.', { type: 'integer', example: '5' }),
    ],
    lang: true,
    responses: { 200: '`{ categories, prophecies }`, or `{ prophecies }` for a verse.', 500: SERVER_ERROR },
    prove: { url: '/api/prophecies?book=23&chapter=53&verse=5', forventet: [200] },
  },
  {
    route: '/api/parallels',
    method: 'get',
    tag: 'Study content',
    summary: 'Gospel parallels',
    description:
      'Sections and parallels. `sections[].id` is a grouping key (`parallels[].section_id`), not an address — there is no detail route for a section (#61).',
    lang: true,
    responses: { 200: '`{ sections, parallels }`.', 500: SERVER_ERROR },
    prove: { url: '/api/parallels', forventet: [200] },
  },
  {
    route: '/api/parallels/chapter/:bookId/:chapter',
    method: 'get',
    tag: 'Study content',
    summary: 'Parallels that touch a chapter',
    params: [pp('bookId', 'Book id, 1–66.', '40', 'integer'), pp('chapter', 'Chapter number.', '1', 'integer')],
    lang: true,
    responses: { 200: 'The parallels, under `parallels`.', 400: 'Non-numeric book id or chapter.', 500: SERVER_ERROR },
    prove: { url: '/api/parallels/chapter/40/1', forventet: [200] },
  },
  {
    route: '/api/parallels/:id',
    method: 'get',
    tag: 'Study content',
    summary: 'One parallel',
    params: [pp('id', 'The parallel id, as handed out in `id`.', 'jesu-dap')],
    lang: true,
    responses: { 200: 'The parallel.', 404: 'No such parallel.', 500: SERVER_ERROR },
    prove: { url: '/api/parallels/jesu-dap', forventet: [200, 404] },
  },
  {
    route: '/api/parallels/:id/verses',
    method: 'post',
    tag: 'Study content',
    summary: 'The verses of a parallel',
    description: 'The passages of the parallel, resolved to verse text, keyed by gospel.',
    params: [pp('id', 'The parallel id.', 'jesu-dap')],
    body: { description: 'Optional edition.', example: { bible: 'osnb' } },
    responses: { 200: '`{ verses }` keyed by gospel.', 404: 'No such parallel.', 500: SERVER_ERROR },
    prove: { url: '/api/parallels/jesu-dap/verses', body: {}, forventet: [200, 404] },
  },

  // ── Personer ─────────────────────────────────────────────────────────
  {
    route: '/api/persons',
    method: 'get',
    tag: 'People',
    summary: 'The people of the Bible',
    params: [qp('role', 'Filter by role.'), qp('era', 'Filter by era.')],
    lang: true,
    responses: { 200: 'The people. `id` is the address `/api/persons/{id}` serves.', 500: SERVER_ERROR },
    prove: { url: '/api/persons?era=exodus', forventet: [200] },
  },
  {
    route: '/api/persons/:id',
    method: 'get',
    tag: 'People',
    summary: 'One person, with family and mentions',
    description:
      'Old spellings are redirected rather than 404-ed: an id with `ø`/`æ`/`å`, and the 68 corrected ids, answer `301` to the canonical address with the query kept (#61).',
    params: [pp('id', 'The person id, as handed out in `id`.', 'abraham')],
    lang: true,
    responses: {
      200: 'The person.',
      301: 'An older spelling — follow `Location`.',
      404: 'No such person.',
      500: SERVER_ERROR,
    },
    prove: { url: '/api/persons/abraham', forventet: [200, 404] },
  },

  // ── Søk og referanser ────────────────────────────────────────────────
  {
    route: '/api/search',
    method: 'get',
    tag: 'Search',
    summary: 'Search the Bible text',
    params: [
      qp('q', 'At least two characters.', { required: true, example: 'kjærlighet' }),
      qp('limit', 'Page size (default 50).', { type: 'integer', example: '10' }),
      qp('offset', 'Offset into the result set.', { type: 'integer' }),
      BIBLE,
    ],
    responses: { 200: '`{ results, total, hasMore }`.', 500: SERVER_ERROR },
    prove: { url: '/api/search?q=n%C3%A5de&limit=5', forventet: [200] },
  },
  {
    route: '/api/search/all',
    method: 'get',
    tag: 'Search',
    summary: 'Search everything except the Bible text',
    description: 'Stories, themes, people, prophecies, timeline events, parallels, plans, key words, number symbolism, days and reading texts in one response.',
    params: [qp('q', 'At least two characters, or a number.', { required: true, example: 'josef' })],
    lang: true,
    responses: { 200: 'One list per resource type.', 500: SERVER_ERROR },
    prove: { url: '/api/search/all?q=josef', forventet: [200] },
  },
  {
    route: '/api/search/chapter-resources',
    method: 'get',
    tag: 'Search',
    summary: 'Everything that belongs to one chapter',
    description: 'People, prophecies, numbers, themes, stories, reading texts, parallels and key words — each with the verses in this chapter they touch.',
    params: [
      qp('bookId', 'Book id, 1–66.', { required: true, type: 'integer', example: '1' }),
      qp('chapter', 'Chapter number.', { required: true, type: 'integer', example: '12' }),
    ],
    lang: true,
    responses: { 200: 'The resources. Empty lists when the parameters are missing.', 500: SERVER_ERROR },
    prove: { url: '/api/search/chapter-resources?bookId=1&chapter=12', forventet: [200] },
  },
  {
    route: '/api/search/original',
    method: 'get',
    tag: 'Search',
    summary: 'Search the Hebrew and Greek text',
    params: [
      qp('q', 'The word to look for.', { required: true, example: 'אלהים' }),
      qp('limit', 'Page size (default 50).', { type: 'integer', example: '10' }),
      qp('offset', 'Offset into the result set.', { type: 'integer' }),
    ],
    responses: { 200: '`{ results, total, hasMore }`.', 500: SERVER_ERROR },
    prove: { url: '/api/search/original?q=%D7%90%D7%9C%D7%94%D7%99%D7%9D&limit=5', forventet: [200] },
  },
  {
    route: '/api/reference',
    method: 'get',
    tag: 'Search',
    summary: 'Parse a Bible reference',
    description:
      'Turns what a reader typed into a book, chapter and verse range, with the canonical URL. ' +
      'Error texts come back in the language of the request (#71).',
    params: [qp('q', 'The text to parse.', { required: true, example: 'sal 23' })],
    lang: true,
    responses: { 200: '`{ success, reference }`, or `{ success: false, error }` with suggestions.' },
    prove: { url: '/api/reference?q=sal+23', forventet: [200] },
  },
  {
    route: '/api/reference/suggest',
    method: 'get',
    tag: 'Search',
    summary: 'Autocomplete a reference',
    description: 'With `book` and `chapter` it answers `{ verseCount }` instead — the number of verses to offer.',
    params: [
      qp('q', 'What has been typed so far.', { example: 'joh' }),
      qp('book', 'Book id, when asking for the verse count.', { type: 'integer' }),
      qp('chapter', 'Chapter number, when asking for the verse count.', { type: 'integer' }),
    ],
    lang: true,
    responses: { 200: '`{ suggestions }`, or `{ verseCount }`.' },
    prove: { url: '/api/reference/suggest?q=joh', forventet: [200] },
  },

  // ── Lesing ───────────────────────────────────────────────────────────
  {
    route: '/api/reading-plans',
    method: 'get',
    tag: 'Reading',
    summary: 'All reading plans',
    description: 'The list, without the day-by-day readings.',
    lang: true,
    responses: { 200: 'The plans.', 500: SERVER_ERROR },
    prove: { url: '/api/reading-plans', forventet: [200] },
  },
  {
    route: '/api/reading-plans/:id',
    method: 'get',
    tag: 'Reading',
    summary: 'One plan, with its readings',
    params: [pp('id', 'The plan id, as handed out in `id`.', 'romerne')],
    lang: true,
    responses: { 200: 'The plan.', 404: 'No such plan.', 500: SERVER_ERROR },
    prove: { url: '/api/reading-plans/romerne', forventet: [200, 404] },
  },
  {
    route: '/api/reading-texts',
    method: 'get',
    tag: 'Reading',
    summary: 'The lectionary',
    description:
      'The light list: every reading day with its date. The reading texts are Norwegian-only content (#26), so this list is empty in other languages.',
    lang: true,
    responses: { 200: 'The reading days, under `readingTexts`.', 500: SERVER_ERROR },
    prove: { url: '/api/reading-texts', forventet: [200] },
  },
  {
    route: '/api/reading-texts/today',
    method: 'get',
    tag: 'Reading',
    summary: 'Today’s reading texts',
    lang: true,
    responses: { 200: 'The reading days for today, possibly none.', 500: SERVER_ERROR },
    prove: { url: '/api/reading-texts/today', forventet: [200] },
  },
  {
    route: '/api/reading-texts/:date{[0-9]{4}-[0-9]{2}-[0-9]{2}}',
    method: 'get',
    tag: 'Reading',
    summary: 'The readings for a date, with verse text',
    description:
      'The date is the stable address (#40): several reading days can share one date, so the answer is a list.',
    params: [
      pp('date', 'Date as `YYYY-MM-DD`.', '2026-12-25'),
      BIBLE,
      qp('mapping', 'Verse mapping id to renumber into.'),
    ],
    lang: true,
    responses: { 200: 'The readings for that date.', 404: 'No readings for that date.', 500: SERVER_ERROR },
    prove: { url: '/api/reading-texts/2026-12-25', forventet: [200, 404] },
  },
  {
    route: '/api/reading-texts/:id{[0-9]+}',
    method: 'get',
    tag: 'Reading',
    summary: 'One reading day by row id',
    description:
      'The row id is renumbered by every content import (#40) — store the `date` instead. Kept because clients still hold old ids.',
    params: [
      pp('id', 'The row id.', '165', 'integer'),
      BIBLE,
      qp('mapping', 'Verse mapping id to renumber into.'),
    ],
    lang: true,
    responses: { 200: 'The reading day.', 400: 'Not a number.', 404: 'No such row.', 500: SERVER_ERROR },
    prove: { url: '/api/reading-texts/165', forventet: [200, 404] },
  },

  // ── Versnummerering ──────────────────────────────────────────────────
  {
    route: '/api/mappings',
    method: 'get',
    tag: 'Verse numbering',
    summary: 'Verse mappings in the database',
    lang: true,
    responses: { 200: 'The mappings, under `mappings`.', 500: SERVER_ERROR },
    prove: { url: '/api/mappings', forventet: [200] },
  },
  {
    route: '/api/mappings/:id',
    method: 'get',
    tag: 'Verse numbering',
    summary: 'One mapping, with the full verse map',
    params: [pp('id', 'The mapping id.', 'kjv')],
    responses: { 200: 'The mapping.', 404: 'No such mapping.', 500: SERVER_ERROR },
    prove: { url: '/api/mappings/kjv', forventet: [200, 404] },
  },
  {
    route: '/api/mappings/kvn',
    method: 'get',
    tag: 'Verse numbering',
    summary: 'The KVN mappings we ship',
    description: 'One entry per mapping file — the versification systems `mapping=` accepts.',
    responses: { 200: 'The mappings, under `mappings`.', 500: SERVER_ERROR },
    prove: { url: '/api/mappings/kvn', forventet: [200] },
  },
  {
    route: '/api/mappings/kvn/:id',
    method: 'get',
    tag: 'Verse numbering',
    summary: 'One KVN mapping',
    params: [pp('id', 'The mapping id, as handed out by `/api/mappings/kvn`.', 'kjv')],
    responses: { 200: '`{ bookNames, verseMap }`.', 404: 'No such mapping.', 500: SERVER_ERROR },
    prove: { url: '/api/mappings/kvn/kjv', forventet: [200, 404] },
  },
  {
    route: '/api/mappings/kvn/all',
    method: 'get',
    tag: 'Verse numbering',
    summary: 'Every KVN mapping in one response',
    description:
      'Around 73 MB, streamed one mapping at a time. Meant for a client that wants the whole set once — ask for `/api/mappings/kvn/{id}` if you need one.',
    responses: { 200: 'A JSON object keyed by mapping id.' },
    ikkeProvd:
      'svaret er ~73 MB (#104) — en vakt som henter det måler tålmodighet, ikke kontrakten. `test/mapping-bulk-heap.test.ts` eier den ruta.',
  },

  // ── Brukerens egne data ──────────────────────────────────────────────
  {
    route: '/api/sync',
    method: 'post',
    tag: 'Your data',
    summary: 'Notes, highlights, lists and reading progress',
    description:
      'The signed-in user’s own data lives behind one endpoint, as a delta sync rather than one ' +
      'resource per type. Send `lastSyncAt: 0` and an empty `changes` array to pull everything.\n\n' +
      'Data types: `notes`, `favorites`, `verseLists`, `devotionals` (manuscripts), `topics`, ' +
      '`settings`, `readingPosition`, `verseVersions`, `activePlan`, `planProgress`, ' +
      '`readingProgress`.\n\n' +
      'Newest `updatedAt` wins, except for `readingProgress` and `planProgress`, which are merged ' +
      'both ways so an offline device can never delete progress. Rate limit: 30 requests per minute.',
    auth: 'plus',
    body: {
      required: true,
      description: '`deviceId` identifies the client; `changes` are the items it has changed since `lastSyncAt`.',
      example: { deviceId: 'my-client', lastSyncAt: 0, changes: [] },
    },
    responses: {
      200: '`{ syncedAt, changes }` — the server’s side of the delta.',
      400: 'Missing `deviceId`.',
      401: 'Not signed in.',
      402: 'FLOGVIT.plus required — cloud storage is part of the subscription.',
      429: 'Too many requests.',
      500: SERVER_ERROR,
    },
    prove: { url: '/api/sync', body: { deviceId: 'vakt', lastSyncAt: 0, changes: [] }, forventet: [401] },
  },
  {
    route: '/api/sync/user-bibles',
    method: 'post',
    tag: 'Your data',
    summary: 'Sync your own Bible editions',
    description: 'Metadata only — the chapters go through the two endpoints below.',
    auth: 'plus',
    body: { required: true, description: 'The client’s editions.', example: { bibles: [] } },
    responses: { 200: '`{ bibles }` — the server’s full set afterwards.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.', 500: SERVER_ERROR },
    prove: { url: '/api/sync/user-bibles', body: { bibles: [] }, forventet: [401] },
  },
  {
    route: '/api/sync/user-bible-chapters/:id',
    method: 'post',
    tag: 'Your data',
    summary: 'Upload chapters for your own edition',
    auth: 'plus',
    params: [pp('id', 'The edition id.', 'min-bibel')],
    body: { required: true, description: 'Chapters, in chunks.', example: { chapters: [] } },
    responses: { 200: '`{ ok, count }`.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.', 404: 'Not your edition.', 500: SERVER_ERROR },
    prove: { url: '/api/sync/user-bible-chapters/vakt', body: { chapters: [] }, forventet: [401] },
  },
  {
    route: '/api/sync/user-bible-chapters/:id',
    method: 'get',
    tag: 'Your data',
    summary: 'Download the chapters of your own edition',
    auth: 'plus',
    params: [pp('id', 'The edition id.', 'min-bibel')],
    responses: { 200: '`{ chapters }`.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.', 404: 'Not your edition.', 500: SERVER_ERROR },
    prove: { url: '/api/sync/user-bible-chapters/vakt', forventet: [401] },
  },

  // ── Deling og publisering ────────────────────────────────────────────
  {
    route: '/api/shares',
    method: 'get',
    tag: 'Sharing',
    summary: 'Your share links',
    auth: 'plus',
    responses: { 200: '`{ shares }`.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.' },
    prove: { url: '/api/shares', forventet: [401] },
  },
  {
    route: '/api/shares',
    method: 'post',
    tag: 'Sharing',
    summary: 'Share a manuscript',
    description:
      'Idempotent: an existing link comes back unchanged. `regenerate: true` issues a new token and revokes the old one — there is only ever one live link per manuscript.',
    auth: 'plus',
    body: { required: true, description: 'The sync item id of the manuscript.', example: { itemId: 'dev-1750000000000' } },
    responses: { 200: '`{ share }`.', 400: '`itemId` missing.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.', 404: 'Unknown manuscript, or not yours.' },
    prove: { url: '/api/shares', body: { itemId: 'vakt' }, forventet: [401] },
  },
  {
    route: '/api/shares/:itemId',
    method: 'delete',
    tag: 'Sharing',
    summary: 'Revoke a share link',
    auth: 'plus',
    params: [pp('itemId', 'The sync item id of the manuscript.', 'dev-1750000000000')],
    responses: { 200: '`{ revoked }`.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.' },
    prove: { url: '/api/shares/vakt', forventet: [401] },
  },
  {
    route: '/api/publications',
    method: 'get',
    tag: 'Sharing',
    summary: 'Your catalogue entries',
    auth: 'plus',
    responses: { 200: '`{ publications }` — yours, whatever their review status.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.' },
    prove: { url: '/api/publications', forventet: [401] },
  },
  {
    route: '/api/publications',
    method: 'post',
    tag: 'Sharing',
    summary: 'Submit a manuscript to the open catalogue',
    description: 'The text is frozen at submission and goes to review. Re-submitting an approved entry sends it back to `pending` with the new text.',
    auth: 'plus',
    body: { required: true, description: 'The sync item id of the manuscript.', example: { itemId: 'dev-1750000000000' } },
    responses: { 200: '`{ publication }`.', 400: '`itemId` missing.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.', 404: 'Unknown or empty manuscript, or not yours.', 429: 'Too many requests.' },
    prove: { url: '/api/publications', body: { itemId: 'vakt' }, forventet: [401] },
  },
  {
    route: '/api/publications/:itemId',
    method: 'delete',
    tag: 'Sharing',
    summary: 'Withdraw a catalogue entry',
    auth: 'plus',
    params: [pp('itemId', 'The sync item id of the manuscript.', 'dev-1750000000000')],
    responses: { 200: '`{ withdrawn }`.', 401: 'Not signed in.', 402: 'FLOGVIT.plus required.' },
    prove: { url: '/api/publications/vakt', forventet: [401] },
  },
  {
    route: '/api/publications/report/:slug',
    method: 'post',
    tag: 'Sharing',
    summary: 'Report a catalogue entry',
    description:
      'Open — no account. The answer is the same for a known and an unknown slug, so the button cannot be used to map the catalogue. Rate limit: 5 per minute per client.',
    params: [pp('slug', 'The catalogue address.', 'nytt-liv-a1b2c3')],
    responses: { 200: '`{ reported: true }`.', 429: 'Too many requests.' },
    prove: { url: '/api/publications/report/vakt-ukjent-slug', body: {}, forventet: [200, 429] },
  },
  {
    route: '/api/publications/pending',
    method: 'get',
    tag: 'Sharing',
    summary: 'The review queue',
    description: 'The transport for `scripts/publications-review.ts`. Both queues are paginated and carry `total` (#81).',
    auth: 'reviewToken',
    params: [qp('side', 'Page number, from 1.', { type: 'integer', example: '1' })],
    responses: { 200: '`{ pending, reported }`.', 403: 'Wrong token.', 404: 'The service has no `REVIEW_TOKEN`, so the endpoint does not exist.' },
    prove: { url: '/api/publications/pending', forventet: [403, 404] },
  },
  {
    route: '/api/publications/review/:slug',
    method: 'get',
    tag: 'Sharing',
    summary: 'One entry for review, wherever it sits in the queue',
    auth: 'reviewToken',
    params: [pp('slug', 'The catalogue address.', 'nytt-liv-a1b2c3')],
    responses: { 200: '`{ publication }` with the full text.', 403: 'Wrong token.', 404: 'Unknown slug — or the service has no `REVIEW_TOKEN`.' },
    prove: { url: '/api/publications/review/vakt-ukjent-slug', forventet: [403, 404] },
  },
  {
    route: '/api/publications/decide',
    method: 'post',
    tag: 'Sharing',
    summary: 'Approve or reject an entry',
    auth: 'reviewToken',
    body: { required: true, description: '`status` is `approved` or `rejected`; `note` is the reason shown to the author.', example: { slug: 'nytt-liv-a1b2c3', status: 'approved' } },
    responses: { 200: '`{ decided: true }`.', 400: 'Missing slug or a status that is neither.', 403: 'Wrong token.', 404: 'Unknown slug — or the service has no `REVIEW_TOKEN`.' },
    prove: { url: '/api/publications/decide', body: { slug: 'vakt', status: 'approved' }, forventet: [403, 404] },
  },

  // ── Bidrag ───────────────────────────────────────────────────────────
  {
    route: '/api/contrib',
    method: 'post',
    tag: 'Contributions',
    summary: 'Submit a work with verse references',
    description:
      'An account is enough — contributions are never behind the paywall. Give `raw` and `context_translation`; the KVN coordinates are filled in by review (see `../free-bible/contrib/README.md`). Rate limit: 10 per minute.',
    auth: 'session',
    body: { required: true, description: 'The submission.', example: { kind: 'article', payload: {} } },
    responses: { 201: '`{ id, status: "pending" }`.', 400: 'The submission did not validate.', 401: 'Not signed in.', 429: 'Too many requests.', 500: SERVER_ERROR },
    prove: { url: '/api/contrib', body: {}, forventet: [401] },
  },
  {
    route: '/api/contrib/mine',
    method: 'get',
    tag: 'Contributions',
    summary: 'Your own submissions',
    auth: 'session',
    responses: { 200: '`{ submissions }`, newest first.', 401: 'Not signed in.', 500: SERVER_ERROR },
    prove: { url: '/api/contrib/mine', forventet: [401] },
  },
  {
    route: '/api/contrib/:id/respond',
    method: 'post',
    tag: 'Contributions',
    summary: 'Answer a reviewer who asked for more',
    auth: 'session',
    params: [pp('id', 'The submission id.', '12', 'integer')],
    body: { required: true, description: 'Up to 2000 characters.', example: { message: 'The quote is from the 1978 edition.' } },
    responses: { 200: '`{ id, status: "pending" }`.', 400: 'Bad id or missing message.', 401: 'Not signed in.', 404: 'Not your submission.', 500: SERVER_ERROR },
    prove: { url: '/api/contrib/12/respond', body: { message: 'vakt' }, forventet: [401] },
  },
  {
    route: '/api/contrib/pending',
    method: 'get',
    tag: 'Contributions',
    summary: 'The submission queue',
    description: 'The transport for `scripts/contrib-pull.ts`.',
    auth: 'contribToken',
    responses: { 200: '`{ submissions }`.', 403: 'Wrong token.', 404: 'The service has no `CONTRIB_TOKEN`, so the endpoint does not exist.' },
    prove: { url: '/api/contrib/pending', forventet: [403, 404] },
  },
  {
    route: '/api/contrib/apply',
    method: 'post',
    tag: 'Contributions',
    summary: 'Write reviewed submissions back',
    description: 'The transport for `scripts/contrib-apply.ts`.',
    auth: 'contribToken',
    body: { required: true, description: 'The reviewed payloads.', example: { updates: [] } },
    responses: { 200: '`{ applied, failed }`.', 400: 'Missing `updates` array.', 403: 'Wrong token.', 404: 'The service has no `CONTRIB_TOKEN`.' },
    prove: { url: '/api/contrib/apply', body: { updates: [] }, forventet: [403, 404] },
  },

  // ── Tjenesten ────────────────────────────────────────────────────────
  {
    route: '/api/health',
    method: 'get',
    tag: 'Service',
    summary: 'Is the app up',
    responses: { 200: '`{ ok: true }`.' },
    prove: { url: '/api/health', forventet: [200] },
  },
  {
    route: '/api/version',
    method: 'get',
    tag: 'Service',
    summary: 'Content version',
    description: 'When the content was last imported, and the sync version that invalidates client caches.',
    responses: { 200: '`{ version, importedAt, syncVersion }`.', 500: 'The same shape, with the epoch as the version.' },
    prove: { url: '/api/version', forventet: [200] },
  },
  {
    route: '/api/minne',
    method: 'get',
    tag: 'Service',
    summary: 'Memory accounting',
    description: 'Aggregate counters for our own caches — no user data. Public on purpose: a number nobody can read at three in the morning is a number that does not exist.',
    responses: { 200: 'The counters.' },
    prove: { url: '/api/minne', forventet: [200] },
  },
  {
    route: '/api/openapi.json',
    method: 'get',
    tag: 'Service',
    summary: 'This specification',
    description: 'OpenAPI 3.1. Point Swagger UI, Redoc or a client generator straight at it.',
    responses: { 200: 'The OpenAPI document.' },
    prove: { url: '/api/openapi.json', forventet: [200] },
  },
  {
    route: '/api/docs',
    method: 'get',
    tag: 'Service',
    summary: 'The API explorer',
    description: 'This page: every endpoint, its parameters and a request you can run.',
    produces: 'text/html',
    responses: { 200: 'The HTML page.' },
    prove: { url: '/api/docs', forventet: [200] },
  },
];

/**
 * Ruter som med RETTE står utenfor spesifikasjonen, med grunnen.
 *
 * Tom i dag, og som `EXEMPT_ADDRESS_KEYS` (#46) er hver framtidig oppføring en
 * påstand — ikke et gjemmested for et endepunkt noen glemte å skrive opp.
 */
export const UDOKUMENTERTE_RUTER: { route: string; method: string; why: string }[] = [];

/** Det delte `lang`-parameteret (#24) — språket svaret kommer på. */
export const LANG_PARAM: ApiParam = {
  name: 'lang',
  in: 'query',
  description:
    'Content language for the response (`nb`, `nn`, `en`, `de`, `fr`, `es`, `sv`, `fi`). ' +
    'Without it we read the `Referer`, then `Accept-Language`, and fall back to English.',
  type: 'string',
  example: 'en',
};

/** Hono-stien slik OpenAPI skriver den: `:id{[0-9]+}` → `{id}`. */
export function openapiPath(route: string): string {
  return route.replace(/:([A-Za-z0-9_]+)(\{(?:[^{}]|\{[^{}]*\})*\})?/g, '{$1}');
}

/** Nøkkelen en operasjon kjennes igjen på — rute OG metode. */
export function operationKey(method: string, route: string): string {
  return `${method.toUpperCase()} ${route}`;
}

interface JsonSchema {
  type: string;
}

const schemaFor = (param: ApiParam): JsonSchema => ({ type: param.type ?? 'string' });

function parameterObject(param: ApiParam): Record<string, unknown> {
  return {
    name: param.name,
    in: param.in,
    required: param.in === 'path' ? true : !!param.required,
    description: param.description,
    schema: schemaFor(param),
    ...(param.example !== undefined && { example: param.example }),
  };
}

const SECURITY_SCHEMES: Record<string, Record<string, unknown>> = {
  session: {
    type: 'apiKey',
    in: 'cookie',
    name: 'fv-session',
    description:
      'The FLOGVIT account session cookie. Sign in at the account service; the cookie is shared across flogvit.com.',
  },
  plus: {
    type: 'apiKey',
    in: 'cookie',
    name: 'fv-session',
    description:
      'The FLOGVIT account session cookie, on an account with FLOGVIT.plus. Cloud storage — “husking” — is part of the subscription; everything local is free.',
  },
  contribToken: {
    type: 'apiKey',
    in: 'header',
    name: 'x-contrib-token',
    description: 'Operator token (`CONTRIB_TOKEN`). Without it configured on the service, the endpoint answers 404.',
  },
  reviewToken: {
    type: 'apiKey',
    in: 'header',
    name: 'x-review-token',
    description: 'Operator token (`REVIEW_TOKEN`). Without it configured on the service, the endpoint answers 404.',
  },
};

/**
 * OpenAPI 3.1-dokumentet, bygget av `API_OPERATIONS`.
 *
 * Opphavet kommer fra `absoluteUrl()` og ikke fra en literal — det er den ene
 * veien til en absolutt adresse i dette repoet (#80).
 */
export function openapiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of API_OPERATIONS) {
    const path = openapiPath(op.route);
    const params = [...(op.params ?? []), ...(op.lang ? [LANG_PARAM] : [])];
    const responses: Record<string, unknown> = {};
    for (const [status, description] of Object.entries(op.responses)) {
      responses[status] = {
        description,
        ...(status !== '301' && {
          content: { [op.produces ?? 'application/json']: { schema: {} } },
        }),
      };
    }

    (paths[path] ??= {})[op.method] = {
      tags: [op.tag],
      summary: op.summary,
      ...(op.description && { description: op.description }),
      operationId: `${op.method}${openapiPath(op.route).replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
      ...(params.length > 0 && { parameters: params.map(parameterObject) }),
      ...(op.body && {
        requestBody: {
          required: !!op.body.required,
          description: op.body.description,
          content: { 'application/json': { schema: { type: 'object' }, example: op.body.example } },
        },
      }),
      responses,
      ...(op.auth && { security: [{ [op.auth]: [] }] }),
      ...(op.prove && { 'x-eksempel': op.prove.url }),
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'FLOGVIT.bible API',
      version: API_VERSION,
      description:
        'Everything bible.flogvit.com knows: the Bible text in several editions and versifications, ' +
        'the daily verse, the study content around a chapter, and — for a signed-in account — the ' +
        'reader’s own notes, lists and reading progress.\n\n' +
        'Reading is open: no key, no account, no rate limit beyond ordinary load protection. ' +
        'Everything under **Your data** needs the account session cookie.\n\n' +
        'Responses are localised by `?lang=`; without it we read the `Referer`, then `Accept-Language`.',
      license: { name: 'Free to read', url: absoluteUrl('/no/om') },
    },
    servers: [{ url: absoluteUrl(''), description: 'Production' }],
    tags: API_TAGS,
    paths,
    components: { securitySchemes: SECURITY_SCHEMES },
  };
}
