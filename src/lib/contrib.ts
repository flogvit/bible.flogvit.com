// Bruker-innsendte artikler/bøker med versreferanser (free-bible-contrib/1).
//
// Kontrakten bor i free-bible/contrib/verse-ref-contrib.schema.json. Serveren
// bygger HELE skjemadokumentet selv (submitted/review settes aldri av
// klienten), og KVN-REGELEN gjelder: bidragsyteren oppgir kun `raw` +
// `context_translation`; kvnFrom/kvnTo fylles av free-bibles pipeline/reviewer.
// PII (e-post, konto-id utover user_id-strengen) blir i denne databasen; kun
// visningsnavn eksporteres, og bare når credit=true.

import { getSql } from './db.ts';
import type { SessionUser } from './session.ts';

export type ContribKind = 'article_verse_refs' | 'book_verse_refs' | 'song_verse_refs';
export type ContribStatus = 'pending' | 'needs_info' | 'approved' | 'rejected';

export const CONTRIB_STATUSES = ['pending', 'needs_info', 'approved', 'rejected'] as const;
const REF_KINDS = ['cites', 'discusses', 'covers_passage'] as const;
const KINDS: ContribKind[] = ['article_verse_refs', 'book_verse_refs', 'song_verse_refs'];

export interface ContribRefInput {
  raw: string;
  kind: (typeof REF_KINDS)[number];
  confirmed?: boolean;
  where?: { page?: number; chapter_or_section?: string; quote?: string };
}

export interface ContribTargetInput {
  catalog_id?: string;
  doi?: string;
  isbn13?: string;
  isbn10?: string;
  openlibrary_id?: string;
  song_id?: string;
  url?: string;
  freetext?: { title: string; authors?: string[]; year?: number; publisher_or_journal?: string };
}

export interface ContribInput {
  kind: ContribKind;
  target: ContribTargetInput;
  context_translation: string;
  refs: ContribRefInput[];
  comment?: string;
  credit?: boolean;
  credit_name?: string;
}

const TARGET_KEYS = ['catalog_id', 'doi', 'isbn13', 'isbn10', 'openlibrary_id', 'song_id', 'url', 'freetext'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optStr(v: unknown, max: number, name: string): { ok: true; value?: string } | { ok: false; error: string } {
  if (v === undefined || v === null || v === '') return { ok: true };
  if (typeof v !== 'string') return { ok: false, error: `${name} must be a string` };
  if (v.length > max) return { ok: false, error: `${name} too long (max ${max})` };
  return { ok: true, value: v };
}

/** Validerer klient-input. Presise 400-meldinger; refuserer ALDRI uparserbare refs. */
export function validateContribInput(
  body: unknown,
): { ok: true; input: ContribInput } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'Missing body' };

  const kind = body.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as ContribKind)) {
    return { ok: false, error: 'Invalid kind' };
  }

  const ctx = body.context_translation;
  if (typeof ctx !== 'string' || !ctx.trim() || ctx.length > 40) {
    return { ok: false, error: 'Missing context_translation' };
  }

  // Target: minst én kjent identifikator; ukjente nøkler avvises.
  if (!isRecord(body.target)) return { ok: false, error: 'Missing target' };
  const rawTarget = body.target;
  for (const key of Object.keys(rawTarget)) {
    if (!(TARGET_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `Unknown target field: ${key}` };
    }
  }
  const target: ContribTargetInput = {};
  for (const key of ['catalog_id', 'url'] as const) {
    const r = optStr(rawTarget[key], 500, `target.${key}`);
    if (!r.ok) return r;
    if (r.value) target[key] = r.value.trim();
  }
  {
    const r = optStr(rawTarget.doi, 200, 'target.doi');
    if (!r.ok) return r;
    if (r.value) {
      const doi = r.value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      if (!/^10\./.test(doi)) return { ok: false, error: 'Invalid DOI' };
      target.doi = doi;
    }
  }
  {
    const r = optStr(rawTarget.isbn13, 40, 'target.isbn13');
    if (!r.ok) return r;
    if (r.value) {
      const isbn = r.value.replace(/[-\s]/g, '');
      if (/^97[89]\d{10}$/.test(isbn)) target.isbn13 = isbn;
      else if (/^\d{9}[\dXx]$/.test(isbn)) target.isbn10 = isbn.toUpperCase();
      else return { ok: false, error: 'Invalid ISBN' };
    }
  }
  {
    const r = optStr(rawTarget.isbn10, 20, 'target.isbn10');
    if (!r.ok) return r;
    if (r.value) {
      const isbn = r.value.replace(/[-\s]/g, '');
      if (!/^\d{9}[\dXx]$/.test(isbn)) return { ok: false, error: 'Invalid ISBN' };
      target.isbn10 = isbn.toUpperCase();
    }
  }
  {
    const r = optStr(rawTarget.openlibrary_id, 30, 'target.openlibrary_id');
    if (!r.ok) return r;
    if (r.value) target.openlibrary_id = r.value.trim();
  }
  {
    const r = optStr(rawTarget.song_id, 30, 'target.song_id');
    if (!r.ok) return r;
    if (r.value) {
      if (!/^song-\d+$/.test(r.value.trim())) return { ok: false, error: 'Invalid song_id' };
      target.song_id = r.value.trim();
    }
  }
  if (rawTarget.freetext !== undefined) {
    if (!isRecord(rawTarget.freetext)) return { ok: false, error: 'Invalid target.freetext' };
    const ft = rawTarget.freetext;
    const title = optStr(ft.title, 500, 'target.freetext.title');
    if (!title.ok) return title;
    if (title.value?.trim()) {
      const freetext: NonNullable<ContribTargetInput['freetext']> = { title: title.value.trim() };
      if (Array.isArray(ft.authors)) {
        const authors = ft.authors
          .filter((a): a is string => typeof a === 'string' && !!a.trim())
          .map((a) => a.trim().slice(0, 200))
          .slice(0, 20);
        if (authors.length) freetext.authors = authors;
      }
      const year = Number(ft.year);
      if (Number.isInteger(year) && year > 0 && year < 3000) freetext.year = year;
      const pub = optStr(ft.publisher_or_journal, 300, 'target.freetext.publisher_or_journal');
      if (!pub.ok) return pub;
      if (pub.value?.trim()) freetext.publisher_or_journal = pub.value.trim();
      target.freetext = freetext;
    }
  }
  if (Object.keys(target).length === 0) {
    return { ok: false, error: 'Target needs at least one identifier or a title' };
  }

  // Refs.
  if (!Array.isArray(body.refs) || body.refs.length === 0) {
    return { ok: false, error: 'Missing refs array' };
  }
  if (body.refs.length > 100) return { ok: false, error: 'Too many refs (max 100)' };
  const refs: ContribRefInput[] = [];
  for (const [i, rawRef] of body.refs.entries()) {
    if (!isRecord(rawRef)) return { ok: false, error: `Invalid ref #${i + 1}` };
    const raw = rawRef.raw;
    if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: `Ref #${i + 1}: missing raw` };
    if (raw.length > 200) return { ok: false, error: `Ref #${i + 1}: raw too long (max 200)` };
    const refKind = rawRef.kind;
    if (typeof refKind !== 'string' || !(REF_KINDS as readonly string[]).includes(refKind)) {
      return { ok: false, error: `Ref #${i + 1}: invalid kind` };
    }
    const ref: ContribRefInput = { raw: raw.trim(), kind: refKind as ContribRefInput['kind'] };
    if (rawRef.confirmed === true) ref.confirmed = true;
    if (rawRef.where !== undefined) {
      if (!isRecord(rawRef.where)) return { ok: false, error: `Ref #${i + 1}: invalid where` };
      const where: NonNullable<ContribRefInput['where']> = {};
      if (rawRef.where.page !== undefined && rawRef.where.page !== null && rawRef.where.page !== '') {
        const page = Number(rawRef.where.page);
        if (!Number.isInteger(page) || page < 1) return { ok: false, error: `Ref #${i + 1}: invalid page` };
        where.page = page;
      }
      const section = optStr(rawRef.where.chapter_or_section, 200, `ref #${i + 1} chapter_or_section`);
      if (!section.ok) return section;
      if (section.value?.trim()) where.chapter_or_section = section.value.trim();
      const quote = optStr(rawRef.where.quote, 300, `ref #${i + 1} quote`);
      if (!quote.ok) return quote;
      if (quote.value?.trim()) where.quote = quote.value.trim();
      if (Object.keys(where).length) ref.where = where;
    }
    refs.push(ref);
  }

  const comment = optStr(body.comment, 2000, 'comment');
  if (!comment.ok) return comment;
  const creditName = optStr(body.credit_name, 120, 'credit_name');
  if (!creditName.ok) return creditName;

  const input: ContribInput = {
    kind: kind as ContribKind,
    target,
    context_translation: ctx.trim(),
    refs,
  };
  if (comment.value?.trim()) input.comment = comment.value.trim();
  if (body.credit === true) {
    input.credit = true;
    if (creditName.value?.trim()) input.credit_name = creditName.value.trim();
  }
  return { ok: true, input };
}

/** Bygger hele free-bible-contrib/1-dokumentet server-side. */
export function buildSubmissionPayload(input: ContribInput, user: SessionUser): Record<string, unknown> {
  const by: Record<string, unknown> = { user_id: String(user.id) };
  if (input.credit) {
    const name = (input.credit_name || user.displayName || '').trim();
    if (name) by.name = name;
    by.credit = true;
  }
  return {
    schema: 'free-bible-contrib/1',
    kind: input.kind,
    target: input.target,
    refs: input.refs.map((r) => ({
      raw: r.raw,
      context_translation: input.context_translation,
      kind: r.kind,
      ...(r.confirmed ? { confirmed_by_contributor: true } : {}),
      ...(r.where ? { where: r.where } : {}),
    })),
    ...(input.comment ? { comment: input.comment } : {}),
    submitted: {
      at: new Date().toISOString(),
      by,
      client: 'bible.flogvit.com',
    },
    review: { status: 'pending' },
  };
}

export interface ContribRow {
  id: number;
  user_id: number;
  kind: string;
  status: ContribStatus;
  payload: Record<string, unknown>;
  review_note: string | null;
  created_at: number;
  updated_at: number;
  reviewed_at: number | null;
}

interface DbRow {
  id: number | bigint;
  user_id: number;
  kind: string;
  status: string;
  payload: unknown;
  review_note: string | null;
  created_at: number | bigint;
  updated_at: number | bigint;
  reviewed_at: number | bigint | null;
}

function toRow(r: DbRow): ContribRow {
  return {
    id: Number(r.id),
    user_id: r.user_id,
    kind: r.kind,
    status: r.status as ContribStatus,
    payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>,
    review_note: r.review_note,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    reviewed_at: r.reviewed_at === null ? null : Number(r.reviewed_at),
  };
}

export async function createSubmission(input: ContribInput, user: SessionUser): Promise<number> {
  const sql = getSql();
  const payload = buildSubmissionPayload(input, user);
  const now = Date.now();
  return await sql.begin(async (tx) => {
    await tx`
      INSERT INTO contrib_submissions (user_id, kind, status, payload, created_at, updated_at)
      VALUES (${user.id}, ${input.kind}, 'pending', ${JSON.stringify(payload)}, ${now}, ${now})
    `;
    const idRows = (await tx`SELECT LAST_INSERT_ID() AS id`) as { id: number | bigint }[];
    return Number(idRows[0]!.id);
  });
}

export async function listSubmissionsForUser(userId: number): Promise<ContribRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, user_id, kind, status, payload, review_note, created_at, updated_at, reviewed_at
    FROM contrib_submissions
    WHERE user_id = ${userId} ORDER BY updated_at DESC
  `) as DbRow[];
  return rows.map(toRow);
}

/**
 * Svar fra bidragsyter på needs_info: appender på payload.comment og setter
 * status tilbake til pending. Kun egen rad, kun i needs_info-tilstand.
 */
export async function respondToSubmission(id: number, userId: number, message: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, user_id, kind, status, payload, review_note, created_at, updated_at, reviewed_at
    FROM contrib_submissions
    WHERE id = ${id} AND user_id = ${userId} AND status = 'needs_info'
  `) as DbRow[];
  const row = rows[0];
  if (!row) return false;
  const payload = toRow(row).payload;
  const stamp = new Date().toISOString().slice(0, 10);
  const previous = typeof payload.comment === 'string' && payload.comment ? `${payload.comment}\n\n` : '';
  payload.comment = `${previous}[${stamp} svar fra bidragsyter]\n${message.trim()}`.slice(0, 4000);
  const review = isRecord(payload.review) ? payload.review : {};
  payload.review = { ...review, status: 'pending' };
  await sql`
    UPDATE contrib_submissions
    SET payload = ${JSON.stringify(payload)}, status = 'pending', updated_at = ${Date.now()}
    WHERE id = ${id}
  `;
  return true;
}

export async function listPendingSubmissions(): Promise<ContribRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, user_id, kind, status, payload, review_note, created_at, updated_at, reviewed_at
    FROM contrib_submissions
    WHERE status = 'pending' ORDER BY updated_at ASC
  `) as DbRow[];
  return rows.map(toRow);
}

/**
 * Skriver et reviewet payload-dokument (fra free-bible/contrib/queue) tilbake:
 * hele payloaden erstattes, status/review_note/reviewed_at speiles fra
 * payload.review. Ukjent id eller ugyldig status → false.
 */
export async function applyReviewedPayload(id: number, payload: unknown): Promise<boolean> {
  if (!isRecord(payload) || !isRecord(payload.review)) return false;
  const status = payload.review.status;
  if (typeof status !== 'string' || !(CONTRIB_STATUSES as readonly string[]).includes(status)) return false;
  const note = typeof payload.review.note === 'string' ? payload.review.note : null;
  const sql = getSql();
  const existing = (await sql`SELECT id FROM contrib_submissions WHERE id = ${id}`) as { id: number }[];
  if (!existing.length) return false;
  const now = Date.now();
  await sql`
    UPDATE contrib_submissions
    SET payload = ${JSON.stringify(payload)}, status = ${status}, review_note = ${note},
        updated_at = ${now}, reviewed_at = ${status === 'pending' ? null : now}
    WHERE id = ${id}
  `;
  return true;
}
