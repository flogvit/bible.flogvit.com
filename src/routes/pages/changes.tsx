// /changes — endringsloggen som SIDE.
//
// `RELEASE.md` skrives ved hver deploy, men fram til nå fantes den bare i
// repoet: en logg ingen leser kan nå er ikke en logg. Sida rendrer fila direkte,
// så det finnes ingen andre kilde å holde i synk.
//
// Innholdet er ENGELSK på alle åtte språk, med vilje (portal/I18N.md: engelsk er
// basespråket, og changelog-tekst er nettopp der oversettelse kan komme senere).
// Derfor bærer innholdsblokka `lang="en"` — uten det leser en skjermleser
// engelsk tekst med tysk uttale, og norsk-vakta ville med rette klaget.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { layoutProps, tFor, lhref, currentIntlTag } from '../../lib/i18n.ts';
import { tCtx } from '../../lib/i18n.ts';

const r = new Hono<AppEnv>();

/** Én post i loggen: «## 2026-07-29 — Tittel» + kategorier under. */
interface Entry {
  date: string;
  title: string;
  sections: { heading: string; items: string[] }[];
}

/**
 * Egen, minimal parser framfor `views/markdown.tsx`.
 *
 * To grunner, begge reelle: den generelle rendreren kjører ALL tekst gjennom
 * `InlineRefs`, som ville laget bibelreferanse-lenker av tilfeldige ord i en
 * changelog, og den behandler hver linje som et eget avsnitt — loggen har
 * ombrukne linjer, som da ville blitt ett `<p>` per linje.
 */
export function parseReleaseNotes(markdown: string): Entry[] {
  const entries: Entry[] = [];
  let entry: Entry | null = null;
  let section: { heading: string; items: string[] } | null = null;
  let item: string[] | null = null;

  const flushItem = () => {
    if (item && section) section.items.push(item.join(' '));
    item = null;
  };
  const flushSection = () => {
    flushItem();
    if (section && entry && section.items.length) entry.sections.push(section);
    section = null;
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();

    const head = line.match(/^##\s+(\S+)\s*(?:—|-)\s*(.*)$/);
    if (head) {
      flushSection();
      if (entry) entries.push(entry);
      entry = { date: head[1]!, title: head[2]!.trim(), sections: [] };
      continue;
    }
    if (!entry) continue; // preamble før første post

    const bold = line.match(/^\*\*(.+)\*\*$/);
    if (bold) {
      flushSection();
      section = { heading: bold[1]!, items: [] };
      continue;
    }

    const li = line.match(/^-\s+(.*)$/);
    if (li) {
      flushItem();
      item = [li[1]!];
      continue;
    }
    // Fortsettelseslinje i et punkt (loggen er ombrukket på ~80 tegn).
    if (item && line.startsWith('  ')) {
      item.push(line.trim());
      continue;
    }
    if (!line.trim()) flushItem();
  }
  flushSection();
  if (entry) entries.push(entry);
  return entries;
}

/**
 * `**fet**` og `*kursiv*` inne i et punkt. Uten dette rendres stjernene
 * bokstavelig — «links to *your* chapter» sto med stjerner på sida.
 */
function Inline({ text }: { text: string }) {
  const parts: unknown[] = [];
  let last = 0;
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(m[1] ? <strong>{m[1]}</strong> : <em>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts as never}</>;
}

/** Fila leses én gang; den endrer seg bare når et nytt image rulles ut. */
let cached: Entry[] | null = null;

async function releaseNotes(): Promise<Entry[]> {
  if (cached) return cached;
  try {
    cached = parseReleaseNotes(await Bun.file('./RELEASE.md').text());
  } catch {
    // Mangler fila (f.eks. et image bygget før den ble lagt inn), er tom
    // logg riktigere enn en 500.
    cached = [];
  }
  return cached;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(currentIntlTag(), {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

r.get('/changes', async (c) => {
  const t = tFor(c);
  const entries = await releaseNotes();

  return c.html(
    <Layout {...layoutProps(c)}
      title={`${t('ch.title')} — FLOGVIT.bible`}
      description={t('ch.meta')}
      styles={['about.css', 'changes.css']}
      canonical={`https://bible.flogvit.com${lhref('/changes')}`}
    >
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: tCtx()('common.home'), href: '/' }, { label: t('ch.title') }]} />
          <h1>{t('ch.title')}</h1>
          <p class="overview-intro">{t('ch.intro')}</p>

          {entries.length === 0 ? (
            <p class="user-empty">{t('ch.empty')}</p>
          ) : (
            <>
              <p class="changes-lang-note">{t('ch.englishOnly')}</p>
              {entries.map((entry) => (
                <article class="changes-entry">
                  <header class="changes-entry-head">
                    <time class="changes-date" datetime={entry.date}>{formatDate(entry.date)}</time>
                    <h2 lang="en">{entry.title}</h2>
                  </header>
                  {entry.sections.map((section) => (
                    <section class="changes-section">
                      <h3 lang="en">{section.heading}</h3>
                      <ul>
                        {section.items.map((line) => <li lang="en"><Inline text={line} /></li>)}
                      </ul>
                    </section>
                  ))}
                </article>
              ))}
            </>
          )}
        </div>
      </div>
    </Layout>,
  );
});

export default r;
