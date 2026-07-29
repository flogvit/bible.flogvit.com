// Vakt mot #18/#33-klassen i KLIENT-ØYENE.
//
// `link-prefix.test.ts` rendrer SSR-HTML og ser derfor bare lenkene serveren
// skriver. Lenkene øyene i `public/js/` bygger i nettleseren var usynlige for
// den — og alle 20+ av dem manglet språkprefiks, så en leser på /en/ ble kastet
// til den FORHANDLEDE locale-en ved første klikk fra forsiden, søket,
// hurtigmenyen, tastatursnarveiene og offline-leseren.
//
// Vakta er en TEKSTSJEKK, ikke en DOM-test, nettopp fordi det er en klasse:
// den gjelder umiddelbart for hver nye øy og hver nye lenke, uten at noen må
// huske å skrive en test for den.

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const JS_DIR = join(import.meta.dir, '..', 'public', 'js');

/** Tilordninger til `.href` med en litteral intern sti. */
const HREF_ASSIGN = /(\w[\w.]*)\.href\s*=\s*(`\/[^`]*`|'\/[^']*'|"\/[^"]*")/g;

/** Uprefiksede stier som SKAL være det (samme unntak som `lhref` på serveren). */
const EXEMPT = /^\/(js|css|api|img|fonts)\//;

function islandFiles(): string[] {
  return readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort();
}

describe('klient-øyene', () => {
  it('bygger ingen interne lenker uten språkprefiks', () => {
    const offenders: string[] = [];

    for (const file of islandFiles()) {
      const source = readFileSync(join(JS_DIR, file), 'utf8');
      source.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(HREF_ASSIGN)) {
          const path = m[2]!.slice(1, -1);
          if (EXEMPT.test(path)) continue;
          offenders.push(`${file}:${i + 1} — ${m[0]!.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('importerer localeHref i hver øy som setter .href', () => {
    const offenders: string[] = [];

    for (const file of islandFiles()) {
      const source = readFileSync(join(JS_DIR, file), 'utf8');
      // Bare øyer som FAKTISK bygger lenker må importere hjelperen; en øy uten
      // lenker skal ikke tvinges til en ubrukt import.
      if (!/\.href\s*=\s*localeHref\(/.test(source)) continue;
      if (!/import\s*\{[^}]*\blocaleHref\b[^}]*\}\s*from\s*'\.\/locale\.js'/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('localeHref lar statiske stier og eksterne URL-er være i fred', async () => {
    // Selve hjelperen: unntakene er en del av kontrakten, ikke en detalj.
    const source = readFileSync(join(JS_DIR, 'locale.js'), 'utf8');
    expect(source).toContain('/^\\/(js|css|api|img|fonts)\\//');
    expect(source).toMatch(/if \(!path \|\| !path\.startsWith\('\/'\)/);
  });
});
