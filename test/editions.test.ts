import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { getBibleEditions } from '../src/lib/bible.ts';
import { L } from './paths.ts';

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
  test('sitemap har /oversettelser og én URL per importert utgave', async () => {
    const xml = await Bun.file('public/sitemap.xml').text();
    expect(xml).toContain('/oversettelser</loc>');
    const mangler = editions.filter((e) => !xml.includes(`/oversettelser/${e.id}</loc>`)).map((e) => e.id);
    expect(mangler).toEqual([]);
  });
});
