// Endringsloggen som SIDE: parseren mot det formatet RELEASE.md faktisk har.
//
// Testen finnes fordi loggen skrives for hånd ved hver deploy. Et format som
// stille slutter å parse gir en tom side — og en tom endringslogg ser ut som
// «ingenting har skjedd», ikke som en feil.

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReleaseNotes } from '../src/routes/pages/changes.tsx';

const SAMPLE = `# Release notes

Preamble that is not part of any entry.

## 2026-07-29 — A short summary

**New features**

- A line that is wrapped across
  two source lines and must become one item.
- A second item.

**Bug fixes**

- Something was broken and is now fixed.

## 2026-07-01 — An older entry

**Polish**

- Older item.
`;

describe('endringsloggen', () => {
  it('samler ombrukne linjer til ett punkt', () => {
    const [entry] = parseReleaseNotes(SAMPLE);
    expect(entry!.sections[0]!.items[0]).toBe(
      'A line that is wrapped across two source lines and must become one item.',
    );
  });

  it('leser dato, tittel og kategorier', () => {
    const entries = parseReleaseNotes(SAMPLE);
    expect(entries.map((e) => e.date)).toEqual(['2026-07-29', '2026-07-01']);
    expect(entries[0]!.title).toBe('A short summary');
    expect(entries[0]!.sections.map((s) => s.heading)).toEqual(['New features', 'Bug fixes']);
    expect(entries[0]!.sections[1]!.items).toEqual(['Something was broken and is now fixed.']);
  });

  it('ignorerer teksten før første post', () => {
    expect(parseReleaseNotes(SAMPLE).length).toBe(2);
  });

  it('parser repoets EGEN RELEASE.md — ikke bare et konstruert eksempel', () => {
    const real = readFileSync(join(import.meta.dir, '..', 'RELEASE.md'), 'utf8');
    const entries = parseReleaseNotes(real);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.sections.length).toBeGreaterThan(0);
      // En kategori uten punkter betyr som regel at formatet har glidd.
      for (const section of entry.sections) expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('tåler en tom eller ødelagt fil framfor å kaste', () => {
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes('bare løs tekst uten overskrifter')).toEqual([]);
  });
});
