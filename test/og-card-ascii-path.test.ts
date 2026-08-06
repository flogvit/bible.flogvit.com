// KORTSTIEN ER ASCII-REN (#84) — klienten skal ikke ha noe å kutte ved.
//
// #80 gjorde `og:image` prosentkodet, og den fiksen er ute og virker. Men
// symptomet overlevde den med samme andel målt over to vinduer (4,4 % før,
// 4,7 % etter): Amazonbot kutter fortsatt adressen, nå ved første `%` i stedet
// for ved første rå ikke-ASCII-byte. `GET /og/de/2kr` av
// `/og/de/2kr%C3%B8n-<n>.png`. Prosentkoding FLYTTET problemet, den fjernet
// det ikke.
//
// Hullet er av samme klasse som #45, #65 og #80: skraperen viser et kort uten
// bilde, og det gir verken 404, 5xx eller en logglinje hos oss — og den prøver
// bare én gang, så hvert kutt er én delt lenke uten forhåndsvisning FOR GODT.
// Feilen er bare synlig utenfor produktet, hos noen som ennå ikke har klikket.
//
// Vakta er derfor formulert på TEGNET, ikke på `ø`: bærer en kortsti noe som
// MÅ prosentkodes, finnes det et `%` i den publiserte adressen, og da finnes
// det et sted å kutte. Sidene velges av DATAENE (som i #69, #70 og #80), så en
// ny bok med et slikt tegn arver vakta uten at noen fører den opp.
//
// Sidas EGEN adresse (`/nb/2krøn/8`) er en annen sak og røres ikke: den er
// menneskelesbar, `ø` er et bevisst valg der, og den 404-er ikke. Kravet i
// #80 — at den kodede adressen DEKODER tilbake til sidas egen sti — står
// derfor uendret for canonical og hreflang i `published-url-encoding.test.ts`.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { booksData } from '../src/lib/books-data.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { bookByCardSlug, cardBookSlug, chapterCardPath, renderChapterCard } from '../src/lib/og-card.ts';
import { chapterShareCard } from '../src/lib/share-card.ts';
import { toUrlSlug } from '../src/lib/url-utils.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
await initBooks();

/** Bøkene saken gjelder — valgt av dataene, ikke ført opp for hånd. */
const NON_ASCII_BOOKS = booksData.filter((b) => /[^\x20-\x7e]/.test(toUrlSlug(b.short_name)));

const hash = (bytes: ArrayBufferLike | Uint8Array) => Bun.hash(bytes as ArrayBuffer).toString(16);

async function card(path: string): Promise<{ status: number; type: string | null; hash: string }> {
  const res = await app.request(path);
  return { status: res.status, type: res.headers.get('content-type'), hash: hash(await res.arrayBuffer()) };
}

describe('kortstien er ASCII-ren (#84)', () => {
  // Uten en slug med ø/å måler resten ingenting: en kortsti av ren ASCII er
  // allerede ASCII-ren, så alt ville vært grønt uten en eneste fiks.
  test('det finnes en bok med et ikke-ASCII-tegn i slugen å måle', () => {
    expect(NON_ASCII_BOOKS.map((b) => toUrlSlug(b.short_name))).not.toEqual([]);
  });

  // SELVE SAKEN, og den er sakens egen verifiseringskommando utvidet til alle
  // åtte språkene: bærer stien et tegn `encodeURI` må røre, får den publiserte
  // adressen et `%`, og da har klienten et sted å kutte.
  test('ingen kortsti bærer et tegn som må prosentkodes', () => {
    const skitne: string[] = [];
    for (const book of booksData) {
      for (const locale of LOCALES) {
        const path = chapterCardPath(book.id, 1, locale);
        if (encodeURI(path) !== path) skitne.push(path);
      }
    }
    expect(skitne).toEqual([]);
  });

  // Og det er den PUBLISERTE adressen skraperen leser, ikke funksjonen: et
  // `%` som kommer inn i `absoluteUrl()` er like mye et sted å kutte.
  test('den publiserte kortadressen har ingen prosentkode', async () => {
    for (const book of NON_ASCII_BOOKS) {
      const url = chapterShareCard(book.id, 1, 'nb').url;
      expect({ url, kode: url.includes('%') }).toEqual({ url, kode: false });
    }
    // Sida er der skraperen faktisk henter den — funksjonen alene beviser ikke
    // at det er DEN adressen som står i `og:image`.
    for (const book of NON_ASCII_BOOKS) {
      const html = await (await app.request(encodeURI(`/en/${toUrlSlug(book.short_name)}/1`))).text();
      const bilde = /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1];
      expect({ bok: book.short_name, bilde }).toEqual({
        bok: book.short_name,
        bilde: chapterShareCard(book.id, 1, 'en').url,
      });
    }
  });

  // «Fjern ø-en» ville bestått kravet over og pekt på en annen bok — det er
  // nøyaktig innvendingen #80 reiste mot en omskriving. Derfor måles BYTENE:
  // adressen må levere kortet for DENNE boka, ikke bare et kort.
  test('den nye adressen leverer kortet for RIKTIG bok', async () => {
    for (const book of NON_ASCII_BOOKS) {
      for (const locale of ['nb', 'en'] as const) {
        const path = chapterCardPath(book.id, 1, locale);
        const fasit = hash(renderChapterCard(book.id, 1, locale)!);
        expect({ path, ...(await card(path)) }).toEqual({ path, status: 200, type: 'image/png', hash: fasit });
      }
    }
  });

  // En delt lenke lever lenger enn en deploy. Den prosentkodede formen ligger
  // i lenker som alt er delt og i skrapernes indeks, og skal fortsatt svare —
  // det er bare det vi PUBLISERER som er nytt.
  test('den gamle, prosentkodede adressen svarer fortsatt 200', async () => {
    for (const book of NON_ASCII_BOOKS) {
      const gammel = encodeURI(`/og/nb/${toUrlSlug(book.short_name)}-1.png`);
      expect({ gammel, kode: gammel.includes('%') }).toEqual({ gammel, kode: true });
      expect({ gammel, ...(await card(gammel)) }).toEqual({
        gammel,
        status: 200,
        type: 'image/png',
        hash: hash(renderChapterCard(book.id, 1, 'nb')!),
      });
    }
  });

  // To bøker som får samme kortslug ville gjort den ene uoppnåelig, og en
  // kortslug som er en ANNEN boks egen slug ville skygget for den. Begge er
  // stille: adressen svarer 200 med feil kort.
  test('ingen kortslug skygger for en annen bok', () => {
    const treff = booksData.map((b) => ({
      bok: b.short_name,
      slug: cardBookSlug(b.short_name),
      peker: bookByCardSlug(cardBookSlug(b.short_name))?.short_name,
    }));
    expect(treff.filter((t) => t.peker !== t.bok)).toEqual([]);
    expect(new Set(treff.map((t) => t.slug)).size).toBe(booksData.length);
  });
});
