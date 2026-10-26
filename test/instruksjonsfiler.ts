/**
 * Instruksjonsfilene i repoet: hver `CLAUDE.md` og hver prosjektskill (#164).
 *
 * Rotas `CLAUDE.md` bærer reglene; sakene bak dem står ordrett i
 * `.claude/skills/<navn>/SKILL.md`, og katalogreglene i `<katalog>/CLAUDE.md`.
 * Én liste, delt av størrelsesvakta og av `upushet-arbeid.test.ts` — en vakt som
 * bare leste rota, ville blitt blind for alt som flyttet ut.
 *
 * Bare ÉN katalog ned: et arbeidstre under `.claude/worktrees/` er en annen
 * utsjekk og ikke vår å måle, og `node_modules` har pakkenes egne.
 */
import { Glob } from 'bun';
import { resolve } from 'node:path';

export const ROT = resolve(import.meta.dir, '..');

const UTENFOR = new Set(['node_modules', 'kvn-package']);

/** Alle `CLAUDE.md`, relativt til rota: `CLAUDE.md` og `<katalog>/CLAUDE.md`. */
export function claudeMdFiler(): string[] {
  const under = [...new Glob('*/CLAUDE.md').scanSync({ cwd: ROT })].filter(
    (sti) => !UTENFOR.has(sti.split('/')[0] ?? ''),
  );
  return ['CLAUDE.md', ...under.sort()];
}

/** Alle prosjektskillene, relativt til rota. */
export function skillFiler(): string[] {
  return [...new Glob('.claude/skills/*/SKILL.md').scanSync({ cwd: ROT, dot: true })].sort();
}

/** Begge deler: alt en økt kan lese som instruks. */
export function instruksjonsfiler(): string[] {
  return [...claudeMdFiler(), ...skillFiler()];
}
