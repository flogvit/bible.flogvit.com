// PERSONADRESSER I IMPORTERT INNHOLD — én liste, én regel (#61).
//
// Samme klasse feil som #46, én akse over: der pekte importert innhold på et
// VERS som ikke fantes, her peker det på en PERSON som ikke finnes. Beviset kom
// fra .no-appen, som henter familien sin over API-et:
//
//   GET /api/persons/gomer            -> 200, children: ["jisreel-hoseas-sønn", …]
//   GET /api/persons/jisreel-hoseas-s%C3%B8nn -> 404
//
// altså at API-ets EGET svar annonserer en id API-et selv ikke kan servere. Sju
// av sju API-404-er i loggvinduet hadde vår egen side som referer.
//
// .com har samme rot, med et annet utslag. Persondetaljen slår opp familien
// server-side og hopper stille over det som ikke finnes — leseren mister et
// familiemedlem uten at noe ser galt ut — mens ættetavlene i `chapter_insights`
// lenker RETT ut: `/nb/matt/1` lenket «Tamar» til `/personer/tamar`, som er 404.
// Personen finnes, men heter `tamar-juda`. Åtte språkprefikser, én av de mest
// lenkede sidene vi har.
//
// HVORFOR ETTER-PASS OG IKKE EN PORT PER INNHOLDSSLAG
// ---------------------------------------------------
// Nøyaktig samme begrunnelse som #46: en port man må huske å legge inn er en
// port som blir glemt. `prunePersonRefs()` kjører ÉN gang over alle
// innholdstabellene med en JSON-blob, og kalles fra to steder:
//
//   - `ensureSchema()` (schema.ts)     — altså hver deploy, som rydder prod.
//   - slutten av `import-bible.ts`     — altså hver innholdsoppdatering.
//
// REGELEN: LENKA FALLER, NAVNET BLIR
// -----------------------------------
// En død personadresse fjernes — men BARE adressen. Navnet, noten og resten av
// raden står. «Tamar» skal fortsatt stå i ættetavlen; det er bare ikke en lenke
// lenger. Det er samme avveining som «start slettes, slutt klippes» i #46: kast
// aldri innhold vi har for å bli kvitt en adresse vi ikke har.
//
// Og den gjetter ALDRI. `tamar` kunne vært `tamar-juda`, `tamar-absaloms-datter`
// eller `tamar-absaloms-soster-davids-datter`. En gjetning ville sendt leseren
// til feil person med full selvtillit — samme grunn som at bare ÉN generasjon
// leseteksts-id-er kunne løses opp i #40.
//
// RYDDINGEN RØRER IKKE `content_hashes`, og det er med vilje: hashen er av
// FILA, så en ryddet rad blir liggende ryddet til kilden faktisk endrer seg —
// og retter free-bible id-en, endres fila, og raden importeres på nytt med den
// riktige adressen. Hullet er det motsatte tilfellet: blir PERSONEN døpt om til
// den id-en insight-fila allerede bruker, ser importen ingen endring i fila, og
// lenka blir stående som ren tekst til noen kjører `--full`. Det er en degradert
// lenke, ikke en død — riktig vei å feile.
//
// SANNHETEN ER `persons.name` — kolonnen `/personer/<id>` og `/api/persons/<id>`
// slår opp i — lest gjennom SAMME fallback-kjede som spørringen bruker
// (`contentLanguageChain`). En nb-rad som peker på en person vi bare har på
// engelsk er altså IKKE død: det er nøyaktig det oppslaget gjør også.

import type { SQL } from 'bun';
import { contentLanguageChain } from './lang.ts';
import { PERSON_ID_ALIASES, normalizePersonId } from './person-id-aliases.ts';

/**
 * JSON-nøklene som bærer en PERSONADRESSE — altså en id som skal kunne slås opp
 * i `persons`. De seks første er slektsgrafen i `persons.content`; `personId` er
 * ættetavlene, personlistene og trosheltene i `chapter_insights.content`.
 *
 * Nøkkelen, ikke stien. `personId` ligger på fire ulike dybder i insight-JSON-en
 * (`sections[].persons[]`, `footer.links[]`, `persons[]`, `heroes[]`), og en ny
 * insight-type med samme nøkkel arver regelen gratis.
 */
export const PERSON_REF_KEYS: readonly string[] = [
  'father',
  'mother',
  'spouse',
  'siblings',
  'children',
  'relatedPersons',
  'personId',
];

const REF_KEYS = new Set(PERSON_REF_KEYS);

/** En nøkkel som SER ut som en personadresse, men ikke er det. */
export interface ExemptKey {
  key: string;
  why: string;
}

/**
 * Nøkler vakta finner, men som ikke skal sveipes. Se `person-refs.test.ts`:
 * FORM-halvdelen leter etter nøkler hvis verdier stort sett slår opp i
 * `persons`, så en ny adressenøkkel oppdages uten at noen fører den opp.
 */
export const EXEMPT_KEYS: ExemptKey[] = [
  {
    key: 'id',
    why: 'personens EGEN id — sannheten sveipen måler mot, ikke en adresse mot den',
  },
];

/** En tabell med en JSON-blob som kan bære personadresser. */
export interface ContentSource {
  table: string;
  column: string;
}

/**
 * Innholdstabellene som sveipes. Alle sju har `(id, language)` som entydig rad,
 * og det er den vi skriver tilbake på.
 *
 * Lista er BRED med vilje: sveipen koster én JSON-parse per rad ved deploy, og
 * alternativet — å føre opp bare de tabellene vi vet har personadresser i dag —
 * ville vært en liste å glemme neste gang free-bible legger dem et nytt sted.
 */
export const CONTENT_SOURCES: ContentSource[] = [
  { table: 'themes', column: 'content' },
  { table: 'persons', column: 'content' },
  { table: 'chapter_insights', column: 'content' },
  { table: 'reading_plans', column: 'content' },
  { table: 'days', column: 'content' },
  { table: 'number_symbolism', column: 'content' },
  { table: 'stories', column: 'content' },
];

/** En tabell med JSON-blob som vakta med vilje IKKE sveiper, med grunnen. */
export interface UnscannedTable {
  table: string;
  why: string;
}

export const UNSCANNED_TABLES: UnscannedTable[] = [
  { table: 'sync_items', why: 'brukerdata — leserens egne notater, ikke importert innhold' },
  { table: 'user_bible_chapters', why: 'brukerdata — eierens egne kapitler i egen utgave' },
  {
    table: 'devotional_publications',
    why: 'brukerskrevet tekst, frosset ved innsending (#15) — en rydding ville endret det review godkjente',
  },
];

/**
 * Slår en person-id opp for et gitt innholdsspråk og gir den KANONISKE id-en
 * tilbake — ikke ja/nei. `null` betyr «finnes ikke, og kan ikke rettes».
 *
 * Skillet er hele poenget: en peker som bare er stavet på den gamle måten skal
 * rettes, ikke slettes.
 */
export type PersonResolver = (id: string, language: string) => string | null;

/**
 * Bygger oppslaget fra `persons`-tabellen. Kjeden er den samme som
 * `inLanguage()` i `bible.ts` bruker, så vakta og spørringen er enige om hva
 * som finnes: `nn` → `nb` → `en`.
 *
 * Tre trinn, i tur, og hvert av dem krever et EKSAKT treff i `persons`:
 *
 *   1. id-en slik den står,
 *   2. `PERSON_ID_ALIASES` — de 68 håndverifiserte omskrivingene fra
 *      free-bible#25, altså de formene translitterering ikke kan redde
 *      (`akabs-snn` mangler bokstaven helt),
 *   3. `normalizePersonId()` — ø/æ/å-klassen saken er meldt på.
 *
 * Slår ingen av dem opp, er adressen død. Den gjetter aldri videre: `josef`
 * blir ikke til en av de elleve `josef-*`.
 */
export function personResolverFrom(rows: { name: string; language: string }[]): PersonResolver {
  const byLanguage = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = byLanguage.get(row.language);
    if (!set) byLanguage.set(row.language, (set = new Set()));
    set.add(row.name);
  }
  const chains = new Map<string, string[]>();
  return (id, language) => {
    let chain = chains.get(language);
    if (!chain) chains.set(language, (chain = contentLanguageChain(language)));
    const has = (candidate: string) => chain!.some((lang) => byLanguage.get(lang)?.has(candidate));

    if (has(id)) return id;
    const alias = PERSON_ID_ALIASES[id];
    if (alias && has(alias)) return alias;
    const normalized = normalizePersonId(id);
    if (normalized !== id && has(normalized)) return normalized;
    return null;
  };
}

/** En personadresse som ikke slår opp slik den står, slik den rapporteres. */
export interface DanglingPersonRef {
  table: string;
  key: string;
  /** Id-en som ikke finnes. */
  id: string;
  /**
   * Den kanoniske id-en adressen ble RETTET til, eller `null` når den ikke
   * kunne reddes og altså ble fjernet.
   */
  replacement: string | null;
  /** Språkene raden(e) ligger på. */
  languages: string[];
  /** Antall forekomster. */
  hits: number;
}

/**
 * Går gjennom JSON-en og fjerner hver personadresse som ikke slår opp.
 *
 * Skalarer nulles (`family.father`, `personId`), lister filtreres
 * (`children`, `relatedPersons`) — begge er former sidene allerede rendrer:
 * `PersonLink` uten id gir ren tekst, og `lookup()` på persondetaljen tåler
 * null. Alt annet i raden bæres uendret over.
 *
 * Returnerer `null` når ingenting ble fjernet, slik at kalleren slipper å skrive
 * tilbake en rad som er lik.
 */
export function stripDanglingPersonRefs(
  content: unknown,
  resolve: (id: string) => string | null,
  onChanged: (key: string, id: string, replacement: string | null) => void,
): unknown | null {
  let changed = false;

  const walk = (node: unknown, key: string | null): unknown => {
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      for (const item of node) {
        if (key !== null && REF_KEYS.has(key) && typeof item === 'string' && item !== '') {
          const canonical = resolve(item);
          if (canonical === item) {
            out.push(item);
            continue;
          }
          onChanged(key, item, canonical);
          changed = true;
          // Kan den rettes, rettes den. Ellers forsvinner elementet helt — en
          // tom streng i `children` ville vært en lenke til `/personer/`.
          if (canonical !== null) out.push(canonical);
          continue;
        }
        out.push(walk(item, key));
      }
      return out;
    }
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, value] of Object.entries(node as Record<string, unknown>)) {
        if (REF_KEYS.has(k) && typeof value === 'string' && value !== '') {
          const canonical = resolve(value);
          if (canonical === value) {
            out[k] = value;
            continue;
          }
          onChanged(k, value, canonical);
          changed = true;
          // Rettet id, eller null. `PersonLink` uten id gir ren tekst, så
          // navnet blir stående der adressen ikke kunne reddes.
          out[k] = canonical;
          continue;
        }
        out[k] = walk(value, k);
      }
      return out;
    }
    return node;
  };

  const next = walk(content, null);
  return changed ? next : null;
}

/** Samler adressene uten å endre noe — brukes av vakta og av rapporteringen. */
export function findDanglingPersonRefsIn(
  table: string,
  rows: { content: string; language: string }[],
  resolve: PersonResolver,
): DanglingPersonRef[] {
  const found = new Map<string, DanglingPersonRef>();
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.content);
    } catch {
      // En ugyldig blob er ikke denne vaktas sak; sidene tåler den allerede.
      continue;
    }
    stripDanglingPersonRefs(
      parsed,
      (id) => resolve(id, row.language),
      (key, id, replacement) => {
        const mapKey = `${key} ${id}`;
        const entry = found.get(mapKey);
        if (entry) {
          entry.hits++;
          if (!entry.languages.includes(row.language)) entry.languages.push(row.language);
        } else {
          found.set(mapKey, { table, key, id, replacement, languages: [row.language], hits: 1 });
        }
      },
    );
  }
  return [...found.values()].sort((a, b) => b.hits - a.hits);
}

async function loadResolver(sql: SQL): Promise<PersonResolver | null> {
  const rows = (await sql`SELECT name, language FROM persons`) as { name: string; language: string }[];
  // Uten personer i basen finnes det ingenting å måle mot, og «alt er dødt»
  // ville tømt slektsgrafen i én sveip. Da gjør vi heller ingenting.
  return rows.length === 0 ? null : personResolverFrom(rows);
}

/** Leser bare. Brukes av `person-refs.test.ts` og av importens rapport. */
export async function findDanglingPersonRefs(sql: SQL): Promise<DanglingPersonRef[]> {
  const resolve = await loadResolver(sql);
  if (!resolve) return [];
  const findings: DanglingPersonRef[] = [];
  for (const source of CONTENT_SOURCES) {
    const rows = (await sql.unsafe(
      `SELECT ${source.column} AS content, language FROM ${source.table}`,
    )) as { content: string; language: string }[];
    findings.push(...findDanglingPersonRefsIn(source.table, rows, resolve));
  }
  return findings;
}

export interface PersonPruneReport {
  /** Adressene som ble fjernet, mest brukte først. */
  removed: DanglingPersonRef[];
  /** Antall rader som ble skrevet tilbake. */
  rows: number;
  /** Sant når basen manglet personer og ingenting kunne valideres. */
  skipped: boolean;
}

export function personPruneReportIsEmpty(r: PersonPruneReport): boolean {
  return r.removed.length === 0;
}

export function formatPersonPruneReport(r: PersonPruneReport): string {
  if (r.skipped) return 'Personadresser: ingen personer i basen — hoppet over.';
  if (personPruneReportIsEmpty(r)) return 'Personadresser: ingen døde adresser.';
  // Rettet og fjernet er to forskjellige hendelser. En rapport som sa «fjernet»
  // om begge ville beskrevet tapt innhold der vi nettopp berget det.
  const lines = r.removed.map((f) =>
    f.replacement === null
      ? `  ${f.table}.${f.key}: fjernet ${f.hits} lenke(r) til «${f.id}» (${f.languages.join(', ')})`
      : `  ${f.table}.${f.key}: rettet ${f.hits} lenke(r) «${f.id}» → «${f.replacement}» (${f.languages.join(', ')})`,
  );
  return `Personadresser ryddet i ${r.rows} rad(er):\n${lines.join('\n')}`;
}

/**
 * Fjerner personadresser som ikke finnes, fra hver innholdstabell med en
 * JSON-blob. Idempotent — andre kjøring rapporterer null.
 */
export async function prunePersonRefs(sql: SQL): Promise<PersonPruneReport> {
  const report: PersonPruneReport = { removed: [], rows: 0, skipped: false };
  const resolve = await loadResolver(sql);
  if (!resolve) {
    report.skipped = true;
    return report;
  }

  const found = new Map<string, DanglingPersonRef>();
  for (const source of CONTENT_SOURCES) {
    const rows = (await sql.unsafe(
      `SELECT id, language, ${source.column} AS content FROM ${source.table}`,
    )) as { id: string | number; language: string; content: string }[];

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.content);
      } catch {
        continue;
      }
      const next = stripDanglingPersonRefs(
        parsed,
        (id) => resolve(id, row.language),
        (key, id, replacement) => {
          const mapKey = `${source.table} ${key} ${id}`;
          const entry = found.get(mapKey);
          if (entry) {
            entry.hits++;
            if (!entry.languages.includes(row.language)) entry.languages.push(row.language);
          } else {
            found.set(mapKey, { table: source.table, key, id, replacement, languages: [row.language], hits: 1 });
          }
        },
      );
      if (next === null) continue;
      await sql.unsafe(`UPDATE ${source.table} SET ${source.column} = ? WHERE id = ? AND language = ?`, [
        JSON.stringify(next),
        row.id,
        row.language,
      ]);
      report.rows++;
    }
  }

  report.removed = [...found.values()].sort((a, b) => b.hits - a.hits);
  return report;
}
