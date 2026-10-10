// Synk av egne oversettelser mot kontoen (#14, #134).
//
// Bodde inne i translations.js og kjørte derfor bare på /oversettelser. Plus
// lover egne oversettelser «tilgjengelige overalt», men på en ny enhet viste
// lesesiden OSNB med «har ikke dette kapittelet» og en velger uten den egne
// bibelen — helt til leseren tilfeldigvis var innom /oversettelser. Modulen
// deles nå av den sida og lesesiden (user-bibles.js), så det er ÉN synk og
// ikke to som kan drive fra hverandre.
//
// Protokollen er uendret: POST /api/sync/user-bibles tar imot lokal metadata
// (inkl. tombstones) og svarer med HELE serverlista; kapitlene går for seg.
// Ingen side-effekter ved import.

import {
  addUserBible,
  getUserBibles,
  getAllUserBibles,
  deleteUserBible,
  putAll,
  getAllChapterKeys,
  getChapter,
} from './offline-db.js';

/** Sender lokal metadata (inkl. slettede) og får serverens fulle liste tilbake. */
export async function pushMetadata() {
  const all = await getAllUserBibles();
  const bibles = all.map((b) => ({
    id: b.id,
    name: b.name,
    mappingId: b.mappingId,
    verseCounts: b.verseCounts ?? null,
    uploadedAt: b.uploadedAt,
    deleted: !!b.deleted,
  }));
  const res = await fetch('/api/sync/user-bibles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bibles }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function pushChapters(bibleId) {
  const keys = (await getAllChapterKeys()).filter(([, , bible]) => bible === bibleId);
  for (let i = 0; i < keys.length; i += 100) {
    const batch = await Promise.all(
      keys.slice(i, i + 100).map(async ([bookId, chapter]) => {
        const stored = await getChapter(bookId, chapter, bibleId);
        return { bookId, chapter, data: stored };
      }),
    );
    const res = await fetch(`/api/sync/user-bible-chapters/${encodeURIComponent(bibleId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chapters: batch }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}

/** Sørg for at lokale bibler er fullt opplastet (retry etter nettbrudd). */
async function pushUnsynced() {
  for (const bible of await getUserBibles()) {
    if (bible.syncedAt && bible.syncedAt >= bible.uploadedAt) continue;
    try {
      await pushChapters(bible.id);
      await addUserBible({ ...bible, syncedAt: Date.now() });
    } catch {
      return; // nett borte — prøver ved neste last
    }
  }
}

/**
 * Full avstemming mot kontoen: push det lokale, hent det som mangler, og fjern
 * det som er slettet et annet sted.
 *
 * Slettingen er den halvdelen som manglet. Den gamle løkka hoppet over
 * `deleted` fra serveren og lot den lokale kopien stå — så en oversettelse
 * slettet på A sto igjen på B for alltid, og ble attpåtil sendt TILBAKE ved
 * neste push (den tapte bare fordi tidsstempelet var eldre).
 *
 * Svarer `true` når noe lokalt ble endret, så kalleren vet om den må tegne
 * velgeren på nytt.
 */
export async function syncUserBibles() {
  const server = await pushMetadata();
  await pushUnsynced();
  const local = new Map((await getAllUserBibles()).map((b) => [b.id, b]));
  let changed = false;
  for (const bible of server.bibles || []) {
    const mine = local.get(bible.id);
    if (bible.deleted) {
      if (mine && !mine.deleted) {
        // Serverens tidsstempel, ikke nå: en tombstone med «nå» ville sett ut
        // som en NYERE sletting og blitt sendt tilbake ved hver synk.
        await deleteUserBible(bible.id, Number(bible.uploadedAt) || Date.now());
        changed = true;
      }
      continue;
    }
    if (mine) continue; // har den (eller har slettet den selv — pushen over bar det)
    const res = await fetch(`/api/sync/user-bible-chapters/${encodeURIComponent(bible.id)}`);
    if (!res.ok) continue;
    const { chapters } = await res.json();
    await putAll('chapters', (chapters || []).map((ch) => ch.data).filter(Boolean));
    await addUserBible({
      id: bible.id,
      name: bible.name,
      mappingId: bible.mappingId,
      verseCounts: bible.verseCounts ?? null,
      uploadedAt: Number(bible.uploadedAt) || Date.now(),
      syncedAt: Date.now(),
    });
    changed = true;
  }
  return changed;
}
