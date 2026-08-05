// PERSONADRESSE-INTEGRITET — importert innhold får ikke peke på en person som
// ikke finnes (#61).
//
// Bakgrunnen er API-ets eget svar: `/api/persons/gomer` svarte 200 med
// `children: ["jisreel-hoseas-sønn", …]`, og `/api/persons/jisreel-hoseas-sønn`
// svarte 404. Sju av sju API-404-er i loggvinduet hadde vår egen side som
// referer — det var ikke boter som gjettet slugger, det var datagrafen vår.
//
// På .com var utslaget et annet, og verre for leseren: ættetavlen på `/nb/matt/1`
// lenket «Tamar» til `/personer/tamar`, som er 404. Personen finnes — hun heter
// `tamar-juda`.
//
// Vakta har TRE halvdeler, og de fanger hver sin ting:
//
//   1. DATA    — ingen rad i noen innholdstabell peker på en person som ikke
//                finnes. Sveiper alle 4058 personradene og alt annet innhold,
//                altså uendelig mye mer enn sidene i `PAGES` kan nå.
//   2. FORM    — hver innholdstabell med en JSON-blob er sveipet eller unntatt
//                med grunn, OG hver JSON-nøkkel som bærer personadresser er
//                deklarert. Uten den vokser dataene fra vakta i stillhet.
//   3. SIDA    — det målte tilfellet: den rendrede `/matt/1` lenker ikke til en
//                person som ikke finnes. Det er den leseren faktisk klikker på.

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { getSql } from '../src/lib/db.ts';
import {
  CONTENT_SOURCES,
  EXEMPT_KEYS,
  PERSON_REF_KEYS,
  UNSCANNED_TABLES,
  findDanglingPersonRefs,
  personResolverFrom,
  stripDanglingPersonRefs,
} from '../src/lib/person-refs.ts';
import { TABLES } from '../src/lib/schema.ts';
import { initBooks } from '../src/lib/bible.ts';
import { createApp } from '../src/app.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Poolen hentes PER KALL, aldri på modulnivå — `closeSql()` i en annen testfil
// nuller den ut, og en referanse tatt ved import ville da vært død her.
const db = () => getSql();

let hasPersons = false;
beforeAll(async () => {
  // Bokcachen må stå før en side kan rendres — uten den svarer hver rute 500,
  // og «lenka er død» ville vært umulig å skille fra «sida er ødelagt».
  await initBooks();
  const [row] = (await db()`SELECT COUNT(*) AS n FROM persons`) as { n: number }[];
  hasPersons = Number(row?.n ?? 0) > 0;
});

describe('personadresser i importert innhold', () => {
  test('basen har personer å måle mot', () => {
    expect(hasPersons, 'kjør `bun scripts/import-bible.ts` først — uten personer kan ingenting valideres').toBe(true);
  });

  test('ingen importert rad peker på en person som ikke finnes', async () => {
    const findings = await findDanglingPersonRefs(db());
    const report = findings
      .map((f) => `${f.table}.${f.key} → «${f.id}» (${f.hits} forekomst(er), ${f.languages.join(', ')})`)
      .join('\n');
    expect(report, `døde personadresser — kjør \`bun scripts/init-db.ts\` for å rydde:\n${report}`).toBe('');
  });
});

describe('regelen: lenka faller, navnet blir', () => {
  // Ren logikk, ingen DB. Halvparten av verdien i fiksen ligger her: at
  // ryddingen fjerner ADRESSEN og ikke raden. Blir dette til «slett noden», er
  // «Tamar» borte fra ættetavlen, og da har vi byttet en død lenke mot tapt
  // innhold.
  // Resolveren gir den kanoniske id-en eller `null` — ikke ja/nei. Her finnes
  // ingenting å rette til, så alt som ikke er «finnes» er dødt.
  const known = (id: string) => (id === 'finnes' ? id : null);
  const strip = (content: unknown) => stripDanglingPersonRefs(content, known, () => {});

  test('en død skalar nulles, navnet står igjen', () => {
    expect(strip({ name: 'Tamar', personId: 'borte', note: 'med Juda' })).toEqual({
      name: 'Tamar',
      personId: null,
      note: 'med Juda',
    });
  });

  test('en død id i en liste filtreres bort, de levende blir', () => {
    expect(strip({ family: { children: ['finnes', 'borte', 'finnes'] } })).toEqual({
      family: { children: ['finnes', 'finnes'] },
    });
  });

  test('en levende adresse røres ikke, uansett dybde', () => {
    const insight = { sections: [{ persons: [{ name: 'Abraham', personId: 'finnes' }] }] };
    expect(strip(insight)).toBe(null);
  });

  test('en streng under en NAVNELIK nøkkel er ikke en adresse', () => {
    // `roles: ['borte']` er ikke en personadresse selv om verdien ikke slår
    // opp. Bare nøklene i PERSON_REF_KEYS er adresser.
    expect(strip({ roles: ['borte'], title: 'borte' })).toBe(null);
  });

  test('ryddingen er idempotent', () => {
    const once = strip({ family: { father: 'borte', children: ['borte'] } });
    expect(once).toEqual({ family: { father: null, children: [] } });
    expect(strip(once)).toBe(null);
  });
});

// REGELEN FØR REGELEN: EN ADRESSE SOM KAN RETTES, RETTES (#61)
// -------------------------------------------------------------
// «Lenka faller, navnet blir» er riktig for en adresse vi ikke HAR. Men i
// målingen på .no var 16 av 90 døde peker-id-er slike vi har — personen ligger
// der under en NORMALISERT id: `jisreel-hoseas-sønn` mot rada `jisreel-hoseas-sonn`,
// `na'ama` mot `naama`. Da er sletting feil svar: den kaster en ekte
// familierelasjon for å bli kvitt en adresse vi kunne rettet, og det er
// nøyaktig det CLAUDE.md forbyr — «kast aldri innhold vi HAR for å bli kvitt en
// adresse vi ikke har».
//
// Verre: ryddingen kjører ved HVER deploy, og vakta over blir grønn AV
// slettingen. Feilen ville altså vært usynlig i begge ender.
//
// Rettingen gjetter ikke. Den bruker samme translitterering free-bible sin
// rettede `nameToId` bruker (ø→o, æ→ae, å→a), og godtar bare et EKSAKT treff.
// `josef` normaliserer til seg selv og finnes ikke — den blir stående som død
// og slettes, slik den skal. Vi har elleve `josef-*`, og å velge en av dem
// ville vært gjettingen #46 og #61 begge sier nei til.
describe('regelen før regelen: en adresse som kan rettes, rettes', () => {
  // Basen «har» bare de normaliserte formene — som i virkeligheten.
  const rows = [
    { name: 'jisreel-hoseas-sonn', language: 'nb' },
    { name: 'ananias-oversteprest', language: 'nb' },
    { name: 'josef-gt', language: 'nb' },
    { name: 'finnes', language: 'nb' },
  ];
  const resolve = personResolverFrom(rows);
  const strip = (content: unknown) => stripDanglingPersonRefs(content, (id) => resolve(id, 'nb'), () => {});

  test('resolveren gir den KANONISKE id-en, ikke bare ja/nei', () => {
    expect(resolve('jisreel-hoseas-sonn', 'nb')).toBe('jisreel-hoseas-sonn');
    expect(resolve('jisreel-hoseas-sønn', 'nb')).toBe('jisreel-hoseas-sonn');
    expect(resolve('josef', 'nb')).toBe(null);
  });

  test('en ø-id i en liste RETTES framfor å forsvinne', () => {
    expect(strip({ family: { children: ['jisreel-hoseas-sønn', 'finnes'] } })).toEqual({
      family: { children: ['jisreel-hoseas-sonn', 'finnes'] },
    });
  });

  test('en ø-id i en skalar rettes framfor å nulles', () => {
    expect(strip({ family: { father: 'ananias-øversteprest' } })).toEqual({
      family: { father: 'ananias-oversteprest' },
    });
  });

  test('en id som IKKE kan rettes, slettes fortsatt — den gjetter aldri', () => {
    // `josef` normaliserer til seg selv. Elleve `josef-*` finnes; ingen velges.
    expect(strip({ family: { children: ['josef', 'finnes'], father: 'josef' } })).toEqual({
      family: { children: ['finnes'], father: null },
    });
  });

  test('rettingen er idempotent — andre kjøring endrer ingenting', () => {
    const once = strip({ family: { children: ['jisreel-hoseas-sønn'] } });
    expect(once).toEqual({ family: { children: ['jisreel-hoseas-sonn'] } });
    expect(strip(once)).toBe(null);
  });

  test('en rettet adresse rapporteres som RETTET, ikke som fjernet', () => {
    // En import som sier «fjernet 16 lenker» der den rettet dem, beskriver en
    // annen hendelse enn den som skjedde.
    const seen: { id: string; replacement: string | null }[] = [];
    stripDanglingPersonRefs(
      { family: { children: ['jisreel-hoseas-sønn', 'josef'] } },
      (id) => resolve(id, 'nb'),
      (_key, id, replacement) => seen.push({ id, replacement }),
    );
    expect(seen).toEqual([
      { id: 'jisreel-hoseas-sønn', replacement: 'jisreel-hoseas-sonn' },
      { id: 'josef', replacement: null },
    ]);
  });
});

describe('API-et annonserer ikke en id det selv 404-er', () => {
  // Issuets egen måling, ende-til-ende. DATA-halvdelen over sveiper hele basen;
  // denne holder på at det faktisk er DETTE svaret leseren får — familien
  // serveres rå fra `content`, så en id i svaret er en adresse noen vil hente.
  test('hver id i /api/persons/gomer sitt eget svar svarer 200', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/api/persons/gomer');
    expect(res.status).toBe(200);
    const person = (await res.json()) as {
      family?: Record<string, string | string[] | null>;
      relatedPersons?: string[];
    };

    const ids = [
      ...Object.values(person.family ?? {}).flatMap((v) => (Array.isArray(v) ? v : v ? [v] : [])),
      ...(person.relatedPersons ?? []),
    ];
    expect(ids.length, 'gomer har familie i dataene — uten den måler testen ingenting').toBeGreaterThan(0);

    const dead: string[] = [];
    for (const id of ids) {
      const r = await app.request(`http://localhost/api/persons/${encodeURIComponent(id)}`);
      if (r.status !== 200) dead.push(`${id} → ${r.status}`);
    }
    expect(dead.join(', ')).toBe('');
  });
});

describe('kapittelsida lenker ikke til en person som ikke finnes', () => {
  // `/matt/1` er ættetavlen — den tettest personlenkede sida vi har, og der
  // `personId` faktisk rendres. Begge språkene: insight-radene ligger per språk,
  // så en død adresse kan finnes på det ene og ikke det andre.
  for (const path of ['/nb/matt/1', '/en/matt/1']) {
    test(`${path} har ingen død personlenke`, async () => {
      const app = createApp();
      const res = await app.request(`http://localhost${path}`);
      expect(res.status).toBe(200);
      const html = await res.text();

      const links = [...html.matchAll(/href="[^"]*\/personer\/([^"#?]+)"/g)].map((m) => decodeURIComponent(m[1]!));
      expect(links.length, `${path} skal ha personlenker å måle — ellers måler testen ingenting`).toBeGreaterThan(10);

      const dead: string[] = [];
      for (const id of [...new Set(links)]) {
        const r = await app.request(`http://localhost${path.slice(0, 3)}/personer/${encodeURIComponent(id)}`);
        if (r.status !== 200) dead.push(`${id} → ${r.status}`);
      }
      expect(dead.join(', ')).toBe('');
    });
  }
});

/**
 * Tabellene i skjemaet som bærer en JSON-blob — lest ut av DDL-en, ikke ført opp
 * for hånd. En ny innholdstabell med `content MEDIUMTEXT` dukker dermed opp her
 * av seg selv, og må sveipes eller unntas med en grunn.
 */
function jsonBlobTablesInSchema(): string[] {
  const found: string[] = [];
  for (const ddl of TABLES) {
    const name = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(ddl)?.[1];
    if (!name) continue;
    const columns = ddl
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\w+ (TEXT|MEDIUMTEXT|LONGTEXT|JSON)\b/i.test(l))
      .map((l) => l.split(/\s+/)[0]!);
    if (columns.some((c) => c === 'content' || c === 'data')) found.push(name);
  }
  return found;
}

describe('vakta dekker skjemaet', () => {
  test('DDL-lesningen finner faktisk noe', () => {
    // Uten denne ville en regex som slutter å matche gjort neste test grønn av
    // feil grunn: ingen funn, altså ingenting udekket.
    expect(jsonBlobTablesInSchema()).toContain('persons');
    expect(jsonBlobTablesInSchema()).toContain('chapter_insights');
    expect(jsonBlobTablesInSchema().length).toBeGreaterThan(5);
  });

  test('hver tabell med JSON-blob er sveipet eller unntatt med grunn', () => {
    const dekket = new Set([...CONTENT_SOURCES.map((s) => s.table), ...UNSCANNED_TABLES.map((t) => t.table)]);
    const udekket = jsonBlobTablesInSchema().filter((t) => !dekket.has(t));
    expect(
      udekket.join(', '),
      'ny tabell med en JSON-blob: legg den i CONTENT_SOURCES, eller i UNSCANNED_TABLES med en begrunnelse',
    ).toBe('');
  });

  test('hver sveipet tabell har (id, language) å skrive tilbake på', () => {
    // Ryddingen skriver `WHERE id = ? AND language = ?`. En tabell uten de to
    // kolonnene ville fått oppdateringen til å treffe ingenting — i stillhet.
    const mangler: string[] = [];
    for (const source of CONTENT_SOURCES) {
      const ddl = TABLES.find((t) => new RegExp(`CREATE TABLE IF NOT EXISTS ${source.table}\\b`).test(t));
      if (!ddl) {
        mangler.push(`${source.table}: finnes ikke i skjemaet`);
        continue;
      }
      const columns = ddl
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0]!)
        .filter(Boolean);
      for (const needed of ['id', 'language', source.column]) {
        if (!columns.includes(needed)) mangler.push(`${source.table}: mangler ${needed}`);
      }
    }
    expect(mangler.join(', ')).toBe('');
  });
});

describe('vakta dekker adressenøklene', () => {
  // Nøklene deklareres i `PERSON_REF_KEYS`, men lista skal ikke kunne bli
  // stale i stillhet. Denne halvdelen leter etter nøkler vi IKKE har deklarert
  // som likevel bærer person-id-er: slår nesten alle verdiene under en nøkkel
  // opp i `persons`, er nøkkelen en adresse, og den må enten sveipes eller
  // unntas med en grunn.
  //
  // Terskelen skiller med god margin: de ekte adressenøklene ligger på 100 %,
  // mens den tetteste tilfeldigheten (`keywords`) ligger på ~10 %.
  const ANDEL = 0.9;
  const MINST = 5;

  let ratios: { key: string; resolved: number; total: number }[] = [];

  beforeAll(async () => {
    const rows = (await db()`SELECT name, language FROM persons`) as { name: string; language: string }[];
    if (rows.length === 0) return;
    const resolve = personResolverFrom(rows);

    const counts = new Map<string, { resolved: number; total: number }>();
    const walk = (node: unknown, key: string | null, language: string) => {
      if (Array.isArray(node)) return node.forEach((v) => walk(v, key, language));
      if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, k, language);
        return;
      }
      if (typeof node !== 'string' || node === '' || key === null) return;
      let entry = counts.get(key);
      if (!entry) counts.set(key, (entry = { resolved: 0, total: 0 }));
      entry.total++;
      if (resolve(node, language)) entry.resolved++;
    };

    for (const source of CONTENT_SOURCES) {
      const contentRows = (await db().unsafe(
        `SELECT ${source.column} AS content, language FROM ${source.table}`,
      )) as { content: string; language: string }[];
      for (const row of contentRows) {
        try {
          walk(JSON.parse(row.content), null, row.language);
        } catch {
          /* ugyldig blob er ikke denne vaktas sak */
        }
      }
    }
    ratios = [...counts.entries()].map(([key, c]) => ({ key, ...c }));
  });

  test('sveipen finner de deklarerte nøklene i dataene', () => {
    // Uten denne kunne en walk som traff feil gjort neste test grønn av
    // ingenting. `personId` er nøkkelen saken faktisk handler om.
    const funnet = new Set(ratios.filter((r) => r.resolved >= MINST).map((r) => r.key));
    for (const key of ['personId', 'father', 'children', 'relatedPersons']) {
      expect(funnet, `${key} skal finnes i dataene`).toContain(key);
    }
  });

  test('ingen udeklarert nøkkel bærer personadresser', () => {
    const dekket = new Set<string>([...PERSON_REF_KEYS, ...EXEMPT_KEYS.map((e) => e.key)]);
    const mistenkte = ratios
      .filter((r) => !dekket.has(r.key) && r.resolved >= MINST && r.resolved / r.total >= ANDEL)
      .map((r) => `${r.key} (${r.resolved}/${r.total})`);
    expect(
      mistenkte.join(', '),
      'nøkkel med person-id-er som ikke sveipes: legg den i PERSON_REF_KEYS, eller i EXEMPT_KEYS med en begrunnelse',
    ).toBe('');
  });
});
