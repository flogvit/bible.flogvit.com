// InlineRefs — port av bibel/src/components/InlineRefs.tsx (server-rendret).
//
// To lag, som i originalen:
//  1. Klammer-referanser [ref:], [vers:], [manuskript:/andakt:], [tema:],
//     [person:], [profeti:], [parallell:], [historie:] — samme regex og samme
//     pipe-syntaks for egendefinert etikett ("ref|etikett").
//  2. NYTT i serverutgaven: frie norske bibelreferanser i løpende tekst
//     («Se Joh 3,16 og 1 Mos 1,1-3») gjenkjennes via book-aliases +
//     parseStandardRef og lenkes på samme måte.
//
// React-utgavens klikk-for-å-ekspandere (fetch /api/verses) er erstattet av
// vanlige lenker til /{bokslug}/{kapittel}#v{vers} pluss en hover-forhånds-
// visning i øya public/js/ref-preview.js (leser data-ref / data-bible).
// Ressurs- og manuskriptreferanser rendres som rene lenker til målsiden.
//
// Ikke portert server-side: markdown-prop (ReactMarkdown) — tekstsegmenter
// rendres som ren tekst.

import { parseStandardRef, refSegmentToUrl, findBookClient } from '../lib/standard-ref-parser.ts';
import { getBookInfoBySlug } from '../lib/books-data.ts';
import { lhref } from '../lib/i18n.ts';

// Samme mønster som i React-utgaven (re-eksportert for gjenbruk i andre views)
export const REF_PATTERN = /\[(vers|ref|manuskript|andakt|tema|person|profeti|parallell|historie):([^\]]+)\]/g;

/** Sjekk om en streng inneholder klammer-referanser */
export function hasInlineRefs(text: string): boolean {
  REF_PATTERN.lastIndex = 0;
  return REF_PATTERN.test(text);
}

type SegmentType =
  | 'text'
  | 'vers'
  | 'ref'
  | 'manuskript'
  | 'tema'
  | 'person'
  | 'profeti'
  | 'parallell'
  | 'historie';

interface Segment {
  type: SegmentType;
  value: string;
}

// ── Klammer-parsing (identisk logikk med gamle parseSegments) ──

function parseSegments(content: string): Segment[] {
  const pattern = /\[(vers|ref|manuskript|andakt|tema|person|profeti|parallell|historie):([^\]]+)\]/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.substring(lastIndex, match.index) });
    }
    const matchType = match[1] === 'andakt' ? 'manuskript' : (match[1] as SegmentType);
    segments.push({ type: matchType, value: match[2]!.trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.substring(lastIndex) });
  }
  return segments;
}

// ── Hjelpere fra gamle InlineRefs ──

/** "Joh 3,16@dnb2024" → { ref: "Joh 3,16", bibleOverride: "dnb2024" } */
function parseRefBible(refStr: string): { ref: string; bibleOverride?: string } {
  const atIdx = refStr.lastIndexOf('@');
  if (atIdx > 0) {
    const possibleBible = refStr.substring(atIdx + 1).trim();
    if (possibleBible && /^[a-z0-9_-]+$/i.test(possibleBible)) {
      return { ref: refStr.substring(0, atIdx).trim(), bibleOverride: possibleBible };
    }
  }
  return { ref: refStr };
}

/** Legacy [vers:joh-3-16] — samme oppslag som gamle parseLegacyRef/verseRefToUrl */
function parseLegacyRef(ref: string): { slug: string; shortName: string; chapter: number; verse: number } | null {
  const parts = ref.split('-');
  if (parts.length < 3) return null;
  for (let i = parts.length - 2; i >= 1; i--) {
    const bookSlug = parts.slice(0, i).join('');
    const book = getBookInfoBySlug(bookSlug);
    if (book) {
      const chapter = parseInt(parts[i]!);
      const verse = parseInt(parts[i + 1]!);
      if (!isNaN(chapter) && !isNaN(verse)) {
        return { slug: book.short_name.toLowerCase(), shortName: book.short_name, chapter, verse };
      }
    }
  }
  return null;
}

type ResourceType = 'tema' | 'person' | 'profeti' | 'parallell' | 'historie';

// Samme URL-bygging som gamle getResourceUrl
function getResourceUrl(type: ResourceType, value: string): string {
  switch (type) {
    case 'tema':
      return `/temaer#tema-${value.toLowerCase().replace(/\s+/g, '-')}`;
    case 'person':
      return `/personer/${value}`;
    case 'profeti':
      return `/profetier#profeti-${value}`;
    case 'parallell':
      return `/paralleller/${value}`;
    case 'historie':
      return `/historier/${value}`;
  }
}

function splitLabel(value: string): { val: string; label?: string } {
  const pipeIdx = value.indexOf('|');
  if (pipeIdx < 0) return { val: value };
  return { val: value.substring(0, pipeIdx).trim(), label: value.substring(pipeIdx + 1).trim() };
}

// ── Frie referanser i løpende tekst ──

// Kandidat: valgfritt bok-nummer (1-5), stor forbokstav, så kapittel og
// eventuelt «,vers», «-tilVers» og «.flere». Valideres mot book-aliases
// via parseStandardRef før det lenkes — «Se 3» o.l. slipper ikke gjennom.
const PLAIN_REF_RE =
  /([1-5]\s?)?([A-ZÆØÅ][a-zæøå]+)\.?\s(\d+)((?:\s?,\s?\d+(?:\s?[-–]\s?\d+)?(?:\s?\.\s?\d+(?:\s?[-–]\s?\d+)?)*)?)/g;

interface PlainRef {
  start: number;
  end: number;
  text: string;
  ref: string; // normalisert, parsebar referansestreng (data-ref)
  url: string;
}

function findPlainRefs(text: string): PlainRef[] {
  const found: PlainRef[] = [];
  PLAIN_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = PLAIN_REF_RE.exec(text)) !== null) {
    const [matched, numPrefix, bookWord, chapterStr, versePart] = m;

    // Ordgrense foran: ikke midt i et ord/tall
    const before = text[m.index - 1];
    if (before && /[\wæøåÆØÅ]/.test(before)) continue;

    const bookPart = `${numPrefix ? numPrefix.trim() + ' ' : ''}${bookWord}`;
    const book = findBookClient(bookPart);
    if (!book) continue;

    const chapter = parseInt(chapterStr!, 10);
    if (isNaN(chapter) || chapter < 1 || chapter > book.chapters) continue;

    // Normalisert referanse ("1 Mos 1,1-3" med enkle mellomrom)
    const normVerse = (versePart ?? '').replace(/\s+/g, '');
    const ref = `${book.short_name} ${chapter}${normVerse}`;
    const segments = parseStandardRef(ref);
    const first = segments[0];
    if (!first) continue;

    found.push({
      start: m.index,
      end: m.index + matched!.length,
      text: matched!,
      ref,
      url: refSegmentToUrl(first),
    });
  }
  return found;
}

/** Rendrer et tekstsegment med frie bibelreferanser lenket. */
function LinkedText({ text }: { text: string }) {
  const refs = findPlainRefs(text);
  if (refs.length === 0) return <>{text}</>;

  const parts = [];
  let last = 0;
  for (const r of refs) {
    if (r.start > last) parts.push(<>{text.substring(last, r.start)}</>);
    parts.push(
      <a href={lhref(r.url)} class="inline-ref" data-ref={r.ref} title={`Vis ${r.text}`}>
        {r.text}
      </a>,
    );
    last = r.end;
  }
  if (last < text.length) parts.push(<>{text.substring(last)}</>);
  return <>{parts}</>;
}

// ── Segment-rendering ──

function VerseRefLink({ refStr, isLegacy, customLabel }: { refStr: string; isLegacy?: boolean; customLabel?: string }) {
  if (isLegacy) {
    const parsed = parseLegacyRef(refStr);
    const displayLabel = customLabel || refStr;
    if (!parsed) return <>{displayLabel}</>;
    return (
      <a
        href={lhref(`/${parsed.slug}/${parsed.chapter}#v${parsed.verse}`)}
        class="inline-ref"
        data-ref={`${parsed.shortName} ${parsed.chapter},${parsed.verse}`}
        title={`Vis ${displayLabel}`}
      >
        {displayLabel}
      </a>
    );
  }

  const { ref, bibleOverride } = parseRefBible(refStr);
  const displayLabel = customLabel || ref;
  const segments = parseStandardRef(ref);
  const first = segments[0];
  const url = first ? refSegmentToUrl(first) : '#';
  return (
    <a href={lhref(url)} class="inline-ref" data-ref={ref} data-bible={bibleOverride} title={`Vis ${displayLabel}`}>
      {displayLabel}
    </a>
  );
}

export interface InlineRefsProps {
  /** Teksten som skal parses for referanser */
  text: string;
}

/**
 * Rendrer tekst der klammer-referanser og frie norske bibelreferanser er
 * erstattet med lenker. Bibelreferanser får class="inline-ref" og data-ref
 * (parsebar streng) som ref-preview-øya bruker til hover-forhåndsvisning.
 */
export function InlineRefs({ text }: InlineRefsProps) {
  const segments = parseSegments(text);

  return (
    <>
      {segments.map((seg) => {
        if (seg.type === 'ref' || seg.type === 'vers') {
          const { val, label } = splitLabel(seg.value);
          return <VerseRefLink refStr={val} customLabel={label} isLegacy={seg.type === 'vers'} />;
        }
        if (seg.type === 'manuskript') {
          const { val, label } = splitLabel(seg.value);
          return (
            <a href={lhref(`/manuskripter/${val}`)} class="inline-ref-manus" title={label || val}>
              {label || val}
            </a>
          );
        }
        if (
          seg.type === 'tema' ||
          seg.type === 'person' ||
          seg.type === 'profeti' ||
          seg.type === 'parallell' ||
          seg.type === 'historie'
        ) {
          const { val, label } = splitLabel(seg.value);
          const displayLabel = label || val;
          return (
            <a href={lhref(getResourceUrl(seg.type, val))} class="inline-ref-resource" title={`Vis ${displayLabel}`}>
              {displayLabel}
            </a>
          );
        }
        return <LinkedText text={seg.value} />;
      })}
    </>
  );
}
