// MOBIL-LAYOUT I EN EKTE NETTLESER — kontrakter som alle handler om hva
// telefonen faktisk viser, og som ingen av de andre testnivåene kan se.
//
//   1. Ingen side er bredere enn skjermen (#50), heller ikke med stor tekst.
//   2. Chromen på mobil viser bare kontroller som betyr noe der (#51, #56).
//   3. Ingen side kaster bort toppen av skjermen på tomt rom (#55).
//
// Bakgrunn (#50): med tekstforstørrelse fra telefonens TILGJENGELIGHETS-
// innstillinger (Android: «Tekstskalering», 133–150 %) ble ti av ti målte sider
// bredere enn skjermen, verst kapittelsiden med +26 %. `/innstillinger` var
// 503 px på en 390 px-skjerm allerede ved 100 %.
//
// Tekstskalering er ikke sidezoom. Sidezoom forstørrer ALT proporsjonalt og går
// alltid bra; tekstskalering multipliserer bare skriftstørrelsen, mens bokser,
// `min-width`, `padding` og grid-spor står stille i px. Da vokser innholdet ut
// av kassa. Testen emulerer nettopp det: hver elements BEREGNEDE `font-size`
// ganges opp, layouten røres ikke.
//
// Hvorfor en ekte nettleser: bredde er en egenskap ved RENDRINGEN. De andre
// testnivåene kan ikke se dette — `page-contract.test.ts` leser SSR-HTML, og
// happy-dom har ingen layout-motor (`getBoundingClientRect()` gir nuller).

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { bookAbbr, bookName, booksData } from '../src/lib/books-data.ts';
import { DEFAULT_LOCALE, href, LOCALES, type Locale } from '../src/lib/i18n.ts';
import { localeToContentLanguage } from '../src/lib/lang.ts';
import { Chrome, type Page } from './chrome-cdp.ts';
import { PAGES } from './pages.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/**
 * 320 px dekker iPhone SE OG iOS' «Display Zoom», som krymper det logiske
 * viewportet i stedet for å skalere skriften — den andre aksen samme
 * innstilling kommer i. 390 px er en vanlig moderne iPhone.
 */
const VIEWPORTS = [
  { width: 320, height: 693, name: '320 px (SE / Display Zoom)' },
  { width: 390, height: 844, name: '390 px (iPhone 14/15)' },
];

/** 1 = uten forstørrelse. 1.5 er øvre enden av det Android tilbyr. */
const SCALES = [1, 1.5];

/** Chrome runder til hele piksler; 1 px slingring er avrunding, ikke overflyt. */
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

/**
 * Måler i siden. Ganger opp hver elements beregnede `font-size` slik nettleseren
 * gjør ved tekstskalering, måler, og setter tilbake.
 */
function measure(scale: number) {
  const de = document.documentElement;
  const els = Array.from(document.querySelectorAll('*')) as HTMLElement[];
  const original = els.map((el) => el.style.fontSize);

  if (scale !== 1) {
    const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
    els.forEach((el, i) => {
      if (sizes[i]) el.style.fontSize = `${sizes[i]! * scale}px`;
    });
  }

  const clientWidth = de.clientWidth;
  const scrollWidth = de.scrollWidth;
  const offenders: { selector: string; right: number; minWidth: string; whiteSpace: string }[] = [];

  const label = (el: Element) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    return el.tagName.toLowerCase() + cls.slice(0, 2).map((c) => `.${c}`).join('');
  };
  /** Innhold i en egen sidelengs scroll-boks er ikke sidas skyld — det er løsningen. */
  const inScroller = (el: Element | null) => {
    for (let n = el?.parentElement ?? null; n && n !== de; n = n.parentElement) {
      if (getComputedStyle(n).overflowX !== 'visible') return true;
    }
    return false;
  };

  if (scrollWidth > clientWidth) {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      // Under 2 px er skjermleser-tekst (`.sr-only` er 1 px + `clip`). Den kan
      // ikke være ÅRSAKEN til at sida er bred, bare støy i diagnosen.
      if (r.width < 2 || !r.height || r.right <= clientWidth + 1 || inScroller(el)) continue;
      const cs = getComputedStyle(el);
      offenders.push({
        selector: label(el),
        right: Math.round(r.right),
        minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace,
      });
    }

    // Et for langt ORD har ingen element-rect å måle — teksten stikker ut av en
    // boks som selv er smal nok. Uten dette svarer vakta «for bred» og peker på
    // ingenting, og det er da man begynner å gjette.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue?.trim() || inScroller(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.right <= clientWidth + 1) continue;
      const cs = getComputedStyle(n.parentElement!);
      offenders.push({
        selector: `${label(n.parentElement!)} «${n.nodeValue.trim().slice(0, 30)}»`,
        right: Math.round(r.right),
        minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace,
      });
    }

    offenders.sort((a, b) => b.right - a.right);
  }

  if (scale !== 1) els.forEach((el, i) => (el.style.fontSize = original[i]!));

  return { clientWidth, scrollWidth, offenders: offenders.slice(0, 6) };
}

/** Adressen til en side i `PAGES` (som kan bære query) på et gitt språk. */
function pageUrl(locale: Locale, p: string): string {
  const [path, query] = p.split('?');
  return `http://localhost:${server.port}${href(locale, path!)}${query ? `?${query}` : ''}`;
}

/**
 * Selve invarianten: åpne adressen og krev at ingen av de fire kombinasjonene
 * av viewport og tekstforstørrelse gjør sida bredere enn skjermen. `hvorfor`
 * havner i feilmeldingen — den som får rødt skal slippe å lure på hvorfor
 * nettopp denne adressen ble målt.
 */
async function expectFits(url: string, navn: string, hvorfor = ''): Promise<void> {
  await page.navigate(url);
  for (const vp of VIEWPORTS) {
    await page.setViewport(vp);
    for (const scale of SCALES) {
      const m = await page.evaluate(measure, scale);
      const over = m.scrollWidth - m.clientWidth;
      if (over > TOLERANCE) {
        const worst = m.offenders
          .map((o) => `    ${o.selector} → høyre kant ${o.right} px (min-width: ${o.minWidth}, white-space: ${o.whiteSpace})`)
          .join('\n');
        throw new Error(
          `${navn} er ${over} px for bred på ${vp.name} ved ${scale * 100} % tekst ` +
            `(${m.scrollWidth} px i et ${m.clientWidth} px viewport).${hvorfor ? `\n  ${hvorfor}` : ''}\n` +
            `  Bredeste elementer:\n${worst}`,
        );
      }
      expect(over).toBeLessThanOrEqual(TOLERANCE);
    }
  }
}

describe('mobil-layout: ingen side er bredere enn skjermen (#50)', () => {
  for (const p of PAGES) {
    test(`${p.path} — ${p.name}`, () => expectFits(pageUrl(DEFAULT_LOCALE, p.path), p.path), 60_000);
  }
});

/**
 * Sveipen over måler BASESPRÅKET, og engelsk har de korteste boknavnene vi
 * har. Etter #69 heter samme bok «1Mos», «1. Mose», «Första Moseboken» og
 * «1. Mooseksen kirja» — og et boknavn står i brødsmulen, i
 * kapitteloverskriften, i innholdsfortegnelsen og i bokvelgeren, altså i
 * nettopp de radene #50 handlet om.
 *
 * Språket velges av DATAENE, ikke av en literal: den locale-en som faktisk har
 * det lengste navnet (og den med den lengste forkortelsen, om det er en annen).
 * Legges det til et språk med enda lengre navn, måles det uten at noen har rørt
 * vakta.
 */
describe('mobil-layout: boknavn på det LENGSTE språket (#69)', () => {
  /** Sidene der et boknavn faktisk rendres: lesesida, forsida og lesekartet. */
  const BOOK_NAME_PAGES = ['/1mos/1', '/', '/lesekart'];

  const longestBy = (pick: (b: (typeof booksData)[number], lang: string) => string): Locale =>
    LOCALES.map((locale) => {
      const lang = localeToContentLanguage(locale);
      return { locale, len: Math.max(...booksData.map((b) => pick(b, lang).length)) };
    }).sort((a, b) => b.len - a.len)[0]!.locale;

  const locales = [...new Set([longestBy(bookName), longestBy(bookAbbr)])];

  for (const locale of locales) {
    for (const path of BOOK_NAME_PAGES) {
      test(
        `${path} på /${locale}/`,
        () => expectFits(pageUrl(locale, path), `/${locale}${path}`, 'Språket er valgt av de lengste boknavnene i dataene.'),
        60_000,
      );
    }
  }
});

/**
 * #70: sveipen over måler bare DEFAULT_LOCALE, og engelsk gir de KORTESTE
 * strengene vi har. Tysk setter sammen ord («Kapitelzusammenfassungen»), finsk
 * bøyer med lange endelser («saavutettavuusongelmia»), og ingen av dem har vært
 * målt mot `scrollWidth <= clientWidth`. #69 dekket BOKNAVNENE på det lengste
 * språket; her er det UI-strengene fra `dictionaries.ts` som står umålt.
 *
 * Alle 41 sidene × sju språk er 287 målinger og flere minutter, så sidene velges
 * av DATAENE: for hvert språk måles de tre sidene der SPRÅKET SELV er mest
 * utsatt. Rangeringen er det lengste ORDET siden har på det språket som den
 * IKKE har på basespråket — altså nettopp det oversettelsen legger til.
 *
 *   Løpende bokstaver, ikke «ord» mellom mellomrom: nettleseren bryter etter en
 *   bindestrek, så «bok-kapittel-versstart» er ikke én bred klump — den ville
 *   ellers vunnet på hvert eneste språk og skjøvet de ekte sammensetningene ut.
 *
 *   Ord basespråket OGSÅ har (URL-er, hebraisk, id-er, egennavn fra dataene)
 *   teller ikke: de er like brede på alle åtte flatene og er allerede målt av
 *   sveipen over. Da rangerer de heller ikke sidene feil.
 *
 * Fordi valget følger dataene, flytter en ny — eller nyoversatt — streng
 * målingen dit selv. Det er også mutasjonen: en kunstig lang verdi i en ordbok
 * drar sida si inn i utvalget og gjør vakta rød.
 */
describe('mobil-layout: UI-strengene på hvert språks verste side (#70)', () => {
  /** Sider per språk. Tre er en avveining mot kjøretid, ikke en grense i regelen. */
  const PAGES_PER_LOCALE = 3;

  const words = new Map<string, string[]>();

  /** Ordene i den RENDREDE sida — `<body>`, uten skript og stil. */
  const wordsIn = (html: string): string[] => {
    const body = html.slice(Math.max(0, html.indexOf('<body'))).replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, ' ');
    const out: string[] = [];
    for (const chunk of body.split(/<[^>]*>/)) {
      for (const w of chunk.replace(/&[a-z]+;|&#\d+;/gi, ' ').split(/[^\p{L}\p{N}]+/u)) if (w) out.push(w);
    }
    return out;
  };

  const wordsFor = async (locale: Locale, path: string): Promise<string[]> => {
    const key = `${locale} ${path}`;
    if (!words.has(key)) words.set(key, wordsIn(await (await fetch(pageUrl(locale, path))).text()));
    return words.get(key)!;
  };

  /** Sidene der `locale` har det lengste ordet basespråket ikke har. */
  const worstPagesFor = async (locale: Locale) => {
    const scan = async (p: (typeof PAGES)[number]) => {
      const base = new Set(await wordsFor(DEFAULT_LOCALE, p.path));
      let word = '';
      for (const w of await wordsFor(locale, p.path)) if (w.length > word.length && !base.has(w)) word = w;
      return { path: p.path, word };
    };
    // Fire om gangen: renderingen er DB-bundet og poolen er fem, så alt på én
    // gang gjør bare at forespørslene står i kø hos oss i stedet.
    const rows: { path: string; word: string }[] = [];
    for (let i = 0; i < PAGES.length; i += 4) rows.push(...(await Promise.all(PAGES.slice(i, i + 4).map(scan))));
    return rows
      .sort((a, b) => b.word.length - a.word.length || a.path.localeCompare(b.path))
      .slice(0, PAGES_PER_LOCALE);
  };

  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    test(
      `/${locale}/ — de ${PAGES_PER_LOCALE} sidene med språkets lengste egne ord`,
      async () => {
        const worst = await worstPagesFor(locale);
        // Uten dette ville vakta bestått på et språk uten en eneste oversatt
        // streng — altså akkurat der den trengs mest.
        expect([locale, worst[0]!.word.length > 0]).toEqual([locale, true]);

        for (const { path, word } of worst) {
          await expectFits(pageUrl(locale, path), `/${locale}${path}`, `Valgt fordi «${word}» (${word.length} tegn) er det lengste ordet siden har på ${locale}, men ikke på ${DEFAULT_LOCALE}.`);
        }
      },
      120_000,
    );
  }
});

/**
 * #51: på mobil er `.chapter-layout` én kolonne uansett modus, så ▥ Panel
 * endret ingenting i layouten — den la bare på en fanerad, og bunnlinjas ▥ gjør
 * allerede det samme. ☰ Normal var bare «angre». Begge er skjult under 768 px;
 * 📖 Lesemodus står igjen som av/på-knapp, og den gjør noe reelt (skjuler
 * sidepanel, skinne og bunnlinje).
 *
 * Vakta sjekker BEGGE kantene av brekkpunktet. Bare mobil-siden ville bestått
 * like fint om noen skjulte knappene overalt — og da hadde desktop mistet tre
 * layouter som faktisk er forskjellige der.
 */
describe('mobil-chrome: bare kontroller som betyr noe (#51)', () => {
  const modeButtons = () => {
    const seen: Record<string, boolean> = {};
    for (const btn of document.querySelectorAll('[data-layout-modes] [data-mode]')) {
      seen[(btn as HTMLElement).dataset.mode!] = getComputedStyle(btn).display !== 'none';
    }
    return seen;
  };

  test('☰ og ▥ er skjult på mobil, 📖 står igjen', async () => {
    await page.navigate(`http://localhost:${server.port}${href(DEFAULT_LOCALE, '/1mos/1')}`);
    for (const width of [320, 390, 768]) {
      await page.setViewport({ width, height: 800 });
      const vis = await page.evaluate(modeButtons);
      expect([width, vis]).toEqual([width, { normal: false, reading: true, panel: false }]);
    }
  }, 60_000);

  test('alle tre finnes fortsatt på desktop, der modusene ER forskjellige', async () => {
    await page.navigate(`http://localhost:${server.port}${href(DEFAULT_LOCALE, '/1mos/1')}`);
    await page.setViewport({ width: 1280, height: 900 });
    expect(await page.evaluate(modeButtons)).toEqual({ normal: true, reading: true, panel: true });

    // Og de gir faktisk tre ULIKE layouter der — ellers er knappene like
    // meningsløse på desktop som de var på mobil.
    const columns = await page.evaluate(() => {
      const out: string[] = [];
      for (const mode of ['normal', 'reading', 'panel']) {
        (document.querySelector(`[data-layout-modes] [data-mode="${mode}"]`) as HTMLElement).click();
        out.push(getComputedStyle(document.querySelector('.chapter-layout')!).gridTemplateColumns);
      }
      (document.querySelector('[data-layout-modes] [data-mode="normal"]') as HTMLElement).click();
      return out;
    });
    expect(new Set(columns).size).toBe(3);
  }, 60_000);
});

/**
 * #54: en kontroll uten synlig tekst må i det minste SE ut som en kontroll.
 * Søketriggeren var en 40×30 ramme rundt et 14 px ikon, klemt mellom to 36×36
 * ikonknapper — den leste som en tom boks framfor en knapp. Vakta er
 * strukturell: den vet ikke hvilke knapper som finnes, bare at alt i headeren
 * uten lesbar tekst må ha en trykkflate på linje med de andre og et navn en
 * skjermleser kan lese opp.
 */
/**
 * #55: mellom headeren og brødsmulestien lå det 80 px tomt på en 390 px-skjerm
 * — 9,5 % av skjermhøyden brukt på ingenting, før leseren i det hele tatt hadde
 * sett en NAVIGASJONS-rad. Årsaken var den samme som i #52, bare på loddrett
 * akse: `.site-main` eide 32 px toppinnrykk, og hver sidecontainer
 * (`.overview-main`, `.user-main`, …) la på sine egne 48 px uten å vite om det.
 *
 * Vakta har derfor to halvdeler, og de fanger hver sin ting:
 *
 *   AVSTANDEN — det brukeren ser. Header-bunn til brødsmule under 40 px på
 *   mobil, og LIKT på alle sidetyper (i dag spriker de ikke). Desktop skal
 *   fortsatt ha sin luftige innledning, ellers ville «fjern padding overalt»
 *   bestått.
 *
 *   EIERSKAPET — det som gjør at neste container ikke kan legge på sitt eget i
 *   stillhet. En wrapper UTEN egen flate (ingen bakgrunn, ramme eller skygge)
 *   er ren layout og skal ikke eie toppinnrykk på mobil; et KORT har sin egen
 *   innvendige luft og stopper gjennomgangen. Invarianten er dermed uavhengig
 *   av hvilke klassenavn som finnes, så en helt ny sidecontainer blir målt uten
 *   at noen har ført den opp.
 */
describe('mobil-layout: ett toppinnrykk mellom header og innhold (#55)', () => {
  /** Under dette er «rett under headeren». `.site-main` eier 32 px selv. */
  const MOBILE_MAX = 40;
  /** Desktop skal beholde sin luft — 64–80 px i dag. */
  const DESKTOP_MIN = 60;
  /** Kapittelsidas brødsmule står midtstilt i en rad med knapper: +6 px. */
  const SPREAD = 8;

  const gaps = new Map<string, number>();

  /** Avstand fra header-bunn til brødsmulestien, eller null om sida ikke har en. */
  function crumbGap() {
    const header = document.querySelector('.site-header');
    const crumb = document.querySelector('.site-main .breadcrumbs');
    if (!header || !crumb) return null;
    return Math.round(crumb.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
  }

  /**
   * Går ned den FØRSTE synlige barnekjeden fra `.site-main` og rapporterer hver
   * ren layout-wrapper som legger på toppinnrykk selv. Stopper ved første
   * element som har en synlig flate (et kort eier sin egen innvendige luft) og
   * ved første element som selv bærer tekst.
   */
  function topPadders() {
    const main = document.querySelector('.site-main');
    const out: { selector: string; paddingTop: string; marginTop: string }[] = [];
    if (!main) return out;

    const label = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
      return el.tagName.toLowerCase() + cls.slice(0, 2).map((c) => `.${c}`).join('');
    };
    const firstVisibleChild = (el: Element) => {
      for (const kid of el.children) {
        const r = kid.getBoundingClientRect();
        // `.sr-only` er 1 px og `clip`-et — skjermlesertekst er ikke det som
        // skyver innholdet nedover.
        if (r.width < 2 || r.height < 2 || !(kid as HTMLElement).checkVisibility()) continue;
        return kid;
      }
      return null;
    };
    const hasOwnText = (el: Element) =>
      Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue?.trim());

    for (let node = firstVisibleChild(main), depth = 0; node && depth < 12; depth++) {
      const cs = getComputedStyle(node);
      // Et KORT — ramme, hjørneradius eller skygge — eier sin egen innvendige
      // luft, og der stopper gjennomgangen. En bar `background` teller IKKE:
      // `.chapter-page` maler bare sidebakgrunnen og er ellers ren layout, og
      // det var nettopp under den kapittelsidas 24 px lå.
      const card = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderTopLeftRadius) > 0 || cs.boxShadow !== 'none';
      if (card) break;
      if (parseFloat(cs.paddingTop) > 0 || parseFloat(cs.marginTop) > 0) {
        out.push({ selector: label(node), paddingTop: cs.paddingTop, marginTop: cs.marginTop });
      }
      if (hasOwnText(node)) break;
      node = firstVisibleChild(node);
    }
    return out;
  }

  for (const p of PAGES) {
    test(
      `${p.path} — ${p.name}`,
      async () => {
        const [path, query] = p.path.split('?');
        const url = `http://localhost:${server.port}${href(DEFAULT_LOCALE, path!)}${query ? `?${query}` : ''}`;
        await page.navigate(url);

        await page.setViewport({ width: 390, height: 844 });
        const padders = await page.evaluate(topPadders);
        expect([
          p.path,
          padders.map((o) => `${o.selector} (padding-top: ${o.paddingTop}, margin-top: ${o.marginTop})`),
        ]).toEqual([p.path, []]);

        const gap = await page.evaluate(crumbGap);
        if (gap === null) return; // sider uten brødsmule (forsiden, 404) — eierskapet er sjekket over
        gaps.set(p.path, gap);
        expect([p.path, gap <= MOBILE_MAX]).toEqual([p.path, true]);

        // Desktop har råd til luften, og skal ikke miste den av denne fiksen.
        await page.setViewport({ width: 1280, height: 900 });
        const wide = await page.evaluate(crumbGap);
        expect([p.path, (wide ?? 0) >= DESKTOP_MIN]).toEqual([p.path, true]);
      },
      60_000,
    );
  }

  test('alle sidetyper starter på samme sted', () => {
    expect(gaps.size).toBeGreaterThan(PAGES.length / 2);
    const målte = [...gaps.values()];
    const spredning = Math.max(...målte) - Math.min(...målte);
    const verste = [...gaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    expect([verste, spredning <= SPREAD]).toEqual([verste, true]);
  });
});

/**
 * #56: på mobil vises BÅDE den faste verktøylinja og kapittel-skinna, og fire
 * av skinnas fem brikker fantes allerede i verktøylinja eller ⚙-arket. Skinna
 * kostet altså en hel rad med sidelengs scroll for å tilby ÉN ting som ikke
 * fantes fra før — «Bidra» — og nettopp den trenger leseren sjeldnest.
 *
 * Vakta har to halvdeler, og de holder hverandre ærlige:
 *
 *   SKINNA er borte under 768 px og står igjen over. Bare mobil-siden ville
 *   bestått like fint om noen skjulte skinna overalt — og på desktop er den
 *   ikke duplikat, for der er verktøylinja skjult.
 *
 *   HANDLINGENE overlever flyttingen. For hver brikke i skinna (målt på
 *   desktop, der den finnes) må mobilens chrome — verktøylinja og arkene, som
 *   er én tapp unna selv når de er `hidden` — tilby det samme: enten nøyaktig
 *   samme adresse, eller, når brikka bare skrur en query-parameter av eller på,
 *   det samme valget i en `<select>`. Den halvdelen kjenner ingen brikker ved
 *   navn, så en NY brikke i skinna må også finne en plass på mobil — ellers
 *   forsvinner den for telefonleseren uten at noen merker det.
 */
describe('mobil-chrome: skinna gjentar ikke verktøylinja (#56)', () => {
  const railDisplay = () => {
    const rail = document.querySelector('.chapter-rail');
    return rail ? getComputedStyle(rail).display : '(finnes ikke)';
  };

  /**
   * Hva hver brikke i skinna FAKTISK gjør: en adresse, og — når den peker på
   * sida vi står på — hvilke query-parametre den endrer.
   */
  function railActions() {
    const here = new URL(location.href);
    return Array.from(document.querySelectorAll('.chapter-rail a[href]')).map((el) => {
      const url = new URL(el.getAttribute('href')!, location.href);
      const changed: string[] = [];
      for (const name of new Set([...url.searchParams.keys(), ...here.searchParams.keys()])) {
        const to = url.searchParams.get(name) ?? '';
        if (to !== (here.searchParams.get(name) ?? '')) changed.push(`${name}=${to}`);
      }
      return {
        label: (el as HTMLElement).textContent!.trim(),
        samePath: url.pathname === here.pathname,
        target: url.pathname + url.search,
        changed,
      };
    });
  }

  /**
   * Hva mobilens chrome tilbyr. Arkene teller selv om de er `hidden` — de er
   * én tapp unna, og det er hele poenget med å flytte noe DIT. Navnet på
   * parameteren en `<select>` styrer leses ut av `data-<param>-select`, så et
   * nytt nedtrekk kommer med uten at noen fører det opp her.
   */
  function mobileReach() {
    const urls: string[] = [];
    const choices: string[] = [];
    for (const root of document.querySelectorAll('[data-mobile-toolbar], .mt-overlay, .studium-overlay')) {
      for (const a of root.querySelectorAll('a[href]')) {
        const u = new URL(a.getAttribute('href')!, location.href);
        urls.push(u.pathname + u.search);
      }
      for (const sel of root.querySelectorAll('select')) {
        const attr = Array.from(sel.attributes).find((a) => /^data-.+-select$/.test(a.name));
        if (!attr) continue;
        const param = attr.name.slice('data-'.length, -'-select'.length);
        for (const opt of sel.querySelectorAll('option')) choices.push(`${param}=${(opt as HTMLOptionElement).value}`);
      }
    }
    return { urls, choices };
  }

  const url = (path: string) => `http://localhost:${server.port}${href(DEFAULT_LOCALE, path)}`;

  test('skinna er borte på mobil og står igjen på desktop', async () => {
    await page.navigate(url('/1mos/12'));
    for (const width of [320, 390, 768]) {
      await page.setViewport({ width, height: 844 });
      expect([width, await page.evaluate(railDisplay)]).toEqual([width, 'none']);
    }
    await page.setViewport({ width: 1280, height: 900 });
    expect(await page.evaluate(railDisplay)).not.toBe('none');
  }, 60_000);

  test('hver handling i skinna er fortsatt innen rekkevidde på mobil', async () => {
    await page.navigate(url('/1mos/12'));

    await page.setViewport({ width: 1280, height: 900 });
    const actions = await page.evaluate(railActions);
    // Uten dette ville vakta bestått på en skinne som ikke finnes i det hele
    // tatt, og da måler den ingenting.
    expect(actions.length).toBeGreaterThan(3);

    await page.setViewport({ width: 390, height: 844 });
    const reach = await page.evaluate(mobileReach);

    const lost = actions.filter((a) => {
      if (reach.urls.includes(a.target)) return false;
      // En brikke som bare skrur en parameter av/på er dekket når arket tilbyr
      // det samme valget — mekanismen er en annen, handlingen er den samme.
      return !(a.samePath && a.changed.length > 0 && a.changed.every((c) => reach.choices.includes(c)));
    });

    expect(lost.map((a) => `${a.label} → ${a.target}`)).toEqual([]);
  }, 60_000);
});

describe('mobil-chrome: ikonknapper i headeren (#54)', () => {
  test('alt uten synlig tekst er minst 36×36 og har et tilgjengelig navn', async () => {
    await page.navigate(`http://localhost:${server.port}${href(DEFAULT_LOCALE, '/1mos/1')}`);
    await page.setViewport({ width: 390, height: 844 });

    const bad = await page.evaluate(() => {
      const header = document.querySelector('.site-header-inner')!;
      const out: { selector: string; box: string; navn: string }[] = [];
      for (const el of header.querySelectorAll('a, button, summary')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        // Innholdet i et LUKKET <details> (produktmenyen, mobilmenyen) har
        // fortsatt en boks, men rendres ikke — og `innerText` er tom for det.
        // Uten denne linja leses hver skjulte menylenke som en navnløs
        // ikonknapp, og vakta klager på noe brukeren aldri ser.
        if (!el.checkVisibility()) continue;
        // Har den lesbar tekst, er den ikke en ikonknapp.
        if ((el as HTMLElement).innerText?.trim()) continue;
        const navn = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (r.width >= 36 && r.height >= 36 && navn) continue;
        out.push({
          selector: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ''),
          box: `${Math.round(r.width)}×${Math.round(r.height)}`,
          navn: navn || '(mangler)',
        });
      }
      return out;
    });

    expect(bad).toEqual([]);
  }, 60_000);
});
