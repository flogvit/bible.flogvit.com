# Release notes

What actually reached readers, newest first. Dates, not version numbers — we
deploy continuously.

## 2026-07-31 — Groundwork only: no visible changes this round

**Behind the scenes**

- Reviewed verse references are now moved into the Bible data by a script with an explicit allowlist and its own tests, rather than by a hand-written database statement. Nothing changes on the site — it just makes the next content update harder to get wrong, and documents how it is run.
## 2026-07-30 — Sixty-six people can be found again, and Luke gets its cross-references

**Bug fixes**

- Sixty-six people had addresses built from a name with its Norwegian letters
  dropped rather than transliterated, so Ahab's son lived at `akabs-snn` and
  Phoebe at `fbe`. The addresses are now spelled properly, and every old one
  redirects to its new home — nothing that has been linked or bookmarked is
  lost. The redirects went out earlier today; the pages they point to arrive
  with this update.

**Polish**

- Cross-references for Luke and the first chapter of John now exist in English.
  Until now an English reader saw an empty panel where a Norwegian reader saw
  the links across the gospels.

**Behind the scenes**

- Translation metadata now uses the same word for a translation that the source
  project uses, instead of a packaging term inherited from another Bible
  format.

## 2026-07-30 — Publish a manuscript for everyone, and see how far a reading plan already is

**New features**

- Manuscripts can now be published in an open catalogue, not only shared with a
  hidden link. Anyone can read them; no account is needed. Every text is read by
  a human before it appears, and what you publish is a copy taken at that moment
  — editing your own draft afterwards leaves the published version untouched
  until you publish it again. You can withdraw it at any time, and it is gone
  immediately. Every entry has a "report" button that needs no account.
  Publishing is part of FLOGVIT.plus; reading is free.
- The reading map now suggests where you are close to finishing: "Romans — 3
  chapters left". Reading plans are the source of those lists, so a plan is
  simply a question asked of your map.
- Each reading plan shows how much of it you have already read, whether or not
  you read it as part of the plan. Reading outside a plan has never counted
  before; now it does — without changing where you are in the plan itself.

**Polish**

- Chapter pages ask the database once per chapter instead of four times per
  verse. Psalm 119 alone went from more than seven hundred round trips to four,
  which is felt most where the connection between the site and its database is
  slowest.

**Bug fixes**

- Search engines were told that every day's lectionary reading existed in all
  eight languages. Only Norwegian does: 1176 announced addresses answered "not
  found", and the address Google falls back to when no language fits pointed at
  one of them. Pages now list only the languages they actually exist in.

**Behind the scenes**

- The language list in that fix is derived from the content itself rather than
  written down anywhere, so a newly translated set of texts is announced without
  a code change — and the test that guards it checks the real rule: every
  address we announce must answer. Along with the catalogue and the reading-map
  work, the suite grew from 463 to 517 tests.
- Deploying now stops if the server is missing configuration a feature needs.
  The review queue behind the catalogue is one of those: without its key the
  endpoints do not exist at all, which is safe but silent — readers could submit
  while nobody could approve.

## 2026-07-30 — Share a manuscript with a link, and chapter pages open seven times faster

**New features**

- You can share one of your own manuscripts with a hidden link. Anyone who has
  the link can read it — no account, no sign-in — and Bible references in the
  text stay clickable. "New link" replaces the old one, which revokes it on the
  spot; a revoked or deleted text is simply not there for anyone still holding
  the old address. Sharing is part of FLOGVIT.plus; reading a shared text is
  free.
- Today's lectionary reading now has a permanent address of its own, by date
  rather than by a number that changed under it.

**Polish**

- Chapter pages open about seven times faster. Genesis 1 went from roughly
  350 ms to 47 ms, and the settings page from the same to near-instant.
- The list of readings no longer shows eighteen days twice.

**Bug fixes**

- Search results listed topics by their internal name — "guds-hellighet" where
  the topic pages said "Guds hellighet".
- Person pages whose name contains a Norwegian letter had mangled addresses:
  Ahab's son was
  at `akabs-snn` and Phoebe at `fbe`. Sixty-six addresses are corrected, and
  every old one redirects, so existing links and bookmarks still land right.
- The address of a lectionary reading died every time the content was updated —
  in one hour, 103 different reading days answered "not found" to readers and
  search engines that had reached them before. Old addresses now redirect to the
  date.
- Every chapter of Revelation, 1 and 2 Chronicles and Song of Songs was a dead
  link in all eight sitemaps — 760 addresses in total — because the Norwegian
  letters in their addresses were encoded twice on the way out.
- More Norwegian on pages that are not Norwegian: the manuscript editor was
  Norwegian throughout in all eight languages, and so were the theme setting,
  the sync and export text, the offline option, text size in the toolbar, the
  verse badges, two column headings in the statistics table and the "coming
  soon" label in the FLOGVIT menu. Book names came out Norwegian in statistics,
  in prophecy references, in the gospel parallels and on the timeline. Searching
  the original languages served Norwegian verses alongside the Hebrew and Greek
  no matter which language you were reading in.

**Behind the scenes**

- The speed-up came from measuring rather than guessing: a CPU profile showed
  that 85% of the time spent building a chapter page went to re-reading 109 MB
  of verse-mapping files on every single request. With the real cost gone, the
  overload protection was retuned to match the machine — fast "try again" answers
  to a few readers are better than twenty-second pages for everyone — and the
  page cache now holds for an hour and empties itself when new content is
  imported.
- Search result pages are out of the search index. Someone had been feeding them
  Chinese spam with a phone number, aiming to have our pages carry their
  advertising.
- Norwegian text leaking onto other languages is now caught structurally instead
  of by a list of words someone remembered to add: Norwegian-only letters
  anywhere in visible text, text that matches the Norwegian dictionary value
  word for word,
  and text hidden in attributes screen readers and search results read out. All
  three were verified by reintroducing the bugs they are meant to catch.

## 2026-07-30 — The front page holds together, and a release no longer leaves you with half a design

**Polish**

- The cards at the top of the front page are warm rather than white, and the two
  columns are the same height again, so the page reads as one composition rather
  than loose boxes.
- The book list switch is a proper segmented control instead of three loose
  buttons.
- Today's lectionary reading carries a gold edge, so it reads as the reading for
  the day rather than as another card.

**Bug fixes**

- Style sheets and scripts were served without any caching information at all,
  while pages were cached for five minutes. After a release you could therefore
  be shown the new page with the old design — half a layout, with gaps where
  things had moved, until you happened to force a reload. Their addresses now
  change whenever their content does, so a release reaches you immediately.

## 2026-07-29 — The front page grows up, and the interface finally speaks your language everywhere

**New features**

- These release notes are now a page: **What's new**, linked from the footer.
  They were written at every deploy but only existed in the source repository,
  which meant nobody could read them.
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

- The hero card no longer has a large empty gap in the middle, and the decorative
  glow from the old design is back.
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
