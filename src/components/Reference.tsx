import { Link } from 'react-router-dom';
import { useMapping } from './MappingContext';
import { useSettings } from './SettingsContext';
import { booksData } from '@/lib/books-data';
import { toUrlSlug } from '@/lib/url-utils';
import { BOOK_IDS } from '@free-bible/kvn/types';

interface ReferenceProps {
  /** Reference string, e.g. "Jona 2,1-11@dnb2024" or "Jona 2,1-11@dnb2024|Jona" */
  text: string;
  /** Target mapping override. If omitted, uses the user's settings. */
  mapping?: string;
  /** Optional className for styling */
  className?: string;
}

interface ParsedRef {
  book: string;
  bookId: number;
  chapter: number;
  verseSpec: string; // "1-11", "1a.2.6-7", etc.
  sourceMapping: string;
  displayText?: string; // after | if present
}

/** Parse a verse spec like "1-11", "1a.2.6-7", "13-15a.17-18" into individual ranges */
function parseVerseRanges(verseSpec: string): { start: number; end: number; partStart: string; partEnd: string }[] {
  if (!verseSpec) return [];
  const normalized = verseSpec.replace(/[–—]/g, '-');
  return normalized.split('.').map(part => {
    const dashIdx = part.indexOf('-');
    if (dashIdx === -1) {
      const m = part.match(/^(\d+)([a-c])?$/);
      if (!m) return null;
      return { start: parseInt(m[1]), end: parseInt(m[1]), partStart: m[2] || '', partEnd: m[2] || '' };
    }
    const startStr = part.slice(0, dashIdx);
    const endStr = part.slice(dashIdx + 1);
    const sm = startStr.match(/^(\d+)([a-c])?$/);
    const em = endStr.match(/^(\d+)([a-c])?$/);
    if (!sm || !em) return null;
    return { start: parseInt(sm[1]), end: parseInt(em[1]), partStart: sm[2] || '', partEnd: em[2] || '' };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
}

/** Parse "Jona 2,1-11@dnb2024|Display text" */
function parseRefText(text: string): ParsedRef | null {
  let remaining = text.trim();
  let displayText: string | undefined;

  // Extract |displayText if present
  const pipeIdx = remaining.indexOf('|');
  if (pipeIdx !== -1) {
    displayText = remaining.slice(pipeIdx + 1);
    remaining = remaining.slice(0, pipeIdx);
  }

  // Extract @mapping
  let sourceMapping = 'osnb2';
  const atIdx = remaining.lastIndexOf('@');
  if (atIdx !== -1) {
    sourceMapping = remaining.slice(atIdx + 1).trim();
    remaining = remaining.slice(0, atIdx).trim();
  }

  // Split into book + chapterVerse
  const match = remaining.match(/^(.+?)\s+(\d.*)$/);
  if (!match) return null;

  const book = match[1].trim();
  const chapterVerse = match[2].trim();
  const bookId = BOOK_IDS[book];
  if (bookId === undefined) return null;

  // Normalize comma to colon, then split
  const normalized = chapterVerse.replace(/,/, ':');
  const colonIdx = normalized.indexOf(':');
  if (colonIdx === -1) {
    // Whole chapter
    return { book, bookId, chapter: parseInt(normalized), verseSpec: '', sourceMapping, displayText };
  }

  const chapter = parseInt(normalized.slice(0, colonIdx));
  const verseSpec = normalized.slice(colonIdx + 1);

  return { book, bookId, chapter, verseSpec, sourceMapping, displayText };
}

/**
 * Build a converted reference string in the target mapping.
 * E.g. from Jes 9:1a.2.6-7 in dnb2024 → Jes 8:23a;9:1.5-6 in osnb2
 */
function buildConvertedRef(
  ref: ParsedRef,
  convert: (bookId: number, ch: number, v: number, from: string, to: string) => { chapter: number; verse: number },
  targetMapping: string,
): string {
  if (!ref.verseSpec) {
    // Whole chapter — just convert the chapter number via verse 1
    const converted = convert(ref.bookId, ref.chapter, 1, ref.sourceMapping, targetMapping);
    return `${ref.book} ${converted.chapter}`;
  }

  const ranges = parseVerseRanges(ref.verseSpec);
  if (ranges.length === 0) return `${ref.book} ${ref.chapter}`;

  // Map each verse individually to detect chapter splits
  interface MappedVerse { chapter: number; verse: number; part: string }
  const allMapped: MappedVerse[] = [];

  for (const range of ranges) {
    for (let v = range.start; v <= range.end; v++) {
      const mapped = convert(ref.bookId, ref.chapter, v, ref.sourceMapping, targetMapping);
      let part = '';
      if (v === range.start && range.partStart) part = range.partStart;
      else if (v === range.end && range.partEnd) part = range.partEnd;
      allMapped.push({ chapter: mapped.chapter, verse: mapped.verse, part });
    }
  }

  // Group into consecutive runs per chapter
  interface Group { chapter: number; start: number; end: number; partStart: string; partEnd: string }
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const mv of allMapped) {
    if (!current || mv.chapter !== current.chapter || mv.verse !== current.end + 1 || mv.part) {
      if (current) groups.push(current);
      current = { chapter: mv.chapter, start: mv.verse, end: mv.verse, partStart: mv.part, partEnd: mv.part };
    } else {
      current.end = mv.verse;
      current.partEnd = mv.part;
    }
  }
  if (current) groups.push(current);

  // Format groups: use ; between chapters, . within
  let lastChapter = -1;
  const parts: string[] = [];
  for (const g of groups) {
    const chPrefix = g.chapter !== lastChapter ? `${g.chapter},` : '';
    lastChapter = g.chapter;
    const startStr = `${chPrefix}${g.start}${g.partStart}`;
    const rangeStr = g.start === g.end ? startStr : `${startStr}-${g.end}${g.partEnd}`;
    parts.push(rangeStr);
  }

  // Join with ; for chapter changes, . within
  const result: string[] = [];
  let prevChapter = -1;
  for (let i = 0; i < parts.length; i++) {
    const chMatch = parts[i].match(/^(\d+),/);
    const ch = chMatch ? parseInt(chMatch[1]) : prevChapter;
    if (i > 0 && ch !== prevChapter) {
      result.push(';' + parts[i]);
    } else if (i > 0) {
      result.push('.' + parts[i]);
    } else {
      result.push(parts[i]);
    }
    prevChapter = ch;
  }

  return `${ref.book} ${result.join('')}`;
}

/** Build URL to the bible reading page */
function buildUrl(bookId: number, chapter: number, verse?: number): string {
  const book = booksData.find(b => b.id === bookId);
  if (!book) return '/';
  const slug = toUrlSlug(book.short_name);
  const hash = verse ? `#v${verse}` : '';
  return `/${slug}/${chapter}${hash}`;
}

/**
 * Renders a bible reference as a link, converting between verse numbering systems.
 * Shows the reference in the user's chosen mapping, with the original in parentheses if different.
 *
 * Usage: <Reference text="Jona 2,1-11@dnb2024" />
 *        <Reference text="Jes 9,1a.2.6-7@dnb2024|Jesaja" mapping="osnb2" />
 */
export function Reference({ text, mapping: mappingProp, className }: ReferenceProps) {
  const { convert, loaded } = useMapping();
  const { settings } = useSettings();
  const targetMapping = mappingProp || settings.numberingSystem || 'osnb2';

  const ref = parseRefText(text);
  if (!ref) return <span className={className}>{text}</span>;

  // Original display text
  const originalRefStr = `${ref.book} ${ref.chapter}${ref.verseSpec ? ',' + ref.verseSpec : ''}`;

  // If mappings aren't loaded yet or source == target, just show original
  if (!loaded || ref.sourceMapping === targetMapping) {
    const url = buildUrl(ref.bookId, ref.chapter, ref.verseSpec ? parseVerseRanges(ref.verseSpec)[0]?.start : undefined);
    return (
      <Link to={url} className={className}>
        {ref.displayText || originalRefStr}
      </Link>
    );
  }

  const convertedRefStr = buildConvertedRef(ref, convert, targetMapping);
  const isDifferent = convertedRefStr !== originalRefStr;

  // Link to the first verse in target mapping coordinates
  const ranges = parseVerseRanges(ref.verseSpec);
  const firstVerse = ranges.length > 0 ? ranges[0].start : undefined;
  const firstConverted = firstVerse
    ? convert(ref.bookId, ref.chapter, firstVerse, ref.sourceMapping, targetMapping)
    : convert(ref.bookId, ref.chapter, 1, ref.sourceMapping, targetMapping);

  const url = buildUrl(ref.bookId, firstConverted.chapter, firstConverted.verse);

  const label = isDifferent
    ? `${convertedRefStr} (${originalRefStr}@${ref.sourceMapping})`
    : ref.displayText || convertedRefStr;

  return (
    <Link to={url} className={className}>
      {label}
    </Link>
  );
}
