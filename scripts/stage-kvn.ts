// Stager kvn-pakken fra free-bible inn i kvn-package/ — KJØRETIDSFLATA, og
// ingenting mer.
//
// `@free-bible/kvn` er en vendret `file:`-avhengighet. Katalogen er gitignort
// (mappings/ alene er 109 MB) og må derfor fylles før `bun install`. Fram til
// nå sto det som en SETNING i CLAUDE.md — «stages fra ../free-bible/kvn/» —
// uten å si hva «stages» betyr, og da improviserer den som leser den.
//
// Det skjedde: en agent kopierte HELE kvn-repoet inn, altså også `tests/`,
// `data/`, `scripts/`, `research/` og `node_modules/`. `bun test` fra
// bibel-roten går inn i den katalogen og fant da 17 fremmede testfiler —
// free-bibles egne, som leser et råkorpus (`kvn/../../generate/bibles_raw/`)
// som ikke finnes her og aldri skal finnes her. 36 røde tester ingen kan fikse
// fra bibel; smia bygde hver sak ferdig og forkastet den (#62).
//
// Bruk:
//   bun scripts/stage-kvn.ts          # stager (hopper over hvis alt er likt)
//   bun scripts/stage-kvn.ts --force  # stager på nytt uansett
//
// FREE_BIBLE_DIR overstyrer kilden (samme oppløsning som import-bible.ts).
//
// MERK: dette skriptet kalles ALDRI fra `preinstall`. Dockerfilen kjører
// `bun install` før `COPY scripts ./scripts`, og med et preinstall-steg ville
// imagebygget dødd på en fil som ikke er kopiert inn ennå — i et lag der
// free-bible uansett ikke finnes.

import fs from 'node:fs';
import path from 'node:path';
import { OWN, SOURCE, STAGED, STAMP, TARGET, freeBibleCandidates } from './kvn-staging.ts';

const force = process.argv.includes('--force');

if (!fs.existsSync(SOURCE)) {
  console.error(
    [
      `Finner ikke kvn-kilden: ${SOURCE}`,
      '',
      'kvn-package/ er en vendret kopi av free-bible/kvn og kan ikke bygges',
      'uten den. Lette her:',
      ...freeBibleCandidates().map((c) => `  - ${c}`),
      '',
      '  FREE_BIBLE_DIR=<sti til free-bible> bun scripts/stage-kvn.ts',
    ].join('\n'),
  );
  process.exit(1);
}

for (const entry of STAGED) {
  if (!fs.existsSync(path.join(SOURCE, entry))) {
    console.error(`Kilden mangler «${entry}»: ${path.join(SOURCE, entry)}`);
    console.error('free-bible/kvn ser ufullstendig ut — er klonen hel?');
    process.exit(1);
  }
}

/**
 * Fingeravtrykk av kilden: hver fil med størrelse og mtime.
 *
 * Kopien er 109 MB, så den skal ikke gjøres om igjen ved hver kjøring.
 * Innhold-hashing av 109 MB ville kostet mer enn kopien vi prøver å unngå;
 * størrelse + mtime er det `rsync` og `make` bruker, og er nok her.
 */
function fingerprint(): string {
  const rows: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const d of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const childAbs = path.join(abs, d.name);
      const childRel = `${rel}/${d.name}`;
      if (d.isDirectory()) walk(childAbs, childRel);
      else {
        const st = fs.statSync(childAbs);
        rows.push(`${childRel}\t${st.size}\t${Math.floor(st.mtimeMs)}`);
      }
    }
  };
  for (const entry of STAGED) {
    const abs = path.join(SOURCE, entry);
    if (fs.statSync(abs).isDirectory()) walk(abs, entry);
    else {
      const st = fs.statSync(abs);
      rows.push(`${entry}\t${st.size}\t${Math.floor(st.mtimeMs)}`);
    }
  }
  return Bun.hash(rows.join('\n')).toString(16);
}

const wanted = [...STAGED].sort();
const current = fs.existsSync(TARGET)
  ? fs
      .readdirSync(TARGET)
      .filter((n) => !OWN.has(n))
      .sort()
  : [];
const inventoryOk = current.length === wanted.length && current.every((n, i) => n === wanted[i]);
const stamp = fs.existsSync(STAMP) ? JSON.parse(fs.readFileSync(STAMP, 'utf-8')) : null;
const sourceFingerprint = fingerprint();

if (!force && inventoryOk && stamp?.fingerprint === sourceFingerprint) {
  console.log(`kvn-package/ er allerede i takt med ${SOURCE}`);
  process.exit(0);
}

// RIV FØRST. Det er dette som rydder opp etter en tidligere full kopi — uten
// det ville `tests/` og `data/` blitt liggende ved siden av den nye stagingen,
// og feilen overlevd sin egen fiks.
const removed: string[] = [];
if (fs.existsSync(TARGET)) {
  for (const name of fs.readdirSync(TARGET)) {
    if (OWN.has(name) || (STAGED as readonly string[]).includes(name)) continue;
    fs.rmSync(path.join(TARGET, name), { recursive: true, force: true });
    removed.push(name);
  }
}

fs.mkdirSync(TARGET, { recursive: true });
for (const entry of STAGED) {
  const to = path.join(TARGET, entry);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(path.join(SOURCE, entry), to, { recursive: true });
}

fs.writeFileSync(STAMP, `${JSON.stringify({ source: SOURCE, fingerprint: sourceFingerprint }, null, 2)}\n`);

console.log(`Staget kvn-package/ fra ${SOURCE}: ${wanted.join(', ')}`);
if (removed.length) {
  // Sies HØYT. Det var nettopp en usett full kopi som låste bibel, og en
  // opprydding som skjer i stillhet lærer ingen noe.
  console.log(`Fjernet ${removed.length} ting som ikke hører i pakka: ${removed.join(', ')}`);
}
