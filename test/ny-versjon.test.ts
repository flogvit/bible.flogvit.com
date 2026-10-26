// «Ny versjon er lagt ut» — en åpen fane får vite om en deploy (#161,
// flogvit-com#339, kontrakten er portal/VERSJON.md).
//
// Skriptets oppførsel (linja, «Senere», ulagret input, 320 px × 150 % tekst)
// testes ÉN gang, i portalens ekte-Chrome-test. En kopi som er lik byte for
// byte, oppfører seg likt. Her holdes resten, i fem halvdeler:
//
//   KOPIEN      public/js/ny-versjon.js er portalens fil, byte for byte.
//   BYGG-ID-EN  samme filer gir samme id, én endret klientfil gir en annen,
//               og hver fil layouten laster ligger under det som hashes.
//   SIDENE      hver side (matrisen, /api/docs, uprefikset 404) bærer meta-
//               taggen med samme id som /versjon.json svarer, og skriptet.
//   SW-EN       service workeren svarer aldri /versjon.json selv.
//   PWA-EN      en ventende worker melder seg på felles linje, og siden
//               lastes på nytt BARE etter at leseren har trykket.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { WATCHED, buildId, computeBuildId } from '../src/lib/build-id.ts';
import { PAGES } from './pages.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const ROOT = resolve(import.meta.dir, '..');
const KOPI = resolve(ROOT, 'public/js/ny-versjon.js');

/**
 * portal/ ligger ved siden av bibel-utsjekken (flogvit.com/bibel). Et
 * arbeidstre et annet sted har ingen søsken-portal, så den slås opp ved siden
 * av hovedutsjekken arbeidstreet tilhører — samme oppslag som
 * `family-menu.test.ts`.
 */
function portalDir(): string | null {
  const beside = resolve(ROOT, '../portal');
  if (existsSync(beside)) return beside;
  const git = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT });
  const commonDir = git.stdout.toString().trim();
  if (!commonDir) return null;
  const viaMain = resolve(dirname(dirname(commonDir)), 'portal');
  return existsSync(viaMain) ? viaMain : null;
}

/** Portalens fil slik den er på `origin/main` — ellers den på disken. */
function portalensFil(portal: string): Buffer | null {
  const git = Bun.spawnSync(['git', 'show', 'origin/main:design/ny-versjon.js'], { cwd: portal });
  if (git.exitCode === 0) return Buffer.from(git.stdout);
  const disk = resolve(portal, 'design/ny-versjon.js');
  return existsSync(disk) ? readFileSync(disk) : null;
}

describe('KOPIEN er portalens fil', () => {
  const PORTAL = portalDir();

  test('portal-utsjekken finnes, ellers kan kopien ikke sammenlignes', () => {
    expect(PORTAL).not.toBeNull();
  });

  test('public/js/ny-versjon.js er portal/design/ny-versjon.js, byte for byte', () => {
    const fasit = portalensFil(PORTAL!);
    expect(fasit).not.toBeNull();
    // Som tekst, så et avvik vises som en diff og ikke som to bufferlengder.
    expect(readFileSync(KOPI, 'utf8')).toBe(fasit!.toString('utf8'));
  });
});

describe('BYGG-ID-EN følger klientfilene, og bare dem', () => {
  let dir: string;
  const ENTRIES = ['public/js', 'public/styles.css'];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bibel-build-id-'));
    mkdirSync(join(dir, 'public/js'), { recursive: true });
    writeFileSync(join(dir, 'public/js/a.js'), 'console.log(1);\n');
    writeFileSync(join(dir, 'public/js/b.js'), 'console.log(2);\n');
    writeFileSync(join(dir, 'public/styles.css'), 'body{color:red}\n');
    writeFileSync(join(dir, 'server.ts'), 'export {};\n');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('samme filer gir samme id, og den er 12 heks', () => {
    const a = computeBuildId(dir, ENTRIES);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(computeBuildId(dir, ENTRIES)).toBe(a);
  });

  test('én endret byte i en fil i en overvåket KATALOG gir en annen id', () => {
    const før = computeBuildId(dir, ENTRIES);
    writeFileSync(join(dir, 'public/js/b.js'), 'console.log(3);\n');
    expect(computeBuildId(dir, ENTRIES)).not.toBe(før);
  });

  test('en endret overvåket FIL gir en annen id', () => {
    const før = computeBuildId(dir, ENTRIES);
    writeFileSync(join(dir, 'public/styles.css'), 'body{color:blue}\n');
    expect(computeBuildId(dir, ENTRIES)).not.toBe(før);
  });

  test('en ny fil i en overvåket katalog gir en annen id', () => {
    const før = computeBuildId(dir, ENTRIES);
    writeFileSync(join(dir, 'public/js/c.js'), '');
    expect(computeBuildId(dir, ENTRIES)).not.toBe(før);
  });

  test('serverkode som endres, rører ikke id-en', () => {
    const før = computeBuildId(dir, ENTRIES);
    writeFileSync(join(dir, 'server.ts'), 'export const x = 1;\n');
    expect(computeBuildId(dir, ENTRIES)).toBe(før);
  });

  test('en sti som mangler gir en stabil id, ikke en tilfeldig', () => {
    const tom = mkdtempSync(join(tmpdir(), 'bibel-build-id-tom-'));
    try {
      expect(computeBuildId(tom, WATCHED)).toBe(computeBuildId(tom, WATCHED));
    } finally {
      rmSync(tom, { recursive: true, force: true });
    }
  });

  test('den ekte id-en er den samme som en ny utregning over de ekte filene', () => {
    expect(buildId()).toBe(computeBuildId());
  });
});

describe('SIDENE bærer bygget de ble rendret fra', () => {
  const app = createApp();
  let build = '';

  beforeAll(async () => {
    await initBooks();
    const res = await app.request('/versjon.json');
    build = ((await res.json()) as { build: string }).build;
  });

  test('/versjon.json svarer 200 JSON med no-store, uten språkprefiks', async () => {
    const res = await app.request('/versjon.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ build: buildId() });
    expect(build).toMatch(/^[0-9a-f]{12}$/);
  });

  /** Matrisen fra `pages.ts`, og sidene med eget hode eller egen vei til 404. */
  const SIDER = [
    ...PAGES.map((p) => ({ url: L(p.path), name: p.name, status: p.status ?? 200 })),
    { url: '/api/docs', name: 'API-referansen (eget <head>)', status: 200 },
    { url: '/finnes-ikke.html', name: '404-siden fra catch-allen (uprefikset)', status: 404 },
  ];

  for (const side of SIDER) {
    test(side.name, async () => {
      const res = await app.request(side.url);
      expect({ url: side.url, status: res.status }).toEqual({ url: side.url, status: side.status });
      const html = await res.text();
      const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
      const meta = [...head.matchAll(/<meta name="fv-versjon"([^>]*)>/g)];
      expect(meta.length).toBe(1);
      expect(meta[0]![1]).toContain(`content="${build}"`);
      expect(meta[0]![1]).toContain('data-url="/versjon.json"');
      const script = /<script src="(\/js\/ny-versjon\.js(?:\?v=[0-9a-f]+)?)" defer=""><\/script>/.exec(head);
      expect(script?.[1] ?? `ingen ny-versjon.js i <head> på ${side.url}`).toStartWith('/js/ny-versjon.js');
    });
  }

  test('skriptet serveres på stien sidene ber om', async () => {
    const html = await (await app.request(L('/'))).text();
    const src = /<script src="(\/js\/ny-versjon\.js[^"]*)"/.exec(html)![1]!;
    const res = await app.request(src);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(readFileSync(KOPI, 'utf8'));
  });

  // Id-en er bare ærlig om den dekker det sidene laster. Et nytt stilark eller
  // skript utenfor WATCHED ville endret seg uten at noen fane fikk vite det.
  test('hvert skript og stilark sidene laster ligger under det bygg-id-en hasher', async () => {
    const utenfor = new Set<string>();
    for (const side of SIDER) {
      const html = await (await app.request(side.url)).text();
      for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="(\/[^"?]+\.(?:js|css))(?:\?[^"]*)?"/g)) {
        const fil = `public${m[1]}`;
        if (!WATCHED.some((w) => fil === w || fil.startsWith(`${w}/`))) utenfor.add(fil);
      }
    }
    expect([...utenfor]).toEqual([]);
  });
});

describe('SW-EN svarer aldri /versjon.json selv', () => {
  /** Kjører sw.js mot en falsk `self` og gir tilbake fetch-handleren. */
  function swFetch(): (event: unknown) => void {
    const listeners: Record<string, (e: unknown) => void> = {};
    const self = {
      location: { origin: 'https://bible.flogvit.com' },
      addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
    };
    // En cache som aldri svarer: vi spør bare OM SW-en svarer, ikke hva.
    const caches = { open: () => new Promise(() => {}), match: () => new Promise(() => {}) };
    new Function('self', 'caches', readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8'))(self, caches);
    return listeners.fetch!;
  }

  function svarer(path: string, accept = 'application/json'): boolean {
    let svart = false;
    swFetch()({
      request: { method: 'GET', url: `https://bible.flogvit.com${path}`, mode: 'cors', headers: new Headers({ accept }) },
      respondWith: () => (svart = true),
      waitUntil: () => {},
    });
    return svart;
  }

  test('/versjon.json går rett på nett, også når den ber som en side', () => {
    expect(svarer('/versjon.json')).toBe(false);
    expect(svarer('/versjon.json', 'text/html')).toBe(false);
  });

  // Kontrollen: ellers ville en handler som aldri svarer noe, bestått.
  test('et statisk skript svares fortsatt av SW-en', () => {
    expect(svarer('/js/ny-versjon.js', '*/*')).toBe(true);
  });
});

describe('PWA-EN melder seg på felles linje, og laster bare når leseren ber om det', () => {
  type Lytter = () => void;
  let reloads = 0;
  let meldt: { last: () => void }[] = [];
  let posted: unknown[] = [];
  let controllerchange: Lytter = () => {};

  beforeAll(async () => {
    GlobalRegistrator.register({ url: 'https://bible.flogvit.com/nb/' });
    document.body.setAttribute('data-strings', '{}');
    Object.defineProperty(window.location, 'reload', { configurable: true, value: () => reloads++ });
    const reg = {
      waiting: { postMessage: (m: unknown) => posted.push(m) },
      addEventListener: () => {},
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register: async () => reg,
        addEventListener: (type: string, fn: Lytter) => {
          if (type === 'controllerchange') controllerchange = fn;
        },
      },
    });
    window.addEventListener('fv-ny-versjon', (e) => meldt.push((e as CustomEvent).detail));
    await import(`../public/js/pwa.js?t=${Date.now()}`);
    await Bun.sleep(0);
  });
  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });

  test('en ventende worker melder seg med fv-ny-versjon, ikke med et eget banner', () => {
    expect(meldt.length).toBe(1);
    expect(typeof meldt[0]!.last).toBe('function');
    expect(document.querySelector('.pwa-update')).toBeNull();
  });

  test('en worker som tar over UTEN at leseren ba om det, laster ikke siden', () => {
    controllerchange();
    expect(reloads).toBe(0);
  });

  test('knappen tar den ventende workeren i bruk, og DA lastes siden', () => {
    meldt[0]!.last();
    expect(posted).toEqual([{ type: 'SKIP_WAITING' }]);
    controllerchange();
    expect(reloads).toBe(1);
  });
});
