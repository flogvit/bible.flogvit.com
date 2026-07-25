// Statiske sider: /om, /tilgjengelighet + 404-visningen (koblet i app.ts).
// Portert 1:1 fra bibel/src/pages/AboutPage.tsx og AccessibilityPage.tsx.
//
// UI-rammen og den forklarende prosaen er oversatt (dictionaries.ts). Siterte
// bibelvers i KVN-tabellen står uoversatt med vilje: det er innhold med sin
// egen språkakse (lib/lang.ts), ikke grensesnitt. Utgavenavn (OSNB2, OSNN1,
// Tanach, SBLGNT, KVN) er egennavn.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { layoutProps, makeT, tFor, type Locale } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

r.get('/om', (c) => {
  const t = tFor(c);
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('about.title')} — FLOGVIT.bible`} description={t('about.meta')} styles={['about.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: t('common.home'), href: '/' }, { label: t('about.title') }]} />

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
          </section>

          <section class="about-section">
            <h2>{t('about.translations')}</h2>

            <h3>{t('about.osnb2')}</h3>
            <p>{t('about.osnb2Body')}</p>

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
              <li><strong>{t('nav.knownVerses')}</strong> - {t('about.tool.knownVerses')}</li>
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
              {t('about.under')} <a href="/lister">{t('nav.verseLists')}</a> {t('about.verseListsBody')}
            </p>

            <h3>{t('nav.manuscripts')}</h3>
            <p>
              {t('about.under')} <a href="/manuskripter">{t('nav.manuscripts')}</a>{' '}
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
              {t('about.downloadAllBody')} <a href="/offline">{t('about.offlinePage')}</a>{' '}
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

r.get('/tilgjengelighet', (c) => {
  const t = tFor(c);
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('foot.a11y')} — FLOGVIT.bible`} description={t('a11y.meta')} styles={['about.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: t('common.home'), href: '/' }, { label: t('foot.a11y') }]} />

          <h1>{t('a11y.h1')}</h1>

          <section class="about-section">
            <h2>{t('a11y.about')}</h2>
            <p>{t('a11y.aboutBody')}</p>
          </section>

          <section class="about-section">
            <h2>{t('a11y.status')}</h2>
            <p>
              <strong>{t('a11y.conformance')}</strong> {t('a11y.partial')}
            </p>
            <p>{t('a11y.tested')}</p>
          </section>

          <section class="about-section">
            <h2>{t('a11y.limits')}</h2>
            <p>{t('a11y.limitsIntro')}</p>
            <ul>
              <li>{t('a11y.lim1')}</li>
              <li>{t('a11y.lim2')}</li>
              <li>{t('a11y.lim3')}</li>
            </ul>
            <p>{t('a11y.limitsOutro')}</p>
          </section>

          <section class="about-section">
            <h2>{t('a11y.whatWeDo')}</h2>
            <h3>{t('a11y.structure')}</h3>
            <ul>
              <li>{t('a11y.s1')}</li>
              <li>{t('a11y.s2')}</li>
              <li>{t('a11y.s3')}</li>
              <li>{t('a11y.s4')}</li>
              <li>{t('a11y.s5')}</li>
              <li>{t('a11y.s6')}</li>
              <li>{t('a11y.s7')}</li>
              <li>{t('a11y.s8')}</li>
            </ul>

            <h3>{t('a11y.visual')}</h3>
            <ul>
              <li>{t('a11y.v1')}</li>
              <li>{t('a11y.v2')}</li>
              <li>{t('a11y.v3')}</li>
              <li>{t('a11y.v4')}</li>
              <li>{t('a11y.v5')}</li>
              <li>{t('a11y.v6')}</li>
              <li>{t('a11y.v7')}</li>
              <li>{t('a11y.v8')}</li>
            </ul>

            <h3>{t('about.navigation')}</h3>
            <ul>
              <li>{t('a11y.n1')}</li>
              <li>{t('a11y.n2')}</li>
              <li>{t('a11y.n3')}</li>
              <li>{t('a11y.n4')}</li>
              <li>{t('a11y.n5')}</li>
            </ul>

            <h3>{t('a11y.keyboard')}</h3>
            <ul>
              <li>{t('a11y.k1')}</li>
              <li>{t('a11y.k2')}</li>
              <li>{t('a11y.k3')}</li>
              <li>{t('a11y.k4')}</li>
            </ul>

            <h3>{t('about.shortcuts')}</h3>
            <p>{t('about.pressKey1')} <kbd>?</kbd> {t('a11y.pressKey2')}</p>
            <ul>
              <li><kbd>?</kbd> - {t('a11y.scHelp')}</li>
              <li><kbd>/</kbd> {t('common.or')} <kbd>Ctrl</kbd>+<kbd>K</kbd> - {t('a11y.scSearch')}</li>
              <li><kbd>←</kbd> / <kbd>→</kbd> - {t('about.sc.prevNextChapter')}</li>
              <li><kbd>1-9</kbd> - {t('about.sc.jumpVerse')}</li>
              <li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> - {t('a11y.scHome')}</li>
            </ul>

            <h3>{t('a11y.forms')}</h3>
            <ul>
              <li>{t('a11y.f1')}</li>
              <li>{t('a11y.f2')}</li>
              <li>{t('a11y.f3')}</li>
            </ul>

            <h3>{t('a11y.testing')}</h3>
            <ul>
              <li>{t('a11y.t1')}</li>
              <li>{t('a11y.t2')}</li>
              <li>{t('a11y.t3')}</li>
            </ul>
          </section>

          <section class="about-section">
            <h2>{t('a11y.feedback')}</h2>
            <p>{t('a11y.feedbackBody')}</p>
            <p>
              <strong>{t('about.contact')}:</strong>
            </p>
            <p>
              {t('about.email')} <a href="mailto:support@flogvit.com">support@flogvit.com</a>
            </p>
            <p>
              {t('a11y.reportGitHub')}{' '}
              <a href="https://github.com/flogvit/free-bible/issues" target="_blank" rel="noopener noreferrer">
                github.com/flogvit/free-bible/issues
              </a>
            </p>
          </section>

          <section class="about-section">
            <h2>{t('a11y.authority')}</h2>
            <p>{t('a11y.authorityBody')}</p>
            <p>
              <a href="https://uutilsynet.no/" target="_blank" rel="noopener noreferrer">
                uutilsynet.no
              </a>
            </p>
          </section>

          <section class="about-section">
            <p>
              <em>{t('a11y.lastUpdated')}</em>
            </p>
          </section>
        </div>
      </div>
    </Layout>,
  );
});

/** 404-siden — koblet via app.notFound i app.ts. */
// Offline-fallback (#14): SW-en serverer denne siden for navigasjoner uten
// nett. offline-reader.js rendrer nedlastede kapitler fra IndexedDB basert på
// location.pathname (SW-en svarer med denne siden på original-URL-en).
r.get('/offline-fallback', (c) => {
  const t = tFor(c);
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('foot.offline')} — FLOGVIT.bible`} description={t('off.youAreOffline')} styles={['offline.css']} scripts={['offline-reader.js']}>
      <div class="offline-reader-main">
        <div class="reading-container">
          <div data-offline-reader>
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

export function NotFoundPage({ locale, path }: { locale: Locale; path: string }) {
  const t = makeT(locale);
  return (
    <Layout locale={locale} path={path} title={`${t('error.notFound')} — FLOGVIT.bible`}>
      <div class="reading-container" style="text-align: center; padding: 4rem 1rem;">
        <h1>404 – {t('error.notFound')}</h1>
        <p>{t('error.notFoundBody')}</p>
        <a href="/">{t('error.goHome')}</a>
      </div>
    </Layout>
  );
}

export default r;
