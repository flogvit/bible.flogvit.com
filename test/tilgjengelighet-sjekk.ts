/* FLOGVIT — WCAG 2.1 AA-sjekken i hver flates testport (portal/TILGJENGELIGHET.md, flogvit-com#341).
 *
 * KOPI. Fila eies av portal/design/tilgjengelighet-sjekk.ts og er lik byte for
 * byte i hvert produkt. Endre den i portalen, og skriv kopiene med `bun
 * tilgjengelighetkopi.ts --skriv` i meta-repoet.
 *
 * Den kjører axe-core i en side produktet selv har åpnet i ekte Chrome — med
 * sin egen `chrome-cdp.ts`, som alle har. Den trenger bare `evaluate`, og den
 * signaturen er lik i hver kopi av CDP-klienten i porteføljen.
 *
 * axe-core er VENDRET, ikke en npm-avhengighet: `portal/design/axe.min.js`
 * (4.14.0, MPL-2.0), lest fra portals `origin/main` (disken når det ikke finnes
 * en remote). Én kopi i porteføljen, ingen i produktene — produktenes tester
 * finner allerede portalen ved siden av utsjekken.
 *
 * Ingen unntaksliste. Et brudd som ikke kan rettes nå, står i flatas
 * erklæring; det står ikke her, for da ville sjekken vært grønn på nøyaktig
 * det den finnes for å stoppe.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** WCAG 2.0 og 2.1, nivå A og AA — det forskriften krever. Ikke `best-practice`, ikke 2.2. */
export const AXE_TAGGER = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Det produktets CDP-side kan. `fn` serialiseres med `toString()` og kjøres i siden. */
export interface Side {
  evaluate<T, A extends unknown[]>(fn: (...args: A) => T, ...args: A): Promise<T>;
}

export interface Funn {
  regel: string;
  alvor: string;
  hjelp: string;
  url: string;
  noder: { mål: string; html: string; hvorfor: string }[];
}

/* ---------------------------------------------------------------- portalen --- */

/** portal/ ved siden av utsjekken, eller ved siden av hovedutsjekken et arbeidstre hører til. */
export function finnPortal(rot: string): string | null {
  for (let d = resolve(rot); ; d = dirname(d)) {
    const ved = resolve(d, '../portal');
    if (existsSync(resolve(ved, 'design/locales.json'))) return ved;
    if (dirname(d) === d) break;
  }
  const git = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: rot });
  const felles = git.stdout.toString().trim();
  if (!felles) return null;
  const viaHoved = resolve(dirname(dirname(felles)), 'portal');
  return existsSync(viaHoved) ? viaHoved : null;
}

/** En portalfil slik den er MERGET (origin/main); disken når det ikke finnes en remote-ref. */
export function portalfil(portal: string, sti: string): string | null {
  const vist = Bun.spawnSync(['git', 'show', `origin/main:${sti}`], { cwd: portal, stdout: 'pipe', stderr: 'pipe' });
  if (vist.exitCode === 0) return vist.stdout.toString();
  const disk = resolve(portal, sti);
  return existsSync(disk) ? readFileSync(disk, 'utf8') : null;
}

let axe: string | null = null;

/** Kildeteksten til axe-core. Kaster når portalen ikke finnes — da kan ingenting måles. */
export function axeKilde(rot: string): string {
  if (axe) return axe;
  const portal = finnPortal(rot);
  const kilde = portal ? portalfil(portal, 'design/axe.min.js') : null;
  if (!kilde) throw new Error('fant ikke portal/design/axe.min.js — ligger portal/ ved siden av utsjekken?');
  return (axe = kilde);
}

/* ------------------------------------------------------------------ i siden --- */

/**
 * Laster axe inn i siden. Kilden kjøres som TOPPNIVÅ-uttrykket i
 * `Runtime.evaluate`, ikke gjennom `eval` inne i siden: en side med en streng
 * Content-Security-Policy (uten `unsafe-eval`) ville ellers stoppet den, og
 * sjekken ville målt CSP-en i stedet for siden. Derfor en funksjon hvis
 * `toString()` ER axe — CDP-klienten bygger uttrykket av nettopp den.
 */
async function lastAxe(side: Side, kilde: string): Promise<void> {
  const harAxe = await side.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe === 'object');
  if (harAxe) return;
  const laster = Object.assign(() => undefined, { toString: () => `function () {\n${kilde}\n}` });
  await side.evaluate(laster);
}

/** axe-core mot hele dokumentet, WCAG 2.0/2.1 A og AA. Tom liste når siden består. */
export async function kjørAxe(side: Side, kilde: string): Promise<Funn[]> {
  await lastAxe(side, kilde);
  return side.evaluate(async (tagger: string[]) => {
    const a = (window as unknown as { axe: { run: (ctx: unknown, opt: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; helpUrl: string; nodes: Array<{ target: unknown[]; html: string; failureSummary?: string }> }> }> } }).axe;
    const r = await a.run(document, { runOnly: { type: 'tag', values: tagger }, resultTypes: ['violations'] });
    return r.violations.map((v) => ({
      regel: v.id,
      alvor: v.impact,
      hjelp: v.help,
      url: v.helpUrl,
      noder: v.nodes.slice(0, 5).map((n) => ({ mål: n.target.map(String).join(' '), html: n.html.slice(0, 200), hvorfor: (n.failureSummary ?? '').slice(0, 300) })),
    }));
  }, AXE_TAGGER);
}

/**
 * Planter et kjent brudd (et bilde uten tekstalternativ, 1.1.1) i siden. Hver
 * flates test kjører axe etter dette og krever å se `image-alt` — ellers er
 * sjekken blind, og grønt betyr ingenting.
 */
export async function plantBrudd(side: Side): Promise<void> {
  await side.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    img.setAttribute('data-fv-plantet', '');
    (document.querySelector('main') ?? document.body).appendChild(img);
  });
}

/**
 * Eierens mobilregel (WCAG 1.4.4 og 1.4.10): hvert elements BEREGNEDE
 * skriftstørrelse ganges med `faktor` — tekstforstørrelse fra
 * tilgjengelighetsinnstillingene, ikke sidezoom — og siden skal ikke bli
 * bredere enn viewportet. Sett viewporten (320 og 390 px) med produktets CDP
 * først. Måles lukket og med alle `<details>` åpne. Gir problemene, tom liste
 * når siden holder. Siden endres — last den på nytt før neste måling.
 *
 * Samme måling som portalens test/mobil-bredde.test.ts: alle størrelser leses
 * FØR noen skrives (ellers kvadreres faktoren nedover i treet), og et element
 * som har koblet seg fra tekstforstørrelsen (`text-size-adjust: none`) og er
 * mindre enn forstørret brødtekst, er et brudd i seg selv — det er å ta
 * innstillingen fra brukeren.
 */
export async function tekstForstørret(side: Side, faktor = 1.5): Promise<string[]> {
  return side.evaluate(async (f: number) => {
    await document.fonts.ready;
    const navn = (el: Element) =>
      el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : '');
    const alle = [...document.querySelectorAll<HTMLElement>('*')];
    const stil = alle.map((el) => getComputedStyle(el));
    const s = stil.map((cs) => parseFloat(cs.fontSize));
    const rot = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ut: string[] = [];
    alle.forEach((el, i) => {
      const tsa = stil[i]!.getPropertyValue('text-size-adjust') || stil[i]!.getPropertyValue('-webkit-text-size-adjust');
      if (tsa === 'none' || tsa === '100%') {
        if (s[i]! < rot * f && el.textContent?.trim()) ut.push(`${navn(el)} har koblet seg fra tekstforstørrelsen (${s[i]} px)`);
        return;
      }
      if (s[i]) el.style.fontSize = `${s[i]! * f}px`;
    });
    const de = document.documentElement;
    const skyldige = (variant: string) => {
      if (de.scrollWidth <= de.clientWidth) return;
      const vw = de.clientWidth;
      const funnet = new Set<string>();
      for (const el of [...document.querySelectorAll<HTMLElement>('body *')]) {
        const r = el.getBoundingClientRect();
        if ((r.width < 1 && r.height < 1) || r.right <= vw) continue;
        const p = el.parentElement;
        if (!p || r.right > p.getBoundingClientRect().right) funnet.add(`${navn(el).slice(0, 80)} (høyrekant ${Math.round(r.right)})`);
      }
      const gå = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const rekke = document.createRange();
      for (let n = gå.nextNode(); n; n = gå.nextNode()) {
        rekke.selectNodeContents(n);
        const r = rekke.getBoundingClientRect();
        if (r.width >= 1 && r.right > vw) funnet.add(`tekst i ${navn(n.parentElement!)}: «${(n.textContent ?? '').trim().slice(0, 40)}» (høyrekant ${Math.round(r.right)})`);
      }
      ut.push(`${de.scrollWidth} px innhold i ${vw} px${variant}: ${[...funnet].slice(0, 8).join('; ')}`);
    };
    skyldige('');
    const lukket = [...document.querySelectorAll('details')].filter((d) => !d.open);
    lukket.forEach((d) => (d.open = true));
    if (lukket.length) skyldige(' (med <details> åpne)');
    lukket.forEach((d) => (d.open = false));
    return ut;
  }, faktor);
}

/**
 * WCAG 2.4.7 Synlig fokus, som axe ikke kan se: hvert element tastaturet når
 * (lenker, knapper, skjemafelt, `tabindex >= 0`, synlige og ikke `disabled`)
 * fokuseres, og stilen sammenlignes med stilen uten fokus. Endres verken
 * `outline`, `box-shadow`, `border`, bakgrunn, farge eller tekstpynt, ser den
 * som bruker tastaturet ikke hvor hun er. Gir elementene uten synlig fokus.
 *
 * `focus()` fra et skript gir `:focus-visible` i Chrome når ingen pekerhendelse
 * kom først — det er den tilstanden en tastaturbruker ser.
 */
export async function fokusUsynlig(side: Side): Promise<string[]> {
  return side.evaluate(() => {
    const SEL = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
    const PROPS = ['outline-style', 'outline-width', 'outline-color', 'box-shadow', 'border-top-color', 'border-bottom-color', 'border-bottom-width', 'background-color', 'color', 'text-decoration-line', 'text-decoration-thickness'];
    const bilde = (el: Element) => {
      const cs = getComputedStyle(el);
      const kropp = PROPS.map((p) => cs.getPropertyValue(p)).join('|');
      // Et barn kan bære fokusringen (en <summary> med et ikon, et kort med en tittel).
      const barn = [...el.querySelectorAll('*')].slice(0, 20).map((b) => { const c = getComputedStyle(b); return PROPS.map((p) => c.getPropertyValue(p)).join('|'); }).join('/');
      const før = getComputedStyle(el, '::before'), etter = getComputedStyle(el, '::after');
      return `${kropp}#${barn}#${før.content}${før.outlineStyle}${før.boxShadow}${før.backgroundColor}#${etter.content}${etter.outlineStyle}${etter.boxShadow}${etter.backgroundColor}`;
    };
    const navn = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} «${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}»`;
    const ut: string[] = [];
    (document.activeElement as HTMLElement | null)?.blur?.();
    for (const el of [...document.querySelectorAll<HTMLElement>(SEL)]) {
      if ((el as HTMLButtonElement).disabled || el.closest('[inert], [hidden], [aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') continue;
      const uten = bilde(el);
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) continue;
      const med = bilde(el);
      el.blur();
      if (uten === med) ut.push(navn(el));
    }
    return [...new Set(ut)].slice(0, 15);
  });
}

/** Lesbar feilmelding: hvilken side, hvilken regel, hvilke elementer. */
export function beskriv(hvor: string, funn: Funn[]): string {
  return funn
    .map((f) => `${hvor}: ${f.regel} (${f.alvor}) — ${f.hjelp}\n  ${f.url}\n${f.noder.map((n) => `    ${n.mål}\n      ${n.html}\n      ${n.hvorfor.replace(/\n/g, ' ')}`).join('\n')}`)
    .join('\n\n');
}
