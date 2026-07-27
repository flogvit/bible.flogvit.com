// Lesere for verk (artikler/bøker) knyttet til vers via KVN-spenn.
// KVN her er bit-shift-kodingen fra kvn/src/types.ts: (book<<20)|(chapter<<12)|
// (verse<<4)|part — monoton i (bok,kapittel,vers), så «dekker dette verset» er
// en ren BETWEEN-sjekk. Tabellene fylles av import-bible.ts fra
// free-bible/generate/verse_works/ (contrib-pipelinen).

import { getSql } from './db.ts';

export interface WorkRef {
  work_id: string;
  kvn_from: number;
  kvn_to: number;
  kvn_ref: string | null;
  level: string; // verse | passage | chapter | book
  ref_kind: string; // cites | discusses | covers_passage
  where_page: number | null;
  where_section: string | null;
  kind: string; // article | book
  title: string | null;
  authors: string | null;
  year: number | null;
  container: string | null;
  doi: string | null;
  isbn13: string | null;
  openlibrary_id: string | null;
  url: string | null;
  contributors: string | null;
}

export function encodeKvn(bookId: number, chapter: number, verse: number): number {
  return (bookId << 20) | (chapter << 12) | (verse << 4);
}

/** Alle verk-refs som overlapper kapitlet (inkl. bok-spenn som omslutter det). */
export async function getWorksForChapter(bookId: number, chapter: number): Promise<WorkRef[]> {
  const sql = getSql();
  const from = encodeKvn(bookId, chapter, 0);
  const to = encodeKvn(bookId, chapter, 255) + 15;
  const rows = (await sql`
    SELECT r.work_id, r.kvn_from, r.kvn_to, r.kvn_ref, r.level, r.ref_kind,
           r.where_page, r.where_section,
           w.kind, w.title, w.authors, w.year, w.container, w.doi, w.isbn13,
           w.openlibrary_id, w.url, w.contributors
    FROM work_verse_refs r
    JOIN works w ON w.id = r.work_id
    WHERE r.book_id = ${bookId}
      AND r.kvn_from <= ${to} AND r.kvn_to >= ${from}
    ORDER BY r.kvn_from, w.year DESC
  `) as WorkRef[];
  return rows.map((row) => ({ ...row, kvn_from: Number(row.kvn_from), kvn_to: Number(row.kvn_to) }));
}

/** Lenkemål for et verk — vi viser aldri innhold, kun lenker ut. */
export function workHref(work: Pick<WorkRef, 'doi' | 'url' | 'isbn13' | 'openlibrary_id'>): string | null {
  if (work.doi) return `https://doi.org/${work.doi}`;
  if (work.url) return work.url;
  if (work.openlibrary_id) return `https://openlibrary.org/books/${work.openlibrary_id}`;
  if (work.isbn13) return `https://openlibrary.org/isbn/${work.isbn13}`;
  return null;
}
