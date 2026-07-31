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

/**
 * Reglene som gjelder `User-agent: *`. Andre grupper er uinteressante her:
 * vaktene spør hva en vilkårlig crawler får lov til, ikke hva en navngitt får.
 */
export function parseRobots(txt: string): (url: string) => boolean {
  const rules: Rule[] = [];
  let inStarGroup = false;
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
      if (seenRuleInGroup) {
        inStarGroup = false;
        seenRuleInGroup = false;
      }
      if (value === '*') inStarGroup = true;
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    seenRuleInGroup = true;
    if (!inStarGroup || !value) continue;
    rules.push({ allow: field === 'allow', pattern: value, re: toRegExp(value) });
  }

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
