// LESEFLATA BRUKER HELE BREDDEN CHROMEN ALT HAR TATT (#78)
//
// Kapittelsida er tre deler — innholdsfortegnelse, tekst, studiepanel — og
// tekstdelen er den eneste av dem som er selve produktet. Den lå på 448 px
// lesbar tekst på en 1440 px skjerm, mens headeren over strakte seg 1192 px:
// 180 px dødt marg på HVER side av en flate som ikke hadde nok plass til
// teksten sin. Tre deler skal dele bredden headeren alt har annonsert, ikke en
// smalere en.
//
// Hvorfor en ekte nettleser: bredde er en egenskap ved RENDRINGEN. SSR-HTML har
// ingen layout, og happy-dom gir nuller fra `getBoundingClientRect()`. Og
// hvorfor DESKTOP: `mobile-layout.test.ts` måler at ingenting er for BREDT for
// skjermen; dette er den motsatte feilen, og den er bare synlig der det finnes
// plass til overs.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** To bredder, så et hardkodet tall ikke kan bestå. Begge over 1100 px, der
 *  studiepanelet fortsatt vises og layouten altså har alle tre delene. */
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
];

/** Chrome runder til hele piksler. */
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

/** Måler kantene til chromen og til de tre delene, i siden. */
function measure() {
  const box = (sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  };
  const headerEl = document.querySelector('.site-header-inner');
  if (!headerEl) return null;
  const hr = headerEl.getBoundingClientRect();
  const hcs = getComputedStyle(headerEl);
  const header = {
    left: hr.left + parseFloat(hcs.paddingLeft),
    right: hr.right - parseFloat(hcs.paddingRight),
  };

  const contentEl = document.querySelector('.chapter-content');
  const ccs = contentEl ? getComputedStyle(contentEl) : null;

  return {
    header,
    layout: box('.chapter-layout'),
    toc: box('.chapter-toc'),
    sidebar: box('.reading-sidebar'),
    content: box('.chapter-content'),
    // Den LESBARE bredden: kolonnen minus sitt eget innrykk. Det er dette
    // tallet leseren faktisk får tekst i.
    readable:
      contentEl && ccs
        ? (contentEl as HTMLElement).clientWidth - parseFloat(ccs.paddingLeft) - parseFloat(ccs.paddingRight)
        : null,
  };
}

describe('kapittelsida bruker headerens bredde (#78)', () => {
  for (const vp of VIEWPORTS) {
    test(`de tre delene spenner nøyaktig headerens innhold på ${vp.width} px`, async () => {
      await page.setViewport({ ...vp, mobile: false });
      await page.navigate(`http://localhost:${server.port}/nb/matt/5`);
      const m = await page.evaluate(measure);

      expect(m).not.toBeNull();
      expect(m!.layout).not.toBeNull();

      // Ikke smalere: da står leseflata og gir fra seg plass chromen alt bruker.
      // Ikke bredere: da er de to kantene i dokumentet uenige, og sida ser ut
      // som to sider oppå hverandre.
      expect(Math.abs(m!.layout!.left - m!.header.left)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(m!.layout!.right - m!.header.right)).toBeLessThanOrEqual(TOLERANCE);
    });

    test(`hele den ekstra bredden havner i TEKSTEN på ${vp.width} px`, async () => {
      await page.setViewport({ ...vp, mobile: false });
      await page.navigate(`http://localhost:${server.port}/nb/matt/5`);
      const m = await page.evaluate(measure);

      expect(m!.toc).not.toBeNull();
      expect(m!.sidebar).not.toBeNull();
      expect(m!.content).not.toBeNull();

      // Halvdelen over er oppfylt av enhver fiks som brer SIDA ut. Denne
      // krever at gevinsten når TEKSTDELEN: et tak på `.chapter-content` ville
      // gitt de ekstra pikslene til margen i stedet, og leseren merket
      // ingenting.
      const rest = m!.layout!.width - m!.toc!.width - m!.sidebar!.width;
      expect(m!.content!.width).toBeGreaterThanOrEqual(rest - TOLERANCE);

      // Og at det faktisk er tekst det er blitt plass til: den lesbare
      // kolonnen var 448 px før saken, på begge disse breddene.
      expect(m!.readable).toBeGreaterThan(500);
    });
  }
});
