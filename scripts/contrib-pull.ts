// Henter ventende contrib-innsendinger fra bibel-API-et og skriver dem som
// køfiler til free-bible/contrib/queue/<id>.json. free-bible kjenner ikke
// databasen — fila ER kontrakten (free-bible-contrib/1); filnavn = DB-id gjør
// rundturen idempotent. Transporten er det token-gatede admin-API-et (aldri
// direkte DB-tilgang herfra, og aldri engangscontainere på VM-en).
//
// Bruk:
//   CONTRIB_TOKEN=… bun scripts/contrib-pull.ts                  # mot prod
//   CONTRIB_TOKEN=… BIBLE_URL=http://localhost:8080 bun scripts/contrib-pull.ts
//
// Kjøres fra bibel/. FREE_BIBLE_DIR overstyrer målkatalogen (samme oppløsning
// som import-bible.ts).

import fs from 'node:fs';
import path from 'node:path';

const BIBLE_URL = (process.env.BIBLE_URL || 'https://bible.flogvit.com').replace(/\/$/, '');
const TOKEN = process.env.CONTRIB_TOKEN;
const FREE_BIBLE_DIR = process.env.FREE_BIBLE_DIR
  ? path.resolve(process.env.FREE_BIBLE_DIR)
  : path.join(process.cwd(), '..', 'free-bible');
const QUEUE_DIR = path.join(FREE_BIBLE_DIR, 'contrib', 'queue');

if (!TOKEN) {
  console.error('CONTRIB_TOKEN mangler (samme verdi som i bibel-tjenestens env).');
  process.exit(1);
}
if (!fs.existsSync(path.join(FREE_BIBLE_DIR, 'contrib'))) {
  console.error(`Finner ikke free-bible/contrib under ${FREE_BIBLE_DIR}`);
  process.exit(1);
}

interface PendingResponse {
  submissions: { id: number; status: string; payload: Record<string, unknown> }[];
}

const res = await fetch(`${BIBLE_URL}/api/contrib/pending`, {
  headers: { 'x-contrib-token': TOKEN },
});
if (!res.ok) {
  console.error(`GET /api/contrib/pending → ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { submissions } = (await res.json()) as PendingResponse;

fs.mkdirSync(QUEUE_DIR, { recursive: true });

let written = 0;
let unchanged = 0;
let skipped = 0;
for (const submission of submissions) {
  const file = path.join(QUEUE_DIR, `${submission.id}.json`);
  const next = JSON.stringify(submission.payload, null, 2) + '\n';
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    try {
      const doc = JSON.parse(existing) as { review?: { status?: string } };
      if (doc.review?.status && doc.review.status !== 'pending') {
        console.warn(`  ! ${submission.id}.json har lokal review i gang (${doc.review.status}) — hopper over`);
        skipped++;
        continue;
      }
    } catch {
      // Uleselig lokal fil overskrives med serverens sannhet.
    }
    if (existing === next) {
      unchanged++;
      continue;
    }
  }
  fs.writeFileSync(file, next);
  written++;
}

console.log(
  `contrib-pull: ${submissions.length} pending fra ${BIBLE_URL} → ` +
    `${written} skrevet, ${unchanged} uendret, ${skipped} hoppet over (queue: ${QUEUE_DIR})`,
);
