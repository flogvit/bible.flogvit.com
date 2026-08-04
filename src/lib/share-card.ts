// DELEKORTET (#65) — bildet en delt lenke viser på Facebook, LinkedIn, Slack,
// iMessage og Discord.
//
// Flata deklarerte ingen `og:image` i det hele tatt, så hver delt lenke ble et
// kort med bare tittel og beskrivelse. Hullet er usynlig innenfra: siden svarer
// 200 og ser riktig ut, og en manglende meta-tagg gir verken 404, 5xx eller en
// logglinje. Prod-vakten kunne per konstruksjon aldri sett det — `usage_errors`
// inneholder bare FEIL.
//
// Kortet hører i SIDEMALEN (`views/layout.tsx`), ikke per rute: legges det per
// side, mangler det på den ruta noen legger til i morgen. Per-side-kort
// (omslag, kapittel) er et eget og senere steg — generisk kort først, ellers
// venter hele flata på den mest arbeidskrevende varianten.
//
// KILDEN til bildet er `assets/og/card.html`, rastrert av
// `bun scripts/generate-og-card.ts` til `public/og.png`.

const SITE = 'https://bible.flogvit.com';

/**
 * Målene er DEL AV KONTRAKTEN, ikke pynt. Uten dem må skraperen hente bildet
 * før den vet om det kan vises bredt, og den FØRSTE delingen av en URL — den
 * som betyr noe — blir uten bilde.
 *
 * `test/share-card.test.ts` leser bildets EKTE mål ut av PNG-ens IHDR og
 * krever at de er nøyaktig disse. Deklarerte mål som ikke stemmer beskriver et
 * bilde som ikke finnes, og det er verre enn å la dem stå.
 */
export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export interface ShareCard {
  url: string;
  width: number;
  height: number;
}

/**
 * Adressen må være ABSOLUTT — en relativ sti resolves ikke av alle skrapere.
 *
 * Bilder hører i objektlagring, også systeminnhold (KONVENSJONER.md →
 * «Objektlagring»). Bøtta `bibel` finnes ikke ennå, og en bøtte er en
 * beslutning om et skyprosjekt, ikke noe en kodeendring kan ta. Kortet
 * serveres derfor fra vårt eget opphav inntil den finnes — og `OG_IMAGE_URL`
 * er flyttelasset: last opp bildet, sett variabelen i `bibel.env`, ferdig.
 * Ingen kodeendring, og `share-card.test.ts` holder knappen i live så den
 * faktisk virker den dagen den brukes.
 *
 * Leses per kall framfor ved import, så testen kan sette den uten å laste
 * modulen på nytt. Det er ett oppslag i et map per sidevisning.
 */
export function shareCard(): ShareCard {
  return {
    url: process.env.OG_IMAGE_URL || `${SITE}/og.png`,
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
  };
}
