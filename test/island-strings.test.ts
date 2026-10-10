// Vakt mot norsk tekst i KLIENT-ØYENE.
//
// `page-contract.test.ts` sveiper sidene under `/en/` og fanger norsk i
// SSR-HTML. Den kunne ikke se øyene i `public/js/`, som bygger DOM i
// nettleseren — og der lå ~90 norske strenger: hele kommandopaletten,
// plus-CTA-en, PWA-banneret, offline-nedlastingen, favorittknappen. Alle var
// norske på alle åtte språk (#33).
//
// Vakta ser bare på STRENGLITTERALER i kode. Kommentarene i dette repoet er
// norske med vilje og strippes derfor først.

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_ISLAND_KEYS, islandKeysFor } from '../src/views/layout.tsx';

const JS_DIR = join(import.meta.dir, '..', 'public', 'js');

/**
 * Ord som avslører norsk uten å kreve æ/ø/å. Sjekkes som hele ord, slik at
 * f.eks. «i» i en engelsk streng ikke slår ut.
 */
const NORWEGIAN_WORDS = [
  'ikke', 'kan', 'ingen', 'eller', 'som', 'med', 'til', 'fra', 'ved', 'over',
  'dette', 'denne', 'din', 'ditt', 'deg', 'kunne', 'vers', 'kapittel', 'kapitler',
  'lastet', 'laster', 'nedlasting', 'oversettelse', 'oversettelser', 'emne', 'emner',
  'favoritt', 'notater', 'manuskripter', 'leseplan', 'tittel', 'funnet', 'krever',
  'slette', 'advarsler', 'lagringsplass', 'brukt', 'egen', 'tidslinje', 'profetier',
  'personer', 'leseplaner',
];

const WORD_RE = new RegExp(`\\b(${NORWEGIAN_WORDS.join('|')})\\b`, 'i');
const NORDIC_RE = /[æøåÆØÅ]/;

/** Kommentarer og regex-litteraler bort; bare kode igjen. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** Strenglitteraler: '…', "…" og `…` (uten interpolasjonsuttrykkene). */
function stringLiterals(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    // `${…}` er kode, ikke tekst.
    out.push(value.replace(/\$\{[^}]*\}/g, ' '));
  }
  return out;
}

/**
 * Steder der en strengliteral ER brukersynlig tekst.
 *
 * Dette er hovedvakta, og den er STRUKTURELL framfor språklig: en ordliste
 * fanger «Søk» og «nedlasting», men ikke «Senere» — den mutasjonen slapp
 * gjennom første utgave av testen. Sjekker vi i stedet HVOR strengen havner,
 * spiller det ingen rolle hvilket språk den er på.
 */
const VISIBLE_TEXT = [
  /\.textContent\s*=\s*('[^'\n]+'|"[^"\n]+")/g,
  /\.(?:title|placeholder|innerText)\s*=\s*('[^'\n]+'|"[^"\n]+")/g,
  /setAttribute\(\s*'(?:aria-label|title|placeholder)'\s*,\s*('[^'\n]+'|"[^"\n]+")/g,
  /\bel\([^,)]+,[^,)]+,\s*('[^'\n]+'|"[^"\n]+"|`[^`\n]+`)/g,
  // En dialog er like synlig som en node (#139).
  /\b(?:confirm|alert|prompt)\(\s*('[^'\n]+'|"[^"\n]+"|`[^`\n]+`)/g,
];

/**
 * Tegn som ikke er tekst å oversette: symbolknapper (×, ✕), ikoner og
 * tastatursymboler. En streng UTEN bokstaver trenger ingen ordbok.
 */
const HAS_LETTERS = /\p{Letter}{2,}/u;

describe('klient-øyene', () => {
  it('setter ingen brukersynlig tekst fra en strengliteral', () => {
    const offenders: string[] = [];

    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
      const code = stripComments(readFileSync(join(JS_DIR, file), 'utf8'));
      code.split('\n').forEach((line, i) => {
        for (const re of VISIBLE_TEXT) {
          for (const m of line.matchAll(re)) {
            // `${…}` er kode; bare teksten rundt teller.
            const value = m[1]!.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
            if (!HAS_LETTERS.test(value)) continue;
            offenders.push(`${file}:${i + 1} — ${m[0]!.trim()}`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('har ingen norsk tekst i strenglitteraler', () => {
    const offenders: string[] = [];

    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
      const code = stripComments(readFileSync(join(JS_DIR, file), 'utf8'));
      code.split('\n').forEach((line, i) => {
        for (const s of stringLiterals(line)) {
          const value = s.trim();
          if (value.length < 3) continue;
          // URL-stier og CSS-selektorer er DATA, ikke tekst. Rutesluggene er
          // norske med vilje (`/lesetekster`), og de oversettes ikke.
          if (/^[/.#[]/.test(value) || /^[a-z-]+\.js$/.test(value)) continue;
          // Attributt-selektorer (`a[href="/manuskripter/ny"]`) er også data.
          if (/\[[a-z-]+[~^$*|]?=/.test(value)) continue;
          if (NORDIC_RE.test(value) || WORD_RE.test(value)) offenders.push(`${file}:${i + 1} — «${value}»`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  // Et objekt som rendres med `Object.entries()` gjør NØKKELEN til tekst, og en
  // nøkkel er ingen strengliteral — «Tidslinje» i offline.js gikk forbi begge
  // sveipene over (#139). En nøkkel med stor forbokstav i en øy er et
  // visningsnavn, ikke et feltnavn.
  it('bruker ingen objektnøkkel som visningstekst', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
      const code = stripComments(readFileSync(join(JS_DIR, file), 'utf8'));
      code.split('\n').forEach((line, i) => {
        const m = line.match(/^\s*([A-ZÆØÅ][\p{Letter}]+)\s*:\s/u);
        // `KeyH` er en KeyboardEvent.code, ikke tekst.
        if (m && !/^(?:Key|Digit)[A-Z0-9]$/.test(m[1]!)) offenders.push(`${file}:${i + 1} — ${m[1]}:`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

// `readStrings()` gir NØKKELEN tilbake når den mangler, så en nøkkel øya bruker
// men siden aldri leverte vises som «is.supportData» — uten å feile noe sted
// (#139). Ordboka hadde nøklene; det var `PAGE_ISLAND_KEYS` som ikke sendte dem.
describe('nøklene øyene bruker', () => {
  const BODY_READER = /\bconst t = readStrings\(document\.body\)/;
  const files = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
  const source = (f: string) => readFileSync(join(JS_DIR, f), 'utf8');
  const keysIn = (f: string) =>
    new Set([...stripComments(source(f)).matchAll(/\bt\(\s*'([\w.]+)'/g)].map((m) => m[1]!));
  const importsOf = (f: string) =>
    [...source(f).matchAll(/from\s+'\.\/([\w.-]+\.js)'/g)].map((m) => m[1]!);

  /** Modulene en side-øy drar inn, og som leser strengene fra <body> selv. */
  function bodyReadersReachedFrom(start: string): string[] {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f) || !files.includes(f)) continue;
      seen.add(f);
      queue.push(...importsOf(f));
    }
    return [...seen].filter((f) => BODY_READER.test(source(f)));
  }

  it('leveres til hver side som laster øya', () => {
    const missing: string[] = [];
    for (const page of Object.keys(PAGE_ISLAND_KEYS).sort()) {
      const delivered = new Set<string>(islandKeysFor([page]));
      for (const f of bodyReadersReachedFrom(page)) {
        for (const k of keysIn(f)) if (!delivered.has(k)) missing.push(`${page} → ${f}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('måler noe', () => {
    // Uten treff ville sveipen over vært grønn av ingenting.
    const reached = Object.keys(PAGE_ISLAND_KEYS).flatMap((p) => bodyReadersReachedFrom(p));
    expect(reached).toContain('offline.js');
    expect(reached).toContain('translations.js');
    expect(reached).toContain('user-bibles.js');
    expect(keysIn('offline.js').size).toBeGreaterThan(5);
  });
});

