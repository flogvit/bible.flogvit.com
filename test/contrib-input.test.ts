// Ren validerings-/payload-logikk for contrib — ingen DB.
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { buildSubmissionPayload, validateContribInput } from '../src/lib/contrib.ts';
import type { SessionUser } from '../src/lib/session.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const USER: SessionUser = {
  id: 990001,
  email: 'test@example.com',
  displayName: 'Test Bruker',
  verified: true,
  plus: false,
  plusUntil: null,
  csrf: '',
};

const VALID = {
  kind: 'article_verse_refs',
  target: { doi: '10.4102/hts.v57i3/4.1889' },
  context_translation: 'osnb',
  refs: [{ raw: 'Esra 3,1', kind: 'discusses', confirmed: true, where: { page: 4 } }],
  comment: 'Hovedstedet artikkelen analyserer.',
};

describe('validateContribInput', () => {
  test('gyldig artikkel-innsending', () => {
    const r = validateContribInput(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.kind).toBe('article_verse_refs');
    expect(r.input.target.doi).toBe('10.4102/hts.v57i3/4.1889');
    expect(r.input.refs[0]!.where!.page).toBe(4);
  });

  test('doi.org-prefiks strippes', () => {
    const r = validateContribInput({ ...VALID, target: { doi: 'https://doi.org/10.1000/abc' } });
    expect(r.ok && r.input.target.doi === '10.1000/abc').toBe(true);
  });

  test('ugyldig doi avvises', () => {
    const r = validateContribInput({ ...VALID, target: { doi: '99.4102/x' } });
    expect(r.ok).toBe(false);
  });

  test('manglende refs avvises', () => {
    const r = validateContribInput({ ...VALID, refs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Missing refs array');
  });

  test('tomt target avvises, freetext med tittel holder', () => {
    expect(validateContribInput({ ...VALID, target: {} }).ok).toBe(false);
    const r = validateContribInput({
      ...VALID,
      kind: 'book_verse_refs',
      target: { freetext: { title: 'Psalms 51-100', authors: ['Hossfeld', 'Zenger'], year: 2005 } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.target.freetext!.authors).toEqual(['Hossfeld', 'Zenger']);
  });

  test('isbn13 normaliseres, isbn10 i isbn-feltet flyttes', () => {
    const r13 = validateContribInput({ ...VALID, target: { isbn13: '978-0-8006-6061-1' } });
    expect(r13.ok && r13.input.target.isbn13 === '9780800660611').toBe(true);
    const r10 = validateContribInput({ ...VALID, target: { isbn13: '0-8006-6061-x' } });
    expect(r10.ok && r10.input.target.isbn10 === '080066061X').toBe(true);
    expect(validateContribInput({ ...VALID, target: { isbn13: '12345' } }).ok).toBe(false);
  });

  test('ukjent target-felt avvises', () => {
    const r = validateContribInput({ ...VALID, target: { doi: '10.1/x', email: 'x@y.z' } });
    expect(r.ok).toBe(false);
  });

  test('uparserbar raw-ref er LOV (reviewer løser)', () => {
    const r = validateContribInput({
      ...VALID,
      refs: [{ raw: 'Ps 51:5 (MT)', kind: 'covers_passage' }],
      context_translation: 'wlc',
    });
    expect(r.ok).toBe(true);
  });

  test('ugyldig ref-kind avvises', () => {
    const r = validateContribInput({ ...VALID, refs: [{ raw: 'Esra 3,1', kind: 'mentions' }] });
    expect(r.ok).toBe(false);
  });
});

describe('buildSubmissionPayload', () => {
  test('bygger komplett dokument med server-kontrollert submitted/review', () => {
    const r = validateContribInput(VALID);
    if (!r.ok) throw new Error(r.error);
    const p = buildSubmissionPayload(r.input, USER) as Record<string, any>;
    expect(p.schema).toBe('free-bible-contrib/1');
    expect(p.review).toEqual({ status: 'pending' });
    expect(p.submitted.by).toEqual({ user_id: '990001' });
    expect(p.submitted.client).toBe('bible.flogvit.com');
    expect(p.refs[0].context_translation).toBe('osnb');
    expect(p.refs[0].confirmed_by_contributor).toBe(true);
  });

  test('credit=true tar med navn; uten credit hverken navn eller credit', () => {
    const r = validateContribInput({ ...VALID, credit: true });
    if (!r.ok) throw new Error(r.error);
    const p = buildSubmissionPayload(r.input, USER) as Record<string, any>;
    expect(p.submitted.by).toEqual({ user_id: '990001', name: 'Test Bruker', credit: true });

    const r2 = validateContribInput({ ...VALID, credit: true, credit_name: 'Kari N' });
    if (!r2.ok) throw new Error(r2.error);
    const p2 = buildSubmissionPayload(r2.input, USER) as Record<string, any>;
    expect(p2.submitted.by.name).toBe('Kari N');

    const anon = buildSubmissionPayload(r2.input, { ...USER, displayName: null });
    expect((anon as any).submitted.by.name).toBe('Kari N');
  });

  test('credit uten noe navn utelater name-feltet', () => {
    const r = validateContribInput({ ...VALID, credit: true });
    if (!r.ok) throw new Error(r.error);
    const p = buildSubmissionPayload(r.input, { ...USER, displayName: null }) as Record<string, any>;
    expect(p.submitted.by).toEqual({ user_id: '990001', credit: true });
  });
});

describe('sang-kind', () => {
  test('sang med tittel+artist godtas; song_id valideres', () => {
    const song = {
      kind: 'song_verse_refs',
      target: { freetext: { title: 'Deg være ære', authors: ['E. Budry'] } },
      context_translation: 'osnb',
      refs: [{ raw: 'Matt 28,6', kind: 'cites' }],
    };
    expect(validateContribInput(song).ok).toBe(true);
    const withId = validateContribInput({ ...song, target: { song_id: 'song-0042' } });
    expect(withId.ok && withId.input.target.song_id === 'song-0042').toBe(true);
    expect(validateContribInput({ ...song, target: { song_id: 'sang-42' } }).ok).toBe(false);
  });
});
