// Måleprogrammet for `page-cache-memory-budget.test.ts` (#105).
//
// Det er et EGET PROGRAM av samme grunn som `mapping-bulk-probe.ts` (#104):
// `bun test` kjører alle testfilene i samme prosess, så et minnetall målt der
// inne er summen av alt som har kjørt før. Et tak på det ville vært et tak på
// suiten, ikke på mikrocachen.
//
// Sidene ligner en kapittelside med vilje: nesten alt er ASCII-markup, med en
// håndfull hebraiske ord i teksten. Det er nettopp den blandingen som er
// defekten — ett tegn utenfor latin1 tvinger HELE JS-strengen til to byte per
// tegn, mens den samme sida er ~1,05 byte per tegn som UTF-8. Et rent hebraisk
// dokument ville skjult forskjellen (2 byte per tegn i begge former), og et
// rent ASCII-dokument ville skjult den motsatt.

import { Hono } from 'hono';
import {
  clearPageCache,
  configurePageCache,
  pageCacheStats,
  resetPageCache,
  withPageCache,
} from '../src/lib/page-cache.ts';

const MB = 1024 * 1024;

/** Budsjettet cachen får i denne målingen. Lavt nok til å fylles raskt. */
const BUDGET = 24 * MB;
/** Nok unike adresser til å fylle budsjettet, uansett hvordan det telles. */
const PAGES = 260;

const ASCII_BLOCK =
  '<div class="verse-group"><span class="verse-num">1</span><p class="verse-text">' +
  'In the beginning God created the heaven and the earth, and the earth was without form.' +
  '</p></div>';
// Én hebraisk linje per ~15 ASCII-blokker: samme størrelsesorden som en
// kapittelside med grunntekst, målt til 1,04 byte UTF-8 per tegn.
const UNIT = ASCII_BLOCK.repeat(15) + '<p lang="he">בראשית ברא אלהים</p>';

function body(i: number): string {
  return `<!doctype html><html><body data-i="${i}">${UNIT.repeat(120)}</body></html>`;
}

const app = new Hono();
app.use('*', withPageCache);
app.get('/side/:i', (c) =>
  c.body(body(Number(c.req.param('i'))), 200, { 'content-type': 'text/html; charset=UTF-8' }),
);

async function crawl(from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) await (await app.request(`http://x/side/${i}`)).text();
}

resetPageCache();
configurePageCache({ maxTotalBytes: BUDGET });

// Varm opp: moduler, JIT og alt annet engangsarbeid skal ligge under baselinen.
await crawl(0, 10);
clearPageCache();
Bun.gc(true);
Bun.gc(true);
const baseline = process.memoryUsage().heapUsed;

await crawl(1000, 1000 + PAGES);
Bun.gc(true);
Bun.gc(true);
const full = process.memoryUsage().heapUsed;

const stats = pageCacheStats();
const prøve = body(1);
console.log(
  JSON.stringify({
    budsjett: BUDGET,
    // Det cachen selv MENER den bruker.
    regnskap: stats.bytes,
    oppforinger: stats.entries,
    // Det den faktisk vokste med.
    vekst: full - baseline,
    sideTegn: prøve.length,
    sideUtf8: Buffer.byteLength(prøve),
    sider: PAGES,
  }),
);
