// Oversiktssider. FERDIG her: /lesetekster (liste; detalj /lesetekster/:id).
// De øvrige oversiktssidene (tidslinje-viz,
// profetier, paralleller, statistikk) har tunge interaktive visninger og
// bygges av side-agenten — se ISSUES.md #9. /oversettelser hører til
// brukersidene (opplasting til IndexedDB/sync), ikke her.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { InlineRefs } from '../../views/inline-refs.tsx';
import { ItemTagging } from '../../views/item-tagging.tsx';
import { VerseRefList } from '../../views/verse-display.tsx';
import { bookNameByShort, bookAbbrByShort } from '../../lib/books-data.ts';
import {
  getAllReadingTexts,
  getReadingTextById,
  getReadingTextsByDate,
  getReadingTextLanguages,
  getReadingTextContentLanguages,
  getProphecies,
  getProphecyCategories,
  getGospelParallels,
  getGospelParallelSections,
  getVerses,
  getMultiTimeline,
  getBibleStatistics,
  getBibleEditions,
  getBibleEditionById,
  getTopWords,
  type ProphecyReference,
  type VerseRef,
  normalizeBibleId,
  defaultBibleForLanguage,
} from '../../lib/bible.ts';
import { GonePage } from './misc.tsx';
import { enrichWithVerseText, readingTypeKey } from '../../lib/reading-text-enrich.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
// @ts-expect-error — delt klient-modul uten typer (formen bor ett sted, se #91)
import { verseHash } from '../../../public/js/verse-hash.js';
import { absoluteUrl } from '../../lib/site-url.ts';
import { layoutProps, tFor, lhref, href, currentIntlTag, langName, scriptName, type Locale } from '../../lib/i18n.ts';
import { tCtx, tEnum } from '../../lib/i18n.ts';
import { pickLocalisedText, localesWithContent, localeToContentLanguage } from '../../lib/lang.ts';

const r = new Hono<AppEnv>();

// Prophecy/fulfillment-referanse → VerseRef (eksplisitt versliste).
function toVerseRef(ref: ProphecyReference): VerseRef {
  const verses: number[] = [];
  for (let v = ref.verse_start; v <= ref.verse_end; v++) verses.push(v);
  return { bookId: ref.book_id, chapter: ref.chapter, verses };
}
function prophecyRefUrl(ref: ProphecyReference): string {
  return `/${toUrlSlug(ref.book_short_name || '')}/${ref.chapter}${verseHash(ref.verse_start, ref.verse_end)}`;
}

// ---------- /oversettelser/:id (info per oversettelse) ----------
//
// Listen over oversettelser bor på brukersiden /oversettelser (der egne bibler
// lastes opp); dette er den offentlige INFO-siden per utgave. Radene kommer fra
// bible_editions, som importøren fyller for hver oversettelse vi henter tekst
// for — en ny oversettelse gir altså info-side automatisk.

// Enum-verdier fra meta.json → etikett i ordboka (#22). Nøklene er data og
// like på alle språk; bare visningen oversettes. `label()` faller tilbake til
// selve verdien for ukjente nøkler, som før.
const label = (prefix: string, key: string | null | undefined) =>
  key ? tEnum(tCtx(), prefix, key) : null;

function EditionRow({ term, children }: { term: string; children?: unknown }) {
  return (
    <div class="edition-row">
      <dt>{term}</dt>
      <dd>{children as never}</dd>
    </div>
  );
}

r.get('/oversettelser/:id', async (c) => {
  const t = tFor(c);
  const edition = await getBibleEditionById(c.req.param('id'));
  if (!edition) return c.notFound();

  const { meta, license } = edition;
  const name = edition.name_native;
  const basis = [
    ...(meta.textual_basis?.ot ?? []).map((b) => ({ testament: 'ed.otShort' as const, translation: b })),
    ...(meta.textual_basis?.nt ?? []).map((b) => ({ testament: 'ed.ntShort' as const, translation: b })),
  ];

  // Krediteringskravet forplanter seg til oversettelser som bygger på kilden, så
  // vi lenker til kildeutgavene som HAR info-side hos oss.
  // Navn per id, ikke bare id-ene: lenketeksten var oversettelses-id-en
  // («sblgnt») framfor utgavens navn (#38).
  const knownNames = new Map((await getBibleEditions()).map((e) => [e.id, e.name_native] as const));
  const known = new Set(knownNames.keys());
  const editionLabel = (id: string) => knownNames.get(id) ?? id;
  const sourceTranslations = [
    ...basis.map((b) => b.translation),
    ...(meta.derived_from?.translation ? [meta.derived_from.translation] : []),
  ].filter((m, i, arr) => arr.indexOf(m) === i);
  const attributionSources = sourceTranslations.filter((m) => known.has(m) && m !== edition.id);

  // «Karakter»-punktene er utsagn om utgaven, men de leses av den som er på
  // siden — de hører til leserens språk, ikke utgavens (free-bible#23).
  // Punkter uten tekst i noe språk i kjeden faller bort framfor å bli tomme <li>.
  const legacyNotes = (meta.legacy ?? [])
    .map((l) => pickLocalisedText(l.text))
    .filter((n): n is { text: string; lang: string | null } => n !== null);

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${name} — ${t('nav.translations')} — FLOGVIT.bible`}
      description={t('ed.metaDesc', { name: edition.abbreviation ? `${name} (${edition.abbreviation})` : name })}
      styles={['overview.css']}
      canonical={absoluteUrl(lhref(`/oversettelser/${edition.id}`))}
    >
      <div class="overview-main">
        <div class="container">
          <Breadcrumbs
            items={[
              { label: tCtx()('common.home'), href: '/' },
              { label: tCtx()('nav.translations'), href: '/oversettelser' },
              { label: edition.abbreviation ?? name },
            ]}
          />
          <header>
            <h1>{name}</h1>
            {meta.name?.en && meta.name.en !== name ? (
              <p class="overview-intro" lang="en">{meta.name.en}</p>
            ) : null}
          </header>

          <section class="overview-section">
            <h2>{t('ed.about')}</h2>
            <dl class="edition-facts">
              {edition.abbreviation ? <EditionRow term={t('ed.abbreviation')}>{edition.abbreviation}</EditionRow> : null}
              {/* ISO-kodene sto rått («en / eng — skrift Latn»); dataene har
                  70+ språkkoder og 17 skriftkoder, så navnene kommer fra Intl
                  med ordboka som overstyring der ICU mangler noe (#38). */}
              <EditionRow term={t('ed.language')}>
                {langName(t, edition.lang_iso639_1 || edition.lang_iso639_3 || '')}
                {edition.script ? ` — ${t('ed.script', { script: scriptName(edition.script) })}` : ''}
                {edition.direction === 'rtl' ? ` (${t('ed.rtl')})` : ''}
              </EditionRow>
              {label('ed.philosophy.', edition.philosophy)
                ? <EditionRow term={t('ed.philosophy')}>{label('ed.philosophy.', edition.philosophy)}</EditionRow> : null}
              {label('ed.tradition.', edition.tradition)
                ? <EditionRow term={t('ed.tradition')}>{label('ed.tradition.', edition.tradition)}</EditionRow> : null}
              {edition.body ? <EditionRow term={t('ed.body')}>{edition.body}</EditionRow> : null}
              {meta.publisher ? <EditionRow term={t('ed.imprint')}>{meta.publisher}</EditionRow> : null}
              {meta.translators?.length
                ? <EditionRow term={meta.translators.length > 1 ? t('ed.translators') : t('ed.translator')}>{meta.translators.join(', ')}</EditionRow> : null}
              {edition.year_published
                ? <EditionRow term={t('ed.published')}>{edition.year_published}{meta.year?.revised ? `, ${t('ed.revised', { year: meta.year.revised })}` : ''}</EditionRow> : null}
              {meta.work?.method?.length
                ? <EditionRow term={t('ed.method')}>{meta.work.method.map((m) => label('ed.method.', m)).join(', ')}</EditionRow> : null}
              {meta.work?.source_languages?.length
                ? <EditionRow term={t('ed.translatedFrom')}>
                    {meta.work.source_languages.map((l) => langName(t, l)).join(', ')}
                  </EditionRow> : null}
              {basis.length
                ? <EditionRow term={t('ed.textualBasis')}>
                    {basis.map((b) => `${t(b.testament)}: ${label('ed.basis.', b.translation)}`).join(' · ')}
                  </EditionRow> : null}
              {meta.derived_from?.translation
                ? <EditionRow term={t('ed.basedOn')}>
                    {known.has(meta.derived_from.translation)
                      ? <a href={lhref(`/oversettelser/${meta.derived_from.translation}`)}>
                          {editionLabel(meta.derived_from.translation)}
                        </a>
                      : editionLabel(meta.derived_from.translation)}
                    {meta.derived_from.relation === 'revision_of' ? ` (${t('ed.revision')})` : ''}
                  </EditionRow> : null}
              {meta.links?.homepage
                ? <EditionRow term={t('ed.homepage')}>
                    <a href={meta.links.homepage} target="_blank" rel="noopener noreferrer">{meta.links.homepage}</a>
                  </EditionRow> : null}
            </dl>
          </section>

          {edition.books ? (
            <section class="overview-section">
              <h2>{t('ed.coverage')}</h2>
              <dl class="edition-facts">
                <EditionRow term={t('ed.scope')}>{label('ed.testament.', edition.testament)}</EditionRow>
                <EditionRow term={t('ed.books')}>{edition.books}</EditionRow>
                {edition.chapters ? <EditionRow term={t('ed.chapters')}>{edition.chapters}</EditionRow> : null}
                {edition.verses ? <EditionRow term={t('ed.verses')}>{edition.verses}</EditionRow> : null}
                <EditionRow term={t('ed.deutero')}>
                  {meta.coverage?.deuterocanonical ? t('common.yes') : t('common.no')}
                </EditionRow>
                {meta.features?.strongs ? <EditionRow term={t('ed.strongs')}>{t('common.yes')}</EditionRow> : null}
              </dl>
            </section>
          ) : null}

          {legacyNotes.length ? (
            <section class="overview-section">
              <h2>{t('ed.character')}</h2>
              <ul class="edition-notes">
                {legacyNotes.map((n) => <li lang={n.lang ?? undefined}>{n.text}</li>)}
              </ul>
            </section>
          ) : null}

          {/* Lisensseksjonen rendres ALLTID. En utelatt seksjon leses som «ingen
              begrensninger», og det er nettopp den feilen vi ikke skal gjøre. */}
          <section class="overview-section">
            <h2>{t('ed.license')}</h2>
            {license ? (
              <>
                <dl class="edition-facts">
                  <EditionRow term={t('ed.licenseRow')}>
                    {license.license}
                    {license.spdx ? <span class="edition-spdx"> {license.spdx}</span> : null}
                  </EditionRow>
                  <EditionRow term={t('ed.attribution')}>
                    {license.attribution_required ? t('ed.required') : t('ed.notRequired')}
                  </EditionRow>
                  <EditionRow term={t('ed.commercial')}>
                    {license.noncommercial ? t('ed.notAllowed') : t('ed.allowed')}
                  </EditionRow>
                </dl>
                {license.attribution_required ? (
                  <p class="edition-license-required" dangerouslySetInnerHTML={{ __html: t('ed.attributionRequired') }} />
                ) : null}
                {license.statement ? (
                  <blockquote class="edition-license-statement" lang="en">{license.statement}</blockquote>
                ) : null}
              </>
            ) : (
              <p class="edition-license-missing" dangerouslySetInnerHTML={{ __html: t('ed.licenseMissing') }} />
            )}

            {attributionSources.length ? (
              <p class="edition-license-inherited">
                {t('ed.buildsOn')}{' '}
                {attributionSources.map((m, i) => (
                  <>
                    {i > 0 ? ', ' : ''}
                    <a href={lhref(`/oversettelser/${m}`)}>{editionLabel(m)}</a>
                  </>
                ))}
                . {t('ed.inheritedTerms')}
              </p>
            ) : null}
          </section>

          {meta.provenance ? (
            <section class="overview-section">
              <h2>{t('ed.sources')}</h2>
              <p class="overview-intro">
                {meta.provenance.generated
                  ? t('ed.provenanceUpdated', {
                      method: tEnum(t, 'ed.provMethod.', meta.provenance.method ?? ''),
                      date: meta.provenance.generated,
                    })
                  : t('ed.provenance', {
                      method: tEnum(t, 'ed.provMethod.', meta.provenance.method ?? ''),
                    })}
              </p>
              {meta.provenance.sources?.length ? (
                <ul class="edition-notes">
                  {meta.provenance.sources.map((s) => (
                    <li>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a>
                      ) : t('ed.unknownSource')}
                      {s.fields?.length ? <span class="edition-spdx"> {s.fields.join(', ')}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /kjente-vers: FJERNET (#58) ----------
//
// Sida viste 62 kort fra `important_verses`, og KILDEN til den tabellen ble
// slettet i free-bible 2026-07-29 (`0afddcdb8`): sitatene var fra en
// oversettelse vi ikke eier, utvalget var avskrevet uten kilde, og tre av
// referansene pekte på feil vers fordi fila brukte europeisk versnummerering
// der osnb følger hebraisk. `Sal 46:1` ga overskriften «Til kordirigenten»
// framfor «Gud er vår tilflukt». Radene kunne ikke regenereres av noen, og
// siden serverte nøyaktig de feilene kilden ble slettet for.
//
// Utvalget ble ikke skrevet om her. «Kjent vers» er et KULTURFAKTUM, ikke en
// egenskap ved teksten, og free-bible#22 målte at referansegrafen ikke kan
// erstatte lista (null overlapp mellom topp-100 innkommende referanser og de
// 49). Å plukke 62 vers på nytt i dette repoet ville vært den samme kildeløse
// lista én gang til, bare med vår signatur på. Kravene til en gjeninnføring —
// egen tekst, hebraisk nummerering, per språk, kildeangivelse — står i
// free-bible#22, og sangkorpuset (free-bible#8) er kandidaten.
//
// 410, ikke 404: adressen sto i navigasjonen og i sitemapen, altså er den
// indeksert og bokmerket. 404 sier «ikke her nå» og blir prøvd igjen; 410 sier
// «fjernet med vilje».

r.get('/kjente-vers', (c) => c.html(GonePage(layoutProps(c)), 410));

// ---------- /lesetekster ----------

// Datoene her var norske ordlister med kommentaren «deterministisk norsk
// datoformat uten locale-avhengighet» — altså nøyaktig #25 i en annen form:
// «søndag 26. juli» på alle åtte språk. Intl kjenner sidens locale
// (`currentIntlTag()`), og datoene er UTC-normaliserte, så resultatet er like
// deterministisk som før.
function fmtDate(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentIntlTag(), { ...opts, timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}

/** «søndag 26. juli» — dag og måned, uten år. */
function formatDate(date: string): string {
  return fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Månedsoverskrift over en gruppe lesetekster: «Juli 2026». */
function formatMonth(yearMonth: string): string {
  const label = fmtDate(`${yearMonth}-01`, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

r.get('/lesetekster', async (c) => {
  const t = tFor(c);
  const { locale } = layoutProps(c);
  const texts = await getAllReadingTexts();
  // Kronologisk fremover (som gamle appens standardvisning): dato ≥ i dag.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = texts.filter((t) => t.date >= today);

  // Ett kort per DATO, ikke per rad: URL-en er datoen (#40), og flere
  // lesetekster kan dele en dag (Julenatt og Juledag). Uten grupperingen ville
  // to kort pekt på samme side.
  const days = new Map<string, typeof texts>();
  for (const t of upcoming) {
    if (!days.has(t.date)) days.set(t.date, []);
    days.get(t.date)!.push(t);
  }

  const groups = new Map<string, [date: string, texts: typeof texts][]>();
  for (const [date, dayTexts] of days) {
    const key = date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push([date, dayTexts]);
  }

  // Menypunktet står på alle åtte språk, og på seks av dem er lista tom (#76).
  // De to tomme tilfellene er IKKE det samme:
  //
  //   texts.length === 0     språket har ikke lesetekstene i det hele tatt
  //   upcoming.length === 0  vi har dem, men alle datoene har passert
  //
  // Bare det første har en vei ut. Pekte vi videre i det andre tilfellet også,
  // ville et tomt /nb/lesetekster sendt leseren til et like tomt /nn/lesetekster
  // — en blindvei med et ekstra klikk.
  const elsewhere =
    texts.length === 0
      ? localesWithContent(await getReadingTextContentLanguages()).find((l) => l !== locale)
      : undefined;
  const elsewhereName = elsewhere ? langName(t, localeToContentLanguage(elsewhere)) : '';

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('nav.readingTexts')} — FLOGVIT.bible`}
      description={t('rt.intro')}
      styles={['overview.css']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.readingTexts') }]} />
          <h1>{t('nav.readingTexts')}</h1>
          <p class="overview-intro">
            {t('rt.intro')}
          </p>

          {upcoming.length === 0 ? (
            <>
              <p>{t('rt.noUpcoming')}</p>
              {elsewhere && (
                <p>
                  {t('rt.onlyIn', { language: elsewhereName })}{' '}
                  <a href={href(elsewhere, '/lesetekster')}>
                    {t('rt.openIn', { language: elsewhereName })}
                  </a>
                </p>
              )}
            </>
          ) : (
            [...groups.entries()].map(([key, group]) => (
              <section class="overview-section">
                <h2>{formatMonth(key)}</h2>
                <div class="reading-text-list">
                  {group.map(([date, dayTexts]) => (
                    <a href={lhref(`/lesetekster/${date}`)} class="reading-text-card">
                      <span class="reading-text-name">
                        {dayTexts.map((x) => x.name).join(' · ')}
                        {dayTexts[0]!.series && <span class="reading-text-series">{dayTexts[0]!.series}</span>}
                      </span>
                      <span class="reading-text-date">{formatDate(date)}</span>
                    </a>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </Layout>,
  );
});

/** Fulldato med år: «lørdag 5. juli 2026». */
function formatFullDate(date: string): string {
  return fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Lesedagen — `/lesetekster/<dato>` (#40).
 *
 * URL-en var `/lesetekster/<auto_increment-id>`, og importen sletter og setter
 * inn `reading_texts` på nytt. MySQL fortsetter tellingen der den slapp, så
 * HVERT innholdsdeploy flyttet hele settet: bokmerker, delte lenker og
 * indekserte adresser døde i takt med innholdsoppdateringene. I loggen ba
 * crawlere om 103 distinkte døde ID-er på én time, i et sammenhengende område
 * fra en tidligere generasjon.
 *
 * Datoen er den naturlige nøkkelen og kan ikke renummereres. Flere lesetekster
 * kan dele en dato (Julenatt og Juledag), og siden viser dem da alle — det er
 * dagens tekster.
 */
r.get('/lesetekster/:date{[0-9]{4}-[0-9]{2}-[0-9]{2}}', async (c) => {
  const t = tFor(c);
  const date = c.req.param('date');
  const texts = await getReadingTextsByDate(date);

  // Finnes dagen, men ikke på DETTE språket, går leseren dit den finnes (#76).
  //
  // En delt lenke er hele bruken av denne siden: den kommer fra en som leser
  // norsk, til en som kanskje ikke gjør det, og en 404 gjør lenken verdiløs for
  // begge. Det bryter ikke med #26 — vi viser ikke norsk tekst under /en/, vi
  // sier at teksten bor på den norske adressen og tar leseren dit, der
  // `<html lang>` er ærlig.
  //
  // 302, ikke 301: at lesetekstene bare finnes på norsk er en egenskap ved
  // DATAENE, ikke ved adressen. Blir de importert på flere språk, skal en
  // nettleser som har lagret en permanent redirect slutte å bruke den.
  //
  // Målet utledes av basen, ikke av en hardkodet `nb` — og ALDRI av gjetning:
  // en dato uten lesetekst i det hele tatt 404-er som før, framfor å bli en
  // omvei til den samme blindveien.
  if (texts.length === 0) {
    const target = localesWithContent(await getReadingTextLanguages(date)).find(
      (l) => l !== layoutProps(c).locale,
    );
    if (!target) return c.notFound();
    const query = c.req.url.slice(c.req.url.indexOf('?') + 1);
    const suffix = c.req.url.includes('?') ? `?${query}` : '';
    return c.redirect(href(target, `/lesetekster/${date}`) + suffix, 302);
  }

  // Prefs (bibel/mapping) er klient-side i dag; osnb er standard server-side.
  const bible = normalizeBibleId(c.req.query('bible')) || (await defaultBibleForLanguage());
  const mapping = normalizeBibleId(c.req.query('mapping')) || 'osnb';
  // Sekvensielt: hver enrich er mange små spørringer, og DB-poolen er liten (#19).
  const enriched: Awaited<ReturnType<typeof enrichWithVerseText>>[] = [];
  for (const text of texts) enriched.push(await enrichWithVerseText(text, bible, mapping));

  const names = texts.map((x) => x.name).join(' · ');

  // Hreflang skal bare oppgi språkene dagen FINNES på (#45). Lesetekstene er
  // norsk-spesifikke, så klyngen blir nb + nn — de øvrige seks er 404.
  const locales = localesWithContent(await getReadingTextLanguages(date));

  return c.html(
    <Layout {...layoutProps(c)}
      locales={locales}
      title={`${names} — ${t('nav.readingTexts')} — FLOGVIT.bible`}
      description={t('rt.detailMeta', { name: names })}
      styles={['overview.css']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: tCtx()('common.home'), href: '/' },
              { label: tCtx()('nav.readingTexts'), href: '/lesetekster' },
              { label: formatFullDate(date) },
            ]}
          />
          <h1>{formatFullDate(date)}</h1>

          {enriched.map((text) => (
            <article class="reading-text-detail">
              <h2>{text.name}</h2>
              <div class="reading-text-detail-meta">
                {text.series && (
                  <span class="reading-text-series">{t('home.lectionarySeries', { series: text.series })}</span>
                )}
              </div>

              {text.slots.map((slot) => {
                const hasAlternatives = slot.options.length > 1;
                return (
                  <section class="reading-text-slot">
                    {slot.options.map((option, optIdx) => (
                      <div class={hasAlternatives ? 'reading-text-option reading-text-alt' : 'reading-text-option'}>
                        {optIdx > 0 && (
                          <div class="reading-text-or">
                            <span>{t('rt.or')}</span>
                          </div>
                        )}
                        {option.parts.map((part) => {
                          const type =
                            part.ranges.length > 0 ? t(readingTypeKey(part.ranges[0]!.book_id)) : '';
                          const verses = text.verses[part.display_ref] || [];
                          return (
                            <div class="reading-text-part">
                              {type && <div class="reading-text-type">{type}</div>}
                              <h3>{part.title || part.refs.join('; ')}</h3>
                              <p class="reading-text-ref-line">{part.refs.join('; ')}</p>
                              {verses.length > 0 ? (
                                <div class="reading-text-verses">
                                  {verses.map((v, vi) => {
                                    const prev = vi > 0 ? verses[vi - 1]!.chapter : v.chapter;
                                    const showChapter = vi === 0 || v.chapter !== prev;
                                    return (
                                      <span>
                                        <sup class="reading-text-vnum">
                                          {showChapter ? `${v.chapter}:` : ''}
                                          {v.verse}
                                          {v.part || ''}
                                        </sup>
                                        {v.text}{' '}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p class="reading-text-missing">{t('rt.verseUnavailable')}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </section>
                );
              })}
            </article>
          ))}

          <a href={lhref('/lesetekster')} class="reading-text-back">{t('rt.backToAll')}</a>
        </div>
      </div>
    </Layout>,
  );
});

/**
 * Gamle ID-adresser: 301 til den stabile URL-en så lenge raden finnes.
 *
 * Rekkevidden er begrenset med vilje — bare DENNE generasjonen av ID-er kan
 * løses opp. Alt som ble indeksert før en tidligere import er borte for godt,
 * og en gjetning ville sendt leseren til en tilfeldig annen lesedag.
 */
r.get('/lesetekster/:id{[0-9]+}', async (c) => {
  const text = await getReadingTextById(parseInt(c.req.param('id'), 10));
  if (!text) return c.notFound();
  return c.redirect(lhref(`/lesetekster/${text.date}`), 301);
});

// ---------- /profetier ----------

r.get('/profetier', async (c) => {
  const t = tFor(c);
  const categories = await getProphecyCategories();
  const prophecies = await getProphecies();
  const catName = new Map(categories.map((cat) => [cat.id, cat.name]));

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('pr.title')} — FLOGVIT.bible`}
      description={t('pr.meta')}
      styles={['overview.css', 'persons.css']}
      scripts={['card-filter.js', 'tagging.js']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.prophecies') }]} />
          <h1>{t('pr.title')}</h1>
          <p class="overview-intro">
            {t('pr.intro')}
          </p>

          <div class="study-filter-buttons" data-card-catfilter>
            <button type="button" class="persons-filter-button active" data-value="">
              {t('common.allCategories')}
            </button>
            {categories.map((cat) => (
              <button type="button" class="persons-filter-button" data-value={cat.id}>
                {cat.name}
              </button>
            ))}
          </div>

          <div class="prophecy-list" data-card-list>
            {prophecies.map((p) => (
              <details class="prophecy-card" data-cat={p.category_id}>
                <summary class="prophecy-summary">
                  <span class="prophecy-title">{p.title}</span>
                  <span class="prophecy-cat">{catName.get(p.category_id) || p.category_id}</span>
                </summary>
                <div class="prophecy-body">
                  <div class="prophecy-refs">
                    <span class="prophecy-ref">
                      <span class="prophecy-ref-label">{t('pr.prophecy')}</span>{' '}
                      <a href={lhref(prophecyRefUrl(p.prophecy))}>{p.prophecy.reference}</a>
                    </span>
                    <span class="prophecy-arrow" aria-hidden="true">→</span>
                    <span class="prophecy-ref">
                      <span class="prophecy-ref-label">
                        {p.category_id === 'endtimes' ? t('pr.ntReference') : t('pr.fulfilled')}
                      </span>{' '}
                      {p.fulfillments.map((f, i) => (
                        <>
                          {i > 0 && ', '}
                          <a href={lhref(prophecyRefUrl(f))}>{f.reference}</a>
                        </>
                      ))}
                    </span>
                  </div>

                  {p.explanation && (
                    <p class="prophecy-explanation">
                      <InlineRefs text={p.explanation} />
                    </p>
                  )}

                  <div class="study-tagging">
                    <ItemTagging itemType="prophecy" itemId={p.id} />
                  </div>

                  <details class="prophecy-verses">
                    <summary>{t('pr.showVerses')}</summary>
                    <div class="prophecy-verse-section">
                      <h4>Profetien ({p.prophecy.reference})</h4>
                      <VerseRefList refs={[toVerseRef(p.prophecy)]} />
                    </div>
                    {p.fulfillments.map((f) => (
                      <div class="prophecy-verse-section">
                        <h4>
                          {p.category_id === 'endtimes' ? 'NT-referanse' : 'Oppfyllelse'} ({f.reference})
                        </h4>
                        <VerseRefList refs={[toVerseRef(f)]} />
                      </div>
                    ))}
                  </details>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /paralleller ----------

const GOSPEL_NAMES: Record<string, string> = {
  matthew: 'Matteus', mark: 'Markus', luke: 'Lukas', john: 'Johannes',
};
const GOSPEL_ORDER = ['matthew', 'mark', 'luke', 'john'];

r.get('/paralleller', async (c) => {
  const t = tFor(c);
  const sections = await getGospelParallelSections();
  const parallels = await getGospelParallels();
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));

  // SSR av selve tekstene (som gamle appen lazy-lastet per parallell):
  // hent hvert kapittel bare én gang — mange passasjer deler kapittel.
  const chapterCache = new Map<string, Awaited<ReturnType<typeof getVerses>>>();
  for (const p of parallels) {
    for (const passage of Object.values(p.passages ?? {})) {
      const key = `${passage.book_id}-${passage.chapter}`;
      if (!chapterCache.has(key)) {
        chapterCache.set(key, await getVerses(passage.book_id, passage.chapter));
      }
    }
  }
  const passageVerses = (passage: { book_id: number; chapter: number; verse_start: number; verse_end: number }) =>
    (chapterCache.get(`${passage.book_id}-${passage.chapter}`) ?? []).filter(
      (v) => v.verse >= passage.verse_start && v.verse <= passage.verse_end,
    );

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('pa.title')} — FLOGVIT.bible`}
      description={t('pa.meta')}
      styles={['overview.css', 'persons.css']}
      scripts={['card-filter.js']}
    >
      <div class="overview-main">
        <div class="container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.parallels') }]} />
          <h1>{t('pa.title')}</h1>
          <p class="overview-intro">
            {t('pa.introFull')}
          </p>

          <div class="study-filter-buttons" data-card-catfilter>
            <button type="button" class="persons-filter-button active" data-value="">
              {t('common.allParts')}
            </button>
            {sections.map((s) => (
              <button type="button" class="persons-filter-button" data-value={s.id}>
                {s.name}
              </button>
            ))}
          </div>

          <div class="parallel-list" data-card-list>
            {parallels.map((p) => (
              <details class="parallel-card" data-cat={p.section_id}>
                <summary class="parallel-summary">
                  <span class="parallel-title">{p.title}</span>
                  <span class="parallel-section">{sectionName.get(p.section_id) || ''}</span>
                </summary>
                <div class="parallel-body">
                  {p.notes && (
                    <p class="parallel-notes">
                      <InlineRefs text={p.notes} />
                    </p>
                  )}
                  <div class="parallel-columns">
                    {GOSPEL_ORDER.map((g) => {
                      const passage = p.passages?.[g];
                      return (
                        <div class={`parallel-column parallel-${g}`}>
                          <span class="parallel-gospel">{GOSPEL_NAMES[g]}</span>
                          {passage ? (
                            <>
                              <a
                                href={lhref(`/${toUrlSlug(passage.book_short_name || '')}/${passage.chapter}${verseHash(passage.verse_start, passage.verse_end)}`)}
                                class="parallel-passage-ref"
                              >
                                {passage.reference}
                              </a>
                              <div class="parallel-verses">
                                {passageVerses(passage).map((v) => (
                                  <p class="parallel-verse">
                                    <span class="parallel-verse-num">{v.verse}</span> {v.text}
                                  </p>
                                ))}
                              </div>
                            </>
                          ) : (
                            <span class="parallel-no-passage">{t('rd.notInGospel', { gospel: GOSPEL_NAMES[g] ?? g })}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /tidslinje ----------
// SSR-innhold: periodene med sine hendelser (kronologisk). Den grafiske
// tidslinje-visualiseringen (MultiTimelineView) kan legges på som øy senere;
// dette innholdet er fullt lesbart og SEO-vennlig uten JS.

r.get('/tidslinje', async (c) => {
  const t = tFor(c);
  const data = await getMultiTimeline();
  // Gruppér bibelhendelsene under periodene (rekkefølge fra periods-lista).
  const byPeriod = new Map<string, typeof data.bible.events>();
  for (const p of data.bible.periods) byPeriod.set(p.id, []);
  const orphans: typeof data.bible.events = [];
  for (const e of data.bible.events) {
    const bucket = e.period_id ? byPeriod.get(e.period_id) : undefined;
    if (bucket) bucket.push(e);
    else orphans.push(e);
  }

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('tl.title')} — FLOGVIT.bible`}
      description={t('tl.meta')}
      styles={['overview.css']}
      scripts={['timeline-filter.js']}
    >
      <div class="overview-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.timeline') }]} />
          <h1>{t('tl.title')}</h1>
          <p class="overview-intro">
            {t('tl.intro')}
          </p>

          {/* Periodefilter (GitHub #6) — uten JS vises alle periodene. */}
          <div class="timeline-filter" data-timeline-filter hidden>
            <button type="button" class="timeline-filter-btn is-active" data-value="">{t('tl.allPeriods')}</button>
            {data.bible.periods
              .filter((p) => (byPeriod.get(p.id) || []).length > 0)
              .map((p) => (
                <button type="button" class="timeline-filter-btn" data-value={p.id}>{p.name}</button>
              ))}
          </div>

          {data.bible.periods.map((period) => {
            const events = byPeriod.get(period.id) || [];
            if (events.length === 0) return null;
            return (
              <section class="timeline-period" data-period={period.id}>
                <h2 class="timeline-period-name" style={period.color ? `border-left-color: ${period.color}` : ''}>
                  {period.name}
                </h2>
                {period.description && <p class="timeline-period-desc">{period.description}</p>}
                <ol class="timeline-events">
                  {events.map((e) => (
                    <li class="timeline-event">
                      <div class="timeline-event-head">
                        <span class="timeline-event-title">{e.title}</span>
                        {e.year_display && <span class="timeline-event-year">{e.year_display}</span>}
                      </div>
                      {e.description && <p class="timeline-event-desc">{e.description}</p>}
                      {e.references && e.references.length > 0 && (
                        <div class="timeline-event-refs">
                          {e.references.map((ref) => (
                            <a
                              href={lhref(`/${toUrlSlug(ref.book_short_name || '')}/${ref.chapter}${verseHash(ref.verse_start, ref.verse_end)}`)}
                              class="person-ref-chip"
                            >
                              {bookAbbrByShort(ref.book_short_name)} {ref.chapter}:{ref.verse_start}
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
          {orphans.length > 0 && (
            <section class="timeline-period">
              <h2 class="timeline-period-name">{t('tl.otherEvents')}</h2>
              <ol class="timeline-events">
                {orphans.map((e) => (
                  <li class="timeline-event">
                    <div class="timeline-event-head">
                      <span class="timeline-event-title">{e.title}</span>
                      {e.year_display && <span class="timeline-event-year">{e.year_display}</span>}
                    </div>
                    {e.description && <p class="timeline-event-desc">{e.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /statistikk ----------

// Tusenskille med tynt mellomrom (nb-NO), deterministisk.
function nf(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

r.get('/statistikk', async (c) => {
  const t = tFor(c);
  const bible = normalizeBibleId(c.req.query('bible')) || (await defaultBibleForLanguage());
  const stats = await getBibleStatistics(bible);
  const topWords = await getTopWords(bible, 100, false);
  const ot = stats.books.filter((b) => b.testament === 'OT');
  const nt = stats.books.filter((b) => b.testament === 'NT');

  function statCard(value: number, label: string) {
    return (
      <div class="stat-card">
        <div class="stat-value">{nf(value)}</div>
        <div class="stat-label">{label}</div>
      </div>
    );
  }
  function bookRows(books: typeof stats.books) {
    return books.map((b) => (
      <tr>
        <td>
          <a href={lhref(`/${toUrlSlug(b.shortName)}/1`)}>{b.bookName}</a>
        </td>
        <td class="num">{nf(b.chapters)}</td>
        <td class="num">{nf(b.verses)}</td>
        <td class="num">{nf(b.words)}</td>
        <td class="num">{nf(b.originalWords)}</td>
      </tr>
    ));
  }

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('st.title')} — FLOGVIT.bible`}
      description={t('st.meta')}
      styles={['overview.css']}
      scripts={['statistics.js']}
    >
      <div class="overview-main">
        <div class="container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: tCtx()('nav.statistics') }]} />
          <h1>{t('st.title')}</h1>

          <section class="overview-section">
            <h2>{t('st.overview')}</h2>
            <div class="stat-grid">
              {statCard(stats.totalBooks, t('st.books'))}
              {statCard(stats.totalChapters, t('st.chapters'))}
              {statCard(stats.totalVerses, t('st.verses'))}
              {statCard(stats.totalWords, t('st.words'))}
            </div>
            {ot.length > 0 && nt.length > 0 && (
              <div class="stat-comparison">
                <div class="stat-comparison-card">
                  <h3>{t('st.ot')}</h3>
                  <div class="stat-comparison-row"><span>{t('st.books')}</span><span>{nf(stats.otBooks)}</span></div>
                  <div class="stat-comparison-row"><span>{t('st.chapters')}</span><span>{nf(stats.otChapters)}</span></div>
                  <div class="stat-comparison-row"><span>{t('st.verses')}</span><span>{nf(stats.otVerses)}</span></div>
                  <div class="stat-comparison-row"><span>{t('st.words')}</span><span>{nf(stats.otWords)}</span></div>
                </div>
                <div class="stat-comparison-card">
                  <h3>{t('st.nt')}</h3>
                  <div class="stat-comparison-row"><span>{t('st.books')}</span><span>{nf(stats.ntBooks)}</span></div>
                  <div class="stat-comparison-row"><span>{t('st.chapters')}</span><span>{nf(stats.ntChapters)}</span></div>
                  <div class="stat-comparison-row"><span>{t('st.verses')}</span><span>{nf(stats.ntVerses)}</span></div>
                  <div class="stat-comparison-row"><span>{t('st.words')}</span><span>{nf(stats.ntWords)}</span></div>
                </div>
              </div>
            )}
          </section>

          <section class="overview-section">
            <h2>{t('st.books')}</h2>
            <div class="stat-table-wrap">
              <table class="stat-table">
                <thead>
                  <tr>
                    <th>{t('st.book')}</th>
                    <th class="num">{t('st.chapters')}</th>
                    <th class="num">{t('st.verses')}</th>
                    <th class="num">{t('st.words')}</th>
                    <th class="num">{t('u.originalText')}</th>
                  </tr>
                </thead>
                <tbody>
                  {bookRows(ot)}
                  {bookRows(nt)}
                </tbody>
              </table>
            </div>
          </section>

          <section class="overview-section">
            <h2>{t('st.frequentWords')}</h2>
            <div class="stat-word-tabs" role="group" aria-label={t('st.wordSource')}>
              <button type="button" class="stat-word-tab active" data-wordtab="translation" aria-pressed="true">
                {t('rd.rendering')}
              </button>
              <button type="button" class="stat-word-tab" data-wordtab="hebrew" aria-pressed="false">
                {t('lang.hebrew')}
              </button>
              <button type="button" class="stat-word-tab" data-wordtab="greek" aria-pressed="false">
                {t('lang.greek')}
              </button>
            </div>
            <ol class="stat-word-list" id="stat-words" data-bible={bible}>
              {topWords.map((w) => (
                <li class="stat-word-item">
                  <span class="stat-word">{w.word}</span>
                  <span class="stat-word-count">{nf(w.count)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Layout>,
  );
});

export default r;
