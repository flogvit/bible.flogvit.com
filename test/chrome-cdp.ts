// En minimal CDP-klient: nok til å måle LAYOUT i en ekte nettleser.
//
// Hvorfor ikke Playwright/Puppeteer: minimal-deps-regelen. Alt vi trenger er å
// starte Chrome, sette et viewport og kjøre et uttrykk — og Bun har allerede
// både prosess-spawning og WebSocket innebygd. Det er ~100 linjer mot et
// avhengighetstre på flere hundre pakker i deploy-porten vår.
//
// Chrome finnes ikke overalt. Den SKAL feile høyt om den mangler: en
// layout-vakt som stille hopper over seg selv er ingen vakt.

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
}

export class Chrome {
  private constructor(
    private proc: Bun.Subprocess,
    private ws: WebSocket,
    private userDataDir: string,
  ) {}

  private nextId = 0;
  private pending = new Map<number, (msg: any) => void>();

  static async launch(): Promise<Chrome> {
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
        'about:blank',
      ],
      { stdout: 'ignore', stderr: 'pipe' },
    );

    const wsUrl = await readDevToolsUrl(proc);
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error(`Fikk ikke koblet til Chrome på ${wsUrl}`));
    });

    const chrome = new Chrome(proc, ws, userDataDir);
    ws.onmessage = (e) => chrome.onMessage(String(e.data));
    return chrome;
  }

  private onMessage(raw: string) {
    const msg = JSON.parse(raw);
    if (msg.id !== undefined) {
      this.pending.get(msg.id)?.(msg);
      this.pending.delete(msg.id);
    }
  }

  private send(method: string, params: unknown = {}, sessionId?: string): Promise<any> {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`CDP-tidsavbrudd: ${method}`)), 30_000);
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

  async setViewport({ width, height }: Viewport) {
    await this.chrome.call(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: true },
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

  async close() {
    await this.chrome.call('Target.closeTarget', { targetId: this.targetId }, this.sessionId).catch(() => {});
  }
}

async function readDevToolsUrl(proc: Bun.Subprocess): Promise<string> {
  const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const m = buf.match(/ws:\/\/\S+/);
    if (m) {
      reader.releaseLock();
      return m[0];
    }
  }
  throw new Error(`Chrome annonserte aldri en DevTools-adresse. stderr:\n${buf}`);
}
