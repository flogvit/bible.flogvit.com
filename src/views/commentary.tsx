// Bibelkommentarene på kapittelsiden (#269, #286).
//
// Tre flater, én kilde (`getCommentaryForChapter`, formet av `shapeCommentary`):
//   - Studiepanelet (280 px) viser bare hva som finnes: hver dels etikett og
//     de første linjene. Lang tekst hører ikke hjemme i en smal kolonne med
//     liten skrift.
//   - Bokas innledning (forordet i 1 Mos) står i «Sammendrag», ved «Om 1.
//     Mosebok» — aldri under en versrekke.
//   - Lesevisningen (`<dialog>`) har hele teksten, på leserens språk, så bred
//     som hovedspalten og i versteksten størrelse. Kildens avsnitt ligger bak
//     ÉN lukket bryter per del.
// Hvert element som viser et verk bærer `data-commentary-work`, så ett skript
// kan skjule et verk leseren har slått av i innstillingene.

import type { CommentaryAt, CommentaryForChapter, CommentarySectionView } from '../lib/commentary-data.ts';
import { commentaryPlain, commentaryTeaser, isHeadingOnly, osnbTranslator, parseOsisRef, renderCommentaryParagraph, type CommentaryLink, type ToOsnb } from '../lib/commentary.ts';
import { getBookInfoById } from '../lib/books-data.ts';
import { getKvnMappingRaw } from '../lib/verse-mapper.ts';
import { langName, lhref, type Translator } from '../lib/i18n.ts';
import { verseUrl } from './verse-display.tsx';
// @ts-expect-error — delt klient-modul uten typer (formen bor ett sted, se #91)
import { verseHash } from '../../public/js/verse-hash.js';

// Henvisningene i kommentaren er KJV-adresser, som seksjonene. Oversetteren
// bygges første gang en lenke trengs og står så ut prosessen: to mappingfiler
// som verse-mapper alt holder i minnet.
let kjvToOsnb: ToOsnb | null = null;

/**
 * Adressen på lesesiden til en `<ref osisRef>`, med hele rekka når den står i
 * ett osnb-kapittel. Etiketten er i verkets nummerering (KJV); er osnb-adressen
 * en annen (Sal 38:13–15 er osnb 38:14–16), sier lenka det med `labelNumbering`.
 */
export function commentaryRefHref(osisRef: string): CommentaryLink {
  const ref = parseOsisRef(osisRef);
  if (!ref) return null;
  const book = getBookInfoById(ref.book);
  if (!book) return null;
  kjvToOsnb ??= osnbTranslator(getKvnMappingRaw('kjv'), getKvnMappingRaw('osnb'));
  if (!ref.verse) return lhref(verseUrl(book.short_name, kjvToOsnb(ref.book, ref.chapter, 1).chapter));
  const start = kjvToOsnb(ref.book, ref.chapter, ref.verse);
  const end = ref.endVerse ? kjvToOsnb(ref.book, ref.endChapter, ref.endVerse, true) : start;
  const sameChapter = end.chapter === start.chapter && end.verse >= start.verse;
  const href = lhref(verseUrl(book.short_name, start.chapter, start.verse, sameChapter && end.verse !== start.verse ? end.verse : undefined));
  const moved =
    start.chapter !== ref.chapter ||
    start.verse !== ref.verse ||
    (ref.endVerse > 0 && (end.chapter !== ref.endChapter || end.verse !== ref.endVerse));
  return moved ? { href, labelNumbering: 'kjv' } : href;
}

/** Delens ankernavn: det panelet, versdetaljene og søket lenker til. */
export const commentaryAnchor = (work: string, part: Pick<CommentarySectionView, 'id'>) => `cm-${work}-${part.id}`;

/** «1–15» innenfor kapittelet, «7:26–8:11» når seksjonen krysser et kapittelskille. */
export function sectionRange(chapter: number, from: CommentaryAt, to: CommentaryAt): string {
  const at = (a: CommentaryAt) => (a.chapter === chapter && from.chapter === to.chapter ? `${a.verse}` : `${a.chapter}:${a.verse}`);
  if (from.chapter === to.chapter && from.verse === to.verse) return at(from);
  return `${at(from)}–${at(to)}`;
}

/** Dekker seksjonen dette osnb-verset? Innledninger (vers 0) dekker ingen vers. */
export function sectionCovers(s: Pick<CommentarySectionView, 'from' | 'to'>, chapter: number, verse: number): boolean {
  if (s.from.verse === 0 && s.to.verse === 0) return false;
  const k = (c: number, v: number) => c * 1000 + v;
  return k(s.from.chapter, s.from.verse) <= k(chapter, verse) && k(chapter, verse) <= k(s.to.chapter, s.to.verse);
}

/** Etiketten en del står under: «Innledning til boka», «Innledning» eller «Vers 3–5». */
function partLabel(part: CommentarySectionView, chapter: number, t: Translator): string {
  if (part.id === 'book') return t('cm.bookIntro');
  if (part.from.verse === 0 && part.to.verse === 0) return t('cm.intro');
  return t('cm.verses', { range: sectionRange(chapter, part.from, part.to) });
}

/** De første linjene av delen: første avsnitt som ikke er en overskrift, som ren tekst. */
function teaserText(part: CommentarySectionView): string {
  const first = part.paragraphs.find((p) => !isHeadingOnly(p)) ?? part.paragraphs[0] ?? '';
  return commentaryTeaser(commentaryPlain(first));
}

/** Verkets tittel. Er den oversatt, er den tekst på leserens språk; ellers verkets eget navn. */
function WorkTitle({ c, class: cls }: { c: CommentaryForChapter; class: string }) {
  const own = c.work.title === c.work.sourceTitle;
  return (
    <span class={cls} lang={own ? c.work.sourceLanguage : undefined} data-proper-names={own || undefined}>
      {c.work.title}
    </span>
  );
}

/**
 * Ett avsnitt. Verkets EGEN tekst (kildespråket) bærer `data-verbatim`: den er
 * ordrett fra 1706, med latinske ligaturer som «Sacræ», og er ingen oversettelse
 * som gikk utenom ordboka (#23). Gjengivelsen bærer det aldri.
 */
function Paragraph({ text, lang, verbatim }: { text: string; lang: string; verbatim: boolean }) {
  const html = renderCommentaryParagraph(text, commentaryRefHref);
  const cls = `cm-p${isHeadingOnly(text) ? ' cm-heading-only' : ''}`;
  return <div class={cls} lang={lang} data-verbatim={verbatim || undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Delene et verk har på siden, i leserekkefølge: bokas innledning først. */
const partsOf = (c: CommentaryForChapter) => (c.bookIntro ? [c.bookIntro, ...c.sections] : c.sections);

/** En lenke som åpner delen i lesevisningen. */
function Teaser({ c, part, chapter, t }: { c: CommentaryForChapter; part: CommentarySectionView; chapter: number; t: Translator }) {
  return (
    <a class="cm-teaser" href={`#${commentaryAnchor(c.work.id, part)}`} data-cm-open>
      <span class="cm-teaser-label">{partLabel(part, chapter, t)}</span>
      <span class="cm-teaser-text" lang={c.language}>
        {teaserText(part)}
      </span>
    </a>
  );
}

/** Kommentarblokka i studiepanelet: per verk, en smakebit per del. */
export function CommentaryPanel({ commentary, chapter, t }: { commentary: CommentaryForChapter[]; chapter: number; t: Translator }) {
  return (
    <div class="cm-block">
      {commentary.map((c) => (
        <section class="cm-work" data-commentary-work={c.work.id}>
          <h3 class="cm-work-title">
            <WorkTitle c={c} class="cm-work-name" />
          </h3>
          {c.sourceOnly && <p class="cm-source-only">{t('cm.sourceOnly')}</p>}
          <ul class="cm-teasers">
            {c.sections.map((s) => (
              <li>
                <Teaser c={c} part={s} chapter={chapter} t={t} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Bokas innledning per verk, i «Sammendrag» ved «Om <bok>» (#286). */
export function CommentaryBookIntros({ commentary, chapter, t }: { commentary: CommentaryForChapter[]; chapter: number; t: Translator }) {
  return (
    <>
      {commentary
        .filter((c) => c.bookIntro)
        .map((c) => (
          <div class="st-summary-item cm-book-intro" data-summary-kind="commentary-intro" data-commentary-work={c.work.id}>
            <h4 class="st-summary-sub">
              <WorkTitle c={c} class="cm-work-name" />
            </h4>
            <Teaser c={c} part={c.bookIntro!} chapter={chapter} t={t} />
          </div>
        ))}
    </>
  );
}

/** Antall deler leseren kan åpne fra kommentarblokka (bokas innledning står i «Sammendrag»). */
export const commentaryCount = (commentary: CommentaryForChapter[]) => commentary.reduce((n, c) => n + c.sections.length, 0);

/**
 * Lesevisningen: hele teksten for hver del, én om gangen (studium.js åpner
 * den, måler hovedspalten og blar). Uten JS viser `:target` delen under
 * kapittelteksten, så hver lenke fortsatt leder til teksten.
 */
export function CommentaryReader({ commentary, chapter, t }: { commentary: CommentaryForChapter[]; chapter: number; t: Translator }) {
  const all = commentary.flatMap((c) => partsOf(c).map((part) => ({ c, part })));
  if (all.length === 0) return null;
  return (
    <dialog class="cm-reader" data-cm-reader aria-label={t('rd.commentary')}>
      <button type="button" class="cm-reader-close" data-cm-close aria-label={t('common.close')}>
        ✕
      </button>
      {all.map(({ c, part }, i) => {
        const translated = c.language !== c.work.sourceLanguage;
        const source = translated ? part.sourceParagraphs : null;
        const first = part.from.chapter === chapter && part.from.verse > 0 ? part.from.verse : null;
        const label = partLabel(part, chapter, t);
        const prev = all[i - 1];
        const next = all[i + 1];
        return (
          <article class="cm-read" id={commentaryAnchor(c.work.id, part)} data-commentary-work={c.work.id} tabindex={-1}>
            <header class="cm-read-head">
              <p class="cm-read-work">
                <WorkTitle c={c} class="cm-work-name" />
              </p>
              <h2 class="cm-read-label">
                {first ? <a href={verseHash(first, part.to.chapter === chapter && part.to.verse > first ? part.to.verse : undefined)}>{label}</a> : label}
              </h2>
              {c.sourceOnly && <p class="cm-source-only">{t('cm.sourceOnly')}</p>}
            </header>
            <div class="cm-read-text">
              {part.paragraphs.map((p) => (
                <Paragraph text={p} lang={c.language} verbatim={!translated} />
              ))}
            </div>
            {source && source.length > 0 && (
              <details class="cm-original">
                <summary>{t('cm.showOriginal', { language: langName(t, c.work.sourceLanguage) })}</summary>
                <div class="cm-original-text">
                  {source.map((p) => (
                    <Paragraph text={p} lang={c.work.sourceLanguage} verbatim />
                  ))}
                </div>
              </details>
            )}
            <footer class="cm-read-foot">
              {part.models && part.models.length > 0 && <p class="cm-models">{t('cm.models', { models: part.models.join(', ') })}</p>}
              <p class="cm-work-meta">
                {[c.work.author, c.work.written].filter(Boolean).join(', ')}
                {(c.work.author || c.work.written) && ' · '}
                {t('cm.license', { license: c.work.license })}
                {c.work.url && (
                  <>
                    {' · '}
                    <a href={c.work.url} rel="noopener">
                      {t('cm.sourceLink')}
                    </a>
                  </>
                )}
              </p>
              <nav class="cm-read-nav" aria-label={t('rd.commentary')}>
                {prev && (
                  <a class="cm-read-prev" href={`#${commentaryAnchor(prev.c.work.id, prev.part)}`} data-cm-open data-commentary-work={prev.c.work.id}>
                    ← {partLabel(prev.part, chapter, t)}
                  </a>
                )}
                {next && (
                  <a class="cm-read-next" href={`#${commentaryAnchor(next.c.work.id, next.part)}`} data-cm-open data-commentary-work={next.c.work.id}>
                    {partLabel(next.part, chapter, t)} →
                  </a>
                )}
              </nav>
            </footer>
          </article>
        );
      })}
    </dialog>
  );
}
