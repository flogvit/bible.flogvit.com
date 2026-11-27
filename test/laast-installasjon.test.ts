// Imagene bygges BARE fra låsfila (#284).
//
// `Dockerfile` hadde `bun install --frozen-lockfile --production || bun install
// --production` fra første commit. Feilet den låste installasjonen, bygget
// imaget likevel — med en fersk oppløsning av alle områdene i manifestet og
// uten integritetshashene. Ingenting sa fra utover byggeloggen. Og låsen er
// det vi REVIDERER (`bun audit`, avhengighetsvakta, `laaste-avhengigheter`,
// `hono-sikkerhet`): da kjørte prod noe annet enn det som var revidert.
//
// Tre dører inn til en ulåst installasjon, én vakt hver:
//  1. en fallback i Dockerfilen (`||`), eller en lås som får mangle (`bun.lock*`);
//  2. et manifest som har drevet fra låsen — uten fallbacken er det en feilet
//     deploy, så det skal fanges HER, i testporten, før docker-bygget;
//  3. `file:kvn-package`: bun feiler IKKE frozen på drift inne i en
//     `file:`-pakke (bare `warn`), den installerer en ny kjøretidsavhengighet
//     med fersk oppløsning. Stagingen (#62, #112) eier hva pakka inneholder;
//     her sjekkes bare at låsen sier det samme.
//
// `oppsett` (`bun install` uten flagg) er bevisst utenfor: det er der låsen skrives.

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { BIBEL_DIR, TARGET } from '../scripts/kvn-staging.ts';
import { type LockEntry, parseLockfile } from '../scripts/laaste-avhengigheter.ts';

const SKIP_DIRS = new Set(['node_modules', 'kvn-package', '.git', '.claude']);

function findDockerfiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findDockerfiles(path.join(dir, entry.name), out);
    } else if (entry.name === 'Dockerfile') {
      out.push(path.relative(BIBEL_DIR, path.join(dir, entry.name)));
    }
  }
  return out.sort();
}

/** RUN-instruksjonene, med kommentarer fjernet og `\`-fortsettelser slått sammen. */
function runInstructions(dockerfile: string): string[] {
  return dockerfile
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^RUN\s/i.test(line));
}

const INSTALL = /\bbun\s+(install|i|add)\b/;

/** Hva som er galt med installasjonene i en Dockerfile; tom liste = alt låst. */
function unlockedInstalls(dockerfile: string): string[] {
  const feil: string[] = [];
  for (const run of runInstructions(dockerfile).filter((r) => INSTALL.test(r))) {
    if (run.includes('||')) feil.push(`fallback (||): ${run}`);
    for (const cmd of run.split(/&&|;|\|/).filter((c) => INSTALL.test(c))) {
      if (!cmd.includes('--frozen-lockfile')) feil.push(`uten --frozen-lockfile: ${cmd.trim()}`);
    }
  }
  return feil;
}

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

/** Seksjonene manifestet og låsen er uenige om. */
function drift(manifest: LockEntry, locked: LockEntry): string[] {
  return SECTIONS.filter(
    (s) => JSON.stringify(Object.entries(manifest[s] ?? {}).sort()) !== JSON.stringify(Object.entries(locked[s] ?? {}).sort()),
  ).map((s) => `${s}: manifest ${JSON.stringify(manifest[s] ?? {})} ≠ lås ${JSON.stringify(locked[s] ?? {})}`);
}

const read = (rel: string) => fs.readFileSync(path.join(BIBEL_DIR, rel), 'utf-8');
const DOCKERFILES = findDockerfiles(BIBEL_DIR);

describe('REGELEN: en installasjon i et image er låst, uten vei utenom', () => {
  test('fallbacken fra #284 er rød', () => {
    const feil = unlockedInstalls('RUN bun install --frozen-lockfile --production || bun install --production');
    // Både selve fallbacken og den ulåste installasjonen bak den.
    expect(feil.map((f) => f.split(':')[0])).toEqual(['fallback (||)', 'uten --frozen-lockfile']);
  });

  test('en install uten flagget er rød, også etter && og over en fortsettelse', () => {
    expect(unlockedInstalls('RUN bun install --frozen-lockfile && bun add zod')).toHaveLength(1);
    expect(unlockedInstalls('RUN bun i \\\n  --production')).toHaveLength(1);
  });

  test('en kommentar om bun install er ingen installasjon', () => {
    expect(runInstructions('# må ligge der før bun install\nRUN echo hei')).toEqual(['RUN echo hei']);
    expect(unlockedInstalls('RUN bun install --frozen-lockfile --production')).toEqual([]);
  });
});

describe('DOCKERFILENE', () => {
  test('begge imagene er funnet, med minst én installasjon hver (ingen stille skip)', () => {
    for (const known of ['Dockerfile', 'mcp/Dockerfile']) {
      expect(DOCKERFILES).toContain(known);
      expect(runInstructions(read(known)).some((r) => INSTALL.test(r))).toBe(true);
    }
  });

  test.each(DOCKERFILES)('%s installerer bare fra låsfila', (rel) => {
    expect(unlockedInstalls(read(rel)).join('\n') || 'låst').toBe('låst');
  });

  test.each(DOCKERFILES)('%s kopierer låsen ved navn, så et bygg uten lås stopper', (rel) => {
    const copies = read(rel)
      .split('\n')
      .filter((l) => /^COPY\s/i.test(l.trim()) && l.includes('bun.lock'));
    expect(copies.length).toBeGreaterThan(0);
    expect(copies.filter((l) => /bun\.lock\*/.test(l)).join('\n') || 'ved navn').toBe('ved navn');
  });
});

describe('MANIFEST OG LÅS: frozen-installasjonen i imaget går gjennom', () => {
  test.each(['', 'mcp'])('%s package.json og bun.lock er enige', (dir) => {
    const manifest = JSON.parse(read(path.join(dir, 'package.json'))) as LockEntry;
    const workspace = parseLockfile(read(path.join(dir, 'bun.lock'))).workspaces[''];
    expect(workspace).toBeDefined();
    expect(drift(manifest, workspace ?? {}).join('\n') || 'enige').toBe('enige');
  });

  test('den stagede kvn-pakkas kjøretidsavhengigheter er de låste', () => {
    const staged = JSON.parse(fs.readFileSync(path.join(TARGET, 'package.json'), 'utf-8')) as LockEntry;
    const locked = parseLockfile(read('bun.lock')).packages['@free-bible/kvn'];
    expect(locked).toBeDefined();
    const ulik = drift({ dependencies: staged.dependencies }, { dependencies: locked?.dependencies });
    expect(ulik.join('\n') || 'enige').toBe('enige');
  });
});
