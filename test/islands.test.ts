// KLIENT-ØYENE — det nivået `bun test` ikke så før.
//
// Koden i `public/js/` kjører bare i en nettleser, og det hullet var dyrt: to
// defekter i lesesporingen (#16) slapp gjennom 143 grønne tester og ble først
// funnet ved manuell klikking. Begge var DOM-WIRING, ikke logikk:
//
//   1. Datoen brukte nettleserens locale i stedet for sidens («7/28/2026» på en
//      norsk side).
//   2. Lesekartet hydrerte ikke fra localStorage, så et kapittel du nettopp
//      markerte var usynlig til sync hadde gått.
//
// happy-dom gir oss document/localStorage/window i bun test. IntersectionObserver
// og Page Visibility STUBBES bevisst: da kan vi drive målingen deterministisk
// framfor å vente på ekte scrolling — bedre enn en ekte nettleser til dette.
//
// Modulene i public/js kjører ved import (topp-nivå side-effekter), så DOM-en
// må bygges FØR `await import(...)`, og importen må cache-bustes per test.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

let bust = 0;

/** Fersk import av en øy — modulene har side-effekter og skal kjøre på nytt. */
async function loadIsland(name: string) {
  return import(`../public/js/${name}.js?t=${bust++}`);
}

/** Minimal IntersectionObserver vi styrer selv. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  targets: Element[] = [];
  constructor(public cb: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  disconnect() {
    this.targets = [];
  }
  /** Send inn synlighet for gitte versnumre. */
  fire(nums: number[], isIntersecting: boolean) {
    const entries = this.targets
      .filter((t) => nums.includes(Number((t as HTMLElement).dataset.verseNum)))
      .map((target) => ({ target, isIntersecting }));
    if (entries.length) this.cb(entries);
  }
}

function setupDom(body: string, opts: { lang?: string; plus?: boolean } = {}) {
  document.documentElement.lang = opts.lang ?? 'nb';
  document.body.innerHTML = body;
  localStorage.clear();
  FakeIntersectionObserver.instances = [];
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
  // fv-auth=2 er plus-signalet plus.js leser (samme cookie som i prod).
  document.cookie = `fv-auth=${opts.plus === false ? '1' : '2'}; path=/`;
  // Øyene spør window.fvPlus. Testene som laster plus.js får den EKTE porten —
  // den overskriver denne stubben — mens de øvrige slipper å dra den inn.
  (window as unknown as { fvPlus: unknown }).fvPlus = {
    has: () => opts.plus ?? true,
    gate: () => opts.plus ?? true,
    cta: () => {},
  };
}

/**
 * Laster øyene i SAMME rekkefølge som layout.tsx: plus.js FØR de andre, fordi
 * den patcher `localStorage.setItem` og dropper skriv til gatede nøkler for
 * ikke-plus. Testes sammensatt, ellers ville vi bevist noe appen ikke gjør.
 */
async function loadWithPlusGate(island: string) {
  await loadIsland('plus');
  return loadIsland(island);
}

beforeEach(() => {
  // URL må settes: på about:blank fester ikke cookies seg, og plus.js leser
  // plus-status fra fv-auth-cookien.
  GlobalRegistrator.register({ url: 'https://bible.flogvit.com/' });
});

afterEach(async () => {
  await GlobalRegistrator.unregister();
});

// ── reading.js: kapittel-ringen ─────────────────────────────────────

const CHAPTER_DOM = (verses: number) => `
  <div data-reading-root>
    <button data-chapter-read hidden aria-pressed="false"
      data-label-mark="Marker som lest" data-label-read="Lest"
      data-label-last-read="Sist lest" data-label-times="ganger">
      <span data-crr-dial></span><span data-crr-label>Marker som lest</span>
    </button>
    <div data-read-suggestion hidden>
      <button data-suggestion-yes>Ja</button><button data-suggestion-no>Nei</button>
    </div>
    <section class="verses" data-verses>
      ${Array.from({ length: verses }, (_, i) => `
        <div class="verse" data-verse-num="${i + 1}" data-verse-id="x-1-${i + 1}">
          <span class="verse-text" data-verse-text>Et vers med noen få ord i seg her.</span>
          <div class="verse-detail">
            <button data-verse-read-toggle data-verse-num="${i + 1}" data-label-read="Lest">○ Lest</button>
          </div>
        </div>`).join('')}
    </section>
  </div>`;

function withBodyData(bookId = 1, chapter = 1, totalVerses = 10) {
  Object.assign(document.body.dataset, {
    bookId: String(bookId),
    chapter: String(chapter),
    maxChapter: '50',
    bookSlug: '1mos',
    bookName: '1. Mosebok',
    totalVerses: String(totalVerses),
  });
}

describe('reading.js — kapittel-ringen', () => {
  test('ringen vises og kan markere kapittelet som lest', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData();
    await loadIsland('reading');

    const btn = document.querySelector('[data-chapter-read]') as HTMLButtonElement;
    expect(btn.hidden).toBe(false);

    btn.click();
    const stored = JSON.parse(localStorage.getItem('bible-reading-progress')!);
    expect(stored['1-1'].count).toBe(1);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  test('DATOEN følger sidens språk, ikke nettleserens (regresjon #16)', async () => {
    setupDom(CHAPTER_DOM(10), { lang: 'nb' });
    withBodyData();
    await loadIsland('reading');

    (document.querySelector('[data-chapter-read]') as HTMLButtonElement).click();
    const label = document.querySelector('[data-crr-label]')!.textContent!;
    // Norsk gir «28.7.2026», amerikansk «7/28/2026». Skråstrek = feil locale.
    expect(label).not.toContain('/');
    expect(label).toContain('Sist lest');
  });

  test('nytt klikk avmarkerer i stedet for å telle opp', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData();
    await loadIsland('reading');

    const btn = document.querySelector('[data-chapter-read]') as HTMLButtonElement;
    btn.click();
    btn.click();
    expect(JSON.parse(localStorage.getItem('bible-reading-progress')!)['1-1']).toBeUndefined();
  });

  test('gratisbruker kan ikke markere et kapittel som lest', async () => {
    setupDom(CHAPTER_DOM(10), { plus: false });
    withBodyData();
    await loadWithPlusGate('reading');

    (document.querySelector('[data-chapter-read]') as HTMLButtonElement).click();
    const raw = localStorage.getItem('bible-reading-progress');
    const entry = raw ? JSON.parse(raw)['1-1'] : null;
    expect(entry?.count ?? 0).toBe(0);

    // GRENSE FOR HARNESSEN: plus.js har i tillegg en stille skrivesperre som
    // patcher `localStorage.setItem` og dropper gatede nøkler helt. happy-dom
    // lar seg ikke patche slik, så den delen kan ikke dekkes her — den ble
    // verifisert manuelt i Chrome 2026-07-28. Denne testen dekker den
    // brukersynlige porten: klikket registrerer ingen lesing.
  });
});

describe('reading.js — vers- og utvalgsmarkering', () => {
  test('enkeltvers samles som intervaller', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData(1, 1, 10);
    await loadIsland('reading');

    const toggles = [...document.querySelectorAll('[data-verse-read-toggle]')] as HTMLButtonElement[];
    toggles[0]!.click();
    toggles[1]!.click();
    toggles[2]!.click();

    const entry = JSON.parse(localStorage.getItem('bible-reading-progress')!)['1-1'];
    expect(entry.verses).toBe('1-3');
    expect(entry.count).toBe(0);
  });

  test('90 % dekning ruller opp til fullført lesing og rydder delvis-tilstanden', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData(1, 1, 10);
    await loadIsland('reading');

    const toggles = [...document.querySelectorAll('[data-verse-read-toggle]')] as HTMLButtonElement[];
    toggles.slice(0, 9).forEach((b) => b.click());

    const entry = JSON.parse(localStorage.getItem('bible-reading-progress')!)['1-1'];
    expect(entry.count).toBe(1);
    expect(entry.verses).toBeUndefined();
  });
});

describe('reading.js — dwell-måling', () => {
  test('lyn-scroll gir INGEN lesing: versene rekker ikke sitt gulv', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData(1, 1, 10);
    await loadIsland('reading');

    const obs = FakeIntersectionObserver.instances.at(-1)!;
    const alle = Array.from({ length: 10 }, (_, i) => i + 1);
    obs.fire(alle, true);
    obs.fire(alle, false); // ut igjen umiddelbart — ingen tid akkumulert

    const entry = JSON.parse(localStorage.getItem('bible-reading-progress')!)['1-1'];
    expect(entry.count).toBe(0);
  });

  test('åpning telles som opens, aldri som lest', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData();
    await loadIsland('reading');

    const entry = JSON.parse(localStorage.getItem('bible-reading-progress')!)['1-1'];
    expect(entry.opens).toBe(1);
    expect(entry.count).toBe(0);
  });

  test('manuell modus måler INGENTING — heller ikke åpninger (personvern)', async () => {
    setupDom(CHAPTER_DOM(10));
    withBodyData();
    localStorage.setItem('bible-settings', JSON.stringify({ readTracking: 'manual' }));
    await loadIsland('reading');

    expect(localStorage.getItem('bible-reading-progress')).toBeNull();
  });
});

// ── user.js: lesekartet ─────────────────────────────────────────────

const MAP_DOM = `
  <div data-reading-map>
    <section data-map-book="1" data-book-chapters="3">
      <div class="map-cells">
        <span class="map-cell" data-level="0" data-chapter="1"></span>
        <span class="map-cell" data-level="0" data-chapter="2"></span>
        <span class="map-cell" data-level="0" data-chapter="3"></span>
      </div>
      <button data-mark-book="1">✓</button>
    </section>
  </div>
  <div data-map-when hidden>
    <select data-map-when-year></select>
    <button data-map-when-ok>OK</button>
    <button data-map-when-unknown>Vet ikke</button>
  </div>`;

describe('user.js — lesekartet', () => {
  test('HYDRERER fra localStorage, så nymarkerte kapitler er synlige (regresjon #16)', async () => {
    setupDom(MAP_DOM);
    // SSR-en rendrer fra serveren; denne lesingen har ikke rukket å synke.
    localStorage.setItem(
      'bible-reading-progress',
      JSON.stringify({ '1-2': { firstAt: 1, lastAt: 1, count: 1, opens: 1 } }),
    );
    await loadIsland('user');

    const cell = document.querySelector('[data-map-book="1"] [data-chapter="2"]') as HTMLElement;
    expect(cell.dataset.level).toBe('1');
  });

  test('bulk-markering med «vet ikke» lagrer uten tidspunkt', async () => {
    setupDom(MAP_DOM);
    await loadIsland('user');

    (document.querySelector('[data-mark-book="1"]') as HTMLButtonElement).click();
    expect((document.querySelector('[data-map-when]') as HTMLElement).hidden).toBe(false);
    (document.querySelector('[data-map-when-unknown]') as HTMLButtonElement).click();

    const stored = JSON.parse(localStorage.getItem('bible-reading-progress')!);
    expect(Object.keys(stored).sort()).toEqual(['1-1', '1-2', '1-3']);
    expect(stored['1-1'].lastAt).toBeNull();
    expect(stored['1-1'].count).toBe(1);
  });

  test('bulk-markering med årstall setter et tidspunkt i det året', async () => {
    setupDom(MAP_DOM);
    await loadIsland('user');

    (document.querySelector('[data-mark-book="1"]') as HTMLButtonElement).click();
    const year = document.querySelector('[data-map-when-year]') as HTMLSelectElement;
    expect(year.options.length).toBeGreaterThan(10);
    year.value = '2019';
    (document.querySelector('[data-map-when-ok]') as HTMLButtonElement).click();

    const stored = JSON.parse(localStorage.getItem('bible-reading-progress')!);
    expect(new Date(stored['1-1'].lastAt).getUTCFullYear()).toBe(2019);
  });

  test('bulk-markering maler cellene umiddelbart', async () => {
    setupDom(MAP_DOM);
    await loadIsland('user');

    (document.querySelector('[data-mark-book="1"]') as HTMLButtonElement).click();
    (document.querySelector('[data-map-when-unknown]') as HTMLButtonElement).click();

    const levels = [...document.querySelectorAll('.map-cell')].map((c) => (c as HTMLElement).dataset.level);
    expect(levels).toEqual(['1', '1', '1']);
  });
});
