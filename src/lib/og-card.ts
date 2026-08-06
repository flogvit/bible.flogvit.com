// DELEKORT PER KAPITTEL (#68) — kortet som sier hvilket kapittel en delt lenke
// peker på.
//
// #65 ga flata ETT generisk kort. Det er gulvet, og det er kapittel- og
// verselenkene folk faktisk deler: en lenke til `/en/matt/5` skal vise
// «Matthew 5» på LENKENS eget språk, ikke bare merkenavnet.
//
// ── Hvorfor kortet tegnes her, og ikke rastreres ──────────────────────────
//
// Saken satte opp to veier, og BEGGE er stengt av noe som ikke står i den:
//
//   1. «Generér ved import, ~1200 kort på disk.» Kortet bærer boknavnet på
//      leserens språk (#69), så settet er 1189 kapitler × 8 språk = 9512
//      bilder, ikke 1200. Det er ~200 MB derivert binær i git, som må
//      regenereres for hver rettelse av et boknavn.
//   2. «Rastrér ved første treff og hurtiglagre.» Rastreringen er headless
//      Chrome. Prod-imaget er `oven/bun:1.3-slim` (se Dockerfile), og Chrome
//      hører ikke hjemme der: VM-CPU-en er den kjente flaskehalsen på denne
//      flata (#19, #64), og et Chrome-lag er ~1 GB på en disk som allerede
//      har tatt ned prod én gang.
//
// Veien som står igjen er å SETTE SAMMEN kortet per forespørsel av deler som
// er rastrert på forhånd: bakgrunnen (identiteten, fra `assets/og/card.html`)
// og ett bilde per BOKSTAV i de to skriftene malen bruker. Da er kjøretiden
// ren piksel-aritmetikk og zlib — ~10 ms, ingen nye avhengigheter — og
// kildesannheten er fortsatt HTML-en, som er hele poenget i #65.
//
// Delene lages av `bun scripts/generate-og-card.ts` og ligger committet i
// `assets/og/generated/`. Runbook: `assets/og/README.md`.
//
// Kerningen er med. Uten den ville «Ta» i «Tabernaklet» stått med et hull i,
// og et kort er nettopp det man ser i stort. Generatoren måler parene i samme
// Chrome som resten, så teksten er den layouten nettleseren ville gitt.

import { readFileSync } from 'node:fs';
import { deflateSync, gunzipSync } from 'node:zlib';
import { type BookInfo, bookNameById, booksData, getBookInfoById, getBookInfoBySlug } from './books-data.ts';
import { makeT, type Locale } from './i18n.ts';
import { localeToContentLanguage } from './lang.ts';
import { toUrlSlug } from './url-utils.ts';

/** Ett tegn i atlaset. `off` peker inn i den delte alfa-bufferen. */
export interface Glyph {
  /** Bredde og høyde på tegnets bitmap. */
  w: number;
  h: number;
  /** Forskyvning fra pennen til bitmapens venstre kant / øvre kant over grunnlinja. */
  left: number;
  top: number;
  /** Hvor langt pennen flyttes etter tegnet. */
  adv: number;
  off: number;
}

export interface CardSlot {
  /** Venstre kant og grunnlinje for ÉN linje, målt i malen. */
  x: number;
  baseline: number;
  maxWidth: number;
  lineHeight: number;
  color: [number, number, number];
  glyphs: Record<string, Glyph>;
  /** Kerning per bokstavpar, kun der den ikke er null. */
  kern: Record<string, number>;
}

export interface CardTemplate {
  width: number;
  height: number;
  slots: Record<string, CardSlot>;
}

const GENERATED = new URL('../../assets/og/generated/', import.meta.url);

let template: CardTemplate | null = null;
let background: Uint8Array | null = null;
let atlas: Uint8Array | null = null;

/**
 * Malen, lest én gang. Mangler den, er det en byggefeil og ikke noe å skjule:
 * `test/og-chapter-card.test.ts` er rød uten den, og ruta faller tilbake til
 * det generiske kortet framfor å svare med et halvt bilde.
 */
export function cardTemplate(): CardTemplate {
  if (!template) template = JSON.parse(readFileSync(new URL('card.json', GENERATED), 'utf8')) as CardTemplate;
  return template;
}

function assets(): { bg: Uint8Array; glyphs: Uint8Array } {
  if (!background) background = new Uint8Array(gunzipSync(readFileSync(new URL('card-bg.rgb.gz', GENERATED))));
  if (!atlas) atlas = new Uint8Array(gunzipSync(readFileSync(new URL('card-atlas.bin.gz', GENERATED))));
  return { bg: background, glyphs: atlas };
}

/**
 * Tegnene malen IKKE har for en tekst.
 *
 * En manglende bokstav forsvinner STILLE: bildet er fortsatt 1200x630 og
 * svarer 200, men «Ensimmäinen» ble «Ensimm inen». Vakta går derfor på
 * DATAENE — hvert boknavn på hvert språk — framfor på et tilfelle.
 */
export function missingGlyphs(slot: string, text: string): string[] {
  const s = cardTemplate().slots[slot];
  if (!s) return [...text];
  return [...text].filter((ch) => ch !== ' ' && !s.glyphs[ch]);
}

interface Placed {
  glyph: Glyph;
  x: number;
}

function width(slot: CardSlot, text: string): number {
  let x = 0;
  let prev = '';
  for (const ch of text) {
    const g = ch === ' ' ? spaceGlyph(slot) : slot.glyphs[ch];
    if (!g) return Infinity;
    if (prev) x += slot.kern[prev + ch] ?? 0;
    x += g.adv;
    prev = ch;
  }
  return x;
}

/** Mellomrom har ingen bitmap, bare en bredde. */
function spaceGlyph(slot: CardSlot): Glyph {
  return slot.glyphs[' '] ?? { w: 0, h: 0, left: 0, top: 0, adv: slot.lineHeight * 0.25, off: 0 };
}

function place(slot: CardSlot, text: string): { glyphs: Placed[]; width: number } {
  const glyphs: Placed[] = [];
  let x = 0;
  let prev = '';
  for (const ch of text) {
    const g = ch === ' ' ? spaceGlyph(slot) : slot.glyphs[ch];
    if (!g) return { glyphs: [], width: Infinity };
    if (prev) x += slot.kern[prev + ch] ?? 0;
    if (g.w) glyphs.push({ glyph: g, x });
    x += g.adv;
    prev = ch;
  }
  return { glyphs, width: x };
}

/**
 * Teksten brytes på ORD framfor å krympes: «Ensimmäinen Mooseksen kirja» er
 * bredere enn kortet, og en nedskalert tittel ser ut som en annen skriftgrad.
 * Krympingen er siste utvei, for et enkelt ord kan være for bredt alene.
 */
function lines(slot: CardSlot, text: string): string[] {
  if (width(slot, text) <= slot.maxWidth) return [text];
  const ord = text.split(' ');
  let best: [string, string] | null = null;
  const bredest = (par: [string, string]) => Math.max(width(slot, par[0]), width(slot, par[1]));
  for (let i = 1; i < ord.length; i++) {
    const par: [string, string] = [ord.slice(0, i).join(' '), ord.slice(i).join(' ')];
    if (!best || bredest(par) < bredest(best)) best = par;
  }
  return best ?? [text];
}

/** Områdefilter — kun nedskalering, som er der den er god nok. */
function scaleAlpha(src: Uint8Array, w: number, h: number, s: number): { data: Uint8Array; w: number; h: number } {
  const nw = Math.max(1, Math.round(w * s));
  const nh = Math.max(1, Math.round(h * s));
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * h) / nh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * w) / nw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / nw));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += src[yy * w + xx]!;
          n++;
        }
      }
      out[y * nw + x] = Math.round(sum / n);
    }
  }
  return { data: out, w: nw, h: nh };
}

function blit(
  rgb: Uint8Array,
  cardWidth: number,
  cardHeight: number,
  alpha: Uint8Array,
  gw: number,
  gh: number,
  px: number,
  py: number,
  color: [number, number, number],
) {
  for (let y = 0; y < gh; y++) {
    const ty = py + y;
    if (ty < 0 || ty >= cardHeight) continue;
    for (let x = 0; x < gw; x++) {
      const a = alpha[y * gw + x]!;
      if (!a) continue;
      const tx = px + x;
      if (tx < 0 || tx >= cardWidth) continue;
      const i = (ty * cardWidth + tx) * 3;
      const f = a / 255;
      rgb[i] = Math.round(rgb[i]! * (1 - f) + color[0] * f);
      rgb[i + 1] = Math.round(rgb[i + 1]! * (1 - f) + color[1] * f);
      rgb[i + 2] = Math.round(rgb[i + 2]! * (1 - f) + color[2] * f);
    }
  }
}

function drawSlot(rgb: Uint8Array, mal: CardTemplate, slot: CardSlot, text: string, alphaBuf: Uint8Array) {
  const rader = lines(slot, text);
  const lagt = rader.map((r) => place(slot, r));
  const bredest = Math.max(...lagt.map((l) => l.width));
  const skala = bredest > slot.maxWidth ? slot.maxWidth / bredest : 1;
  const høyde = slot.lineHeight * skala;
  // Flere linjer vokser om SENTERET, ikke nedover: bakgrunnen er rastrert, så
  // blokka kan ikke dytte domenelinja foran seg.
  const første = slot.baseline - ((rader.length - 1) * høyde) / 2;

  lagt.forEach((linje, i) => {
    const y = første + i * høyde;
    for (const { glyph, x } of linje.glyphs) {
      const src = alphaBuf.subarray(glyph.off, glyph.off + glyph.w * glyph.h);
      const bilde =
        skala === 1 ? { data: src, w: glyph.w, h: glyph.h } : scaleAlpha(src, glyph.w, glyph.h, skala);
      blit(
        rgb,
        mal.width,
        mal.height,
        bilde.data,
        bilde.w,
        bilde.h,
        Math.round(slot.x + (x + glyph.left) * skala),
        Math.round(y - glyph.top * skala),
        slot.color,
      );
    }
  });
}

// ── PNG ───────────────────────────────────────────────────────────────────
// En skraper viser et bilde eller ingenting, og PNG er formatet alle fem
// flatene (Facebook, LinkedIn, Slack, iMessage, Discord) leser. Koderen er
// ~40 linjer mot `node:zlib`, altså ingen ny avhengighet: minimal-deps-regelen
// gjelder her som ellers.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const stride = w * 3;
  const raw = new Uint8Array(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + stride);
    // Filter 2 (Up): kortet er store, flate flater, og da blir raden nuller.
    raw[o] = y === 0 ? 0 : 2;
    for (let i = 0; i < stride; i++) {
      raw[o + 1 + i] = y === 0 ? rgb[i]! : (rgb[y * stride + i]! - rgb[(y - 1) * stride + i]!) & 0xff;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const deler = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 6 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(deler.reduce((n, d) => n + d.length, 0));
  let i = 0;
  for (const d of deler) {
    png.set(d, i);
    i += d.length;
  }
  return png;
}

/**
 * Kortet for en gitt slott-tekst, eller `null` hvis malen mangler et tegn.
 *
 * `null` framfor et halvt kort: en tittel med hull i er verre enn det
 * generiske kortet, og den ville aldri blitt oppdaget innenfra.
 */
export function renderCardPng(texts: Record<string, string>): Uint8Array | null {
  const mal = cardTemplate();
  for (const [navn, tekst] of Object.entries(texts)) {
    if (!mal.slots[navn] || missingGlyphs(navn, tekst).length) return null;
  }
  const { bg, glyphs } = assets();
  const rgb = new Uint8Array(bg);
  for (const [navn, tekst] of Object.entries(texts)) drawSlot(rgb, mal, mal.slots[navn]!, tekst, glyphs);
  return encodePng(rgb, mal.width, mal.height);
}

// ── Kapittelkortet ────────────────────────────────────────────────────────

/**
 * Teksten kortet skal bære, på ett sted.
 *
 * Boknavnet kommer fra `bookNameById()` — samme kilde som `<title>` og
 * brødsmulen (#69) — så et kort delt fra `/fr/` sier «Matthieu», ikke
 * «Matthew». Kapittelledda går gjennom ordboka: ordstillingen er ikke vår å
 * anta (#63).
 */
export function chapterCardText(bookId: number, chapter: number, locale: Locale): [string, string] {
  const t = makeT(locale);
  return [bookNameById(bookId, localeToContentLanguage(locale)), t('chrome.shareCardChapter', { n: chapter })];
}

/**
 * Bokas ledd i KORTSTIEN, og den er ASCII-ren med vilje (#84).
 *
 * #80 gjorde adressen prosentkodet, og det var riktig — men det fjernet ikke
 * feilen, det flyttet den: Amazonbot kuttet fortsatt stien, nå ved første `%`
 * i stedet for ved første rå ikke-ASCII-byte, i 4,7 % av hentingene mot de
 * fire bøkene med `ø`/`å` i slugen. Hvert kutt er én delt lenke uten
 * forhåndsvisning FOR GODT — en skraper prøver bare én gang. Er det ingen `%`
 * der, har klienten ingenting å kutte ved.
 *
 * **Dette gjelder BARE kortstien.** Sidas egen adresse (`/nb/2krøn/8`) er
 * menneskelesbar, og der er `ø` et bevisst valg som ikke skal translittereres
 * bort — den 404-er heller ikke. Kortstien leses av en maskin, aldri av en
 * leser, så den kan betale den prisen sida ikke skal betale.
 *
 * Translittereringen er porteføljens egen (`normalizePersonId`, #61, som er
 * free-bibles `nameToId`): `æ`→`ae`, `ø`→`o`, `å`→`a`. Å finne på en ny
 * omskriving her ville vært en tredje stavemåte for de samme bøkene.
 */
export function cardBookSlug(shortName: string): string {
  return toUrlSlug(shortName)
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a');
}

/**
 * Boka en kortsti peker på — BEGGE formene.
 *
 * Den prosentkodede formen (`2kr%C3%B8n`, altså `2krøn` etter dekoding) ligger
 * i delte lenker og i skrapernes indeks fra før #84, og en delt lenke lever
 * lenger enn en deploy. Den skal fortsatt svare 200; det er bare det vi
 * PUBLISERER som er nytt.
 */
export function bookByCardSlug(slug: string): BookInfo | undefined {
  const normalized = slug.toLowerCase();
  for (const book of booksData) if (cardBookSlug(book.short_name) === normalized) return book;
  return getBookInfoBySlug(normalized);
}

/**
 * Adressen kortet serveres på.
 *
 * Boka adresseres med SLUGEN sida bruker (`matt`), ikke med rad-id-en: en
 * offentlig URL skal ikke bære et tall bare vi kan tyde (#40), og en adresse
 * som ligner sidas egen er den som lar seg lese i en logg. Punktumet er ikke
 * pynt heller — det er det `NOT_A_PAGE` kjenner igjen, så kortet ikke står bak
 * render-semaforen (#64).
 */
export function chapterCardPath(bookId: number, chapter: number, locale: Locale): string {
  const book = getBookInfoById(bookId);
  return `/og/${locale}/${book ? cardBookSlug(book.short_name) : bookId}-${chapter}.png`;
}

export function renderChapterCard(bookId: number, chapter: number, locale: Locale): Uint8Array | null {
  const [book, kapittel] = chapterCardText(bookId, chapter, locale);
  if (!book) return null;
  return renderCardPng({ book, chapter: kapittel });
}
