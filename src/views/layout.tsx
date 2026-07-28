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
import { getContext } from 'hono/context-storage';
import type { AppEnv } from '../lib/session.ts';
import { ACCOUNT_URL } from '../lib/session.ts';
import { DEFAULT_LOCALE, LOCALES, href, makeT, ogLocale, type Locale, type Translator } from '../lib/i18n.ts';

const SITE = 'https://bible.flogvit.com';

/**
 * Full hreflang-klynge (I18N.md §3): de åtte URL-ene er samme side på ulike
 * språk, ikke duplikater. x-default peker på basespråket.
 */
function HrefLang({ path }: { path: string }) {
  return (
    <>
      {LOCALES.map((l) => (
        <link rel="alternate" hreflang={l} href={SITE + href(l, path)} />
      ))}
      <link rel="alternate" hreflang="x-default" href={SITE + href(DEFAULT_LOCALE, path)} />
    </>
  );
}

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

function FlogvitMenu({ t }: { t: Translator }) {
  return (
    <span class="wordmark">
      <details class="fvmenu">
        <summary class="fvmenu-summary" aria-label={t('chrome.menuAria')}>
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
        <nav class="fvmenu-panel" aria-label={t('chrome.menuAria')}>
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
            {t('chrome.accountItem')}
          </a>
        </nav>
        {/* Tema (og øvrige prefs) bor på innstillinger-siden — FLOGVIT-menyen
            er kun for produktbytte (portal/SETTINGS.md). */}
      </details>
      <a class="fvmenu-product" href="/" aria-label={t('chrome.homeAria')}>
        <span class="fvmenu-productDot">.</span>bible
      </a>
    </span>
  );
}

// Navstrukturen fra redesignets Header.tsx — samme grupper, lenker og URL-er.
const navGroups = (t: Translator): { label: string; links: { href: string; label: string }[] }[] => [
  {
    label: t('nav.mine'),
    links: [
      { href: '/favoritter', label: t('nav.favorites') },
      { href: '/emner', label: t('nav.topicsMine') },
      { href: '/notater', label: t('nav.notes') },
      { href: '/lister', label: t('nav.verseLists') },
      { href: '/leseplan', label: t('nav.readingPlan') },
      { href: '/lesekart', label: t('nav.readingMap') },
      { href: '/manuskripter', label: t('nav.manuscripts') },
      { href: '/mine-bidrag', label: t('contrib.mine') },
    ],
  },
  {
    label: t('nav.studies'),
    links: [
      { href: '/kjente-vers', label: t('nav.knownVerses') },
      { href: '/temaer', label: t('nav.themes') },
      { href: '/historier', label: t('nav.stories') },
      { href: '/profetier', label: t('nav.prophecies') },
      { href: '/paralleller', label: t('nav.parallels') },
      { href: '/personer', label: t('nav.persons') },
      { href: '/tall', label: t('nav.numbers') },
    ],
  },
  {
    label: t('nav.overview'),
    links: [
      { href: '/tidslinje', label: t('nav.timeline') },
      { href: '/dager', label: t('nav.days') },
      { href: '/lesetekster', label: t('nav.readingTexts') },
      { href: '/statistikk', label: t('nav.statistics') },
      { href: '/oversettelser', label: t('nav.translations') },
    ],
  },
];

// Konto-chip (portal/SETTINGS.md): obligatorisk, server-synlig innloggings-
// inngang rett før tannhjulet. Bibel kjenner sesjonen server-side (fv-session
// via konto), så innlogget tilstand rendres direkte — ingen «hidden-til-JS».
// Utlogget: «Logg inn». Innlogget: visningsnavn/e-post (+ plus-merke).
function AccountChip({ t }: { t: Translator }) {
  // Request-konteksten hentes fra AsyncLocalStorage (contextStorage-middleware
  // i app.ts), så vi slipper å tre user gjennom hvert Layout-kall.
  let user: AppEnv['Variables']['user'] = null;
  try {
    user = getContext<AppEnv>().var.user;
  } catch {
    user = null; // rendret utenfor request-kontekst (f.eks. test) → utlogget
  }
  if (!user) {
    return (
      <a class="account-chip" href={ACCOUNT_URL} aria-label={t('chrome.login')}>
        {t('chrome.login')}
      </a>
    );
  }
  const name = user.displayName || user.email;
  return (
    <a
      class="account-chip account-chip-in"
      href={ACCOUNT_URL}
      aria-label={`Konto: ${name}`}
      title={user.email}
    >
      <span class="account-chip-name">{name}</span>
      {user.plus && <span class="account-chip-plus">plus</span>}
    </a>
  );
}

function Header({ t, u }: { t: Translator; u: (p: string) => string }) {
  return (
    <header class="site-header">
      <div class="site-header-inner">
        <FlogvitMenu t={t} />

        {/* Hurtigsøk — åpner CommandPalette (øy, ISSUES.md #11). Uten JS
            faller den tilbake til søkesiden. */}
        <form class="cmdk-form" action="/sok" method="get">
          <button type="submit" class="cmdk-trigger" id="cmdk-trigger" aria-label={t('chrome.quickSearch')}>
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
            <span class="cmdk-label">{t('chrome.searchPlaceholder')}</span>
            <kbd class="cmdk-kbd" id="cmdk-kbd">
              Ctrl K
            </kbd>
          </button>
        </form>

        <nav class="site-nav" aria-label={t('chrome.mainNavAria')}>
          {navGroups(t).map((g) => (
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

        {/* Tema bor på innstillinger-siden (portal/SETTINGS.md) — ikke som eget
            header-ikon (2026-07-22). */}

        {/* Konto-chip: fast plass rett før tannhjulet (portal/SETTINGS.md). */}
        <AccountChip t={t} />

        <a href="/innstillinger" class="icon-btn" aria-label={t('chrome.settings')} title={t('chrome.settings')}>
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
          <summary class="icon-btn mobile-menu-btn" aria-label={t('chrome.menu')}>
            <span class="hamburger" aria-hidden="true" />
          </summary>
          <nav class="mobile-panel" aria-label={t('chrome.mainNavAria')}>
            {navGroups(t).map((g) => (
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

function Footer({ t, u }: { t: Translator; u: (p: string) => string }) {
  return (
    <footer class="site-footer">
      <div class="site-footer-inner">
        {/* Produkt-tillegg (valgfritt) — over den faste raden (portal/FOOTER.md). */}
        <nav class="site-footer-nav" aria-label={t('chrome.footerNavAria')}>
          <a href="/">{t('foot.home')}</a>
          <a href="/om">{t('foot.about')}</a>
          <a href="/om#hjelp">{t('foot.help')}</a>
          <a href="/innstillinger">{t('chrome.settings')}</a>
          <a href="https://flogvit.com/konto/">{t('foot.account')}</a>
          <a href="/offline">{t('foot.offline')}</a>
          <a href="/tilgjengelighet">{t('foot.a11y')}</a>
        </nav>

        {/* Fast legal-rad (portal/FOOTER.md): FLOGVIT.bible · Vilkår · Personvern ·
            Konto · © år. Ingen Refusjon — bibel tar ikke betaling. */}
        <div class="site-footer-legal">
          <span class="fv-wordmark">
            <a class="fv-brand" href="https://flogvit.com" aria-label={t('chrome.menuAria')}>
              FLOGVIT
            </a>
            <a class="fv-product" href="/" aria-label={t('chrome.homeAria')}>
              <span class="fv-dot">.</span>bible
            </a>
          </span>
          <nav class="site-footer-legalnav" aria-label={t('chrome.legalAria')}>
            <a href="https://flogvit.com/vilkar">{t('foot.terms')}</a>
            <a href="https://flogvit.com/personvern">{t('foot.privacy')}</a>
            <a href="https://flogvit.com/konto/">{t('foot.account')}</a>
          </nav>
          <p class="site-footer-note">© {new Date().getFullYear()} FLOGVIT</p>
        </div>
      </div>
    </footer>
  );
}

export interface LayoutProps {
  /** UI-locale — styrer prefiks, ordbok og <html lang>. IKKE innholdsspråk eller bibelutgave. */
  locale: Locale;
  /** Sti UTEN språkprefiks — grunnlaget for hreflang-klyngen. */
  path: string;
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
  const t = makeT(props.locale);
  const u = (p: string) => href(props.locale, p);
  const desc = props.description ?? t('chrome.searchPlaceholder');
  return (
    <>
      {raw('<!DOCTYPE html>')}
      <html lang={props.locale}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          {raw(PREFS_READ_SNIPPET)}
          <title>{props.title}</title>
          <meta name="description" content={desc} />
          <meta name="author" content="FLOGVIT" />
          <meta property="og:locale" content={ogLocale(props.locale)} />
          <link rel="canonical" href={props.canonical ?? SITE + href(props.locale, props.path)} />
          <HrefLang path={props.path} />
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
          <Header t={t} u={u} />
          <main id="innhold" class="site-main">
            {props.children}
          </main>
          <Footer t={t} u={u} />
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
