// Rastrerer delekortet (#65): `assets/og/card.html` → `public/og.png`.
//
//     bun scripts/generate-og-card.ts
//
// Kortet er et BILDE fordi en skraper ikke kan rendre HTML — men KILDEN er
// HTML, så identiteten kan leses, endres og diffes som alt annet. En binær
// fil noen laget i et bilderedigeringsprogram er ikke vedlikeholdbar; da er
// neste endring en ny fil ingen kan sammenligne med den forrige.
//
// Rastreringen bruker samme headless Chrome som layout-vakta, av samme grunn
// (minimal-deps): Bun har prosess-spawning og WebSocket innebygd, og
// alternativet er et avhengighetstre på flere hundre pakker i deploy-porten.
//
// Skriptet er UTVIKLINGSVERKTØY, ikke en del av deployen — kortet er en
// brand-ressurs som endrer seg omtrent aldri, og `public/og.png` ligger i
// git. Kjør det når `assets/og/card.html` eller identiteten i
// `portal/STYLE.md` endres, og commit resultatet.
//
// Vakta er `test/share-card.test.ts`: den leser bildets EKTE mål ut av
// PNG-ens IHDR og krever at de er de samme som sidemalen deklarerer.

import { Chrome } from '../test/chrome-cdp.ts';

const WIDTH = 1200;
const HEIGHT = 630;

const source = new URL('../assets/og/card.html', import.meta.url);
const target = new URL('../public/og.png', import.meta.url);

const chrome = await Chrome.launch();
try {
  const page = await chrome.open(source.href);
  // Viewportet SETTES etter navigasjonen og uten mobil-emulering: kortet er en
  // fast flate uten `<meta viewport>`, og en telefon-emulering ville lagt på et
  // 980 px standardviewport i stedet for de 1200 vi ber om.
  await page.setViewport({ width: WIDTH, height: HEIGHT, mobile: false });

  // Chrome tegner med fallback-skriften til woff2-fila er dekodet. Uten denne
  // ventingen er kortet systemskrift halvparten av gangene — og ingen test
  // hadde sett det, for målene er riktige uansett.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const png = await page.screenshot();
  await Bun.write(target, png);

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const [w, h] = [view.getUint32(16), view.getUint32(20)];
  if (w !== WIDTH || h !== HEIGHT) {
    throw new Error(`Kortet ble ${w}x${h}, ikke ${WIDTH}x${HEIGHT}. Sidemalen deklarerer de siste.`);
  }
  console.log(`Skrev public/og.png — ${w}x${h}, ${(png.byteLength / 1024).toFixed(1)} kB`);
} finally {
  await chrome.close();
}
