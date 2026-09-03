// Ingen pakke skal stå i `bun.lock` uten at noe i VÅRT eget tre ber om den (#112).
//
// `bun audit` meldte to kjente råd — nanoid og postcss — mot pakker ingen del
// av bibel importerer. Kjeden var
//
//   @free-bible/kvn (devDependencies) -> vitest -> vite -> postcss -> nanoid
//
// altså free-bibles EGET testverktøy, låst og revidert som om det var vårt.
// #62 slo fast at kvn-package/ er en VENDRET kopi og at hvitlista eier hva som
// ligger i den — men `package.json` er én av filene på hvitlista, og INNI den
// står et felt som drar 108 pakker til inn i låsen. En hvitliste over filer som
// lar en vilkårlig avhengighetsliste ri med inne i én av dem, er halv.
//
// Utslaget er stille, som #45, #65 og #69: alt svarer 200, alle tester er
// grønne, og ingen loggrad skrives. Det eneste som ser det er en revisjon —
// og den ser bare på VERSJONER, ikke på om pakka har noe her å gjøre. Derfor
// er vakta formulert på TILHØRIGHETEN og ikke på nanoid og postcss: neste råd
// kommer mot esbuild eller rollup, som lå i den samme kjeden.
//
// Regelen er installasjonens egen: en devDependency får man av ROT-prosjektet
// sitt, aldri av en avhengighet. Bun avviker fra det for `file:`-avhengigheter,
// og det avviket er hele saken.

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { BIBEL_DIR, STRIPPED_FIELDS, TARGET, stagedPackageJson } from '../scripts/kvn-staging.ts';
import { parseLockfile, unreachablePackages } from '../scripts/laaste-avhengigheter.ts';

const LOCK = path.join(BIBEL_DIR, 'bun.lock');
const lock = parseLockfile(fs.readFileSync(LOCK, 'utf-8'));

describe('REGELEN: en avhengighets testverktøy er ikke vårt å låse', () => {
  test('devDependencies følges fra ROTA, aldri fra en avhengighet', () => {
    const lås = parseLockfile(
      JSON.stringify({
        workspaces: { '': { dependencies: { vendret: 'file:vendret' }, devDependencies: { egen: '^1' } } },
        packages: {
          vendret: ['vendret@file:vendret', { devDependencies: { testverktøy: '^3' } }],
          // Kjeden fra #112, i miniatyr: testverktøyet drar en sårbar pakke med seg.
          testverktøy: ['testverktøy@3.0.0', '', { dependencies: { sårbar: '^1' } }, 'sha512-x'],
          sårbar: ['sårbar@1.0.0', '', {}, 'sha512-y'],
          egen: ['egen@1.0.0', '', {}, 'sha512-z'],
        },
      }),
    );
    // `egen` er rotas egen devDependency og skal BLI STÅENDE — ellers ville
    // «følg aldri devDependencies» gjort hele suitens verktøy hjemløst.
    expect(unreachablePackages(lås)).toEqual(['sårbar', 'testverktøy']);
  });

  test('kjøretidskanter følges, også gjennom den vendrede pakka', () => {
    const lås = parseLockfile(
      JSON.stringify({
        workspaces: { '': { dependencies: { vendret: 'file:vendret' } } },
        packages: {
          vendret: ['vendret@file:vendret', { dependencies: { kjøretid: '^1' } }],
          kjøretid: ['kjøretid@1.0.0', '', { dependencies: { dypere: '^1' } }, 'sha512-x'],
          dypere: ['dypere@1.0.0', '', {}, 'sha512-y'],
        },
      }),
    );
    // Uten dette ville «alt som ikke er en direkte avhengighet er ulovlig»
    // bestått halvdelen over, og gjort låsen umulig å ha.
    expect(unreachablePackages(lås)).toEqual([]);
  });

  test('en valgfri peer drar ingenting inn, en ekte peer gjør', () => {
    const lås = parseLockfile(
      JSON.stringify({
        workspaces: { '': { dependencies: { a: '^1' } } },
        packages: {
          a: ['a@1.0.0', '', { peerDependencies: { ekte: '^1', valgfri: '^1' }, optionalPeers: ['valgfri'] }, 'sha512-x'],
          ekte: ['ekte@1.0.0', '', {}, 'sha512-y'],
          valgfri: ['valgfri@1.0.0', '', {}, 'sha512-z'],
        },
      }),
    );
    expect(unreachablePackages(lås)).toEqual(['valgfri']);
  });

  test('avhengighetsobjektet finnes på FORM, ikke på indeks', () => {
    // En `file:`-oppføring er en 2-tuppel, en registry-oppføring en 4-tuppel.
    // Leses objektet på fast indeks, blir den ene lest som «ingen kanter» —
    // altså grønt av blindhet.
    const lås = parseLockfile(
      JSON.stringify({
        workspaces: { '': { dependencies: { vendret: 'file:vendret' } } },
        packages: {
          vendret: ['vendret@file:vendret', { dependencies: { barn: '^1' } }],
          barn: ['barn@1.0.0', '', {}, 'sha512-x'],
        },
      }),
    );
    expect(lås.packages.vendret?.dependencies).toEqual({ barn: '^1' });
    expect(unreachablePackages(lås)).toEqual([]);
  });
});

describe('PAKKA: den vendrede kopien deklarerer ikke free-bibles verktøy', () => {
  test('stagingen fjerner feltene, og lar resten stå', () => {
    const kilde = JSON.stringify(
      {
        name: '@free-bible/kvn',
        type: 'module',
        exports: { '.': './src/ukvn.ts' },
        dependencies: { ekte: '^1' },
        devDependencies: { vitest: '^3.0.0', typescript: '^5.7.0' },
      },
      null,
      2,
    );
    const ut = JSON.parse(stagedPackageJson(kilde));
    expect(ut.devDependencies).toBeUndefined();
    // KJØRETIDSFLATA er hele grunnen til at pakka er her (#62). Faller
    // `exports` bort, importerer ingenting fra @free-bible/kvn lenger — og en
    // ekte `dependencies` er noe vi FAKTISK trenger, i motsetning til
    // testverktøyet.
    expect(ut.exports).toEqual({ '.': './src/ukvn.ts' });
    expect(ut.name).toBe('@free-bible/kvn');
    expect(ut.dependencies).toEqual({ ekte: '^1' });
  });

  test('kvn-package/package.json på disk bærer ingen av dem', () => {
    const staged = JSON.parse(fs.readFileSync(path.join(TARGET, 'package.json'), 'utf-8'));
    const igjen = STRIPPED_FIELDS.filter((f) => staged[f] !== undefined);
    expect(igjen.join(', ') || 'ingen').toBe('ingen');
    // Ellers ville «tøm hele fila» bestått linja over.
    expect(staged.exports).toBeTruthy();
  });
});

describe('LÅSEN: alt som er låst, er noe vi ber om', () => {
  test('ingen pakke i bun.lock er uten en grunn i vårt eget tre', () => {
    const ekstra = unreachablePackages(lock);
    expect(
      ekstra.length
        ? `${ekstra.length} pakke(r) er låst uten at noe i bibel ber om dem: ` +
            `${ekstra.slice(0, 8).join(', ')}${ekstra.length > 8 ? ', …' : ''}` +
            ' — kjør «bun run oppsett» etter å ha slettet bun.lock'
        : 'ingen',
    ).toBe('ingen');
  });

  test('den vendrede pakka drar ingen devDependencies inn i låsen', () => {
    const vendret = lock.packages['@free-bible/kvn'];
    expect(vendret ? 'låst' : 'mangler i bun.lock').toBe('låst');
    expect(Object.keys(vendret?.devDependencies ?? {}).join(', ') || 'ingen').toBe('ingen');
  });
});

describe('INGEN STILLE SKIP', () => {
  // Uten disse ville sveipene over bestått på en tom eller uleselig lås, og
  // vakta vært en påstand ingen har målt.
  test('låsen har pakker, og rota har noe å starte fra', () => {
    expect(Object.keys(lock.packages).length).toBeGreaterThan(0);
    expect(Object.keys(lock.workspaces['']?.dependencies ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(lock.workspaces['']?.devDependencies ?? {}).length).toBeGreaterThan(0);
  });

  test('det finnes felter å fjerne, og en vendret pakke å fjerne dem fra', () => {
    expect(STRIPPED_FIELDS.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(TARGET, 'package.json'))).toBe(true);
  });
});
