// Personsider: /personer (liste med filter/søk-øy) og /personer/:personId
// (detalj). Portert fra bibel/src/components/PersonsContent + PersonList +
// PersonContent. Forbedring: familie/relaterte slås opp server-side (gamle
// appen gjorde N+1 klient-fetch).

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { InlineRefs } from '../../views/inline-refs.tsx';
import { ItemTagging } from '../../views/item-tagging.tsx';
import { KeyEventList } from '../../views/verse-display.tsx';
import {
  getAllPersonsData,
  getPersonData,
  getBookById,
  getBookUrlSlug,
  type PersonData,
} from '../../lib/bible.ts';
import { bookNameById } from '../../lib/books-data.ts';
import { layoutProps, tFor, lhref, tEnum, type Translator } from '../../lib/i18n.ts';
import { tCtx } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

/**
 * Epoken er en enum-nøkkel i dataene (`exodus`, `divided-kingdom`) og lik på
 * alle språk, så etiketten hører hjemme i ordboka (#21).
 */
const eraLabel = (t: Translator, era: string) => tEnum(t, 'era.', era);

/**
 * Rollene er derimot fritekst som ALLEREDE er oversatt i dataene (382 norske
 * og 402 engelske verdier), så de skal ikke slås opp — bare få stor
 * forbokstav. Det gamle `roleLabels`-kartet dekket 12 norske nøkler og lot
 * engelsk stå med små bokstaver ved siden av norske med store.
 */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** /personer — full liste SSR; filter/søk er en øy over data-attributtene. */
r.get('/personer', async (c) => {
  const t = tFor(c);
  const persons = await getAllPersonsData();

  const eras = [...new Set(persons.map((p) => p.era))].sort();
  const roles = [...new Set(persons.flatMap((p) => p.roles))].sort();

  function searchText(p: PersonData): string {
    return [
      p.name,
      p.title,
      p.summary,
      p.roles.join(' '),
      eraLabel(t, p.era),
      ...(p.aliases || []),
    ].join(' ');
  }

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('persons.title')} — FLOGVIT.bible`}
      description={t('persons.meta')}
      styles={['persons.css']}
      scripts={['person-filter.js']}
    >
      <div class="persons-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: t('common.home'), href: '/' }, { label: t('persons.title') }]} />

          <h1>{t('persons.title')}</h1>
          <p class="persons-intro">
            {t('persons.intro')}
          </p>

          <div class="persons-search-container">
            <input
              type="text"
              class="persons-search-input"
              id="person-search"
              placeholder={t('persons.searchPh')}
              aria-label={t('persons.searchAria')}
              autocomplete="off"
            />
          </div>

          <div class="persons-filter-section">
            <div class="persons-filter-group">
              <span class="persons-filter-label">{t('persons.era')}</span>
              <div class="persons-filter-buttons" data-filter="era">
                <button type="button" class="persons-filter-button active" data-value="">
                  {t('common.all')}
                </button>
                {eras.map((e) => (
                  <button type="button" class="persons-filter-button" data-value={e}>
                    {eraLabel(t, e)}
                  </button>
                ))}
              </div>
            </div>
            <div class="persons-filter-group">
              <span class="persons-filter-label">{t('persons.role')}</span>
              <div class="persons-filter-buttons" data-filter="role">
                <button type="button" class="persons-filter-button active" data-value="">
                  {t('common.all')}
                </button>
                {roles.map((role) => (
                  <button type="button" class="persons-filter-button" data-value={role}>
                    {capitalize(role)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p class="persons-search-info" id="person-count" hidden></p>

          <div class="persons-list" id="person-list">
            {persons.map((p) => (
              <a
                href={lhref(`/personer/${p.id}`)}
                class="persons-card"
                data-era={p.era}
                data-roles={p.roles.join(' ')}
                data-name={p.name.toLowerCase()}
                data-search={searchText(p).toLowerCase()}
              >
                <div class="persons-card-header">
                  <h2 class="persons-card-name">{p.name}</h2>
                </div>
                <p class="persons-card-title">{p.title}</p>
                <div class="persons-card-meta">
                  <span class="persons-era-badge">{eraLabel(t, p.era)}</span>
                  {p.roles.map((role) => (
                    <span class="persons-role-badge">{capitalize(role)}</span>
                  ))}
                </div>
                <p class="persons-card-summary">
                  {p.summary.length > 150 ? p.summary.slice(0, 150) + '...' : p.summary}
                </p>
              </a>
            ))}
          </div>
          <p class="persons-no-results" id="person-empty" hidden>
            {t('persons.noMatch')}
          </p>
        </div>
      </div>
    </Layout>,
  );
});

/** /personer/:personId — detalj. Familie/relaterte slås opp server-side. */
r.get('/personer/:personId', async (c) => {
  const t = tFor(c);
  const person = await getPersonData(c.req.param('personId'));
  if (!person) return c.notFound();

  async function lookup(
    id: string | null | undefined,
  ): Promise<{ id: string; name: string; title: string } | null> {
    if (!id) return null;
    const p = await getPersonData(id);
    return p ? { id, name: p.name, title: p.title } : null;
  }

  const familyMembers: { id: string; name: string; relation: string }[] = [];
  if (person.family) {
    const far = await lookup(person.family.father);
    if (far) familyMembers.push({ ...far, relation: 'Far' });
    const mor = await lookup(person.family.mother);
    if (mor) familyMembers.push({ ...mor, relation: 'Mor' });
    const ekte = await lookup(person.family.spouse);
    if (ekte) familyMembers.push({ ...ekte, relation: 'Ektefelle' });
    for (const id of person.family.siblings || []) {
      const m = await lookup(id);
      if (m) familyMembers.push({ ...m, relation: 'Søsken' });
    }
    for (const id of person.family.children || []) {
      const m = await lookup(id);
      if (m) familyMembers.push({ ...m, relation: 'Barn' });
    }
  }

  const related: { id: string; name: string; title: string }[] = [];
  for (const id of person.relatedPersons || []) {
    const p = await lookup(id);
    if (p) related.push(p);
  }

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${person.name} — FLOGVIT.bible`}
      description={person.summary.slice(0, 155)}
      styles={['persons.css']}
      scripts={['tagging.js']}
    >
      <div class="person-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: tCtx()('common.home'), href: '/' },
              { label: tCtx()('nav.persons'), href: '/personer' },
              { label: person.name },
            ]}
          />

          <header class="person-header">
            <h1>{person.name}</h1>
            <p class="person-title">{person.title}</p>
            {person.aliases && person.aliases.length > 0 && (
              <p class="person-aliases">Også kjent som: {person.aliases.join(', ')}</p>
            )}
            <div class="person-meta">
              <span class="persons-era-badge">{eraLabel(t, person.era)}</span>
              {person.roles.map((role) => (
                <span class="persons-role-badge">{capitalize(role)}</span>
              ))}
              {person.lifespan && <span class="person-lifespan">{person.lifespan}</span>}
            </div>
          </header>

          <p class="person-summary">
            <InlineRefs text={person.summary} />
          </p>

          <div class="person-tagging-section">
            <ItemTagging itemType="person" itemId={person.id} />
          </div>

          {familyMembers.length > 0 && (
            <section class="person-family-section">
              <h2>{t('persons.family')}</h2>
              <div class="person-family-list">
                {familyMembers.map((m) => (
                  <a href={lhref(`/personer/${m.id}`)} class="person-family-member">
                    <span class="person-family-relation">{m.relation}</span>
                    <span class="person-family-name">{m.name}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section class="person-events-section">
            <h2>{t('persons.keyEvents')}</h2>
            <KeyEventList keyEvents={person.keyEvents} />
          </section>

          {person.references && person.references.length > 0 && (
            <section class="person-references-section">
              <h2>{t('persons.mentionedIn', { n: person.references.length })}</h2>
              <div class="person-ref-list">
                {person.references.map((ref) => {
                  const book = getBookById(ref.bookId);
                  const label = bookNameById(ref.bookId) || `Bok ${ref.bookId}`;
                  const slug = book ? getBookUrlSlug(book) : '';
                  return (
                    <a href={lhref(`/${slug}/${ref.chapterId}#v${ref.verseId}`)} class="person-ref-chip">
                      {label} {ref.chapterId}:{ref.verseId}
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {related.length > 0 && (
            <section class="person-related-section">
              <h2>{t('persons.related')}</h2>
              <div class="person-related-list">
                {related.map((rp) => (
                  <a href={lhref(`/personer/${rp.id}`)} class="person-related-person">
                    <span class="person-related-name">{rp.name}</span>
                    <span class="person-related-title">{rp.title}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Layout>,
  );
});

export default r;
