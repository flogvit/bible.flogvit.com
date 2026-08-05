// Lesetekst-URL-ene er STABILE (GitHub #40).
//
// De var `/lesetekster/<auto_increment-id>`, og importen sletter og setter inn
// `reading_texts` på nytt. MySQL fortsetter tellingen der den slapp, så hver
// innholdsimport flyttet hele settet: bokmerker, delte lenker og indekserte
// adresser døde i takt med innholdsoppdateringene. Loggen viste 103 distinkte
// døde ID-er på én time, i et sammenhengende område fra en tidligere generasjon.
//
// Testen kjører på /nb: lesetekster er DNK-innhold og finnes bare på norsk, så
// dagsiden 404-er med rette på de andre språkene (contentLanguageChain, #26).
// Krever lokal DB (DBngin :3312) med importert innhold.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql } from '../src/lib/db.ts';
import { href } from '../src/lib/i18n.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const NB = (path: string) => href('nb', path);

const sql = getSql();
const rows = (await sql`
  SELECT id, date, name FROM reading_texts WHERE language = 'nb' ORDER BY date
`) as { id: number; date: string; name: string }[];

describe('lesetekster: dato i URL-en, ikke auto_increment-id', () => {
  test('det finnes lesetekster å teste mot', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  test('dagsiden svarer 200 og navngir dagens tekster', async () => {
    const row = rows[0]!;
    const res = await app.request(NB(`/lesetekster/${row.date}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(row.name);
  });

  test('en dato uten lesetekst gir 404, ikke en tom side', async () => {
    // 1. januar 1900 kommer aldri til å stå i tekstrekken.
    expect((await app.request(NB('/lesetekster/1900-01-01'))).status).toBe(404);
  });

  test('gammel ID-adresse 301-er til den stabile URL-en', async () => {
    const row = rows[0]!;
    const res = await app.request(NB(`/lesetekster/${row.id}`));
    expect({ status: res.status, location: res.headers.get('location') }).toEqual({
      status: 301,
      location: NB(`/lesetekster/${row.date}`),
    });
  });

  test('en ID som ikke finnes gir 404 framfor en gjettet lesedag', async () => {
    const maxId = Math.max(...rows.map((r) => r.id));
    expect((await app.request(NB(`/lesetekster/${maxId + 100000}`))).status).toBe(404);
  });

  // Vakta som ville fanget en tilbakerulling: ingen lenke til en lesetekst skal
  // bære en id. `/lesetekster/1017` ser gyldig ut (den 301-er), så en test på
  // «svarer siden?» ville bestått med den ustabile adressen i lenkene.
  test('ingen side lenker til /lesetekster/<id>', async () => {
    const idRe = /href="[^"]*\/lesetekster\/\d+"/g;
    for (const path of ['/', '/lesetekster', '/1mos/1', '/matt/1']) {
      const html = await (await app.request(NB(path))).text();
      expect({ path, idLenker: html.match(idRe) ?? [] }).toEqual({ path, idLenker: [] });
    }
  });

  // Den rendrede HTML-en er ikke nok: forsidens lesetekst-kort vises bare når
  // DAGEN har en lesetekst, så en id-lenke der ville sluppet gjennom sveipen
  // over på 364 av 365 dager. Derfor en KILDE-sjekk i tillegg — begge trengs,
  // fordi en sti som bygges i en variabel er usynlig for tekstsøk (#18).
  test('ingen lenkebygger setter noe annet enn datoen i URL-en', async () => {
    const funn: string[] = [];
    for (const file of new Bun.Glob('**/*.{ts,tsx}').scanSync('src')) {
      const src = await Bun.file(`src/${file}`).text();
      for (const m of src.matchAll(/\/lesetekster\/\$\{([^}]+)\}/g)) {
        if (!/(^|\.)date$/.test(m[1]!.trim())) funn.push(`src/${file}: ${m[0]}`);
      }
    }
    expect(funn).toEqual([]);
  });

  test('flere lesetekster samme dag deler én side, med hver sin overskrift', async () => {
    const byDate = new Map<string, string[]>();
    for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.name]);
    const [date, names] = [...byDate].find(([, n]) => n.length > 1) ?? [];
    if (!date || !names) return; // ingen delte dager i datasettet — ingenting å vokte
    const html = await (await app.request(NB(`/lesetekster/${date}`))).text();
    for (const name of names) expect(html).toContain(name);
  });
});

describe('naturlig nøkkel: ingen dupliserte lesedager (#40)', () => {
  // Kildefilene dekker KIRKEÅR og overlapper med kalenderåret, så 18 lesedager
  // lå to ganger i basen og ble vist som doble kort. `uq_reading_texts` gjør
  // det umulig; testen fanger en base som ikke har vært gjennom migreringen.
  test('(dato, navn, serie, språk) er unik', async () => {
    const dupes = (await sql`
      SELECT date, name, series, language, COUNT(*) AS n
      FROM reading_texts GROUP BY date, name, series, language HAVING n > 1
    `) as { date: string; name: string }[];
    expect(dupes.map((d) => `${d.date} ${d.name}`)).toEqual([]);
  });

  test('nøkkelen finnes i skjemaet', async () => {
    const cols = (await sql`
      SELECT column_name AS col FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = 'reading_texts'
        AND index_name = 'uq_reading_texts'
      ORDER BY seq_in_index
    `) as { col: string }[];
    expect(cols.map((c) => c.col.toLowerCase())).toEqual(['date', 'name', 'series', 'language']);
  });

  test('ingen foreldreløse referanser etter dedupliseringen', async () => {
    const [row] = (await sql`
      SELECT COUNT(*) AS n FROM reading_text_refs r
      LEFT JOIN reading_texts t ON r.reading_text_id = t.id WHERE t.id IS NULL
    `) as { n: number | bigint }[];
    expect(Number(row!.n)).toBe(0);
  });
});
