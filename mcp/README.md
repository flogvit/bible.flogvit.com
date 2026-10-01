# bible.flogvit.com MCP server

Lets an AI assistant read and search the Bible on bible.flogvit.com: the open
OSNB, OSNN and OSEN translations, the Hebrew and Greek source texts, and the
site's study material. Every answer links back to the page it came from.

**Address:** `https://mcp.bible.flogvit.com/mcp` — Streamable HTTP, no account,
no key.

## Connect an assistant

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
| `list_editions` | The editions and their licences |

References are read in English and Norwegian style alike — `John 3:16-18`,
`Joh 3,16.18`, `1 Cor 13:4-7`, `Gen 1:1-2:3`, several separated by `;` — and
book names in all eight site languages, plus the Norwegian letter names
(«Romerbrevet»).

Quoted Bible text carries its source line. The translations are CC BY 4.0, and
the attribution has to follow the text wherever the assistant puts it.

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
site shows, in every language, finds its own book.

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
  503 with `Retry-After` instead of queueing without end.

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | 8080 | |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | as the site | the database user should have only `grantStatements()` |
| `DB_TLS` | off | `1` connects over TLS — for a database user that is refused in plain text |
| `DB_POOL_MAX` | 5 | |
| `MCP_MAX_CONCURRENT` | 4 | requests served at once |

`bun scripts/grants.ts <database>` prints the GRANT statements for the
database user. They are derived from `CONTENT_TABLES`, but applied only when
someone runs them: when the import gets a new content table, run them again as
the database admin. Until then `/healthz` answers 503 and names the table.
