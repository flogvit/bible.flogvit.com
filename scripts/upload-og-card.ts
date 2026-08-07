// Legger delekortet i objektlagringen og BEKREFTER at det ligger der (#66).
//
//   bun scripts/upload-og-card.ts          # last opp, verifiser, skriv env-linja
//   bun scripts/upload-og-card.ts sjekk    # er den PUBLISERTE adressen lik kilden?
//
// #65 leverte kortet virkende fra vårt eget opphav og kalte `OG_IMAGE_URL`
// «flyttelasset: last opp bildet, sett variabelen, ferdig — ingen kodeendring».
// Det er halve flyttingen sagt som hele. Variabelen flytter ADRESSEN; ingenting
// flyttet BILDET, og ingenting holdt de to kopiene like. `public/og.png` ligger
// i git og rulles ut med imaget, mens bøttekopien måtte lastes opp for hånd —
// og runbooken har TRE grunner til å lage kortet på nytt (`card.html`,
// identiteten i `portal/STYLE.md`, en ny bokstav i et boknavn) uten å nevne
// opplasting. Fra dagen variabelen er satt, ville prod servert et gammelt kort
// for alltid: 200, ingen loggrad, synlig bare for den som fikk lenken. Nøyaktig
// hullet #65 handlet om, én etasje ned.
//
// PORTET FRA PORTEFØLJEN, ikke funnet opp her: `books`, `lab` og `puzzles` har
// samme skript (`scripts/last-opp-delekort.ts`) mot samme `Bun.S3Client`, med
// samme legitimasjonskjede og samme «bekreft anonymt etterpå». Avviket er at
// bibel også har en `sjekk`-kommando, fordi bibels opplasting IKKE ligger i
// deploy-kjeden — den bor i driftsrepoet (`server/deploy-bibel-hono.sh`).
//
// KORTET SKRIVES HVER GANG. Det koster en håndfull kilobyte og fjerner hele
// klassen «bildet forsvant fordi noen ryddet i bøtta». Skal kortet endre MOTIV,
// bytt filnavnet i `DELEKORT` — skraperne cacher per URL, og en overskrevet fil
// viser det gamle motivet i ukevis uten at noe sier fra.

import os from 'node:os';
import path from 'node:path';
import { DELEKORT, objektUrl } from '../src/lib/share-card.ts';

// Bare for at mekanismen skal kunne måles mot en lokal stubb. Ingen av dem kan
// lyve: objektet hentes tilbake fra den PUBLISERTE adressen og må være
// bit-identisk, så en endepunkt-overstyring som peker feil felles med en gang.
const ENDPOINT = process.env.S3_ENDPOINT || `https://s3.${DELEKORT.region}.scw.cloud`;
const PUBLISERT = process.env.S3_ENDPOINT ? objektUrl(process.env.S3_ENDPOINT) : objektUrl();

const KILDE = Bun.fileURLToPath(new URL('../public/og.png', import.meta.url));
const UA = { 'user-agent': 'FLOGVIT-delekort/1' };

const kommando = process.argv[2] ?? 'last-opp';

function stopp(melding: string): never {
  console.error(melding);
  process.exit(1);
}

const lik = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** S3-feil bærer koden i KROPPEN. «Bøtta finnes ikke» og «objektet finnes ikke»
 *  er begge 404, og de betyr helt ulike ting for den som leser meldinga. */
async function hent(url: string): Promise<{ status: number; bytes: Uint8Array; kode: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { ...UA, 'cache-control': 'no-cache' } });
  } catch (e) {
    return stopp(`Fikk ikke kontakt med ${url}: ${e instanceof Error ? e.message : e}`);
  }
  const rå = new Uint8Array(await res.arrayBuffer());
  const kode = res.ok ? '' : (/<Code>([^<]+)<\/Code>/.exec(new TextDecoder().decode(rå))?.[1] ?? '');
  return { status: res.status, bytes: rå, kode };
}

const fil = Bun.file(KILDE);
if (!(await fil.exists())) {
  stopp('public/og.png finnes ikke. Lag kortet først: bun scripts/generate-og-card.ts');
}
const lokale = new Uint8Array(await fil.arrayBuffer());

// ── sjekk ────────────────────────────────────────────────────────────────────
//
// Adressen er den PUBLISERTE når `OG_IMAGE_URL` er satt — altså den leseren
// faktisk møter. Å måle den utledede i stedet ville målt et sted ingen henter
// kortet fra. Kommandoen skriver ingenting og trenger ingen nøkler, så den kan
// kjøres etter hver deploy av hvem som helst.
if (kommando === 'sjekk') {
  const publisert = process.env.OG_IMAGE_URL;
  const url = publisert || PUBLISERT;
  const { status, bytes, kode } = await hent(url);
  // «Bøtta finnes ikke» betyr TO ULIKE TING, som 404 gjør for review-køa (#81),
  // og bare det ene er et avvik:
  //
  //   uten OG_IMAGE_URL — flyttingen (#87) er ikke gjort ennå. Sidemalen peker
  //     på vårt eget opphav, delte lenker får kortet sitt, og ingenting er
  //     galt. Skal `sjekk` kunne stå i deploy-kjeden FØR avgjørelsen er tatt —
  //     som er hele poenget med at bibel har kommandoen (#66) — kan den ikke
  //     felle hver eneste deploy for en tilstand som er riktig.
  //   med OG_IMAGE_URL — variabelen PÅSTÅR at kortet ligger i objektlagringen,
  //     og påstanden er brutt. Da er delte lenker uten forhåndsvisning i det
  //     hele tatt, altså dårligere enn før flyttingen.
  if (status === 404 && kode === 'NoSuchBucket') {
    if (!publisert) {
      console.log(
        `Kortet er ikke flyttet til objektlagring ennå: bøtta «${DELEKORT.bucket}» finnes ikke, og ` +
          'OG_IMAGE_URL er ikke satt.\n' +
          `Sidemalen serverer public/og.png (${lokale.length} byte) fra vårt eget opphav, og det er ` +
          'riktig inntil bøtta er opprettet (#87).',
      );
      process.exit(0);
    }
    stopp(
      `OG_IMAGE_URL peker på ${url}, men bøtta «${DELEKORT.bucket}» finnes ikke (${ENDPOINT}).\n` +
        'Delte lenker får da INGEN forhåndsvisning — dårligere enn før flyttingen. Fjern ' +
        'variabelen, eller opprett bøtta og last opp: bun scripts/upload-og-card.ts',
    );
  }
  if (status === 404) stopp(`${url} → 404. Kortet er ikke lastet opp; kjør skriptet uten «sjekk».`);
  if (status === 403) stopp(`${url} → 403. Objektet er ikke public-read, og ingen skraper når det.`);
  if (status !== 200) stopp(`${url} → ${status}${kode ? ` (${kode})` : ''}.`);
  if (!lik(bytes, lokale)) {
    stopp(
      `${url} serverer ET ANNET BILDE enn public/og.png (${bytes.length} mot ${lokale.length} byte). ` +
        'De to kopiene har drevet fra hverandre — last opp på nytt: bun scripts/upload-og-card.ts',
    );
  }
  console.log(`${url} er bit-identisk med public/og.png (${lokale.length} byte).`);
  process.exit(0);
}

if (kommando !== 'last-opp') {
  stopp(`Ukjent kommando «${kommando}». Bruk: bun scripts/upload-og-card.ts [sjekk]`);
}

// ── last opp ─────────────────────────────────────────────────────────────────

/**
 * Legitimasjon, i denne rekkefølgen — samme kjede som `books`/`lab`/`puzzles`:
 *   1. S3_ACCESS_KEY / S3_SECRET_KEY (samme navn som soulsupport.env)
 *   2. ~/.config/scw/config.yaml — `scw`-profilen som alt står på maskinen
 * Nummer 2 finnes for at dette skal virke fra Vegards maskin uten at en
 * hemmelighet må kopieres inn i enda en fil.
 *
 * Et STILLE svar er det farlige: melder skriptet «ferdig» uten nøkler, ser en
 * maskin som ikke kan laste opp ut som en vellykket flytting.
 */
async function legitimasjon(): Promise<{ accessKeyId: string; secretAccessKey: string; kilde: string }> {
  const { S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
  if (S3_ACCESS_KEY && S3_SECRET_KEY) {
    return { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY, kilde: 'S3_ACCESS_KEY/S3_SECRET_KEY' };
  }
  const konfig = path.join(os.homedir(), '.config', 'scw', 'config.yaml');
  const y = (await Bun.file(konfig).exists())
    ? (Bun.YAML.parse(await Bun.file(konfig).text()) as { access_key?: string; secret_key?: string })
    : null;
  if (y?.access_key && y?.secret_key) {
    return { accessKeyId: y.access_key, secretAccessKey: y.secret_key, kilde: konfig };
  }
  return stopp(
    'Fant ingen legitimasjon for objektlagringen.\n' +
      '  Sett S3_ACCESS_KEY og S3_SECRET_KEY, eller kjør `scw init` slik at\n' +
      `  ${konfig} har access_key og secret_key.`,
  );
}

// Bøtta er en BESLUTNING om skyprosjekt, region og kostnad
// (`flogvit.com/docs/KONVENSJONER.md` → «Objektlagring»), og en bøtte kan ikke
// flyttes mellom prosjekter i Scaleway — feil plassering er gratis å rette mens
// den er tom, og en migrering etterpå. Skriptet oppretter den derfor ALDRI; det
// sier hva som mangler og hvilken avgjørelse det er.
const før = await hent(PUBLISERT);
if (før.status === 404 && før.kode === 'NoSuchBucket') {
  stopp(
    `Bøtta «${DELEKORT.bucket}» finnes ikke på ${ENDPOINT}.\n` +
      'Å opprette den er en beslutning om skyprosjekt, region og kostnad — ikke noe dette\n' +
      'skriptet tar — og en bøtte kan ikke flyttes mellom prosjekter i Scaleway etterpå.\n' +
      `PROSJEKTET er halve avgjørelsen (#87), og kommandoen kan ikke uttrykke det selv:\n` +
      '`scw object bucket create` har ingen `project-id`, så bøtta havner i prosjektet\n' +
      'maskinens scw-profil tilfeldigvis peker på. Sjekk det FØR du oppretter — det var\n' +
      'nettopp den lesingen som la soulsupport-bøttene i feil prosjekt 2026-07-29:\n' +
      `  scw config get default-project-id     # skal være prosjektet «${DELEKORT.project}»\n` +
      `  scw object bucket create name=${DELEKORT.bucket} region=${DELEKORT.region}\n` +
      `  # eller pin det for kallet: SCW_DEFAULT_PROJECT_ID=<id-en til «${DELEKORT.project}»> scw object bucket create …\n` +
      'Merk at S3-navnerommet deles med alle Scaleway-kunder: er navnet opptatt (409),\n' +
      'følger porteføljen `flogvit-lab`-presedensen og prefikser med `flogvit-`.',
  );
}

const { accessKeyId, secretAccessKey, kilde: legitimasjonskilde } = await legitimasjon();

const s3 = new Bun.S3Client({
  accessKeyId,
  secretAccessKey,
  bucket: DELEKORT.bucket,
  region: DELEKORT.region,
  endpoint: ENDPOINT,
});
try {
  await s3.file(DELEKORT.key).write(lokale, { type: 'image/png', acl: 'public-read' });
} catch (e) {
  stopp(`Opplastingen feilet: ${e instanceof Error ? e.message : e}`);
}

// VERIFISER FØR VI SKRIVER UT ADRESSEN, og gjør det ANONYMT. Skrivingen kan
// lykkes uten at objektet kan leses utenfra — det er ACL-en, ikke opplastingen,
// som avgjør om delingen virker. En adresse vi ikke har bevist er nettopp
// løgnen saken handler om: den ser riktig ut i env-fila, og gir et tomt kort hos
// den som fikk lenken.
const etter = await hent(PUBLISERT);
if (etter.status !== 200) {
  stopp(
    `Kortet ble skrevet, men ${PUBLISERT} svarer ${etter.status}${etter.kode ? ` (${etter.kode})` : ''}. ` +
      'Er ACL-en public-read?',
  );
}
if (!lik(etter.bytes, lokale)) {
  stopp(
    `Kortet ble skrevet, men ${PUBLISERT} serverer andre byte enn public/og.png ` +
      `(${etter.bytes.length} mot ${lokale.length}). Nådde ikke opplastingen fram?`,
  );
}

console.log(
  `Delekortet ligger i ${DELEKORT.bucket}/${DELEKORT.key} (${(lokale.length / 1024).toFixed(1)} kB), ` +
    `bekreftet lesbart på ${PUBLISERT}.\nLegitimasjon fra: ${legitimasjonskilde}`,
);
console.log(`\nSett denne i bibel.env og restart tjenesten:\n\nOG_IMAGE_URL=${PUBLISERT}`);
