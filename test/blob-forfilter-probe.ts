// Måleprogrammet for `blob-forfilter.test.ts` (#110).
//
// Et EGET PROGRAM av samme grunn som `mapping-bulk-probe.ts` (#104),
// `page-cache-memory-probe.ts` (#105) og `minne-vekst-probe.ts`: `bun test`
// kjører alle testfilene i samme prosess, så et minnetall målt der inne er
// summen av alt som har kjørt før — et tak på det ville vært et tak på suiten.
//
// Det måler ÉN ting: hva koster det å slå opp personene for et kapittel?
//
// To moduser, og BEGGE måles i hver sin ferske prosess. `gammel` gjør ordrett
// det getteren gjorde før — hent hele `persons` for språket og `JSON.parse`
// hver rad — og finnes fordi et absolutt MB-tall er en egenskap ved maskinen,
// mens FORHOLDET mellom de to er en egenskap ved koden. Rekkefølgen kan heller
// ikke måles i én prosess: den første målingen ville fått allokatorens
// høyvannsmerke for seg selv, og den andre arvet det.
//
// RSS, ikke heapUsed. Det er tallet cgruppa teller når den bestemmer seg for å
// OOM-drepe containeren (#106), og hele #110 er at det klatrer mens live-settet
// står stille.

import { getSql } from '../src/lib/db.ts';
import { getPersonsByChapter, initBooks, parsePersonContent } from '../src/lib/bible.ts';
import { contentLanguageChain } from '../src/lib/lang.ts';

const modus = process.argv[2] === 'gammel' ? 'gammel' : 'ny';
const RUNDER = Number(process.env.FORFILTER_PROBE_RUNDER || 10);

/** Ordrett veien getteren gikk før #110: hele tabellen inn, hver rad parset. */
async function gammelVei(bookId: number, chapter: number, lang: string): Promise<number> {
  const sql = getSql();
  for (const language of contentLanguageChain(lang)) {
    const rows = (await sql`
      SELECT content FROM persons WHERE language = ${language}
    `) as { content: string }[];
    if (rows.length === 0) continue;
    return rows
      .map((r) => parsePersonContent(r.content))
      .filter(
        (p) =>
          p !== null && !!p.references?.some((r) => r.bookId === bookId && r.chapterId === chapter),
      ).length;
  }
  return 0;
}

await initBooks();

// Oppvarming: moduler, JIT, pool og alt annet engangsarbeid skal ligge under
// utgangspunktet, ellers måler vi oppstart og ikke oppslaget.
const kall = (bok: number, kap: number, språk: string) =>
  modus === 'gammel' ? gammelVei(bok, kap, språk) : getPersonsByChapter(bok, kap, språk).then((p) => p.length);

await kall(45, 1, 'en');
await kall(45, 1, 'nb');
const før = process.memoryUsage.rss();

// Ulike kapitler og språk — som en crawler går dem.
const BØKER = [1, 40, 42, 43, 45];
const SPRÅK = ['nb', 'en'];
let treff = 0;
for (let i = 0; i < RUNDER; i++) {
  const bok = BØKER[i % BØKER.length]!;
  const språk = SPRÅK[i % SPRÅK.length]!;
  treff += await kall(bok, 1 + (i % 5), språk);
}

console.log(
  JSON.stringify({
    modus,
    runder: RUNDER,
    rssFør: før,
    rssEtter: process.memoryUsage.rss(),
    vekst: process.memoryUsage.rss() - før,
    // Uten treff måler probet ingenting — vakta krever at tallet er over null.
    treff,
  }),
);
process.exit(0);
