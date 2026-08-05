// Review av manuskripter meldt inn til den åpne katalogen (#15, del 2).
//
// Transporten er det token-gatede admin-API-et — aldri direkte DB-tilgang
// herfra, og aldri engangscontainere på VM-en. Samme mønster som
// contrib-pull/contrib-apply.
//
// Bruk:
//   REVIEW_TOKEN=… bun scripts/publications-review.ts                        # køen, side 1
//   REVIEW_TOKEN=… bun scripts/publications-review.ts kø 2                   # neste side
//   REVIEW_TOKEN=… bun scripts/publications-review.ts vis <slug>             # hele teksten
//   REVIEW_TOKEN=… bun scripts/publications-review.ts godkjenn <slug>
//   REVIEW_TOKEN=… bun scripts/publications-review.ts avvis <slug> "begrunnelse"
//
//   REVIEW_TOKEN=… BIBLE_URL=http://localhost:8080 bun scripts/publications-review.ts
//
// Begrunnelsen ved avvisning er det ENESTE svaret forfatteren får på hvorfor
// teksten ikke kom ut — den vises på manuskriptsiden hans. Skriv den.
//
// KØEN ER PAGINERT, og tallet i overskriften er HELE køen (#81). Skriptet
// skriver ut kommandoen for neste side selv, så halen ikke kan bli liggende
// usett — og `vis`/`godkjenn`/`avvis` slår opp slugen UTENOM køen, så en
// oppføring bak et sideskille kan avgjøres like fullt.

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
  status: string;
  reports: number;
  submittedAt: number;
}

/** Én side av en kø. `total` er hele køen, ikke det siden viser. */
interface Queue {
  items: Entry[];
  page: number;
  pageCount: number;
  total: number;
}

const dato = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

async function hentKø(side: number): Promise<{ pending: Queue; reported: Queue }> {
  const res = await fetch(`${BIBLE_URL}/api/publications/pending?side=${side}`, {
    headers: { 'x-review-token': TOKEN! },
  });
  if (!res.ok) {
    console.error(`GET /api/publications/pending → ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as { pending: Queue; reported: Queue };
}

/** Én oppføring, slått opp på slugen — uavhengig av hvor i køen den står. */
async function hentOppføring(slug: string): Promise<Entry> {
  const res = await fetch(`${BIBLE_URL}/api/publications/review/${encodeURIComponent(slug)}`, {
    headers: { 'x-review-token': TOKEN! },
  });
  if (!res.ok) {
    const kropp = await res.text();
    // 404 betyr to HELT ulike ting her, og forskjellen er reviewerens sak:
    // «adressen finnes ikke» kommer fra ruta, mens en tjeneste UTEN
    // REVIEW_TOKEN svarer 404 på at endepunktet ikke finnes i det hele tatt
    // (REVIEW.md, «Legitimasjonen»). Sier vi «fant ikke» på det siste, ser en
    // feilkonfigurert prod ut som en skrivefeil.
    if (res.status === 404 && kropp.includes('not_found')) {
      console.error(`Fant ikke ${slug} — ukjent adresse, eller manuskriptet er slettet.`);
    } else {
      console.error(`GET /api/publications/review/${slug} → ${res.status} ${kropp}`);
    }
    process.exit(1);
  }
  return ((await res.json()) as { publication: Entry }).publication;
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
  // Sidetallet er argument nummer to, altså der en slug ellers står.
  const ønsket = slug === undefined ? 1 : Number(slug);
  if (!Number.isInteger(ønsket) || ønsket < 1) {
    console.error(`«${slug}» er ikke et sidetall. Bruk: publications-review.ts kø [side]`);
    process.exit(1);
  }
  const { pending, reported } = await hentKø(ønsket);
  const sider = Math.max(pending.pageCount, reported.pageCount);
  const side = Math.min(ønsket, sider);
  const av = sider > 1 ? `, side ${side} av ${sider}` : '';

  // Tallet i parentes er HELE køen, ikke det denne siden viser (#81). Skrev vi
  // sidens eget antall, ville «(50)» sett ut som at det ikke var flere.
  console.log(`\nTil vurdering (${pending.total}) — eldste først${av}:`);
  for (const p of pending.items) {
    const utdrag = p.content.replace(/\s+/g, ' ').slice(0, 100);
    console.log(`  ${p.slug}\n    ${p.title} — ${p.authorName ?? 'anonym'} — ${dato(p.submittedAt)}\n    ${utdrag}…`);
  }
  if (pending.items.length === 0) console.log(pending.total === 0 ? '  (tom)' : '  (ingenting på denne siden)');

  // Andre kø: det som ALLEREDE er ute og har blitt rapportert. Rapporter
  // skjuler ingenting av seg selv — de er et signal hit.
  console.log(`\nRapportert, men fortsatt publisert (${reported.total})${av}:`);
  for (const p of reported.items) {
    console.log(`  ${p.slug} — ${p.reports} rapport(er) — ${p.title} — ${p.authorName ?? 'anonym'}`);
  }
  if (reported.items.length === 0) console.log(reported.total === 0 ? '  (tom)' : '  (ingenting på denne siden)');

  // Veien videre skrives UT, ikke antydes: en kø med en hale ingen har fått
  // vite om, er nøyaktig den usynligheten saken handler om.
  if (side < sider) {
    console.log(`\nFlere venter — neste side:\n  bun scripts/publications-review.ts kø ${side + 1}`);
  }
  console.log('');
  process.exit(0);
}

if (kommando === 'vis') {
  if (!slug) {
    console.error('Bruk: publications-review.ts vis <slug>');
    process.exit(1);
  }
  // Slås opp på slugen, ikke i køen: en oppføring bak et sideskille skal kunne
  // leses like fullt, og det er teksten revieweren faktisk vurderer (#81).
  const funn = await hentOppføring(slug);
  const tilstand =
    funn.status === 'pending' ? 'til vurdering' : funn.status === 'approved' ? 'publisert' : 'avvist';
  console.log(
    `\n${funn.title}\nAv: ${funn.authorName ?? 'anonym'}\nSendt: ${dato(funn.submittedAt)}\nStatus: ${tilstand}\n`,
  );
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
