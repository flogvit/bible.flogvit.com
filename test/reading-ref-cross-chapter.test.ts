// En lesning som KRYSSER et kapittelskille skal vise hele lesningen (GitHub #92).
//
// `/nb/lesetekster/2026-08-09` sa «Jes 64,6b-65,2@dnb2024» og viste ETT vers —
// Jes 63,1, «Hvem er dette som kommer fra Edom», en tekst som ikke har noe med
// dagens lesning å gjøre. Årsaken lå i importen: versparseren leste bare
// endepunkter uten kapittel, så «6b-65:2» ga null spenn, og fallbacken «ingen
// versspesifikasjon = hele kapittelet» slo inn og satte inn vers 1 av det
// kapittelet startverset havnet i.
//
// Utslaget er STILLE, som #45, #65 og #73: sida svarer 200, blokka er full av
// tekst, og bare den som slår opp i tekstrekka ser at det er FEIL tekst. Ingen
// loggrad, ingen 404. 11 lesedager sto slik, blant dem hele lidelsesfortellingen
// langfredag (Matt 26,30-27,50, Mark 14,26-15,37, Joh 18,1-19,42).
//
// Vaktene er formulert på UTFALLET og på KONTRAKTEN, ikke på de ni målte
// referansene: en adresse som navngir vers får aldri bli lagret som «hele
// kapittelet», og etiketten leseren ser må navngi nøyaktig de versene blokka
// under leverer. Da består en fiks som løser det på en annen måte like gjerne.
//
// Krever lokal DB (DBngin :3326) med importert innhold.

import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql } from '../src/lib/db.ts';
import { href } from '../src/lib/i18n.ts';
import { parseReadingRefMarkup, repairWholeChapterReadingRefs } from '../src/lib/reading-ref.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

/** Bærer markupen en versadresse, eller navngir den bare et kapittel? */
function namesVerses(displayRef: string): boolean {
  const ref = displayRef.replace(/^\[ref:/, '').split('@')[0]!.split('|')[0]!;
  return /\d\s*[,:]\s*\d/.test(ref);
}

/**
 * Etiketten leseren ser → adressene den PÅSTÅR («Rom 9,2-5; 10,1-4»).
 *
 * Uten dette måtte vakta lete etter delstrenger, og «10,1-4» inneholder ikke
 * teksten «10,4» — altså ville den målt formen på etiketten framfor hva den sier.
 */
function lesEtikett(etikett: string): { fra: Adresse; til: Adresse }[] {
  const uten = etikett.replace(/^[^\d]+/, '');
  const spenn: { fra: Adresse; til: Adresse }[] = [];
  for (const del of uten.split(';')) {
    const m = del.trim().match(/^(\d+),(\d+)([a-c])?(?:-(?:(\d+),)?(\d+)([a-c])?)?$/);
    if (!m) continue;
    const fra = { kapittel: parseInt(m[1]!, 10), vers: parseInt(m[2]!, 10), del: m[3] ?? '' };
    const til = m[5]
      ? { kapittel: m[4] ? parseInt(m[4], 10) : fra.kapittel, vers: parseInt(m[5], 10), del: m[6] ?? '' }
      : fra;
    spenn.push({ fra, til });
  }
  return spenn;
}

interface Adresse { kapittel: number; vers: number; del: string }

/** Adressene i markupen som krysser et kapittelskille («64,6b-65,2»). */
function crossesChapter(displayRef: string): boolean {
  const ref = displayRef.replace(/^\[ref:/, '').split('@')[0]!.split('|')[0]!;
  return /\d\s*[,:]\s*\d+[a-c]?\s*[-–—]\s*\d+\s*[,:]\s*\d/.test(ref);
}

// ── REGELEN ────────────────────────────────────────────────────────────────
// Ren logikk, ingen DB-tilstand: adressene leses ut av basen (som #70 og #80),
// så en ny innholdsrunde flytter målingen selv.

describe('REGELEN: en adresse som navngir vers gir versadresser', () => {
  test('ingen lesetekst-referanse i basen faller til «hele kapittelet»', async () => {
    const refs = ((await getSql()`SELECT DISTINCT display_ref FROM reading_text_refs`) as unknown as {
      display_ref: string;
    }[]).map((r) => r.display_ref);
    expect(refs.length).toBeGreaterThan(0);

    const falt = refs.filter((markup) => {
      if (!namesVerses(markup)) return false;
      const parsed = parseReadingRefMarkup(markup);
      // Ett spenn uten slutt ER fallbacken «hele kapittelet» — og den er gal
      // for en adresse som navngir vers.
      return !parsed || (parsed.rows.length === 1 && parsed.rows[0]!.verseEnd === null);
    });
    expect(falt).toEqual([]);
  });

  test('en kryssende adresse dekker BEGGE kapitlene, ikke bare det første', async () => {
    const refs = ((await getSql()`SELECT DISTINCT display_ref FROM reading_text_refs`) as unknown as {
      display_ref: string;
    }[]).map((r) => r.display_ref).filter(crossesChapter);
    // Uten en eneste kryssende adresse måler de to over ingenting.
    expect(refs.length).toBeGreaterThan(0);

    for (const markup of refs) {
      const parsed = parseReadingRefMarkup(markup)!;
      const kapitler = new Set(parsed.rows.map((r) => r.chapter));
      expect({ markup, kapitler: kapitler.size >= 2 }).toEqual({ markup, kapitler: true });
      // Sammenhengende: ingen hull mellom kapitlene, og hvert spenn har en slutt.
      const sortert = [...kapitler].sort((a, b) => a - b);
      expect({ markup, hull: sortert[sortert.length - 1]! - sortert[0]! === sortert.length - 1 }).toEqual({ markup, hull: true });
      expect({ markup, uten: parsed.rows.some((r) => r.verseEnd === null) }).toEqual({ markup, uten: false });
    }
  });

  test('sakens egen adresse: Jes 64,6b-65,2 er 64,6b→kapittelslutt + 65,1-2', () => {
    const parsed = parseReadingRefMarkup('[ref:Jes 64,6b-65,2@dnb2024]')!;
    expect(parsed.bookId).toBe(23);
    expect(parsed.rows).toEqual([
      { chapter: 64, verseStart: 6, verseEnd: 11, partStart: 'b', partEnd: null },
      { chapter: 65, verseStart: 1, verseEnd: 2, partStart: null, partEnd: null },
    ]);
  });

  test('en adresse UTEN vers er fortsatt hele kapittelet — regelen gjetter ikke', () => {
    const parsed = parseReadingRefMarkup('[ref:Sal 23@dnb2024]')!;
    expect(parsed.rows).toEqual([{ chapter: 23, verseStart: 1, verseEnd: null, partStart: null, partEnd: null }]);
  });

  test('en adresse vi ikke kan lese gir null framfor et halvt svar', () => {
    expect(parseReadingRefMarkup('[ref:Finnesikke 3,16]')).toBeNull();
    expect(parseReadingRefMarkup('Jes 64,6b-65,2')).toBeNull();
  });
});

// ── REPARASJONEN ───────────────────────────────────────────────────────────
// En fiks i importen når ikke leseren: `reading_texts` importeres bare når
// kildefilene endrer seg, og tekstrekkene ligger fast i årevis. Halvdelen måler
// derfor at raden som ALT ligger i basen blir rettet — det er `ensureSchema()`
// som kjører dette, altså hver deploy.

const DATO = '2099-08-09';
const DATO_HELT = '2099-08-10';
const MARKUP = '[ref:Jes 64,6b-65,2@dnb2024]';
let seededId = 0;
let heltId = 0;

/** Én lesningsrad, slik importen skriver den. */
interface SeedRef {
  slot: number;
  tittel: string;
  markup: string;
  bookId: number;
  chapter: number;
  verseStart: number;
  verseEnd: number | null;
  sortOrder: number;
}

/**
 * Seedingen går gjennom disse tre, og hver verdi står som en PARAMETER på egen
 * linje. Ikke bare pynt: en spørring satt sammen med `${…}` inne i teksten kan
 * ikke skilles fra en injeksjon utenfra av den som leser diffen, og det gjelder
 * en testfil like mye som en rute — porten er formulert på formen, ikke på hvem
 * som skrev den.
 */
async function slettLesedag(dato: string): Promise<void> {
  const sql = getSql();
  // Barna først: `reading_text_refs` har ingen FK, så en foreldreløs rad ville
  // blitt liggende og forurenset sveipene over hele basen.
  await sql`
    DELETE r
    FROM reading_text_refs r
    JOIN reading_texts t ON t.id = r.reading_text_id
    WHERE t.date = ${dato}
  `;
  await sql`
    DELETE
    FROM reading_texts
    WHERE date = ${dato}
  `;
}

async function seedLesedag(dato: string, navn: string): Promise<number> {
  const sql = getSql();
  await slettLesedag(dato);
  await sql`
    INSERT INTO reading_texts
      (date, name, series, language)
    VALUES (
      ${dato}, ${navn}, ${'I'}, ${'nb'}
    )
  `;
  const [row] = (await sql`
    SELECT id
    FROM reading_texts
    WHERE date = ${dato}
      AND language = ${'nb'}
  `) as unknown as { id: number }[];
  return row!.id;
}

async function seedRef(readingTextId: number, r: SeedRef): Promise<void> {
  await getSql()`
    INSERT INTO reading_text_refs
      (reading_text_id, slot_index, option_index, part_index, title, display_ref,
       book_id, chapter, verse_start, verse_end, part_start, part_end, sort_order)
    VALUES (
      ${readingTextId}, ${r.slot}, 0, 0, ${r.tittel}, ${r.markup},
      ${r.bookId}, ${r.chapter}, ${r.verseStart}, ${r.verseEnd}, ${null}, ${null}, ${r.sortOrder}
    )
  `;
}

async function seedDefekten(): Promise<number> {
  const id = await seedLesedag(DATO, '#92-vakt');
  // Nøyaktig raden den gamle importen skrev: hele kapittelet, ett vers.
  await seedRef(id, {
    slot: 0,
    tittel: 'Kan du rolig se på dette, Herre?',
    markup: MARKUP,
    bookId: 23,
    chapter: 63,
    verseStart: 1,
    verseEnd: null,
    sortOrder: 0,
  });
  // Og nabotilfellet, som står riktig og skal FORTSETTE å gjøre det: to
  // atskilte lesninger i samme del. En etikett som slo dem sammen ville lovet
  // «Rom 9,2-10,4», altså 28 vers vi ikke viser.
  for (const [i, r] of [[9, 2, 5], [10, 1, 4]].entries()) {
    await seedRef(id, {
      slot: 1,
      tittel: 'Guds gaver til Israel',
      markup: `[ref:Rom ${r[0]},${r[1]}-${r[2]}@dnb2024]`,
      bookId: 45,
      chapter: r[0]!,
      verseStart: r[1]!,
      verseEnd: r[2]!,
      sortOrder: 10 + i,
    });
  }
  return id;
}

afterAll(async () => {
  await slettLesedag(DATO);
  await slettLesedag(DATO_HELT);
});

describe('REPARASJONEN: raden som alt ligger i basen rettes ved deploy', () => {
  test('«hele kapittelet» byttes med spennene adressen faktisk navngir', async () => {
    const sql = getSql();
    seededId = await seedDefekten();

    const report = await repairWholeChapterReadingRefs(sql);
    expect(report.repaired.some((r) => r.displayRef === MARKUP)).toBe(true);

    const rows = (await sql`
      SELECT chapter, verse_start, verse_end, part_start
      FROM reading_text_refs
      WHERE reading_text_id = ${seededId}
        AND slot_index = 0
      ORDER BY sort_order
    `) as unknown as { chapter: number; verse_start: number; verse_end: number | null; part_start: string | null }[];
    expect(rows.map((r) => [r.chapter, r.verse_start, r.verse_end, r.part_start])).toEqual([
      [64, 6, 11, 'b'],
      [65, 1, 2, null],
    ]);
  });

  test('en adresse som VIRKELIG er hele kapittelet røres ikke', async () => {
    // Reparasjonen gjetter ikke: «Sal 23» uten vers ER hele kapittelet, og en
    // regel som skrev om alt med `verse_end IS NULL` ville meldt den som rettet
    // ved hver eneste deploy — og churnet raden i det uendelige.
    const sql = getSql();
    heltId = await seedLesedag(DATO_HELT, '#92-vakt-helt');
    await seedRef(heltId, {
      slot: 0,
      tittel: 'Herren er min hyrde',
      markup: '[ref:Sal 23@dnb2024]',
      bookId: 19,
      chapter: 23,
      verseStart: 1,
      verseEnd: null,
      sortOrder: 0,
    });

    const report = await repairWholeChapterReadingRefs(sql);
    expect(report.repaired.filter((r) => r.displayRef === '[ref:Sal 23@dnb2024]')).toEqual([]);

    const etter = (await sql`
      SELECT chapter, verse_start, verse_end
      FROM reading_text_refs
      WHERE reading_text_id = ${heltId}
    `) as unknown as { chapter: number; verse_start: number; verse_end: number | null }[];
    expect(etter).toEqual([{ chapter: 23, verse_start: 1, verse_end: null }]);
  });

  test('den er idempotent — andre kjøring retter ingenting', async () => {
    const report = await repairWholeChapterReadingRefs(getSql());
    expect(report.repaired.filter((r) => r.displayRef === MARKUP)).toEqual([]);
  });

  test('ingen rad i basen bærer fallbacken for en adresse som navngir vers', async () => {
    const rows = (await getSql()`
      SELECT DISTINCT display_ref FROM reading_text_refs WHERE verse_end IS NULL
    `) as unknown as { display_ref: string }[];
    expect(rows.map((r) => r.display_ref).filter(namesVerses)).toEqual([]);
  });
});

// ── SIDA ───────────────────────────────────────────────────────────────────
// Det leseren faktisk møter. Halvdelen finnes fordi ingen av de over kan se om
// blokka RENDRER spennet: en fiks som lagrer riktig og viser feil ville bestått.

describe('SIDA: leseren får hele lesningen, og etiketten navngir den', () => {
  test('begge kapitlene rendres, og det gale verset er borte', async () => {
    const res = await app.request(href('nb', `/lesetekster/${DATO}`));
    expect(res.status).toBe(200);
    const html = await res.text();

    // Jes 63,1 — verset fallbacken viste. Det hører ikke til denne lesningen.
    expect(html).not.toContain('kommer fra Edom');
    // Og teksten som faktisk skal stå der, fra BEGGE kapitlene.
    expect(html).toContain('du er vår Far');
    expect(html).toContain('Her er jeg, her er jeg');
  });

  test('etiketten navngir nøyaktig de versene blokka leverer', async () => {
    const res = await app.request(href('nb', `/lesetekster/${DATO}`));
    const html = await res.text();

    // Sveip over HVER lesningsblokk på sida — etiketten og versene måles mot
    // hverandre der de står, ikke på tvers av blokker.
    const blokker = html.split('<div class="reading-text-part">').slice(1);
    expect(blokker.length).toBeGreaterThan(1);

    for (const blokk of blokker) {
      const etikett = blokk.match(/<p class="reading-text-ref-line">([^<]*)<\/p>/)?.[1] ?? '';
      // Mapping-id-en er en intern nøkkel og hører ikke i noe leseren ser.
      expect({ etikett, intern: etikett.includes('@') }).toEqual({ etikett, intern: false });

      const numre = [...blokk.matchAll(/<sup class="reading-text-vnum">(?:(\d+):)?(\d+)([a-c])?<\/sup>/g)];
      expect({ etikett, vers: numre.length > 1 }).toEqual({ etikett, vers: true });
      let kapittel = 0;
      const adresser = numre.map((m) => {
        if (m[1]) kapittel = parseInt(m[1], 10);
        return { kapittel, vers: parseInt(m[2]!, 10), del: m[3] ?? '' };
      });
      const første = adresser[0]!;
      const siste = adresser[adresser.length - 1]!;

      // Etiketten skal begynne på det FØRSTE verset blokka viser og ende på det
      // siste — ellers lover den et annet skriftsted enn den leverer (#73).
      const spenn = lesEtikett(etikett);
      expect({ etikett, lest: spenn.length > 0 }).toEqual({ etikett, lest: true });
      expect({ etikett, start: spenn[0]!.fra }).toEqual({ etikett, start: første });
      expect({ etikett, slutt: spenn[spenn.length - 1]!.til }).toEqual({ etikett, slutt: siste });
    }

    // Og den kryssende lesningen skal virkelig spenne over kapittelskillet.
    const jes = blokker.find((b) => b.includes('reading-text-ref-line">Jes'))!;
    const kapitler = [...jes.matchAll(/<sup class="reading-text-vnum">(\d+):/g)].map((m) => m[1]);
    expect(kapitler).toEqual(['64', '65']);
  });

  test('to atskilte lesninger i samme del slås ikke sammen til én', async () => {
    const html = await (await app.request(href('nb', `/lesetekster/${DATO}`))).text();
    const linjer = [...html.matchAll(/<p class="reading-text-ref-line">([^<]*)<\/p>/g)].map((m) => m[1]!);
    const rom = linjer.find((l) => l.startsWith('Rom')) ?? '';
    expect({ rom, første: rom.includes('9,2-5') }).toEqual({ rom, første: true });
    expect({ rom, andre: rom.includes('10,1-4') }).toEqual({ rom, andre: true });
    // Sammenslått ville den lovet hele veien fra 9,2 til 10,4.
    expect({ rom, slått: rom.includes('9,2-10,4') }).toEqual({ rom, slått: false });
  });

  test('ingen ekte lesedag viser en mapping-id til leseren', async () => {
    // Dagene velges av DATAENE: de som bærer en adresse med `@`-suffiks i det
    // hele tatt, altså der lekkasjen kan skje.
    const dager = (await getSql()`
      SELECT DISTINCT t.date FROM reading_texts t
      JOIN reading_text_refs r ON r.reading_text_id = t.id
      WHERE t.language = 'nb' AND r.display_ref LIKE '%@%' AND t.date <> ${DATO}
      ORDER BY t.date LIMIT 5
    `) as unknown as { date: string }[];
    expect(dager.length).toBeGreaterThan(0);

    for (const { date } of dager) {
      const html = await (await app.request(href('nb', `/lesetekster/${date}`))).text();
      const linjer = [...html.matchAll(/<p class="reading-text-ref-line">([^<]*)<\/p>/g)].map((m) => m[1]!);
      expect({ date, lekker: linjer.filter((l) => l.includes('@')) }).toEqual({ date, lekker: [] });
    }
  });
});

// ── DEPLOYEN ───────────────────────────────────────────────────────────────
// Halvdelene over kaller reparasjonen selv. Kalles den ikke fra `ensureSchema()`,
// kjøres den aldri i prod, og de 11 radene blir stående til noen gjør en full
// innholdsimport — altså er fiksen usynlig for leseren uten at noe blir rødt.

describe('DEPLOYEN: reparasjonen kjøres ved hver utrulling', () => {
  test('runMigrations kaller repairWholeChapterReadingRefs', async () => {
    const src = await Bun.file('src/lib/schema.ts').text();
    expect(/^(?!\s*(?:\/\/|\*)).*\brepairWholeChapterReadingRefs\(sql\)/m.test(src)).toBe(true);
  });
});
