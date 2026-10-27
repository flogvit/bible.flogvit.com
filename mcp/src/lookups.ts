// Direct lookups for what bible.flogvit.com has its own pages for (#169): the
// church year's readings (/lesetekster), the timeline (/tidslinje), prophecies
// (/profetier), Bible stories (/historier), numbers (/tall) and gospel
// parallels (/paralleller). search_topics FINDS these by words; a lookup
// answers the question a reader actually asks — "what are the readings on Palm
// Sunday?", "what happened during the exile?", "what does 40 mean?" — in one
// call, by date, name, number, period or passage.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  defaultBibleForLanguage,
  getAllDays,
  getAllNumberSymbolism,
  getAllReadingTexts,
  getDayById,
  getGospelParallels,
  getNumberSymbolismByNumber,
  getProphecies,
  getProphecyCategories,
  getReadingTextContentLanguages,
  getReadingTextsByDate,
  getStoryBySlug,
  getTimelineEventsWhere,
  searchStories,
  timelinePeriodsOf,
  type DayData,
  type NumberSymbolismData,
  type Prophecy,
  type ReadingTextWithSlots,
  type Story,
  type StoryData,
  type TimelineEvent,
} from '../../src/lib/bible.ts';
import { makeT, tEnum, type Locale } from '../../src/lib/i18n.ts';
import {
  attribution,
  failure,
  inMapping,
  labelMapping,
  language,
  mapping,
  MAX_VERSES,
  numberedAs,
  overlaps,
  parsed,
  passageAt,
  passageLabel,
  quote,
  quoteEdition,
  READ_ONLY,
  refLabel,
  resolveMapping,
  text,
  toOsnb,
} from './answer.ts';
import { pageUrl } from './links.ts';
import type { Passage } from './reference.ts';

const MAX_TIMELINE_EVENTS = 60;
/** Joseph's story runs over 14 chapters; past this the text is a pointer. */
const MAX_STORY_VERSES = 80;
const MAX_NUMBER_REFERENCES = 100;
/** Past this many prophecies, the list gives titles and passages without the explanations. */
const MAX_EXPLAINED_PROPHECIES = 12;
const MAX_OTHER_STORIES = 8;

const GOSPEL_ORDER = ['matthew', 'mark', 'luke', 'john'];

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const today = () => new Date().toISOString().slice(0, 10);

/** Lower case, letters and digits only: "Domssøndag / Kristi kongedag" and "Domssøndag/Kristi kongedag" are one name. */
const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The same day? The lectionary and `days` name some days in two parts, and not
 * always both: "Påskenatt/Ottesang" is the day `days` calls "Påskenatt".
 */
const sameDay = (a: string, b: string) => {
  const parts = (s: string) => s.split('/').map(fold).filter(Boolean);
  const other = parts(b);
  return parts(a).some((p) => other.includes(p));
};

const matchesAll = (haystack: string, query: string) => {
  const h = fold(haystack);
  return fold(query)
    .split(' ')
    .every((w) => h.includes(w));
};

const yearText = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

const includeText = (what: string, dflt: boolean, cap: number) =>
  z
    .boolean()
    .default(dflt)
    .describe(`true quotes ${what} (at most ${cap} verses in all); false gives the passages only. Default: ${dflt}.`);

// --- church year ---

/**
 * The reading days a name points at, as the lectionary spells them. The
 * lectionary is Norwegian; `days` has the major feasts in English too, so
 * "Palm Sunday" finds "Palmesøndag" through the day's id.
 */
async function readingDayNames(query: string, lectionaryNames: string[], lang: string): Promise<Set<string>> {
  const norwegian = new Map((await getAllDays('nb')).map((d) => [d.id, d.name]));
  const days = [...(await getAllDays(lang)), ...(await getAllDays('en'))];
  const lookup = (match: (name: string) => boolean) => {
    const names = new Set(lectionaryNames.filter(match));
    for (const d of days) {
      const nb = norwegian.get(d.id);
      if (nb && match(d.name)) for (const n of lectionaryNames) if (sameDay(n, nb)) names.add(n);
    }
    return names;
  };
  // The day's own name wins over a day that only mentions it: "Pentecost" is
  // Pinsedag, not "Sunday before Pentecost".
  const exact = lookup((name) => sameDay(name, query));
  return exact.size ? exact : lookup((name) => matchesAll(name, query));
}

/** The `days` entry for a lectionary day, in the reader's language, if there is one. */
async function dayFor(lectionaryName: string, lang: string): Promise<DayData | null> {
  const day = (await getAllDays('nb')).find((d) => sameDay(d.name, lectionaryName));
  const row = day && (await getDayById(day.id, lang));
  if (!row) return null;
  try {
    return JSON.parse(row.content) as DayData;
  } catch {
    return null;
  }
}

function readingPassages(part: ReadingTextWithSlots['slots'][number]['options'][number]['parts'][number]): Passage[] {
  return part.ranges
    .map((r) => passageAt(r.book_id, r.chapter, r.verse_end === null ? null : r.verse_start, r.chapter, r.verse_end))
    .filter((p): p is Passage => p !== null);
}

// --- registration ---

export function registerLookupTools(server: McpServer): void {
  server.registerTool(
    'get_church_year_readings',
    {
      title: 'Readings for a Sunday or feast day',
      description:
        "The Bible readings the Church of Norway (Den norske kirke) appoints for a Sunday or feast day, from the lectionary bible.flogvit.com shows: each reading with its title and passage (alternatives marked \"or\"), the year's text series, and what the day is about. Give a date, a day's name, or nothing for the next day with readings. The lectionary runs from Advent 2025 to the end of 2028. Day names and reading titles are in Norwegian; translate them for the user when needed.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe(
            'A date as YYYY-MM-DD, e.g. "2026-12-24". When nothing is appointed on that date, the next date with readings is used, so a weekday gives the coming Sunday. With name, the search starts here. Default: today.',
          ),
        name: z
          .string()
          .min(3)
          .optional()
          .describe(
            'The day\'s name, e.g. "Palmesøndag", "Pinsedag", "2. søndag i adventstiden", or for the major feasts in English: "Palm Sunday", "Christmas Day", "Pentecost". Gives the first time that day falls on or after date. Default: none, and date decides.',
          ),
        include_text: includeText('the verses of every reading', false, MAX_VERSES),
        edition: quoteEdition,
        mapping: labelMapping,
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ date, name, include_text, edition, mapping, language }) => {
      const numbering = resolveMapping(mapping);
      if (numbering.error) return numbering.error;
      // The lectionary is Norwegian content (#26): on a language that does
      // not have it, answer from the language that does, and say so.
      let lang: string = language;
      let all = await getAllReadingTexts(lang);
      if (all.length === 0) {
        lang = (await getReadingTextContentLanguages())[0] ?? 'nb';
        all = await getAllReadingTexts(lang);
      }
      if (all.length === 0) return text('There are no church year readings on bible.flogvit.com.');

      const from = date ?? today();
      let candidates = all;
      let names: Set<string> | null = null;
      if (name) {
        names = await readingDayNames(name, [...new Set(all.map((t) => t.name))], language);
        candidates = all.filter((t) => names!.has(t.name));
        if (candidates.length === 0) {
          const known = [...new Map(all.map((t) => [fold(t.name), t.name])).values()].join('; ');
          return failure(`No Sunday or feast day in the lectionary matches "${name}". The days it has: ${known}`);
        }
      }
      const next = candidates.find((t) => t.date >= from);
      if (!next && !name) {
        return text(`No readings on or after ${from}: the lectionary on bible.flogvit.com runs from ${all[0]!.date} to ${all.at(-1)!.date}.`);
      }
      const target = next ?? candidates.at(-1)!;
      const day = target.date;
      const rows = (await getReadingTextsByDate(day, lang)).filter((r) => !names || names.has(r.name));

      const bible = edition ?? (await defaultBibleForLanguage(language));
      const pageLocale = lang === language ? language : lang;
      let remaining = MAX_VERSES;
      let quoted = false;
      const blocks: string[] = [];
      if (!next) blocks.push(`(The lectionary ends ${all.at(-1)!.date}; this is the last time "${name}" is in it.)`);

      for (const row of rows) {
        const about = await dayFor(row.name, language);
        const head = [
          `# ${row.name} — ${day}${row.series ? ` (text series ${row.series})` : ''}`,
          about && fold(about.name) !== fold(row.name) ? `${about.name}: ${about.description}` : about?.description,
          pageUrl(pageLocale, `/lesetekster/${day}`),
          about ? `About the day: ${pageUrl(language, `/dager/${about.id}`)}` : null,
        ].filter(Boolean);
        const lines: string[] = [head.join('\n')];
        for (const [i, slot] of row.slots.entries()) {
          for (const [j, option] of slot.options.entries()) {
            // A reading can be several parts read in turn (Easter Vigil); the
            // number goes on the first, an alternative is marked "or".
            for (const [k, part] of option.parts.entries()) {
              const passages = readingPassages(part);
              const where = passages.map((p) => passageLabel(inMapping(p, numbering.id), language)).join('; ');
              const mark = k > 0 ? '     ' : j === 0 ? `${i + 1}.` : '   or:';
              lines.push(`${mark} ${part.title ? `${part.title} — ` : ''}${where}`);
              if (!include_text) continue;
              for (const p of passages) {
                const q = await quote(inMapping(p, numbering.id), bible, remaining, language, numbering.id);
                remaining -= q.shown;
                quoted ||= q.shown > 0;
                lines.push(...q.lines);
              }
            }
          }
        }
        blocks.push(lines.join('\n'));
      }
      if (lang !== language) blocks.push('(The church year readings are only on bible.flogvit.com in Norwegian.)');
      return text(blocks.join('\n\n') + numberedAs(numbering.id) + (quoted ? await attribution([bible], language) : ''));
    },
  );

  server.registerTool(
    'get_timeline',
    {
      title: 'The Bible timeline',
      description:
        "Events in the order they happened, with year, description and the passages they are told in: for a period (\"the exile\"), a span of years, or events that mention a person or place. Called with no arguments, it lists the periods with their years. Years before Christ are negative. The world timeline gives what happened in the world around at the same time.",
      inputSchema: {
        period: z
          .string()
          .min(2)
          .optional()
          .describe('A period, by id or by words from its name, e.g. "exodus", "exile", "Jesus\' life", "early church". Call with no arguments to see them all. Default: none.'),
        from_year: z.number().int().optional().describe('First year to include; negative is BC, e.g. -1000 for 1000 BC. Default: no lower limit.'),
        to_year: z.number().int().optional().describe('Last year to include; negative is BC, e.g. -900. Default: no upper limit.'),
        query: z
          .string()
          .min(2)
          .optional()
          .describe('Words the event\'s title or description must contain, e.g. a person ("David", "Paul") or a place ("Babylon"). Default: none.'),
        timeline: z
          .enum(['bible', 'world'])
          .default('bible')
          .describe('bible (the events the Bible tells) or world (world history in the same periods). Default: bible.'),
        mapping: labelMapping,
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ period, from_year, to_year, query, timeline, mapping, language }) => {
      const numbering = resolveMapping(mapping);
      if (numbering.error) return numbering.error;
      const periods = await timelinePeriodsOf(timeline, language);
      const url = pageUrl(language, '/tidslinje');
      let chosen = null as (typeof periods)[number] | null;
      if (period) {
        chosen = periods.find((p) => p.id === period) ?? periods.find((p) => matchesAll(p.name, period)) ?? null;
        if (!chosen) return failure(`No period matches "${period}". The periods: ${periods.map((p) => `${p.name} [${p.id}]`).join('; ')}`);
      }
      const keep = (e: TimelineEvent) =>
        (!chosen || e.period_id === chosen.id) &&
        (from_year === undefined || (e.year !== null && e.year >= from_year)) &&
        (to_year === undefined || (e.year !== null && e.year <= to_year)) &&
        (!query || matchesAll(`${e.title} ${e.description ?? ''}`, query));
      const filtered = Boolean(period || from_year !== undefined || to_year !== undefined || query);
      const { events, matched } = await getTimelineEventsWhere(timeline, keep, filtered ? MAX_TIMELINE_EVENTS : 0, language);

      if (!filtered) {
        const lines = periods.map((p) => {
          const own = matched.filter((e) => e.period_id === p.id);
          const years = own.map((e) => e.year).filter((y): y is number => y !== null);
          const span = years.length ? `${yearText(Math.min(...years))} – ${yearText(Math.max(...years))}` : 'undated';
          return `- **${p.name}** [period: ${p.id}] — ${span}, ${count(own.length, 'event')}${p.description ? `\n  ${p.description}` : ''}`;
        });
        return text(`# The ${timeline === 'world' ? 'world ' : ''}timeline: ${periods.length} periods\n${url}\n\n${lines.join('\n')}`);
      }
      if (matched.length === 0) return text('No events match. Leave out query or widen the years.');

      const head = [
        chosen ? `# ${chosen.name}${chosen.description ? `\n${chosen.description}` : ''}` : '# Timeline',
        [from_year !== undefined && `from ${yearText(from_year)}`, to_year !== undefined && `to ${yearText(to_year)}`, query && `mentioning "${query}"`]
          .filter(Boolean)
          .join(', '),
        url,
      ].filter(Boolean);
      const lines = events.map((e) => {
        const when = e.year_display ?? (e.year !== null ? yearText(e.year) : '');
        const refs = (e.references ?? []).map((r) => refLabel(r.book_id, r.chapter, r.verse_start, r.verse_end, language, numbering.id)).join('; ');
        return `- ${when ? `${when} — ` : ''}**${e.title}**${e.importance === 'major' ? ' (major)' : ''}${e.description ? `: ${e.description}` : ''}${refs ? `\n  ${refs}` : ''}`;
      });
      const more = matched.length > events.length ? `\n\n${matched.length - events.length} more events — narrow with from_year/to_year or query.` : '';
      return text(`${head.join('\n')}\n\n${count(matched.length, 'event')}:\n\n${lines.join('\n')}${more}${numberedAs(numbering.id)}`);
    },
  );

  server.registerTool(
    'get_prophecies',
    {
      title: 'Prophecies and their fulfilment',
      description:
        'Prophecies in the Bible with the passage that makes them, the passages that fulfil them, and an explanation: those made or fulfilled in a passage ("Isa 53", "Matt 2"), those in a category, or all of them by category when called with no arguments.',
      inputSchema: {
        reference: z
          .string()
          .min(2)
          .optional()
          .describe('A passage; gives the prophecies made in it or fulfilled in it, e.g. "Isa 7:14", "Isa 53", "Matt 2:1-6". Default: none.'),
        category: z
          .string()
          .min(2)
          .optional()
          .describe('A category, by id or by words from its name, e.g. "messiah", "birth", "passion". Call with no arguments to see the categories. Default: all.'),
        include_text: includeText('the prophecy and its fulfilment', false, MAX_VERSES),
        edition: quoteEdition,
        mapping,
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ reference, category, include_text, edition, mapping, language }) => {
      const numbering = resolveMapping(mapping);
      if (numbering.error) return numbering.error;
      let list = await getProphecies(language);
      let target: Passage[] | null = null;
      let notes = '';
      if (reference) {
        const p = parsed(reference, numbering.id);
        if (p.error) return p.error;
        target = await toOsnb(p.passages, numbering.id);
        notes = p.notes;
      }
      if (category) {
        const categories = await getProphecyCategories(language);
        const c = categories.find((x) => x.id === category) ?? categories.find((x) => matchesAll(`${x.name} ${x.description ?? ''}`, category));
        if (!c) return failure(`No category matches "${category}". The categories: ${categories.map((x) => `${x.name} [${x.id}]`).join('; ')}`);
        list = list.filter((x) => x.category_id === c.id);
      }
      const passagesOf = (x: Prophecy) =>
        [x.prophecy, ...x.fulfillments].map((r) => passageAt(r.book_id, r.chapter, r.verse_start, r.chapter, r.verse_end)).filter((p): p is Passage => p !== null);
      if (target) list = list.filter((x) => passagesOf(x).some((p) => target!.some((t) => overlaps(p, t))));
      if (list.length === 0) return text(`No prophecies ${reference ? `are made or fulfilled in ${reference}` : 'in that category'}.${notes}`);

      const explain = list.length <= MAX_EXPLAINED_PROPHECIES;
      const bible = edition ?? (await defaultBibleForLanguage(language));
      let remaining = MAX_VERSES;
      let quoted = false;
      const groups = new Map<string, string[]>();
      for (const x of list) {
        const prophecy = passageAt(x.prophecy.book_id, x.prophecy.chapter, x.prophecy.verse_start, x.prophecy.chapter, x.prophecy.verse_end);
        const lines = [
          `### ${x.title} [id: ${x.id}]`,
          `Prophecy: ${refLabel(x.prophecy.book_id, x.prophecy.chapter, x.prophecy.verse_start, x.prophecy.verse_end, language, numbering.id)}`,
          `Fulfilled: ${x.fulfillments.map((f) => refLabel(f.book_id, f.chapter, f.verse_start, f.verse_end, language, numbering.id)).join('; ')}`,
        ];
        if (explain && x.explanation) lines.push(x.explanation);
        if (include_text) {
          for (const [role, p] of [
            ['Prophecy', prophecy],
            ...x.fulfillments.map((f) => ['Fulfilment', passageAt(f.book_id, f.chapter, f.verse_start, f.chapter, f.verse_end)] as const),
          ] as const) {
            if (!p) continue;
            const q = await quote(inMapping(p, numbering.id), bible, remaining, language, numbering.id);
            remaining -= q.shown;
            quoted ||= q.shown > 0;
            lines.push(`${role}, ${passageLabel(inMapping(p, numbering.id), language)}:`, ...q.lines);
          }
        }
        const key = x.category?.name || x.category_id;
        groups.set(key, [...(groups.get(key) ?? []), lines.join('\n')]);
      }
      const body = [...groups].map(([name, items]) => `## ${name}\n\n${items.join('\n\n')}`).join('\n\n');
      const hint = explain ? '' : '\n\nFor the explanation of one, ask with its passage or use get_topic with kind "prophecy" and the id.';
      return text(
        `# ${count(list.length, 'prophecy', 'prophecies')}\n${pageUrl(language, '/profetier')}\n\n${body}${hint}${notes}${numberedAs(numbering.id)}` + (quoted ? await attribution([bible], language) : ''),
      );
    },
  );

  server.registerTool(
    'get_story',
    {
      title: 'A Bible story',
      description:
        'A Bible story by its name: what happens, where it is told, and the text itself, e.g. "The Prodigal Son", "David and Goliath", "Jonah". Names in English and Norwegian both work. Other stories the name could mean are listed with their ids.',
      inputSchema: {
        name: z
          .string()
          .min(2)
          .describe('The story\'s title or id, or words from it, e.g. "The Prodigal Son", "den-fortapte-sonn", "Goliath", "Den barmhjertige samaritan".'),
        include_text: includeText('the passages the story is told in', true, MAX_STORY_VERSES),
        edition: quoteEdition,
        mapping: labelMapping,
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ name, include_text, edition, mapping, language }) => {
      const numbering = resolveMapping(mapping);
      if (numbering.error) return numbering.error;
      const bySlug = await getStoryBySlug(name.trim().toLowerCase(), language);
      let others: Story[] = [];
      let story = bySlug;
      if (!story) {
        const q = fold(name);
        const rank = (s: Story) => (fold(s.title) === q ? 0 : fold(s.title).includes(q) ? 1 : matchesAll(s.title, name) ? 2 : 3);
        const hits = (await searchStories(name, language)).sort((a, b) => rank(a) - rank(b));
        story = hits[0];
        others = hits.slice(1, 1 + MAX_OTHER_STORIES);
      }
      if (!story) return failure(`No story matches "${name}". Try fewer words, or search_topics.`);

      const data = JSON.parse(story.content) as StoryData;
      const passages = data.references
        .map((r) => passageAt(r.bookId, r.startChapter, r.startVerse, r.endChapter, r.endVerse))
        .filter((p): p is Passage => p !== null);
      const category = tEnum(makeT(language as Locale), 'story.cat.', story.category);
      const lines = [
        `# ${data.title}\n${pageUrl(language, `/historier/${story.slug}`)}`,
        `${category}. ${data.description}`,
        `Told in: ${passages.map((p) => passageLabel(inMapping(p, numbering.id), language)).join('; ')}`,
      ];
      const bible = edition ?? (await defaultBibleForLanguage(language));
      let quoted = false;
      if (include_text) {
        let remaining = MAX_STORY_VERSES;
        for (const p of passages) {
          const q = await quote(inMapping(p, numbering.id), bible, remaining, language, numbering.id);
          remaining -= q.shown;
          quoted ||= q.shown > 0;
          lines.push(`**${passageLabel(inMapping(p, numbering.id), language)}**\n${q.lines.join('\n')}`);
        }
      }
      if (others.length) lines.push(`Other stories that match: ${others.map((s) => `${s.title} [id: ${s.slug}]`).join('; ')}`);
      return text(lines.join('\n\n') + numberedAs(numbering.id) + (quoted ? await attribution([bible], language) : ''));
    },
  );

  server.registerTool(
    'get_number',
    {
      title: 'A number in the Bible',
      description:
        'What a number means in the Bible (e.g. 7, 12, 40, 666) and every passage where it carries that meaning. Called with no number, it lists every number that has an entry, with its meaning.',
      inputSchema: {
        number: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('The number, e.g. 3, 7, 12, 40, 666, 1000. Default: none, which lists every number that has an entry.'),
        mapping: labelMapping,
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ number, mapping, language }) => {
      const numbering = resolveMapping(mapping);
      if (numbering.error) return numbering.error;
      const parse = (content: string) => {
        try {
          return JSON.parse(content) as NumberSymbolismData;
        } catch {
          return null;
        }
      };
      if (number === undefined) {
        const all = (await getAllNumberSymbolism(language)).map((r) => parse(r.content)).filter((d): d is NumberSymbolismData => d !== null);
        return text(`# ${all.length} numbers in the Bible\n${pageUrl(language, '/tall')}\n\n${all.map((d) => `- **${d.number}**: ${d.meaning}`).join('\n')}`);
      }
      const row = await getNumberSymbolismByNumber(number, language);
      const data = row ? parse(row.content) : null;
      if (!data) {
        const near = (await getAllNumberSymbolism(language))
          .map((r) => r.number)
          .sort((a, b) => Math.abs(a - number) - Math.abs(b - number))
          .slice(0, 6)
          .sort((a, b) => a - b);
        return failure(`No entry for ${number}. The nearest numbers that have one: ${near.join(', ')}.`);
      }
      const refs = data.references.map((r) => refLabel(r.bookId, r.chapterId, r.fromVerseId, r.toVerseId, language, numbering.id));
      const shown = refs.slice(0, MAX_NUMBER_REFERENCES);
      const lines = [
        `# ${data.number} — ${data.meaning}\n${pageUrl(language, `/tall/${data.number}`)}`,
        data.description,
        `Where it occurs (${count(refs.length, 'passage')}): ${shown.join('; ')}${refs.length > shown.length ? `; and ${refs.length - shown.length} more` : ''}`,
      ];
      if (data.footnotes?.length) lines.push(`Notes:\n${data.footnotes.map((f) => `- ${f.text}${f.source ? ` (${f.source})` : ''}`).join('\n')}`);
      return text(lines.join('\n\n') + numberedAs(numbering.id));
    },
  );

  server.registerTool(
    'get_gospel_parallels',
    {
      title: 'Gospel parallels',
      description:
        'The same event as Matthew, Mark, Luke and John each tell it: the parallels that cover a passage, with every Gospel\'s passage side by side and, if asked, each text in turn. Called with no reference, it lists all the parallels by section.',
      inputSchema: {
        reference: z
          .string()
          .min(2)
          .optional()
          .describe('A passage in Matthew, Mark, Luke or John, e.g. "Mark 4:35-41", "Luke 15", "Joh 6,1-15"; gives the parallels that cover it. Default: none, which lists them all.'),
        include_text: includeText("each Gospel's text of the parallels found, one after the other", false, MAX_VERSES),
        edition: quoteEdition,
        mapping,
        language,
      },
      annotations: READ_ONLY,
    },
    async ({ reference, include_text, edition, mapping, language }) => {
      const numbering = resolveMapping(mapping);
      if (numbering.error) return numbering.error;
      const all = await getGospelParallels(language);
      const url = pageUrl(language, '/paralleller');
      const passagesOf = (x: (typeof all)[number]) =>
        GOSPEL_ORDER.flatMap((g) => {
          const r = x.passages?.[g];
          const p = r && passageAt(r.book_id, r.chapter, r.verse_start, r.chapter, r.verse_end);
          return p ? [p] : [];
        });
      const row = (x: (typeof all)[number]) => passagesOf(x).map((q) => passageLabel(inMapping(q, numbering.id), language)).join(' | ');

      if (!reference) {
        const sections = new Map<string, string[]>();
        for (const x of all) {
          const key = x.section?.name || x.section_id;
          sections.set(key, [...(sections.get(key) ?? []), `- ${x.title}: ${row(x)} [id: ${x.id}]`]);
        }
        return text(`# ${count(all.length, 'gospel parallel')}\n${url}\n\n${[...sections].map(([s, items]) => `## ${s}\n${items.join('\n')}`).join('\n\n')}${numberedAs(numbering.id)}`);
      }

      const p = parsed(reference, numbering.id);
      if (p.error) return p.error;
      const targets = await toOsnb(p.passages, numbering.id);
      const found = all.filter((x) => passagesOf(x).some((q) => targets.some((t) => overlaps(q, t))));
      if (found.length === 0) return text(`No gospel parallel covers ${reference}. Try get_cross_references for related passages.${p.notes}`);

      const bible = edition ?? (await defaultBibleForLanguage(language));
      let remaining = MAX_VERSES;
      let quoted = false;
      const blocks: string[] = [];
      for (const x of found) {
        const lines = [`## ${x.title}${x.section?.name ? ` (${x.section.name})` : ''} [id: ${x.id}]`];
        for (const q of passagesOf(x)) lines.push(`- ${passageLabel(inMapping(q, numbering.id), language)}`);
        if (x.notes) lines.push(x.notes);
        if (include_text) {
          for (const q of passagesOf(x)) {
            const quoteLines = await quote(inMapping(q, numbering.id), bible, remaining, language, numbering.id);
            remaining -= quoteLines.shown;
            quoted ||= quoteLines.shown > 0;
            lines.push(`**${passageLabel(inMapping(q, numbering.id), language)}**`, ...quoteLines.lines);
          }
        }
        blocks.push(lines.join('\n'));
      }
      return text(`# ${count(found.length, 'gospel parallel')} for ${reference}\n${url}\n\n${blocks.join('\n\n')}${p.notes}${numberedAs(numbering.id)}` + (quoted ? await attribution([bible], language) : ''));
    },
  );
}
