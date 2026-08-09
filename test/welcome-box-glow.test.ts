// DEKOREN I VELKOMMENBOKSEN LIGGER BAK TEKSTEN (#90)
//
// `.home-continue::after` er en gyllen glød i hjørnet. Både den og innholdet er
// posisjonert UTEN z-index, og da avgjør DOM-rekkefølgen hva som havner øverst —
// et pseudo-element er sist, altså over alt annet. Gløden er dessuten
// ugjennomsiktig i midten (`--gold-soft` er en BLANDET farge, ikke en alfa), så
// den la et slør over teksten fra høyre hjørne og nedover. På mobil er kortet
// smalere enn sirkelen er bred, så sløret traff nesten hele boksen:
// «Start med 1. Mosebok 1» på den gylne knappen ble knapt lesbar.
//
// Hvorfor en ekte nettleser: dette er en egenskap ved MALINGEN. SSR-HTML har
// ingen lagdeling, happy-dom har ingen rendrer, og en `getComputedStyle` som
// leser `z-index: auto` sier ingenting om hva som havner øverst — det avgjøres
// av rekkefølgen mellom to posisjonerte lag. Utslaget er dessuten stille: sida
// svarer 200, det finnes ingen loggrad, og bare den som ser på skjermen merker
// at teksten er blass.
//
// Vakta er formulert på UTFALLET — «ikke ett piksel som ER tekst blir farget om
// av dekoren» — ikke på z-index. En fiks som flytter gløden, gjør den
// gjennomsiktig eller løser lagdelingen på en annen måte består like gjerne.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/**
 * To mobilbredder — 320 px dekker iPhone SE og iOS' «Display Zoom» — og én
 * desktopbredde. Feilen er verst på mobil, der kortet er smalere enn sirkelen
 * er bred, men lagdelingen er den samme overalt: en fiks som bare gjelder under
 * et brekkpunkt lar den stå igjen på skrivebordet. Begge temaene måles, for
 * gløden blandes med hver sin `--paper`.
 */
const FLATER = [
  { width: 320, height: 740, mobile: true, theme: 'light' },
  { width: 320, height: 740, mobile: true, theme: 'dark' },
  { width: 390, height: 844, mobile: true, theme: 'light' },
  { width: 390, height: 844, mobile: true, theme: 'dark' },
  { width: 1280, height: 900, mobile: false, theme: 'light' },
] as const;

/** Et piksel er GLYFKJERNE når det treffer tekstfargen på denne kanalavstanden. */
const KJERNE = 2;
/** Hvor mye dekoren får lov til å flytte et slikt piksel. Chrome runder. */
const SLINGRING = 6;

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

interface Måling {
  funn: { sel: string; kjerner: number; verst: number; ved: number[] }[];
  /** Piksler inne i kortet som dekoren faktisk maler. */
  malt: number;
}

/**
 * Sammenligner to skjermbilder av SAMME side — ett med dekoren, ett uten.
 *
 * Kjøres inne i siden: Chrome dekoder PNG-en for oss i et canvas, så vakta
 * slipper en egen PNG-dekoder.
 *
 * `kjerner` er posisjonene som i bildet UTEN dekor treffer elementets egen
 * `color` — altså glyfkjerner, ikke kantutjevning. Kantpiksler er blandet med
 * bakgrunnen og SKAL endre seg når en glød ligger bak dem; det er nettopp
 * forskjellen på «bak» og «over».
 */
async function sammenlign(medUrl: string, utenUrl: string, kjerneToleranse: number): Promise<Måling | null> {
  const last = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { ctx, w: img.width, h: img.height };
  };
  const med = await last(medUrl);
  const uten = await last(utenUrl);

  const boks = document.querySelector('.home-continue') as HTMLElement | null;
  if (!boks) return null;

  // Alle elementene i boksen som selv bærer tekst — ingen håndplukket liste, så
  // et nytt element i velkommenboksen måles uten at noen fører det opp.
  const tekstElementer = [...boks.querySelectorAll<HTMLElement>('*')].filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0),
  );

  const funn: Måling['funn'] = [];
  for (const el of tekstElementer) {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left);
    const y = Math.round(r.top);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > med.w || y + h > med.h) continue;
    const [fr = 0, fg = 0, fb = 0] = (getComputedStyle(el).color.match(/\d+/g) ?? []).map(Number);
    const a = med.ctx.getImageData(x, y, w, h).data;
    const b = uten.ctx.getImageData(x, y, w, h).data;

    let kjerner = 0;
    let verst = 0;
    let ved: number[] = [];
    for (let i = 0; i < b.length; i += 4) {
      const b0 = b[i] ?? 0;
      const b1 = b[i + 1] ?? 0;
      const b2 = b[i + 2] ?? 0;
      const erKjerne =
        Math.abs(b0 - fr) <= kjerneToleranse &&
        Math.abs(b1 - fg) <= kjerneToleranse &&
        Math.abs(b2 - fb) <= kjerneToleranse;
      if (!erKjerne) continue;
      kjerner++;
      const avvik = Math.max(
        Math.abs((a[i] ?? 0) - b0),
        Math.abs((a[i + 1] ?? 0) - b1),
        Math.abs((a[i + 2] ?? 0) - b2),
      );
      if (avvik > verst) {
        verst = avvik;
        const p = i / 4;
        ved = [x + (p % w), y + Math.floor(p / w)];
      }
    }
    const klasse = String(el.className || '').trim().split(/\s+/).filter(Boolean).join('.');
    funn.push({ sel: el.tagName.toLowerCase() + (klasse ? `.${klasse}` : ''), kjerner, verst, ved });
  }

  // Maler dekoren fortsatt noe i det hele tatt? Uten denne halvdelen ville
  // «slett gløden» bestått den over — og da er kortet blitt flatt for å slippe
  // unna et lag som lå feil vei.
  const rb = boks.getBoundingClientRect();
  const bx = Math.max(0, Math.round(rb.left));
  const by = Math.max(0, Math.round(rb.top));
  const bw = Math.min(med.w - bx, Math.round(rb.width));
  const bh = Math.min(med.h - by, Math.round(rb.height));
  const ma = med.ctx.getImageData(bx, by, bw, bh).data;
  const mb = uten.ctx.getImageData(bx, by, bw, bh).data;
  let malt = 0;
  for (let i = 0; i < ma.length; i += 4) {
    const skilnad = Math.max(
      Math.abs((ma[i] ?? 0) - (mb[i] ?? 0)),
      Math.abs((ma[i + 1] ?? 0) - (mb[i + 1] ?? 0)),
      Math.abs((ma[i + 2] ?? 0) - (mb[i + 2] ?? 0)),
    );
    if (skilnad > 2) malt++;
  }

  return { funn, malt };
}

/** PNG-bytene som en data-URL siden selv kan dekode i et canvas. */
function dataUrl(png: Uint8Array): string {
  let s = '';
  for (const b of png) s += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(s)}`;
}

/**
 * Åpner forsiden i et gitt tema, uten temaovergang.
 *
 * Temaet settes gjennom `fv-prefs`-cookien, som layouten leser FØR første paint
 * (`PREFS_READ_SNIPPET` i `layout.tsx`). Settes `data-fv-theme` etterpå i
 * stedet, ligger lenkene i en 0,15 s fargeovergang mens skjermbildet tas — og
 * da måler vakta en overgang framfor en glød.
 */
async function åpneForside(theme: string, vp: { width: number; height: number; mobile: boolean }) {
  await page.setViewport(vp);
  await page.navigate(`http://localhost:${server.port}/nb/`);
  await page.evaluate((t: string) => {
    document.cookie = `fv-prefs=${encodeURIComponent(JSON.stringify({ theme: t }))}; path=/`;
  }, theme);
  await page.navigate(`http://localhost:${server.port}/nb/`);
}

/** Tar bort dekoren, så vi har et bilde av hva teksten SKAL se ut som. */
async function skjulGlød() {
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '.home-continue::after { display: none !important; }';
    document.head.appendChild(s);
  });
}

/** Ett par skjermbilder av samme flate: med dekoren, og uten. */
async function mål(theme: string, vp: { width: number; height: number; mobile: boolean }): Promise<Måling> {
  await åpneForside(theme, vp);
  const med = dataUrl(await page.screenshot());
  await skjulGlød();
  const uten = dataUrl(await page.screenshot());
  const res = await page.evaluate(sammenlign, med, uten, KJERNE);
  if (!res) throw new Error('Fant ingen velkommenboks på forsiden — vakta måler ingenting.');
  return res;
}

describe('velkommenboksens glød ligger bak teksten (#90)', () => {
  for (const flate of FLATER) {
    const navn = `${flate.width} px, ${flate.theme}`;

    test(`ingen tekst i boksen tones av dekoren — ${navn}`, async () => {
      const { funn } = await mål(flate.theme, flate);

      // Måler vi noe i det hele tatt? Uten glyfkjerner ville påstanden under
      // vært tom — og en tom påstand er grønn uansett hvor gal sida er.
      const målte = funn.filter((f) => f.kjerner > 0);
      expect(målte.length).toBeGreaterThan(0);

      const blasse = målte.filter((f) => f.verst > SLINGRING);
      expect(blasse.map((f) => `${f.sel}: ${f.verst} kanaltrinn ved (${f.ved.join(', ')})`).join('\n')).toBe('');
    });

    test(`gløden maler fortsatt kortet — ${navn}`, async () => {
      const { malt } = await mål(flate.theme, flate);
      // Tallet har ingen mening utover null: dekoren skal SES. Sirkelen dekker
      // tusenvis av piksler, så terskelen er «mer enn en avrundingsfeil».
      expect(malt).toBeGreaterThan(500);
    });
  }
});

// Måler at målemetoden SER feilen. Uten denne kunne `KJERNE` eller `SLINGRING`
// vært satt så slapt at halvdelene over besto uansett hvor gal lagdelingen var.
test('en glød foran teksten gir rødt', async () => {
  const flate = FLATER[2];
  await åpneForside(flate.theme, flate);
  await page.evaluate(() => {
    // Gjeninnfører feilen: begge lagene tilbake til ren DOM-rekkefølge.
    const s = document.createElement('style');
    s.textContent =
      '.home-continue::after { z-index: auto !important; } .home-continue > * { z-index: auto !important; }';
    document.head.appendChild(s);
  });
  const med = dataUrl(await page.screenshot());
  await skjulGlød();
  const uten = dataUrl(await page.screenshot());

  const res = await page.evaluate(sammenlign, med, uten, KJERNE);
  const verst = Math.max(...res!.funn.filter((f) => f.kjerner > 0).map((f) => f.verst));
  expect(verst).toBeGreaterThan(SLINGRING);
});
