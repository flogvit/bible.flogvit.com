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
 * ENDRINGSLOGGEN, som deployen committer FØR den kjører testene (#113).
 *
 * Den er samme kategori som arbeidsgrenene over — arbeid under utførelse, som
 * SKALLET leverer — bare på `main` i stedet for på en egen gren. Deployeren
 * pusher den ved suksess og ruller den HELT tilbake ved feil; den er aldri
 * strandet arbeid.
 *
 * Uten unntaket er vakta SELVLÅSENDE, og det er ikke en teori: deployen skrev
 * commiten, testporten ble rød på nettopp den, deployen rullet tilbake, og
 * neste runde gjorde det samme — hvert kvarter, uten at bibel kunne rulles ut i
 * det hele tatt. Målt 2026-09-03 kl. 04:15, `main` = `fc7b1f5` mot
 * `origin/main` = `91504f4`, med `RELEASE.md` som eneste fil i diffen.
 *
 * Navnet er deployerens egen `LOGGFIL`.
 */
const ENDRINGSLOGG = 'RELEASE.md';

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

/**
 * Er ALT det upushede på grenen bare endringsloggen? (#113)
 *
 * `null` betyr at vi ikke fikk vite det — grenen har ingen upstream, og da vet
 * vi ikke hva «upushet» er. Da svarer den NEI, altså grenen dømmes som før:
 * en manglende måling er aldri et frikort, og en gren uten upstream er nettopp
 * klassen #111 ble skrevet for.
 *
 * TOM LISTE er også nei. Er det ingenting upushet, er grenen ikke etterlatt av
 * denne grunnen, og da skal den andre regelen få svare — ellers ville en gren
 * ingen remote kjenner sluppet unna på at den ikke har noe å pushe.
 */
export function bareEndringsloggen(filer: string[] | null): boolean {
  return filer !== null && filer.length > 0 && filer.every((f) => f === ENDRINGSLOGG);
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

/**
 * Filene som er endret av det som ligger upushet på grenen — altså mellom
 * grenens upstream og grenen selv. `null` når grenen ikke HAR en upstream.
 *
 * `git diff` gir unionen over hele spennet, så én commit som rører noe annet
 * enn endringsloggen holder til å felle unntaket.
 */
function upushedeFiler(gren: string): string[] | null {
  const opp = git('rev-parse', '--abbrev-ref', `${gren}@{upstream}`);
  if (!opp.ok || !opp.ut) return null;
  const d = git('diff', '--name-only', `${opp.ut}..${gren}`);
  if (!d.ok) return null;
  return d.ut.split('\n').filter(Boolean);
}

/**
 * DOMMEN, på ETT sted. Grenene vakta melder som etterlatt.
 *
 * Den står som en funksjon og ikke inne i testen fordi PROBE-testen under må
 * spørre NØYAKTIG den samme regelen. Første utgave bygget predikatet på nytt
 * der, og da var mutasjonen «fjern unntaket» GRØNN: porten målte sin egen kopi
 * i stedet for regelen den skulle vokte. Se #113.
 */
function etterlatteGrener(): string[] {
  return lokaleGrener().filter(
    (b) =>
      !erArbeidsgren(b) &&
      !bareEndringsloggen(upushedeFiler(b)) &&
      påÉnDisk([b], fakta).length > 0,
  );
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

  test('DEPLOYENS EGEN LOGG er ikke strandet arbeid (#113)', () => {
    // Den som lukker hullet. Deployen committer `RELEASE.md` FØR testene, så
    // `main` ligger én commit foran `origin/main` mens porten kjører — og
    // vakta felte da deployen på dens egen mellomtilstand, hvert kvarter.
    expect(bareEndringsloggen(['RELEASE.md'])).toBe(true);
  });

  test('…men ÉN annen fil er nok til at grenen meldes som før', () => {
    // Den viktigste halvdelen: unntaket skal ikke kunne bære ekte arbeid ut av
    // vakta. Rører spennet noe utover loggen, gjelder #111 uendret.
    expect(bareEndringsloggen(['RELEASE.md', 'src/app.ts'])).toBe(false);
    expect(bareEndringsloggen(['src/app.ts'])).toBe(false);
  });

  test('EN MANGLENDE MÅLING ER IKKE ET FRIKORT', () => {
    // `null` = grenen har ingen upstream, altså vet vi ikke hva som er upushet.
    // Det er nettopp klassen #111 ble skrevet for, og den skal dømmes som før.
    expect(bareEndringsloggen(null)).toBe(false);
    // Tom liste betyr «ingenting upushet» — da har unntaket ingenting å si, og
    // den andre regelen skal få svare.
    expect(bareEndringsloggen([])).toBe(false);
  });

  test('GRENA: begge retningene, målt på en gren som FAKTISK ligger foran', () => {
    // DEN SOM MÅLER UTFALLET. De tre testene over er ren logikk, og
    // sammensetningen i «GRENA» kan bare prøves når en gren VIRKELIG er foran
    // sin upstream — en tilstand som varer fra deployen committer til den
    // ruller tilbake, altså sjelden når porten kjører. En port som venter på
    // at tilstanden skal dukke opp, måler ingenting.
    //
    // Grenene bygges med `commit-tree`: ingen index, intet arbeidstre, ingen
    // HEAD som flyttes. Klonen er urørt når testen er ferdig.
    const base = git('rev-parse', 'origin/main').ut;
    const lagGren = (navn: string, fil: string): void => {
      const blob = Bun.spawnSync(['git', 'hash-object', '-w', '--stdin'], {
        cwd: ROOT,
        stdin: new TextEncoder().encode('probe\n'),
      });
      const sha = new TextDecoder().decode(blob.stdout).trim();
      const linjer = git('ls-tree', base).ut.split('\n').map((l) => {
        const [meta, navnDel] = l.split('\t');
        if (navnDel !== fil) return l;
        const [modus, type] = meta!.split(' ');
        return `${modus} ${type} ${sha}\t${navnDel}`;
      });
      const tre = Bun.spawnSync(['git', 'mktree'], {
        cwd: ROOT,
        stdin: new TextEncoder().encode(`${linjer.join('\n')}\n`),
      });
      const treSha = new TextDecoder().decode(tre.stdout).trim();
      const commit = git('commit-tree', treSha, '-p', base, '-m', `probe: ${fil}`).ut;
      git('branch', navn, commit);
      git('branch', `--set-upstream-to=origin/main`, navn);
    };

    // Fila som IKKE er endringsloggen velges av treet, ikke av en literal:
    // en fil som forsvinner ville ellers gjort halvdelen til en tom påstand.
    const annen = git('ls-tree', '--name-only', base)
      .ut.split('\n')
      .filter((f) => f && f !== ENDRINGSLOGG)[0];
    expect(annen, 'fant ingen annen fil i treet å måle mot').toBeTruthy();

    try {
      lagGren('probe/logg', ENDRINGSLOGG);
      lagGren('probe/kilde', annen!);

      // Forutsetningen: begge ligger faktisk foran, og rører hver sin fil.
      expect(git('diff', '--name-only', `origin/main..probe/logg`).ut).toBe(ENDRINGSLOGG);
      expect(git('diff', '--name-only', `origin/main..probe/kilde`).ut).toBe(annen!);

      // SAMME funksjon som «GRENA» dømmer med — ikke en kopi av regelen.
      const meldt = etterlatteGrener();

      expect(meldt, 'deployens egen logg skal IKKE felle porten').not.toContain('probe/logg');
      expect(meldt, 'ekte arbeid skal fortsatt meldes').toContain('probe/kilde');
    } finally {
      // Ryddes uansett utfall — en etterlatt probe-gren ville felt vakta selv.
      git('branch', '-D', 'probe/logg');
      git('branch', '-D', 'probe/kilde');
    }
  });

  test('INGEN STILLE SKIP: det finnes grener og SHA-er å måle', () => {
    expect(git('rev-parse', '--is-inside-work-tree').ut).toBe('true');
    expect(lokaleGrener().length).toBeGreaterThan(0);
    const kjente = shaerIClaudeMd().filter(fakta.erCommit);
    expect(kjente.length).toBeGreaterThan(0);
  });

  test('GRENA: hver lokal gren som ikke er en arbeidsgren finnes på en remote', () => {
    const etterlatte = etterlatteGrener();
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
