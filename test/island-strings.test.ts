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
  /\bel\([^,)]+,[^,)]+,\s*('[^'\n]+'|"[^"\n]+")/g,
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
            const value = m[1]!.slice(1, -1);
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
});
