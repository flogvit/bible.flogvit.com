// EN KAPITTELSIDE SKAL IKKE HENTE OG PARSE HELE PERSONREGISTERET (#110).
//
// Målt på den lokale basen, `/en/rom/8` — en ferdig side på 232 kB:
// `getPersonsByChapter` hentet 2029 rader og 8,1 MB tekst og parset hver
// eneste av dem, +36 MB flyktig rss. Tre søskengettere gjorde det samme i det
// små. Til sammen ~43 MB per kapittelrender, på den mest besøkte flata vi har
// (1189 kapitler × 8 språk) — og det er dette #110 måler enden av: residenten
// klatrer 15 MB/t og flater aldri ut mens live-settet står stille.
//
// Vakta har seks halvdeler, og bare den siste er den vanlige:
//
//   REGELEN       ren logikk: forfilteret og den avledede kolonnen, begge veier
//   SUPERSETTET   DATA: verken forfilteret eller kolonnen får kaste en rad det
//                 EKSAKTE predikatet ville beholdt — målt på HELE basen
//   SVARET        getterne gir ordrett det de ga før, for adresser valgt av
//                 DATAENE (og en FAIL-SAFE: NULL-kolonne = som før)
//   SPRÅKVALGET   spørringen holder tilbake BLOBBEN, ikke raden — ellers
//                 flytter `inLanguage()` en nb-side over på de engelske (#26)
//   FORMEN        hver av de fire getterne narrer før den parser
//   DEPLOYEN      `ensureSchema()` synker kolonnen — ellers er fiksen usynlig
//                 i prod uten at noe blir rødt (#92)
//   MINNET        eget program: den nye veien koster en brøkdel av den gamle
//
// Se bible.flogvit.com#110.

import { describe, expect, test, beforeAll, setDefaultTimeout } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BOOK_KEY,
  bookMentionTest,
  formatRefBooks,
  personRefBooks,
  refBooksMayMatch,
  personChapterCandidates,
  refBooksNeedle,
  syncPersonRefBooks,
} from '../src/lib/blob-forfilter.ts';
import { getSql } from '../src/lib/db.ts';
import { ensureSchema } from '../src/lib/schema.ts';
import {
  getNumberSymbolismByChapter,
  getPersonsByChapter,
  getStoriesByChapter,
  getThemesByChapter,
  initBooks,
  parsePersonContent,
} from '../src/lib/bible.ts';
import { contentLanguageChain } from '../src/lib/lang.ts';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

// `ensureSchema()` er 44 CREATE TABLE + hele runMigrations(); Buns 5000 ms er
// ikke valgt for det (#74). Ryker en hook, forsvinner HELE fila i stillhet.
setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const ROT = resolve(import.meta.dir, '..');

// Faste strenger med `?`-parametre — aldri satt sammen, som i modulen selv.
const PERSONER_I_SPRAAK = 'SELECT content FROM persons WHERE language = ?';
const REF_BOOKS_FOR_ID = 'SELECT ref_books AS v FROM persons WHERE id = ?';
const SETT_REF_BOOKS_FOR_ID = 'UPDATE persons SET ref_books = ? WHERE id = ?';
const TELL_PERSONER = 'SELECT COUNT(*) AS n FROM persons WHERE language = ?';

beforeAll(async () => {
  // `ensureSchema()` her og ikke bare i DEPLOYEN-halvdelen: kjøres fila alene
  // mot en base som ikke er løftet ennå, finnes ikke kolonnen, og halvdelene
  // over ville feilet på «Unknown column» framfor på det de måler.
  await ensureSchema(getSql());
  await initBooks();
});

describe('REGELEN — forfilteret og den avledede kolonnen', () => {
  test('forfilteret er blindt for FORMATERINGEN', () => {
    // `persons` og `number_symbolism` ligger pen-printet i basen, `stories`
    // kompakt. Begge er den samme adressen.
    const treffer = bookMentionTest(45);
    expect(treffer('{"references":[{"bookId":45,"chapterId":8}]}')).toBe(true);
    expect(treffer('{\n  "references": [\n    {\n      "bookId": 45,\n')).toBe(true);
    expect(treffer('{"bookId"\t:\t45}')).toBe(true);
  });

  test('45 er ikke 450, 456 eller 4', () => {
    // Uten `(?!\d)` ville forfilteret vært en bredere superset — fortsatt
    // trygt, men unødig dyrt, og da måler MINNET-halvdelen mindre enn den tror.
    const treffer = bookMentionTest(45);
    expect(treffer(`{"${BOOK_KEY}":450}`)).toBe(false);
    expect(treffer(`{"${BOOK_KEY}":456}`)).toBe(false);
    expect(treffer(`{"${BOOK_KEY}":4}`)).toBe(false);
    expect(treffer(`{"${BOOK_KEY}":5}`)).toBe(false);
    expect(bookMentionTest(4)(`{"${BOOK_KEY}":45}`)).toBe(false);
  });

  test('en blobb uten boka gir NEI — ellers er forfilteret et no-op', () => {
    // Halvdelen finnes fordi «returner alltid true» ellers ville bestått alt
    // annet i fila utenom MINNET.
    expect(bookMentionTest(45)('{"references":[{"bookId":1,"chapterId":1}]}')).toBe(false);
  });

  test('kolonnen er sortert, unik og komma i BEGGE ender', () => {
    // `,1,45,` og ikke `1,45`: uten kommaene ville `,45,` vært et prefiks av
    // `,450,`, og en person i Åpenbaringen dukket opp i Romerne.
    expect(formatRefBooks([45, 1, 45])).toBe(',1,45,');
    expect(formatRefBooks([])).toBe(',');
    expect(refBooksNeedle(45)).toBe(',45,');
    expect(personRefBooks('{"references":[{"bookId":45},{"bookId":1},{"bookId":45}]}')).toBe(',1,45,');
  });

  test('bare TALL i 1..66 — resten kan aldri treffe et kapittel', () => {
    // Det eksakte predikatet er `ref.bookId === bookId`, altså streng likhet
    // mot et tall fra `books-data`. En id som streng eller utenfor kanon
    // treffer aldri, og å ta den med ville gjort kolonnen bredere uten å dekke
    // noe.
    expect(personRefBooks('{"references":[{"bookId":"45"},{"bookId":0},{"bookId":67},{"bookId":66}]}')).toBe(',66,');
    expect(personRefBooks('{"references":[]}')).toBe(',');
    expect(personRefBooks('{}')).toBe(',');
    expect(personRefBooks('ikke json')).toBe(',');
  });

  test('NULL er «ikke beregnet» og gir JA — kolonnen er aldri en sannhet', () => {
    // FAIL-SAFE. Ville denne vært `false`, var en base der synken ikke har
    // kjørt en base uten personer på kapittelsidene — en stille tapt person,
    // altså samme klasse hull som #45, #65 og #69. Mutasjonstestet.
    expect(refBooksMayMatch(null, 45)).toBe(true);
    expect(refBooksMayMatch(undefined, 45)).toBe(true);
    expect(refBooksMayMatch(',1,45,', 45)).toBe(true);
    expect(refBooksMayMatch(',1,45,', 4)).toBe(false);
    expect(refBooksMayMatch(',450,', 45)).toBe(false);
    expect(refBooksMayMatch(',', 45)).toBe(false);
  });
});

describe('SUPERSETTET — verken forfilteret eller kolonnen kaster en rad det eksakte predikatet beholder', () => {
  test('persons: kolonnen godtar HVER bok raden faktisk adresserer', async () => {
    const rader = (await getSql()`
      SELECT id, content, ref_books FROM persons
    `) as { id: number; content: string; ref_books: string | null }[];
    // Uten rader måler halvdelen ingenting.
    expect(rader.length).toBeGreaterThan(100);

    const brudd: string[] = [];
    for (const rad of rader) {
      const p = parsePersonContent(rad.content);
      for (const ref of p?.references ?? []) {
        if (typeof ref.bookId !== 'number') continue;
        if (!refBooksMayMatch(rad.ref_books, ref.bookId)) {
          brudd.push(`persons#${rad.id} adresserer bok ${ref.bookId}, ref_books=${rad.ref_books}`);
        }
      }
    }
    expect(brudd.slice(0, 10)).toEqual([]);
  });

  test('de tre små: forfilteret godtar hver rad det eksakte predikatet beholder', async () => {
    const sql = getSql();
    const brudd: string[] = [];
    let målt = 0;

    const sjekk = (kilde: string, id: string, content: string, bøker: number[]) => {
      for (const bok of new Set(bøker)) {
        if (typeof bok !== 'number') continue;
        målt++;
        if (!bookMentionTest(bok)(content)) brudd.push(`${kilde} ${id} → bok ${bok}`);
      }
    };

    for (const r of (await sql`SELECT name, content FROM themes`) as { name: string; content: string }[]) {
      let d: { sections?: { verses?: { bookId?: number }[] }[] };
      try { d = JSON.parse(r.content); } catch { continue; }
      sjekk('themes', r.name, r.content, (d.sections ?? []).flatMap((s) => (s.verses ?? []).map((v) => v.bookId!)));
    }
    for (const r of (await sql`SELECT slug, content FROM stories`) as { slug: string; content: string }[]) {
      let d: { references?: { bookId?: number }[] };
      try { d = JSON.parse(r.content); } catch { continue; }
      sjekk('stories', r.slug, r.content, (d.references ?? []).map((x) => x.bookId!));
    }
    for (const r of (await sql`SELECT number, content FROM number_symbolism`) as { number: number; content: string }[]) {
      let d: { references?: { bookId?: number }[] };
      try { d = JSON.parse(r.content); } catch { continue; }
      sjekk('number_symbolism', String(r.number), r.content, (d.references ?? []).map((x) => x.bookId!));
    }

    // Uten adresser å måle ville halvdelen bestått av seg selv.
    expect(målt).toBeGreaterThan(100);
    expect(brudd.slice(0, 10)).toEqual([]);
  });
});

describe('SVARET — getterne gir ordrett det de ga før', () => {
  /** Veien getteren gikk FØR #110: hele tabellen inn, hver rad parset. */
  async function gammelVei(bookId: number, chapter: number, lang: string): Promise<string[]> {
    const sql = getSql();
    for (const language of contentLanguageChain(lang)) {
      const rows = (await sql.unsafe(PERSONER_I_SPRAAK, [language])) as unknown as { content: string }[];
      if (rows.length === 0) continue;
      return rows
        .map((r) => parsePersonContent(r.content))
        .filter(
          (p) =>
            p !== null && !!p.references?.some((r) => r.bookId === bookId && r.chapterId === chapter),
        )
        .map((p) => p!.id)
        .sort();
    }
    return [];
  }

  test('adressene velges av DATAENE, og de to veiene er enige', async () => {
    // Som i #70, #80 og #84: kapitlene som faktisk HAR personer leses ut av
    // basen. En håndplukket `/1mos/1` ville målt et kapittel uten personer,
    // altså ingenting — og en ny innholdsrunde flytter målingen selv.
    const rader = (await getSql().unsafe(PERSONER_I_SPRAAK, ['nb'])) as unknown as { content: string }[];
    const adresser = new Map<string, [number, number]>();
    for (const r of rader) {
      for (const ref of parsePersonContent(r.content)?.references ?? []) {
        if (typeof ref.bookId === 'number' && typeof ref.chapterId === 'number') {
          adresser.set(`${ref.bookId}-${ref.chapterId}`, [ref.bookId, ref.chapterId]);
        }
      }
      if (adresser.size >= 12) break;
    }
    // Uten adresser å måle ville halvdelen bestått av seg selv.
    expect(adresser.size).toBeGreaterThan(4);

    // Og ett kapittel UTEN personer, så «returner alt» ikke består.
    const valgte: [number, number][] = [...adresser.values(), [66, 22]];
    let medTreff = 0;
    for (const [bok, kap] of valgte) {
      for (const lang of ['nb', 'en']) {
        const ny = (await getPersonsByChapter(bok, kap, lang)).map((p) => p.id).sort();
        expect(ny, `${lang} bok ${bok} kap ${kap}`).toEqual(await gammelVei(bok, kap, lang));
        if (ny.length > 0) medTreff++;
      }
    }
    expect(medTreff, 'minst én adresse må gi treff, ellers måler sveipen ingenting').toBeGreaterThan(0);
  });

  test('de tre små getterne svarer fortsatt — forfilteret er ikke en mur', async () => {
    // «Filtrer bort alt» ville gjort hele fila utenom denne grønn, og
    // studieblokka tom på hver kapittelside.
    let treff = 0;
    for (const lang of ['nb', 'en']) {
      for (const bok of [1, 40, 42, 43, 45, 66]) {
        for (const kap of [1, 2, 3]) {
          treff += (await getThemesByChapter(bok, kap, lang)).length;
          treff += (await getStoriesByChapter(bok, kap, lang)).length;
          treff += (await getNumberSymbolismByChapter(bok, kap, lang)).length;
        }
      }
    }
    expect(treff).toBeGreaterThan(0);
  });

  test('en rad med NULL i kolonnen finnes fortsatt — fail-safe hele veien', async () => {
    const sql = getSql();
    const [rad] = (await sql`
      SELECT id, content FROM persons
      WHERE language = 'nb' AND ref_books IS NOT NULL AND ref_books <> ',' LIMIT 1
    `) as { id: number; content: string }[];
    expect(rad, 'ingen synket rad å måle på').toBeDefined();
    const person = parsePersonContent(rad!.content)!;
    const ref = person.references!.find((r) => typeof r.bookId === 'number' && typeof r.chapterId === 'number')!;

    const før = (await sql.unsafe(REF_BOOKS_FOR_ID, [rad!.id])) as unknown as { v: string }[];
    try {
      await sql.unsafe(SETT_REF_BOOKS_FOR_ID, [null, rad!.id]);
      const funnet = await getPersonsByChapter(ref.bookId, ref.chapterId, 'nb');
      expect(funnet.map((p) => p.id)).toContain(person.id);
    } finally {
      await sql.unsafe(SETT_REF_BOOKS_FOR_ID, [før[0]!.v, rad!.id]);
    }
  });
});

describe('SPRÅKVALGET — raden blir med, det er blobben som holdes tilbake (#26)', () => {
  test('spørringen gir én rad per person i språket, uansett bok', async () => {
    // Den STILLE fella i denne fiksen. `inLanguage()` velger språk på ANTALL
    // rader, ikke på om kapittelet har noe — så et `WHERE ref_books LIKE …`
    // ville gitt null rader for et språk ingen av personene adresserer boka i,
    // og sendt en nb-side videre til de ENGELSKE personene. Utslaget er 200 og
    // ingen loggrad; bare denne halvdelen ser det. Mutasjonstestet ved å bytte
    // `IF(…)` mot `WHERE …`.
    const sql = getSql();
    const [antall] = (await sql.unsafe(TELL_PERSONER, ['nb'])) as unknown as { n: number }[];
    expect(Number(antall!.n)).toBeGreaterThan(100);

    // Boka velges av DATAENE: den første ingen nb-person adresserer i det hele
    // tatt. En hardkodet bok ville sluttet å måle dette den dagen noen skrev en
    // person inn i den.
    let tom = 0;
    for (let bok = 1; bok <= 66 && tom === 0; bok++) {
      const kandidater = await personChapterCandidates(sql, 'nb', bok);
      if (kandidater.every((r) => r.content === null)) tom = bok;
    }
    expect(tom, 'ingen bok uten personer å måle på').toBeGreaterThan(0);

    const kandidater = await personChapterCandidates(sql, 'nb', tom);
    expect(kandidater.length).toBe(Number(antall!.n));
  });

  test('… og blobben holdes faktisk tilbake for dem som ikke kan treffe', async () => {
    // Motstykket: uten den ville «send content for alle» bestått halvdelen
    // over, og hele fiksen vært borte.
    const sql = getSql();
    const kandidater = await personChapterCandidates(sql, 'nb', 45);
    const med = kandidater.filter((r) => r.content !== null).length;
    expect(med).toBeGreaterThan(0);
    expect(med * 4).toBeLessThan(kandidater.length);
  });
});

describe('FORMEN — hver getter som sveiper en hel blobb-tabell narrer først', () => {
  test('de fire getterne parser ikke en rad de ikke har forfiltrert', () => {
    // MINNET-halvdelen under måler `persons`, som er 36 av de 43 MB-ene. De
    // tre små er 3–4 MB hver og ville ikke gitt et forhold som holder i en
    // vakt — men en fjernet linje er like usynlig der. Halvdelen er derfor
    // formulert på REGELEN: en getter som henter HELE tabellen for språket
    // (ingen bok/kapittel i WHERE) og deretter parser, må narre først.
    const kilde = readFileSync(resolve(ROT, 'src/lib/bible.ts'), 'utf8');
    const mangler: string[] = [];
    //
    // Kravet er at testen BRUKES, ikke bare bygges: å la
    // `const mentions = bookMentionTest(bookId)` stå mens `.filter()` fjernes
    // er nøyaktig den mutasjonen som ellers slipper gjennom, og den er like
    // usynlig i drift som alt annet i #110.
    const BRUKT = /bookMentionTest\([\s\S]*\.filter\(\s*\w+\s*=>\s*mentions\(/;
    const KRAV: Record<string, RegExp> = {
      getPersonsByChapter: /personChapterCandidates\(\s*sql,\s*language,\s*bookId/,
      getThemesByChapter: BRUKT,
      getStoriesByChapter: BRUKT,
      getNumberSymbolismByChapter: BRUKT,
    };
    for (const [navn, krav] of Object.entries(KRAV)) {
      const start = kilde.indexOf(`export async function ${navn}(`);
      expect(start, `${navn} finnes ikke lenger i bible.ts`).toBeGreaterThan(-1);
      const neste = kilde.indexOf('\nexport ', start + 1);
      const kropp = kilde.slice(start, neste === -1 ? undefined : neste);
      if (!krav.test(kropp)) mangler.push(`${navn} narrer ikke før den parser (#110)`);
    }
    expect(mangler).toEqual([]);
  });
});

describe('DEPLOYEN — kolonnen synkes der prod faktisk får den', () => {
  test('runMigrations kaller synken — ellers er fiksen usynlig i prod', () => {
    // Strukturell, som #92s DEPLOYEN-halvdel: `schema.ts` kan ikke importeres
    // og «kjøres» for å se dette, og en fiks som bare finnes i importen ville
    // aldri nådd en eksisterende base. Kolonnen legges dessuten til i
    // migreringen, ikke bare i DDL-en — `CREATE TABLE IF NOT EXISTS` treffer
    // bare nye baser.
    const kilde = readFileSync(resolve(ROT, 'src/lib/schema.ts'), 'utf8');
    expect(kilde).toContain('syncPersonRefBooks(sql)');
    expect(kilde).toMatch(/ALTER TABLE persons ADD COLUMN ref_books/);
    // Og importen, som er det ene stedet `content` faktisk endrer seg.
    const imp = readFileSync(resolve(ROT, 'scripts/import-bible.ts'), 'utf8');
    expect(imp).toContain('syncPersonRefBooks(sql)');
  });

  test('en rad som har drevet fra innholdet rettes, og synken er idempotent', async () => {
    const sql = getSql();
    const [rad] = (await sql`
      SELECT id, content FROM persons WHERE ref_books IS NOT NULL LIMIT 1
    `) as { id: number; content: string }[];
    expect(rad, 'ingen personrad å måle på').toBeDefined();
    const riktig = personRefBooks(rad!.content);

    await sql.unsafe(SETT_REF_BOOKS_FOR_ID, [',999,', rad!.id]);
    const første = await syncPersonRefBooks(sql);
    expect(første.oppdatert).toBeGreaterThan(0);
    const [etter] = (await sql.unsafe(REF_BOOKS_FOR_ID, [rad!.id])) as unknown as { v: string }[];
    expect(etter!.v).toBe(riktig);

    // Idempotent: en deploy uten innholdsendring skal ikke skrive én rad.
    expect((await syncPersonRefBooks(sql)).oppdatert).toBe(0);
  });

  test('ensureSchema() etterlater ingen rad som er uenig med sitt eget innhold', async () => {
    const sql = getSql();
    await sql`UPDATE persons SET ref_books = NULL WHERE id = (SELECT * FROM (SELECT MIN(id) FROM persons) x)`;
    await ensureSchema(sql);
    const uenige = (await sql`
      SELECT id FROM persons WHERE ref_books IS NULL LIMIT 5
    `) as { id: number }[];
    expect(uenige).toEqual([]);
  });
});

describe('MINNET — den nye veien koster en brøkdel av den gamle', () => {
  test('oppslaget vokser mindre enn halvparten av det gamle', async () => {
    // Eget program (#104, #105, #106), og BEGGE modusene i hver sin ferske
    // prosess: et absolutt MB-tall er en egenskap ved maskinen, mens FORHOLDET
    // er en egenskap ved koden. Målt lokalt: 67 MB gammel mot 21 MB ny.
    const kjør = async (modus: string) => {
      const p = Bun.spawn(['bun', Bun.fileURLToPath(new URL('blob-forfilter-probe.ts', import.meta.url)), modus], {
        // `new URL('..').pathname` er PROSENTKODET, og arbeidstrærne bor under
        // `trær/` — cwd blir da `tr%C3%A6r`, som ikke finnes, og Bun melder
        // ENOENT på «bun». `fileURLToPath` er fiksen.
        cwd: ROT,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const ut = await new Response(p.stdout).text();
      if ((await p.exited) !== 0) throw new Error(`${modus}: ${await new Response(p.stderr).text()}`);
      return JSON.parse(ut.trim().split('\n').at(-1)!) as {
        vekst: number;
        treff: number;
      };
    };

    const [gammel, ny] = await Promise.all([kjør('gammel'), kjør('ny')]);

    // Begge veiene må finne DE SAMME personene — ellers måler vi et raskere
    // svar på et annet spørsmål.
    expect(ny.treff, 'probet må faktisk finne personer').toBeGreaterThan(0);
    expect(ny.treff).toBe(gammel.treff);

    expect(
      ny.vekst * 2,
      `ny ${(ny.vekst / 1e6).toFixed(1)} MB mot gammel ${(gammel.vekst / 1e6).toFixed(1)} MB`,
    ).toBeLessThan(gammel.vekst);
  }, 180_000);
});
