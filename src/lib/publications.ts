// Åpen katalog for manuskripter (GitHub #15, del 2).
//
// Del 1 var den SKJULTE lenken: `/delt/<token>`, der lenken er tilgangen. Dette
// er det motsatte — en offentlig, listbar katalog. Det gir én ny risiko del 1
// ikke hadde: alt som er listbart, er verdt å spamme. Derfor review.
//
// REVIEW-MODELLEN: manuell godkjenning av hver publisering. Issuen lister fire
// alternativer; dette er det minste å bygge, og med dagens volum rekker det.
// Det viktige er at det kan VOKSE uten å rives: «betrodd konto etter N
// godkjente» er et spørsmål mot de samme radene, og etterhånds-moderering er
// rapportknappen som allerede står der.
//
// Tre valg som er verdt å kjenne før du endrer noe:
//
//   1. **Teksten fryses ved innsending.** Reviewen godkjenner en TEKST, ikke et
//      løfte. Leses manuskriptet live fra sync_items, kan en godkjent forfatter
//      bytte det ut med reklame i etterkant, og godkjenningen blir en vaskeri-
//      tjeneste. Redigering endrer derfor ikke katalogen — ny innsending gjør,
//      og den går tilbake til `pending`.
//   2. **Sletting virker likevel.** Katalogsidene sjekker at kilderaden i
//      sync_items fortsatt finnes og ikke er slettet, akkurat som delingslenkene
//      (#15 del 1). Sletter forfatteren manuskriptet, forsvinner oppføringen —
//      øyeblikksbildet er for integritet, ikke for å holde på noe eieren har
//      fjernet.
//   3. **Rapporter skjuler ingenting av seg selv.** Tallet er et signal til den
//      som reviewer. Automatisk skjuling ved N rapporter ville gjort knappen til
//      et nedtakingsvåpen for hvem som helst.
//
// Å PUBLISERE forutsetter at manuskriptet er lagret i skyen, altså plus
// (husking=plus). Å LESE katalogen er gratis, som resten av appen.

import { getSql } from './db.ts';
import { sharedContent, type SharedDevotional } from './shares.ts';

export type PublicationStatus = 'pending' | 'approved' | 'rejected';

export interface Publication {
  slug: string;
  itemId: string;
  authorName: string | null;
  title: string;
  status: PublicationStatus;
  reviewNote: string | null;
  reports: number;
  submittedAt: number;
  decidedAt: number | null;
}

export interface PublicationWithContent extends Publication {
  content: string;
}

const MAX_TITLE = 255;
/** Ett manuskript er en tekst, ikke et arkiv — taket stopper feilbruk, ikke bruk. */
const MAX_CONTENT = 200_000;

/**
 * Lesbar tittel-slug + seks tilfeldige tegn.
 *
 * Tilfeldigheten er ikke en hemmelighet (katalogen er listbar) — den gjør
 * adressen UNIK og STABIL uten å bruke en rad-id. To manuskripter kan hete det
 * samme, og tittelen kan endres senere uten at adressen dør (#40).
 */
export function publicationSlug(title: string, random = crypto.getRandomValues(new Uint8Array(8))): string {
  const base = title
    .toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'oe').replace(/[å]/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const suffix = [...random].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('').slice(0, 6);
  return base ? `${base}-${suffix}` : suffix;
}

function toRow(r: Record<string, unknown>): Publication {
  return {
    slug: String(r.slug),
    itemId: String(r.item_id),
    authorName: (r.author_name as string | null) ?? null,
    title: String(r.title),
    status: r.status as PublicationStatus,
    reviewNote: (r.review_note as string | null) ?? null,
    reports: Number(r.reports ?? 0),
    submittedAt: Number(r.submitted_at),
    decidedAt: r.decided_at == null ? null : Number(r.decided_at),
  };
}

/** Manuskriptet slik det ligger hos brukeren — kilden til øyeblikksbildet. */
async function ownedDevotional(userId: number, itemId: string): Promise<SharedDevotional | null> {
  const rows = (await getSql()`
    SELECT data FROM sync_items
    WHERE user_id = ${userId} AND data_type = 'devotionals' AND item_id = ${itemId} AND deleted = 0
  `) as { data: unknown }[];
  const raw = rows[0]?.data;
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as SharedDevotional;
  try {
    return JSON.parse(String(raw)) as SharedDevotional;
  } catch {
    return null;
  }
}

/**
 * Melder et manuskript inn til katalogen, eller sender det inn PÅ NYTT.
 *
 * Ny innsending av noe som alt er godkjent setter status tilbake til `pending`
 * med den nye teksten: det er nettopp bytte-etter-godkjenning vi ikke vil ha.
 * Slugen beholdes, så en adresse som har vært delt ikke dør av en retting.
 *
 * Returnerer null om manuskriptet ikke finnes hos brukeren — man publiserer
 * ikke noe man ikke eier, og et eget «finnes, men ikke din» ville vært et
 * oppslagsverktøy for andres item-id-er.
 */
export async function submitPublication(
  userId: number,
  itemId: string,
  authorName: string | null,
): Promise<Publication | null> {
  const sql = getSql();
  const dev = await ownedDevotional(userId, itemId);
  if (!dev) return null;

  const title = (dev.title?.trim() || '').slice(0, MAX_TITLE);
  const content = sharedContent(dev).slice(0, MAX_CONTENT);
  // Et tomt manuskript er ingenting å reviewe, og ville stått som en tom
  // oppføring i katalogen om det slapp gjennom.
  if (!title || !content.trim()) return null;

  const now = Date.now();
  const existing = (await sql`
    SELECT * FROM devotional_publications WHERE user_id = ${userId} AND item_id = ${itemId}
  `) as Record<string, unknown>[];

  if (existing[0]) {
    const slug = String(existing[0].slug);
    await sql`
      UPDATE devotional_publications
      SET title = ${title}, content = ${content}, author_name = ${authorName},
          status = 'pending', review_note = NULL, submitted_at = ${now}, decided_at = NULL
      WHERE slug = ${slug}
    `;
    const [row] = (await sql`SELECT * FROM devotional_publications WHERE slug = ${slug}`) as Record<string, unknown>[];
    return row ? toRow(row) : null;
  }

  const slug = publicationSlug(title);
  await sql`
    INSERT INTO devotional_publications (slug, user_id, item_id, author_name, title, content, status, submitted_at)
    VALUES (${slug}, ${userId}, ${itemId}, ${authorName}, ${title}, ${content}, 'pending', ${now})
  `;
  const [row] = (await sql`SELECT * FROM devotional_publications WHERE slug = ${slug}`) as Record<string, unknown>[];
  return row ? toRow(row) : null;
}

/** Forfatteren trekker oppføringen. Adressen dør i samme øyeblikk. */
export async function withdrawPublication(userId: number, itemId: string): Promise<boolean> {
  const sql = getSql();
  const before = (await sql`
    SELECT slug FROM devotional_publications WHERE user_id = ${userId} AND item_id = ${itemId}
  `) as { slug: string }[];
  if (before.length === 0) return false;
  await sql`DELETE FROM devotional_publications WHERE user_id = ${userId} AND item_id = ${itemId}`;
  return true;
}

/** Forfatterens egne oppføringer, uansett status — han skal se at noe venter. */
export async function listOwnPublications(userId: number): Promise<Publication[]> {
  const rows = (await getSql()`
    SELECT * FROM devotional_publications WHERE user_id = ${userId} ORDER BY submitted_at DESC
  `) as Record<string, unknown>[];
  return rows.map(toRow);
}

/**
 * Hvor mange oppføringer én katalogside viser.
 *
 * Tallet er ikke et TAK på katalogen — det er sidelengden. Før #75 var det et
 * tak: `LIMIT 100` uten en side 2, og enkeltoppføringene ligger med vilje ikke
 * i sitemapen (#42-lærdommen), så oppføring nummer 101 var godkjent, publisert
 * og uoppdagbar. Forfatteren så «Publisert» med en lenke som virket, og ingen
 * leser hadde en vei dit.
 */
export const CATALOG_PAGE_SIZE = 50;

export interface CatalogPage {
  items: Publication[];
  /** 1-basert, som i adressen. */
  page: number;
  /** Alltid minst 1: en tom katalog HAR en førsteside, den er bare tom. */
  pageCount: number;
  total: number;
}

/** Adressen til en katalogside. Side 1 er den korte — den ligger i sitemapen. */
export function catalogPagePath(page: number): string {
  return page <= 1 ? '/manuskripter/katalog' : `/manuskripter/katalog/side/${page}`;
}

/**
 * Katalogen, én side om gangen: godkjente oppføringer der kilderaden fortsatt
 * finnes.
 *
 * JOIN-en mot sync_items er tilgangskontroll, ikke pynt: sletter forfatteren
 * manuskriptet, skal oppføringen forsvinne selv om teksten ligger frosset her.
 *
 * `total` er ikke pynt heller: den er det siden SIER (#75 — «og sier ikke fra»)
 * og det som avgjør om det finnes en side til. Uten den kunne en side være
 * siste side uten å vite det.
 */
export async function listCatalog(page = 1, pageSize = CATALOG_PAGE_SIZE): Promise<CatalogPage> {
  const sql = getSql();
  const [count] = (await sql`
    SELECT COUNT(*) AS n FROM devotional_publications p
    JOIN sync_items i
      ON i.user_id = p.user_id AND i.item_id = p.item_id AND i.data_type = 'devotionals'
    WHERE p.status = 'approved' AND i.deleted = 0
  `) as { n: number | string }[];
  const total = Number(count?.n ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount);

  const rows = (await sql`
    SELECT p.* FROM devotional_publications p
    JOIN sync_items i
      ON i.user_id = p.user_id AND i.item_id = p.item_id AND i.data_type = 'devotionals'
    WHERE p.status = 'approved' AND i.deleted = 0
    -- Slugen til slutt gjør sorteringen TOTAL. To oppføringer godkjent i samme
    -- millisekund har ellers ingen innbyrdes rekkefølge, og en rad kan da
    -- havne på begge sider av et sideskille — altså bli listet to ganger, eller
    -- ingen. Det er nettopp usynligheten saken handler om.
    ORDER BY p.decided_at DESC, p.submitted_at DESC, p.slug ASC
    LIMIT ${pageSize} OFFSET ${(current - 1) * pageSize}
  `) as Record<string, unknown>[];
  return { items: rows.map(toRow), page: current, pageCount, total };
}

/** Én katalogoppføring med tekst. Ikke godkjent eller slettet kilde ⇒ null. */
export async function getPublication(slug: string): Promise<PublicationWithContent | null> {
  if (!slug) return null;
  const rows = (await getSql()`
    SELECT p.* FROM devotional_publications p
    JOIN sync_items i
      ON i.user_id = p.user_id AND i.item_id = p.item_id AND i.data_type = 'devotionals'
    WHERE p.slug = ${slug} AND p.status = 'approved' AND i.deleted = 0
  `) as Record<string, unknown>[];
  const row = rows[0];
  return row ? { ...toRow(row), content: String(row.content) } : null;
}

/**
 * Rapportering fra en leser. Teller opp, skjuler ingenting.
 *
 * Svarer likt for ukjent og kjent slug: en rapportknapp skal ikke kunne brukes
 * til å kartlegge hva som finnes.
 */
export async function reportPublication(slug: string): Promise<void> {
  await getSql()`UPDATE devotional_publications SET reports = reports + 1 WHERE slug = ${slug}`;
}

// ── Review (token-gatet, som contrib) ────────────────────────────────────

export interface PendingPublication extends PublicationWithContent {
  userId: number;
}

/** Køen, eldste først — den som har ventet lengst skal ses på først. */
export async function listPendingPublications(limit = 50): Promise<PendingPublication[]> {
  const rows = (await getSql()`
    SELECT p.* FROM devotional_publications p
    JOIN sync_items i
      ON i.user_id = p.user_id AND i.item_id = p.item_id AND i.data_type = 'devotionals'
    WHERE p.status = 'pending' AND i.deleted = 0
    ORDER BY p.submitted_at ASC
    LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows.map((r) => ({ ...toRow(r), content: String(r.content), userId: Number(r.user_id) }));
}

/**
 * Rapporterte oppføringer som ALLEREDE er ute — reviewerens andre kø.
 *
 * Samme JOIN som katalogen, og av samme grunn: «fortsatt publisert» må være
 * SANT. Sletter forfatteren manuskriptet, er oppføringen borte for leseren —
 * uten JOIN-en her ble den likevel stående i køen, og revieweren ville vurdert
 * en tekst ingen kan se. Verre: ingen avgjørelse tar den ut igjen, siden en
 * rapport på noe usynlig aldri kommer i veien for noen.
 */
export async function listReportedPublications(limit = 50): Promise<PendingPublication[]> {
  const rows = (await getSql()`
    SELECT p.* FROM devotional_publications p
    JOIN sync_items i
      ON i.user_id = p.user_id AND i.item_id = p.item_id AND i.data_type = 'devotionals'
    WHERE p.reports > 0 AND p.status = 'approved' AND i.deleted = 0
    ORDER BY p.reports DESC, p.submitted_at ASC
    LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows.map((r) => ({ ...toRow(r), content: String(r.content), userId: Number(r.user_id) }));
}

/**
 * Avgjørelsen. `approved` legger ut, `rejected` holder tilbake — begge med en
 * valgfri begrunnelse forfatteren ser på sin egen side.
 *
 * Rapport-telleren nullstilles ved en NY avgjørelse: den gjaldt teksten som ble
 * vurdert, og etter en gjennomgang skal ikke gamle rapporter ligge og se
 * ubehandlede ut.
 */
export async function decidePublication(
  slug: string,
  status: Exclude<PublicationStatus, 'pending'>,
  note: string | null = null,
): Promise<boolean> {
  const sql = getSql();
  const before = (await sql`SELECT slug FROM devotional_publications WHERE slug = ${slug}`) as { slug: string }[];
  if (before.length === 0) return false;
  await sql`
    UPDATE devotional_publications
    SET status = ${status}, review_note = ${note}, decided_at = ${Date.now()}, reports = 0
    WHERE slug = ${slug}
  `;
  return true;
}
