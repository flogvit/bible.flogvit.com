// Forside (/) + søk (/sok, /sok/original). Portert fra HomeContent/HomeHero/
// BookCategories/DiscoverGrid + SearchPage/OriginalSearchPage.
// Forsiden er SSR: dagens vers + bøker + utforsk + dagens lesetekst hentes
// server-side; «Fortsett å lese» og aktiv leseplan (localStorage) legges på av
// home.js-øya. Søk er SSR via ?q= (GET-skjema) med enkel paginering.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { getSql } from '../../lib/db.ts';
import { searchVerses, searchOriginalWord, getTodaysReadingTexts } from '../../lib/bible.ts';
import { booksData, type BookInfo } from '../../lib/books-data.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';

const r = new Hono<AppEnv>();

// ---------- forside ----------

interface DailyVerse {
  bookName: string;
  shortName: string;
  chapter: number;
  verseStart: number;
  display: string;
  text: string;
  note: string | null;
}

async function loadDailyVerse(bible = 'osnb2'): Promise<DailyVerse | null> {
  const sql = getSql();
  const date = new Date().toISOString().slice(0, 10);
  const [dv] = (await sql`
    SELECT book_id, chapter, verse_start, verse_end, note
    FROM daily_verses WHERE date = ${date}
  `) as { book_id: number; chapter: number; verse_start: number; verse_end: number; note: string | null }[];
  if (!dv) return null;
  const [book] = (await sql`
    SELECT name_no, short_name FROM books WHERE id = ${dv.book_id}
  `) as { name_no: string; short_name: string }[];
  if (!book) return null;
  const verses = (await sql`
    SELECT text FROM verses
    WHERE book_id = ${dv.book_id} AND chapter = ${dv.chapter}
      AND verse >= ${dv.verse_start} AND verse <= ${dv.verse_end} AND bible = ${bible}
    ORDER BY verse
  `) as { text: string }[];
  const range = dv.verse_start === dv.verse_end ? `${dv.verse_start}` : `${dv.verse_start}-${dv.verse_end}`;
  return {
    bookName: book.name_no,
    shortName: book.short_name,
    chapter: dv.chapter,
    verseStart: dv.verse_start,
    display: `${book.name_no} ${dv.chapter}:${range}`,
    text: verses.map((v) => v.text).join(' '),
    note: dv.note,
  };
}

const BOOK_GROUPS: { label: string; books: BookInfo[] }[] = [
  { label: 'Det gamle testamente · Mosebøkene', books: booksData.filter((b) => b.id >= 1 && b.id <= 5) },
  { label: 'Historiske bøker', books: booksData.filter((b) => b.id >= 6 && b.id <= 17) },
  { label: 'Poetiske bøker', books: booksData.filter((b) => b.id >= 18 && b.id <= 22) },
  { label: 'Profetene', books: booksData.filter((b) => b.id >= 23 && b.id <= 39) },
  { label: 'Det nye testamente · Evangeliene & Apg', books: booksData.filter((b) => b.id >= 40 && b.id <= 44) },
  { label: 'Paulus-brev', books: booksData.filter((b) => b.id >= 45 && b.id <= 57) },
  { label: 'Øvrige brev & Åpenbaringen', books: booksData.filter((b) => b.id >= 58 && b.id <= 66) },
];

const DISCOVER: { to: string; title: string; desc: string }[] = [
  { to: '/tidslinje', title: 'Tidslinje', desc: 'Fra skapelsen til den tidlige kirken — se hvor i historien en tekst hører hjemme.' },
  { to: '/personer', title: 'Personer', desc: 'Bibelske personer med biografier, slektskap og hvor de opptrer i teksten.' },
  { to: '/profetier', title: 'Profetier', desc: 'GT-profetier og deres oppfyllelse i NT, med kontekst og kommentar.' },
  { to: '/temaer', title: 'Temaer', desc: 'Følg motiver som nåde, lys, pakt eller ørken gjennom hele Bibelen.' },
  { to: '/paralleller', title: 'Parallelle tekster', desc: 'Se evangeliene side om side, sammenlign oversettelser og grunntekst.' },
  { to: '/manuskripter', title: 'Manuskripter', desc: 'Dine andakter, prekener og studienotater — koblet til vers.' },
  { to: '/historier', title: 'Bibelhistorier', desc: 'Bibelens fortellinger samlet og søkbare med kategorier og beskrivelser.' },
  { to: '/tall', title: 'Tall i Bibelen', desc: 'Tall og deres symbolikk gjennom hele Bibelen.' },
  { to: '/lesetekster', title: 'Lesetekster', desc: 'Kirkeårets lesetekster for hver søndag og helligdag.' },
  { to: '/kjente-vers', title: 'Kjente vers', desc: 'Populære vers å lære utenat og kjenne igjen.' },
  { to: '/lister', title: 'Verslister', desc: 'Lag dine egne samlinger av vers — for andakt, prekenforberedelse, eller studium.' },
  { to: '/favoritter', title: 'Favoritter', desc: 'Dine merkede vers og passasjer.' },
  { to: '/emner', title: 'Emner', desc: 'Tag vers, notater og innhold med dine egne emner.' },
  { to: '/notater', title: 'Notater', desc: 'Skriv refleksjoner og kommentarer på vers.' },
  { to: '/statistikk', title: 'Statistikk', desc: 'Se hvor mye du har lest og fulgt leseplaner.' },
  { to: '/oversettelser', title: 'Oversettelser', desc: 'Tilgjengelige bibeloversettelser og last ned for offline-bruk.' },
];

r.get('/', async (c) => {
  const verse = await loadDailyVerse();
  const todaysReading = await getTodaysReadingTexts();

  return c.html(
    <Layout
      title="FLOGVIT.bibel — Bibelen på nett"
      description="Les, studér og søk i Bibelen med grunntekst, kryssreferanser, tidslinje, temaer og personer."
      styles={['home.css']}
      scripts={['home.js']}
    >
      <div class="home-wrap">
        <div class="home-hero">
          {/* Fortsett/velkommen — home.js bytter til «Fortsett å lese» hvis
              leseposisjon finnes i localStorage. */}
          <div class="home-continue" id="home-continue" data-state="welcome">
            <div>
              <div class="eyebrow">Velkommen</div>
              <h1 class="home-continue-title">Bibelen</h1>
              <div class="home-continue-sub">
                Begynn et sted under, eller bruk ⌘K for å gå rett til et vers.
              </div>
            </div>
            <div class="home-actions">
              <a href="/1mos/1" class="home-btn home-btn-primary">Start med 1. Mosebok 1</a>
              <a href="/joh/1" class="home-btn home-btn-ghost">Eller Johannes 1</a>
            </div>
          </div>

          <div class="home-side">
            <div class="home-card home-vod">
              <h3>Dagens vers</h3>
              {verse ? (
                <>
                  <p class="home-vod-text">«{verse.text}»</p>
                  <div class="home-vod-foot">
                    <a href={`/${toUrlSlug(verse.shortName)}/${verse.chapter}#v${verse.verseStart}`}>
                      {verse.display}
                    </a>
                    {verse.note && <span class="home-vod-note"> · {verse.note}</span>}
                  </div>
                </>
              ) : (
                <div class="home-vod-empty">Ingen vers for i dag</div>
              )}
            </div>

            {/* Aktiv leseplan fylles av home.js fra localStorage. */}
            <div class="home-card home-plans" id="home-plans">
              <div class="home-plans-head">
                <h3>Leseplaner</h3>
                <span class="home-plans-count">Ingen aktiv</span>
              </div>
              <div class="home-plans-empty">
                <p>Du har ingen aktiv leseplan ennå.</p>
                <a href="/leseplan" class="home-plans-btn">Velg leseplan</a>
              </div>
            </div>
          </div>
        </div>

        {todaysReading.length > 0 && (
          <div class="home-lesetekster">
            {todaysReading.map((t) => (
              <div class="home-todays-reading">
                <div class="home-todays-eyebrow">
                  DnK lesetekster{t.series ? ` · Rekke ${t.series}` : ''}
                </div>
                <h3>
                  <a href={`/lesetekster/${t.id}`}>{t.name}</a>
                </h3>
              </div>
            ))}
          </div>
        )}

        <section class="home-books" aria-labelledby="books-heading">
          <div class="home-section-head">
            <h2 id="books-heading">Bibelens bøker</h2>
          </div>
          {BOOK_GROUPS.map((group) => (
            <div class="home-book-group">
              <div class="home-book-group-label">{group.label}</div>
              <div class="home-book-grid">
                {group.books.map((book) => (
                  <a href={`/${toUrlSlug(book.short_name)}/1`} class="home-book">
                    <span class="home-book-name">{book.name_no}</span>
                    <span class="home-book-meta">{book.chapters} kap.</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section class="home-discover" aria-labelledby="discover-heading">
          <div class="home-section-head">
            <h2 id="discover-heading">Utforsk</h2>
            <span class="home-section-sub">Studium på tvers av teksten</span>
          </div>
          <div class="home-discover-grid">
            {DISCOVER.map((item) => (
              <a href={item.to} class="home-disc">
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </Layout>,
  );
});

// ---------- /sok ----------

const PAGE_SIZE = 50;

r.get('/sok', async (c) => {
  const query = (c.req.query('q') || '').trim();
  const side = Math.max(1, parseInt(c.req.query('side') || '1', 10) || 1);
  const offset = (side - 1) * PAGE_SIZE;
  const bible = c.req.query('bible') || 'osnb2';

  const res = query.length >= 2 ? await searchVerses(query, PAGE_SIZE, offset, bible) : null;

  return c.html(
    <Layout
      title={query ? `Søk: ${query} — FLOGVIT.bibel` : 'Søk — FLOGVIT.bibel'}
      description="Søk i bibelteksten."
      styles={['search.css']}
    >
      <div class="search-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Søk' }]} />
          <h1>Søk i bibelteksten</h1>

          <form class="search-form" action="/sok" method="get" role="search">
            <input
              type="search"
              name="q"
              value={query}
              placeholder="Søk etter ord eller uttrykk…"
              aria-label="Søk i bibelteksten"
              class="search-input"
            />
            <button type="submit" class="search-submit">Søk</button>
          </form>
          <p class="search-hint">
            Søker du etter et bestemt vers? Skriv f.eks. «Joh 3,16» i hurtigsøket (⌘K). For
            grunntekst, se <a href="/sok/original">søk i originalspråk</a>.
          </p>

          {query.length >= 2 && res && (
            <>
              <p class="search-count">
                {res.total === 0 ? `Ingen treff på «${query}».` : `${res.total} treff på «${query}».`}
              </p>
              <div class="search-results">
                {res.results.map((v) => (
                  <a href={`/${toUrlSlug(v.book_short_name)}/${v.chapter}#v${v.verse}`} class="search-result">
                    <span class="search-result-ref">
                      {v.book_name_no} {v.chapter}:{v.verse}
                    </span>
                    <p class="search-result-text">{v.text}</p>
                  </a>
                ))}
              </div>
              <div class="search-pager">
                {side > 1 && (
                  <a href={`/sok?q=${encodeURIComponent(query)}&side=${side - 1}`} class="search-page-link">
                    ← Forrige
                  </a>
                )}
                {res.hasMore && (
                  <a href={`/sok?q=${encodeURIComponent(query)}&side=${side + 1}`} class="search-page-link">
                    Vis flere →
                  </a>
                )}
              </div>
            </>
          )}
          {query.length === 1 && <p class="search-count">Søket må være minst 2 tegn.</p>}
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /sok/original ----------

r.get('/sok/original', async (c) => {
  const query = (c.req.query('q') || '').trim();
  const side = Math.max(1, parseInt(c.req.query('side') || '1', 10) || 1);
  const offset = (side - 1) * PAGE_SIZE;

  const res = query.length >= 1 ? await searchOriginalWord(query, PAGE_SIZE, offset) : null;

  return c.html(
    <Layout
      title={query ? `Grunntekstsøk: ${query} — FLOGVIT.bibel` : 'Søk i originalspråk — FLOGVIT.bibel'}
      description="Søk i den hebraiske og greske grunnteksten."
      styles={['search.css']}
    >
      <div class="search-main">
        <div class="reading-container">
          <Breadcrumbs
            items={[
              { label: 'Hjem', href: '/' },
              { label: 'Søk', href: '/sok' },
              { label: 'Originalspråk' },
            ]}
          />
          <h1>Søk i originalspråk</h1>

          <form class="search-form" action="/sok/original" method="get" role="search">
            <input
              type="search"
              name="q"
              value={query}
              placeholder="Skriv et hebraisk eller gresk ord…"
              aria-label="Søk i grunnteksten"
              class="search-input"
            />
            <button type="submit" class="search-submit">Søk</button>
          </form>

          {query.length >= 1 && res && (
            <>
              <p class="search-count">
                {res.total === 0
                  ? `Ingen treff på «${query}».`
                  : `${res.total} treff (${res.language === 'hebrew' ? 'hebraisk' : 'gresk'}).`}
              </p>
              <div class="search-results">
                {res.results.map((v) => (
                  <a href={`/${toUrlSlug(v.book_short_name)}/${v.chapter}#v${v.verse}`} class="search-result">
                    <span class="search-result-ref">
                      {v.book_name_no} {v.chapter}:{v.verse}
                    </span>
                    <p class="search-result-text">{v.text}</p>
                    <p
                      class="search-result-original"
                      lang={res.language === 'hebrew' ? 'he' : 'el'}
                      dir={res.language === 'hebrew' ? 'rtl' : 'ltr'}
                    >
                      {v.original_text}
                    </p>
                  </a>
                ))}
              </div>
              <div class="search-pager">
                {side > 1 && (
                  <a href={`/sok/original?q=${encodeURIComponent(query)}&side=${side - 1}`} class="search-page-link">
                    ← Forrige
                  </a>
                )}
                {res.hasMore && (
                  <a href={`/sok/original?q=${encodeURIComponent(query)}&side=${side + 1}`} class="search-page-link">
                    Vis flere →
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>,
  );
});

export default r;
