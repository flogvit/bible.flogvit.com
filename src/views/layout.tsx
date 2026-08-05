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
import { DEFAULT_LOCALE, LOCALES, href, makeT, ogLocale, type Locale, type Translator, lhref } from '../lib/i18n.ts';
import { tCtx, islandStrings, type MessageKey } from '../lib/i18n.ts';
import { absoluteUrl } from '../lib/site-url.ts';
import { assetUrl } from '../lib/static-cache.ts';
import { shareCard, type ShareCard } from '../lib/share-card.ts';

/**
 * Strenger klient-øyene som lastes på HVER side trenger: plus-CTA-en (plus.js),
 * kommandopaletten (cmdk.js), oppdaterings-banneret (pwa.js) og
 * versforhåndsvisningen (ref-preview.js). Alle fire bygger DOM selv og sto
 * dermed utenfor ordboka — de var norske på alle åtte språk (#33).
 */
const CHROME_ISLAND_KEYS = [
  'plus.requires', 'plus.readAbout', 'chrome.login', 'common.close', 'chrome.settings',
  'cmdk.aria', 'cmdk.placeholder', 'cmdk.select', 'cmdk.open', 'cmdk.close', 'cmdk.empty',
  'cmdk.newManuscript', 'cmdk.searchInText', 'cmdk.searchOriginalFor', 'cmdk.fulltext',
  'cmdk.hebrewGreek', 'cmdk.goToVerse', 'cmdk.downloadBible', 'cmdk.accountSync',
  'cmdk.searchGroup', 'nav.searchOriginal',
  'nav.mine', 'nav.studies', 'nav.overview', 'nav.favorites', 'nav.topicsMine', 'nav.notes',
  'nav.verseLists', 'nav.readingPlan', 'nav.manuscripts', 'nav.themes',
  'nav.stories', 'nav.prophecies', 'nav.parallels', 'nav.persons', 'nav.numbers',
  'nav.timeline', 'nav.readingTexts', 'nav.statistics', 'nav.translations',
  'pub.catalog',
  'foot.home', 'foot.about', 'foot.a11y', 'foot.offline',
  'pwa.newVersion', 'pwa.updateNow', 'pwa.later', 'pwa.offline', 'pwa.backOnline',
  'ref.notFound',
  // Hurtigtast-hjelpen (shortcuts.js) — «?» virker på hver side.
  'kbd.title', 'kbd.general', 'kbd.toggleHelp', 'kbd.gotoSearch', 'kbd.normalView',
  'kbd.readingMode', 'kbd.panelMode', 'kbd.closeDialogs', 'kbd.chapterNav',
  'kbd.chapterPagesOnly', 'kbd.prevChapter', 'kbd.nextChapter', 'kbd.switchPanelTab',
  'kbd.jumpToVerse', 'kbd.quickNav', 'kbd.useModMac', 'kbd.useModPc', 'kbd.homeBookList',
  'nav.days',
  // sync.js sin statuslinje.
  'is.syncedChanges',
] as const;

/**
 * Strenger for de SIDESPESIFIKKE øyene, slått opp på skriptnavn.
 *
 * Nøklene blir bare med på sidene som faktisk laster øya — å legge alt på
 * <body> overalt ville lagt flere kB på hver eneste sidevisning for strenger
 * de fleste sidene aldri bruker.
 */
const PAGE_ISLAND_KEYS: Record<string, readonly MessageKey[]> = {
  'reading.js': [
    'is.favOn', 'is.favOff', 'is.delete', 'nav.favorites', 'nav.notes', 'is.readTracking',
    // Fallbacker når en data-label mangler. De MÅ ligge her, ellers viser øya
    // nøkkelen — som er meningen, men bare hvis nøkkelen faktisk er en glipp.
    'rd.markRead', 'rd.read', 'rd.lastRead',
  ],
  'user.js': [
    'nav.verseLists', 'nav.manuscripts', 'is.readingMap', 'is.activeCantHide', 'is.importFailed',
    'is.storageUsed', 'is.storageUnavailable', 'is.untitled', 'is.taggedCount', 'is.verseCount',
    // Deling av manuskripter (#15). Glemmer du en nøkkel her, viser øya NØKKELEN.
    'u.share', 'u.shareHint', 'u.shareCreate', 'u.shareCopy', 'u.shareCopied',
    'u.shareNew', 'u.shareRevoke', 'u.shareRevoked', 'u.shareError',
    // Åpen katalog (#15, del 2). Glemmer du en nøkkel her, viser øya NØKKELEN.
    'pub.publish', 'pub.publishHint', 'pub.republish', 'pub.withdraw', 'pub.withdrawn',
    'pub.viewInCatalog', 'pub.statusPending', 'pub.statusApproved', 'pub.statusRejected',
    'pub.error',
  ],
  'offline.js': [
    'is.offlineDownload', 'is.downloadProgress', 'is.downloadSkipped', 'is.downloadingSupport',
    'is.downloadDone', 'is.downloadPaused', 'is.downloadFailed', 'is.nothingDownloaded',
  ],
  'offline-reader.js': [
    'is.chapterNotDownloaded', 'is.chapterN', 'is.offlineNotice', 'is.nothingDownloadedYet',
    'is.youAreOffline', 'is.couldNotReadOffline',
  ],
  'studium.js': ['is.noManuscriptsHere', 'is.searchTextFor', 'is.searchStudyFor'],
  'tagging.js': ['is.removeTopic', 'is.newTopic', 'nav.topicsMine'],
  'translations.js': [
    'is.ownTranslations', 'is.delete', 'is.noTextToParse', 'is.noVersesFound', 'is.parseFailed',
    'is.uploadingToAccount', 'is.syncedToAccount', 'is.uploadFailedRetry',
  ],
  'statistics.js': ['common.loading', 'is.noWords'],
  'publication.js': ['pub.reported', 'pub.reportFailed'],
  'person-filter.js': ['is.personCount'],
  'user-bibles.js': ['is.chapterMissingInOwn', 'is.showingOwn'],
};

function islandKeysFor(scripts: readonly string[]): MessageKey[] {
  const keys = new Set<MessageKey>(CHROME_ISLAND_KEYS);
  for (const s of scripts) for (const k of PAGE_ISLAND_KEYS[s] ?? []) keys.add(k);
  return [...keys];
}

/**
 * Hreflang-klyngen (I18N.md §3): URL-ene er samme side på ulike språk, ikke
 * duplikater.
 *
 * `locales` er språkene siden FAKTISK finnes på — normalt alle åtte, men
 * språk-scopet innhold som bare finnes på norsk (`reading_texts`) svarer 404 på
 * resten (#45). Klyngen skal aldri annonsere en adresse som ikke svarer 200: en
 * crawler trenger ingen lenke når `<link rel="alternate">` sier at siden finnes.
 *
 * Derfor følger `x-default` med: den er adressen Google velger når ingen
 * språkvariant passer, så den må ligge INNENFOR settet. Pekte den på engelsk for
 * en norsk-bare side, sendte vi hver uplasserbar leser til en 404.
 *
 * Adressene går gjennom `absoluteUrl()` (#80): en klynge er maskinlesbar, og
 * en rå `ø` her ville vært den samme uenigheten med sitemapen som `og:image`
 * og canonical hadde — bare sagt et annet sted.
 */
function HrefLang({ path, locales }: { path: string; locales?: readonly Locale[] }) {
  const available = locales?.length ? locales : LOCALES;
  const fallback = available.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : available[0]!;
  return (
    <>
      {available.map((l) => (
        <link rel="alternate" hreflang={l} href={absoluteUrl(href(l, path))} />
      ))}
      <link rel="alternate" hreflang="x-default" href={absoluteUrl(href(fallback, path))} />
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
                  <span class="fvmenu-chip">{t('chrome.soon')}</span>
                </span>
              );
            }
            return (
              <a class="fvmenu-item" href={p.href.startsWith('/') ? lhref(p.href) : p.href} aria-current={p.current ? 'true' : undefined}>
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
      <a class="fvmenu-product" href={lhref('/')} aria-label={t('chrome.homeAria')}>
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
      { href: '/temaer', label: t('nav.themes') },
      { href: '/historier', label: t('nav.stories') },
      { href: '/manuskripter/katalog', label: t('pub.catalog') },
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
                  <a href={lhref(l.href)} class="nav-dd-link">
                    {l.label}
                  </a>
                ))}
              </div>
            </details>
          ))}
        </nav>

        {/* Tema bor på innstillinger-siden (portal/SETTINGS.md) — ikke som eget
            header-ikon (2026-07-22). */}

        {/* Kontroll-klyngen holdes sammen som ÉN flex-enhet (#50). Headeren
            bryter til to rader når teksten er stor, og uten grupperingen falt
            hamburgeren ned alene til venstre mens resten ble stående igjen —
            det så ut som en løs knapp under «Logg inn». Nå bryter chip,
            tannhjul og hamburger samlet, høyrestilt. Rekkefølgen innad er
            fortsatt konto-chip → tannhjul (portal/SETTINGS.md). */}
        <div class="header-controls">
          {/* Konto-chip: fast plass rett før tannhjulet (portal/SETTINGS.md). */}
          <AccountChip t={t} />

          <a href={lhref('/innstillinger')} class="icon-btn" aria-label={t('chrome.settings')} title={t('chrome.settings')}>
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
                    <a href={lhref(l.href)} class="mobile-link">
                      {l.label}
                    </a>
                  ))}
                </div>
              ))}
            </nav>
          </details>
        </div>
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
          <a href={lhref('/')}>{t('foot.home')}</a>
          <a href={lhref('/om')}>{t('foot.about')}</a>
          <a href={lhref('/om#hjelp')}>{t('foot.help')}</a>
          <a href={lhref('/innstillinger')}>{t('chrome.settings')}</a>
          <a href="https://flogvit.com/konto/">{t('foot.account')}</a>
          <a href={lhref('/offline')}>{t('foot.offline')}</a>
          <a href={lhref('/tilgjengelighet')}>{t('foot.a11y')}</a>
          <a href={lhref('/changes')}>{t('foot.changes')}</a>
        </nav>

        {/* Fast legal-rad (portal/FOOTER.md): FLOGVIT.bible · Vilkår · Personvern ·
            Konto · © år. Ingen Refusjon — bibel tar ikke betaling. */}
        <div class="site-footer-legal">
          <span class="fv-wordmark">
            <a class="fv-brand" href="https://flogvit.com" aria-label={t('chrome.menuAria')}>
              FLOGVIT
            </a>
            <a class="fv-product" href={lhref('/')} aria-label={t('chrome.homeAria')}>
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
  /**
   * Locale-ene siden faktisk FINNES på. Utelatt = alle åtte, som er sant for
   * alt annet enn sider bygget på innhold som mangler språk (#45). Bruk
   * `localesWithContent()` (lib/lang.ts) framfor å skrive lista i en rute —
   * den utleder settet av samme fallback-kjede som spørringen.
   */
  locales?: readonly Locale[];
  title: string;
  description?: string;
  children?: Child;
  /** Ekstra JS-øyer som lastes (stier under /js/). chrome.js lastes alltid. */
  scripts?: string[];
  /** Ekstra side-CSS (stier under /css/). styles.css lastes alltid. */
  styles?: string[];
  /** Absolutt kanonisk URL for siden (SEO). */
  canonical?: string;
  /**
   * Hold siden ute av søkeindeksen (`noindex,follow`).
   *
   * Brukes på flater der URL-en bærer BRUKERENS tekst — søkeresultater (#41).
   * En slik side reflekterte vilkårlig tekst inn i `<title>` og svarte 200, og
   * det er nettopp mønsteret forgiftningssonder leter etter: de vil ha vår
   * autoritet til å rangere sin egen reklame. Canonical peker query-løst, men
   * canonical er et HINT — `noindex` er et direktiv.
   *
   * `follow` beholdes med vilje: lenkene ut til kapitler og vers skal fortsatt
   * gi crawl-verdi.
   */
  noindex?: boolean;
  /**
   * Delekortet siden skal vise når noen deler lenken (#68).
   *
   * Utelatt = det GENERISKE kortet, og det er ikke en mangel: en rute uten noe
   * bedre skal aldri bli uten kort. Kapittelsiden sender sitt eget, fordi det
   * er kapittellenkene folk deler — se `lib/share-card.ts`.
   */
  shareCard?: ShareCard;
  /**
   * Gi siden HEADERENS bredde framfor lesebredden `--maxw` (#78).
   *
   * `--maxw` er en spaltebredde: den finnes for at én tekstkolonne ikke skal
   * bli for lang å følge. En side som selv DELER bredden på flere deler —
   * kapittelsidas innholdsfortegnelse, tekst og studiepanel — får taket til å
   * treffe feil del, og tekstdelen betaler for alle tre. Utelatt = `--maxw`,
   * som er riktig for alt som er én spalte.
   */
  wide?: boolean;
}

/** Fullt HTML-dokument med familie-chromen. */
export function Layout(props: LayoutProps) {
  const t = makeT(props.locale);
  const u = (p: string) => href(props.locale, p);
  const desc = props.description ?? t('chrome.searchPlaceholder');
  const card = props.shareCard ?? shareCard();
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
          {props.noindex && <meta name="robots" content="noindex,follow" />}
          <meta name="author" content="FLOGVIT" />
          <meta property="og:locale" content={ogLocale(props.locale)} />
          {/* Delekortet (#65). Uten `og:image` blir en delt lenke et kort med
              bare tittel og beskrivelse — og hullet er usynlig fra flata selv,
              for siden svarer 200 og ser riktig ut.

              Det står her, i SIDEMALEN, som standard for alle sider: legges
              det per rute, mangler det på den ruta noen legger til i morgen.

              `twitter:image` er bevisst utelatt — X faller tilbake på
              `og:image`, så taggen ville vært duplisering med to steder å
              glemme å oppdatere. */}
          <meta property="og:image" content={card.url} />
          <meta property="og:image:width" content={String(card.width)} />
          <meta property="og:image:height" content={String(card.height)} />
          <meta property="og:image:alt" content={card.alt ?? t('chrome.shareCardAlt')} />
          <meta name="twitter:card" content="summary_large_image" />
          {/* Absolutt OG prosentkodet (#80) — se `lib/site-url.ts`. En rute som
              sender sin egen canonical bygger den med samme `absoluteUrl()`;
              `published-url-encoding.test.ts` krever at opphavet bare settes
              sammen med en sti DER. */}
          <link rel="canonical" href={props.canonical ?? absoluteUrl(href(props.locale, props.path))} />
          <HrefLang path={props.path} locales={props.locales} />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="icon" href="/favicon.ico" sizes="any" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#7a4a21" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
          <link rel="stylesheet" href={GOOGLE_FONTS} />
          <link rel="stylesheet" href={assetUrl('/styles.css')} />
          <link rel="stylesheet" href={assetUrl('/css/shortcuts.css')} />
          <link rel="stylesheet" href={assetUrl('/css/cmdk.css')} />
          {(props.styles ?? []).map((s) => (
            <link rel="stylesheet" href={assetUrl(`/css/${s}`)} />
          ))}
        </head>
        {/* Strenger øyer som finnes på HVER side trenger (plus-CTA-en). Uten
            dem var CTA-en norsk på alle åtte språk — samme hull som #33: en
            klient-øy bygger DOM selv og står utenfor ordboka. */}
        <body data-strings={islandStrings(tCtx(), islandKeysFor(props.scripts ?? []))}>
          <a class="skip-link" href="#innhold">
            {tCtx()('common.skipToContent')}
          </a>
          <Header t={t} u={u} />
          <main id="innhold" class={props.wide ? 'site-main site-main-wide' : 'site-main'}>
            {props.children}
          </main>
          <Footer t={t} u={u} />
          <script type="module" src={assetUrl('/js/chrome.js')} />
          <script type="module" src={assetUrl('/js/shortcuts.js')} />
          <script type="module" src={assetUrl('/js/plus.js')} />
          <script type="module" src={assetUrl('/js/sync.js')} />
          <script type="module" src={assetUrl('/js/cmdk.js')} />
          <script type="module" src={assetUrl('/js/pwa.js')} />
          {(props.scripts ?? []).map((s) => (
            <script type="module" src={assetUrl(`/js/${s}`)} />
          ))}
        </body>
      </html>
    </>
  );
}
