// Brukersider: favoritter, emner, notater, lister, leseplan, manuskripter,
// innstillinger, offline, oversettelser. All brukerdata bor klient-side i
// localStorage/IndexedDB (samme nøkler som gamle appen — se user.js), så disse
// er SSR-skall + øyer. Leseplan-LISTA og innstillingsskjemaet rendres server-
// side der data finnes sentralt; resten fylles av user.js.
//
// TODO(#12): koble user.js til sync-klienten (push/pull mot /api/sync).
// TODO(#14): offline-nedlasting + service worker.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import type { Child } from 'hono/jsx';
import { getSql } from '../../lib/db.ts';

const r = new Hono<AppEnv>();

// Felles skall for de localStorage-drevne sidene.
function UserPage(props: {
  title: string;
  crumb: string;
  heading: string;
  intro?: string;
  page: string;
  children?: Child;
  wide?: boolean;
}) {
  return (
    <Layout title={`${props.title} — FLOGVIT.bibel`} description={props.intro || props.heading} styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class={props.wide ? 'container' : 'reading-container'}>
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: props.crumb }]} />
          <h1>{props.heading}</h1>
          {props.intro && <p class="user-intro">{props.intro}</p>}
          <div data-user-page={props.page}>{props.children}</div>
        </div>
      </div>
    </Layout>
  );
}

// ---------- /favoritter ----------
r.get('/favoritter', (c) =>
  c.html(
    <UserPage title="Favoritter" crumb="Favoritter" heading="Favorittvers" page="favorites" intro="Dine merkede vers. Lagres i nettleseren og synkroniseres når du er innlogget.">
      <div class="user-list" data-list></div>
      <p class="user-empty" data-empty hidden>Du har ingen favoritter ennå. Klikk hjertet på et vers for å legge det til.</p>
    </UserPage>,
  ),
);

// ---------- /emner ----------
r.get('/emner', (c) =>
  c.html(
    <UserPage title="Emner" crumb="Emner" heading="Emner" page="topics" intro="Egne emner du har tagget vers, personer og annet innhold med.">
      <div class="user-list" data-list></div>
      <p class="user-empty" data-empty hidden>Du har ingen emner ennå. Tag innhold med «Emner»-knappen på vers- og innholdssider.</p>
    </UserPage>,
  ),
);

// ---------- /notater ----------
r.get('/notater', (c) =>
  c.html(
    <UserPage title="Notater" crumb="Notater" heading="Notater" page="notes" intro="Dine notater på vers.">
      <div class="user-list" data-list></div>
      <p class="user-empty" data-empty hidden>Du har ingen notater ennå.</p>
    </UserPage>,
  ),
);

// ---------- /lister ----------
r.get('/lister', (c) =>
  c.html(
    <UserPage title="Verslister" crumb="Verslister" heading="Verslister" page="verselists" intro="Samle vers i navngitte lister for manuskripter, bibeltimer og studier.">
      <form class="user-create" data-create-list>
        <input type="text" name="name" placeholder="Navn på ny liste…" aria-label="Navn på liste" class="user-input" />
        <button type="submit" class="user-btn">Opprett liste</button>
      </form>
      <div class="user-list" data-list></div>
      <p class="user-empty" data-empty hidden>Du har ingen verslister ennå.</p>
    </UserPage>,
  ),
);

// ---------- /leseplan ----------
r.get('/leseplan', async (c) => {
  const plans = (await getSql()`
    SELECT id, name, description, category, days FROM reading_plans ORDER BY days, seq
  `) as { id: string; name: string; description: string | null; category: string | null; days: number }[];

  return c.html(
    <Layout title="Leseplaner — FLOGVIT.bibel" description="Ulike planer for systematisk bibellesing." styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Leseplan' }]} />
          <h1>Leseplaner</h1>
          <p class="user-intro">
            Velg en plan for systematisk bibellesing. Fremdrift og rekke lagres i nettleseren og
            synkroniseres når du er innlogget.
          </p>
          <div data-user-page="readingplan">
            <div class="plan-grid">
              {plans.map((p) => (
                <div class="plan-card" data-plan-id={p.id} data-plan-days={p.days}>
                  <h2 class="plan-name">{p.name}</h2>
                  {p.description && <p class="plan-desc">{p.description}</p>}
                  <div class="plan-meta">
                    <span class="plan-days">{p.days} dager</span>
                    {p.category && <span class="plan-cat">{p.category}</span>}
                  </div>
                  <div class="plan-actions">
                    <button type="button" class="user-btn plan-activate" data-plan={p.id}>
                      Velg denne
                    </button>
                    <span class="plan-active-badge" hidden>Aktiv</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>,
  );
});

// ---------- /manuskripter ----------
r.get('/manuskripter', (c) =>
  c.html(
    <UserPage title="Manuskripter" crumb="Manuskripter" heading="Manuskripter" page="devotionals" intro="Andakter, prekener og bibeltimer med versreferanser." wide>
      <div class="user-toolbar">
        <a href="/manuskripter/ny" class="user-btn">Skriv nytt manuskript</a>
      </div>
      <div class="user-list" data-list></div>
      <p class="user-empty" data-empty hidden>Du har ingen manuskripter ennå.</p>
    </UserPage>,
  ),
);

// Editor (ny + rediger) — CodeMirror erstattet av textarea + markdown-preview i user.js.
function DevotionalEditor(props: { slug?: string }) {
  return (
    <Layout title="Rediger manuskript — FLOGVIT.bibel" description="Skriv andakt, preken eller bibeltime." styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Manuskripter', href: '/manuskripter' }, { label: props.slug ? 'Rediger' : 'Nytt' }]} />
          <div data-user-page="devotional-editor" data-slug={props.slug || ''}>
            <div class="editor-head">
              <input type="text" data-editor-title placeholder="Tittel…" class="user-input editor-title" aria-label="Tittel" />
              <div class="editor-actions">
                <button type="button" class="user-btn" data-editor-save>Lagre</button>
                <a href="/manuskripter" class="user-btn-ghost">Avbryt</a>
              </div>
            </div>
            <p class="editor-hint">
              Bruk <code>[ref:Joh 3,16]</code> for versreferanser. Markdown støttes (overskrifter,
              <b>fet</b>, <i>kursiv</i>, lister).
            </p>
            <div class="editor-split">
              <textarea data-editor-content class="editor-textarea" placeholder="Skriv her…" aria-label="Innhold"></textarea>
              <div class="editor-preview" data-editor-preview aria-live="polite"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
r.get('/manuskripter/ny', (c) => c.html(<DevotionalEditor />));
r.get('/manuskripter/:slug/rediger', (c) => c.html(<DevotionalEditor slug={c.req.param('slug')} />));
r.get('/manuskripter/:slug', (c) =>
  c.html(
    <Layout title="Manuskript — FLOGVIT.bibel" description="Manuskript." styles={['user.css']} scripts={['user.js']}>
      <div class="user-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: 'Hjem', href: '/' }, { label: 'Manuskripter', href: '/manuskripter' }, { label: '…' }]} />
          <div data-user-page="devotional-view" data-slug={c.req.param('slug')}>
            <article class="devotional-article" data-article></article>
            <p class="user-empty" data-empty hidden>Fant ikke manuskriptet.</p>
          </div>
        </div>
      </div>
    </Layout>,
  ),
);

// ---------- /innstillinger ----------
const TOGGLES: { key: string; label: string }[] = [
  { key: 'showBookSummary', label: 'Vis boksammendrag' },
  { key: 'showChapterSummary', label: 'Vis kapittelsammendrag' },
  { key: 'showChapterInsights', label: 'Vis kapittelinnsikter' },
  { key: 'showWord4Word', label: 'Vis ord-for-ord (grunntekst)' },
  { key: 'showOriginalText', label: 'Vis grunntekst under vers' },
  { key: 'showTimeline', label: 'Vis tidslinje i sidepanel' },
  { key: 'showDailyVerse', label: 'Vis dagens vers på forsiden' },
  { key: 'showReadingTexts', label: 'Vis dagens lesetekst på forsiden' },
  { key: 'showVerseFootnotes', label: 'Vis fotnoter' },
  { key: 'copyVerseNumbers', label: 'Ta med versnummer ved kopiering' },
];
r.get('/innstillinger', (c) =>
  c.html(
    <UserPage title="Innstillinger" crumb="Innstillinger" heading="Innstillinger" page="settings" intro="Lagres i nettleseren. Tema og språk styres fra FLOGVIT-menyen øverst.">
      <form data-settings-form class="settings-form">
        <fieldset class="settings-group">
          <legend>Tekst</legend>
          <label class="settings-row">
            <span>Skriftstørrelse</span>
            <select data-setting="fontSize" class="user-input">
              <option value="small">Liten</option>
              <option value="medium">Medium</option>
              <option value="large">Stor</option>
            </select>
          </label>
          <label class="settings-row">
            <span>Bibeloversettelse</span>
            <select data-setting="bible" class="user-input">
              <option value="osnb2">Bokmål</option>
              <option value="osnn1">Nynorsk</option>
            </select>
          </label>
        </fieldset>
        <fieldset class="settings-group">
          <legend>Visning</legend>
          {TOGGLES.map((t) => (
            <label class="settings-toggle">
              <input type="checkbox" data-setting={t.key} />
              <span>{t.label}</span>
            </label>
          ))}
        </fieldset>
      </form>
    </UserPage>,
  ),
);

// ---------- /offline ----------
r.get('/offline', (c) =>
  c.html(
    <UserPage title="Offline" crumb="Offline" heading="Offline-tilgang" page="offline" intro="Last ned bibeltekst for lesing uten internett.">
      <div data-offline-status class="offline-status">
        <p>Sjekker lagringsstatus…</p>
      </div>
      {/* TODO(#14): service worker + full nedlasting av bibelversjoner til IndexedDB. */}
      <p class="user-note">
        Nedlasting av hele bibelversjoner kommer i en oppdatering. Kapitler du leser mens du er på
        nett blir tilgjengelige i nettleserens buffer.
      </p>
    </UserPage>,
  ),
);

// ---------- /oversettelser ----------
r.get('/oversettelser', (c) =>
  c.html(
    <UserPage title="Oversettelser" crumb="Oversettelser" heading="Oversettelser" page="translations" intro="Innebygde oversettelser og dine egne opplastede bibler.">
      <section class="trans-section">
        <h2>Innebygde</h2>
        <ul class="trans-builtin">
          <li>Bokmål (osnb2)</li>
          <li>Nynorsk (osnn1)</li>
          <li>Hebraisk grunntekst (Tanach)</li>
          <li>Gresk grunntekst (SBLGNT)</li>
        </ul>
      </section>
      <section class="trans-section">
        <h2>Dine oversettelser</h2>
        <div class="user-list" data-list></div>
        <p class="user-empty" data-empty hidden>Du har ikke lastet opp egne oversettelser ennå.</p>
        {/* TODO(#12/#14): opplasting + parsing (bibleTextParser) + lagring til
            IndexedDB/sync. Skallet lister eksisterende brukerbibler fra sync. */}
        <p class="user-note">Opplasting av egne oversettelser kommer i en oppdatering.</p>
      </section>
    </UserPage>,
  ),
);

export default r;
