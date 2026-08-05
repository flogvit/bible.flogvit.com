// DELEKORT PER KAPITTEL (#68) — hva en delt lenke til `/en/matt/5` faktisk
// viser.
//
// #65 ga flata ETT generisk kort: en delt kapittellenke så nøyaktig ut som en
// delt forside. Det er kapittel- og verselenkene folk deler, så kortet skal si
// hva lenken peker på — «Matthew 5», på lenkens EGET språk.
//
// Hullet er av samme klasse som #45, #65 og #69: siden svarer 200 og ser
// riktig ut, og et kort med feil tekst gir verken 404, 5xx eller en logglinje.
// Det finnes bare UTENFOR produktet, hos noen som ennå ikke har klikket.
// Derfor er vakta formulert på KONTRAKTEN — ikke på et tilfelle.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { booksData } from '../src/lib/books-data.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import {
  cardTemplate,
  chapterCardPath,
  chapterCardText,
  missingGlyphs,
  renderCardPng,
} from '../src/lib/og-card.ts';
import { chapterShareCard, shareCard } from '../src/lib/share-card.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
await initBooks();

const meta = (html: string, prop: string) =>
  new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1];

/** Kortets ekte mål, lest ut av PNG-ens IHDR-chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('IHDR');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('delekort per kapittel', () => {
  // Selve saken: faller kapittelsiden tilbake til det generiske kortet, er
  // dette rødt. Sveipen i `page-contract.test.ts` (invariant 8) ser bare at
  // det FINNES et kort — den kan ikke se at det er det samme for alle sider.
  test('kapittelsiden deklarerer sitt EGET kort, ikke det generiske', async () => {
    const generisk = shareCard().url;
    for (const locale of LOCALES) {
      const html = await (await app.request(`/${locale}/matt/5`)).text();
      const bilde = meta(html, 'og:image');
      expect({ locale, bilde }).toEqual({ locale, bilde: chapterShareCard(40, 5, locale).url });
      expect({ locale, generisk: bilde === generisk }).toEqual({ locale, generisk: false });
    }
  });

  test('kortet er 1200x630 og serveres av appen', async () => {
    const res = await app.request(new URL(chapterShareCard(40, 5, 'en').url).pathname);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(res.headers.get('etag')).toBeTruthy();
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
  });

  // De DEKLARERTE målene må være bildets EKTE mål — ellers beskriver taggene
  // et bilde som ikke finnes, og den første delingen (den som betyr noe) blir
  // uten bilde fordi skraperen må hente det før den vet om det kan vises bredt.
  test('de deklarerte målene er kortets ekte mål', async () => {
    const html = await (await app.request('/en/matt/5')).text();
    const res = await app.request(new URL(meta(html, 'og:image')!).pathname);
    const { width, height } = pngSize(new Uint8Array(await res.arrayBuffer()));
    expect({ w: meta(html, 'og:image:width'), h: meta(html, 'og:image:height') }).toEqual({
      w: String(width),
      h: String(height),
    });
  });

  // STRUKTURELT, som brødsmulevakta i #63: en tekst som aldri gikk gjennom
  // ordboka eller boknavntabellen rendres ORDRETT LIKT på alle språk — og da
  // er kortbytene identiske. Sammenligningen går på fire ubeslektede språk.
  test('kortet er på lenkens EGET språk', async () => {
    const bytes = new Map<string, string>();
    for (const locale of ['en', 'nb', 'fr', 'de'] as const) {
      const res = await app.request(new URL(chapterShareCard(40, 5, locale).url).pathname);
      bytes.set(locale, Bun.hash(await res.arrayBuffer()).toString(16));
    }
    expect(new Set(bytes.values()).size).toBe(bytes.size);
  });

  // En bokstav malen ikke har tegn for, forsvinner STILLE fra kortet: bildet
  // er fortsatt 1200x630 og svarer 200. «Ensimmäinen» ville blitt «Ensimm inen»
  // uten at noe her ble rødt — med mindre vakta går på DATAENE.
  test('malen har tegn for hvert boknavn på hvert språk', () => {
    const mangler: string[] = [];
    for (const book of booksData) {
      for (const locale of LOCALES) {
        // Kapittelnummeret varieres over ALLE sifrene: «Luku 1» ville ikke
        // avslørt at malen manglet et sjutall.
        const [bok, kapittel] = chapterCardText(book.id, 1234567890, locale);
        mangler.push(...missingGlyphs('book', bok), ...missingGlyphs('chapter', kapittel));
      }
    }
    expect([...new Set(mangler)]).toEqual([]);
  });

  test('malen finnes med begge slottene', () => {
    const mal = cardTemplate();
    expect({ w: mal.width, h: mal.height, slots: Object.keys(mal.slots).sort() }).toEqual({
      w: 1200,
      h: 630,
      slots: ['book', 'chapter'],
    });
  });

  // Punkt 4 i saken: en rute uten noe bedre skal ALDRI bli uten kort.
  test('alt annet beholder det generiske kortet', async () => {
    for (const sti of ['/en', '/en/om', '/nb/leseplan']) {
      const html = await (await app.request(sti)).text();
      expect({ sti, bilde: meta(html, 'og:image') }).toEqual({ sti, bilde: shareCard().url });
    }
  });

  // Malen ligger i `assets/`, som IKKE er en av katalogene Dockerfilen kopierer
  // som standard. Uten linja faller hvert eneste kapittelkort tilbake til det
  // generiske i prod — og det svarer 200, så hverken smoke, vakt eller
  // feillogg ville sagt fra. Det er nøyaktig hullet #65 handlet om, én etasje
  // ned: skaden er bare synlig for den som fikk lenken.
  test('malen blir med inn i imaget', async () => {
    const dockerfile = await Bun.file('./Dockerfile').text();
    const kopiert = [...dockerfile.matchAll(/^COPY\s+(?:--\S+\s+)*(\S+)\s+\S+\s*$/gm)].map((m) => m[1]!);
    expect({ kopiert: kopiert.some((k) => 'assets/og/generated'.startsWith(k.replace(/\/$/, ''))) }).toEqual({
      kopiert: true,
    });
  });

  test('adressen er absolutt — en skraper har ingen base-URL', () => {
    expect(chapterShareCard(40, 5, 'en').url).toBe(`https://bible.flogvit.com${chapterCardPath(40, 5, 'en')}`);
  });

  test('en ukjent bok eller et kapittel som ikke finnes gir 404', async () => {
    for (const sti of ['/og/en/matt-99.png', '/og/en/finnesikke-1.png', '/og/xx/matt-5.png']) {
      expect({ sti, status: (await app.request(sti)).status }).toEqual({ sti, status: 404 });
    }
  });

  // Renderen skal ALDRI levere et halvt kort: mangler et tegn, er svaret det
  // generiske kortet framfor en tittel med hull i.
  test('renderen nekter framfor å tegne et kort med hull i', () => {
    expect(renderCardPng({ book: 'Matthew', chapter: 'Chapter 5' })).toBeInstanceOf(Uint8Array);
    expect(renderCardPng({ book: 'Matthew ☃', chapter: 'Chapter 5' })).toBeNull();
  });
});
