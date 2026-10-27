# bible.flogvit.com MCP server

Lets an AI assistant read and search the Bible on bible.flogvit.com: the open
OSNB, OSNN and OSEN translations, the Hebrew and Greek source texts, and the
site's study material. Every answer links back to the page it came from.

**Address:** `https://mcp.bible.flogvit.com/mcp` — Streamable HTTP, no account,
no key.

## Connect an assistant

The full guide, for every client and in all eight languages, is
[bible.flogvit.com/en/mcp](https://bible.flogvit.com/en/mcp). A browser that
opens `https://mcp.bible.flogvit.com/` gets the short version of it. Both are
rendered from `../src/lib/mcp-info.ts` and the `mcp.*` keys in
`../src/lib/dictionaries-mcp.ts`, and `test/landing.test.ts` holds the tool
list there against `tools/list`.

**Claude (desktop app and claude.ai):** Settings → Connectors → *Add custom
connector*. Paste the address, leave authentication empty.

**ChatGPT:** turn on developer mode under Settings → Apps & Connectors, then
create a connector with the address and no authentication.

**Claude Code:**

```sh
claude mcp add --transport http flogvit-bible https://mcp.bible.flogvit.com/mcp
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{ "mcpServers": { "flogvit-bible": { "url": "https://mcp.bible.flogvit.com/mcp" } } }
```

**VS Code** (`.vscode/mcp.json`):

```json
{ "servers": { "flogvit-bible": { "type": "http", "url": "https://mcp.bible.flogvit.com/mcp" } } }
```

Then ask as you normally would — "what does John 3:16 say in the Greek?",
"where does the Bible talk about forgiveness?", "who was Tamar?". The assistant
picks the tools itself.

**Without MCP** — in a terminal, a script, or an agent that reads skills — the
same tools are the command line client `flogvit-bible`, with a skill and a
Claude Code plugin around it: `../cli/README.md`.

## The tools

| Tool | What it answers |
|---|---|
| `get_passage` | One or more passages, side by side in up to five editions, optionally with the translators' notes |
| `search_bible` | Verses containing all the given words, in one edition, optionally one book or testament |
| `get_original_text` | The Hebrew or Greek of a passage, word by word with explanations (in Norwegian) |
| `search_original_word` | Every verse where a Hebrew or Greek word occurs |
| `get_cross_references` | Related passages for each verse |
| `get_chapter_study` | Summary, context, key words, people, themes, stories, prophecies, parallels and timeline for a chapter |
| `get_book_overview` | An introduction to a book |
| `search_people`, `get_person` | People of the Bible, their family and key events |
| `search_topics`, `get_topic` | Stories, themes, prophecies and gospel parallels |
| `get_daily_verse` | Today's verse |
| `check_references` | Every Bible reference in a piece of text — line, column, the verses, and a problem for one that does not exist |
| `get_church_year_readings` | The Church of Norway's readings for a Sunday or feast day, by date or by the day's name (Norwegian, or English for the major feasts), optionally quoted |
| `get_timeline` | Timeline events for a period, a span of years, or a person or place named in them; the Bible's timeline or the world's alongside it |
| `get_prophecies` | Prophecies made or fulfilled in a passage, or in a category, with their fulfilment and optionally both texts |
| `get_story` | A Bible story by name, where it is told, and the text |
| `get_number` | What a number means in the Bible and where it occurs; with no number, every number that has an entry |
| `get_gospel_parallels` | The gospel parallels that cover a passage, every Gospel's passage side by side, optionally quoted one after the other |
| `list_editions` | The editions and their licences |
| `list_verse_mappings` | The 1158 verse numberings (KVN mappings) the `mapping` argument takes, found by edition name or language |

References are read in English and Norwegian style alike — `John 3:16-18`,
`Joh 3,16.18`, `1 Cor 13:4-7`, `Gen 1:1-2:3`, several separated by `;` — and
book names in all eight site languages, plus the Norwegian letter names
(«Romerbrevet»).

**Verse numbering.** Every tool that takes or gives a verse reference has a
`mapping` argument: an id from `list_verse_mappings` (`english_kj`,
`dnb2024_nb`, …) or a short name (`kjv`, `dnb2024`). A reference is read in
that numbering and the answer is numbered in it, so "Mal 4:5" with `kjv` is
osnb's Malachi 3:23. The tools do no remapping of their own: a reference goes
through `mapChapter()`, as `/api/chapter?mapping=` does, and an osnb address
comes out through `osnbToMapping()`, the cross mapping `/api/mappings/kvn/:id`
builds its verseMap from (`src/lib/verse-mapper.ts`). Unlike the API, which
only knows the 13 named numberings, the MCP takes any of the 1158 mapping
files. That is why the caches in `verse-mapper.ts` have a cap (32).

Quoted Bible text carries its source line. The translations are CC BY 4.0, and
the attribution has to follow the text wherever the assistant puts it.

## Releasing a new version

Every change a client can see — a tool added or removed, an argument, a
description — is a release, and the directories that list the server have to
follow it. They do not all get their data the same way:

| Directory | Where its data comes from | What a release needs |
|---|---|---|
| MCP Registry | `server.json`, published by us | publish the new version |
| [mcptry.com](https://mcptry.com/servers/io.github.flogvit/bible) | name, description and version copied from the registry every 30 minutes; the tool list from its own scheduled `tools/list` check of the live server | nothing to submit — it follows the registry and the server |
| Glama, PulseMCP | the registry | nothing |
| [mcpservers.org](https://mcpservers.org/servers/bible-flogvit-com-en-mcp) | a form submitted by hand once; the page text is a copy of `websiteUrl` (`https://bible.flogvit.com/en/mcp`) | press **Request update** on the listing (no login, one click, sent at once) after the site is out |

1. **In the PR that changes the tools, raise the version** — `SERVER_VERSION` in
   `src/server.ts` and `version` in `server.json`, which `test/landing.test.ts`
   holds equal. The registry never accepts the same version twice. A new tool
   or argument is a minor version (1.1.0 → 1.2.0); a removed tool or argument a
   major one. Change `description` in `server.json` too if what the server does
   has changed: it is what every directory shows, and at most 100 characters.
2. **Merge.** The orchestra's deployer rolls out bibel and `bibel-mcp` from the
   same commit.
3. **After the rollout, publish to the registry:**
   ```sh
   cd mcp && bun --env-file=../.env scripts/listings.ts publish
   ```
   It refuses while the live server still runs another version or other tools,
   so it cannot announce what is not out. It logs in with `gh auth token`
   (gh must be logged in as `flogvit`; the namespace is `io.github.flogvit`)
   and needs nothing installed.
4. **Press Request update** on https://mcpservers.org/servers/bible-flogvit-com-en-mcp.
   It is anonymous and takes effect at once, so press it only after the site
   is out — pressed earlier, they re-read the old page. Their review takes up to
   two weeks. The short description there is the one submitted in the form;
   whether Request update refreshes it too is not known. To change it, email
   contact@mcpservers.org.
5. **Check, about 30 minutes later:**
   ```sh
   cd mcp && bun --env-file=../.env scripts/listings.ts check
   ```
   Every line should say `ok`. `mcptry tools` follows mcptry's own schedule and
   can lag; "Connect live" on its page refreshes it. mcpservers.org sits behind
   a Cloudflare check and cannot be read by the script: open the page and see
   that the tool list matches.

## Where it is listed, and how to take it down

The namespace is GitHub (`io.github.flogvit/…`), not DNS (`com.flogvit/…`):
flogvit.com's DNS is edited by hand at Domeneshop, and a GitHub login is
something a script can do.

| Where | Status (2026-10-26) | Take it down |
|---|---|---|
| [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.flogvit/bible) | published; the current version is what `scripts/listings.ts check` reports | `mcp-publisher status --status deleted --all-versions --message "<why>" io.github.flogvit/bible` (`brew install mcp-publisher`, `mcp-publisher login github --token "$(gh auth token)"`) — hides it; `--status active` brings it back. The registry never deletes metadata. |
| [Glama](https://glama.ai/mcp/connectors/io.github.flogvit/bible) | listed, read from the registry | goes with the registry entry |
| PulseMCP | reads the registry by itself (its own form is closed) | goes with the registry entry |
| [mcptry.com](https://mcptry.com/servers/io.github.flogvit/bible) | listed, read from the registry; checks the live server on a schedule | goes with the registry entry |
| [mcp.so](https://mcp.so) | submitted: chatmcp/mcpso#6153 | close the issue and ask there |
| [mcpservers.org](https://mcpservers.org/servers/bible-flogvit-com-en-mcp) | listed (submitted through the free form) | email contact@mcpservers.org |
| [awesome-remote-mcp-servers](https://github.com/punkpeye/awesome-remote-mcp-servers) | PR punkpeye/awesome-remote-mcp-servers#2991, from the fork `flogvit/awesome-remote-mcp-servers` | close the PR; once merged, a PR removing the three lines. Remote-only servers go in this list, not in `awesome-mcp-servers` — its CONTRIBUTING says so. |
| [Smithery](https://smithery.ai/new) | **not submitted** — needs a login as flogvit | delete the server in Smithery's settings |
| [cursor.directory](https://cursor.directory/mcp/new) | **not submitted** — needs a login | remove it there |
| Claude's connector directory | **not submitted** — only a Pro/Max/Team account can submit, at `claude.ai/directory/manage` → Submit new → MCP connector | remove the listing in the same portal |

The three that are not submitted need nothing but the login: the address, the
description and every field Anthropic's form asks for (one-liner, description,
documentation and privacy URLs, support contact, use cases, example prompts)
are written out in issue #157.

What each one got, and when, is in issue #157 on GitHub.

The guide page is `/mcp` in `../src/routes/pages/mcp.tsx`. Removing it means
removing the route, the footer link in `../src/views/layout.tsx`, `/mcp` in
`../src/lib/sitemap-paths.ts` and `test/pages.ts`, and the pointer in
`llms.txt` (`../src/routes/seo.ts`) — then deploying bibel.

## Run it locally

Needs the local database the site uses (`../.env`, `DB_PORT=3326`).

```sh
cd mcp
bun install
bun run dev            # http://localhost:8080/mcp
```

Try it with the MCP Inspector (`npx @modelcontextprotocol/inspector`, transport
*Streamable HTTP*, URL `http://localhost:8080/mcp`), or by hand:

```sh
curl -s -X POST localhost:8080/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_passage","arguments":{"reference":"John 3:16"}}}'
```

`GET /healthz` checks that the database user can read every content table and
reads John 3:16: 200 with the verse, or 503 with the reason — a missing grant is
named.

## Tests

```sh
cd mcp && bun run test && bun run typecheck
```

`test/server.test.ts` calls every tool over HTTP against the local database and
checks that each answer links only to localised pages on bible.flogvit.com (or
the sources the licence names) and never shows the site's `[ref:…]` markup.
`test/grants.test.ts` creates a local MySQL user with exactly the grants the
server gets in production, runs every tool as that user, and checks that the
user tables refuse it — a tool that needs a table outside the grants fails
there — and that `/healthz` names a table whose grant is revoked. `test/books.test.ts` checks that every book name and abbreviation the
site shows, in every language, finds its own book. `test/find-references.test.ts`
finds every book by every name inside a sentence, and its last verse as the
last. `test/cli.test.ts` runs the command line client (`../cli/`) as its own
program, with node and bun, against a listening server.
`test/lookups.test.ts` holds the six direct lookups to every row of their
tables. `test/mapping.test.ts` holds `mapping` to `mapChapter()` over every
chapter where the King James numbering differs from osnb, plus Malachi 4,
cross-references in and out, and `check_references`.
`test/tool-quality.test.ts` reads `tools/list` and fails on a tool without a
title, a description or all four annotation hints, an argument or output field
without a description, an optional argument that does not say its default, or
an allowed value its description does not name — what a client, and mcptry.com's
Tool quality score, read before calling anything.

bibel's own `bun test` in the repo root does not run these (`bunfig.toml`):
this package has its own dependencies.

## How it is built

- **Its own package, its own image.** `@modelcontextprotocol/sdk` and its
  dependencies live here and never reach the site's image. The image is built
  from the repo root (`docker build -f mcp/Dockerfile .`) because the server
  reads the database through the site's own getters in `src/lib/` — an answer
  here is the page there.
- **Its own database user, read-only on content.** `src/grants.ts` grants
  SELECT on the tables the import owns (`CONTENT_TABLES`) and nothing else, so
  users' notes, manuscripts and shares are out of reach.
- **Stateless.** One MCP server per request; any request can land on any
  process.
- **A global cap, not a per-IP one.** Claude and ChatGPT call connectors from
  their own servers, so one IP is many users. Over the cap the server answers
  503 with `Retry-After` instead of queueing without end. The command line
  client is the one caller it can tell apart, and the one most likely to come in
  a loop, so it may hold only `MCP_MAX_CONCURRENT_CLI` of the slots.

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | 8080 | |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | as the site | the database user should have only `grantStatements()` |
| `DB_TLS` | off | `1` connects over TLS — for a database user that is refused in plain text |
| `DB_POOL_MAX` | 5 | |
| `MCP_MAX_CONCURRENT` | 4 | requests served at once |
| `MCP_MAX_CONCURRENT_CLI` | 2 | of those, how many the command line client may hold (`User-Agent: flogvit-bible-cli/…`) |

`bun scripts/grants.ts <database>` prints the GRANT statements for the
database user. They are derived from `CONTENT_TABLES`, but applied only when
someone runs them: when the import gets a new content table, run them again as
the database admin. Until then `/healthz` answers 503 and names the table.
