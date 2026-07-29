// FLOGVIT.plus-gate for «husking» (Vegards beslutning 2026-07-22): all lagring
// av brukerdata — også lokalt i nettleseren — krever plus. Innstillinger
// (bible-settings) er unntatt. Gaten er klient-side og ærlig «soft» (data bor
// i brukerens egen nettleser, og kildekoden er åpen); den reelle håndhevingen
// av skylagring skjer server-side (requirePlus).
//
// Må lastes FØR sync.js (som også patcher localStorage.setItem).

import { readStrings, localeHref } from './locale.js';

const GATED_KEYS = [
  'bible-favorites',
  'bible-notes',
  'bible-topics',
  'bible-verse-lists',
  'bible-devotionals',
  'bible-verse-versions',
  'bible-reading-position',
  'bible-reading-progress',
  'activeReadingPlan',
  'readingPlanProgress',
];

function hasPlus() {
  try {
    return /(?:^|;\s*)fv-auth=2/.test(document.cookie);
  } catch {
    return false;
  }
}

function loggedIn() {
  try {
    return /(?:^|;\s*)fv-auth=[12]/.test(document.cookie);
  } catch {
    return false;
  }
}

let cta = null;

function showCta(what) {
  const t = readStrings(document.body);
  if (cta) cta.remove();
  cta = document.createElement('div');
  cta.className = 'plus-cta';
  cta.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = t('plus.requires', { what });
  const link = document.createElement('a');
  link.className = 'plus-cta-link';
  link.href = 'https://flogvit.com/plus/';
  link.textContent = t('plus.readAbout');
  cta.append(text, link);
  if (!loggedIn()) {
    const login = document.createElement('a');
    login.className = 'plus-cta-link';
    login.href = localeHref('/logg-inn');
    login.textContent = t('chrome.login');
    cta.append(login);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'plus-cta-close';
  close.setAttribute('aria-label', t('common.close'));
  close.textContent = '✕';
  close.addEventListener('click', () => cta.remove());
  cta.append(close);
  document.body.append(cta);
}

window.fvPlus = {
  has: hasPlus,
  cta: showCta,
  /** true = slipp gjennom; false = stoppet (CTA vist). */
  gate(what) {
    if (hasPlus()) return true;
    showCta(what);
    return false;
  },
};

// Stille lagringsgate: bakgrunnsskriv (f.eks. leseposisjon under scrolling)
// skal ikke spamme CTA — de droppes bare. Synlige handlinger gates med CTA
// ved handlingspunktene i øyene (reading.js, user.js, tagging.js m.fl.).
try {
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    if (!hasPlus() && GATED_KEYS.includes(key)) return;
    orig(key, value);
  };
} catch {}
