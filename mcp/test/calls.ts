// One ordinary call per tool, shared by server.test.ts (the answers) and
// grants.test.ts (the same calls as the read-only database user). One list, so
// a tool added here is held to both the moment it is added.

export const CALLS: [string, Record<string, unknown>][] = [
  ['list_editions', {}],
  ['get_passage', { reference: 'John 3:16-18', editions: ['osen', 'osnb', 'sblgnt'], include_notes: true }],
  ['get_passage', { reference: 'Ps 23', language: 'nb' }],
  ['search_bible', { query: 'forgiv sins', testament: 'NT' }],
  ['search_bible', { query: '"elske hverandre"', edition: 'osnb', book: 'Joh', language: 'nb' }],
  ['get_original_text', { reference: 'John 1:1-2' }],
  ['get_original_text', { reference: 'Gen 1:1', word_by_word: false }],
  ['search_original_word', { word: 'ἀγάπη', limit: 5 }],
  ['get_cross_references', { reference: 'John 3:16' }],
  ['get_chapter_study', { reference: 'Matt 1' }],
  ['get_book_overview', { book: 'Romerbrevet', language: 'nb' }],
  ['search_people', { query: 'tamar' }],
  ['get_person', { id: 'tamar-juda' }],
  ['search_topics', { query: 'prodigal' }],
  ['get_topic', { kind: 'story', id: 'den-fortapte-sonn' }],
  ['get_topic', { kind: 'theme', id: 'david' }],
  ['get_daily_verse', { language: 'nn' }],
  ['check_references', { text: 'Som det står i Joh 3,16.\nSal 23,9 finnes ikke.', language: 'nb' }],
  ['get_church_year_readings', { date: '2026-03-25' }],
  ['get_church_year_readings', { name: 'Pinsedag', date: '2026-01-01', include_text: true, language: 'nb' }],
  ['get_timeline', {}],
  ['get_timeline', { period: 'exile' }],
  ['get_timeline', { timeline: 'world', from_year: -600, to_year: -500, language: 'nb' }],
  ['get_prophecies', { reference: 'Isa 53', include_text: true }],
  ['get_prophecies', {}],
  ['get_story', { name: 'The Prodigal Son' }],
  ['get_story', { name: 'David og Goliat', language: 'nb', include_text: false }],
  ['get_number', { number: 40 }],
  ['get_number', {}],
  ['get_gospel_parallels', { reference: 'Mark 4:35-41', include_text: true }],
  ['get_gospel_parallels', {}],
  ['list_verse_mappings', { query: 'king james' }],
  ['get_passage', { reference: 'Mal 4:5-6', mapping: 'kjv' }],
  ['get_cross_references', { reference: 'Luke 1:78', mapping: 'english_kj' }],
  ['check_references', { text: 'Elia kommer, Mal 4,5.', mapping: 'kjv', language: 'nb' }],
];

/** A JSON-RPC message POSTed to /mcp, as a Streamable HTTP client sends it. */
export function mcpPost(handler: (req: Request) => Promise<Response>, body: unknown): Promise<Response> {
  return handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    }),
  );
}
