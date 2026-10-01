// Full-text search in one edition.
//
// `searchVerses()` in `src/lib/bible.ts` matches the query as ONE substring and
// has no filters — right for the site's search box, wrong for a model, which
// writes "forgive sins" and expects both words anywhere in the verse, and asks
// for "only in the gospels". Every term must match (the same rule the site's
// story/theme/person searches already use), quoted phrases stay whole, and the
// book range narrows the scan. `verses` is scoped by `bible`, not `language`,
// so no language chain applies (CLAUDE.md, «Språkdimensjon»).

import { getSql } from '../../src/lib/db.ts';

export interface VerseHit {
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface VerseSearch {
  hits: VerseHit[];
  total: number;
}

/** `"forgive sins" grace` → ['forgive sins', 'grace']. */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const m of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (m[1] ?? m[2] ?? '').trim();
    if (term.length >= 2) terms.push(term);
  }
  return terms;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchVerseText(
  query: string,
  bible: string,
  books: { from: number; to: number },
  limit: number,
  offset: number,
): Promise<VerseSearch> {
  const terms = searchTerms(query);
  if (terms.length === 0) return { hits: [], total: 0 };

  const where = ['bible = ?', 'book_id BETWEEN ? AND ?', ...terms.map(() => 'text LIKE ?')].join(' AND ');
  const params = [bible, books.from, books.to, ...terms.map((t) => `%${likeEscape(t)}%`)];
  const sql = getSql();

  const [count] = (await sql.unsafe(`SELECT COUNT(*) AS total FROM verses WHERE ${where}`, params)) as {
    total: number | bigint;
  }[];
  const hits = (await sql.unsafe(
    `SELECT book_id, chapter, verse, text FROM verses WHERE ${where}
     ORDER BY book_id, chapter, verse LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )) as VerseHit[];

  return { hits, total: Number(count?.total ?? 0) };
}
