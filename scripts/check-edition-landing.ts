// End-to-end check of a harvested translation through the import (#170, #216):
// its verses are moved to osnb addresses by the SAME code the import uses
// (`toOsnbNumbering`), and the result is compared, chapter by chapter, with a
// translation whose mapping is already verified against the text (kjv).
//
// It needs no model. It finds three things:
//   1. shift   — the translation's verses sit one verse off in a chapter. The
//                verse lengths of two translations of the same text follow each
//                other; if they match better one verse over than in place, the
//                chapter is shifted (albanian Revelation 1–12 was one verse low).
//   2. landing — an osnb verse the reference fills is left empty, so a reader
//                sees a gap. Either the translation omits it (Luke 17:36 in the
//                critical text) or its text landed on a neighbour.
//   3. junk    — placeholder text from the source that reaches the reader
//                («*** POSSIBLE ERROR IN BIBLE, TEXT MISSING HERE ***»). The
//                import leaves such verses out; they are listed, so the gap is known.
//
// What it cannot see: half a sentence moved across a verse boundary. That is
// for the text verification with the models (free-bible kvn/verify-text.ts).
//
//   FREE_BIBLE_DIR=../free-bible bun scripts/check-edition-landing.ts akjv bungo
//   … --ref kjv          the reference translation (default kjv)
//   … --json out.json    write every finding, not just the summary
//
// Exit 0: no shifted chapter and no junk. Exit 1: there is something to fix
// (or to accept and write into the mapping's `textVerification.remaining`).
// Empty landings are reported, never fail: an omitted verse is correct.

import * as fs from 'fs';
import * as path from 'path';
import type { UkvnMappingFile } from '@free-bible/kvn';
import { SOURCE_PLACEHOLDER, toOsnbNumbering } from '../src/lib/edition-import.ts';
import type { RawVerse, OsnbVerse, Renumbered } from '../src/lib/edition-import.ts';

/** Placeholder text that would reach the reader: the import's own rule (#216). */
export const JUNK = SOURCE_PLACEHOLDER;

/** Length that compares across scripts: letters only, no spaces or punctuation. */
export function textLength(text: string): number {
  return text.replace(/[\s\p{P}\p{S}\d]/gu, '').length;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

export interface ShiftFinding {
  chapter: string;
  inPlace: number;
  shifted: number;
  by: 1 | -1;
}

/**
 * Is this chapter one verse off against the reference? `t` and `r` are the
 * lengths by osnb verse number (index = verse). Only verses both fill count.
 * A chapter is flagged when the lengths follow each other clearly better one
 * verse over than in place.
 */
export function chapterShift(chapter: string, t: number[], r: number[]): ShiftFinding | null {
  const corrAt = (off: number) => {
    const a: number[] = [], b: number[] = [];
    for (let v = 1; v < r.length; v++) {
      const tv = t[v + off], rv = r[v];
      if (tv && rv) { a.push(tv); b.push(rv); }
    }
    return a.length >= 6 ? pearson(a, b) : NaN;
  };
  const inPlace = corrAt(0);
  if (Number.isNaN(inPlace)) return null;
  for (const by of [1, -1] as const) {
    const shifted = corrAt(by);
    if (shifted > inPlace + 0.25 && shifted > 0.5) return { chapter, inPlace, shifted, by };
  }
  return null;
}

function readRaw(dir: string): RawVerse[] {
  const out: RawVerse[] = [];
  for (const b of fs.readdirSync(dir).filter((f) => /^\d+$/.test(f))) {
    for (const f of fs.readdirSync(path.join(dir, b)).filter((f) => f.endsWith('.json'))) {
      out.push(...(JSON.parse(fs.readFileSync(path.join(dir, b, f), 'utf-8')) as RawVerse[]));
    }
  }
  return out;
}

function landed(freeBible: string, id: string, osnb: UkvnMappingFile): Renumbered {
  const raw = readRaw(path.join(freeBible, 'generate', 'bibles_raw', id));
  const mapping = JSON.parse(
    fs.readFileSync(path.join(freeBible, 'kvn', 'mappings', `${id}.ukvn.json`), 'utf-8'),
  ) as UkvnMappingFile;
  return toOsnbNumbering(raw, mapping, osnb);
}

function byChapter(verses: OsnbVerse[]): Map<string, Map<number, string>> {
  const m = new Map<string, Map<number, string>>();
  for (const v of verses) {
    const k = `${v.book} ${v.chapter}`;
    if (!m.has(k)) m.set(k, new Map());
    m.get(k)!.set(v.verse, v.text);
  }
  return m;
}

export interface LandingReport {
  id: string;
  verses: number;
  shifts: ShiftFinding[];
  empty: string[];
  junk: string[];
  placeholders: string[];
}

export function checkEdition(freeBible: string, id: string, ref: string): LandingReport {
  const osnb = JSON.parse(
    fs.readFileSync(path.join(freeBible, 'kvn', 'mappings', 'osnb.ukvn.json'), 'utf-8'),
  ) as UkvnMappingFile;
  const result = landed(freeBible, id, osnb);
  const t = result.verses;
  const tc = byChapter(t);
  const rc = byChapter(landed(freeBible, ref, osnb).verses);
  const shifts: ShiftFinding[] = [];
  const empty: string[] = [];
  for (const [chapter, rv] of rc) {
    const tv = tc.get(chapter) ?? new Map<number, string>();
    if (!tc.has(chapter)) continue; // a book the translation does not have
    const max = Math.max(...rv.keys(), ...tv.keys());
    const tl: number[] = [], rl: number[] = [];
    for (let v = 0; v <= max + 1; v++) {
      tl.push(textLength(tv.get(v) ?? ''));
      rl.push(textLength(rv.get(v) ?? ''));
      if (v >= 1 && rl[v]! > 0 && tl[v] === 0) empty.push(`${chapter}:${v}`);
    }
    const s = chapterShift(chapter, tl, rl);
    if (s) shifts.push(s);
  }
  // What still reaches the reader is junk; the placeholders the import left out are reported.
  const junk = t.filter((v) => JUNK.test(v.text)).map((v) => `${v.book} ${v.chapter}:${v.verse}`);
  return { id, verses: t.length, shifts, empty, junk, placeholders: result.placeholders };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const ref = opt('--ref') ?? 'kjv';
  const jsonOut = opt('--json');
  const freeBible = process.env.FREE_BIBLE_DIR;
  if (!freeBible || !args.length) {
    console.error('usage: FREE_BIBLE_DIR=<free-bible> bun scripts/check-edition-landing.ts <id>… [--ref kjv] [--json file]');
    process.exit(2);
  }
  const reports = args.map((id) => checkEdition(freeBible, id, ref));
  let bad = false;
  for (const r of reports) {
    bad ||= r.shifts.length > 0 || r.junk.length > 0;
    console.log(
      `${r.id.padEnd(22)} ${String(r.verses).padStart(6)} osnb-vers  ` +
        `forskjøvet: ${r.shifts.length}  tomme: ${r.empty.length}  søppel: ${r.junk.length}`,
    );
    for (const s of r.shifts)
      console.log(`    forskjøvet ${s.chapter}  på plass ${s.inPlace.toFixed(2)}  ${s.by > 0 ? '+1' : '-1'} ${s.shifted.toFixed(2)}`);
    if (r.empty.length) console.log(`    tomme: ${r.empty.join(', ')}`);
    if (r.junk.length) console.log(`    søppel: ${r.junk.join(', ')}`);
    if (r.placeholders.length) console.log(`    plassholdere utelatt (eget vers): ${r.placeholders.join(', ')}`);
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ref, reports }, null, 2));
  process.exit(bad ? 1 : 0);
}
