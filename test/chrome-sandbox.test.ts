/**
 * VAKT: porten skiller «layouten er brutt» fra «nettleseren fikk ikke starte» (#85).
 *
 * Chromes EGEN sandkasse — den som isolerer rendrerprosessen — får ikke starte
 * under profilen en ubetjent agentkjøring ligger i:
 *
 *     sandbox initialization failed: Operation not permitted
 *     Failed to initialize sandbox.
 *
 * Nettleseren starter, DevTools-endepunktet svarer, men rendreren kommer aldri
 * opp — og `Page.enable` går på tidsavbrudd etter 30 s. `bun run test` ble
 * dermed rødt (818 pass, 3 fail) uansett hva branchen endret, og det er
 * merge-porten. Rødt i de tre Chrome-vaktene betydde altså ingenting.
 *
 * Vakta er formulert på UTFALLET, ikke på miljøet: `Chrome.launch()` skal gi en
 * nettleser som MÅLER, enten sandkassen virker eller ikke — og faller den
 * tilbake, skal den si det høyt. Den består derfor både hjemme hos Vegard (der
 * sandkassen starter) og i en ubetjent kjøring (der den ikke gjør det), og den
 * er rød begge steder hvis fallbacken forsvinner.
 *
 * Fire halvdeler:
 *   REGELEN          — linja i stderr kjennes igjen, og bare den.
 *   ORKESTRERINGEN   — retten til å prøve igjen gjelder BARE sandkassen.
 *   FLATA            — en ekte Chrome måler, og sier fra når den måler uten.
 *   INGEN STILLE SKIP— en vakt som hopper over seg selv er ingen vakt.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Chrome, isSandboxInitFailure, launchWithSandboxFallback } from './chrome-cdp.ts';

const ROOT = resolve(import.meta.dir, '..');

// Ordrett fra en ubetjent kjøring 2026-08-06 (Chrome 151.0.7922.72, macOS
// 25.6.0). Linjene kommer FØR DevTools-adressen, som er hvorfor de kan leses
// av den samme stderr-lesingen som alt finner adressen.
const STDERR_BRUTT_SANDKASSE = `sandbox initialization failed: Operation not permitted
Failed to initialize sandbox.sandbox initialization failed: Operation not permitted
Failed to initialize sandbox.Failed to initialize sandbox.

DevTools listening on ws://127.0.0.1:62589/devtools/browser/5bfcaf98-a31c-4aea-8729-499dba0b0220
[18133:16039883:0806/193330.088824:ERROR:content/browser/gpu/gpu_process_host.cc:1035] GPU process exited unexpectedly: exit_code=6
`;

// Samme maskin, samme flagg, bare `--no-sandbox` i tillegg. Den er den viktige
// av de to: kjente vi den igjen som «sandkassen feilet», ville forsøk nummer to
// blitt meldt som en feil selv om nettleseren virket.
const STDERR_UTEN_SANDKASSE = `
DevTools listening on ws://127.0.0.1:62614/devtools/browser/717210af-7375-4606-a679-26222c94f9bf
Trying to load the allocator multiple times. This is *not* supported.
`;

describe('REGELEN: linja i stderr kjennes igjen (#85)', () => {
  test('en sandkasse som ikke lot seg starte', () => {
    expect(isSandboxInitFailure(STDERR_BRUTT_SANDKASSE)).toBe(true);
  });

  test('en normal oppstart er ikke en sandkassefeil', () => {
    expect(isSandboxInitFailure(STDERR_UTEN_SANDKASSE)).toBe(false);
  });

  test('annen støy fra Chrome er heller ikke det', () => {
    expect(
      isSandboxInitFailure(
        '[1:2:0806/193330.804591:ERROR:content/browser/gpu/gpu_process_host.cc:1035] GPU process exited unexpectedly: exit_code=6\n' +
          'Network service crashed or was terminated, restarting service.\n',
      ),
    ).toBe(false);
  });

  // Chromes egen advarsel om flagget vi selv nettopp satte. Kjente vi den igjen,
  // ville forsøk nummer to blitt meldt som en sandkassefeil, og vakta stått
  // igjen med «fikk aldri opp en rendrer» der alt faktisk virket.
  test('advarselen om selve flagget er ikke en sandkassefeil', () => {
    expect(
      isSandboxInitFailure(
        'You are using an unsupported command-line flag: --no-sandbox. Stability and security will suffer.\n',
      ),
    ).toBe(false);
  });
});

describe('ORKESTRERINGEN: retten til å prøve igjen gjelder BARE sandkassen (#85)', () => {
  test('virker sandkassen, startes Chrome én gang og i stillhet', async () => {
    const forsøk: boolean[] = [];
    const sagt: string[] = [];
    const ut = await launchWithSandboxFallback(async (utenSandkasse) => {
      forsøk.push(utenSandkasse);
      return { chrome: 'nettleser' };
    }, sagt.push.bind(sagt));

    expect(ut).toBe('nettleser');
    expect(forsøk).toEqual([false]);
    expect(sagt).toEqual([]);
  });

  test('feilet sandkassen, startes den på nytt UTEN den — og det sies høyt', async () => {
    const forsøk: boolean[] = [];
    const sagt: string[] = [];
    const ut = await launchWithSandboxFallback(async (utenSandkasse) => {
      forsøk.push(utenSandkasse);
      return utenSandkasse ? { chrome: 'nettleser' } : { sandboxBroken: true as const };
    }, sagt.push.bind(sagt));

    expect(ut).toBe('nettleser');
    expect(forsøk).toEqual([false, true]);
    // Linja må navngi både sandkassen og at målingen skjer uten den — ellers er
    // den ikke til å skille fra vanlig støy i en 800-tester-lang logg.
    expect(sagt).toHaveLength(1);
    expect(sagt[0]).toMatch(/sandkasse/i);
    expect(sagt[0]).toContain('--no-sandbox');
  });

  test('EN ANNEN feil er en ekte feil: den bæres videre, uten nytt forsøk', async () => {
    const forsøk: boolean[] = [];
    const sagt: string[] = [];
    const kall = launchWithSandboxFallback(async (utenSandkasse) => {
      forsøk.push(utenSandkasse);
      throw new Error('CDP-tidsavbrudd: Page.enable');
    }, sagt.push.bind(sagt));

    expect(kall).rejects.toThrow('CDP-tidsavbrudd: Page.enable');
    await kall.catch(() => {});
    expect(forsøk).toEqual([false]);
    expect(sagt).toEqual([]);
  });

  test('går det ikke UTEN sandkasse heller, feiler det høyt', async () => {
    const forsøk: boolean[] = [];
    const kall = launchWithSandboxFallback(
      async (utenSandkasse) => {
        forsøk.push(utenSandkasse);
        return { sandboxBroken: true as const };
      },
      () => {},
    );

    expect(kall).rejects.toThrow(/--no-sandbox/);
    await kall.catch(() => {});
    expect(forsøk).toEqual([false, true]);
  });
});

describe('FLATA: en ekte Chrome måler, uansett hva sandkassen får lov til (#85)', () => {
  test(
    'launch() gir en nettleser som svarer — og sier fra om den måler uten sandkasse',
    async () => {
      const sagt: string[] = [];
      const orig = console.warn;
      console.warn = (...a: unknown[]) => void sagt.push(a.join(' '));
      let chrome: Chrome;
      try {
        chrome = await Chrome.launch();
      } finally {
        console.warn = orig;
      }

      try {
        const page = await chrome.open('about:blank');
        expect(await page.evaluate(() => 1 + 1)).toBe(2);
        // Det er dette de tre layout-vaktene faktisk gjør: rendreren MÅ være
        // oppe for at et mål skal finnes. Uten fallbacken er dette tidsavbrudd.
        expect(await page.evaluate(() => document.documentElement.clientWidth)).toBeGreaterThan(0);
        await page.close();

        // Avveiningen skal være synlig der den tas, ikke ramle ut av et flagg.
        if (chrome.sandboxDisabled) {
          expect(sagt.join('\n')).toMatch(/sandkasse/i);
        } else {
          expect(sagt.join('\n')).not.toMatch(/sandkasse/i);
        }
      } finally {
        await chrome.close();
      }
    },
    90_000,
  );
});

describe('INGEN STILLE SKIP: en vakt som hopper over seg selv er ingen vakt (#85)', () => {
  // Den enkle «fiksen» på denne saken er å la de tre suitene hoppe over seg
  // selv når Chrome ikke starter. Da står #50, #55, #70, #73 og #78 uten port,
  // og suiten melder grønt for en layout ingen har målt.
  const VAKTFILER = [
    'test/mobile-layout.test.ts',
    'test/reading-width.test.ts',
    'test/key-event-promise.test.ts',
    'test/chrome-cdp.ts',
    'test/chrome-sandbox.test.ts',
  ];

  test.each(VAKTFILER)('%s hopper ikke over seg selv', (fil) => {
    const src = readFileSync(resolve(ROOT, fil), 'utf8');
    const funn = [...src.matchAll(/\b(?:test|it|describe)\.(skip|skipIf|todo|if)\b/g)].map((m) => m[0]);
    expect(funn).toEqual([]);
  });
});
