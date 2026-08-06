// En minimal CDP-klient: nok til å måle LAYOUT i en ekte nettleser.
//
// Hvorfor ikke Playwright/Puppeteer: minimal-deps-regelen. Alt vi trenger er å
// starte Chrome, sette et viewport og kjøre et uttrykk — og Bun har allerede
// både prosess-spawning og WebSocket innebygd. Det er ~100 linjer mot et
// avhengighetstre på flere hundre pakker i deploy-porten vår.
//
// Chrome finnes ikke overalt. Den SKAL feile høyt om den mangler: en
// layout-vakt som stille hopper over seg selv er ingen vakt.
//
// Ett unntak fra «feil høyt», og det er en AVVEINING, ikke et flagg (#85):
// Chromes EGEN sandkasse får ikke starte under profilen en ubetjent
// agentkjøring ligger i. Nettleseren starter, DevTools-endepunktet svarer, men
// rendrerprosessen kommer aldri opp — og `Page.enable` går på tidsavbrudd etter
// 30 s. Porten kunne da ikke skille «layouten er brutt» fra «nettleseren fikk
// ikke starte»: begge var rødt, og et menneske måtte lese stacktracen.
//
// Vi starter derfor på nytt med `--no-sandbox`, og sier det høyt. Det er en
// annen avveining enn å slå sandkassen av for en LESER: denne nettleseren
// starter på `about:blank`, laster bare våre egne bytes fra en localhost-server
// vi selv nettopp startet, kjører bare uttrykk vi selv skriver, og lever i
// sekunder i en testprosess. Angrepsflaten sandkassen verner mot — fiendtlig
// innhold fra nettet — finnes ikke her.
//
// Alt ANNET som feiler er fortsatt en ekte feil. Ser du «CDP-tidsavbrudd» nå,
// er det ikke sandkassen: den navngir seg selv.

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[];

async function findChrome(): Promise<string> {
  for (const p of CANDIDATES) {
    if (await Bun.file(p).exists()) return p;
  }
  throw new Error(
    `Fant ingen Chrome for layout-vakten. Prøvde:\n  ${CANDIDATES.join('\n  ')}\n` +
      'Sett CHROME_BIN til en Chrome/Chromium-binær.',
  );
}

export interface Viewport {
  width: number;
  height: number;
  /**
   * Emuler en telefon. Standard er `true` — layout-vakta måler mobil.
   * Delekortet er en fast 1200x630-flate uten `<meta viewport>`, og der ville
   * mobil-emuleringen lagt på et 980 px standardviewport i stedet.
   */
  mobile?: boolean;
}

/**
 * Kjenner Chrome igjen når dens EGEN sandkasse ikke lot seg starte.
 *
 * Begge linjene er ordrett Chromes egne, og de kommer FØR DevTools-adressen —
 * altså mens stderr uansett leses for å finne den. Regelen er formulert på
 * initialiseringen, ikke på ordet «sandbox» alene: en oppstart MED
 * `--no-sandbox` sier ingenting av dette, og kjente vi den igjen som en feil,
 * ville forsøk nummer to blitt meldt som mislykket selv om det virket.
 */
export function isSandboxInitFailure(stderr: string): boolean {
  return /sandbox initialization failed|failed to initialize sandbox/i.test(stderr);
}

const SANDBOX_WARNING =
  '⚠︎ Chromes egen sandkasse fikk ikke starte under denne profilen — rendreren kom aldri opp.\n' +
  '  Måler layouten på nytt med --no-sandbox. Nettleseren laster bare våre egne bytes fra\n' +
  '  localhost og lever i sekunder i denne testprosessen, så den avveiningen er tatt (#85).';

/** Utfallet av ETT forsøk på å starte nettleseren. */
export type LaunchAttempt<T> = { chrome: T } | { sandboxBroken: true };

/**
 * Prøv med sandkasse, og bare ved en SANDKASSEFEIL på nytt uten.
 *
 * Alt annet — en Chrome som ikke finnes, et tidsavbrudd med en annen årsak, en
 * WebSocket som ikke kobler — bæres videre uendret. Det er hele poenget med
 * saken: porten skal kunne skille de to tilstandene, ikke gjøre begge grønne.
 */
export async function launchWithSandboxFallback<T>(
  attempt: (noSandbox: boolean) => Promise<LaunchAttempt<T>>,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): Promise<T> {
  const first = await attempt(false);
  if ('chrome' in first) return first.chrome;

  warn(SANDBOX_WARNING);
  const second = await attempt(true);
  if ('chrome' in second) return second.chrome;

  throw new Error(
    'Chrome fikk aldri opp en rendrerprosess, heller ikke med --no-sandbox. ' +
      'Da er dette ikke sandkassen, og layout-vakta har ingen nettleser å måle i.',
  );
}

/**
 * Hvor lenge helsesjekken venter på at rendreren kommer opp.
 *
 * Kort med vilje: den skal ikke være et nytt 30-sekunders tidsavbrudd. I den
 * kjente feilen svarer stderr uansett først, så fristen brukes bare hvis
 * rendreren blir borte uten å si hvorfor.
 */
const RENDERER_PROBE_MS = 10_000;

export class Chrome {
  private constructor(
    private proc: Bun.Subprocess,
    private ws: WebSocket,
    private userDataDir: string,
    /** Måler vi UTEN Chromes egen sandkasse? Se `SANDBOX_WARNING` og #85. */
    readonly sandboxDisabled: boolean,
  ) {}

  private nextId = 0;
  private pending = new Map<number, (msg: any) => void>();

  static launch(): Promise<Chrome> {
    return launchWithSandboxFallback((noSandbox) => Chrome.attemptLaunch(noSandbox));
  }

  private static async attemptLaunch(noSandbox: boolean): Promise<LaunchAttempt<Chrome>> {
    const bin = await findChrome();
    const userDataDir = `${process.env.TMPDIR ?? '/tmp'}/bibel-layout-${process.pid}-${Bun.nanoseconds()}`;
    const proc = Bun.spawn(
      [
        bin,
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        // Overlay-scrollbarer: uten dette stjeler en klassisk scrollbar 15 px
        // av clientWidth, og målingen ville vært systematisk feil.
        '--hide-scrollbars',
        ...(noSandbox ? ['--no-sandbox'] : []),
        'about:blank',
      ],
      { stdout: 'ignore', stderr: 'pipe' },
    );

    const stderr = new StderrWatcher(proc);
    const wsUrl = await stderr.devToolsUrl();
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error(`Fikk ikke koblet til Chrome på ${wsUrl}`));
    });

    const chrome = new Chrome(proc, ws, userDataDir, noSandbox);
    ws.onmessage = (e) => chrome.onMessage(String(e.data));

    // DevTools-endepunktet svarer selv om rendreren er død — `Target.createTarget`
    // og `Target.attachToTarget` gir svar, og det er `Page.enable` som blir
    // stående. Derfor spør vi ETTER en rendrer før vi lover en nettleser.
    let probeError: unknown;
    const probe = chrome.probeRenderer().then(
      () => 'oppe' as const,
      (err) => {
        probeError = err;
        return 'nede' as const;
      },
    );
    const utfall = await Promise.race([probe, stderr.sandboxFailed.then(() => 'sandkasse' as const)]);

    if (utfall === 'oppe') return { chrome };
    await chrome.close();
    if (utfall === 'sandkasse' || stderr.sawSandboxFailure) return { sandboxBroken: true };
    throw probeError;
  }

  /** Kommer rendreren opp i det hele tatt? Samme tre kallene som `open()`. */
  private async probeRenderer(): Promise<void> {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' }, undefined, RENDERER_PROBE_MS);
    const { sessionId } = await this.send(
      'Target.attachToTarget',
      { targetId, flatten: true },
      undefined,
      RENDERER_PROBE_MS,
    );
    await this.send('Page.enable', {}, sessionId, RENDERER_PROBE_MS);
    await this.send('Target.closeTarget', { targetId }, sessionId, RENDERER_PROBE_MS).catch(() => {});
  }

  private onMessage(raw: string) {
    const msg = JSON.parse(raw);
    if (msg.id !== undefined) {
      this.pending.get(msg.id)?.(msg);
      this.pending.delete(msg.id);
    }
  }

  private send(method: string, params: unknown = {}, sessionId?: string, timeoutMs = 30_000): Promise<any> {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`CDP-tidsavbrudd: ${method}`)), timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) rej(new Error(`CDP ${method}: ${msg.error.message}`));
        else res(msg.result);
      });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  /** Åpner en side og gir en håndtak til den. Lukk den med `page.close()`. */
  async open(url: string): Promise<Page> {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Page.enable', {}, sessionId);
    const page = new Page(this, sessionId, targetId);
    await page.navigate(url);
    return page;
  }

  /** @internal */
  async call(method: string, params: unknown, sessionId: string) {
    return this.send(method, params, sessionId);
  }

  async close() {
    try {
      this.ws.close();
    } catch {}
    this.proc.kill();
    // Chrome bruker av og til flere sekunder på å avslutte. Opprydding er ikke
    // verdt en flaky test: venter vi i det uendelige, er det teardown-en som
    // ryker, ikke noe som betyr noe.
    await Promise.race([this.proc.exited, Bun.sleep(3000)]);
    await Bun.$`rm -rf ${this.userDataDir}`.quiet().nothrow();
  }
}

export class Page {
  constructor(
    private chrome: Chrome,
    private sessionId: string,
    private targetId: string,
  ) {}

  /**
   * Navigerer og venter til dokumentet STÅR STILLE — ikke bare til det er
   * lastet.
   *
   * To feller ligger her. `Page.loadEventFired` sier ikke HVILKEN navigasjon
   * det gjaldt, så et load fra forrige side kan kvittere ut denne. Og appen
   * laster seg selv på nytt av seg selv: `pwa.js` kaller `location.reload()`
   * når service workeren tar over, altså rett etter første load. Måler man i
   * det vinduet, svarer Chrome «Inspected target navigated or closed» — eller,
   * verre, man måler et dokument som er på vei ut.
   *
   * Derfor: vent til `complete`, sett et merke i vinduet, og sjekk at merket
   * fortsatt er der en beat senere. Overlevde det, er dette dokumentet det vi
   * faktisk måler.
   */
  async navigate(url: string) {
    await this.chrome.call('Page.navigate', { url }, this.sessionId);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        if ((await this.evaluate(() => document.readyState)) !== 'complete') {
          await Bun.sleep(25);
          continue;
        }
        await this.evaluate(() => {
          (window as unknown as Record<string, unknown>).__layoutProbe = 1;
        });
        await Bun.sleep(150);
        if (await this.evaluate(() => (window as unknown as Record<string, unknown>).__layoutProbe === 1)) return;
      } catch {
        // dokumentet byttes akkurat nå — prøv igjen
      }
      await Bun.sleep(25);
    }
    throw new Error(`Siden ble aldri stabil: ${url}`);
  }

  async setViewport({ width, height, mobile = true }: Viewport) {
    await this.chrome.call(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile },
      this.sessionId,
    );
    // Overstyringen slår inn i renderer-prosessen, ikke synkront med
    // CDP-svaret. Måler man med én gang, kan `clientWidth` være det nye tallet
    // mens layouten fortsatt er den gamle — og da måler man et viewport som
    // aldri fantes. To animasjonsrammer er nok til at reflowen er ferdig.
    await this.evaluate(
      () =>
        new Promise<void>((res) => {
          requestAnimationFrame(() => requestAnimationFrame(() => res()));
        }),
    );
  }

  /** Kjører `fn` i siden og gir tilbake returverdien (må være JSON-bar). */
  async evaluate<T, A extends unknown[]>(fn: (...args: A) => T, ...args: A): Promise<T> {
    const expression = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    const res = await this.chrome.call(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      this.sessionId,
    );
    if (res.exceptionDetails) {
      throw new Error(`Feil i sidekonteksten: ${res.exceptionDetails.exception?.description ?? ''}`);
    }
    return res.result.value as T;
  }

  /**
   * PNG-bytene av viewportet. Brukes av `scripts/generate-og-card.ts` til å
   * rastrere delekortet (#65) — en skraper viser et bilde eller ingenting, så
   * wordmarken må finnes som piksler ett sted.
   *
   * `captureBeyondViewport: false` er poenget: kortet skal være NØYAKTIG
   * viewportet, ikke dokumentets fulle høyde. Deklarerer vi 1200x630 og
   * leverer noe annet, beskriver taggene et bilde som ikke finnes.
   */
  async screenshot(): Promise<Uint8Array> {
    const { data } = await this.chrome.call(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false },
      this.sessionId,
    );
    return Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  }

  async close() {
    await this.chrome.call('Target.closeTarget', { targetId: this.targetId }, this.sessionId).catch(() => {});
  }
}

/**
 * Leser Chromes stderr HELE veien, ikke bare til DevTools-adressen dukker opp.
 *
 * Den gamle utgaven slapp taket idet adressen var funnet, og da var linja som
 * forklarer hvorfor rendreren aldri kom opp (#85) noe ingen leste — selv om den
 * sto der, ett hakk lenger opp i den samme strømmen.
 */
class StderrWatcher {
  /** Halen av det Chrome har sagt. Nok til å lete i, uten å vokse i det uendelige. */
  private tail = '';
  private waiters: Array<() => void> = [];
  sawSandboxFailure = false;
  private signalSandbox!: () => void;
  /** Løser seg NÅR sandkassen melder at den ikke lot seg starte — aldri ellers. */
  readonly sandboxFailed = new Promise<void>((res) => {
    this.signalSandbox = res;
  });

  constructor(proc: Bun.Subprocess) {
    void this.pump(proc);
  }

  private async pump(proc: Bun.Subprocess) {
    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.tail = (this.tail + dec.decode(value, { stream: true })).slice(-65_536);
        if (!this.sawSandboxFailure && isSandboxInitFailure(this.tail)) {
          this.sawSandboxFailure = true;
          this.signalSandbox();
        }
        for (const w of this.waiters.splice(0)) w();
      }
    } catch {
      // Prosessen er borte; fristene under gir feilmeldingen.
    }
    for (const w of this.waiters.splice(0)) w();
  }

  async devToolsUrl(): Promise<string> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const m = this.tail.match(/ws:\/\/\S+/);
      if (m) return m[0];
      if (Date.now() >= deadline) break;
      await Promise.race([new Promise<void>((res) => this.waiters.push(res)), Bun.sleep(100)]);
    }
    throw new Error(`Chrome annonserte aldri en DevTools-adresse. stderr:\n${this.tail}`);
  }
}
