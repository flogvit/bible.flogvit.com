// Kommentarblokka på kapittelsiden (#269): hvert verks seksjoner for kapittelet,
// avsnitt for avsnitt, teksten på leserens språk med kildens avsnitt ved siden
// av (side om side når blokka er bred nok, under på en telefon — styrt av en
// container-spørring i studium.css, ikke av vinduets bredde).

import type { CommentaryAt, CommentaryForChapter, CommentarySectionView } from '../lib/commentary-data.ts';
import { isHeadingOnly, osnbTranslator, parseOsisRef, renderCommentaryParagraph, type ToOsnb } from '../lib/commentary.ts';
import { getBookInfoById } from '../lib/books-data.ts';
import { getKvnMappingRaw } from '../lib/verse-mapper.ts';
import { lhref, type Translator } from '../lib/i18n.ts';
import { verseUrl } from './verse-display.tsx';

// Henvisningene i kommentaren er KJV-adresser, som seksjonene. Oversetteren
// bygges første gang en lenke trengs og står så ut prosessen: to mappingfiler
// som verse-mapper alt holder i minnet.
let kjvToOsnb: ToOsnb | null = null;

/** Adressen på lesesiden til en `<ref osisRef>`, eller null når boka ikke finnes. */
export function commentaryRefHref(osisRef: string): string | null {
  const ref = parseOsisRef(osisRef);
  if (!ref) return null;
  const book = getBookInfoById(ref.book);
  if (!book) return null;
  kjvToOsnb ??= osnbTranslator(getKvnMappingRaw('kjv'), getKvnMappingRaw('osnb'));
  if (!ref.verse) return lhref(verseUrl(book.short_name, kjvToOsnb(ref.book, ref.chapter, 1).chapter));
  const at = kjvToOsnb(ref.book, ref.chapter, ref.verse);
  return lhref(verseUrl(book.short_name, at.chapter, at.verse));
}

/** Seksjonens ankernavn: det versdetaljene lenker til. */
export const commentaryAnchor = (work: string, s: Pick<CommentarySectionView, 'sourceChapter' | 'sectionNo'>) =>
  `cm-${work}-${s.sourceChapter}-${s.sectionNo}`;

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

function Paragraph({ text, lang, kind }: { text: string; lang: string; kind: 'text' | 'source' }) {
  const html = renderCommentaryParagraph(text, commentaryRefHref);
  const cls = `cm-${kind}${isHeadingOnly(text) ? ' cm-heading-only' : ''}`;
  return <div class={cls} lang={lang} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Section({ c, s, chapter, t }: { c: CommentaryForChapter; s: CommentarySectionView; chapter: number; t: Translator }) {
  const intro = s.from.verse === 0 && s.to.verse === 0;
  const label = intro ? t('cm.intro') : t('cm.verses', { range: sectionRange(chapter, s.from, s.to) });
  const first = s.from.chapter === chapter && s.from.verse > 0 ? s.from.verse : null;
  const source = s.sourceParagraphs;
  return (
    <section class="cm-section" id={commentaryAnchor(c.work.id, s)}>
      <h4 class="cm-section-head">
        {first ? <a href={`#v${first}`}>{label}</a> : label}
      </h4>
      {s.paragraphs.map((p, i) => (
        <div class={source ? 'cm-pair' : 'cm-single'}>
          <Paragraph text={p} lang={c.language} kind="text" />
          {source?.[i] !== undefined && <Paragraph text={source[i]!} lang={c.work.sourceLanguage} kind="source" />}
        </div>
      ))}
      {s.models && s.models.length > 0 && <p class="cm-models">{t('cm.models', { models: s.models.join(', ') })}</p>}
    </section>
  );
}

/** Innholdet i kommentarblokka: ett verk om gangen, med navn, kilde og lisens. */
export function CommentaryBlockBody({ commentary, chapter, t }: { commentary: CommentaryForChapter[]; chapter: number; t: Translator }) {
  return (
    <div class="cm-block">
      {commentary.map((c) => (
        <article class="cm-work" data-commentary-work={c.work.id}>
          <header class="cm-work-head">
            <h3 class="cm-work-title" lang={c.work.sourceLanguage} data-proper-names>
              {c.work.title}
            </h3>
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
            {c.sourceOnly && <p class="cm-source-only">{t('cm.sourceOnly')}</p>}
            {!c.sourceOnly && c.language !== c.work.sourceLanguage && (
              <p class="cm-original-note">
                <span class="cm-original-swatch" aria-hidden="true"></span>
                {t('cm.original')}
              </p>
            )}
          </header>
          {c.sections.map((s) => (
            <Section c={c} s={s} chapter={chapter} t={t} />
          ))}
        </article>
      ))}
    </div>
  );
}
