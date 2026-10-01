// The tools a model gets. Each one answers a question a READER asks — "what does
// John 3:16 say, and in the Greek?", "where does the Bible talk about
// forgiveness?", "who was Tamar?" — not one per REST endpoint.
//
// All data comes from the getters in `src/lib/bible.ts`, the same ones the site
// renders from, so an answer here is the page there. Every answer ends with the
// address of that page, and quoted Bible text carries its licence: the CC BY
// obligation follows the text wherever the model puts it.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  getBibleEditionById,
  getBibleEditions,
  getBookSummary,
  getChapterContext,
  getChapterSummary,
  getDailyVerse,
  getGospelParallelById,
  getGospelParallelsForChapter,
  getImportantWords,
  getOriginalLanguage,
  getOriginalVerses,
  getOriginalWord4WordByVerse,
  getPersonData,
  getPersonsByChapter,
  getPropheciesForChapter,
  getProphecyById,
  getReferencesByVerse,
  getStoriesByChapter,
  getStoryBySlug,
  getThemeByName,
  getThemesByChapter,
  getTimelineEventsForChapter,
  getVerses,
  readableBibleCandidates,
  searchGospelParallels,
  searchOriginalWord,
  searchPersons,
  searchProphecies,
  searchStories,
  searchThemes,
  searchTimelineEvents,
  themeTitle,
  type ProphecyReference,
  type StoryData,
  type ThemeData,
  type Verse,
} from '../../src/lib/bible.ts';
import { bookName, type BookInfo } from '../../src/lib/books-data.ts';
import { IMPORTED_BIBLES } from '../../src/lib/editions.ts';
import { LOCALES } from '../../src/lib/i18n.ts';
import { bookById } from './books.ts';
import { chapterUrl, pageUrl } from './links.ts';
import { chaptersOf, contains, parseReferences, type Passage } from './reference.ts';
import { searchVerseText } from './search.ts';

/** Most verses one call returns per edition. Psalm 119 (176) fits. */
export const MAX_VERSES = 200;
/** Word-by-word is ~15 lines per verse; past this the answer drowns the model. */
export const MAX_WORD_BY_WORD_VERSES = 20;
export const MAX_CROSS_REFERENCE_VERSES = 50;
const MAX_PEOPLE = 20;

const READABLE = ['osnb', 'osnn', 'osen'] as const;

const language = z
  .enum(LOCALES)
  .default('en')
  .describe(
    'Language for names, notes and study content: en, nb (Norwegian Bokmål), nn (Norwegian Nynorsk), sv, fr, es, fi, de. Content missing in a language falls back to English.',
  );
const reference = z
  .string()
  .min(2)
  .describe(
    'Bible reference in English or Norwegian style, e.g. "John 3:16", "Joh 3,16-18", "1 Cor 13:4-7", "Ps 23", "Gen 1:1-2:3". Several separated by ";": "Rom 8:28; 9:1; John 3:16".',
  );

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// --- formatting ---

// The generated study text links with the site's own markup,
// `[ref:Gen 22:2|Genesis 22:2]`, `[person:abraham]` (see `src/views/inline-refs.tsx`).
// A model needs the words, not the envelope: the label if there is one, else
// the value without its `@edition` suffix.
const MARKUP = /\[(?:vers|ref|manuskript|andakt|tema|person|profeti|parallell|historie):([^\]|]+)(?:\|([^\]]+))?\]/g;

export function plain(body: string): string {
  return body.replace(MARKUP, (_, value: string, shown?: string) => shown ?? value.replace(/@[\w-]+$/, '').trim());
}

function text(body: string): CallToolResult {
  return { content: [{ type: 'text', text: plain(body) }] };
}

function failure(body: string): CallToolResult {
  return { content: [{ type: 'text', text: body }], isError: true };
}

/** "John 3:16-18", "John 3", "Genesis 1:1-2:3" — in the requested language. */
export function label(book: BookInfo, chapter: number, from: number | null, endChapter: number, to: number | null, lang: string): string {
  const name = bookName(book, lang);
  if (from === null || to === null) return endChapter === chapter ? `${name} ${chapter}` : `${name} ${chapter}-${endChapter}`;
  if (endChapter !== chapter) return `${name} ${chapter}:${from}-${endChapter}:${to}`;
  return from === to ? `${name} ${chapter}:${from}` : `${name} ${chapter}:${from}-${to}`;
}

function firstSentence(s: string): string {
  const m = s.match(/^.{20,240}?[.!?](?=\s|$)/s);
  return m ? m[0] : s.slice(0, 240);
}

const passageLabel = (p: Passage, lang: string) => label(p.book, p.chapter, p.verseStart, p.endChapter, p.verseEnd, lang);

function refLabel(bookId: number, chapter: number, from: number, to: number, lang: string): string {
  const book = bookById(bookId);
  return book ? label(book, chapter, from, chapter, to, lang) : `${bookId} ${chapter}:${from}-${to}`;
}

const prophecyRefLabel = (r: ProphecyReference, lang: string) => refLabel(r.book_id, r.chapter, r.verse_start, r.verse_end, lang);

type Parsed = { passages: Passage[]; notes: string; error?: undefined } | { error: CallToolResult };

function parsed(input: string): Parsed {
  const { passages, errors } = parseReferences(input);
  if (passages.length === 0) {
    return { error: failure(`Could not read the reference. ${errors.join(' ')}`.trim()) };
  }
  return { passages, notes: errors.length ? `\n\nSkipped: ${errors.join(' ')}` : '' };
}

async function attribution(editions: string[], lang: string): Promise<string> {
  const lines: string[] = [];
  for (const id of editions) {
    const e = await getBibleEditionById(id);
    if (!e) continue;
    lines.push(`${e.name_en} (${e.abbreviation ?? e.id}), ${e.license_spdx ?? e.license_name ?? ''}: ${pageUrl(lang, `/oversettelser/${e.id}`)}`);
  }
  return lines.length ? `\n\nSource: ${lines.join('; ')}` : '';
}

/** Verses of a passage in one edition, one query per chapter. */
async function passageVerses(p: Passage, bible: string): Promise<Verse[]> {
  const out: Verse[] = [];
  for (const chapter of chaptersOf(p)) {
    for (const v of await getVerses(p.book.id, chapter, bible)) {
      if (contains(p, v.chapter, v.verse)) out.push(v);
    }
  }
  return out;
}

async function defaultEdition(lang: string): Promise<string> {
  const [first] = await readableBibleCandidates(lang);
  return first?.id ?? 'osen';
}

// --- tools ---

export function registerTools(server: McpServer): void {
  server.registerTool(
    'list_editions',
    {
      title: 'List Bible editions',
      description:
        'The Bible editions available, with language and licence. OSNB (Norwegian Bokmål), OSNN (Norwegian Nynorsk) and OSEN (English) are open translations made by the free-bible project directly from the Hebrew and Greek; SBLGNT (Greek New Testament) and Tanach (Hebrew Old Testament, Leningrad Codex) are the source texts.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const lines: string[] = [];
      for (const e of await getBibleEditions()) {
        const full = await getBibleEditionById(e.id);
        lines.push(
          `- **${e.id}** — ${e.name_en}${e.name_native && e.name_native !== e.name_en ? ` (${e.name_native})` : ''}; language ${e.lang_iso639_1}; ${e.philosophy === 'source_text' ? 'source text' : 'translation'}; licence ${e.license_spdx ?? e.license_name}.` +
            (full?.license?.statement ? `\n  ${full.license.statement}` : '') +
            `\n  ${pageUrl('en', `/oversettelser/${e.id}`)}`,
        );
      }
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'get_passage',
    {
      title: 'Read a Bible passage',
      description:
        'Returns the text of one or more passages, side by side in the requested editions, with a link to the chapter on bible.flogvit.com. Use include_notes for the translators\' footnotes (translation choices, Greek/Hebrew linguistics, textual criticism, history, theology) and alternative renderings.',
      inputSchema: {
        reference,
        editions: z
          .array(z.enum(IMPORTED_BIBLES))
          .min(1)
          .max(5)
          .optional()
          .describe('Editions to show: osnb, osnn, osen, sblgnt (Greek NT), tanach (Hebrew OT). Default: the edition for `language`.'),
        include_notes: z.boolean().default(false).describe('Add footnotes and alternative renderings under each verse.'),
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ reference, editions, include_notes, language }) => {
      const p = parsed(reference);
      if (p.error) return p.error;
      const chosen = editions ?? [await defaultEdition(language)];

      const blocks: string[] = [];
      let remaining = MAX_VERSES;
      for (const passage of p.passages) {
        const parts = [`## ${passageLabel(passage, language)}\n${chapterUrl(passage.book, passage.chapter, language, passage.verseStart, chosen[0])}`];
        let shown = 0;
        for (const bible of chosen) {
          const verses = (await passageVerses(passage, bible)).slice(0, remaining);
          shown = Math.max(shown, verses.length);
          if (verses.length === 0) {
            parts.push(`**${bible}**: no text for this passage${bible === 'tanach' || bible === 'sblgnt' ? ' (tanach covers the Old Testament, sblgnt the New)' : ''}.`);
            continue;
          }
          const lines = verses.map((v) => {
            let line = `${passage.endChapter !== passage.chapter ? `${v.chapter}:` : ''}${v.verse} ${v.text}`;
            if (include_notes) {
              for (const f of v.footnotes ?? []) line += `\n   - note${f.source ? ` (${f.source})` : ''}: ${f.text}`;
              for (const alt of v.versions ?? []) line += `\n   - alternative: "${alt.text}" — ${alt.explanation}`;
            }
            return line;
          });
          parts.push(`**${bible}**\n${lines.join('\n')}`);
        }
        blocks.push(parts.join('\n\n'));
        remaining -= shown;
        if (remaining <= 0) {
          blocks.push(`(Stopped at ${MAX_VERSES} verses. Ask for a shorter passage to read further.)`);
          break;
        }
      }
      return text(blocks.join('\n\n') + p.notes + (await attribution(chosen, language)));
    },
  );

  server.registerTool(
    'search_bible',
    {
      title: 'Search the Bible text',
      description:
        'Finds verses containing ALL the given words in one edition. Words match as substrings, so a stem finds its forms ("forgiv" finds forgive, forgiven, forgiveness). Put a phrase in double quotes to match it exactly. Search the edition in the language of the words: osen for English, osnb/osnn for Norwegian, sblgnt/tanach for Greek/Hebrew spellings.',
      inputSchema: {
        query: z.string().min(2).describe('Words to find, e.g. `forgiv sins` or `"love one another"`.'),
        edition: z.enum(IMPORTED_BIBLES).default('osen'),
        book: z.string().optional().describe('Limit to one book, e.g. "John" or "Sal".'),
        testament: z.enum(['OT', 'NT']).optional().describe('Limit to the Old or New Testament.'),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ query, edition, book, testament, limit, offset, language }) => {
      let range = testament === 'OT' ? { from: 1, to: 39 } : testament === 'NT' ? { from: 40, to: 66 } : { from: 1, to: 66 };
      if (book) {
        const found = parseReferences(`${book} 1`).passages[0]?.book;
        if (!found) return failure(`Unknown book "${book}".`);
        range = { from: found.id, to: found.id };
      }
      const { hits, total } = await searchVerseText(query, edition, range, limit, offset);
      if (total === 0) return text(`No verses in ${edition} contain all of: ${query}`);
      const lines = hits.map((h) => {
        const b = bookById(h.book_id)!;
        return `- **${label(b, h.chapter, h.verse, h.chapter, h.verse, language)}** ${h.text}\n  ${chapterUrl(b, h.chapter, language, h.verse, edition)}`;
      });
      const more = offset + hits.length < total ? `\n\n${total - offset - hits.length} more — call again with offset ${offset + hits.length}.` : '';
      return text(`${total} verses in ${edition}, showing ${offset + 1}-${offset + hits.length}:\n\n${lines.join('\n')}${more}`);
    },
  );

  server.registerTool(
    'get_original_text',
    {
      title: 'Hebrew or Greek source text',
      description:
        'The Hebrew (Old Testament, Leningrad Codex) or Greek (New Testament, SBLGNT) text of a passage, optionally word by word with an explanation of each word. The word explanations are written in Norwegian; translate them for the user when needed.',
      inputSchema: {
        reference,
        word_by_word: z.boolean().default(true),
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ reference, word_by_word, language }) => {
      const p = parsed(reference);
      if (p.error) return p.error;
      const max = word_by_word ? MAX_WORD_BY_WORD_VERSES : MAX_VERSES;
      const blocks: string[] = [];
      const used = new Set<string>();
      let count = 0;

      outer: for (const passage of p.passages) {
        const bible = getOriginalLanguage(passage.book.id) === 'hebrew' ? 'tanach' : 'sblgnt';
        used.add(bible);
        const lines: string[] = [`## ${passageLabel(passage, language)} (${bible})\n${chapterUrl(passage.book, passage.chapter, language, passage.verseStart)}`];
        for (const chapter of chaptersOf(passage)) {
          const words = word_by_word ? await getOriginalWord4WordByVerse(passage.book.id, chapter, 'nb') : null;
          for (const v of await getOriginalVerses(passage.book.id, chapter)) {
            if (!contains(passage, v.chapter, v.verse)) continue;
            if (count++ >= max) {
              blocks.push(lines.join('\n'));
              blocks.push(`(Stopped at ${max} verses${word_by_word ? ' with word_by_word' : ''}. Ask for a shorter passage, or set word_by_word to false.)`);
              break outer;
            }
            lines.push(`\n${v.chapter}:${v.verse} ${v.text}`);
            for (const w of words?.get(v.verse) ?? []) {
              lines.push(`   - ${w.word}${w.pronunciation ? ` [${w.pronunciation}]` : ''}${w.explanation ? `: ${w.explanation}` : ''}`);
            }
          }
        }
        blocks.push(lines.join('\n'));
      }
      return text(blocks.join('\n\n') + p.notes + (await attribution([...used], language)));
    },
  );

  server.registerTool(
    'search_original_word',
    {
      title: 'Find a Hebrew or Greek word',
      description:
        'Finds every verse where a Hebrew or Greek word occurs, ignoring accents and cantillation (e.g. ἀγάπη, λόγος, חֶסֶד). Returns the source text and the translation side by side.',
      inputSchema: {
        word: z.string().min(1).describe('The word in Hebrew or Greek script.'),
        edition: z.enum(READABLE).default('osen').describe('Translation to show next to the source text.'),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ word, edition, limit, offset, language }) => {
      const r = await searchOriginalWord(word, limit, offset, edition);
      if (r.total === 0) return text(`"${word}" does not occur in the ${r.language === 'hebrew' ? 'Hebrew' : 'Greek'} text.`);
      const lines = r.results.map((h) => {
        const b = bookById(h.book_id)!;
        return `- **${label(b, h.chapter, h.verse, h.chapter, h.verse, language)}** ${h.original_text}\n  ${h.text}\n  ${chapterUrl(b, h.chapter, language, h.verse, edition)}`;
      });
      const more = r.hasMore ? `\n\nMore — call again with offset ${offset + r.results.length}.` : '';
      return text(
        `${r.total} verses with ${r.matchingWords.join(', ')} (${r.language}), showing ${offset + 1}-${offset + r.results.length}:\n\n${lines.join('\n')}${more}`,
      );
    },
  );

  server.registerTool(
    'get_cross_references',
    {
      title: 'Cross-references',
      description:
        'Other passages that relate to each verse of a passage, with a short note on how. Read them with get_passage (several references in one call, separated by ";").',
      inputSchema: { reference, language },
      annotations: READ_ONLY,
    },
    async ({ reference, language }) => {
      const p = parsed(reference);
      if (p.error) return p.error;
      const blocks: string[] = [];
      let count = 0;
      for (const passage of p.passages) {
        for (const chapter of chaptersOf(passage)) {
          const byVerse = await getReferencesByVerse(passage.book.id, chapter, language);
          for (const [verse, refs] of [...byVerse].sort((a, b) => a[0] - b[0])) {
            if (!contains(passage, chapter, verse) || refs.length === 0) continue;
            if (count++ >= MAX_CROSS_REFERENCE_VERSES) break;
            const items = refs.map((r) => `   - ${refLabel(r.to_book_id, r.to_chapter, r.to_verse_start, r.to_verse_end, language)}${r.description ? `: ${r.description}` : ''}`);
            blocks.push(`**${label(passage.book, chapter, verse, chapter, verse, language)}**\n${items.join('\n')}`);
          }
        }
      }
      if (blocks.length === 0) return text(`No cross-references recorded for ${reference} (they cover part of the Bible so far).`);
      return text(blocks.join('\n\n') + p.notes);
    },
  );

  server.registerTool(
    'get_chapter_study',
    {
      title: 'Study notes for a chapter',
      description:
        'Everything bible.flogvit.com has about one chapter: summary, historical context, key words, the people in it, themes, stories, prophecies, gospel parallels and timeline events. Give a chapter ("Rom 8"); verses are ignored.',
      inputSchema: { reference, language },
      annotations: READ_ONLY,
    },
    async ({ reference, language }) => {
      const p = parsed(reference);
      if (p.error) return p.error;
      const { book, chapter } = p.passages[0]!;
      const id = book.id;
      const lang = language;

      const [summary, context, words, persons, themes, stories, prophecies, parallels, timeline] = [
        await getChapterSummary(id, chapter, lang),
        await getChapterContext(id, chapter, lang),
        await getImportantWords(id, chapter, lang),
        await getPersonsByChapter(id, chapter, lang),
        await getThemesByChapter(id, chapter, lang),
        await getStoriesByChapter(id, chapter, lang),
        await getPropheciesForChapter(id, chapter, lang),
        await getGospelParallelsForChapter(id, chapter, lang),
        await getTimelineEventsForChapter(id, chapter, lang),
      ];

      const s: string[] = [`# ${label(book, chapter, null, chapter, null, lang)}\n${chapterUrl(book, chapter, lang)}`];
      if (summary) s.push(`## Summary\n${summary}`);
      if (context) s.push(`## Context\n${context}`);
      if (words.length) s.push(`## Key words\n${words.map((w) => `- **${w.word}**: ${w.explanation}`).join('\n')}`);
      if (persons.length) {
        s.push(`## People (details: get_person with the id)\n${persons.map((x) => `- ${x.name} — ${x.title} [id: ${x.id}]`).join('\n')}`);
      }
      if (stories.length) s.push(`## Stories\n${stories.map((x) => `- ${x.title}: ${x.description} [story id: ${x.slug}]`).join('\n')}`);
      if (themes.length) s.push(`## Themes\n${themes.map((x) => `- ${x.title}${x.introduction ? `: ${x.introduction}` : ''} [theme id: ${x.name}]`).join('\n')}`);
      if (prophecies.length) {
        s.push(
          `## Prophecies\n${prophecies
            .map((x) => `- ${x.title}: ${prophecyRefLabel(x.prophecy, lang)} → ${x.fulfillments.map((f) => prophecyRefLabel(f, lang)).join(', ')}${x.explanation ? ` — ${x.explanation}` : ''}`)
            .join('\n')}`,
        );
      }
      if (parallels.length) {
        s.push(
          `## Gospel parallels\n${parallels
            .map((x) => `- ${x.title}: ${Object.values(x.passages ?? {}).map((g) => refLabel(g.book_id, g.chapter, g.verse_start, g.verse_end, lang)).join(' | ')}`)
            .join('\n')}`,
        );
      }
      if (timeline.length) {
        s.push(`## Timeline\n${timeline.map((x) => `- ${x.year_display ?? ''} ${x.title}${x.description ? `: ${x.description}` : ''}`.trim()).join('\n')}`);
      }
      if (s.length === 1) s.push('No study notes for this chapter yet.');
      return text(s.join('\n\n'));
    },
  );

  server.registerTool(
    'get_book_overview',
    {
      title: 'Introduction to a book',
      description: 'An introduction to a whole book of the Bible: author, date, audience, structure and main themes.',
      inputSchema: { book: z.string().describe('Book name in any language, e.g. "Romans", "Rom", "Romerbrevet".'), language },
      annotations: READ_ONLY,
    },
    async ({ book, language }) => {
      const found = parseReferences(`${book} 1`).passages[0]?.book;
      if (!found) return failure(`Unknown book "${book}".`);
      const summary = await getBookSummary(found.id, language);
      return text(`${summary ?? `# ${bookName(found, language)}\n\nNo introduction for this book yet.`}\n\n${found.chapters} chapters. ${chapterUrl(found, 1, language)}`);
    },
  );

  server.registerTool(
    'search_people',
    {
      title: 'Find people in the Bible',
      description: 'Finds people by name or by what is said about them ("king Judah", "prophetess"). Returns ids for get_person.',
      inputSchema: { query: z.string().min(2), language },
      annotations: READ_ONLY,
    },
    async ({ query, language }) => {
      // The search also matches the biography text, so a name hit goes first:
      // «tamar» is Tamar before it is everyone whose story mentions her.
      const q = query.toLowerCase();
      const hits = (await searchPersons(query, language))
        .map((x) => ({ x, byName: x.name.toLowerCase().includes(q) || x.id.includes(q) }))
        .sort((a, b) => Number(b.byName) - Number(a.byName))
        .slice(0, MAX_PEOPLE)
        .map(({ x }) => x);
      if (hits.length === 0) return text(`No people match "${query}".`);
      return text(hits.map((x) => `- **${x.name}** — ${x.title} (${x.era}) [id: ${x.id}]\n  ${firstSentence(x.summary)}`).join('\n'));
    },
  );

  server.registerTool(
    'get_person',
    {
      title: 'A person in the Bible',
      description: 'One person: summary, family, related people and key events with the passages where they happen.',
      inputSchema: { id: z.string().describe('Person id from search_people or get_chapter_study, e.g. "tamar-juda".'), language },
      annotations: READ_ONLY,
    },
    async ({ id, language }) => {
      const x = await getPersonData(id, language);
      if (!x) return failure(`No person with id "${id}". Use search_people to find the id.`);
      const verseRefs = (refs: { bookId: number; chapter: number; verse?: number; verses?: number[] }[]) =>
        refs
          .map((r) => {
            const vs = r.verses ?? (r.verse ? [r.verse] : []);
            return vs.length ? refLabel(r.bookId, r.chapter, Math.min(...vs), Math.max(...vs), language) : refLabel(r.bookId, r.chapter, 1, 1, language).replace(/:1$/, '');
          })
          .join(', ');
      const f = x.family ?? {};
      const family = [
        f.father && `father: ${f.father}`,
        f.mother && `mother: ${f.mother}`,
        f.spouse && `spouse: ${f.spouse}`,
        f.siblings?.length && `siblings: ${f.siblings.join(', ')}`,
        f.children?.length && `children: ${f.children.join(', ')}`,
      ].filter(Boolean);
      const s = [
        `# ${x.name} — ${x.title}\n${pageUrl(language, `/personer/${x.id}`)}`,
        `Era: ${x.era}${x.lifespan ? `, ${x.lifespan}` : ''}. Roles: ${x.roles.join(', ')}.`,
        x.summary,
      ];
      if (family.length) s.push(`## Family (person ids)\n${family.join('\n')}`);
      if (x.relatedPersons?.length) s.push(`## Related (person ids)\n${x.relatedPersons.join(', ')}`);
      if (x.keyEvents?.length) s.push(`## Key events\n${x.keyEvents.map((e) => `- **${e.title}** (${verseRefs(e.verses)}): ${e.description}`).join('\n')}`);
      return text(s.join('\n\n'));
    },
  );

  server.registerTool(
    'search_topics',
    {
      title: 'Find stories, themes and prophecies',
      description:
        'Searches the study material: Bible stories (e.g. "prodigal son"), themes (e.g. "forgiveness"), prophecies and their fulfilment, gospel parallels and timeline events. Returns ids for get_topic.',
      inputSchema: { query: z.string().min(2), language },
      annotations: READ_ONLY,
    },
    async ({ query, language }) => {
      const [stories, themes, prophecies, parallels, timeline] = [
        await searchStories(query, language),
        await searchThemes(query, language),
        await searchProphecies(query, language),
        await searchGospelParallels(query, language),
        await searchTimelineEvents(query, language),
      ];
      const s: string[] = [];
      if (stories.length) s.push(`## Stories\n${stories.slice(0, 15).map((x) => `- ${x.title}${x.description ? `: ${x.description}` : ''} [kind: story, id: ${x.slug}]`).join('\n')}`);
      if (themes.length) s.push(`## Themes\n${themes.slice(0, 15).map((x) => `- ${themeTitle(x)} [kind: theme, id: ${x.name}]`).join('\n')}`);
      if (prophecies.length) s.push(`## Prophecies\n${prophecies.slice(0, 15).map((x) => `- ${x.title} (${x.category_name}) [kind: prophecy, id: ${x.id}]`).join('\n')}`);
      if (parallels.length) s.push(`## Gospel parallels\n${parallels.slice(0, 15).map((x) => `- ${x.title} (${x.section_name}) [kind: parallel, id: ${x.id}]`).join('\n')}`);
      if (timeline.length) s.push(`## Timeline\n${timeline.slice(0, 15).map((x) => `- ${x.year_display ?? ''} ${x.title}${x.description ? `: ${x.description}` : ''}`.trim()).join('\n')}`);
      return text(s.length ? s.join('\n\n') : `Nothing matches "${query}". Try fewer or shorter words.`);
    },
  );

  server.registerTool(
    'get_topic',
    {
      title: 'A story, theme, prophecy or gospel parallel',
      description: 'The full entry for an id from search_topics or get_chapter_study, with the passages it is built on.',
      inputSchema: {
        kind: z.enum(['story', 'theme', 'prophecy', 'parallel']),
        id: z.string(),
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ kind, id, language }) => {
      const missing = failure(`No ${kind} with id "${id}". Use search_topics to find the id.`);
      if (kind === 'story') {
        const row = await getStoryBySlug(id, language);
        if (!row) return missing;
        const data = JSON.parse(row.content) as StoryData;
        const refs = data.references.map((r) => {
          const b = bookById(r.bookId);
          return b ? label(b, r.startChapter, r.startVerse, r.endChapter, r.endVerse, language) : '';
        });
        return text(`# ${data.title}\n${pageUrl(language, `/historier/${row.slug}`)}\n\n${data.description}\n\nPassages: ${refs.join('; ')}`);
      }
      if (kind === 'theme') {
        const row = await getThemeByName(id, language);
        if (!row) return missing;
        let data: ThemeData;
        try {
          data = JSON.parse(row.content) as ThemeData;
        } catch {
          return text(`# ${themeTitle(row)}\n${pageUrl(language, `/temaer/${row.name}`)}\n\n${row.content}`);
        }
        const sections = data.sections.map((sec) => {
          const refs = sec.verses.map((v) => {
            const vs = v.verses ?? (v.verse ? [v.verse] : []);
            return vs.length ? refLabel(v.bookId, v.chapter, Math.min(...vs), Math.max(...vs), language) : '';
          });
          return `## ${sec.title}\n${sec.description ?? ''}\nPassages: ${refs.filter(Boolean).join('; ')}`;
        });
        return text(`# ${data.title}\n${pageUrl(language, `/temaer/${row.name}`)}\n\n${data.introduction ?? ''}\n\n${sections.join('\n\n')}`);
      }
      if (kind === 'prophecy') {
        const x = await getProphecyById(id, language);
        if (!x) return missing;
        return text(
          `# ${x.title}\n${pageUrl(language, '/profetier')}\n\nProphecy: ${prophecyRefLabel(x.prophecy, language)}\nFulfilment: ${x.fulfillments.map((f) => prophecyRefLabel(f, language)).join('; ')}\n\n${x.explanation ?? ''}`,
        );
      }
      const x = await getGospelParallelById(id, language);
      if (!x) return missing;
      const passages = Object.values(x.passages ?? {}).map((g) => refLabel(g.book_id, g.chapter, g.verse_start, g.verse_end, language));
      return text(`# ${x.title}\n${pageUrl(language, '/paralleller')}\n\nPassages: ${passages.join('; ')}${x.notes ? `\n\n${x.notes}` : ''}`);
    },
  );

  server.registerTool(
    'get_daily_verse',
    {
      title: 'Verse of the day',
      description: "Today's verse on bible.flogvit.com, with a short note.",
      inputSchema: { language, edition: z.enum(READABLE).optional() },
      annotations: READ_ONLY,
    },
    async ({ language, edition }) => {
      const bible = edition ?? (await defaultEdition(language));
      const v = await getDailyVerse(bible, language);
      const book = v ? bookById(v.bookId) : undefined;
      if (!v || !book) return text('No verse of the day today.');
      return text(
        `**${label(book, v.chapter, v.verseStart, v.chapter, v.verseEnd, language)}** (${bible})\n${v.text}${v.note ? `\n\n${v.note}` : ''}\n\n${chapterUrl(book, v.chapter, language, v.verseStart, bible)}` +
          (await attribution([bible], language)),
      );
    },
  );
}
