// Vers-visning — erstatter klient-fetchingen i gamle
// bibel/src/components/PersonVerseDisplay.tsx (+ kjernen av bible/VerseDisplay
// sin statiske markup). Async hono/jsx-komponenter henter versene direkte fra
// src/lib/bible.ts (getVersesWithOriginal) i stedet for POST /api/verses fra
// klienten — samme markupstruktur og tekster.

import { getVersesWithOriginal, getBookUrlSlug, getBookById, defaultBibleForLanguage } from '../lib/bible.ts';
import type { PersonKeyEvent, VerseRef, VerseWithOriginal } from '../lib/bible.ts';
import { toUrlSlug } from '../lib/url-utils.ts';
// @ts-expect-error — delt klient-modul uten typer (formen bor ett sted, se #91)
import { verseHash } from '../../public/js/verse-hash.js';
import { InlineRefs } from './inline-refs.tsx';
import { Footnotes } from './footnotes.tsx';
import { lhref } from '../lib/i18n.ts';
import { tCtx } from '../lib/i18n.ts';
import { bookAbbrByShort } from '../lib/books-data.ts';

/** Statisk enkeltvers: nummer + tekst (+ fotnoter og grunntekst). */
export function VerseView({ data }: { data: VerseWithOriginal }) {
  const { verse, originalText, originalLanguage } = data;
  const hebrew = originalLanguage === 'hebrew';

  return (
    <div class="verse" data-verse-num={verse.verse}>
      <span class="verse-number-static">{verse.verse}</span>
      <span class="verse-text" data-verse-text>
        {verse.text}
        {verse.footnotes && verse.footnotes.length > 0 && <Footnotes footnotes={verse.footnotes} />}
      </span>
      {originalText && (
        <div
          class={`original-verse ${hebrew ? 'hebrew' : 'greek'}`}
          dir={hebrew ? 'rtl' : 'ltr'}
          lang={hebrew ? 'he' : 'el'}
        >
          <span class="undertekst-label" aria-hidden="true">
            {tCtx()(hebrew ? 'lang.hebrewShort' : 'lang.greekShort')}
          </span>
          {originalText}
        </div>
      )}
    </div>
  );
}

/** Vers-gruppe med referanselenke + «Vis i kontekst →» (fra PersonVerseDisplay). */
function VerseGroup({ data }: { data: VerseWithOriginal }) {
  const url = `/${toUrlSlug(data.bookShortName)}/${data.verse.chapter}#v${data.verse.verse}`;
  return (
    <div class="verse-group">
      <div class="verse-header">
        <a href={lhref(url)} class="verse-ref-link">
          {bookAbbrByShort(data.bookShortName)} {data.verse.chapter}:{data.verse.verse}
        </a>
        <a href={lhref(url)} class="open-context">
          {tCtx()('common.showInContext')} →
        </a>
      </div>
      <VerseView data={data} />
    </div>
  );
}

/** Async: henter og rendrer en liste versreferanser som vers-grupper. */
export async function VerseRefList({ refs, bible }: { refs: VerseRef[]; bible?: string }) {
  const verses = await getVersesWithOriginal(refs, bible ?? (await defaultBibleForLanguage()));
  return (
    <>
      {verses.map((v) => (
        <VerseGroup data={v} />
      ))}
    </>
  );
}

/**
 * Async: nøkkelhendelser for en person med versetekster — port av
 * PersonVerseDisplay. Gamle utgaven hentet alle referanser i én POST og
 * fordelte dem tilbake per hendelse; server-side henter vi per hendelse
 * (samme resultat, uten fordelingsheuristikken).
 */
export async function KeyEventList({ keyEvents, bible }: { keyEvents: PersonKeyEvent[]; bible?: string }) {
  const edition = bible ?? (await defaultBibleForLanguage());
  const events = await Promise.all(
    keyEvents.map(async (event) => ({
      event,
      verses: await getVersesWithOriginal(event.verses, edition),
    })),
  );

  return (
    <div class="event-list">
      {events.map(({ event, verses }) => (
        // Har hendelsen ingen vers vi kan vise, beholder den tittel og
        // beskrivelse — det er ekte innhold — men trekker tilbake løftet om et
        // skriftsted under (#73). Løftet er skillelinja i `.event-description`.
        <div class={verses.length > 0 ? 'event' : 'event event-no-verses'}>
          <div class="event-header">
            <h3>{event.title}</h3>
          </div>
          <p class="event-description">
            <InlineRefs text={event.description} />
          </p>
          {verses.map((v) => (
            <VerseGroup data={v} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Hjelper: bygg lesevisnings-URL for en VerseRef (første vers). */
export function verseRefUrl(ref: VerseRef): string {
  const book = getBookById(ref.bookId);
  if (!book) return '#';
  const first = ref.verses?.[0] ?? ref.verse;
  const last = ref.verses?.[ref.verses.length - 1] ?? ref.verse;
  return `/${getBookUrlSlug(book)}/${ref.chapter}${first ? verseHash(first, last) : ''}`;
}
