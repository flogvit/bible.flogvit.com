// COPYRIGHT-EN SKAL IKKE HENGE ALENE TIL HØYRE NÅR RADEN BREKKES (#93)
//
// Den faste legal-raden (portal/FOOTER.md) er merke · Vilkår · Personvern ·
// Konto · © år. På en 1280 px skjerm får alt plass på én linje, og da er
// copyright-en høyrestilt med vilje. På en telefon får den ikke plass: den
// brekkes ned på egen linje — og et `margin-left: auto` skjøv den da helt ut
// til høyre, altså inn under høyre ende av lenkene, innrykket fra alt annet i
// footeren. Målt før fiksen: 390 px ga note-linja venstrekant 239 av en 350 px
// rad, 320 px ga 169 av 280.
//
// `margin-left: auto` kan ikke skille «deler linje» fra «brekket ned», og et
// `@media`-brekkpunkt i px kjenner ikke leserens tekststørrelse — som er
// nettopp aksen der raden brekkes tidligere. Derfor er invarianten formulert på
// LINJENE: hver linje i raden begynner på radens venstrekant, uansett hvor
// mange linjer den ble.
//
// Hvorfor en ekte nettleser: hvilken linje noe havner på er en egenskap ved
// rendringen. SSR-HTML har ingen layout, og happy-dom gir nuller fra
// `getBoundingClientRect()`. Utslaget er stille som i #45, #70 og #90 — sida
// svarer 200 og skriver ingen loggrad; bare den som holder telefonen ser det.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { DICTIONARIES } from '../src/lib/dictionaries.ts';
import { LOCALES, type Locale } from '../src/lib/i18n.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Nøklene som utgjør legal-lenkene i raden — det oversettelsen legger til. */
const ROW_KEYS = ['foot.terms', 'foot.privacy', 'foot.account'] as const;

/**
 * Språket velges av DATAENE, ikke for hånd (som #70, #80 og #84): raden brekkes
 * først på det språket som skriver den lengst, og engelsk — basespråket — er
 * nettopp det korteste vi har. `nb` måles i tillegg fordi det er flata saken er
 * meldt på.
 */
function widestLocale(): Locale {
  const width = (l: Locale) =>
    ROW_KEYS.reduce((n, k) => n + ((DICTIONARIES[l] as Record<string, string>)[k] ?? '').length, 0);
  return [...LOCALES].sort((a, b) => width(b) - width(a) || a.localeCompare(b))[0]!;
}

const MOBILE = [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
];
/** Tekstforstørrelse fra telefonens tilgjengelighetsinnstillinger, ikke zoom. */
const SCALES = [1, 1.5];

/** Chrome runder til hele piksler. */
const TOLERANCE = 1;

interface Line {
  left: number;
  right: number;
  texts: string[];
}
interface RowMeasurement {
  rowLeft: number;
  rowRight: number;
  lines: Line[];
  noteLine: number;
  wordmarkLine: number;
  legalLinks: number;
  noteText: string;
  /** Avstanden fra merkets høyre kant til første legal-lenke, og radens gap. */
  wordmarkToLinks: number | null;
  columnGap: number;
}

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
 * Grupperer det som BÆRER TEKST i raden i visuelle linjer, ved loddrett
 * overlapp — ikke ved eksakt `top`. Postene er grunnlinjejustert, så merket og
 * lenkene står på ulik `top` på SAMME linje.
 *
 * Den kjenner ingen klassenavn utover raden selv, så et nytt ledd i den faste
 * raden blir målt uten at noen har ført det opp.
 */
function measureRow(): RowMeasurement | null {
  const row = document.querySelector('.site-footer-legal');
  if (!row) return null;
  const rr = row.getBoundingClientRect();
  const cs = getComputedStyle(row);

  const boxes = [...row.querySelectorAll('*')]
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim()))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        text: (el.textContent ?? '').trim(),
        note: el.classList.contains('site-footer-note'),
        wordmark: !!el.closest('.fv-wordmark'),
      };
    })
    .filter((b) => b.right > b.left)
    .sort((a, b) => a.top - b.top);

  const lines: { top: number; bottom: number; left: number; right: number; texts: string[] }[] = [];
  let noteLine = -1;
  let wordmarkLine = -1;
  for (const b of boxes) {
    let i = lines.findIndex((l) => b.top < l.bottom && b.bottom > l.top);
    if (i < 0) {
      lines.push({ top: b.top, bottom: b.bottom, left: b.left, right: b.right, texts: [b.text] });
      i = lines.length - 1;
    } else {
      const l = lines[i]!;
      l.top = Math.min(l.top, b.top);
      l.bottom = Math.max(l.bottom, b.bottom);
      l.left = Math.min(l.left, b.left);
      l.right = Math.max(l.right, b.right);
      l.texts.push(b.text);
    }
    if (b.note) noteLine = i;
    if (b.wordmark) wordmarkLine = i;
  }

  const wordmark = row.querySelector('.fv-wordmark');
  const links = row.querySelector('.site-footer-legalnav');

  return {
    rowLeft: rr.left + parseFloat(cs.paddingLeft),
    rowRight: rr.right - parseFloat(cs.paddingRight),
    lines: lines.map((l) => ({ left: l.left, right: l.right, texts: l.texts })),
    noteLine,
    wordmarkLine,
    legalLinks: row.querySelectorAll('.site-footer-legalnav a').length,
    noteText: row.querySelector('.site-footer-note')?.textContent?.trim() ?? '',
    wordmarkToLinks:
      wordmark && links
        ? links.getBoundingClientRect().left - wordmark.getBoundingClientRect().right
        : null,
    columnGap: parseFloat(cs.columnGap) || 0,
  };
}

/** Forstørrer BARE skriftstørrelsen, slik telefonens tekstskalering gjør. */
function scaleText(factor: number) {
  const els = [...document.querySelectorAll('*')] as HTMLElement[];
  const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
  els.forEach((el, i) => {
    if (sizes[i]) el.style.fontSize = `${sizes[i]! * factor}px`;
  });
}

async function measure(locale: Locale, vp: { width: number; height: number }, scale: number) {
  await page.setViewport({ ...vp, mobile: vp.width < 500 });
  await page.navigate(`http://localhost:${server.port}/${locale}/`);
  if (scale !== 1) await page.evaluate(scaleText, scale);
  const m = await page.evaluate(measureRow);
  expect(m, 'fant ingen .site-footer-legal å måle').not.toBeNull();
  return m!;
}

const WIDEST = widestLocale();
const LOCALES_MEASURED: Locale[] = WIDEST === 'nb' ? ['nb'] : ['nb', WIDEST];

describe('legal-raden i footeren brekkes ikke skjevt (#93)', () => {
  // ROLLENE: uten alle tre måler de to halvdelene under ingenting — en rad uten
  // copyright har heller ingen linje som kan henge feil.
  test('raden har merke, de tre legal-lenkene og copyright', async () => {
    const m = await measure('nb', MOBILE[1]!, 1);
    expect(m.wordmarkLine).toBeGreaterThanOrEqual(0);
    expect(m.legalLinks).toBe(3);
    expect(m.noteText).toMatch(/©\s*\d{4}\s*FLOGVIT/);
    expect(m.noteLine).toBeGreaterThanOrEqual(0);
  });

  // MOBIL: sakens eget symptom. Hver linje begynner på venstrekanten, uansett
  // hvor mange linjer raden ble.
  for (const locale of LOCALES_MEASURED) {
    for (const vp of MOBILE) {
      for (const scale of SCALES) {
        test(`/${locale}/ på ${vp.width} px ved ${scale * 100} % tekst: ingen linje er innrykket`, async () => {
          const m = await measure(locale, vp, scale);
          for (const line of m.lines) {
            expect(
              line.left - m.rowLeft,
              `linja «${line.texts.join(' · ')}» begynner ${Math.round(line.left - m.rowLeft)} px ` +
                `inne i raden framfor på venstrekanten`,
            ).toBeLessThanOrEqual(TOLERANCE);
          }
        });
      }
    }
  }

  // BREKKES DEN I DET HELE TATT? Fikk alt plass på én linje, ville halvdelen
  // over vært en tom påstand.
  test('raden brekkes faktisk på en telefon', async () => {
    const m = await measure('nb', MOBILE[1]!, 1);
    expect(m.lines.length).toBeGreaterThan(1);
    expect(m.noteLine).not.toBe(m.wordmarkLine);
  });

  // BREDDEN ER IKKE AKSEN — TEKSTSTØRRELSEN ER. En bred skjerm med stor tekst
  // brekker raden like godt, og der ville en fiks bak `@media (max-width: 768px)`
  // latt copyright-en henge til høyre igjen. 200 % er dessuten den forstørrelsen
  // WCAG 1.4.4 krever at innholdet tåler.
  test('på 800 px ved 200 % tekst er ingen linje innrykket', async () => {
    await page.setViewport({ width: 800, height: 900, mobile: false });
    await page.navigate(`http://localhost:${server.port}/nb/`);
    await page.evaluate(scaleText, 2);
    const m = (await page.evaluate(measureRow))!;
    expect(m).not.toBeNull();
    expect(m.lines.length, 'raden skulle brekkes ved denne tekststørrelsen').toBeGreaterThan(1);
    for (const line of m.lines) {
      expect(
        line.left - m.rowLeft,
        `linja «${line.texts.join(' · ')}» begynner ${Math.round(line.left - m.rowLeft)} px inne i raden`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  // DESKTOP: deler copyright-en linje med resten, står den fortsatt til HØYRE.
  // Uten denne halvdelen ville «venstrestill den alltid» bestått, og da hadde
  // vi byttet bort et bevisst desktop-oppsett for å rette en telefon.
  for (const scale of SCALES) {
    test(`på 1280 px ved ${scale * 100} % tekst deler copyright-en linje og står til høyre`, async () => {
      await page.setViewport({ width: 1280, height: 900, mobile: false });
      await page.navigate(`http://localhost:${server.port}/nb/`);
      if (scale !== 1) await page.evaluate(scaleText, scale);
      const m = (await page.evaluate(measureRow))!;
      expect(m).not.toBeNull();
      expect(m.noteLine, 'copyright-en skal dele linje med merket på desktop').toBe(m.wordmarkLine);
      expect(Math.abs(m.lines[m.noteLine]!.right - m.rowRight)).toBeLessThanOrEqual(TOLERANCE);
      // Og lenkene står fortsatt INNTIL merket. Uten grupperingen ville
      // `space-between` spredt de tre postene utover hele bredden, altså rettet
      // telefonen ved å legge om desktop — en annen endring enn den saken ber om.
      expect(
        Math.abs(m.wordmarkToLinks! - m.columnGap),
        `legal-lenkene står ${Math.round(m.wordmarkToLinks!)} px fra merket, ` +
          `ikke radens ${m.columnGap} px`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});
