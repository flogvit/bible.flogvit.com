# Release notes

What actually reached readers, newest first. Dates, not version numbers — we
deploy continuously.

## 2026-07-29 — The front page grows up, and the interface finally speaks your language everywhere

**New features**

- The front page now shows your active reading plan: which plan, how far in you
  are, days in a row, and today's chapters. Until now it always claimed you had
  no plan, even when you did.
- Today's lectionary reading shows the actual readings — Old Testament, epistle
  and gospel as clickable references — instead of just the name of the day.
- The book list can be viewed by category, alphabetically or in book order, and
  the book you are currently reading is marked and links to *your* chapter
  rather than chapter 1.
- The verse of the day can be added to your favourites, and long verses are
  clipped with a "show more" instead of pushing the card out of shape.
- Returning readers get the verse they stopped at shown in the hero, and can
  clear the saved position with one click.

**Polish**

- The hero card no longer has a large empty gap in the middle: it ends where its
  content ends, and the decorative glow from the old design is back.
- The sixteen cards under "Explore" have their icons back.
- The book grid is a typographic grid again rather than 66 bordered boxes, which
  makes the front page considerably shorter and the group headings readable.
- Translation info pages show real names instead of raw codes: "English — Latin
  script" and "Ancient Hebrew, Ancient Greek" where it used to say "en / eng —
  script Latn" and "hbo, grc". Language and script names follow the page
  language.
- The "Character" notes on a translation page follow the reader's language
  rather than the translation's, so an English reader no longer meets Norwegian
  there — and when a note only exists in another language, it is marked so
  screen readers pronounce it correctly.

**Bug fixes**

- The whole interface was Norwegian on all eight languages wherever the page
  builds itself in the browser: the command palette, the keyboard shortcut help,
  the offline download, the update banner, the favourite button, topic tagging
  and the sync status. Roughly 130 strings, now translated everywhere.
- Clicking almost anything built in the browser threw you out of your language:
  continue reading, chapter navigation with the arrow keys, the command palette,
  search results, the offline reader. Twenty-one links, all fixed.
- The note under the verse of the day was always English — "Grace and truth
  meet" on the Norwegian front page.
- The chapter count read "50 kap." on every language.
- Reading plans came back from the API in a random language, and the list
  contained every plan twice, once per language.
- Verse text fetched in the background always came back in Norwegian, whatever
  language you were reading in.
- Dates on the lectionary pages were formatted with Norwegian month and weekday
  names on all eight languages.
- Family relations on people pages (Father, Mother, Spouse, Sibling, Child),
  "Also known as", and a long list of screen-reader labels were Norwegian
  everywhere.

**Behind the scenes**

- The client-side islands under `public/js/` were outside both existing i18n
  guards, because those render server HTML and the islands build their DOM in
  the browser. That single blind spot is what produced nearly every bug fix
  above. Two new guards close it, and both were verified by reintroducing the
  bug they are meant to catch. The string guard is deliberately structural
  rather than a Norwegian word list — the word list let "Senere" through, and a
  hardcoded English string would have passed it too.
- Seven pages were missing from the page contract sweep, which is why they still
  contained untranslated text. Test count went from 253 to 267.
