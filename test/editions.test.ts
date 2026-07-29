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
