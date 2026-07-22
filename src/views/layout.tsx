// App-skall for FLOGVIT.bible — hono/jsx, server-rendret, progressiv
// forbedring (nedtrekk og mobilmeny er <details> og virker uten JS; chrome.js
// legger på lukk-ved-klikk-utenfor og temabryteren).
//
// Identitet: familie-chromen (wordmark, familiemeny, lær-aksent, Grotesk/Plex)
// per portal/STYLE.md 2026-07-17 — den vinner over redesignets mai-identitet
// (gull/Inter Tight). Redesignet (bibel/src/components/Header.tsx) er fasit for
// STRUKTUREN: hurtigsøk-trigger, Mitt/Studier/Oversikt, tema- og
// innstillinger-knapp. Source Serif 4 beholdes som langlesningstypografi
// (STYLE.md tillater det for langlesnings-produkter).

import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';

const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap';

// FLOGVIT familie-prefs (portal/PREFS.md). Blokkerende inline-lesing av
// `fv-prefs`-cookien så <html lang> + data-fv-theme settes FØR første paint —
// ingen flash. Holdes ordrett lik PREFS.md.
const PREFS_READ_SNIPPET = `<script>
  try {
    var m = document.cookie.match(/(?:^|;\\s*)fv-prefs=([^;]+)/);
    var p = m ? JSON.parse(decodeURIComponent(m[1])) : {};
    var d = document.documentElement;
    if (p.lang) d.lang = p.lang;
    if (p.theme === 'light' || p.theme === 'dark') d.dataset.fvTheme = p.theme;
  } catch (e) {}
</script>`;

// Produktvelgeren (portal-mønsteret, som photosuite). dot-klassene bærer
// produktaksenten i menypanelet.
const PRODUCTS: { prod: string; dot: string; href?: string; current?: boolean }[] = [
  { prod: 'puzzles', dot: 'dotPuzzles', href: 'https://puzzles.flogvit.com/' },
  { prod: 'photosuite', dot: 'dotPhotosuite', href: 'https://photosuite.flogvit.com/' },
  { prod: 'image', dot: 'dotImage', href: 'https://image.flogvit.com/' },
  { prod: 'photo', dot: 'dotFoto' },
  { prod: 'lab', dot: 'dotLab', href: 'https://lab.flogvit.com/' },
  { prod: 'books', dot: 'dotBooks', href: 'https://books.flogvit.com/' },
  { prod: 'bible', dot: 'dotBibel', href: '/', current: true },
];

function FlogvitMenu() {
  return (
    <span class="wordmark">
      <details class="fvmenu">
        <summary class="fvmenu-summary" aria-label="FLOGVIT — alle produkter">
          FLOGVIT
          <svg class="fvmenu-caret" viewBox="0 0 8 6" width="8" height="6" aria-hidden="true">
            <path
              d="M1 1.5l3 3 3-3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </summary>
        <nav class="fvmenu-panel" aria-label="FLOGVIT — alle produkter">
          <a class="fvmenu-item" href="https://flogvit.com/">
            <span class="fvmenu-wm">
              <span class="fvmenu-b">FLOGVIT</span>
              <span class="fvmenu-dot">.</span>
            </span>
          </a>
          {PRODUCTS.map((p) => {
            const wm = (
              <span class="fvmenu-wm">
                <span class="fvmenu-b">FLOGVIT</span>
                <span class={`fvmenu-dot ${p.dot}`}>.</span>
                <span class="fvmenu-prod">{p.prod}</span>
              </span>
            );
            if (!p.href) {
              return (
                <span class="fvmenu-item soon">
                  {wm}
                  <span class="fvmenu-chip">snart</span>
                </span>
              );
            }
            return (
              <a class="fvmenu-item" href={p.href} aria-current={p.current ? 'true' : undefined}>
                {wm}
              </a>
            );
          })}
          {/* Uniform familie-oppføring (portal/STYLE.md): globale innstillinger
              — konto, språk — nås fra samme plass i alle produktene. */}
          <a class="fvmenu-item fvmenu-kontoitem" href="https://flogvit.com/konto/">
            Konto og innstillinger
          </a>
        </nav>
        {/* Familie-tema (portal/PREFS.md). chrome.js speiler verdien og
            persisterer endringer til cookie + konto. Språk og kontoadmin bor
            i de globale innstillingene på flogvit.com/konto/. */}
        <div class="fvmenu-prefs">
          <span class="fvmenu-prefs-label">Tema</span>
          <span class="fvmenu-seg" id="fv-theme" role="group" aria-label="Tema">
            <button type="button" class="fvmenu-segBtn" data-theme="system" aria-pressed="false">
              System
            </button>
            <button type="button" class="fvmenu-segBtn" data-theme="light" aria-pressed="false">
              Lys
            </button>
            <button type="button" class="fvmenu-segBtn" data-theme="dark" aria-pressed="false">
              Mørk
            </button>
          </span>
        </div>
      </details>
      <a class="fvmenu-product" href="/" aria-label="FLOGVIT.bible – til forsiden">
        <span class="fvmenu-productDot">.</span>bible
      </a>
    </span>
  );
}

// Navstrukturen fra redesignets Header.tsx — samme grupper, lenker og URL-er.
const NAV_GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: 'Mitt',
    links: [
      { href: '/favoritter', label: 'Favoritter' },
      { href: '/emner', label: 'Emner' },
      { href: '/notater', label: 'Notater' },
      { href: '/lister', label: 'Verslister' },
      { href: '/leseplan', label: 'Leseplan' },
      { href: '/manuskripter', label: 'Manuskripter' },
    ],
  },
  {
    label: 'Studier',
    links: [
      { href: '/kjente-vers', label: 'Kjente vers' },
      { href: '/temaer', label: 'Temaer' },
      { href: '/historier', label: 'Bibelhistorier' },
      { href: '/profetier', label: 'Profetier' },
      { href: '/paralleller', label: 'Paralleller' },
      { href: '/personer', label: 'Personer' },
      { href: '/tall', label: 'Tall' },
    ],
  },
  {
    label: 'Oversikt',
    links: [
      { href: '/tidslinje', label: 'Tidslinje' },
      { href: '/dager', label: 'Dager' },
      { href: '/lesetekster', label: 'Lesetekster' },
      { href: '/statistikk', label: 'Statistikk' },
      { href: '/oversettelser', label: 'Oversettelser' },
    ],
  },
];

function Header() {
  return (
    <header class="site-header">
      <div class="site-header-inner">
        <FlogvitMenu />

        {/* Hurtigsøk — åpner CommandPalette (øy, ISSUES.md #11). Uten JS
            faller den tilbake til søkesiden. */}
        <form class="cmdk-form" action="/sok" method="get">
          <button type="submit" class="cmdk-trigger" id="cmdk-trigger" aria-label="Åpne hurtigsøk">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span class="cmdk-label">Søk vers, person, tema…</span>
            <kbd class="cmdk-kbd" id="cmdk-kbd">
              Ctrl K
            </kbd>
          </button>
        </form>

        <nav class="site-nav" aria-label="Hovednavigasjon">
          {NAV_GROUPS.map((g) => (
            <details class="nav-dd">
              <summary class="nav-link nav-dd-trigger">
                {g.label}
                <span class="nav-dd-arrow" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div class="nav-dd-menu">
                {g.links.map((l) => (
                  <a href={l.href} class="nav-dd-link">
                    {l.label}
                  </a>
                ))}
              </div>
            </details>
          ))}
        </nav>

        <button
          type="button"
          class="icon-btn"
          id="theme-toggle"
          aria-label="Bytt mellom lys og mørk modus"
          title="Lys/mørk modus"
        >
          <svg
            class="theme-icon-sun"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </svg>
          <svg
            class="theme-icon-moon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>

        <a href="/innstillinger" class="icon-btn" aria-label="Innstillinger" title="Innstillinger">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.3l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </a>

        {/* Mobilmeny: <details> så den virker uten JS. */}
        <details class="mobile-menu">
          <summary class="icon-btn mobile-menu-btn" aria-label="Meny">
            <span class="hamburger" aria-hidden="true" />
          </summary>
          <nav class="mobile-panel" aria-label="Hovednavigasjon">
            {NAV_GROUPS.map((g) => (
              <div class="mobile-group">
                <span class="mobile-group-title">{g.label}</span>
                {g.links.map((l) => (
                  <a href={l.href} class="mobile-link">
                    {l.label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer class="site-footer">
      <div class="site-footer-inner">
        <span class="fv-wordmark">
          <a class="fv-brand" href="https://flogvit.com" aria-label="FLOGVIT – alle produkter">
            FLOGVIT
          </a>
          <a class="fv-product" href="/" aria-label="FLOGVIT.bible – til forsiden">
            <span class="fv-dot">.</span>bible
          </a>
        </span>
        <nav class="site-footer-nav" aria-label="Bunnmeny">
          <a href="/">Forside</a>
          <a href="/om">Om siden</a>
          <a href="/om#hjelp">Hjelp</a>
          <a href="/innstillinger">Innstillinger</a>
          <a href="/konto">Konto</a>
          <a href="/offline">Offline</a>
          <a href="/tilgjengelighet">Tilgjengelighet</a>
        </nav>
        <p class="site-footer-note">© {new Date().getFullYear()} FLOGVIT</p>
      </div>
    </footer>
  );
}

export interface LayoutProps {
  title: string;
  description?: string;
  children?: Child;
  /** Ekstra JS-øyer som lastes (stier under /js/). chrome.js lastes alltid. */
  scripts?: string[];
  /** Ekstra side-CSS (stier under /css/). styles.css lastes alltid. */
  styles?: string[];
  /** Absolutt kanonisk URL for siden (SEO). */
  canonical?: string;
}

/** Fullt HTML-dokument med familie-chromen. */
export function Layout(props: LayoutProps) {
  const desc = props.description ?? 'Bibelen på nett — les, studér og søk i grunnteksten.';
  return (
    <>
      {raw('<!DOCTYPE html>')}
      <html lang="nb">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {raw(PREFS_READ_SNIPPET)}
          <title>{props.title}</title>
          <meta name="description" content={desc} />
          <meta name="author" content="Vegard Hanssen" />
          {props.canonical && <link rel="canonical" href={props.canonical} />}
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#7a4a21" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
          <link rel="stylesheet" href={GOOGLE_FONTS} />
          <link rel="stylesheet" href="/styles.css" />
          <link rel="stylesheet" href="/css/shortcuts.css" />
          <link rel="stylesheet" href="/css/cmdk.css" />
          {(props.styles ?? []).map((s) => (
            <link rel="stylesheet" href={`/css/${s}`} />
          ))}
        </head>
        <body>
          <a class="skip-link" href="#innhold">
            Hopp til innhold
          </a>
          <Header />
          <main id="innhold" class="site-main">
            {props.children}
          </main>
          <Footer />
          <script type="module" src="/js/chrome.js" />
          <script type="module" src="/js/shortcuts.js" />
          <script type="module" src="/js/plus.js" />
          <script type="module" src="/js/sync.js" />
          <script type="module" src="/js/cmdk.js" />
          <script type="module" src="/js/pwa.js" />
          {(props.scripts ?? []).map((s) => (
            <script type="module" src={`/js/${s}`} />
          ))}
        </body>
      </html>
    </>
  );
}
