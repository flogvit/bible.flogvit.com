/**
 * VAKT: en ferdig fiks får ikke ligge i ÉN kopi på ÉN disk (#111).
 *
 * Saken: `59f5cb4` og `915e2f6` — hele svaret for `.no` på #101 og #98/#99 —
 * ble skrevet 2026-08-24 og lå sju døgn på den lokale `bibel-no` uten å finnes
 * på noen remote. Ingenting sa fra: treet var rent, `bun test` var grønt, og
 * CLAUDE.md pekte på commitene som om de var levert. En disk som ryker, eller
 * en `reset` på feil gren, tar dem med seg.
 *
 * Årsaken var at ingen automatikk ser dit: orkesterets `bergning` sveiper
 * `smie/*` og `testsmie/*`, og en `bibel-no`-utsjekk faller utenfor begge.
 * Denne vakta er den sveipen, lagt der bibel selv kan kjøre den — merge-porten.
 *
 * Den leser LOKALE remote-refs framfor å gå på nettet: en merge-port skal ikke
 * være treg og flakete. Prisen er at en foreldet ref kan gi falsk rødt (grenen
 * ER pushet, refen er gammel — `git fetch` retter det); den motsatte,
 * farlige retningen krever at noen sletter grenen på GitHub.
 *
 * Halvdelene måler BEGGE veier med vilje. Arbeidsgrenene (`smie/*`,
 * `testsmie/*`) er UNNTATT, for det er nettopp arbeid skallet leverer: uten
 * det unntaket ville vakta vært rød i hver eneste kjøring, altså ingen vakt i
 * det hele tatt. Unntaket er GRENEN og ikke HEAD — en `bibel-no`-utsjekk er
 * sin egen HEAD, og et HEAD-unntak ville gjort vakta blind for saken den
 * finnes for. Og uten kravet om at det FINNES grener og SHA-er å måle, ville
 * «returner tom liste» bestått.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

/**
 * Grener skallet selv leverer. Disse er arbeid under utførelse — de er upushet
 * i det normale tilfellet, og andre samtidige økter deler refene med oss.
 */
const ARBEIDSGRENER = [/^smie\//, /^testsmie\//];

/**
 * Commit-er som bevisst får ligge lokalt, med en grunn. Som `NORDIC_PROPER` er
 * hver oppføring en påstand, ikke et gjemmested — den er tom i dag.
 */
const UNNTATT: Record<string, string> = {};

// ---------------------------------------------------------------- REGELEN

/** Det vakta trenger å vite om git, injisert så regelen kan måles uten et repo. */
export type GitFakta = {
  /** Finnes SHA-en som en commit i DETTE repoet? */
  erCommit(sha: string): boolean;
  /** Er den nådd fra minst én remote-ref? */
  påRemote(sha: string): boolean;
  /** Ligger den på en arbeidsgren — altså arbeid skallet er i ferd med å levere? */
  påArbeidsgren(sha: string): boolean;
};

/**
 * De commitene som bare finnes her. En SHA som ikke resolver, er et ANNET
 * repos commit (deploy-tagger fra `flogvit-com-server` står i CLAUDE.md) og
 * er ikke vår å svare for.
 *
 * Unntaket er ARBEIDSGRENEN, ikke HEAD: en `bibel-no`-utsjekk er sin egen
 * HEAD, og et HEAD-unntak ville gjort vakta blind for nettopp saken den
 * finnes for.
 */
export function påÉnDisk(shas: string[], g: GitFakta): string[] {
  return shas.filter(
    (sha) =>
      !(sha in UNNTATT) &&
      g.erCommit(sha) &&
      !g.påRemote(sha) &&
      !g.påArbeidsgren(sha),
  );
}

// ------------------------------------------------------------------- GIT

function git(...args: string[]): { ok: boolean; ut: string } {
  const p = Bun.spawnSync(['git', ...args], { cwd: ROOT, stderr: 'pipe' });
  return { ok: p.exitCode === 0, ut: new TextDecoder().decode(p.stdout).trim() };
}

function lokaleGrener(): string[] {
  return git('for-each-ref', '--format=%(refname:short)', 'refs/heads')
    .ut.split('\n')
    .filter(Boolean);
}

function erArbeidsgren(gren: string): boolean {
  return ARBEIDSGRENER.some((re) => re.test(gren));
}

const fakta: GitFakta = {
  erCommit: (sha) => git('rev-parse', '--verify', '--quiet', `${sha}^{commit}`).ok,
  påRemote: (sha) =>
    git('branch', '-r', '--contains', sha, '--format=%(refname)').ut.length > 0,
  påArbeidsgren: (sha) =>
    git('branch', '--contains', sha, '--format=%(refname:short)')
      .ut.split('\n')
      .filter(Boolean)
      .some(erArbeidsgren),
};

/** SHA-ene CLAUDE.md navngir. Deploy-tagger bærer også en («…-091af4e»). */
function shaerIClaudeMd(): string[] {
  const tekst = readFileSync(resolve(ROOT, 'CLAUDE.md'), 'utf8');
  return [...new Set(tekst.match(/\b[0-9a-f]{7,40}\b/g) ?? [])];
}

// ----------------------------------------------------------------- TESTER

describe('upushet arbeid (#111)', () => {
  test('REGELEN: en commit uten remote og uten arbeidsgren er på én disk', () => {
    const g: GitFakta = {
      erCommit: (s) => s !== 'annetrepo',
      påRemote: (s) => s === 'pushet',
      påArbeidsgren: (s) => s === 'underarbeid',
    };
    // Begge veier: bare den som er UTEN begge, meldes.
    expect(
      påÉnDisk(['pushet', 'underarbeid', 'annetrepo', 'alene'], g),
    ).toEqual(['alene']);
  });

  test('INGEN STILLE SKIP: det finnes grener og SHA-er å måle', () => {
    expect(git('rev-parse', '--is-inside-work-tree').ut).toBe('true');
    expect(lokaleGrener().length).toBeGreaterThan(0);
    const kjente = shaerIClaudeMd().filter(fakta.erCommit);
    expect(kjente.length).toBeGreaterThan(0);
  });

  test('GRENA: hver lokal gren som ikke er en arbeidsgren finnes på en remote', () => {
    const etterlatte = lokaleGrener().filter(
      (b) => !erArbeidsgren(b) && påÉnDisk([b], fakta).length > 0,
    );
    expect(
      etterlatte,
      `Grener som bare finnes på denne disken: ${etterlatte.join(', ')}. ` +
        'Push dem, eller slett dem hvis arbeidet er forkastet.',
    ).toEqual([]);
  });

  test('DOKUMENTASJONEN: hver commit CLAUDE.md peker på finnes på en remote', () => {
    const alene = påÉnDisk(shaerIClaudeMd(), fakta);
    expect(
      alene,
      `CLAUDE.md peker på commit-er som ikke finnes på noen remote: ${alene.join(', ')}.`,
    ).toEqual([]);
  });
});
