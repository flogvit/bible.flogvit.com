/**
 * En kapitteladresse klienten har SKADET på veien (#118).
 *
 * Fire av 66 bøker har et ikke-ASCII-tegn i slugen (`1krøn`, `2krøn`, `høys`,
 * `åp`), og `ø`-en ER adressen — den leses av et menneske, og #84 lot den stå
 * med vilje. Vi publiserer den prosentkodet (#80), som er riktig. Men to
 * crawlere greier ikke kodingen, og begge kom fram til vår egen 404-side:
 *
 *   bingbot   `GET /en/1kr%C3%83%C2%B8n/14`   UTF-8 lest som latin-1 og kodet
 *                                             på nytt — 7 av 22 hentinger (32 %)
 *   MJ12bot   `GET /fr/1kr?n/20`              tegnet byttet mot `?` — 17 av 17
 *
 * #84 målte den samme skaden på sidas adresse til 0,038 % og lot den stå:
 * «bæres ikke av 0,038 %». Det tallet er nå 32 % for bingbot, som er en
 * SYNLIGHETSAKTØR — en tredel av hentingen dens blir aldri indeksert, og det
 * gir ingen feilrad noe sted hos oss. 4 bøker × 8 språk × kapitlene = 584
 * sider.
 *
 * **Begge formene er DETERMINISTISKE omskrivinger av adressen vi publiserte,
 * altså kan begge regnes tilbake.** Da er feilen i OPPSLAGET og ikke i
 * adressen, og svaret er 301 — ordrett samme argument som `PERSON_ID_ALIASES`
 * og `normalizedPersonId()` står på (#61). Den gjetter aldri: hvert trinn
 * krever et EKSAKT treff i `booksData`, og et kapittel boka ikke har blir
 * stående som 404 framfor å bli en 301 til en 404.
 *
 * **Dette gjør ikke adressen ASCII-ren.** Å skrive om selve adresseskjemaet
 * for 584 sider er fortsatt avgjørelsen #84 lot ligge, og den hører ikke i en
 * feilretting. Porten her trengs uansett hvilken vei den avgjørelsen går: de
 * `ø`-bærende adressene ligger alt i indeksene, og en indeksert adresse lever
 * lenger enn en deploy.
 *
 * Prisen for å la det stå var dessuten en RENDER-PLASS: en skadet adresse har
 * ikke noe punktum, altså er den en SIDE for `NOT_A_PAGE` (#64), og en hel
 * SSR-render av 404-sida sto i køen bak semaforen (#19, #86). En 301 koster
 * mikrosekunder.
 */

import { booksData, getBookInfoBySlug, type BookInfo } from './books-data.ts';
import { isLocale } from './i18n.ts';
import { toUrlSlug } from './url-utils.ts';

const IKKE_ASCII = /[^\x00-\x7f]/;

/**
 * Tegnet en klient setter inn der den ikke kunne bære tegnet vårt.
 *
 * `?` er MJ12bots form. U+FFFD er den samme skaden gjort av en dekoder som
 * kjenner sitt eget navn, og hører derfor i samme liste — det er én klasse, og
 * lista er formen klassen tar, ikke en liste over klienter.
 */
const PLASSHOLDERE = ['?', '\ufffd'];

/**
 * UTF-8-bytene lest som latin-1, regnet tilbake.
 *
 * `1krøn` sendes som bytene `C3 B8` for `ø`; leses de som latin-1 blir de to
 * tegn (`Ã¸`), og kodes strengen så opp igjen som UTF-8, står det
 * `%C3%83%C2%B8` i adressen. Veien tilbake er å ta tegnene som byte og dekode
 * dem som UTF-8 — STRENGT, så en streng som ikke ER mojibake gir null framfor
 * en gjetning.
 */
function fraMojibake(seg: string): string | null {
  if (!/[\u0080-\u00ff]/.test(seg)) return null;
  for (const tegn of seg) if (tegn.codePointAt(0)! > 0xff) return null;
  try {
    const ut = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(seg, (c) => c.charCodeAt(0)));
    return ut === seg ? null : ut;
  } catch {
    return null;
  }
}

/**
 * Boka et skadet bokledd peker på, eller undefined.
 *
 * To omskrivinger, og begge krever et EKSAKT treff — som `personResolverFrom()`
 * (#61). Mojibaken kan være gjort to ganger av to ledd i samme kjede, så den
 * regnes tilbake til den ikke endrer seg mer.
 *
 * **En HEL adresse gir undefined**, og det er ikke en egen gren: begge
 * omskrivingene må ENDRE leddet for å treffe, og en slug som allerede er vår
 * gjør ikke det. Et «er dette en bok vi har?»-vern foran ville vært en linje
 * ingen mutasjon kunne felle. Egenskapen holdes i live av vakta i stedet, som
 * sveiper hver eneste slug OG hvert alias — der blir en gren som begynner å
 * regne om en hel adresse rød.
 */
export function bokFraSkadetLedd(seg: string): BookInfo | undefined {
  if (!seg) return undefined;

  let kandidat: string | null = seg;
  for (let runde = 0; runde < 3 && kandidat; runde++) {
    kandidat = fraMojibake(kandidat);
    if (kandidat) {
      const bok = getBookInfoBySlug(kandidat);
      if (bok) return bok;
    }
  }

  for (const bok of booksData) {
    const slug = toUrlSlug(bok.short_name);
    if (!IKKE_ASCII.test(slug)) continue;
    for (const tegn of PLASSHOLDERE) {
      if (slug.replace(new RegExp(IKKE_ASCII.source, 'g'), tegn) === seg.toLowerCase()) return bok;
    }
  }

  return undefined;
}

/**
 * De to måtene å lese adressen på, og begge trengs.
 *
 * `?` er spørringens eget tegn, så MJ12bots `/fr/1kr?n/20` når oss som stien
 * `/fr/1kr` med spørringen `n/20` — der er `?`-et en del av ADRESSEN og skal
 * ikke bæres videre. Bingbots form er en ren sti, og har den en EKTE spørring
 * ved siden av (`?bible=osnn`), skal den bæres over (#24, #61).
 */
function lesninger(url: URL): { adresse: string; query: string }[] {
  let sti: string;
  try {
    sti = decodeURIComponent(url.pathname);
  } catch {
    return [];
  }
  const ut = [{ adresse: sti, query: url.search }];
  if (url.search) {
    try {
      const [hale = '', ...resten] = decodeURIComponent(url.search.slice(1)).split('?');
      ut.push({ adresse: `${sti}?${hale}`, query: resten.length ? `?${resten.join('?')}` : '' });
    } catch {
      /* En spørring vi ikke kan dekode er ikke en adresse vi kan regne tilbake. */
    }
  }
  return ut;
}

/**
 * Adressen en skadet kapitteladresse skal 301-e til, eller null.
 *
 * Kalles fra de to stedene en adresse ingen rute kunne svare på ender opp:
 * catch-allen og `app.notFound()`. Adressen bygges av locale fra `LOCALES`,
 * slugen fra `booksData` og et kapittelnummer — den kan altså ikke bære noe
 * klienten sendte inn — og den prosentkodes, for det er den publiserte formen
 * (#80).
 */
export function skadetKapitteladresse(url: URL): string | null {
  for (const { adresse, query } of lesninger(url)) {
    const deler = adresse.split('/');
    if (deler.length !== 4 || deler[0] !== '') continue;
    const [, locale, bokledd, kapittelledd] = deler as [string, string, string, string];
    if (!isLocale(locale) || !/^\d+$/.test(kapittelledd)) continue;

    const bok = bokFraSkadetLedd(bokledd);
    if (!bok) continue;
    // En 301 til en 404 er ingen fiks (#61).
    const kapittel = Number(kapittelledd);
    if (kapittel < 1 || kapittel > bok.chapters) continue;

    const mal = encodeURI(`/${locale}/${toUrlSlug(bok.short_name)}/${kapittel}`) + query;
    if (mal !== url.pathname + url.search) return mal;
  }
  return null;
}
