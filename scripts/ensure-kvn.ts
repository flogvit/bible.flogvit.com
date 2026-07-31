// Sørger for at kvn-pakken er RIKTIG STAGET og FAKTISK INSTALLERT før noe
// kjøres som trenger den. Kalles av `test`, `typecheck` og `dev`.
//
// To ting kan være galt, og begge var stille (#62):
//
// 1. PAKKA ER IKKE INSTALLERT. `bun install` kan ikke bootstrappe en
//    `file:`-avhengighet som ikke ligger der ennå — og sier det ikke høyt:
//
//      $ bun install               # ferskt arbeidstre, kvn-package/ gitignort
//      FileNotFound: failed opening cache/package/version dir for @free-bible/kvn
//      65 packages installed
//      Failed to install 1 package
//      $ echo $?
//      0                           ← EXIT 0
//
//    `preinstall` løser det ikke: bun resolver `file:`-stier FØR
//    livssyklusskriptene, så stagingen kommer alltid ett hakk for sent. Og bun
//    KOPIERER pakka inn i node_modules (109 MB, ikke symlink), så det holder
//    ikke å fylle kvn-package/ etterpå — installasjonen må gjøres om.
//
// 2. PAKKA ER STAGET FOR BREDT. En full kopi av free-bible/kvn installerer seg
//    helt fint, så steg 1 merker ingenting — men da ligger free-bibles egne
//    `tests/` i bibel, og `bun test` fra roten kjører dem. Det var 36 røde
//    tester ingen kunne fikse herfra.
//
// Derfor sjekkes BEGGE, og ikke bare «finnes pakka». Er alt i orden — normal
// klone, og imaget, der `bun install` kjørte med kvn-package/ til stede — gjør
// skriptet ingenting og koster én readdir.

import fs from 'node:fs';
import { INSTALLED, TARGET, inventoryProblems } from './kvn-staging.ts';

const problems = inventoryProblems();
const installed = fs.existsSync(INSTALLED);

if (installed && problems.length === 0) process.exit(0);

if (problems.length) {
  console.log(`kvn-package/ er ikke slik den skal være (${TARGET}):`);
  for (const p of problems) console.log(`  - ${p}`);
}
if (!installed) console.log('@free-bible/kvn er ikke installert.');
console.log('Stager og installerer på nytt.');

const stage = Bun.spawnSync(['bun', 'scripts/stage-kvn.ts'], {
  cwd: import.meta.dir + '/..',
  stdout: 'inherit',
  stderr: 'inherit',
});
if (stage.exitCode !== 0) process.exit(stage.exitCode ?? 1);

const install = Bun.spawnSync(['bun', 'install'], {
  cwd: import.meta.dir + '/..',
  stdout: 'inherit',
  stderr: 'inherit',
});
if (install.exitCode !== 0) process.exit(install.exitCode ?? 1);

// `bun install` avslutter med 0 selv når den IKKE fikk installert pakka. Uten
// denne sjekken ville skriptet meldt suksess og latt neste steg feile på en
// import — altså nøyaktig den stille feilen vi er her for å fjerne.
if (!fs.existsSync(INSTALLED)) {
  console.error(
    [
      '',
      '@free-bible/kvn ble fortsatt ikke installert.',
      '',
      `Forventet: ${INSTALLED}`,
      'Sjekk at søsterkatalogen free-bible finnes, eller sett FREE_BIBLE_DIR.',
    ].join('\n'),
  );
  process.exit(1);
}
