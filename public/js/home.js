// Forside-øy. Alt her er progressivt: SSR rendrer en fullt brukbar forside, og
// dette laget legger på det som avhenger av brukerens egen, lagrede tilstand —
// leseposisjon, favoritter, aktiv leseplan og valgt bokvisning.
//
// TO REGLER som begge ble brutt i første port (#33):
//   1. Lenker MÅ gjennom `localeHref()`. En uprefikset lenke 302-redirecter til
//      den FORHANDLEDE locale-en, så en engelsk leser havnet på /nb/ ved
//      første klikk fra forsiden.
//   2. Tekst MÅ gjennom `readStrings()`. Ordboka bor på serveren og følger med
//      som `data-strings`; hardkodede strenger her er norske på alle åtte
//      språk, og hverken nøkkelsveipen eller norsk-vakta ser dem.

import { localeHref, readStrings, langParam } from './locale.js';
import * as plan from './reading-plan.js';

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Skrivesperret (gratisbruker) — plus.js har allerede vist CTA-en.
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(paths, filled) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const settings = readJSON('bible-settings') || {};

// Forside-toggles fra innstillinger: seksjoner med data-setting-show skjules
// når nøkkelen er satt til false (default på). SSR viser alt uten JS.
document.querySelectorAll('[data-setting-show]').forEach((node) => {
  if (settings[node.dataset.settingShow] === false) node.hidden = true;
});

const readingPosition = settings.showContinueReading === false
  ? null
  : readJSON('bible-reading-position');

function bookIdForSlug(slug) {
  const link = document.querySelector(`.home-book[data-slug="${CSS.escape(slug)}"]`);
  const id = link ? parseInt(link.dataset.bookId, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// ── Fortsett å lese ────────────────────────────────────────────────
{
  const cont = document.getElementById('home-continue');
  if (cont && readingPosition?.bookSlug && readingPosition.chapter) {
    const t = readStrings(cont);
    const pos = readingPosition;
    const verse = pos.verse || 1;

    cont.dataset.state = 'continue';
    cont.textContent = '';

    const left = el('div');
    left.append(
      el('div', 'eyebrow', t('home.continueReading')),
      el('h1', 'home-continue-title', `${pos.bookName || ''} ${pos.chapter}`.trim()),
      el('div', 'home-continue-sub', t('home.stoppedAtVerse', { verse })),
    );
    // Verset leseren stoppet på, hentet etterpå: det er hyggelig, men ikke
    // verdt å utsette resten av kortet for.
    const preview = el('div', 'home-continue-verse');
    preview.hidden = true;
    left.append(preview);

    const actions = el('div', 'home-actions');
    const primary = el('a', 'home-btn home-btn-primary', t('home.continueAtVerse', { verse }));
    primary.href = localeHref(`/${pos.bookSlug}/${pos.chapter}#v${verse}`);
    const next = el('a', 'home-btn home-btn-ghost', t('home.nextChapter'));
    next.href = localeHref(`/${pos.bookSlug}/${pos.chapter + 1}`);

    const clear = el('button', 'home-clear-btn', '×');
    clear.type = 'button';
    clear.title = t('home.clearPosition');
    clear.setAttribute('aria-label', t('home.clearPosition'));
    clear.addEventListener('click', () => {
      try {
        localStorage.removeItem('bible-reading-position');
      } catch {
        // Ingenting å gjøre — knappen forsvinner uansett ved neste lasting.
      }
      location.reload();
    });

    actions.append(primary, next, clear);
    cont.append(left, actions);

    const bookId = bookIdForSlug(pos.bookSlug);
    if (bookId) {
      fetch('/api/verses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: [{ bookId, chapter: pos.chapter, verse }], bible: settings.bible }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((rows) => {
          const text = Array.isArray(rows) ? rows[0]?.verse?.text : null;
          if (!text) return;
          preview.textContent = `«${text}»`;
          preview.hidden = false;
        })
        .catch(() => {});
    }
  }
}

// ── Dagens vers: favoritt + klipping ───────────────────────────────
{
  const card = document.querySelector('.home-vod');
  const scroll = document.getElementById('home-vod-scroll');
  const actions = document.getElementById('home-vod-actions');
  const t = readStrings(card);

  if (scroll) {
    // «Vis mer» skal bare finnes når det ER mer å vise. Måles i sammenklappet
    // tilstand; utvidet er høyden fri, og da ville målingen alltid sagt nei.
    const overflows = scroll.scrollHeight - scroll.clientHeight > 2;
    if (overflows) {
      const toggle = el('button', 'home-vod-more', t('home.showMore'));
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', t('home.expandVerse'));
      toggle.addEventListener('click', () => {
        const open = scroll.classList.toggle('is-open');
        toggle.textContent = open ? t('home.showLess') : t('home.showMore');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? t('home.collapseVerse') : t('home.expandVerse'));
      });
      scroll.classList.add('has-more');
      scroll.after(toggle);
    }
  }

  if (actions) {
    const fav = {
      bookId: parseInt(actions.dataset.bookId, 10),
      chapter: parseInt(actions.dataset.chapter, 10),
      verse: parseInt(actions.dataset.verse, 10),
    };
    const same = (x) => x.bookId === fav.bookId && x.chapter === fav.chapter && x.verse === fav.verse;
    const btn = el('button', 'home-vod-fav');
    btn.type = 'button';

    const paint = (on) => {
      btn.textContent = '';
      btn.appendChild(icon(['M19 14c-3 4-7 7-7 7s-4-3-7-7-3-8 0-10 6-1 7 2c1-3 4-4 7-2s3 6 0 10z'], on));
      btn.classList.toggle('is-on', on);
      const label = on ? t('home.removeFavorite') : t('home.addFavorite');
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', String(on));
    };

    paint((readJSON('bible-favorites') || []).some(same));

    btn.addEventListener('click', () => {
      if (!window.fvPlus?.gate(t('home.addFavorite'))) return;
      const favs = readJSON('bible-favorites') || [];
      const on = favs.some(same);
      writeJSON('bible-favorites', on
        ? favs.filter((x) => !same(x))
        : [...favs, { ...fav, addedAt: Date.now() }]);
      paint(!on);
    });

    actions.appendChild(btn);
  }
}

// ── Bokvisninger + boka du leser i ─────────────────────────────────
{
  const section = document.getElementById('home-books');
  const groups = document.getElementById('home-book-groups');
  const views = document.getElementById('home-book-views');

  if (section && groups && views) {
    const t = readStrings(section);
    const books = [...groups.querySelectorAll('.home-book')];
    // Kategorivisningen er den SSR rendrer; vi tar vare på den framfor å bygge
    // den opp igjen, slik at gruppenavnene ikke må dupliseres i JS.
    const categoryView = [...groups.children];

    // Boka du står i: markert, og lenket til DITT kapittel framfor kapittel 1.
    const markCurrentBook = () => {
      if (!readingPosition?.bookSlug) return;
      const link = groups.querySelector(`.home-book[data-slug="${CSS.escape(readingPosition.bookSlug)}"]`);
      if (!link || link.dataset.current) return;
      link.dataset.current = '1';
      link.classList.add('is-current');
      link.href = localeHref(`/${readingPosition.bookSlug}/${readingPosition.chapter}`);
      const meta = link.querySelector('.home-book-meta');
      if (meta) meta.append(` · ${t('home.nowReading')}`);
    };

    const renderGroups = (list) => {
      groups.textContent = '';
      for (const { label, items } of list) {
        const group = el('div', 'home-book-group');
        group.append(el('div', 'home-book-group-label', label));
        const grid = el('div', 'home-book-grid');
        for (const book of items) grid.appendChild(book);
        group.appendChild(grid);
        groups.appendChild(group);
      }
    };

    const byName = (a, b) =>
      a.querySelector('.home-book-name').textContent
        .localeCompare(b.querySelector('.home-book-name').textContent, document.documentElement.lang);

    const show = (view, btn) => {
      if (view === 'alphabetical') {
        // Sorter på navnet som VISES, ikke på det norske: ellers står den
        // engelske lista i norsk rekkefølge.
        renderGroups([{ label: btn.dataset.groupLabel, items: [...books].sort(byName) }]);
      } else if (view === 'chronological') {
        renderGroups([
          { label: btn.dataset.otLabel, items: books.filter((b) => b.dataset.testament === 'OT') },
          { label: btn.dataset.ntLabel, items: books.filter((b) => b.dataset.testament === 'NT') },
        ]);
      } else {
        groups.textContent = '';
        for (const group of categoryView) groups.appendChild(group);
      }
      views.querySelectorAll('.home-book-view').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
      });
      markCurrentBook();
    };

    views.hidden = false;
    views.querySelectorAll('.home-book-view').forEach((btn) => {
      btn.addEventListener('click', () => {
        show(btn.dataset.view, btn);
        writeJSON('bible-book-view', btn.dataset.view);
      });
    });

    const saved = readJSON('bible-book-view');
    const savedBtn = saved && saved !== 'categories'
      ? views.querySelector(`.home-book-view[data-view="${saved}"]`)
      : null;
    if (savedBtn) show(saved, savedBtn);
    else markCurrentBook();
  }
}

// ── Aktiv leseplan ─────────────────────────────────────────────────
{
  const card = document.getElementById('home-plans');
  const planId = card && plan.activePlanId();

  if (planId) {
    const t = readStrings(card);
    const progress = plan.planProgress(planId);
    const planHref = card.dataset.planHref || localeHref('/leseplan');

    fetch(`/api/reading-plans/${encodeURIComponent(planId)}?${langParam()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.name) return;

        card.textContent = '';
        const head = el('div', 'home-plans-head');
        head.append(el('h3', null, t('home.readingPlans')), el('span', 'home-plans-count', t('home.oneActive')));
        card.appendChild(head);

        const tabs = el('div', 'home-plans-tabs');
        const add = el('a', 'home-plans-tab home-plans-tab-add', t('home.newPlan'));
        add.href = planHref;
        tabs.append(el('span', 'home-plans-tab is-on', data.name), add);
        card.appendChild(tabs);

        if (!progress?.startDate) {
          // Planen er valgt, men aldri startet (framdriftsraden mangler). Da
          // finnes ingen dag å regne fra, og vi later ikke som.
          const open = el('a', 'home-plans-btn', t('home.choosePlan'));
          open.href = planHref;
          card.appendChild(open);
          return;
        }

        const day = Math.min(plan.currentDay(progress.startDate), data.days);
        const inARow = plan.streak(progress);
        const pct = plan.completionPercentage(progress, data.days);

        const row = el('div', 'home-plans-streak');
        const inner = el('div');
        inner.append(
          el('div', 'home-plans-streak-num', String(inARow)),
          el('small', null, `${t('home.daysInARow')} · ${t('home.dayOf', { day, total: data.days })}`),
        );
        row.appendChild(inner);
        card.appendChild(row);

        const bar = el('div', 'home-plans-prog');
        const fill = el('span');
        fill.style.width = `${pct}%`;
        bar.appendChild(fill);
        card.appendChild(bar);

        const reading = plan.todaysReading(data, progress);
        const chapters = (reading?.chapters ?? [])
          .map((ch) => {
            const link = document.querySelector(`.home-book[data-book-id="${ch.bookId}"]`);
            const name = link?.querySelector('.home-book-name')?.textContent;
            return name ? `${name} ${ch.chapter}` : null;
          })
          .filter(Boolean)
          .join(' · ');

        const today = el('div', 'home-plans-today');
        today.append(
          el('span', 'home-plans-what', chapters || t('home.todayLabel')),
          el('span', 'home-plans-when', t('home.todayLabel')),
        );
        card.appendChild(today);
      })
      .catch(() => {});
  }
}
