// kvn-package/ skal inneholde KJØRETIDSFLATA og ingenting mer (#62).
//
// `@free-bible/kvn` er en vendret `file:`-avhengighet: katalogen er gitignort
// og fylles av `scripts/stage-kvn.ts`. Fram til nå sto oppskriften som en
// setning i CLAUDE.md — «stages fra ../free-bible/kvn/» — og en agent i et
// ferskt arbeidstre leste den som «kopier hele kvn-repoet».
//
// Konsekvensen var ikke synlig for noen som kjørte testene hjemme, for der er
// katalogen tom eller riktig staget:
//
//   bibel/       bun run test  ->     568 tester,  0 fail, 31 filer
//   arbeidstre/  bun run test  ->  360 859 tester, 36 fail, 48 filer
//
// 48 − 31 = 17 = antall filer i free-bible/kvn/tests/. `bun test` fra
// bibel-roten går inn i kvn-package/ og kjører dem, og de leser et RÅKORPUS
// (`kvn/../../generate/bibles_raw/osnb`) som bare finnes i free-bible. Her ga
// `getMaxVerse(1,1)` 0 i stedet for 31, og 36 tester ble røde uansett hva noen
// gjorde med bibel-koden.
//
// Det gjorde bibel umulig å merge for smia: hver sak ble bygget ferdig,
// forkastet med «RØDT», og gjort om igjen neste runde.
//
// Vakta er STRUKTURELL, ikke en liste over kataloger vi har sett før: den
// krever at inventaret er nøyaktig hvitlista i `scripts/kvn-staging.ts`. En ny
// katalog i free-bible/kvn blir dermed rød her uten at noen har tenkt på den.

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import {
  INSTALLED,
  STAGED,
  TARGET,
  foreignTestFiles,
  inventoryProblems,
} from '../scripts/kvn-staging.ts';

describe('kvn-package inneholder kjøretidsflata og ingenting mer', () => {
  test('inventaret er nøyaktig hvitlista', () => {
    expect(inventoryProblems().join('\n') || 'i orden').toBe('i orden');
  });

  test('hvitlista dekker det pakka faktisk trenger', () => {
    // Fanger at noen fjerner en oppføring fra STAGED uten å fjerne bruken.
    // `mappings/` er den som pleier å bli glemt: den er 109 MB og ser ut som
    // data man kan hoppe over, men verse-mapper.ts leser den ved kjøring.
    expect([...STAGED]).toEqual(['src', 'mappings', 'package.json', 'tsconfig.json']);
  });

  test('ingen fremmede testfiler ligger der bun test går inn', () => {
    const found = foreignTestFiles();
    expect(
      found.length
        ? `kvn-package/ har ${found.length} testfil(er) som ikke er bibels: ${found.slice(0, 5).join(', ')}` +
            ' — kjør «bun run oppsett»'
        : 'ingen',
    ).toBe('ingen');
  });
});

describe('den vendrede pakka er faktisk installert', () => {
  // `bun install` avslutter med 0 selv når den ikke fikk installert
  // `file:`-avhengigheten. Uten denne testen viser det seg som en
  // import-krasj i en helt annen testfil, og da leter man feil sted.
  test('node_modules/@free-bible/kvn finnes', () => {
    expect(fs.existsSync(INSTALLED) ? 'installert' : `mangler: ${INSTALLED} — kjør «bun run oppsett»`).toBe(
      'installert',
    );
  });

  test('den installerte kopien bærer heller ingen fremmede tester', () => {
    // node_modules ekskluderes av bun test, så dette er ikke en kilde til røde
    // tester — men det er kopien som havner i imaget, og 108 MB tester, data
    // og research har ingenting der å gjøre.
    const root = INSTALLED.replace(/\/package\.json$/, '');
    const extras = fs.existsSync(root)
      ? fs.readdirSync(root).filter((n) => !(STAGED as readonly string[]).includes(n) && !n.startsWith('.'))
      : [];
    expect(extras.join(', ') || 'ingen').toBe('ingen');
  });
});

describe('stagingen er reproduserbar', () => {
  test('stemplet forteller hvor pakka kom fra', () => {
    // Uten stempelet kan ingen svare på hvilken free-bible-klone kopien er tatt
    // fra — og en stale klone var nettopp det som ga «0 endringer» ved import.
    const stamp = `${TARGET}/.stage-stamp.json`;
    expect(fs.existsSync(stamp) ? 'finnes' : `mangler: ${stamp} — kjør «bun run oppsett»`).toBe('finnes');
    const parsed = JSON.parse(fs.readFileSync(stamp, 'utf-8'));
    expect(typeof parsed.source).toBe('string');
    expect(typeof parsed.fingerprint).toBe('string');
  });
});
