import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getBibleEditions } from '../src/lib/bible.ts';
import { getSql } from '../src/lib/db.ts';
import { IMPORTED_BIBLES } from '../src/lib/editions.ts';
import { clearPageCache } from '../src/lib/page-cache.ts';
import { L } from './paths.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

// L() kjører på basespråket (engelsk), så overskriftene her er de engelske —
// ikke fordi seksjonen har byttet språk, men fordi testen ber om /en.

// Info-sider per oversettelse (/oversettelser/:id), bygget på bible_editions.
//
// Den viktigste testen her er lisens-invarianten: seksjonen «Lisens og
// kreditering» skal ALLTID rendres. En utelatt seksjon leses som «ingen
// begrensninger», og flere av tekstene våre krever kreditering (SBLGNT er
// CC BY 4.0, og kravet forplanter seg til oversettelsene som bygger på den).

const app = createApp();
const editions = await getBibleEditions();
const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('/oversettelser', () => {
  test('listen rendrer og lenker til info-side per utgave', async () => {
    const res = await app.request(L('/oversettelser'));
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const e of editions) {
      expect(html).toContain(`/oversettelser/${e.id}`);
    }
  });
});

describe('/oversettelser/:id', () => {
  test('ukjent utgave gir 404', async () => {
    const res = await app.request(L('/oversettelser/finnes-ikke'));
    expect(res.status).toBe(404);
  });

  // Datadrevet: kjører for hver utgave som faktisk er importert, så en ny
  // oversettelse dekkes automatisk. Hopper pent over på en tom base.
  for (const edition of editions) {
    test(`${edition.id}: lisensseksjonen rendres alltid`, async () => {
      const res = await app.request(L(`/oversettelser/${edition.id}`));
      expect(res.status).toBe(200);
      const text = strip(await res.text());

      expect(text).toContain('Licence and attribution');
      // Enten står vilkårene der, eller det står eksplisitt at de mangler —
      // taushet er ikke et lovlig utfall.
      const stated = edition.license_name !== null;
      // Radetiketten er oversatt nå (#22) — testen kjører på basespråket.
      expect(text.includes(stated ? 'Attribution' : 'ikke registrert')).toBe(true);
    });
  }

  const attributed = editions.find((e) => e.license_spdx?.startsWith('CC-BY'));
  if (attributed) {
    test(`${attributed.id}: krediteringskrav er uthevet, ikke bortgjemt`, async () => {
      const res = await app.request(L(`/oversettelser/${attributed.id}`));
      const text = strip(await res.text());
      // Etiketten er oversatt (#22); testen kjører på basespråket.
      expect(text).toContain('requires attribution');
      expect(text).toContain(attributed.license_spdx!);
    });
  }
});

// ── Innstillingene skal SPEILE bible_editions (#27, #28) ─────────────
//
// Velgerne var hardkodet til osnb/osnn, så OSEN dukket aldri opp — og
// versnummeringen hadde ingen standardoppføring, så det ALFABETISK første
// valget («aceh») sto som brukerens eget og ble skrevet inn i innstillingene
// ved første lagring på siden. Begge feilene så helt normale ut i UI-et.

describe('/innstillinger speiler bible_editions', () => {
  const readable = editions.filter((e) => e.philosophy !== 'source_text');

  test('hver lesbar utgave er valgbar som bibeloversettelse', async () => {
    const html = await (await app.request(L('/innstillinger'))).text();
    const select = html.slice(html.indexOf('data-setting="bible"'));
    const options = select.slice(0, select.indexOf('</select>'));
    const mangler = readable.filter((e) => !options.includes(`value="${e.id}"`)).map((e) => e.id);
    expect(mangler).toEqual([]);
  });

  test('grunntekstene er IKKE hovedtekst — de velges som undertekst', async () => {
    const html = await (await app.request(L('/innstillinger'))).text();
    const select = html.slice(html.indexOf('data-setting="bible"'));
    const options = select.slice(0, select.indexOf('</select>'));
    for (const e of editions.filter((x) => x.philosophy === 'source_text')) {
      expect({ id: e.id, iHovedvelger: options.includes(`value="${e.id}"`) })
        .toEqual({ id: e.id, iHovedvelger: false });
    }
  });

  test('versnummering har en TOM standardverdi først', async () => {
    const html = await (await app.request(L('/innstillinger'))).text();
    const select = html.slice(html.indexOf('data-setting="verseMapping"'));
    const first = select.slice(select.indexOf('<option'), select.indexOf('</option>'));
    expect(first).toContain('value=""');
  });
});

describe('utgavesidene er indekserbare (#30)', () => {
  // Sjekker sitemapen slik den SERVERES, ikke en generert fil på disk: etter
  // #42 finnes ikke public/sitemap.xml lenger, og det er den utsendte XML-en
  // crawleren faktisk får.
  test('sitemap har /oversettelser og én URL per importert utgave', async () => {
    const xml = await (await app.request('/sitemap-nb.xml')).text();
    expect(xml).toContain('/nb/oversettelser</loc>');
    // Utgavene DENNE koden importerer (#278). Den lokale basen deles av alle
    // økter, og en gren som importerer en ny utgave (#202: asvs, tr, wlc,
    // hebrew) skriver rader main aldri kunne ha skrevet — `IMPORTED_BIBLES`
    // styrer importen. Uten snittet var main rød i hver Dux-jobb så lenge en
    // slik gren hadde importert lokalt. Prod svarte 404 på alle fire.
    const våre = editions.filter((e) => (IMPORTED_BIBLES as readonly string[]).includes(e.id));
    // Snittet skal ikke kunne bli en tom påstand: har basen utgaver, er noen av dem våre.
    if (editions.length > 0) expect(våre.length, 'ingen av basens utgaver er importert av main').toBeGreaterThan(0);
    const mangler = våre.filter((e) => !xml.includes(`/nb/oversettelser/${e.id}</loc>`)).map((e) => e.id);
    expect(mangler).toEqual([]);
  });

  // #229: sitemapen lovet utgavesider fra `IMPORTED_BIBLES` mens siden slår opp
  // i `bible_editions`. Mellom kode-deployen og data-deployen svarte 48
  // sitemap-adresser 404 — tre grupper på rad. Sitemapen skal følge BASEN:
  // en rad gir adresse, en manglende rad gir ingen, uansett hva lista sier.
  describe('følger bible_editions, ikke IMPORTED_BIBLES (#229)', () => {
    const LISTED = IMPORTED_BIBLES[IMPORTED_BIBLES.length - 1]!;
    let saved: Record<string, unknown>[] = [];
    beforeAll(async () => {
      await getSql()`REPLACE INTO bible_editions (id, name_native, lang_iso639_1, direction, meta)
        VALUES ('sitemap-test', 'Sitemap', 'en', 'ltr', '{}')`;
      // En utgave som står i lista, men ennå ikke er importert.
      saved = await getSql()`SELECT * FROM bible_editions WHERE id = ${LISTED}` as Record<string, unknown>[];
      await getSql()`DELETE FROM bible_editions WHERE id = ${LISTED}`;
      // Importen løfter sync-versjonen; her er det mikrocachen fra testene
      // over som ellers ville servert utgavesiden fra før raden forsvant.
      clearPageCache();
    });
    afterAll(async () => {
      await getSql()`DELETE FROM bible_editions WHERE id = 'sitemap-test'`;
      for (const row of saved) await getSql()`INSERT INTO bible_editions ${getSql()(row)}`;
      clearPageCache();
    });

    test('en importert rad står i sitemapen, en manglende gjør ikke', async () => {
      const xml = await (await app.request('/sitemap-nn.xml')).text();
      const announced = (id: string) => xml.includes(`/nn/oversettelser/${id}</loc>`);
      expect({ importert: announced('sitemap-test'), mangler: announced(LISTED) })
        .toEqual({ importert: true, mangler: false });
    });

    test('hver utgaveadresse i sitemapen svarer 200', async () => {
      const xml = await (await app.request('/sitemap-en.xml')).text();
      const urls = [...xml.matchAll(/<loc>[^<]*(\/en\/oversettelser\/[^<]+)<\/loc>/g)].map((m) => m[1]!);
      expect(urls.length).toBeGreaterThan(0);
      // Én om gangen: lastvernet svarer 503 over render-taket.
      const feil: string[] = [];
      for (const u of urls) {
        const status = (await app.request(u)).status;
        if (status !== 200) feil.push(`${u} ${status}`);
      }
      expect(feil).toEqual([]);
    });
  });
});
