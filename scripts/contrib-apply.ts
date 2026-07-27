// Skriver reviewede køfiler (free-bible/contrib/queue/<id>.json med
// review.status ≠ pending) tilbake til bibel-databasen via det token-gatede
// admin-API-et, og arkiverer filene til contrib/queue/archive/.
//
// REKKEFØLGE: kjør free-bibles contrib/export.mjs FØR dette skriptet —
// export leser godkjente filer fra queue/, apply flytter dem til archive/.
// (export.mjs leser også archive/, så feil rekkefølge er ikke tap, bare rot.)
//
// Bruk:
//   CONTRIB_TOKEN=… bun scripts/contrib-apply.ts
//   CONTRIB_TOKEN=… BIBLE_URL=http://localhost:8080 bun scripts/contrib-apply.ts

import fs from 'node:fs';
import path from 'node:path';

const BIBLE_URL = (process.env.BIBLE_URL || 'https://bible.flogvit.com').replace(/\/$/, '');
const TOKEN = process.env.CONTRIB_TOKEN;
const FREE_BIBLE_DIR = process.env.FREE_BIBLE_DIR
  ? path.resolve(process.env.FREE_BIBLE_DIR)
  : path.join(process.cwd(), '..', 'free-bible');
const QUEUE_DIR = path.join(FREE_BIBLE_DIR, 'contrib', 'queue');
const ARCHIVE_DIR = path.join(QUEUE_DIR, 'archive');

if (!TOKEN) {
  console.error('CONTRIB_TOKEN mangler (samme verdi som i bibel-tjenestens env).');
  process.exit(1);
}
if (!fs.existsSync(QUEUE_DIR)) {
  console.log(`Ingen kø (${QUEUE_DIR} finnes ikke) — ingenting å gjøre.`);
  process.exit(0);
}

const updates: { id: number; payload: Record<string, unknown> }[] = [];
for (const name of fs.readdirSync(QUEUE_DIR)) {
  if (!/^\d+\.json$/.test(name)) continue;
  const file = path.join(QUEUE_DIR, name);
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    console.warn(`  ! ${name}: uleselig JSON (${error}) — hopper over`);
    continue;
  }
  const status = (doc.review as { status?: string } | undefined)?.status;
  if (!status || status === 'pending') continue;
  updates.push({ id: parseInt(name, 10), payload: doc });
}

if (updates.length === 0) {
  console.log('contrib-apply: ingen reviewede køfiler.');
  process.exit(0);
}

const res = await fetch(`${BIBLE_URL}/api/contrib/apply`, {
  method: 'POST',
  headers: { 'x-contrib-token': TOKEN, 'content-type': 'application/json' },
  body: JSON.stringify({ updates }),
});
if (!res.ok) {
  console.error(`POST /api/contrib/apply → ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { applied, failed } = (await res.json()) as { applied: number; failed: number[] };

fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
let archived = 0;
for (const update of updates) {
  if (failed.includes(update.id)) continue;
  fs.renameSync(path.join(QUEUE_DIR, `${update.id}.json`), path.join(ARCHIVE_DIR, `${update.id}.json`));
  archived++;
}

console.log(
  `contrib-apply: ${applied} skrevet tilbake til ${BIBLE_URL}, ${archived} arkivert` +
    (failed.length ? `, FEILET: ${failed.join(', ')}` : ''),
);
