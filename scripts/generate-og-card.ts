// Rastrerer delekortet (#65, #68): `assets/og/card.html` → to sett artefakter.
//
//     bun scripts/generate-og-card.ts
//
//   1. `public/og.png` — det GENERISKE kortet, hele flatas gulv (#65).
//   2. `assets/og/generated/` — delene kapittelkortet settes sammen av per
//      forespørsel (#68): bakgrunnen som RÅ RGB, ett alfabilde per bokstav i
//      de to skriftene malen bruker, og malens mål (plass, grunnlinje, farge,
//      kerning).
//
// Kortet er et BILDE fordi en skraper ikke kan rendre HTML — men KILDEN er
// HTML, så identiteten kan leses, endres og diffes som alt annet. En binær
// fil noen laget i et bilderedigeringsprogram er ikke vedlikeholdbar; da er
// neste endring en ny fil ingen kan sammenligne med den forrige.
//
// **Hvorfor bokstaver og ikke ferdige kort:** kapittelkortet bærer boknavnet
// på leserens språk, altså 1189 kapitler × 8 språk = 9512 bilder. Som ferdige
// filer er det ~200 MB derivert binær i git. Som bokstaver er det ~120 tegn,
// og kortet settes sammen på ~10 ms i `src/lib/og-card.ts` — uten Chrome i
// prod-imaget, som er det andre alternativet saken satte opp (se
// `og-card.ts` for hvorfor begge var stengt).
//
// Rastreringen bruker samme headless Chrome som layout-vakta, av samme grunn
// (minimal-deps): Bun har prosess-spawning og WebSocket innebygd, og
// alternativet er et avhengighetstre på flere hundre pakker i deploy-porten.
//
// Skriptet er UTVIKLINGSVERKTØY, ikke en del av deployen — malen er en
// brand-ressurs som endrer seg omtrent aldri, og artefaktene ligger i git.
// Kjør det når `assets/og/card.html`, identiteten i `portal/STYLE.md` eller
// et BOKNAVN endres, og commit resultatet.
//
// Vaktene er `test/share-card.test.ts` (det generiske kortet) og
// `test/og-chapter-card.test.ts` (kapittelkortet, inkludert at malen har et
// tegn for hvert boknavn på hvert språk).

import { mkdirSync } from 'node:fs';
import { gzipSync, inflateSync } from 'node:zlib';
import { booksData } from '../src/lib/books-data.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { chapterCardText } from '../src/lib/og-card.ts';
import { Chrome, type Page } from '../test/chrome-cdp.ts';

const WIDTH = 1200;
const HEIGHT = 630;

const source = new URL('../assets/og/card.html', import.meta.url);
const generic = new URL('../public/og.png', import.meta.url);
const outDir = new URL('../assets/og/generated/', import.meta.url);

/**
 * Tegnsettet malen må ha, utledet av DATAENE framfor av en håndskrevet liste:
 * hvert boknavn på hvert språk, og hvert kapittelledd. En ny locale eller et
 * rettet boknavn slår gjennom uten at noen husker å utvide et alfabet.
 */
function charsets(): Record<string, Set<string>> {
  const sets: Record<string, Set<string>> = { book: new Set(), chapter: new Set() };
  for (const book of booksData) {
    for (const locale of LOCALES) {
      // Kapittel 188 finnes ikke, men sifrene skal være der uansett tall.
      const [navn, kapittel] = chapterCardText(book.id, 1234567890, locale);
      for (const ch of navn) sets.book.add(ch);
      for (const ch of kapittel) sets.chapter.add(ch);
    }
  }
  for (const ch of '0123456789 ') {
    sets.book.add(ch);
    sets.chapter.add(ch);
  }
  return sets;
}

/** Minimal PNG-dekoder — nok til å lese Chromes egen skjermdump. */
function decodePng(bytes: Uint8Array): { rgb: Uint8Array; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (pos < bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const depth = data[8];
      const colorType = data[9];
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) {
        throw new Error(`Uventet PNG: dybde ${depth}, fargetype ${colorType}, interlace ${data[12]}`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const komprimert = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let i = 0;
  for (const d of idat) {
    komprimert.set(d, i);
    i += d.length;
  }
  const raw = new Uint8Array(inflateSync(komprimert));
  const stride = width * channels;
  const ut = new Uint8Array(width * height * 3);
  const rad = new Uint8Array(stride);
  const forrige = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rad[x - channels] : 0;
      const b = forrige[x];
      const c = x >= channels ? forrige[x - channels] : 0;
      let verdi = src[x];
      if (filter === 1) verdi += a;
      else if (filter === 2) verdi += b;
      else if (filter === 3) verdi += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        verdi += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rad[x] = verdi & 0xff;
    }
    for (let x = 0; x < width; x++) {
      ut[(y * width + x) * 3] = rad[x * channels];
      ut[(y * width + x) * 3 + 1] = rad[x * channels + 1];
      ut[(y * width + x) * 3 + 2] = rad[x * channels + 2];
    }
    forrige.set(rad);
  }
  return { rgb: ut, width, height };
}

interface MåltSlot {
  x: number;
  baseline: number;
  maxWidth: number;
  lineHeight: number;
  color: [number, number, number];
  font: string;
  /** Canvas' `font`-shorthand kjenner ikke `letter-spacing` — den settes for seg. */
  letterSpacing: string;
}

/**
 * Måler slottene i malen: grunnlinja med strut-trikset (en tom inline-block
 * som er justert til baseline, altså har toppen sin NØYAKTIG der), plassen,
 * skrifta og fargen. Da eier HTML-en fortsatt layouten — skriptet kopierer
 * den bare ut.
 */
async function measureSlots(page: Page): Promise<Record<string, MåltSlot>> {
  return page.evaluate(() => {
    const ut: Record<string, unknown> = {};
    for (const el of document.querySelectorAll<HTMLElement>('[data-og-slot]')) {
      const strut = document.createElement('span');
      strut.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      el.appendChild(strut);
      const stil = getComputedStyle(el);
      const kasse = el.getBoundingClientRect();
      const farge = stil.color.match(/\d+/g)!.map(Number).slice(0, 3);
      ut[el.dataset.ogSlot!] = {
        x: Math.round(kasse.left + parseFloat(stil.paddingLeft)),
        baseline: strut.getBoundingClientRect().top,
        maxWidth: Math.round(kasse.width - parseFloat(stil.paddingLeft) - parseFloat(stil.paddingRight)),
        lineHeight: parseFloat(stil.lineHeight),
        color: farge,
        font: `${stil.fontStyle} ${stil.fontWeight} ${stil.fontSize} ${stil.fontFamily}`,
        letterSpacing: stil.letterSpacing === 'normal' ? '0px' : stil.letterSpacing,
      };
      strut.remove();
    }
    return ut;
  }) as Promise<Record<string, MåltSlot>>;
}

/**
 * Rastrerer hvert tegn i skrifta slottet bruker, og måler kerningen for hvert
 * par. Alt skjer i SIDEN, i den samme Chrome som tegner bakgrunnen, så
 * bokstavene er de samme pikslene malen ville gitt.
 */
async function rasterizeGlyphs(page: Page, font: string, letterSpacing: string, chars: string[]) {
  return page.evaluate(
    (font: string, letterSpacing: string, chars: string[]) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')! as CanvasRenderingContext2D & { letterSpacing: string };
      const skrift = () => {
        ctx.font = font;
        ctx.letterSpacing = letterSpacing;
      };
      const pad = 8;
      const glyphs: Record<string, unknown> = {};
      const bilder: string[] = [];

      for (const ch of chars) {
        skrift();
        const m = ctx.measureText(ch);
        const adv = m.width;
        if (ch === ' ') {
          glyphs[ch] = { w: 0, h: 0, left: 0, top: 0, adv, data: '' };
          continue;
        }
        const left = Math.floor(-m.actualBoundingBoxLeft) - 1;
        const top = Math.ceil(m.actualBoundingBoxAscent) + 1;
        const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2;
        const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2;
        canvas.width = w + pad * 2;
        canvas.height = h + pad * 2;
        skrift();
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#000';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillText(ch, pad - left, pad + top);
        const bilde = ctx.getImageData(pad, pad, w, h).data;
        const alfa = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) alfa[i] = bilde[i * 4 + 3];
        let s = '';
        for (let i = 0; i < alfa.length; i += 4096) s += String.fromCharCode(...alfa.subarray(i, i + 4096));
        glyphs[ch] = { w, h, left, top, adv, data: btoa(s) };
        bilder.push(ch);
      }

      // Kerning: differansen mellom paret og de to tegnene hver for seg. Uten
      // den står «Ta» med et hull i, og et delekort er tekst i stort.
      skrift();
      const kern: Record<string, number> = {};
      const bredde = new Map(chars.map((c) => [c, ctx.measureText(c).width]));
      for (const a of chars) {
        for (const b of chars) {
          const k = ctx.measureText(a + b).width - bredde.get(a)! - bredde.get(b)!;
          if (Math.abs(k) > 0.01) kern[a + b] = Math.round(k * 100) / 100;
        }
      }
      return { glyphs, kern };
    },
    font,
    letterSpacing,
    chars,
  );
}

const chrome = await Chrome.launch();
try {
  const page = await chrome.open(source.href);
  // Viewportet SETTES etter navigasjonen og uten mobil-emulering: kortet er en
  // fast flate uten `<meta viewport>`, og en telefon-emulering ville lagt på et
  // 980 px standardviewport i stedet for de 1200 vi ber om.
  await page.setViewport({ width: WIDTH, height: HEIGHT, mobile: false });

  // Chrome tegner med fallback-skriften til woff2-fila er dekodet. Uten denne
  // ventingen er kortet systemskrift halvparten av gangene — og ingen test
  // hadde sett det, for målene er riktige uansett.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  // ── 1. Det generiske kortet (#65) ──────────────────────────────────────
  const png = await page.screenshot();
  await Bun.write(generic, png);
  const { width: gw, height: gh } = decodePng(png);
  if (gw !== WIDTH || gh !== HEIGHT) {
    throw new Error(`Kortet ble ${gw}x${gh}, ikke ${WIDTH}x${HEIGHT}. Sidemalen deklarerer de siste.`);
  }
  console.log(`Skrev public/og.png — ${gw}x${gh}, ${(png.byteLength / 1024).toFixed(1)} kB`);

  // ── 2. Kapittelvarianten (#68) ─────────────────────────────────────────
  await page.evaluate(() => {
    document.body.className = 'chapter';
    return undefined;
  });
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        requestAnimationFrame(() => requestAnimationFrame(() => res()));
      }),
  );

  const målt = await measureSlots(page);
  const sett = charsets();
  for (const navn of Object.keys(målt)) {
    if (!sett[navn]) throw new Error(`Malen har et slott «${navn}» uten et tegnsett i charsets().`);
  }

  // Teksten skjules FØR bakgrunnen rastreres — men blir stående, så
  // høydene i layouten er de samme som da slottene ble målt.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-og-slot]')) el.style.visibility = 'hidden';
    return undefined;
  });
  const bakgrunn = decodePng(await page.screenshot());
  if (bakgrunn.width !== WIDTH || bakgrunn.height !== HEIGHT) {
    throw new Error(`Bakgrunnen ble ${bakgrunn.width}x${bakgrunn.height}, ikke ${WIDTH}x${HEIGHT}.`);
  }

  const biter: Uint8Array[] = [];
  let offset = 0;
  const slots: Record<string, unknown> = {};
  for (const [navn, slot] of Object.entries(målt)) {
    const chars = [...sett[navn]].sort();
    const { glyphs, kern } = await rasterizeGlyphs(page, slot.font, slot.letterSpacing, chars);
    const ut: Record<string, unknown> = {};
    for (const [ch, g] of Object.entries(glyphs as Record<string, any>)) {
      const alfa = Uint8Array.from(atob(g.data), (c) => c.charCodeAt(0));
      ut[ch] = { w: g.w, h: g.h, left: g.left, top: g.top, adv: g.adv, off: offset };
      biter.push(alfa);
      offset += alfa.length;
    }
    slots[navn] = {
      x: slot.x,
      baseline: slot.baseline,
      maxWidth: slot.maxWidth,
      lineHeight: slot.lineHeight,
      color: slot.color,
      glyphs: ut,
      kern,
    };
    console.log(`Slott «${navn}»: ${chars.length} tegn, ${Object.keys(kern).length} kerningpar (${slot.font})`);
  }

  const atlas = new Uint8Array(offset);
  let i = 0;
  for (const b of biter) {
    atlas.set(b, i);
    i += b.length;
  }

  mkdirSync(outDir, { recursive: true });
  await Bun.write(new URL('card.json', outDir), JSON.stringify({ width: WIDTH, height: HEIGHT, slots }, null, 2));
  await Bun.write(new URL('card-bg.rgb.gz', outDir), gzipSync(bakgrunn.rgb, { level: 9 }));
  await Bun.write(new URL('card-atlas.bin.gz', outDir), gzipSync(atlas, { level: 9 }));
  console.log(
    `Skrev assets/og/generated/ — bakgrunn ${(bakgrunn.rgb.length / 1024).toFixed(0)} kB rå, ` +
      `atlas ${(atlas.length / 1024).toFixed(0)} kB rå (begge gzippet på disk)`,
  );
} finally {
  await chrome.close();
}
