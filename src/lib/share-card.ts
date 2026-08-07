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

import { makeT, type Locale } from './i18n.ts';
import { chapterCardPath, chapterCardText } from './og-card.ts';
import { absoluteUrl } from './site-url.ts';

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

/**
 * Kortets plass i objektlagringen (#66) — ÉN sannhet for opplastingen,
 * runbooken og den dagen sidemalen peker rett hit.
 *
 * Samme form som `books`, `lab` og `puzzles` (`src/lib/delekort.ts` i hvert av
 * dem): bøtta ligger i Scaleway-prosjektet `flogvit`, region fr-par, og er
 * PRIVAT — bare dette objektet får `public-read`, så en framtidig
 * brukeropplasting ikke blir offentlig av en bøtte-default.
 *
 * `system/` er første nøkkelsegment fordi `<uid>/` er obligatorisk for
 * BRUKER-innhold (KONVENSJONER.md → «Objektlagring»); delekortet har ingen
 * bruker, og `system/` holder de to fra å blande seg i lagringsregnskapet.
 *
 * **Filnavnet bærer målene, og skal BYTTES når kortet endrer MOTIV.** Skraperne
 * cacher per URL, så en overskrevet fil viser det gamle motivet i ukevis uten at
 * noen feilmelding sier fra.
 */
export const DELEKORT = {
  bucket: 'bibel',
  region: 'fr-par',
  key: 'system/delekort/bibel-1200x630.png',
  width: SHARE_CARD_WIDTH,
  height: SHARE_CARD_HEIGHT,
} as const;

/**
 * Adressen er ABSOLUTT og hardkodet mot bøtta, aldri utledet av vår egen
 * origin: kortet ligger ikke på flata i det hele tatt.
 *
 * Virtual-hosted, som resten av porteføljen. `base` finnes bare for at
 * mekanismen skal kunne måles mot en lokal stubb — den har ingen wildcard-DNS —
 * og den kan ikke lyve: opplastingen henter objektet tilbake fra nettopp denne
 * adressen og krever bit-identiske byte.
 */
export const objektUrl = (base?: string) =>
  base
    ? `${base.replace(/\/$/, '')}/${DELEKORT.bucket}/${DELEKORT.key}`
    : `https://${DELEKORT.bucket}.s3.${DELEKORT.region}.scw.cloud/${DELEKORT.key}`;

export interface ShareCard {
  url: string;
  width: number;
  height: number;
  /** Alt-tekst. Utelatt = sidemalens generiske, som er riktig for et generisk kort. */
  alt?: string;
}

/**
 * Adressen må være ABSOLUTT — en relativ sti resolves ikke av alle skrapere.
 *
 * Bilder hører i objektlagring, også systeminnhold (KONVENSJONER.md →
 * «Objektlagring»). Bøtta `bibel` finnes ikke ennå, og en bøtte er en
 * beslutning om et skyprosjekt, ikke noe en kodeendring kan ta. Kortet
 * serveres derfor fra vårt eget opphav inntil den finnes.
 *
 * `OG_IMAGE_URL` flytter ADRESSEN. Selve flyttingen — opplasting, verifisering
 * og at bøttekopien ikke driver fra `public/og.png` — er
 * `scripts/upload-og-card.ts` (#66), som skriver ut nøyaktig den linja som skal
 * i `bibel.env`. Variabelen settes altså aldri for hånd, og adressen den bærer
 * er bevist før den skrives.
 *
 * Variabelen er MIDLERTIDIG. `books`, `lab` og `puzzles` peker sidemalen rett
 * på `objektUrl()` og har ingen slik bryter; det kan bibel også den dagen bøtta
 * finnes og kortet er lastet opp. Bryteren finnes bare fordi en `og:image` mot
 * en bøtte som ikke finnes gir INGEN forhåndsvisning — altså dårligere enn i
 * dag.
 *
 * Leses per kall framfor ved import, så testen kan sette den uten å laste
 * modulen på nytt. Det er ett oppslag i et map per sidevisning.
 */
export function shareCard(): ShareCard {
  return {
    url: process.env.OG_IMAGE_URL || absoluteUrl('/og.png'),
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
  };
}

/**
 * Kortet for ÉN kapittelside (#68) — «Matthew 5» framfor bare merkenavnet.
 *
 * Det er kapittel- og verselenkene folk deler, så det er her et kort som sier
 * hva lenken peker på er verdt mest. Alt annet beholder det generiske: en rute
 * uten noe bedre skal aldri bli uten kort.
 *
 * Bildet settes sammen per forespørsel av deler som er rastrert på forhånd
 * (`lib/og-card.ts`), fordi settet er 1189 kapitler × 8 språk. Adressen er
 * absolutt av samme grunn som over — en skraper har ingen base-URL — og peker
 * på vårt eget opphav; kortene kan flyttes til objektlagring når bøtta finnes
 * (#66), men det er 9512 filer å laste opp, ikke en kodeendring.
 *
 * Den er også PROSENTKODET (#80): fire boksluger bærer `ø`/`å`, og en crawler
 * som fikk den rå formen sendte prefikset fram til første ikke-ASCII-byte
 * (`GET /og/en/1kr` → 404). Kodingen ligger i `absoluteUrl()`, ikke i
 * `chapterCardPath()` — stien er rå der den brukes internt.
 */
export function chapterShareCard(bookId: number, chapter: number, locale: Locale): ShareCard {
  const [book, kapittel] = chapterCardText(bookId, chapter, locale);
  return {
    url: absoluteUrl(chapterCardPath(bookId, chapter, locale)),
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    alt: makeT(locale)('chrome.shareCardChapterAlt', { book, chapter }),
  };
}
