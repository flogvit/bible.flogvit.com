// MARKER VERSENE MAN HOPPER TIL (#91)
//
// «Romerne 12:14-15» i Dagens vers pekte på `/nb/rom/12#v14`. Leseren ble
// scrollet ned midt i kapittelet og satt igjen uten noe som sa hvilke vers
// referansen faktisk gjaldt — teksten rundt ser lik ut, og verset man kom for
// er ett av tretti like linjer.
//
// Feilen har to halvdeler, og bare den ene er synlig på sida: ADRESSEN kunne
// ikke uttrykke rekka. Etiketten lovte «14-15», hashen bar `#v14`, og da kan
// heller ikke lesesida markere annet enn ett vers. Derfor er vakta formulert i
// to trinn — at adressen BÆRER rekka, og at sida MARKERER den — framfor på
// klassenavnet, som er den delen som lett kan byttes ut.
//
// Utslaget er stille, som #45, #65, #70 og #90: sida svarer 200, ingen loggrad,
// og bare den som sitter med lenka merker at hoppet landet et sted uten spor.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql, getSql } from '../src/lib/db.ts';
import { getBookInfoById } from '../src/lib/books-data.ts';
import { toUrlSlug } from '../src/lib/url-utils.ts';
// @ts-expect-error — delt klient-modul uten typer (formen bor ett sted, se #91)
import { parseVerseHash, verseHash } from '../public/js/verse-hash.js';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Klassen lesesida setter på versene hoppet gjaldt. Kjent av markup OG stilark. */
const MARKER = 'is-jump-target';

let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
}, 60_000);

afterAll(async () => {
  server?.stop(true);
  await closeSql();
});

const base = () => `http://localhost:${server.port}`;

describe('REGELEN — adressen kan uttrykke en rekke, og bare når den har en', () => {
  test('sluttverset blir med når det legger til noe', () => {
    expect(verseHash(14, 15)).toBe('#v14-15');
    expect(verseHash(14, 14)).toBe('#v14');
    expect(verseHash(14)).toBe('#v14');
    // En «rekke» som slutter før den begynner er ingen rekke.
    expect(verseHash(14, 13)).toBe('#v14');
  });

  test('den gamle formen leses fortsatt — den er publisert', () => {
    expect(parseVerseHash('#v14')).toEqual({ start: 14, end: 14 });
    expect(parseVerseHash('#v14-15')).toEqual({ start: 14, end: 15 });
    expect(parseVerseHash('v14-15')).toEqual({ start: 14, end: 15 });
  });

  test('en hash vi ikke kjenner gir null, ikke et halvt svar', () => {
    for (const bad of ['', '#', '#v', '#v0', '#top', '#v14-', '#v14-15-16', '#vers14']) {
      expect(parseVerseHash(bad), bad).toBeNull();
    }
  });

  test('bygg og les er hverandres motstykke', () => {
    for (const [start, end] of [
      [1, 1],
      [14, 15],
      [3, 21],
    ] as const) {
      expect(parseVerseHash(verseHash(start, end))).toEqual({ start, end });
    }
  });
});

// LENKENE — den halvdelen som IKKE er synlig på lesesida: bærer adressen i det
// hele tatt rekka etiketten lover? Sveipen kjenner ingen liste over kallsteder;
// den leser den RENDREDE HTML-en og holder etiketten og hashen til hverandre.
describe('LENKENE — en etikett som lover en rekke, adresserer den også', () => {
  /**
   * Sidene er valgt fordi de rendrer referanseblokkene som HAR en rekke
   * (evangelieparalleller, profetier, tekstavsnitt). Finner sveipen ingen slik
   * etikett, feiler den — ellers ville den vært en tom påstand.
   */
  const SIDER = ['/nb', '/nb/rom/12', '/nb/1mos/12', '/nb/matt/1', '/nb/joh/3'];

  /** `Rom 12:14-15` / `Rom 12,14-15` — men ikke `Matt 1:1-2:3`, som er to kapitler. */
  const RANGE = /(\d+)\s*[:,]\s*(\d+)\s*[-–]\s*(\d+)(?![\d:,])/;

  type Lenke = { path: string; href: string; label: string; start: number; end: number; chapter: number };

  async function rangeLinks(path: string): Promise<Lenke[]> {
    const html = await (await fetch(`${base()}${path}`)).text();
    const out: Lenke[] = [];
    for (const m of html.matchAll(/<a[^>]*href="([^"]*#v[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const href = m[1]!;
      const label = m[2]!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const range = RANGE.exec(label);
      const target = /\/(\d+)#v/.exec(href);
      if (!range || !target) continue;
      // Bare etiketter som gjelder KAPITTELET lenka peker på: en referanse til
      // et annet kapittel sier ingenting om denne adressen.
      if (Number(range[1]) !== Number(target[1])) continue;
      out.push({
        path,
        href,
        label,
        chapter: Number(range[1]),
        start: Number(range[2]),
        end: Number(range[3]),
      });
    }
    return out;
  }

  test('hashen bærer nøyaktig den rekka etiketten viser', async () => {
    const alle = (await Promise.all(SIDER.map(rangeLinks))).flat();
    expect(alle.length, 'fant ingen lenke med en rekke i etiketten — sveipen måler ingenting').toBeGreaterThan(0);

    const feil = alle
      .filter((l) => !l.href.endsWith(verseHash(l.start, l.end)))
      .map((l) => `${l.path}: «${l.label}» → ${l.href}`);
    expect(feil.slice(0, 10)).toEqual([]);
  });
});

// FLATA — merket må faktisk VIRKE for leseren. En klasse stilarket ikke
// honorerer ser riktig ut i en HTML-sammenligning og endrer ingenting på
// skjermen; #55 er nettopp den fella. Markeringen settes dessuten av øya i
// nettleseren, så SSR-HTML-en kan per konstruksjon ikke se den.
describe('FLATA — versene hoppet gjaldt er merket, og merket synes', () => {
  let chrome: Chrome;
  let page: Page;
  let slug = '';
  let chapter = 0;
  let start = 0;
  let end = 0;

  beforeAll(async () => {
    // Kapittelet velges av DATAENE: det første som er langt nok til at et hopp
    // til midten faktisk er et hopp. Målet er midtversene, altså nøyaktig
    // formen saken er meldt på.
    const [rad] = (await getSql()`
      SELECT book_id, chapter, MAX(verse) AS siste
      FROM verses WHERE bible = 'osnb'
      GROUP BY book_id, chapter HAVING siste >= 20
      ORDER BY book_id, chapter LIMIT 1
    `) as { book_id: number; chapter: number; siste: number }[];
    expect(rad, 'fant ingen kapittel med minst 20 vers').toBeDefined();

    const book = getBookInfoById(rad!.book_id);
    expect(book).toBeDefined();
    slug = toUrlSlug(book!.short_name);
    chapter = rad!.chapter;
    start = Math.floor(rad!.siste / 2);
    end = start + 1;

    chrome = await Chrome.launch();
    page = await chrome.open('about:blank');
  }, 60_000);

  afterAll(async () => {
    await page?.close();
    await chrome?.close();
  }, 30_000);

  type Vers = { n: number; marked: boolean; background: string; borderLeft: number; iSyne: boolean };

  function readVerses(marker: string): Vers[] {
    return Array.from(document.querySelectorAll('.verse[data-verse-num]')).map((v) => {
      const el = v as HTMLElement;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        n: Number(el.dataset.verseNum),
        marked: el.classList.contains(marker),
        background: cs.backgroundColor,
        borderLeft: parseFloat(cs.borderLeftWidth) || 0,
        iSyne: rect.top >= 0 && rect.bottom <= window.innerHeight,
      };
    });
  }

  /** Hver måling er sitt eget dokument: en ren hash-endring laster ikke sida på nytt. */
  async function measure(hash: string): Promise<Vers[]> {
    await page.navigate('about:blank');
    await page.navigate(`${base()}/nb/${slug}/${chapter}${hash}`);
    const rows = await page.evaluate(readVerses, MARKER);
    expect(rows.length, `ingen vers på /nb/${slug}/${chapter}`).toBeGreaterThan(0);
    return rows;
  }

  test('en rekke merker HELE rekka — og ingenting utenfor', async () => {
    const rows = await measure(verseHash(start, end));
    expect(rows.filter((r) => r.marked).map((r) => r.n)).toEqual([start, end]);
    // Hoppet skjedde også: målverset står i skjermbildet.
    expect(rows.find((r) => r.n === start)?.iSyne).toBe(true);
  });

  test('merket er SYNLIG — stilarket honorerer klassen', async () => {
    const rows = await measure(verseHash(start, end));
    const merket = rows.find((r) => r.n === start)!;
    const umerket = rows.find((r) => !r.marked)!;
    expect(merket.background).not.toBe(umerket.background);
    expect(merket.borderLeft).toBeGreaterThan(umerket.borderLeft);
  });

  test('ett vers merker ett vers — den gamle formen er ikke blitt bredere', async () => {
    const rows = await measure(verseHash(start));
    expect(rows.filter((r) => r.marked).map((r) => r.n)).toEqual([start]);
  });

  test('merket gjør ikke sida bredere enn skjermen (#50)', async () => {
    // Merket henger 12 px ut i sideinnrykket for å holde grunnlinja. Det er
    // plass til det (56 px på desktop, 20 px fra `.site-main` på mobil) — men
    // `mobile-layout.test.ts` måler uten hash og ser derfor aldri merkede vers.
    await page.setViewport({ width: 320, height: 720 });
    const rows = await measure(verseHash(start, end));
    expect(rows.some((r) => r.marked)).toBe(true);
    const bredde = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(bredde.scroll).toBeLessThanOrEqual(bredde.client);
  });

  test('uten hash er ingenting merket — vi maler ikke hele kapittelet', async () => {
    const rows = await measure('');
    expect(rows.filter((r) => r.marked)).toEqual([]);
  });
});
