// HJELPEMIDLENE PÅ MOBIL (#94)
//
// Studiepanelet er en KOLONNE ved siden av teksten på desktop. Under 1100 px
// har grid-en to spor og tre barn, så panelet falt ned under teksten: på en
// 390 px-skjerm lå 792 px med oppslag, sammendrag og personer 4632 px nede,
// altså etter hele kapittelet. ▥ i bunnlinja åpnet det samme innholdet i et
// overlegg — men overlegget lå på `z-index: 80` under den KLEBENDE headeren
// (`z-index: 500`), så overleggets egen tittel og ✕ lå bak headeren. Målt:
// `elementFromPoint` på ✕-knappen ga headerens hamburgermeny. Leseren kunne
// altså åpne panelet og ikke lukke det igjen.
//
// Vakta er formulert på UTFALLET, ikke på klassenavn eller piksler:
//
//   VEIEN     — ved enhver bredde er hjelpemidlene enten en del av layouten
//               ELLER én tapp unna; de ligger aldri under teksten.
//   FLATA     — overlegget er hele veien synlig og lar seg lukke (målt med
//               treffprøve, ikke med `z-index`-tall: en klasse stilarket ikke
//               honorerer ser riktig ut i HTML-en og endrer ingenting for
//               leseren, #55).
//   INNHOLDET — alle fanene i panelet er nåbare der overlegget er eneste vei
//               inn, og innholdet er i behold etter at det er lukket.
//
// Utslaget er stille som i #45, #70 og #90: sida svarer 200, ingen loggrad —
// bare den som holder telefonen ser det.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Kapittel med innhold i alle fire panelfanene (personer, tidslinje, …). */
const CHAPTER = '/nb/joh/3';

/** Bredder der panelet IKKE er en kolonne — der må ▥ være veien inn. */
const NARROW = [
  { width: 320, height: 693, name: '320 px (SE / Display Zoom)' },
  { width: 390, height: 844, name: '390 px (iPhone 14/15)' },
  { width: 900, height: 844, name: '900 px (nettbrett)' },
];

/** Bredde der panelet ER en kolonne — ellers ville «slett panelet» bestått. */
const WIDE = { width: 1280, height: 900 };

let server: ReturnType<typeof Bun.serve>;
let chrome: Chrome;
let page: Page;

beforeAll(async () => {
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  chrome = await Chrome.launch();
  page = await chrome.open('about:blank');
}, 60_000);

afterAll(async () => {
  await page?.close();
  await chrome?.close();
  server?.stop(true);
  await closeSql();
}, 30_000);

const url = () => `http://localhost:${server.port}${CHAPTER}`;

/** Åpner studieoverlegget slik leseren gjør — ved å trykke på knappen. */
function openPanel() {
  (document.querySelector('[data-open-studium]') as HTMLElement | null)?.click();
}

describe('VEIEN — hjelpemidlene ligger aldri under teksten', () => {
  for (const vp of NARROW) {
    test(`${vp.name}: panelet er ute av flyten, og én tapp unna`, async () => {
      await page.setViewport({ width: vp.width, height: vp.height, mobile: vp.width < 700 });
      await page.navigate(url());

      const målt = await page.evaluate(() => {
        const panel = document.querySelector('.study-panel');
        const content = document.querySelector('.chapter-content')!;
        const opener = document.querySelector('[data-open-studium]');
        const synlig = (el: Element | null) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const cr = content.getBoundingClientRect();
        const pr = panel?.getBoundingClientRect();
        return {
          panelSynlig: synlig(panel ?? null),
          panelUnderTeksten: !!pr && pr.top + scrollY >= cr.bottom + scrollY - 1 && pr.height > 0,
          åpnerSynlig: synlig(opener),
        };
      });

      expect(målt.panelUnderTeksten).toBe(false);
      expect(målt.panelSynlig).toBe(false);
      expect(målt.åpnerSynlig).toBe(true);
    });
  }

  test('på desktop er panelet fortsatt en kolonne ved siden av teksten', async () => {
    await page.setViewport({ ...WIDE, mobile: false });
    await page.navigate(url());

    const målt = await page.evaluate(() => {
      const panel = document.querySelector('.study-panel')!;
      const content = document.querySelector('.chapter-content')!;
      const pr = panel.getBoundingClientRect();
      const cr = content.getBoundingClientRect();
      return { bredde: pr.width, høyde: pr.height, vedSidenAv: pr.left >= cr.right - 1 };
    });

    expect(målt.bredde).toBeGreaterThan(0);
    expect(målt.høyde).toBeGreaterThan(0);
    expect(målt.vedSidenAv).toBe(true);
  });
});

describe('FLATA — overlegget er synlig hele veien, og lar seg lukke', () => {
  test('overleggets topp ligger ikke bak chromen, og ✕ er treffbar', async () => {
    await page.setViewport({ width: 390, height: 844 });
    await page.navigate(url());

    const målt = await page.evaluate((åpne: string) => {
      eval(`(${åpne})()`);
      const overlay = document.querySelector('[data-studium-overlay]') as HTMLElement;
      const lukk = overlay.querySelector('[data-close-overlay]') as HTMLElement;
      // Treffprøve: hva ville fingeren faktisk truffet? Et `z-index`-tall sier
      // ingenting hvis noe annet ligger over.
      const treff = (el: Element) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { inne: !!top && (el === top || el.contains(top) || top.contains(el)), fikk: top?.className ?? null };
      };
      const header = overlay.querySelector('.studium-overlay-header') as HTMLElement;
      return {
        synlig: !overlay.hidden,
        lukkTreff: treff(lukk),
        headerTreff: treff(header),
        overlayBredere: overlay.scrollWidth > document.documentElement.clientWidth,
      };
    }, openPanel.toString());

    expect(målt.synlig).toBe(true);
    expect(målt.lukkTreff.inne).toBe(true);
    expect(målt.headerTreff.inne).toBe(true);
    expect(målt.overlayBredere).toBe(false);
  });

  test('et trykk på ✕ lukker overlegget og gir sida tilbake', async () => {
    await page.setViewport({ width: 390, height: 844 });
    await page.navigate(url());

    const målt = await page.evaluate((åpne: string) => {
      eval(`(${åpne})()`);
      const overlay = document.querySelector('[data-studium-overlay]') as HTMLElement;
      const lukk = overlay.querySelector('[data-close-overlay]') as HTMLElement;
      const r = lukk.getBoundingClientRect();
      // Trykk der fingeren treffer — ikke på noden vi selv fant.
      const truffet = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
      truffet?.click();
      return {
        lukket: overlay.hidden,
        kroppRullerIgjen: document.body.style.overflow !== 'hidden',
        panelTilbake: !!document.querySelector('[data-sidebar-content] .study-panel'),
      };
    }, openPanel.toString());

    expect(målt.lukket).toBe(true);
    expect(målt.kroppRullerIgjen).toBe(true);
    expect(målt.panelTilbake).toBe(true);
  });
});

describe('INNHOLDET — alle fanene er nåbare der overlegget er eneste vei inn', () => {
  test('hver fane viser sin egen seksjon inne i overlegget', async () => {
    await page.setViewport({ width: 390, height: 844 });
    await page.navigate(url());

    const målt = await page.evaluate((åpne: string) => {
      eval(`(${åpne})()`);
      const overlay = document.querySelector('[data-studium-overlay]') as HTMLElement;
      const faner = Array.from(overlay.querySelectorAll('[data-panel-tab]')) as HTMLElement[];
      const resultat = faner.map((fane) => {
        fane.click();
        const n = fane.dataset.panelTab;
        const seksjon = overlay.querySelector(`[data-panel-section="${n}"]`) as HTMLElement | null;
        const r = seksjon?.getBoundingClientRect();
        return {
          n,
          faneSynlig: fane.getBoundingClientRect().height > 0,
          seksjonSynlig: !!r && r.width > 0 && r.height > 0,
        };
      });
      return { antall: faner.length, resultat, seksjoner: overlay.querySelectorAll('[data-panel-section]').length };
    }, openPanel.toString());

    expect(målt.antall).toBeGreaterThan(1);
    expect(målt.antall).toBe(målt.seksjoner);
    for (const r of målt.resultat) {
      expect({ n: r.n, faneSynlig: r.faneSynlig, seksjonSynlig: r.seksjonSynlig }).toEqual({
        n: r.n,
        faneSynlig: true,
        seksjonSynlig: true,
      });
    }
  });

  test('innholdet overlever å bli lukket og åpnet på nytt', async () => {
    await page.setViewport({ width: 390, height: 844 });
    await page.navigate(url());

    const målt = await page.evaluate((åpne: string) => {
      const antall = () => {
        const overlay = document.querySelector('[data-studium-overlay]') as HTMLElement;
        return {
          faner: overlay.querySelectorAll('[data-panel-tab]').length,
          seksjoner: overlay.querySelectorAll('[data-panel-section]').length,
        };
      };
      // Hvor fanerada STO før den ble flyttet — den skal tilbake dit, ikke bare
      // tilbake i sidebaren: står den inne i det rullende innholdet, mister den
      // plassen sin over seksjonene i panelmodus på desktop.
      const plass = () => {
        const tb = document.querySelector('[data-panel-tabbar]');
        return {
          forelder: tb?.parentElement?.className ?? null,
          nesteSøsken: (tb?.nextElementSibling as HTMLElement | null)?.className ?? null,
        };
      };
      const førPlass = plass();
      eval(`(${åpne})()`);
      const første = antall();
      (document.querySelector('[data-studium-overlay] [data-close-overlay]') as HTMLElement).click();
      const ettersida = {
        faner: document.querySelectorAll('.reading-sidebar [data-panel-tab]').length,
        seksjoner: document.querySelectorAll('[data-sidebar-content] [data-panel-section]').length,
      };
      const etterPlass = plass();
      eval(`(${åpne})()`);
      return { første, ettersida, andre: antall(), førPlass, etterPlass };
    }, openPanel.toString());

    expect(målt.første.faner).toBeGreaterThan(0);
    expect(målt.ettersida).toEqual(målt.første);
    expect(målt.andre).toEqual(målt.første);
    expect(målt.etterPlass).toEqual(målt.førPlass);
  });
});
