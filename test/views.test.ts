// Tester for de delte viewene (footnotes, inline-refs, verse-display,
// item-tagging). Verse-display går mot ekte lokal MySQL (DBngin :3312, .env).
// Komponentene kalles som funksjoner (fila er .ts, ikke .tsx) — hono/jsx-
// elementer kan rendres direkte via c.html().

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { initBooks } from '../src/lib/bible.ts';
import { closeSql } from '../src/lib/db.ts';
import { Footnotes } from '../src/views/footnotes.tsx';
import { InlineRefs, hasInlineRefs } from '../src/views/inline-refs.tsx';
import { KeyEventList, VerseRefList } from '../src/views/verse-display.tsx';
import { ItemTagging } from '../src/views/item-tagging.tsx';

const app = new Hono();

app.get('/footnotes', (c) =>
  c.html(
    Footnotes({
      footnotes: [
        { text: 'Første fotnote', source: 'rabbinsk' },
        { text: 'Andre fotnote' },
      ],
    })!,
  ),
);

app.get('/footnotes-open', (c) => c.html(Footnotes({ footnotes: [{ text: 'Åpen' }], defaultOpen: true })!));

app.get('/inline-refs', (c) => c.html(InlineRefs({ text: 'Se Joh 3,16 og 1 Mos 1,1-3 for mer.' })));

app.get('/inline-refs-bracket', (c) =>
  c.html(InlineRefs({ text: 'Les [ref:Joh 3,16|Johannes] og [person:moses|Moses].' })),
);

app.get('/key-events', async (c) =>
  c.html(
    await KeyEventList({
      keyEvents: [
        {
          title: 'Guds kjærlighet',
          description: 'Verdens mest kjente vers.',
          verses: [{ bookId: 43, chapter: 3, verse: 16 }],
        },
      ],
    }),
  ),
);

app.get('/verse-ref-list', async (c) =>
  c.html(await VerseRefList({ refs: [{ bookId: 1, chapter: 1, verses: [1, 2] }] })),
);

app.use('*', contextStorage());
app.get('/tagging', (c) => c.html(ItemTagging({ itemType: 'person', itemId: 'moses' })));
// Samme komponent under en locale — den henter oversetteren fra konteksten.
app.get('/nb/tagging', (c) => {
  c.set('locale' as never, 'nb' as never);
  return c.html(ItemTagging({ itemType: 'person', itemId: 'moses' }));
});

beforeAll(async () => {
  await initBooks();
});

afterAll(async () => {
  await closeSql();
});

describe('Footnotes', () => {
  test('rendrer details med to fotnoter og kildelabel', async () => {
    const res = await app.request('/footnotes');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<details class="footnotes"');
    expect(html).not.toContain('<details class="footnotes" open');
    expect(html).toContain('>*</summary>');
    // Uten locale i konteksten er gulvet engelsk (#26). `source` står på norsk
    // i dataene fordi den er en delt identifikator — den skal oversettes ved
    // visning, og det er nettopp det denne linja vokter.
    expect(html).toContain('2 footnotes');
    expect(html).toContain('Første fotnote');
    expect(html).toContain('Andre fotnote');
    expect(html).toContain('Rabbinic');
    // Kun én kilde er satt
    expect(html.match(/footnote-source/g)?.length).toBe(1);
  });

  test('defaultOpen gir open-attributt', async () => {
    const html = await (await app.request('/footnotes-open')).text();
    expect(html).toContain('<details class="footnotes" open');
  });
});

describe('InlineRefs', () => {
  test('frie norske referanser blir lenker med riktig href og data-ref', async () => {
    const res = await app.request('/inline-refs');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/en/joh/3#v16"');
    expect(html).toContain('href="/en/1mos/1#v1"');
    expect(html).toContain('data-ref="Joh 3,16"');
    expect(html).toContain('data-ref="1Mos 1,1-3"');
    expect(html.match(/class="inline-ref"/g)?.length).toBe(2);
    // Selve teksten bevares
    expect(html).toContain('Se <a');
    expect(html).toContain(' for mer.');
    expect(html).toContain('>Joh 3,16</a>');
    expect(html).toContain('>1 Mos 1,1-3</a>');
  });

  test('klammer-referanser med etikett og ressurslenker', async () => {
    const html = await (await app.request('/inline-refs-bracket')).text();
    expect(html).toContain('href="/en/joh/3#v16"');
    expect(html).toContain('>Johannes</a>');
    expect(html).toContain('data-ref="Joh 3,16"');
    expect(html).toContain('href="/en/personer/moses"');
    expect(html).toContain('class="inline-ref-resource"');
    expect(html).toContain('>Moses</a>');
  });

  test('hasInlineRefs gjenkjenner klammer-referanser', () => {
    expect(hasInlineRefs('Se [ref:Joh 3,16]')).toBe(true);
    expect(hasInlineRefs('Ingen referanser her')).toBe(false);
  });
});

describe('verse-display (DB)', () => {
  test('KeyEventList henter verstekst server-side', async () => {
    const res = await app.request('/key-events');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="event-list"');
    expect(html).toContain('<h3>Guds kjærlighet</h3>');
    expect(html).toContain('Verdens mest kjente vers.');
    expect(html).toContain('John 3:16');
    expect(html).toContain('Show in context →');
    expect(html).toContain('href="/en/joh/3#v16"');
    // Selve versteksten fra databasen. Uten locale i konteksten er gulvet
    // engelsk (#26), så sitatet skal komme fra osen — ikke fra osnb, som var
    // hardkodet som default på hvert sitatsted.
    expect(html).toContain('class="verse-text"');
    expect(html.toLowerCase()).toContain('for god so loved the world');
    // Gresk grunntekst under
    expect(html).toContain('class="original-verse greek"');
  });

  test('VerseRefList rendrer flere vers med kontekstlenker', async () => {
    const html = await (await app.request('/verse-ref-list')).text();
    expect(html.match(/class="verse-group"/g)?.length).toBe(2);
    expect(html).toContain('Gen 1:1');
    expect(html).toContain('Gen 1:2');
    expect(html).toContain('href="/en/1mos/1#v1"');
    // Hebraisk grunntekst, rtl
    expect(html).toContain('class="original-verse hebrew"');
    expect(html).toContain('dir="rtl"');
  });
});

describe('ItemTagging', () => {
  test('rendrer skall med data-attributter og noscript-tilstand', async () => {
    const html = await (await app.request('/tagging')).text();
    expect(html).toContain('data-item-type="person"');
    expect(html).toContain('data-item-id="moses"');
    expect(html).toContain('class="item-tagging"');
    expect(html).toContain('<noscript>');
    // Uten locale i konteksten faller komponenten til basespråket (#22).
    expect(html).toContain('Topics require JavaScript.');
  });

  test('teksten følger locale — den er ikke hardkodet', async () => {
    const html = await (await app.request('/nb/tagging')).text();
    expect(html).toContain('Emner krever JavaScript.');
  });
});
