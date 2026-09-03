// Hva som har lov til å ligge i `bun.lock` — regelen ETT sted, lest av vakta
// (`test/laaste-avhengigheter.test.ts`).
//
// `bun audit` scorer kjente råd mot versjonene vi har LÅST, ikke mot dem vi
// bruker. Da er spørsmålet «hvorfor står pakka i låsen i det hele tatt» det
// samme spørsmålet som «er vi utsatt», og det er dette som svarer på det.
//
// Regelen er installasjonens egen: devDependencies er noe man får av
// ROT-prosjektet sitt, aldri av en avhengighet. Bun avviker fra det for
// `file:`-avhengigheter — den installerer dem som et arbeidsområde — og det er
// nettopp det som ga #112.

/** En pakkeoppføring i `bun.lock`: navn → hva den drar med seg. */
export type LockEntry = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalPeers?: string[];
};

export type Lockfile = {
  workspaces: Record<string, LockEntry & { name?: string }>;
  packages: Record<string, LockEntry>;
};

/**
 * `bun.lock` er JSONC: maskinskrevet, men med etterslepende komma.
 *
 * Vi rører bare komma foran en avsluttende klamme — ingen kommentarer, ingen
 * strengomskriving — så en verdi som ORDRETT inneholder «,}» er utenfor
 * rekkevidde av regexen (den krever klammen som neste ikke-blanke tegn etter
 * kommaet, og bun skriver aldri en slik verdi ustrenget).
 */
export function parseLockfile(text: string): Lockfile {
  const raw = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1')) as {
    workspaces: Record<string, LockEntry & { name?: string }>;
    packages: Record<string, unknown[]>;
  };

  // En oppføring er en tuppel der ETT ledd er selve avhengighetsobjektet.
  // Plassen varierer med hvordan pakka er løst opp (registry, file:, …), så
  // den finnes på FORM framfor på indeks — ellers ville en ny oppløsningstype
  // stille blitt lest som «ingen avhengigheter».
  const packages: Record<string, LockEntry> = {};
  for (const [name, tuple] of Object.entries(raw.packages)) {
    const descriptor = tuple.find(
      (part): part is LockEntry => typeof part === 'object' && part !== null && !Array.isArray(part),
    );
    packages[name] = descriptor ?? {};
  }
  return { workspaces: raw.workspaces, packages };
}

/** Kantene ut av en pakke — alt EN INSTALLASJON av den faktisk henter inn. */
function edges(entry: LockEntry): string[] {
  const optional = new Set(entry.optionalPeers ?? []);
  return [
    ...Object.keys(entry.dependencies ?? {}),
    ...Object.keys(entry.optionalDependencies ?? {}),
    // Peers leveres av den som installerer, men bun låser dem som egne
    // oppføringer når de faktisk trengs. En valgfri peer gjør det ikke.
    ...Object.keys(entry.peerDependencies ?? {}).filter((n) => !optional.has(n)),
  ];
}

/**
 * Pakker som står i låsen uten at noe i VÅRT eget tre ber om dem.
 *
 * Startpunktet er arbeidsområdets egne `dependencies` + `devDependencies` —
 * det er DER en devDependency hører hjemme. Derfra følges bare kjøretidskanter,
 * så en avhengighets test-verktøy aldri blir vårt å låse og revidere.
 *
 * Returnerer NAVN framfor en boolean: den eneste leseren som betyr noe er et
 * menneske foran en rød test, og «låsen har noe ekstra» hjelper ingen.
 */
export function unreachablePackages(lock: Lockfile): string[] {
  const root = lock.workspaces[''] ?? {};
  const queue = [...Object.keys(root.dependencies ?? {}), ...Object.keys(root.devDependencies ?? {})];

  const reached = new Set<string>();
  while (queue.length) {
    const name = queue.pop()!;
    if (reached.has(name)) continue;
    reached.add(name);
    const entry = lock.packages[name];
    if (entry) queue.push(...edges(entry));
  }

  return Object.keys(lock.packages)
    .filter((name) => !reached.has(name))
    .sort();
}
