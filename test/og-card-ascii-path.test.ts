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
// Sidas EGEN adresse (`/nb/2krøn/8`) er en annen sak og røres ikke — men den
// går IKKE fri: samme klient kutter den på samme sted, målt 0,038 % mot
// kortstiens 4,6 %. Der finnes ingen ASCII-form å bytte til; `ø`-en ER
// adressen, og en omskriving av den er et valg om adresseskjemaet framfor en
// feilretting. Kravet i #80 — at den kodede adressen DEKODER tilbake til sidas
// egen sti — står derfor uendret for canonical og hreflang i
// `published-url-encoding.test.ts`.
//
// ANDRE HALVDEL: hva vi svarer den som ALT har kuttet. Å gjøre adressen
// ASCII-ren hindrer nye kutt; den hindrer ikke de avkortede formene som
// allerede ligger i skrapernes indeks. Se det siste describet.

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

// EN AVKORTET KORTADRESSE ER IKKE EN SIDE (#84)
//
// ASCII-stien over hindrer NYE kutt. Den hindrer ikke de avkortede formene som
// alt ligger i skrapernes indeks — 18 målte i saken — og de blir hentet igjen.
// Saken sier hva som er galt med svaret de får: «Skraperen får `text/html` der
// den ventet en PNG.» Det gjelder BEGGE formene den målte:
//
//   /og/de/2kr   ->  404, men med en hel HTML-404-side i kroppen
//   /og/fr/      ->  302 /en/og/fr/  ->  301 /en/og/fr  ->  404
//
// Den andre er verst, og den er ny i denne saken. `/og/<språk>/` har ingen
// filsegment, faller derfor ut av kortruta og videre i locale-forhandlingen —
// altså inn i SIDE-navnerommet. To hopp for et bilde som ikke finnes, og det
// siste hoppet er en adresse (`/en/og/fr`) som ikke fantes før vi fant den
// opp. Det er nøyaktig klassen #46 og #60 stenger: vi skal ikke lage døde
// adresser til en crawler.
//
// Prisen er dessuten en RENDER-PLASS. `NOT_A_PAGE` (#64) kjenner en fil på
// punktumet, og en avkortet kortadresse har ikke lenger noe punktum — så den
// står i køen bak semaforen og rendrer en HTML-side ingen skraper leser, i
// nøyaktig det øyeblikket kapasiteten er knapp (#19, #86).
//
// Vakta er formulert på ADRESSEN, ikke på de fire målte formene: INGEN prefiks
// av en kortadresse får svare som en side. Prefiksene utledes av de publiserte
// adressene, i BEGGE formene, så en ny bok med et slikt tegn arver vakta.
describe('en avkortet kortadresse er ikke en side (#84)', () => {
  /** Alle stedene en klient kan ha kuttet — `/og/` er selv et prefiks. */
  const truncations = (path: string): string[] => {
    const out: string[] = [];
    for (let i = '/og/'.length; i < path.length; i++) out.push(path.slice(0, i));
    return out;
  };

  /**
   * Begge formene, for hver bok saken gjelder og hvert språk: den ASCII-rene
   * vi publiserer nå, og den prosentkodede som ligger i indeksene fra før.
   */
  const published = NON_ASCII_BOOKS.flatMap((book) =>
    LOCALES.flatMap((locale) => [
      chapterCardPath(book.id, 1, locale),
      encodeURI(`/og/${locale}/${toUrlSlug(book.short_name)}-1.png`),
    ]),
  );

  // Selve saken. Et kutt er et kutt — vi kan ikke hindre klienten i å gjøre
  // det, men vi kan la være å svare som om prefikset var en side.
  test('ingen avkortet kortadresse redirecter eller svarer med HTML', async () => {
    const feil: unknown[] = [];
    for (const path of new Set(published.flatMap(truncations))) {
      const res = await app.request(path, { redirect: 'manual' });
      const svar = {
        path,
        status: res.status,
        videre: res.headers.get('location'),
        html: (res.headers.get('content-type') ?? '').includes('text/html'),
      };
      if (svar.status !== 404 || svar.videre || svar.html) feil.push(svar);
    }
    expect(feil).toEqual([]);
  });

  // De fire formene saken faktisk MÅLTE, ordrett — så en fiks som dekker
  // regelen uten å dekke tilfellet ikke kan bestå i stillhet.
  test('de målte formene svarer 404 uten en eneste omvei', async () => {
    for (const path of ['/og/de/2kr', '/og/es/1kr', '/og/fi/h', '/og/fr/', '/og/fr']) {
      const res = await app.request(path, { redirect: 'manual' });
      expect({ path, status: res.status, videre: res.headers.get('location') }).toEqual({
        path,
        status: 404,
        videre: null,
      });
    }
  });

  // «Svar 404 på alt under /og/» ville bestått de to over og tatt kortet med
  // seg. De andre halvdelene i fila måler kortet; denne står her fordi den er
  // det som skiller en port fra en mur.
  test('den hele adressen leverer fortsatt kortet', async () => {
    for (const book of NON_ASCII_BOOKS) {
      const path = chapterCardPath(book.id, 1, 'de');
      expect({ path, ...(await card(path)) }).toEqual({
        path,
        status: 200,
        type: 'image/png',
        hash: hash(renderChapterCard(book.id, 1, 'de')!),
      });
    }
  });
});
