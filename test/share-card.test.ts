// DELEKORTET (#65) — det bildet en delt lenke viser.
//
// Hullet var usynlig fra flata selv: siden svarer 200, ser riktig ut og gir
// ingen logglinje. Det finnes bare UTENFOR produktet, hos noen som ennå ikke
// har klikket — og `usage_errors` inneholder bare FEIL, så prod-vakten kunne
// per konstruksjon aldri sett det.
//
// Sidekontrakten (`page-contract.test.ts`, invariant 8) sveiper HVER side i
// PAGES for taggene. Her ligger det den sveipen ikke kan se: at bildet finnes,
// at det faktisk har målene vi DEKLARERER, og at adressen kan brukes av en
// skraper som ikke har noen base-URL å resolve mot.
//
// De to målene er hele grunnen til at `og:image:width`/`:height` kreves:
// uten dem må skraperen hente bildet før den vet om det kan vises bredt, og
// den FØRSTE delingen av en URL blir uten bilde. Deklarerer vi tallene feil,
// er det verre enn å la dem stå — da beskriver de et bilde som ikke finnes.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { initBooks } from '../src/lib/bible.ts';
import { LOCALES } from '../src/lib/i18n.ts';
import { shareCard } from '../src/lib/share-card.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const SITE = 'https://bible.flogvit.com';

/** Kortets ekte mål, lest ut av PNG-ens IHDR-chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.slice(0, 8)]).toEqual(sig);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('IHDR');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const meta = (html: string, prop: string) =>
  new RegExp(`<meta property="${prop}" content="([^"]*)"`).exec(html)?.[1];

describe('delekortet', () => {
  test('kortet finnes og er 1200x630', async () => {
    const file = Bun.file('./public/og.png');
    expect(await file.exists()).toBe(true);
    expect(pngSize(new Uint8Array(await file.arrayBuffer()))).toEqual({ width: 1200, height: 630 });
  });

  test('appen serverer det, med validator', async () => {
    const res = await app.request('/og.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    // Uten ETag måtte hver skraper laste hele bildet på nytt hver gang. Det er
    // samme regel som resten av `public/` (static-cache.ts).
    expect(res.headers.get('etag')).toBeTruthy();
  });

  test('de DEKLARERTE målene er bildets EKTE mål', async () => {
    await initBooks();
    const html = await (await app.request('/en')).text();
    const bytes = new Uint8Array(await Bun.file('./public/og.png').arrayBuffer());
    const { width, height } = pngSize(bytes);
    expect({
      width: meta(html, 'og:image:width'),
      height: meta(html, 'og:image:height'),
    }).toEqual({ width: String(width), height: String(height) });
  });

  test('adressen er absolutt — en skraper har ingen base-URL', () => {
    expect(shareCard().url).toBe(`${SITE}/og.png`);
  });

  // Porteføljeregelen er at bilder hører i objektlagring (KONVENSJONER.md →
  // «Objektlagring»), også systeminnhold. Bøtta `bibel` finnes ikke ennå, så
  // kortet serveres fra vårt eget opphav inntil videre. `OG_IMAGE_URL` er
  // flyttelasset: når bøtta finnes, er dette ett miljøoppslag — ikke en
  // kodeendring — og da må knappen faktisk virke.
  test('OG_IMAGE_URL flytter kortet uten en kodeendring', () => {
    const før = process.env.OG_IMAGE_URL;
    try {
      process.env.OG_IMAGE_URL = 'https://bibel.s3.fr-par.scw.cloud/og.png';
      expect(shareCard().url).toBe('https://bibel.s3.fr-par.scw.cloud/og.png');
    } finally {
      if (før === undefined) delete process.env.OG_IMAGE_URL;
      else process.env.OG_IMAGE_URL = før;
    }
  });

  // `og:image:alt` er tekst en skjermleser leser opp — altså brukervendt tekst,
  // altså gjennom ordboka. Den er STRUKTURELT sjekket her (åtte språk, ingen
  // to like), og fanges dessuten av norsk-sveipene i sidekontrakten, som leser
  // den sammen med <title> og description.
  test('alt-teksten er oversatt, ikke én hardkodet streng', async () => {
    const alts = new Map<string, string>();
    for (const locale of LOCALES) {
      const html = await (await app.request(`/${locale}`)).text();
      const alt = meta(html, 'og:image:alt');
      expect({ locale, alt: alt?.trim() ? 'satt' : 'tom' }).toEqual({ locale, alt: 'satt' });
      alts.set(locale, alt!);
    }
    // STRUKTURELT, som brødsmulevakta i #63: en literal som aldri gikk gjennom
    // `t()` rendres ORDRETT LIKT på alle språk — uansett hvilket språk den
    // tilfeldigvis er skrevet på. Sammenligningen går på fire ubeslektede
    // språk; `nb` og `nn` kan med rette være like, og det er ikke en feil.
    const ubeslektede = ['en', 'nb', 'fr', 'de'].map((l) => alts.get(l)!);
    expect(new Set(ubeslektede).size).toBe(ubeslektede.length);
  });
});
