// ET REGNSKAP INGEN KAN LESE ER ET REGNSKAP INGEN KAN MOTSI.
//
// Setningen står allerede i `page-cache.ts` (#105), og `pageCacheStats()` ble
// eksportert nettopp for den. Så ble den aldri lest utenfor en test, og fire
// saker senere er svaret på «hva holder appen på?» fortsatt en hypotese:
//
//   #19   filene ble liggende — 93 MB heap, 409 MB RSS, oppdaget ved et drap
//   #105  budsjettet var i TEGN, altså dobbelt så høyt som tallet i koden
//   #106  «162 MB grunnlast» sto uundersøkt; 54 av dem var ÉN funksjon
//   #216  driftsrepoet skrev det rett ut: «hvor mye av dette har vi BEDT den
//         om å holde? — det kunne ikke besvares herfra i det hele tatt»
//
// `minne-regnskap.ts` er svaret, og denne fila er porten rundt det. Den har tre
// jobber, og bare den siste er den vanlige:
//
//   FULLSTENDIGHET  hver cache i `src/` er meldt inn eller begrunnet utelatt —
//                   strukturelt, så den NESTE fanges uten at noen fører den opp
//   LEVENDE         tallene FLYTTER SEG når cachen gjør det. Et regnskap som
//                   svarer 0 i all evighet består enhver formsjekk
//   FLATA           `/api/minne` gir dem faktisk ut
//
// Se bible.flogvit.com#110.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Hono } from 'hono';
import {
  clearPageCache,
  configurePageCache,
  resetPageCache,
  withPageCache,
} from '../src/lib/page-cache.ts';
import { minnekilder, minneRegnskap, registrerMinnekilde } from '../src/lib/minne-regnskap.ts';
import { createApp } from '../src/app.ts';
import { afterAll, setDefaultTimeout } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';

// `createApp()` når `src/lib/db.ts`, og da gjelder #74: Buns standard på 5000 ms
// er valgt for en test som svarer med en gang, ikke for en fil som kan komme
// til å røre skjemaet. Ryker en hook, forsvinner HELE fila i stillhet.
setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// Denne filen skrur på lastvernets knapper, og `bun test` deler prosess (#72).
afterAll(resetPageCache);

const ROT = resolve(import.meta.dir, '..');

/**
 * Modulnivå-`Map`/`Set` i `src/`, funnet i KILDEN.
 *
 * En cache er farlig nettopp når den står på modulnivå: da lever den så lenge
 * prosessen gjør, og den er usynlig for enhver måling som ikke kjenner navnet
 * dens. Sveipen leser derfor filene framfor å importere dem — en modul som
 * ikke er importert av noen test ville ellers ikke eksistert for vakta.
 */
function cacherIKilden(): { navn: string; sted: string }[] {
  const funn: { navn: string; sted: string }[] = [];
  const glob = new Bun.Glob('**/*.{ts,tsx}');
  for (const rel of [...glob.scanSync({ cwd: join(ROT, 'src') })].sort()) {
    const fil = join(ROT, 'src', rel);
    const linjer = readFileSync(fil, 'utf8').split('\n');
    linjer.forEach((l, i) => {
      const m = /^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*new\s+(?:Map|Set)\b/.exec(l);
      if (m) funn.push({ navn: m[1]!, sted: `${relative(ROT, fil)}:${i + 1}` });
    });
  }
  return funn;
}

/**
 * Cacher som IKKE meldes inn, med grunnen.
 *
 * Hver oppføring er en PÅSTAND om at samlingen ikke kan vokse med trafikk —
 * ikke et sted å gjemme en cache man ikke gadd å melde inn. Samme form som
 * `NORDIC_PROPER` og `UNCHECKED_TABLES`: den skal være kort, og hver linje
 * skal kunne motsies.
 */
const UTELATT: Record<string, string> = {
  'minne-regnskap/kilder': 'registeret selv — én oppføring per registrerMinnekilde() i kildekoden',
  'api-ids/BY_PATH': 'bygget av API_COLLECTIONS ved import, én oppføring per deklarert samling',
  'books-data/booksById': 'bygget av booksData ved import — 66 bøker',
  'books-data/booksBySlug': 'bygget av booksData ved import — 66 bøker',
  'person-refs/REF_KEYS': 'literal nøkkelliste, bygget ved import',
};

/** Navnene `registrerMinnekilde()` kalles med, lest ut av kildekoden. */
function meldtIKilden(): string[] {
  const navn: string[] = [];
  const glob = new Bun.Glob('**/*.{ts,tsx}');
  for (const rel of glob.scanSync({ cwd: join(ROT, 'src') })) {
    const tekst = readFileSync(join(ROT, 'src', rel), 'utf8');
    for (const m of tekst.matchAll(/registrerMinnekilde\(\s*'([^']+)'/g)) navn.push(m[1]!);
  }
  return navn;
}

describe('regnskapet er FULLSTENDIG — neste cache fanges uten at noen fører den opp', () => {
  test('kjøretidsregisteret er enig med kilden så langt det rekker', () => {
    // Kilden er fasit for FULLSTENDIGHET (over). Denne holder de to sammen:
    // hvert navn registeret faktisk har, skal finnes i kildekoden — ellers
    // melder noen seg inn et sted sveipen ikke leser, og da måler den ikke
    // det den tror. Motsatt vei kan den ikke kreve: en umportert modul har
    // ikke meldt seg ennå.
    const iKilden = new Set(meldtIKilden());
    expect(minnekilder().filter((n) => !n.startsWith('test/') && !iKilden.has(n))).toEqual([]);
  });

  test('sveipen finner noe i det hele tatt', () => {
    // Uten denne ville en feil i globben gjort hele fila grønn i stillhet:
    // «ingen cacher funnet» består enhver liste-sammenligning.
    expect(cacherIKilden().length).toBeGreaterThan(8);
  });

  test('HVER modulnivå-cache er meldt inn eller begrunnet utelatt', () => {
    // Navnene leses ut av KILDEN, ikke av `minnekilder()`.
    //
    // Registeret fylles ved import, så kjøretidslista er bare de modulene
    // NOE i denne testprosessen tilfeldigvis dro inn — `reading-ref.ts` er
    // ikke blant dem. Målt mot den ville vakta meldt en innmelding som
    // mangler, samtidig som den ville vært BLIND for en cache i en modul
    // ingen importerer, altså nøyaktig den som aldri blir sett.
    const meldt = new Set(meldtIKilden());
    const umeldt: string[] = [];
    for (const { navn, sted } of cacherIKilden()) {
      const fil = sted.split('/').pop()!.split(':')[0]!.replace(/\.tsx?$/, '');
      const nøkkel = `${fil}/${navn}`;
      if (meldt.has(nøkkel) || UTELATT[nøkkel] !== undefined) continue;
      umeldt.push(
        `${sted} — «${nøkkel}» er verken meldt inn med registrerMinnekilde() ` +
          'eller ført opp i UTELATT med en grunn',
      );
    }
    expect(umeldt).toEqual([]);
  });

  test('en UTELATT oppføring som ikke lenger finnes er rød', () => {
    // Ellers vokser lista med påstander om kode som er borte, og da sier den
    // ingenting om koden som ER der. Samme krav som `IKKE_MÅLT` i #45.
    const fins = new Set(
      cacherIKilden().map(({ navn, sted }) => {
        const fil = sted.split('/').pop()!.split(':')[0]!.replace(/\.tsx?$/, '');
        return `${fil}/${navn}`;
      }),
    );
    expect(Object.keys(UTELATT).filter((k) => !fins.has(k))).toEqual([]);
  });

  test('hver utelatelse har en GRUNN, ikke en tom streng', () => {
    expect(Object.entries(UTELATT).filter(([, g]) => g.trim().length < 20).map(([k]) => k)).toEqual([]);
  });
});

describe('tallene er LEVENDE — de flytter seg når cachen gjør det', () => {
  test('page-cachen melder det den faktisk holder, ikke et konstant tall', async () => {
    // DEN SOM LUKKER HULLET. De strukturelle testene over består like godt av
    // `() => ({ oppforinger: 0 })` på hver eneste kilde — altså et fullstendig
    // regnskap som alltid svarer null, som er nøyaktig den ubrukelige formen
    // saken handler om.
    resetPageCache();
    clearPageCache();
    configurePageCache({});

    const app = new Hono();
    app.use('*', withPageCache);
    let n = 0;
    app.get('/side/:id', (c) => c.html(`<html><body>${'x'.repeat(5000)} ${++n}</body></html>`));

    const les = () => minneRegnskap().kilder['page-cache/cache']!;
    const før = les();
    expect(før.oppforinger).toBe(0);
    expect(før.byte).toBe(0);

    for (let i = 0; i < 5; i++) await app.request(`/side/${i}`);

    const etter = les();
    expect(etter.oppforinger, 'antallet skal følge cachen').toBe(5);
    expect(etter.byte, 'byteregnskapet skal følge med').toBeGreaterThan(5 * 5000);

    // Og den skal falle igjen — ellers måler vi en teller, ikke en beholdning.
    clearPageCache();
    expect(les().oppforinger).toBe(0);
    resetPageCache();
  });

  test('regnskapet oppgir RSS, som er tallet cgruppa dreper på', () => {
    // De andre tallene er meningsløse uten det å lese dem mot (#106).
    expect(minneRegnskap().rss).toBeGreaterThan(1024 * 1024);
  });

  test('en kilde som KASTER melder -1 og river ikke resten', () => {
    // «Finnes, men svarte ikke» er noe annet enn 0, og noe annet enn å mangle.
    // Uten dette kan én ødelagt getter gjøre hele målingen utilgjengelig
    // nøyaktig når man trenger den.
    const navn = `test/kaster-${minnekilder().length}`;
    registrerMinnekilde(navn, () => {
      throw new Error('med vilje');
    });
    const r = minneRegnskap();
    expect(r.kilder[navn]).toEqual({ oppforinger: -1 });
    expect(r.kilder['page-cache/cache'], 'de andre skal fortsatt være der').toBeDefined();
  });

  test('to innmeldinger med samme navn er en FEIL, ikke en overskriving', () => {
    // Stille overskriving ville tatt en post ut av regnskapet uten å si fra,
    // og et regnskap som mangler en post er verre enn ingen.
    const navn = `test/duplikat-${minnekilder().length}`;
    registrerMinnekilde(navn, () => ({ oppforinger: 0 }));
    expect(() => registrerMinnekilde(navn, () => ({ oppforinger: 0 }))).toThrow(/to ganger/);
  });
});

describe('flata gir tallene ut', () => {
  test('/api/minne svarer med rss og hver innmeldt kilde', async () => {
    const res = await createApp().request('/api/minne');
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReturnType<typeof minneRegnskap>;
    expect(json.rss).toBeGreaterThan(0);
    // Hver kilde som er meldt inn skal STÅ i svaret — en rute som bare gir ut
    // noen av dem er den samme blindsonen, bare mindre.
    for (const navn of minnekilder()) expect(Object.keys(json.kilder)).toContain(navn);
  });

  test('/api/health er URØRT — den er en kontrakt røyktesten leser', async () => {
    const res = await createApp().request('/api/health');
    expect(await res.json()).toEqual({ ok: true });
  });
});
