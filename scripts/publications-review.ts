// Review av manuskripter meldt inn til den åpne katalogen (#15, del 2).
//
// Transporten er det token-gatede admin-API-et — aldri direkte DB-tilgang
// herfra, og aldri engangscontainere på VM-en. Samme mønster som
// contrib-pull/contrib-apply.
//
// Bruk:
//   REVIEW_TOKEN=… bun scripts/publications-review.ts                        # køen
//   REVIEW_TOKEN=… bun scripts/publications-review.ts vis <slug>             # hele teksten
//   REVIEW_TOKEN=… bun scripts/publications-review.ts godkjenn <slug>
//   REVIEW_TOKEN=… bun scripts/publications-review.ts avvis <slug> "begrunnelse"
//
//   REVIEW_TOKEN=… BIBLE_URL=http://localhost:8080 bun scripts/publications-review.ts
//
// Begrunnelsen ved avvisning er det ENESTE svaret forfatteren får på hvorfor
// teksten ikke kom ut — den vises på manuskriptsiden hans. Skriv den.

const BIBLE_URL = (process.env.BIBLE_URL || 'https://bible.flogvit.com').replace(/\/$/, '');
const TOKEN = process.env.REVIEW_TOKEN;

if (!TOKEN) {
  console.error('REVIEW_TOKEN mangler (samme verdi som i bibel-tjenestens env).');
  process.exit(1);
}

interface Entry {
  slug: string;
  title: string;
  authorName: string | null;
  content: string;
  reports: number;
  submittedAt: number;
}

const dato = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

async function hentKø(): Promise<{ pending: Entry[]; reported: Entry[] }> {
  const res = await fetch(`${BIBLE_URL}/api/publications/pending`, {
    headers: { 'x-review-token': TOKEN! },
  });
  if (!res.ok) {
    console.error(`GET /api/publications/pending → ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as { pending: Entry[]; reported: Entry[] };
}

async function avgjør(slug: string, status: 'approved' | 'rejected', note?: string): Promise<void> {
  const res = await fetch(`${BIBLE_URL}/api/publications/decide`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-review-token': TOKEN! },
    body: JSON.stringify({ slug, status, note }),
  });
  if (!res.ok) {
    console.error(`POST /api/publications/decide → ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`${slug}: ${status === 'approved' ? 'godkjent' : 'avvist'}${note ? ` (${note})` : ''}`);
}

const [kommando, slug, ...rest] = process.argv.slice(2);

if (!kommando || kommando === 'kø' || kommando === 'ko') {
  const { pending, reported } = await hentKø();

  console.log(`\nTil vurdering (${pending.length}) — eldste først:`);
  for (const p of pending) {
    const utdrag = p.content.replace(/\s+/g, ' ').slice(0, 100);
    console.log(`  ${p.slug}\n    ${p.title} — ${p.authorName ?? 'anonym'} — ${dato(p.submittedAt)}\n    ${utdrag}…`);
  }
  if (pending.length === 0) console.log('  (tom)');

  // Andre kø: det som ALLEREDE er ute og har blitt rapportert. Rapporter
  // skjuler ingenting av seg selv — de er et signal hit.
  console.log(`\nRapportert, men fortsatt publisert (${reported.length}):`);
  for (const p of reported) {
    console.log(`  ${p.slug} — ${p.reports} rapport(er) — ${p.title} — ${p.authorName ?? 'anonym'}`);
  }
  if (reported.length === 0) console.log('  (tom)');
  console.log('');
  process.exit(0);
}

if (kommando === 'vis') {
  if (!slug) {
    console.error('Bruk: publications-review.ts vis <slug>');
    process.exit(1);
  }
  const { pending, reported } = await hentKø();
  const funn = [...pending, ...reported].find((p) => p.slug === slug);
  if (!funn) {
    console.error(`Fant ikke ${slug} i køen.`);
    process.exit(1);
  }
  console.log(`\n${funn.title}\nAv: ${funn.authorName ?? 'anonym'}\nSendt: ${dato(funn.submittedAt)}\n`);
  console.log(funn.content);
  console.log('');
  process.exit(0);
}

if (kommando === 'godkjenn' || kommando === 'avvis') {
  if (!slug) {
    console.error(`Bruk: publications-review.ts ${kommando} <slug>${kommando === 'avvis' ? ' "begrunnelse"' : ''}`);
    process.exit(1);
  }
  const note = rest.join(' ').trim();
  if (kommando === 'avvis' && !note) {
    console.error('Avvisning uten begrunnelse: forfatteren får da ingen forklaring. Skriv en.');
    process.exit(1);
  }
  await avgjør(slug, kommando === 'godkjenn' ? 'approved' : 'rejected', note || undefined);
  process.exit(0);
}

console.error(`Ukjent kommando: ${kommando}. Bruk kø | vis | godkjenn | avvis.`);
process.exit(1);
