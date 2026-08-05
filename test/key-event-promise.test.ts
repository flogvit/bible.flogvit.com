// EN BLOKK SKAL IKKE LOVE ET SKRIFTSTED DEN IKKE LEVERER (#73)
//
// `KeyEventList` rendrer en nøkkelhendelse som overskrift + beskrivelse +
// versetekstene. Versene hentes med `getVersesWithOriginal()`, som hopper over
// et vers som ikke finnes — så en hendelse uten vers vi kan vise ble stående
// med overskrift, beskrivelse og NULL vers. Målt i prod 2026-08-04:
// `/nb/personer/epainetos` ga fire `class="event"` og null `class="verse-group"`.
//
// Løftet ligger i STILEN, ikke i teksten: `.event-description` har en
// `border-bottom` og 16 px `padding-bottom` — en skillelinje som sier «under
// her kommer skriftstedet». Uten vers åpner den mot ingenting.
//
// Hva som IKKE er gjort, med vilje: hendelsen skjules ikke. Beskrivelsen er
// ekte, kuratert innhold vi HAR («Epainetos beskrives som den første som ble
// omvendt til Kristus i provinsen Asia»), og på Epainetos ville alle fire
// forsvunnet — da hadde vi byttet ett tomt løfte mot et større, en seksjon uten
// innhold. Vi skriver heller ikke «skriftstedet finnes ikke i denne utgaven»:
// for den STØRSTE klassen er det usant. Rom 16:5 ligger i utgaven vår; det er
// adressen som er borte, fordi kilden staver den som bok 52 (free-bible#26).
// En forklaring vi ikke kan belegge er en gjetning, og #61 gjetter aldri.
//
// Samme klasse hull som #45, #65 og #69: siden svarer 200 og skriver ingen
// loggrad. Bare en vakt formulert på KONTRAKTEN finner den.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getAllPersonsData, initBooks, type PersonData } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { KeyEventList } from '../src/views/verse-display.tsx';
import { Chrome, type Page } from './chrome-cdp.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

/** Klassen som trekker løftet tilbake. Kjent av BÅDE markupen og stilarket. */
const MARKER = 'event-no-verses';

let server: ReturnType<typeof Bun.serve>;
let persons: PersonData[];

beforeAll(async () => {
  await initBooks();
  server = Bun.serve({ port: 0, fetch: createApp().fetch });
  persons = await getAllPersonsData('nb');
}, 60_000);

afterAll(async () => {
  server?.stop(true);
  await closeSql();
});

const base = () => `http://localhost:${server.port}`;

/**
 * Hendelsesblokkene i den rendrede HTML-en, med klassen sin og hvor mange
 * vers-grupper hver av dem faktisk leverte.
 *
 * Regexen treffer `class="event"` og `class="event event-no-verses"`, men ikke
 * `event-list`, `event-header` eller `event-description` — de har ingen
 * mellomrom eller anførselstegn rett etter `event`.
 */
function eventBlocks(html: string): { cls: string; verseGroups: number }[] {
  const open = '<div class="event-list">';
  const start = html.indexOf(open);
  if (start < 0) return [];
  const section = html.slice(start + open.length);
  const end = section.indexOf('</section>');
  const parts = (end < 0 ? section : section.slice(0, end)).split(/<div class="(event(?: [^"]*)?)">/);

  const blocks: { cls: string; verseGroups: number }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    blocks.push({
      cls: parts[i]!,
      verseGroups: (parts[i + 1]?.match(/class="verse-group"/g) ?? []).length,
    });
  }
  return blocks;
}

describe('REGELEN — markupen sier om hendelsen har et skriftsted', () => {
  test('en hendelse UTEN vers vi kan vise merkes', async () => {
    // Bok 52 er 1 Tess, som har 5 kapitler — kapittel 16 finnes ikke. Det er
    // nøyaktig feilstavingen free-bible#26 produserer.
    const html = String(
      await KeyEventList({
        keyEvents: [{ title: 'Nevnt i Paulus’ hilsener', description: 'Paulus hilser Epainetos.', verses: [{ bookId: 52, chapter: 16, verse: 5 }] }],
      }),
    );
    const blocks = eventBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.verseGroups).toBe(0);
    expect(blocks[0]!.cls).toContain(MARKER);
    // Innholdet vi HAR står fortsatt der — merket skjuler ikke hendelsen.
    expect(html).toContain('Nevnt i Paulus’ hilsener');
    expect(html).toContain('Paulus hilser Epainetos.');
  });

  test('en hendelse MED vers merkes ikke', async () => {
    const html = String(
      await KeyEventList({
        keyEvents: [{ title: 'Guds kjærlighet', description: 'Verdens mest kjente vers.', verses: [{ bookId: 43, chapter: 3, verse: 16 }] }],
      }),
    );
    const blocks = eventBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.verseGroups).toBeGreaterThan(0);
    // Uten denne linja ville «sett merket på ALLE hendelser» bestått.
    expect(blocks[0]!.cls).not.toContain(MARKER);
  });

  test('en hendelse beholder de versene den HAR når bare noen faller bort', async () => {
    const html = String(
      await KeyEventList({
        keyEvents: [
          {
            title: 'Blandet',
            description: 'Ett levende og ett dødt vers.',
            verses: [{ bookId: 43, chapter: 3, verse: 16 }, { bookId: 52, chapter: 16, verse: 5 }],
          },
        ],
      }),
    );
    const blocks = eventBlocks(html);
    expect(blocks[0]!.verseGroups).toBe(1);
    expect(blocks[0]!.cls).not.toContain(MARKER);
  });
});

describe('SEKSJONEN — en overskrift skal ikke stå over ingenting', () => {
  test('en person uten nøkkelhendelser får ingen «Nøkkelhendelser»-seksjon', async () => {
    // Valgt av DATAENE, ikke ført opp for hånd: 97 nb-personer er i denne
    // klassen, og hvilke det er endrer seg med hver innholdsrunde.
    const person = persons.find((p) => (p.keyEvents?.length ?? 0) === 0);
    expect(person, 'fant ingen person uten nøkkelhendelser å måle på').toBeDefined();

    const html = await (await fetch(`${base()}/nb/personer/${person!.id}`)).text();
    expect(html).not.toContain('person-events-section');
    expect(html).not.toContain('Nøkkelhendelser');
    expect(html).not.toContain('<div class="event-list">');
  });

  test('en person MED nøkkelhendelser har fortsatt seksjonen', async () => {
    // Ellers ville «fjern seksjonen helt» bestått testen over.
    const person = persons.find((p) => (p.keyEvents?.length ?? 0) > 0);
    expect(person).toBeDefined();

    const html = await (await fetch(`${base()}/nb/personer/${person!.id}`)).text();
    expect(html).toContain('person-events-section');
    expect(html).toContain('Nøkkelhendelser');
  });
});

describe('DATA — ingen personside lover et skriftsted den ikke har', () => {
  test('hver hendelsesblokk har enten vers ELLER merket, aldri begge og aldri ingen', async () => {
    // Sidene velges av DATAENE: alle personene som faktisk har en hendelse
    // uten vers vi kan vise. En ny innholdsrunde flytter dermed målingen selv.
    // (Adressene er alt ryddet av #46, så `verses` er tom framfor å peke dødt —
    // rendringen er den samme.)
    const suspects = persons.filter((p) => p.keyEvents?.some((e) => (e.verses?.length ?? 0) === 0));
    expect(suspects.length, 'fant ingen personer med en hendelse uten vers').toBeGreaterThan(0);

    const feil: string[] = [];
    for (const p of suspects) {
      const html = await (await fetch(`${base()}/nb/personer/${p.id}`)).text();
      for (const b of eventBlocks(html)) {
        const merket = b.cls.includes(MARKER);
        if (b.verseGroups === 0 && !merket) feil.push(`/nb/personer/${p.id}: blokk uten vers og uten merke`);
        if (b.verseGroups > 0 && merket) feil.push(`/nb/personer/${p.id}: blokk MED vers, men merket`);
      }
    }
    expect(feil.slice(0, 10)).toEqual([]);
  });

  test('sakens eget bevis: /nb/personer/epainetos', async () => {
    const html = await (await fetch(`${base()}/nb/personer/epainetos`)).text();
    const blocks = eventBlocks(html);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.verseGroups === 0 && b.cls.includes(MARKER))).toBe(true);
    // Innholdet vi har står igjen.
    expect(html).toContain('Førstegrøden fra Asia');
  });
});

// FLATA — merket må faktisk VIRKE. En klasse i markupen som stilarket ikke
// honorerer ser riktig ut i en HTML-sammenligning og endrer ingenting for
// leseren; #55 er nettopp den fella (en uspesifisert regel taper på rekkefølge).
// Skillelinja er en egenskap ved RENDRINGEN, så den måles i ekte Chrome.
describe('FLATA — skillelinja er borte når det ikke kommer noe under den', () => {
  let chrome: Chrome;
  let page: Page;

  beforeAll(async () => {
    chrome = await Chrome.launch();
    page = await chrome.open('about:blank');
  }, 60_000);

  afterAll(async () => {
    await page?.close();
    await chrome?.close();
  }, 30_000);

  /** Beregnet bunnskille på `.event-description` i hver hendelsesblokk. */
  function readSeparators() {
    return Array.from(document.querySelectorAll('.event-list > .event')).map((event) => {
      const desc = event.querySelector('.event-description') as HTMLElement | null;
      const cs = desc ? getComputedStyle(desc) : null;
      return {
        marked: event.classList.contains('event-no-verses'),
        verseGroups: event.querySelectorAll('.verse-group').length,
        border: cs ? parseFloat(cs.borderBottomWidth) : -1,
        padding: cs ? parseFloat(cs.paddingBottom) : -1,
      };
    });
  }

  test('uten vers: ingen skillelinje og ingen luft under beskrivelsen', async () => {
    await page.navigate(`${base()}/nb/personer/epainetos`);
    const rows = await page.evaluate(readSeparators);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.verseGroups).toBe(0);
      expect(r.marked).toBe(true);
      expect(r.border).toBe(0);
      expect(r.padding).toBe(0);
    }
  });

  test('med vers: skillelinja står — den skiller noe fra noe', async () => {
    // Ellers ville «fjern border-bottom fra .event-description overalt» bestått.
    const person = persons.find((p) => p.keyEvents?.some((e) => (e.verses?.length ?? 0) > 0));
    expect(person).toBeDefined();

    await page.navigate(`${base()}/nb/personer/${person!.id}`);
    const rows = (await page.evaluate(readSeparators)).filter((r) => r.verseGroups > 0);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.marked).toBe(false);
      expect(r.border).toBeGreaterThan(0);
      expect(r.padding).toBeGreaterThan(0);
    }
  });
});
