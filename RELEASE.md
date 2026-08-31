# Release notes

## 2026-08-31 — Site rides out short database outages instead of failing hard

**Bug fixes**
- Brief database interruptions no longer show up as a bare server error — you now get a clear, temporary-outage response, and things keep working as soon as the database is back.
- If a database interruption happens right as the site is starting up, it now recovers on its own instead of staying stuck.

**Behind the scenes**
- Every page and API route now reliably logs database interruptions, even ones that were being caught and handled locally before.
- Fixed a route-matching bug and improved test coverage for how outages are detected and measured.
## 2026-08-30 — Pages stay responsive when the database stumbles

**Bug fixes**
- Fixed a bug where pages with many database lookups (like a person's family tree on `/personer/:id`) could take far longer to fail than intended — the response-time cap is now shared across an entire page, not reset for every individual lookup, so a struggling database now fails fast instead of stalling for tens of seconds.
- The background version check that keeps pages fresh no longer eats into a reader's own loading time budget, so it can't turn an otherwise-fast page into a slow one.
- Fixed the homepage's "today's season" label (e.g. "Trinity season", "Trefaldighetstiden") overflowing off-screen on narrow phones with enlarged text.

**Behind the scenes**
- Documented the site's database wait-time budget as a hard contract in CLAUDE.md.
## 2026-08-30 — Housekeeping: agent session data kept out of version control

**Behind the scenes**
- Excluded the local agent session and cookie storage from version control, keeping credentials out of the repo history.
## 2026-08-30 — Internal housekeeping for automation tooling

**Behind the scenes**
- Agent session and cookie storage is now excluded from version control, keeping automation credentials out of the repository.
## 2026-08-30 — Internal tooling hardening

**Behind the scenes**
- Tightened repository hygiene by excluding automated agents' session and cookie storage from version control, reducing credential exposure risk.
## 2026-08-30 — Repository hygiene fix

**Behind the scenes**
- Excluded local agent session/cookie storage from version control, so it can no longer end up committed to this repository.
## 2026-08-28 — Lighter memory footprint for verse lookups

**Behind the scenes**
- Verse number lookups now build their index from the folder structure instead of loading a 109 MB JSON file, cutting startup memory well under the platform's 288 MB cap.
## 2026-08-28 — Lighter-weight verse lookups under the hood

**Behind the scenes**
- The verse-numbering list is now built from the folder structure instead of a 109 MB JSON file, cutting memory use — with a test in place to keep it that way.
## 2026-08-28 — Cache memory now measured in real bytes, not characters

**Bug fixes**
- Fixed a page-cache accounting bug that could let it hold more in memory than intended, most noticeable on pages with heavy non-Latin text (Hebrew, Greek, CJK), where each character can take several bytes.

**Behind the scenes**
- Added a regression test that keeps the cache's memory budget honest going forward.
## 2026-08-28 — Bulk verse-mapping requests no longer risk crashing the site

**Bug fixes**
- A single large bulk mapping request could push memory past the process limit and take the whole site down for every reader; responses are now built incrementally so one request can no longer do that.

**Behind the scenes**
- Added a regression test that guards against any request growing memory past the heap limit.
## 2026-08-24 — Looking up a verse in an unfamiliar numbering scheme no longer breaks the page

**Bug fixes**
- A verse reference that uses a numbering scheme not available for the requested translation now correctly shows as not found, instead of failing with an error.

**Behind the scenes**
- Added safeguards so this class of bug is caught by tests before it can reach the live site again.
## 2026-08-24 — The reference API now answers in your language

**New features**

- Looking up a Bible reference through `/api/reference` now returns results — and error messages, when a reference can't be resolved — in the language you called it in, instead of switching to a different language partway through.

**Behind the scenes**

- Documented that error branches are user-facing text too, so translations don't get skipped when new failure cases are added.
## 2026-08-23 — Security maintenance

**Behind the scenes**
- Updated the Hono web framework, closing four security advisories.
## 2026-08-18 — Security update to the web framework

**Behind the scenes**

- Updated Hono, the web framework behind this site, from 4.12.32 to 4.12.34. The
  release closes four advisories published on 3 August. None of them could be
  reached from this site — the most serious, a cross-user data leak in server-side
  rendering, requires a caching helper this codebase does not use — but running a
  version with known advisories is not a state worth keeping. Nothing changes for
  you.

What actually reached readers, newest first. Dates, not version numbers — we
deploy continuously.

## 2026-08-15 — Directory-like paths under static assets now fail cleanly

**Bug fixes**
- Visiting a folder path inside a static asset area — with or without a trailing slash, including the top-level assets folder itself — now shows a normal "not found" page instead of a server error.

**Behind the scenes**
- Documented the recurring EISDIR crash and why these paths are treated as missing pages rather than server errors.
## 2026-08-09 — The study panel stops fighting mobile screens

**Bug fixes**

- On mobile, opening the study panel no longer wrecks the page: it now lays over the chrome instead of sliding underneath it, keeps its tabs when it opens, and the side panel no longer drops below the verse text.

**Behind the scenes**

- Added a guard test confirming the study panel's tools stay reachable, visible, and closable on mobile, so this class of bug is caught before it ships again.
- Wrote up why an earlier rule meant to prevent this kind of bug existed in CLAUDE.md but didn't actually stop it.
## 2026-08-09 — Reading plans crossing a chapter boundary now work

**Bug fixes**
- Fixed reading references that span a chapter boundary — previously the whole reading failed to load; now the full passage displays, with a label that correctly names the verses shown.

**Polish**
- The footer's copyright line now stays aligned to the left when it wraps onto its own line.

**Behind the scenes**
- Added regression tests for chapter-crossing readings and footer text wrapping.
## 2026-08-09 — Verse links now take you straight to the verse

**New features**
- Following a verse link — from search, the overview, a theme page, or the reading page itself — now lands you on that exact verse, marked so you can spot it right away instead of scanning the chapter.

**Bug fixes**
- The decorative glow behind the homepage welcome message no longer sits on top of the text, so it's easier to read.

**Behind the scenes**
- Added regression tests guarding the new verse marker and the welcome box glow layering.
## 2026-08-08 — Every id the API hands out is an address the API answers

**Bug fixes**
- An id you read out of a list from the API now fetches that same entry back. Stories, themes and number symbolism were handing out an internal row number where the address belonged, so a story the list had just described came back as "not found" the moment you asked for it by the id the list gave you. Worse than the dead end: those row numbers are reassigned every time content is imported, so an id stored in your app last month could quietly have started pointing at a different story. The id is now the address itself — the story's slug, the theme's name, the number — and it survives the next import.

**Behind the scenes**
- The API's collections are now described in one place that both the routes and a new test read, so a collection added later has to say how it is addressed before it can ship. The test walks every id a list returns, fetches it, and checks the right entry comes back — and the rule behind it, that a row id is not an address, is written down for whoever touches the API next.
## 2026-08-07 — Links with æ, ø and å now lead to the person, not a 404

**Bug fixes**
- A person's page now opens from the address spelled the way the name is actually written. Until now only the stripped spelling worked, so a link containing æ, ø or å ended in a 404 — both spellings now reach the same person, and links already shared keep working.

**Behind the scenes**
- These release notes can name the letters æ, ø and å without the English-only check mistaking the page for Norwegian; the address rules gained test coverage, and the reasoning behind them — a tidied identifier is not a tidied address — is written down for whoever touches them next.
## 2026-08-07 — Links to people with æ, ø or å in their names now lead somewhere

**Bug fixes**
- Following a link to a person whose name contains æ, ø or å now opens that person's page instead of a dead end.

**Behind the scenes**
- Internal notes and the changelog were brought up to date.
## 2026-08-07 — Addresses with Norwegian letters lead to the person, not a dead end

**Bug fixes**
- Links to people whose names contain ø, æ or å now open that person's page instead of a "not found" error. Old bookmarks, links shared with you, hand-typed addresses and search-engine results all land where you expect, whichever spelling of the name the address uses.

**Behind the scenes**
- Person identifiers now resolve through an alias layer covered by a regression suite, and the rule for how a tidied-up link relates to its address is written down so the two cannot drift apart again.
## 2026-08-07 — Share cards that read correctly, and an honest answer for cut-off links

**Polish**
- Share previews now show titles the way they are actually written — accents and non-Latin letters included — instead of being flattened to plain ASCII on the way into the card.

**Bug fixes**
- A card address that arrives cut short — clipped by a chat app, an email client or a stray copy — now answers plainly that there is nothing there, instead of serving a card for a page that does not exist.

**Behind the scenes**
- Language-link coverage is now checked on real detail pages chosen from the content itself, and the internal runbook records where that coverage can look right while being wrong.
## 2026-08-07 — Shared links show their card, and busy moments answer quickly

**Polish**

- A link to a chapter or verse now brings its preview card along wherever you paste it. The card image is served from object storage, so the social network or chat app fetching it gets a picture instead of an empty box.

**Bug fixes**

- When the site is under load, a page request now either renders or comes back quickly, instead of sitting in a queue long past the point where your browser has given up. The line of waiting requests is no longer allowed to grow longer than the number of pages that can actually be rendered at once, and a free slot goes to the freshest request rather than to one whose reader left minutes ago.

**Behind the scenes**

- Preview cards are uploaded by a script that names the storage project it is writing to and reports plainly when the bucket is missing; new tests cover both the upload path and the render queue, and the runbook now records how a card reaches the bucket, why the render cap alone did not produce fast rejections, and that a crawler fix does not count as verified until it has been measured.
## 2026-08-07 — Heavy crawlers asked to slow down, so reading stays fast

**Polish**

- When an AI crawler pulls hard at the site, it is now asked to pace itself instead of fetching as fast as it can. That keeps chapters and searches responsive for the people actually reading them. Nothing a crawler was already forbidden to fetch became allowed — the limits are the same, only the tempo is.

**Behind the scenes**

- Internal notes and test tooling were tidied up, including tests that failed on machines whose file paths contain non-English letters.
## 2026-08-06 — Nothing new to see; the checks that guard the layout got sturdier

**Behind the scenes**

- The automated layout checks now restart the test browser on their own when it fails to start, so a tooling hiccup can no longer hide a real layout problem from us.
## 2026-08-06 — Shared links keep their preview image, even in apps that trim the URL

**Polish**
- Sharing a chapter or a verse into a chat app, a forum or a messaging client now brings the preview card with it far more reliably. The address behind that card is built from plain ASCII only, so clients that quietly cut a link at the first unfamiliar character no longer end up requesting a truncated address — and no longer fall back to a bare, image-less link.

**Behind the scenes**
- Tests that hold the card address to plain ASCII and pin down how it is encoded, plus notes on what the automated watch checks for.
## 2026-08-05 — Shared links survive special characters, and nothing sits stuck in the review queue

**Bug fixes**

- Addresses we publish — share cards, canonical links, sitemap entries — are now percent-encoded, so a page whose title or reference contains non-ASCII characters resolves properly. Paste such a link into a chat or a social post and the preview card loads instead of breaking; crawlers reach the page too.
- The review queue pages through everything that has been submitted. Contributions past the first batch are now visible and can be accepted or declined, rather than sitting out of reach because the list stopped at fifty.

**Behind the scenes**

- Our tests now choose their sample pages from the real data instead of a conveniently plain-ASCII book, so an encoding fault can no longer slip past a green suite. Reviewer and contributor documentation was updated to match.
## 2026-08-05 — Reading texts you can share in any language, with more room to read

**New features**

- A link to a reading text now works in all eight languages: open one anywhere and you get it in your own language, and a link you pass on works for whoever receives it.
- The reading texts overview now lists the texts and links straight into them, so you can get from the list to a passage without going through the menu.

**Polish**

- Reading pages now use the same width as the page header, so passages have more room on screen and lines break where you expect.

**Behind the scenes**

- Reading texts are listed in the sitemap under the languages that actually have them, so search engines find each one in the right language; tests and the runbook were extended to cover the new width, sitemap and language rules.
## 2026-08-05 — Page through the catalog, and a site that comes back to full strength on its own after a rush

**New features**
- The publication catalog is now split into pages. Long lists open quickly, you can step between pages, and the page you are on — and how many there are — is always stated.

**Polish**
- A passage block with no scripture reference no longer draws the thin rule that promises one, so person pages read cleanly where a reference is missing.

**Bug fixes**
- After a burst of traffic the site could stay in its reduced mode long after the rush was over. It now lifts the limits — including the reserved slots, not just the buttons — as soon as the load drops, instead of waiting for the next restart.

**Behind the scenes**
- Tests now declare their own time limits, seed quietly, and catch markup whose styling is never honoured; the runbooks were updated to explain the reasoning behind each limit.
## 2026-08-05 — Long words no longer push the page sideways on narrow screens

**Bug fixes**

- A long, unbreakable word — a place name, a compound noun, a transliterated term — used to make the whole page wider than the screen, so you had to swipe sideways to read anything. Such words now wrap instead, everywhere text is set. This was easiest to hit on a phone with enlarged text, where a single word can be wider than the column it sits in.

**Behind the scenes**

- The mobile layout test now measures every language at its own widest point rather than only English, so a word that overflows in German or Norwegian is caught before release.
## 2026-08-04 — Chapter links now come with their own preview card

**New features**
- Share a link to a chapter — in a chat, on social media, anywhere links unfurl — and it now shows a card naming that chapter and book, in the language you were reading, instead of the generic site image.

**Polish**
- A preview card is all or nothing: if any part of it can't be built for a given chapter, the site serves the standard card rather than a half-drawn image. Every page other than the chapter page keeps the card it already had.

**Behind the scenes**
- The card artwork is now baked into the build as reusable pieces and assembled per request, so it renders in production without an image rasterizer; the publication review tooling gained tests around the one path that moves an entry out of the queue, and the internal docs were brought in line.
## 2026-08-04 — Broken verse references can no longer slip past us

**Behind the scenes**
- Cross-references that live inside JSON fields are now checked the same way as the ones stored in ordinary columns, so a reference pointing at a chapter or verse that doesn't exist gets caught before publishing instead of turning into a dead link when you tap it.
## 2026-08-04 — Bible book names now read in your own language

**New features**

- Book names appear in your own language on all eight languages. Five of them previously showed English names — Genesis, Matthew, Revelation — no matter which language you were reading in.

**Bug fixes**

- The reference palette no longer answers in Norwegian when you are reading in another language. It looked book names up by their internal key, so every language got the Norwegian name back.

**Behind the scenes**

- The mobile layout guard now measures the longest translation of a book name instead of the shortest, so a name that overflows on a narrow screen in one language is caught before release.
## 2026-08-04 — Shared links now unfold into a proper preview card

**New features**
- Paste a link to any page — a chapter, a search, the front page — into a chat app, a forum or a social feed, and it now unfolds with a title, a description and an image instead of a bare URL. The wording comes from the same dictionary as the page itself, so it shows up in the language you were reading in.

**Behind the scenes**
- The preview card is an HTML template rasterised at build time rather than a hand-made image file, so it can be reviewed and changed like any other source; the page template declares the card once, so pages added later carry it without anyone remembering to ask. Tests check that every page actually serves the card, and that the image has the dimensions the platforms expect.
## 2026-08-03 — Older person references now lead to the right person, on the page and in the API

**Bug fixes**

- A link or cross-reference that uses an older id for a person no longer comes up empty. The id is recognised as an alias and you land on that person, instead of the reference being dropped.
- The API now agrees with the site. Where the site would forward you to a person, `/api/persons` used to answer 404 for the very same id; both now resolve it the same way.

**Behind the scenes**

- Written down why the frozen Norwegian edition does not get this fix, in the place the next round will actually read it.
## 2026-08-02 — No more dead ends in the text, and the phone gets what the desktop had

**Polish**
- On a phone, the reading toolbar now carries everything the desktop side rail does, including Contribute, so no action is desktop-only anymore.
- Chapter breadcrumbs and the counts on theme pages now read in your own language everywhere; a few spots still said "Kap. 1" no matter which language you had chosen.
- Search results now point at chapters and themes rather than at action links like the contribute form or your account page, so what you click is the text you were looking for.

**Bug fixes**
- A reference to a person who has no page yet no longer leads to a dead end — the name stays readable in the text instead of turning into a broken link.
- Six pages existed but were missing from the sitemap, so search engines never found them. They are listed now.
- A page that could no longer be built was removed, along with the six places that still linked to it.
- During a sudden burst of traffic the site now falls back to cached pages as intended; the safeguard existed but never actually engaged.

**Behind the scenes**
- Automated checks now cover sitemap coverage, person links, mobile/desktop parity, untranslated strings and the size of the crawlable surface; the content importer reports sources that have disappeared, not just the ones it rejects.
## 2026-08-01 — No visible changes; groundwork on how the Bible text is prepared for release

**Behind the scenes**
- Preparing Bible text for publication is now a checked script with an explicit list of what may be included, rather than a single hand-run command — so a release can no longer quietly carry along text that was never meant to ship. Nothing changes in what you read or how the site behaves.
- Routine release-notes upkeep.
## 2026-08-01 — Groundwork for safer Bible text updates; nothing changes for readers

**Behind the scenes**
- Preparing Bible text data for a release is now a scripted step with an explicit whitelist of what may be copied — covered by tests — so content updates land the same way every time instead of depending on someone following a written instruction correctly.
## 2026-08-01 — Groundwork only: nothing on the site changes this time

**Behind the scenes**
- Staging of Bible data before a release is now a script with an explicit allowlist, covered by tests, so unintended files can no longer slip into a data rollout — invisible today, but it protects the text you read.
## 2026-07-31 — No visible changes this round; the content pipeline got safer

**Behind the scenes**

- Staging the shared `kvn` bible-data package is now a tested script with an explicit whitelist instead of a hand-typed command, so what ends up in a release is the same every time and nothing unintended can slip in with it.
## 2026-07-31 — No visible changes this round; contribution staging is now a scripted, tested step

**Behind the scenes**
- Staging of contributed verse references now runs as a script with an explicit whitelist and its own tests, so what ends up on the site is reproducible rather than dependent on a command typed by hand.
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
