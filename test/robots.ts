// En robots.txt-MATCHER, delt av sidekontrakten og crawl-flate-vakta.
//
// Vaktene skal ikke sjekke at robots.txt inneholder en bestemt STRENG — da
// tester de formuleringen sin egen kode valgte, og en regel som ser riktig ut
// uten å treffe består. De sjekker i stedet oppførselen: for hver URL vi
// faktisk lenker til, sier robots.txt ja eller nei?
//
// Reglene følger RFC 9309 §2.2: `*` matcher hva som helst, `$` forankrer
// slutten, og av flere treff vinner det LENGSTE mønsteret (uavgjort ⇒ Allow).
// Uten lengde-regelen ville `Allow: /` slått alt, og vakta ville meldt grønt på
// en robots.txt som ikke stengte noe som helst.

interface Rule {
  allow: boolean;
  pattern: string;
  re: RegExp;
}

const toRegExp = (pattern: string): RegExp => {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
};

/** Én gruppe: sammenhengende `User-agent`-linjer, og reglene som følger dem. */
export interface RobotsGroup {
  agents: string[];
  rules: Rule[];
  crawlDelay?: number;
}

export function parseGroups(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let seenRuleInGroup = false;

  for (const line of txt.split('\n')) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) continue;
    const [rawField, ...rest] = clean.split(':');
    const field = rawField!.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (field === 'user-agent') {
      // En ny user-agent-linje etter en regel starter en NY gruppe;
      // sammenhengende user-agent-linjer deler gruppe.
      if (!current || seenRuleInGroup) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenRuleInGroup = false;
      }
      if (value) current.agents.push(value);
      continue;
    }
    if (!current) continue; // `Sitemap:` o.l. står utenfor gruppene
    if (field === 'allow' || field === 'disallow') {
      seenRuleInGroup = true;
      if (!value) continue;
      current.rules.push({ allow: field === 'allow', pattern: value, re: toRegExp(value) });
      continue;
    }
    if (field === 'crawl-delay') {
      seenRuleInGroup = true;
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  }
  return groups;
}

/**
 * Gruppa en gitt crawler skal følge (RFC 9309 §2.2.1): den navngitte gruppa
 * hvis produkt-tokenet står der, ELLERS `*` — og BARE den ene, aldri begge.
 *
 * Det er hele fella i #86: en `User-agent: PerplexityBot`-gruppe som bare
 * bærer en `Crawl-delay` OPPHEVER `Disallow`-ene i `*` for nettopp den
 * crawleren, altså åpner handlingsflata fra #60 for den som går fortest.
 */
export function groupFor(txt: string, agent = '*'): RobotsGroup | undefined {
  const groups = parseGroups(txt);
  const named = groups.find((g) => g.agents.some((a) => a.toLowerCase() === agent.toLowerCase()));
  return named ?? groups.find((g) => g.agents.includes('*'));
}

/** Produkt-tokenene som har sin EGEN gruppe — alt annet enn `*`. */
export function namedAgents(txt: string): string[] {
  return [...new Set(parseGroups(txt).flatMap((g) => g.agents).filter((a) => a !== '*'))];
}

export function crawlDelayFor(txt: string, agent: string): number | undefined {
  return groupFor(txt, agent)?.crawlDelay;
}

/**
 * Sier robots.txt ja til denne URL-en for denne crawleren? Uten `agent` er
 * spørsmålet hva en VILKÅRLIG crawler får lov til, altså `*`-gruppa.
 */
export function parseRobots(txt: string, agent = '*'): (url: string) => boolean {
  const rules = groupFor(txt, agent)?.rules ?? [];

  return (url: string) => {
    // Matchingen går mot sti + query — det er `?vers=` som skiller en handling
    // fra siden den hører til, så en matcher som stopper ved stien er blind
    // for hele saken.
    const target = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;
    let best: Rule | undefined;
    for (const rule of rules) {
      if (!rule.re.test(target)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow)
      ) {
        best = rule;
      }
    }
    return best ? best.allow : true;
  };
}

/**
 * Interne lenker i rendret HTML, med `rel`-verdien sin. Regexen tar hele
 * `<a …>`-taggen framfor bare `href`, for det er nettopp forholdet mellom de
 * to attributtene invarianten handler om.
 */
export function anchors(html: string): { href: string; rel: string }[] {
  return [...html.matchAll(/<a\s([^>]*)>/g)].flatMap((m) => {
    const tag = m[1]!;
    const href = /href="([^"]*)"/.exec(tag)?.[1];
    if (!href || !href.startsWith('/')) return [];
    // `&` står som `&amp;` i attributtet. Uten avkodingen matcher hverken
    // robots-mønsteret eller `?q=`-unntaket på en URL med to parametere.
    return [{ href: href.replace(/&amp;/g, '&'), rel: /rel="([^"]*)"/.exec(tag)?.[1] ?? '' }];
  });
}
