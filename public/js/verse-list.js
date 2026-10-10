// Verslistenes adresseform (#133), delt av lesesida (skriver), /lister/:id
// (serveren og user.js, som leser) — samme grep som reading-progress.js og
// verse-hash.js: én representasjon, ikke tre som driver fra hverandre.
//
// Formen er gamle appens og manuskriptenes `verses`: `<bokslug>-<kap>-<vers>`,
// eller `<bokslug>-<kap>-<fra>-<til>` for en rekke. Den ligger allerede i synkede
// lister, så den kan ikke byttes. Ingen side-effekter ved import.

/** `joh-3-16`. */
export function verseListRef(slug, chapter, verse) {
  return `${slug}-${chapter}-${verse}`;
}

/**
 * `joh-3-16` → `{ slug: 'joh', chapter: 3, start: 16, end: 16 }`, og
 * `joh-3-16-18` → `end: 18`. Alt annet gir null.
 */
export function parseVerseListRef(ref) {
  const m = /^(.+?)-(\d+)-(\d+)(?:-(\d+))?$/.exec(String(ref ?? '').trim());
  if (!m) return null;
  const chapter = Number(m[2]);
  const start = Number(m[3]);
  if (chapter < 1 || start < 1) return null;
  const end = m[4] === undefined ? start : Number(m[4]);
  return { slug: m[1].toLowerCase(), chapter, start, end: end > start ? end : start };
}

/** Lista med `ref` lagt til (`on`) eller fjernet — samme vers to ganger er ett vers. */
export function withRef(list, ref, on, now = Date.now()) {
  const refs = (list.refs || []).filter((r) => r !== ref);
  if (on) refs.push(ref);
  return { ...list, refs, updatedAt: now };
}
