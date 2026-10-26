// Statiske sider: /om, /tilgjengelighet + 404-visningen (koblet i app.ts).
// Portert 1:1 fra bibel/src/pages/AboutPage.tsx og AccessibilityPage.tsx.
//
// UI-rammen og den forklarende prosaen er oversatt (dictionaries.ts). Siterte
// bibelvers i KVN-tabellen står uoversatt med vilje: det er innhold med sin
// egen språkakse (lib/lang.ts), ikke grensesnitt. Utgavenavn (OSNB, OSNN,
// Tanach, SBLGNT, KVN) er egennavn.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { layoutProps, makeT, tFor, type Locale, lhref } from '../../lib/i18n.ts';
import { booksData, bookName, bookAbbr } from '../../lib/books-data.ts';
import { getOriginalLanguage, offlineEditions } from '../../lib/bible.ts';
import { toUrlSlug } from '../../lib/url-utils.ts';
import { MCP_URL } from '../../lib/mcp-info.ts';
import { raw } from 'hono/html';
import { STI, beskrivelse, lenketekst, side, tittel } from '../../lib/tilgjengelighet.ts';
import { ERKLAERING } from '../../lib/tilgjengelighet-erklaering.ts';

const r = new Hono<AppEnv>();

r.get('/om', (c) => {
  const t = tFor(c);
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('about.title')} — FLOGVIT.bible`} description={t('about.meta')} styles={['about.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: t('about.title') }]} />

          <h1>{t('about.h1')}</h1>

          <section class="about-section">
            <h2>{t('about.project')}</h2>
            <p>{t('about.projectBody')}</p>
            <p>
              <a href="https://github.com/flogvit/bible.flogvit.com" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/bible.flogvit.com
              </a>{' '}
              &ndash; {t('about.repoSite')}
            </p>
            <p>
              <a href="https://github.com/flogvit/free-bible/" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/free-bible
              </a>{' '}
              &ndash; {t('about.repoData')}
            </p>
            {/* Referansen (#114) hører her, sammen med kildekoden og dataene:
                den er den TREDJE måten å ta med seg det som står på sida. Uten
                en lenke er den bare oppdagbar for den som gjetter adressen —
                og en referanse ingen finner, er den samme feilen én etasje
                ned. Uprefikset med vilje: `/api/` er ett dokument på engelsk
                utenfor språkprefiksene (samme unntak som `lhref` har). */}
            <p>
              <a href="/api/docs">bible.flogvit.com/api/docs</a> &ndash; {t('about.apiDocs')}
            </p>
            {/* MCP-serveren (#127): den fjerde veien, for den som spør en
                KI-assistent framfor å lese sida. Adressen står som kode fordi
                den skal LIMES INN i Claude eller ChatGPT, ikke klikkes; lenken
                går til veiledningen på /mcp (#157), med oppsett per klient. */}
            <p>
              <a href={lhref('/mcp')}>
                <code>{MCP_URL}</code>
              </a>{' '}
              &ndash; {t('about.mcp')}
            </p>
          </section>

          <section class="about-section">
            <h2>{t('about.translations')}</h2>

            <h3>{t('about.osnb')}</h3>
            <p>{t('about.osnbBody')}</p>

            <h3>{t('about.tanach')}</h3>
            <p>{t('about.tanachBody')}</p>
            <p>
              <a href="https://tanach.us" target="_blank" rel="noopener noreferrer">
                Tanach.us
              </a>
            </p>

            <h3>{t('about.sblgnt')}</h3>
            <p>{t('about.sblgntBody')}</p>
            <p>
              <a href="https://sblgnt.com/" target="_blank" rel="noopener noreferrer">
                sblgnt.com
              </a>
            </p>
            <p>
              <a href="https://github.com/morphgnt/sblgnt" target="_blank" rel="noopener noreferrer">
                {t('about.sblgntGitHub')}
              </a>
            </p>
          </section>

          <section class="about-section">
            <h2>{t('about.kvn')}</h2>
            <p>{t('about.kvnBody1')}</p>
            <p>{t('about.kvnExample')}</p>
            {/* Tekstkolonnen er sitert bibeltekst — egen språkakse, oversettes ikke her. */}
            {/* Wrapperen gir tabellen sin EGEN sidelengs scroll (#50) — samme
                mønster som .stat-table-wrap. En tabell med tre kolonner kan
                ikke krympe under et visst punkt, og uten wrapperen er det HELE
                siden som blir bred i stedet for tabellen. */}
            <div class="about-verse-table-wrap">
              <table class="about-verse-table">
                <thead>
                  <tr>
                    <th>{t('about.kvnColA')}</th>
                    <th>{t('about.kvnColB')}</th>
                    <th>{t('about.kvnColText')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1 Mos 31,55</td>
                    <td>1 Mos 32,1</td>
                    <td lang="nb">Tidlig neste morgen kysset Laban...</td>
                  </tr>
                  <tr>
                    <td>1 Mos 32,1</td>
                    <td>1 Mos 32,2</td>
                    <td lang="nb">Jakob fortsatte på sin vei...</td>
                  </tr>
                  <tr>
                    <td>1 Mos 32,2</td>
                    <td>1 Mos 32,3</td>
                    <td lang="nb">Da Jakob så dem, sa han...</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>{t('about.kvnBody2')}</p>
            <p>
              {t('about.kvnBody3a')} <strong>KVN</strong> {t('about.kvnBody3b')}
            </p>
            <p>
              {t('about.kvnSupports')}{' '}
              <a href="https://github.com/flogvit/free-bible/tree/main/kvn" target="_blank" rel="noopener noreferrer">
                {t('about.kvnSystems')}
              </a>
              {t('about.kvnIncluding')}
            </p>
          </section>

          <section class="about-section">
            <h2>{t('rd.aids')}</h2>
            <h3>{t('about.studyTools')}</h3>
            <ul>
              <li><strong>{t('u.originalText')}</strong> - {t('about.tool.originalText')}</li>
              <li><strong>{t('common.references')}</strong> - {t('about.tool.refs')}</li>
              <li><strong>{t('about.lbl.bookSummary')}</strong> - {t('about.tool.bookSummary')}</li>
              <li><strong>{t('about.lbl.chapterSummary')}</strong> - {t('about.tool.chapterSummary')}</li>
              <li><strong>{t('rd.keyWords')}</strong> - {t('about.tool.keyWords')}</li>
              <li><strong>{t('nav.stories')}</strong> - {t('about.tool.stories')}</li>
              <li><strong>{t('nav.themes')}</strong> - {t('about.tool.themes')}</li>
              <li><strong>{t('nav.prophecies')}</strong> - {t('about.tool.prophecies')}</li>
              <li><strong>{t('nav.parallels')}</strong> - {t('about.tool.parallels')}</li>
              <li><strong>{t('nav.persons')}</strong> - {t('about.tool.persons')}</li>
              <li><strong>{t('nav.numbers')}</strong> - {t('about.tool.numbers')}</li>
              <li><strong>{t('nav.days')}</strong> - {t('about.tool.days')}</li>
              <li><strong>{t('nav.timeline')}</strong> - {t('about.tool.timeline')}</li>
            </ul>

            <h3>{t('about.personalTools')}</h3>
            <p>
              {t('about.rememberBody')}{' '}
              <a href="https://flogvit.com/plus/">FLOGVIT.plus</a>.
            </p>
            <ul>
              <li><strong>{t('nav.favorites')}</strong> - {t('about.pt.favorites')}</li>
              <li><strong>{t('nav.topicsMine')}</strong> - {t('about.pt.topics')}</li>
              <li><strong>{t('nav.notes')}</strong> - {t('about.pt.notes')}</li>
              <li><strong>{t('nav.verseLists')}</strong> - {t('about.pt.verseLists')}</li>
              <li><strong>{t('home.readingPlans')}</strong> - {t('about.pt.readingPlans')}</li>
              <li><strong>{t('nav.manuscripts')}</strong> - {t('about.pt.manuscripts')}</li>
              <li><strong>{t('nav.translations')}</strong> - {t('about.pt.translations')}</li>
              <li><strong>{t('nav.statistics')}</strong> - {t('about.pt.statistics')}</li>
            </ul>
          </section>

          <section id="hjelp" class="about-section">
            <h2>{t('about.help')}</h2>
            <p>{t('about.helpIntro')}</p>

            <h3>{t('about.navigation')}</h3>
            <ul>
              <li>{t('about.nav1')}</li>
              <li>{t('about.nav2a')} <em>&quot;Joh 3:16&quot;</em> {t('about.nav2b')}</li>
              <li>{t('about.nav3')}</li>
            </ul>

            <h3>{t('about.shortcuts')}</h3>
            <p>{t('about.pressKey1')} <kbd>?</kbd> {t('about.pressKey2')}</p>
            <ul>
              <li><kbd>/</kbd> {t('common.or')} <kbd>Ctrl</kbd>+<kbd>K</kbd> - {t('about.sc.focusSearch')}</li>
              <li><kbd>R</kbd> - {t('about.sc.readingMode')}</li>
              <li><kbd>←</kbd> / <kbd>→</kbd> - {t('about.sc.prevNextChapter')}</li>
              <li><kbd>1-9</kbd> - {t('about.sc.jumpVerse')}</li>
              <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+{t('about.sc.letter')} - {t('about.sc.quickNav')}</li>
            </ul>

            <h3>{t('about.verseInteraction')}</h3>
            <p>{t('about.verseClickBody')}</p>
            <ul>
              <li><strong>{t('u.originalText')}</strong> - {t('about.vi.originalText')}</li>
              <li><strong>{t('common.references')}</strong> - {t('about.vi.refs')}</li>
              <li><strong>{t('nav.prophecies')}</strong> - {t('about.vi.prophecies')}</li>
              <li><strong>{t('nav.topicsMine')}</strong> - {t('about.vi.topics')}</li>
              <li><strong>{t('nav.notes')}</strong> - {t('about.vi.notes')}</li>
              <li><strong>{t('about.lbl.versions')}</strong> - {t('about.vi.versions')}</li>
            </ul>

            <h3>{t('nav.verseLists')}</h3>
            <p>
              {t('about.under')} <a href={lhref('/lister')}>{t('nav.verseLists')}</a> {t('about.verseListsBody')}
            </p>

            <h3>{t('nav.manuscripts')}</h3>
            <p>
              {t('about.under')} <a href={lhref('/manuskripter')}>{t('nav.manuscripts')}</a>{' '}
              {t('about.manuscriptsBody1')} <code>[ref:Joh 3,16]</code> {t('about.manuscriptsBody2')}
            </p>
            <ul>
              <li><strong>{t('home.bible')}</strong> - {t('about.ms.bible')}</li>
              <li><strong>{t('nav.manuscripts')}</strong> - {t('about.ms.manuscripts')}</li>
              <li><strong>{t('about.lbl.context')}</strong> - {t('about.ms.context')}</li>
              <li><strong>{t('nav.timeline')}</strong> - {t('about.ms.timeline')}</li>
            </ul>

            <h3>{t('about.aidsPanel')}</h3>
            <p>{t('about.aidsPanelBody')}</p>
          </section>

          <section id="offline" class="about-section">
            <h2>{t('about.offline')}</h2>
            <p>{t('about.offlineBody')}</p>

            <h3>{t('about.autoSave')}</h3>
            <p>{t('about.autoSaveBody')}</p>

            <h3>{t('about.downloadAll')}</h3>
            <p>
              {t('about.downloadAllBody')} <a href={lhref('/offline')}>{t('about.offlinePage')}</a>{' '}
              {t('about.downloadAllBody2')}
            </p>
            <ul>
              <li>{t('about.dl1')}</li>
              <li>{t('about.dl2')}</li>
              <li>{t('about.dl3')}</li>
              <li>{t('about.dl4')}</li>
            </ul>

            <h3>{t('about.updates')}</h3>
            <p>{t('about.updatesBody')}</p>
          </section>

          <section class="about-section">
            <h2>{t('about.contact')}</h2>
            <p>FLOGVIT</p>
            <p>
              {t('about.email')} <a href="mailto:support@flogvit.com">support@flogvit.com</a>
            </p>
            <p>
              {t('about.reportGitHub')}{' '}
              <a href="https://github.com/flogvit/free-bible/issues" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/free-bible/issues
              </a>
            </p>
          </section>
        </div>
      </div>
    </Layout>,
  );
});

// Tilgjengelighetserklæringen (#163, flogvit-com#341). Siden er FELLESSIDEN
// (`lib/tilgjengelighet.ts`, en kopi av portalens fil) — samme tekst på alle
// FLOGVIT-flatene, på åtte språk, etter EU-malen uutilsynet bygger på. Det som
// er bibels eget, er dataene i `lib/tilgjengelighet-erklaering.ts`: status,
// datoer og kjente brudd. Den gamle håndskrevne erklæringen sa «WCAG 2.2 AA» i
// metabeskrivelsen og «2.1» i teksten, og datoene var fritekst ingen test
// kunne holde den til.
r.get(STI, (c) => {
  const lp = layoutProps(c);
  const locale = lp.locale;
  return c.html(
    <Layout {...lp} title={`${tittel(locale)} — FLOGVIT.bible`} description={beskrivelse(locale, ERKLAERING)} styles={['about.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: lenketekst(locale) }]} />
          <div class="about-section">{raw(side(locale, ERKLAERING))}</div>
        </div>
      </div>
    </Layout>,
  );
});

// Offline-fallback (#14): SW-en serverer denne siden for navigasjoner uten
// nett. offline-reader.js rendrer nedlastede kapitler fra IndexedDB basert på
// location.pathname (SW-en svarer med denne siden på original-URL-en).
//
// Siden caches PER SPRÅK (`/<lang>/offline-fallback`, #136): den uprefiksede
// formen svarer 302, og en omdirigert respons kan ikke besvare en navigasjon —
// det var hele grunnen til at et ubesøkt kapittel ga Chromes feilside. Fordi
// den caches per språk, kan den også bære det leseren trenger og som IndexedDB
// ikke har: boknavnene på sidens språk (og slugen som skiller dem) og utgavene
// i språkets rekkefølge. Lesesidens stilark er med, så kapittelet tegnes i
// samme form som på nett.
r.get('/offline-fallback', async (c) => {
  const t = tFor(c);
  const books = booksData.map((b) => ({
    id: b.id,
    slug: toUrlSlug(b.short_name),
    name: bookName(b),
    abbr: bookAbbr(b),
    chapters: b.chapters,
    // Grunntekstens språk: hebraisk (høyre-til-venstre) eller gresk.
    hebrew: getOriginalLanguage(b.id) === 'hebrew',
  }));
  const editions = await offlineEditions();
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('foot.offline')} — FLOGVIT.bible`} description={t('off.youAreOffline')} styles={['reading.css', 'studium.css', 'offline.css']} scripts={['offline-reader.js']}>
      <div class="offline-reader-main">
        <div class="reading-container">
          <div
            data-offline-reader
            data-books={JSON.stringify(books)}
            data-editions={JSON.stringify(editions)}
          >
            <h1>{t('off.youAreOffline')}</h1>
            <p class="user-note">{t('off.body')}</p>
            <noscript>
              <p>{t('off.needsJs')}</p>
            </noscript>
          </div>
        </div>
      </div>
    </Layout>,
  );
});

/**
 * 410-siden: adressen var vår, og vi har tatt den bort (#58).
 *
 * Den finnes fordi 404 er feil svar for en side som har stått i navigasjonen og
 * i sitemapen i månedsvis: leseren som kommer fra et bokmerke skal få vite at
 * dette er en beslutning, ikke en midlertidig feil, og søkemotoren skal ta
 * adressen ut framfor å prøve igjen.
 *
 * Ingen `noindex`: statuskoden er allerede det sterkeste direktivet vi har, og
 * 404-siden gjør det samme. To signaler om det samme ville vært pynt.
 */
export function GonePage({ locale, path }: { locale: Locale; path: string }) {
  const t = makeT(locale);
  return (
    <Layout locale={locale} path={path} title={`${t('error.gone')} — FLOGVIT.bible`}>
      <div class="reading-container notfound-page">
        <h1>{t('error.gone')}</h1>
        <p>{t('error.goneBody')}</p>
        <a href={lhref('/')}>{t('error.goHome')}</a>
      </div>
    </Layout>
  );
}

/** 404-siden — koblet via app.notFound i app.ts. */
export function NotFoundPage({ locale, path }: { locale: Locale; path: string }) {
  const t = makeT(locale);
  return (
    <Layout locale={locale} path={path} title={`${t('error.notFound')} — FLOGVIT.bible`}>
      <div class="reading-container notfound-page">
        <h1>404 – {t('error.notFound')}</h1>
        <p>{t('error.notFoundBody')}</p>
        <a href={lhref('/')}>{t('error.goHome')}</a>
      </div>
    </Layout>
  );
}

export default r;
