// FLYTTELASSET for delekortet (#66) — at kortet KAN flyttes til objektlagring,
// og at bøttekopien ikke kan drive fra `public/og.png` i stillhet etterpå.
//
// `share-card.test.ts` holder på at `OG_IMAGE_URL` flytter ADRESSEN. Det er
// halve flyttingen: ingenting flyttet BILDET, og ingenting holdt de to kopiene
// like. Runbooken har tre grunner til å lage kortet på nytt, og fra dagen
// variabelen er satt ville prod servert et gammelt kort for alltid — 200, ingen
// loggrad, synlig bare for den som fikk lenken.
//
// Vaktene er formulert på ADRESSEN, ikke på at en PUT ble sendt: adressen
// skriptet SKRIVER UT må servere nøyaktig bytene i `public/og.png`, og et avvik
// mellom de to må si fra HØYLYTT. Da består en fiks som flytter kortet på en
// annen måte like gjerne, så lenge ingen adresse lover et bilde den ikke
// leverer.
//
// Skriptet kjøres som et EKTE underprosess mot en EKTE lyttende S3-flate — det
// er en egen søm, som CLI-en i `publications-review-cli.test.ts`. Et
// funksjonskall ville aldri sett at opplastingen og verifiseringen bruker samme
// adresse, som er hele poenget.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DELEKORT } from '../src/lib/share-card.ts';

// `.pathname` er PROSENTKODET: i et arbeidstre under `trær/` blir katalogen
// `tr%C3%A6r`, og `Bun.spawn` melder da ENOENT på «bun» framfor på cwd-en.
const ROOT = Bun.fileURLToPath(new URL('..', import.meta.url));

const KORT = new Uint8Array(await Bun.file(`${ROOT}public/og.png`).arrayBuffer());
const STI = `${DELEKORT.bucket}/${DELEKORT.key}`;

const objekter = new Map<string, Uint8Array>();
let bøtter = new Set<string>([DELEKORT.bucket]);
let putter: string[] = [];
/** En PUT som ser vellykket ut, men ikke lagrer noe — den stille varianten. */
let svelgPut = false;

const feil = (kode: string) =>
  new Response(`<?xml version="1.0"?><Error><Code>${kode}</Code></Error>`, {
    status: 404,
    headers: { 'content-type': 'application/xml' },
  });

const stubb = Bun.serve({
  port: 0,
  async fetch(req) {
    const sti = decodeURIComponent(new URL(req.url).pathname).replace(/^\//, '');
    const bøtte = sti.split('/')[0] ?? '';
    if (!bøtter.has(bøtte)) return feil('NoSuchBucket');
    if (req.method === 'PUT') {
      const bytes = new Uint8Array(await req.arrayBuffer());
      putter.push(sti);
      if (!svelgPut) objekter.set(sti, bytes);
      return new Response('', { status: 200 });
    }
    const funn = objekter.get(sti);
    if (!funn) return feil('NoSuchKey');
    return new Response(funn.slice().buffer, { status: 200, headers: { 'content-type': 'image/png' } });
  },
});
const BASE = `http://localhost:${stubb.port}`;

afterAll(() => stubb.stop(true));

beforeEach(() => {
  objekter.clear();
  bøtter = new Set([DELEKORT.bucket]);
  putter = [];
  svelgPut = false;
});

async function kjør(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(['bun', 'scripts/upload-og-card.ts', ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      S3_ENDPOINT: BASE,
      S3_ACCESS_KEY: 'test-access',
      S3_SECRET_KEY: 'test-secret',
      OG_IMAGE_URL: '',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out, err };
}

/** Env-linja skriptet ber deg lime inn i `bibel.env` — det er DEN som blir prod. */
const utskrevetUrl = (out: string) => /^OG_IMAGE_URL=(\S+)$/m.exec(out)?.[1];

const bitIdentisk = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('flyttelasset for delekortet', () => {
  // ADRESSEN. Ikke «en PUT ble sendt» — at adressen vi ber Vegard sette i
  // `bibel.env` faktisk serverer kortet. Alt annet er en adresse som ser riktig
  // ut i env-fila og gir et tomt kort hos den som fikk lenken.
  test('adressen skriptet skriver ut serverer nøyaktig public/og.png', async () => {
    const { code, out, err } = await kjør();
    expect({ code, err }).toEqual({ code: 0, err: '' });

    const url = utskrevetUrl(out);
    expect(url).toBeTruthy();

    const res = await fetch(url!);
    expect(res.status).toBe(200);
    expect(bitIdentisk(new Uint8Array(await res.arrayBuffer()), KORT)).toBe(true);
  });

  // Kortet skrives HVER gang, som i `books`: det koster en håndfull kilobyte og
  // fjerner hele klassen «bildet forsvant fordi noen ryddet i bøtta».
  test('kortet skrives hver gang, ikke bare første', async () => {
    expect((await kjør()).code).toBe(0);
    expect((await kjør()).code).toBe(0);
    expect(putter).toEqual([STI, STI]);
  });

  // DRIFTEN — hele grunnen til at dette er et program. Bøttekopien blir gammel
  // i det øyeblikket kortet lages på nytt, og avviket gir verken 404, 5xx eller
  // en loggrad noe sted.
  test('en bøttekopi som har drevet fra kilden sier fra, og lar seg rette', async () => {
    await kjør();
    objekter.set(STI, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));

    const avvik = await kjør(['sjekk']);
    expect(avvik.code).not.toBe(0);
    expect(avvik.err).toContain('public/og.png');

    expect((await kjør()).code).toBe(0);
    expect((await kjør(['sjekk'])).code).toBe(0);
  });

  // `sjekk` måler den PUBLISERTE adressen, ikke en vi har regnet oss fram til.
  // Er `OG_IMAGE_URL` satt til noe annet enn der vi lastet opp, er det den
  // leseren møter — og da er det den som må stemme.
  test('sjekk måler OG_IMAGE_URL når den er satt', async () => {
    await kjør();
    objekter.set(`${DELEKORT.bucket}/annet.png`, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]));

    const feilAdresse = await kjør(['sjekk'], { OG_IMAGE_URL: `${BASE}/${DELEKORT.bucket}/annet.png` });
    expect(feilAdresse.code).not.toBe(0);

    const riktig = await kjør(['sjekk'], { OG_IMAGE_URL: `${BASE}/${STI}` });
    expect(riktig.code).toBe(0);
  });

  // En PUT som svarer 200 uten at objektet blir lesbart er den STILLE varianten
  // — det er ACL-en, ikke opplastingen, som avgjør om delingen virker. Skriptet
  // ville ellers skrevet ut en adresse ingen har bevist, og env-fila hadde sett
  // ferdig ut.
  test('en opplasting som ikke tok skriver ingen adresse', async () => {
    svelgPut = true;
    const { code, out, err } = await kjør();
    expect(code).not.toBe(0);
    expect(utskrevetUrl(out)).toBeUndefined();
    expect(err).toContain('Kortet ble skrevet, men');
  });

  // Bøtta er en BESLUTNING om skyprosjekt, region og kostnad, og kan ikke
  // flyttes mellom prosjekter etterpå. Skriptet oppretter den derfor aldri — og
  // et stille «ferdig» ville fått en maskin uten bøtte til å se ferdig ut.
  test('bøtte som ikke finnes gir høylytt stopp, ikke en stille suksess', async () => {
    bøtter = new Set();
    const { code, out, err } = await kjør();
    expect(code).not.toBe(0);
    expect(utskrevetUrl(out)).toBeUndefined();
    expect(err).toContain(DELEKORT.bucket);
    expect(err).toContain('beslutning');
    expect(putter.length).toBe(0);
  });

  // Legitimasjonskjeden er env → `~/.config/scw/config.yaml`. Finnes ingen av
  // delene, skal den stoppe FØR den later som den lastet opp.
  test('uten nøkler stopper den før den later som den lastet opp', async () => {
    const tomtHjem = mkdtempSync(join(tmpdir(), 'bibel-og-'));
    const { code, out, err } = await kjør([], {
      S3_ACCESS_KEY: '',
      S3_SECRET_KEY: '',
      HOME: tomtHjem,
    });
    expect(code).not.toBe(0);
    expect(utskrevetUrl(out)).toBeUndefined();
    expect(err).toContain('S3_ACCESS_KEY');
    expect(putter.length).toBe(0);
  });
});
