// HVA lastvernet får lov til å skjære bort (#64).
//
// `/robots.txt` svarte 503 natt til 2026-08-02 — 1 av 7 hentinger, med
// `Retry-After: 30` og en varighet på nøyaktig 3,003 s, altså `queueWaitMs`.
// Det var ikke nedetid: semaforen i `page-cache.ts` gjorde jobben sin, og
// robots.txt sto bak den som alle andre.
//
// Det er selvopphevende. robots.txt er BREMSEN på lasten som utløser
// avvisningen: #60 la `Disallow: /*?vers=` der nettopp for å få crawlerne bort
// fra handlingsflata, og den regelen virker bare hvis crawleren får LESE fila.
// Alle de store behandler 5xx på robots.txt som «stopp crawlingen av hele
// siten en stund», og vedvarende 5xx (Google: over ~30 dager) som
// `Disallow: /`. Jo hardere crawlen presser oss, desto mindre sannsynlig er det
// at den som presser får se at vi ba den la være.
//
// Vakta setter semaforen til NULL plasser — «alltid full» — og spør hva som
// fortsatt kommer gjennom. Den har fire halvdeler, og de to første kjenner
// ingen sti-liste: de leser rutetabellen og katalogen, så en ny SEO-rute eller
// en ny fil i public/ er dekket uten at noen har ført den opp.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { NOT_A_PAGE, clearPageCache, configurePageCache } from '../src/lib/page-cache.ts';
import { seoRoutes } from '../src/routes/seo.ts';
import { sitemapPaths } from '../src/lib/sitemap-paths.ts';
import { PAGES } from './pages.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();

/** Alle filer under public/, som URL-stien de serveres på. */
function publicFiles(dir = 'public', prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? publicFiles(join(dir, e.name), `${prefix}/${e.name}`) : [`${prefix}/${e.name}`],
  );
}

beforeAll(() => {
  clearPageCache();
  // Null plasser: hver render som må gjennom semaforen får 503 etter køtiden.
  // Køtiden settes lavt så vakta ikke bruker 3 s per forespørsel.
  configurePageCache({ maxConcurrentRenders: 0, queueWaitMs: 10 });
});

afterAll(() => {
  configurePageCache({});
  clearPageCache();
});

describe('lastvernet med semaforen full (#64)', () => {
  // Ikke bare `/robots.txt` og `/sitemap.xml`: HVER rute i seoRoutes. Lista
  // leses ut av ruteren, så en ny crawler-flate arver invarianten gratis.
  test('hver rute i seoRoutes svarer 200', async () => {
    const paths = seoRoutes.routes.filter((r) => r.method === 'GET').map((r) => r.path);
    expect(paths).toContain('/robots.txt');
    expect(paths.length).toBeGreaterThan(2); // ellers måler testen nesten ingenting

    const avvist: { path: string; status: number }[] = [];
    for (const path of paths) {
      const res = await app.request(path);
      if (res.status !== 200) avvist.push({ path, status: res.status });
    }
    expect(avvist).toEqual([]);
  });

  test('robots.txt bærer fortsatt forbudene sine, ikke bare en 200', async () => {
    const res = await app.request('/robots.txt');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Disallow: /*?vers=');
  });

  // Verre utslag enn saken beskrev: en leser som fikk sida fra CACHEN (x-cache:
  // hit, ingen plass brukt) fikk 503 på stilarket rett etterpå. Å skjære bort
  // en filutlevering for å berge en SSR-render er nøyaktig baklengs.
  test('hver fil i public/ svarer 200', async () => {
    const files = publicFiles();
    expect(files).toContain('/styles.css');

    const avvist: { path: string; status: number }[] = [];
    for (const path of files) {
      const res = await app.request(path);
      if (res.status !== 200) avvist.push({ path, status: res.status });
    }
    expect(avvist).toEqual([]);
  });

  // Uten denne ville «fjern hele lastvernet» bestått vakta. Semaforen skal
  // fortsatt skjære bort den DYRE renderen — det er hele grunnen til at den
  // finnes (#14, #19).
  test('en ekte side skjæres fortsatt bort', async () => {
    for (const path of [L('/'), L('/om'), L('/1mos/1')]) {
      const res = await app.request(path);
      expect({ path, status: res.status }).toEqual({ path, status: 503 });
      expect(res.headers.get('retry-after')).toBe('30');
    }
  });
});

// Omgåelsen kjenner igjen en FIL på filnavnet — samme skille app.ts allerede
// bruker for å avgjøre at en sti med punktum ikke er en side. Holder det ikke,
// faller en ekte side ut av lastvernet i stillhet: den ville rendret som før,
// bare uten tak, og ingenting hadde sett galt ut før neste crawl veltet siden.
//
// Regelen importeres framfor å skrives av: en kopi her ville fortsatt vært
// grønn etter at den ekte regelen ble endret.
describe('ingen ekte side ser ut som en fil', () => {
  test('ingen sti i sitemapen har et filnavn i siste ledd', () => {
    expect(sitemapPaths().filter((p) => NOT_A_PAGE.test(p))).toEqual([]);
  });

  test('ingen side i PAGES heller — også de som ikke er crawlbare', () => {
    const stier = PAGES.map((p) => p.path.split('?')[0]!);
    expect(stier.filter((p) => NOT_A_PAGE.test(p))).toEqual([]);
  });
});
