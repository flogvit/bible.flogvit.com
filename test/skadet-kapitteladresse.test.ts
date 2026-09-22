// EN ADRESSE KLIENTEN HAR SKADET ER IKKE EN ADRESSE VI IKKE HAR (#118)
//
// Kapittelsidene i de fire bøkene med et ikke-ASCII-tegn i slugen (`1krøn`,
// `2krøn`, `høys`, `åp`) 404-et for crawlere som ikke greier prosentkodingen vi
// publiserer i canonical, hreflang og sitemap. Målt over 17,8 timer mot de fire
// bøkene: 145 hentinger korrekt kodet og servert, 24 skadet av klienten.
//
//   bingbot   `/en/1kr%C3%83%C2%B8n/14`   7 av 22 (32 %)   UTF-8 lest som
//                                                          latin-1, kodet på nytt
//   MJ12bot   `/fr/1kr?n/20`             17 av 17          tegnet byttet mot `?`
//
// #84 gjorde KORTSTIEN ASCII-ren og lot sidas egen adresse stå, med et tall som
// begrunnelse: 0,038 %. For bingbot er tallet nå 32 %, og bingbot er en
// SYNLIGHETSAKTØR — en tredel av hentingen dens blir aldri indeksert. Stille:
// hver av dem er en 404 i loggen vår og et hull i indeksen hos noen andre.
//
// Vakta er formulert på SKADEN, ikke på de to klientene: begge formene er
// deterministiske omskrivinger av den adressen vi publiserte, altså kan begge
// regnes tilbake. Adressene velges av DATAENE (som #69, #70, #80 og #84), så en
// ny bok med et slikt tegn arver vakta uten at noen fører den opp — og formene
// BYGGES slik klienten bygger dem (UTF-8-bytes lest som latin-1, tegnet byttet
// mot `?`), ikke slik fiksen regner dem tilbake.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { bookAliases } from '../src/lib/book-aliases.ts';
import { booksData } from '../src/lib/books-data.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { bokFraSkadetLedd, skadetKapitteladresse } from '../src/lib/skadet-adresse.ts';
import { toUrlSlug } from '../src/lib/url-utils.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
await initBooks();

/** Bøkene saken gjelder — valgt av dataene, ikke ført opp for hånd. */
const SKADBARE = booksData.filter((b) => /[^\x20-\x7e]/.test(toUrlSlug(b.short_name)));

/** Slik bingbot skader den: UTF-8-bytene lest som latin-1. */
const mojibake = (s: string) => new TextDecoder('latin1').decode(new TextEncoder().encode(s));

/** Slik MJ12bot skader den: tegnet den ikke kan bære byttet mot `?`. */
const plassholder = (s: string) => s.replace(/[^\x00-\x7f]/g, '?');

/** Adressen slik den ligger i loggen — begge formene, for en bok og et kapittel. */
function skadedeAdresser(slug: string, locale: string, kapittel: number): string[] {
  return [
    encodeURI(`/${locale}/${mojibake(slug)}/${kapittel}`),
    `/${locale}/${plassholder(slug)}/${kapittel}`,
  ];
}

const hopp = (path: string) => app.request(path, { redirect: 'manual' });

describe('en skadet kapitteladresse regnes tilbake (#118)', () => {
  // Uten en slug med ø/å måler resten ingenting: en ren ASCII-slug kan ikke
  // skades på noen av de to måtene, så alt ville vært grønt uten en fiks.
  test('det finnes en bok med et ikke-ASCII-tegn i slugen å måle', () => {
    expect(SKADBARE.map((b) => toUrlSlug(b.short_name))).not.toEqual([]);
  });

  // REGELEN, uten app: begge formene regnes tilbake til den samme, publiserte
  // adressen — prosentkodet, som #80 krever.
  describe('REGELEN', () => {
    test('begge formene gir den publiserte adressen', () => {
      for (const bok of SKADBARE) {
        const slug = toUrlSlug(bok.short_name);
        const fasit = encodeURI(`/nb/${slug}/2`);
        for (const skadet of skadedeAdresser(slug, 'nb', 2)) {
          expect({ skadet, mal: skadetKapitteladresse(new URL(skadet, 'http://x')) }).toEqual({
            skadet,
            mal: fasit,
          });
        }
      }
    });

    test('en hel adresse røres ikke', () => {
      for (const path of ['/nb/matt/5', '/en/1kr%C3%B8n/14', '/nb/', '/', '/en/personer/abaddon']) {
        expect({ path, mal: skadetKapitteladresse(new URL(path, 'http://x')) }).toEqual({ path, mal: null });
      }
    });

    // Og det gjelder HVER adresse vi selv kan gi ut, ikke de fem over: hver
    // slug og hvert alias `getBookInfoBySlug()` kjenner. Regelen har ikke noe
    // «er dette en bok vi har?»-vern foran seg — begge omskrivingene må ENDRE
    // leddet for å treffe — så det er denne sveipen som holder egenskapen i
    // live, og en gren som begynte å regne om en hel adresse blir rød her.
    test('ingen kjent bokledd regnes om — verken slug eller alias', () => {
      const kjente = [...booksData.map((b) => toUrlSlug(b.short_name)), ...Object.keys(bookAliases)];
      const rort = kjente.filter(
        (ledd) =>
          bokFraSkadetLedd(ledd) !== undefined ||
          skadetKapitteladresse(new URL(encodeURI(`/nb/${ledd}/1`), 'http://x')) !== null,
      );
      expect({ antall: kjente.length > 66, rort }).toEqual({ antall: true, rort: [] });
    });

    // En 301 til en 404 er ingen fiks (#61). Høysangen har 8 kapitler.
    test('et kapittel boka ikke har gir ingen omskriving', () => {
      const slug = toUrlSlug(SKADBARE.find((b) => b.chapters < 50)!.short_name);
      const bok = SKADBARE.find((b) => b.chapters < 50)!;
      for (const skadet of skadedeAdresser(slug, 'nb', bok.chapters + 1)) {
        expect({ skadet, mal: skadetKapitteladresse(new URL(skadet, 'http://x')) }).toEqual({ skadet, mal: null });
      }
    });

    // Den gjetter aldri (#61): en adresse som ikke regner seg tilbake til en bok
    // vi HAR, blir stående som den er.
    test('en ukjent bok gjetter den ikke fram', () => {
      for (const path of ['/nb/1kr?x/2', '/nb/gnistrende/2', '/nb/1kr%C3%83%C2%B8nx/2', '/nb/matt/x']) {
        expect({ path, mal: skadetKapitteladresse(new URL(path, 'http://x')) }).toEqual({ path, mal: null });
      }
    });
  });

  // DE MÅLTE FORMENE, ordrett fra loggen i saken — så en fiks som dekker
  // regelen uten å dekke tilfellet ikke kan bestå i stillhet.
  describe('DE MÅLTE FORMENE', () => {
    test('formene vakta bygger er dem loggen viser', () => {
      expect(skadedeAdresser('1krøn', 'en', 14)[0]).toBe('/en/1kr%C3%83%C2%B8n/14');
      expect(skadedeAdresser('1krøn', 'fr', 20)[1]).toBe('/fr/1kr?n/20');
    });

    test('bingbots og MJ12bots adresser 301-er til sida', async () => {
      for (const [path, mal] of [
        ['/en/1kr%C3%83%C2%B8n/14', '/en/1kr%C3%B8n/14'],
        ['/fr/1kr?n/20', '/fr/1kr%C3%B8n/20'],
      ] as const) {
        const res = await hopp(path);
        expect({ path, status: res.status, videre: res.headers.get('location') }).toEqual({
          path,
          status: 301,
          videre: mal,
        });
      }
    });
  });

  // FLATA: hele settet, alle åtte språkene, begge formene — og hoppet må ende i
  // RIKTIG bok. Bare status hadde bestått av en 301 til hva som helst.
  describe('FLATA', () => {
    test('hver skadet kapitteladresse ender i sida, på alle åtte språk', async () => {
      const feil: unknown[] = [];
      for (const bok of SKADBARE) {
        const slug = toUrlSlug(bok.short_name);
        for (const locale of LOCALES) {
          for (const path of skadedeAdresser(slug, locale, 1)) {
            const res = await hopp(path);
            const videre = res.headers.get('location');
            if (res.status !== 301 || videre !== encodeURI(`/${locale}/${slug}/1`)) {
              feil.push({ path, status: res.status, videre });
              continue;
            }
            // En 301 til en 404 er ingen fiks: måladressen hentes.
            const mal = await hopp(videre);
            const html = await mal.text();
            const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
            if (mal.status !== 200 || !canonical?.endsWith(encodeURI(`/${locale}/${slug}/1`))) {
              feil.push({ path, videre, mal: mal.status, canonical });
            }
          }
        }
      }
      expect(feil).toEqual([]);
    });

    // Leserens valg skal ikke falle bort på veien (#24, #61).
    test('queryen bæres over omskrivingen', async () => {
      const res = await hopp('/en/1kr%C3%83%C2%B8n/14?bible=osnn');
      expect(res.headers.get('location')).toBe('/en/1kr%C3%B8n/14?bible=osnn');
    });
  });

  // «301 på alt som ikke finnes» ville bestått alt over. Denne halvdelen er det
  // som skiller en port fra en mur.
  describe('INGENTING ANNET RØRES', () => {
    test('en hel adresse svarer som før, og en ukjent er fortsatt 404', async () => {
      const hel = await hopp('/en/1kr%C3%B8n/14');
      expect({ status: hel.status, videre: hel.headers.get('location') }).toEqual({ status: 200, videre: null });

      for (const path of ['/en/gnistrende/2', '/en/1kr%C3%B8n/99', '/nb/1kr?x/2']) {
        const res = await hopp(path);
        expect({ path, status: res.status, videre: res.headers.get('location') }).toEqual({
          path,
          status: 404,
          videre: null,
        });
      }
    });
  });
});
