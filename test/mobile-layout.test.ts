// MOBIL-LAYOUT I EN EKTE NETTLESER — to kontrakter som begge handler om hva
// telefonen faktisk viser, og som ingen av de andre testnivåene kan se.
//
//   1. Ingen side er bredere enn skjermen (#50), heller ikke med stor tekst.
//   2. Chromen på mobil viser bare kontroller som betyr noe der (#51).
//
// Bakgrunn (#50): med tekstforstørrelse fra telefonens TILGJENGELIGHETS-
// innstillinger (Android: «Tekstskalering», 133–150 %) ble ti av ti målte sider
// bredere enn skjermen, verst kapittelsiden med +26 %. `/innstillinger` var
// 503 px på en 390 px-skjerm allerede ved 100 %.
//
// Tekstskalering er ikke sidezoom. Sidezoom forstørrer ALT proporsjonalt og går
// alltid bra; tekstskalering multipliserer bare skriftstørrelsen, mens bokser,
// `min-width`, `padding` og grid-spor står stille i px. Da vokser innholdet ut
// av kassa. Testen emulerer nettopp det: hver elements BEREGNEDE `font-size`
// ganges opp, layouten røres ikke.
//
// Hvorfor en ekte nettleser: bredde er en egenskap ved RENDRINGEN. De andre
// testnivåene kan ikke se dette — `page-contract.test.ts` leser SSR-HTML, og
// happy-dom har ingen layout-motor (`getBoundingClientRect()` gir nuller).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { DEFAULT_LOCALE, href } from '../src/lib/i18n.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { PAGES } from './pages.ts';

/**
 * 320 px dekker iPhone SE OG iOS' «Display Zoom», som krymper det logiske
 * viewportet i stedet for å skalere skriften — den andre aksen samme
 * innstilling kommer i. 390 px er en vanlig moderne iPhone.
 */
const VIEWPORTS = [
  { width: 320, height: 693, name: '320 px (SE / Display Zoom)' },
  { width: 390, height: 844, name: '390 px (iPhone 14/15)' },
];

/** 1 = uten forstørrelse. 1.5 er øvre enden av det Android tilbyr. */
const SCALES = [1, 1.5];

/** Chrome runder til hele piksler; 1 px slingring er avrunding, ikke overflyt. */
const TOLERANCE = 1;

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
}, 30_000);

/**
 * Måler i siden. Ganger opp hver elements beregnede `font-size` slik nettleseren
 * gjør ved tekstskalering, måler, og setter tilbake.
 */
function measure(scale: number) {
  const de = document.documentElement;
  const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
  const original = els.map((el) => el.style.fontSize);

  if (scale !== 1) {
    const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
    els.forEach((el, i) => {
      if (sizes[i]) el.style.fontSize = `${sizes[i]! * scale}px`;
    });
  }

  const clientWidth = de.clientWidth;
  const scrollWidth = de.scrollWidth;
  const offenders: { selector: string; right: number; minWidth: string; whiteSpace: string }[] = [];

  const label = (el: Element) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    return el.tagName.toLowerCase() + cls.slice(0, 2).map((c) => `.${c}`).join('');
  };
  /** Innhold i en egen sidelengs scroll-boks er ikke sidas skyld — det er løsningen. */
  const inScroller = (el: Element | null) => {
    for (let n = el?.parentElement ?? null; n && n !== de; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== 'visible') return true;
    }
    return false;
  };

  if (scrollWidth > clientWidth) {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      // Under 2 px er skjermleser-tekst (`.sr-only` er 1 px + `clip`). Den kan
      // ikke være ÅRSAKEN til at sida er bred, bare støy i diagnosen.
      if (r.width < 2 || !r.height || r.right <= clientWidth + 1 || inScroller(el)) continue;
      const cs = getComputedStyle(el);
      offenders.push({
        selector: label(el),
        right: Math.round(r.right),
        minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace,
      });
    }

    // Et for langt ORD har ingen element-rect å måle — teksten stikker ut av en
    // boks som selv er smal nok. Uten dette svarer vakta «for bred» og peker på
    // ingenting, og det er da man begynner å gjette.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue?.trim() || inScroller(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.right <= clientWidth + 1) continue;
      const cs = getComputedStyle(n.parentElement!);
      offenders.push({
        selector: `${label(n.parentElement!)} «${n.nodeValue.trim().slice(0, 30)}»`,
        right: Math.round(r.right),
        minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace,
      });
    }

    offenders.sort((a, b) => b.right - a.right);
  }

  if (scale !== 1) els.forEach((el, i) => (el.style.fontSize = original[i]!));

  return { clientWidth, scrollWidth, offenders: offenders.slice(0, 6) };
}

describe('mobil-layout: ingen side er bredere enn skjermen (#50)', () => {
  for (const p of PAGES) {
    test(
      `${p.path} — ${p.name}`,
      async () => {
        const [path, query] = p.path.split('?');
        const url = `http://localhost:${server.port}${href(DEFAULT_LOCALE, path!)}${query ? `?${query}` : ''}`;
        await page.navigate(url);

        for (const vp of VIEWPORTS) {
          await page.setViewport(vp);
          for (const scale of SCALES) {
            const m = await page.evaluate(measure, scale);
            const over = m.scrollWidth - m.clientWidth;
            if (over > TOLERANCE) {
              const worst = m.offenders
                .map((o) => `    ${o.selector} → høyre kant ${o.right} px (min-width: ${o.minWidth}, white-space: ${o.whiteSpace})`)
                .join('\n');
              throw new Error(
                `${p.path} er ${over} px for bred på ${vp.name} ved ${scale * 100} % tekst ` +
                  `(${m.scrollWidth} px i et ${m.clientWidth} px viewport).\n` +
                  `  Bredeste elementer:\n${worst}`,
              );
            }
            expect(over).toBeLessThanOrEqual(TOLERANCE);
          }
        }
      },
      60_000,
    );
  }
});

/**
 * #51: på mobil er `.chapter-layout` én kolonne uansett modus, så ▥ Panel
 * endret ingenting i layouten — den la bare på en fanerad, og bunnlinjas ▥ gjør
 * allerede det samme. ☰ Normal var bare «angre». Begge er skjult under 768 px;
 * 📖 Lesemodus står igjen som av/på-knapp, og den gjør noe reelt (skjuler
 * sidepanel, skinne og bunnlinje).
 *
 * Vakta sjekker BEGGE kantene av brekkpunktet. Bare mobil-siden ville bestått
 * like fint om noen skjulte knappene overalt — og da hadde desktop mistet tre
 * layouter som faktisk er forskjellige der.
 */
describe('mobil-chrome: bare kontroller som betyr noe (#51)', () => {
  const modeButtons = () => {
    const seen: Record<string, boolean> = {};
    for (const btn of document.querySelectorAll('[data-layout-modes] [data-mode]')) {
      seen[(btn as HTMLElement).dataset.mode!] = getComputedStyle(btn).display !== 'none';
    }
    return seen;
  };

  test('☰ og ▥ er skjult på mobil, 📖 står igjen', async () => {
    await page.navigate(`http://localhost:${server.port}${href(DEFAULT_LOCALE, '/1mos/1')}`);
    for (const width of [320, 390, 768]) {
      await page.setViewport({ width, height: 800 });
      const vis = await page.evaluate(modeButtons);
      expect([width, vis]).toEqual([width, { normal: false, reading: true, panel: false }]);
    }
  }, 60_000);

  test('alle tre finnes fortsatt på desktop, der modusene ER forskjellige', async () => {
    await page.navigate(`http://localhost:${server.port}${href(DEFAULT_LOCALE, '/1mos/1')}`);
    await page.setViewport({ width: 1280, height: 900 });
    expect(await page.evaluate(modeButtons)).toEqual({ normal: true, reading: true, panel: true });

    // Og de gir faktisk tre ULIKE layouter der — ellers er knappene like
    // meningsløse på desktop som de var på mobil.
    const columns = await page.evaluate(() => {
      const out: string[] = [];
      for (const mode of ['normal', 'reading', 'panel']) {
        (document.querySelector(`[data-layout-modes] [data-mode="${mode}"]`) as HTMLElement).click();
        out.push(getComputedStyle(document.querySelector('.chapter-layout')!).gridTemplateColumns);
      }
      (document.querySelector('[data-layout-modes] [data-mode="normal"]') as HTMLElement).click();
      return out;
    });
    expect(new Set(columns).size).toBe(3);
  }, 60_000);
});
