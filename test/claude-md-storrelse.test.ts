/**
 * VAKT: ingen `CLAUDE.md` her vokser seg forbi det Claude Code advarer om (#164).
 *
 * Rotas `CLAUDE.md` var 209 314 tegn, og Claude Code (2.1.310) sier fra over
 * 40 000 tegn per lastet fil og 120 000 for alle lastede instruksjonsfiler til
 * sammen. `~/.claude/CLAUDE.md` med importene sine er alt ~55 000 og lastes i
 * hver økt, så denne fila alene ga advarselen hver gang — og det er eieren som
 * ser den, ikke den som skrev historien inn.
 *
 * Grepet som tok den ned: fila bærer REGELEN, saken står ordrett i en
 * prosjektskill (`.claude/skills/<navn>/SKILL.md`), og katalogregler står i
 * katalogens egen `CLAUDE.md`. Skillene lastes bare når de trengs og teller
 * ikke. Denne vakta er porten mot at historiene kryper tilbake: legger du en ny
 * sak i rota, blir main rød — flytt den til en skill og la én regel stå.
 *
 * TEGN, ikke bytes: grensene i Claude Code er tegn. `.length` er UTF-16-enheter,
 * som er minst like mange som tegnene, altså strengere enn grensen.
 *
 * Taket er 32 000 per fil og 35 000 for rota med alt den `@`-importerer, så en
 * økt holder seg under ~90 000 totalt. Et `@`-import teller som egen fil mot
 * begge grensene, og derfor følges importene her.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { claudeMdFiler, ROT, skillFiler } from './instruksjonsfiler';

const TAK_PER_FIL = 32_000;
const TAK_ROT_MED_IMPORTER = 35_000;

function les(sti: string): string {
  return readFileSync(sti, 'utf8');
}

/**
 * `@sti`-importene i en instruksjonsfil. Kodeblokker og `kode` er ikke
 * importer (`@free-bible/kvn` står i backticks), så de strippes først.
 */
function importer(tekst: string): string[] {
  const uten = tekst.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...uten.matchAll(/(?:^|\s)@([~\w./-]+)/g)].map((m) => m[1] ?? '');
}

/** Fila og alt den importerer, transitivt, som absolutte stier. */
function medImporter(sti: string, sett = new Set<string>()): Set<string> {
  if (sett.has(sti)) return sett;
  sett.add(sti);
  for (const imp of importer(les(sti))) {
    const mål = imp.startsWith('~/')
      ? resolve(process.env.HOME ?? '', imp.slice(2))
      : resolve(dirname(sti), imp);
    if (existsSync(mål)) medImporter(mål, sett);
  }
  return sett;
}

describe('CLAUDE.md-størrelse (#164)', () => {
  test('REGELEN: en import i backticks eller kodeblokk er ingen import', () => {
    const tekst = 'Se @docs/a.md og `@free-bible/kvn`.\n```\n@b.md\n```\n@c.md';
    expect(importer(tekst)).toEqual(['docs/a.md', 'c.md']);
  });

  test('det finnes en rot-CLAUDE.md å måle', () => {
    // Ellers ville en vakt som leste en tom liste bestått.
    expect(claudeMdFiler()[0]).toBe('CLAUDE.md');
    expect(existsSync(resolve(ROT, 'CLAUDE.md'))).toBe(true);
  });

  test(`hver CLAUDE.md er høyst ${TAK_PER_FIL} tegn`, () => {
    const for_store = claudeMdFiler()
      .map((fil) => ({ fil, tegn: les(resolve(ROT, fil)).length }))
      .filter((f) => f.tegn > TAK_PER_FIL);
    expect(
      for_store,
      `For store: ${for_store.map((f) => `${f.fil} (${f.tegn})`).join(', ')}. ` +
        'Flytt saken ordrett til en skill i .claude/skills/ og la regelen stå (#164).',
    ).toEqual([]);
  });

  test(`rota med alt den importerer er høyst ${TAK_ROT_MED_IMPORTER} tegn`, () => {
    const filer = [...medImporter(resolve(ROT, 'CLAUDE.md'))];
    const sum = filer.reduce((s, f) => s + les(f).length, 0);
    expect(sum, `Rota med importer: ${sum} tegn (${filer.join(', ')}).`).toBeLessThanOrEqual(
      TAK_ROT_MED_IMPORTER,
    );
  });

  test('hver skill har name lik katalogen og en description som sier når den leses', () => {
    const skills = skillFiler();
    expect(skills.length).toBeGreaterThan(0);
    for (const fil of skills) {
      const hode = les(resolve(ROT, fil)).match(/^---\n([\s\S]*?)\n---\n/)?.[1];
      expect(hode, `${fil} mangler frontmatter`).toBeDefined();
      const navn = hode?.match(/^name: (.+)$/m)?.[1];
      const beskrivelse = hode?.match(/^description: (.+)$/m)?.[1] ?? '';
      expect(navn, fil).toBe(fil.split('/')[2]);
      expect(beskrivelse, `${fil}: description skal si når skillen leses`).toContain('Les ');
    }
  });

  test('hver skill rota peker på finnes, og hver skill er pekt på', () => {
    // En regel som peker på en skill som ikke finnes, er en regel uten sak; en
    // skill ingen regel peker på, blir aldri lest.
    const rot = les(resolve(ROT, 'CLAUDE.md'));
    const pekt = new Set([...rot.matchAll(/skill `([a-z0-9-]+)`/g)].map((m) => m[1]));
    const finnes = new Set(skillFiler().map((f) => f.split('/')[2]));
    expect([...pekt].filter((n) => !finnes.has(n))).toEqual([]);
    expect([...finnes].filter((n) => !pekt.has(n))).toEqual([]);
  });
});
