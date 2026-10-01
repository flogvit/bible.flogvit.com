# flogvit-bible — the Bible on bible.flogvit.com from a terminal

Read and search the Bible, the Hebrew and Greek source texts and the site's
study material — and check every Bible reference in a manuscript. For people
in a terminal, for scripts, and for AI agents through a skill.

It is one file, `skills/flogvit-bible/flogvit-bible.mjs`, with no
dependencies. It needs node 18 or later, or bun.

## Install

**Claude Code** — the plugin brings the skill, and the CLI inside it:

```
/plugin marketplace add flogvit/bible.flogvit.com
/plugin install flogvit-bible@flogvit-bible
```

Then ask as you normally would — "check the Bible references in sermon.md",
"what does John 1:1 say in the Greek?". The skill runs the CLI itself.

**Other agents that read `SKILL.md` files:** copy the
folder `skills/flogvit-bible/` into the agent's skills folder. The CLI lies in
the same folder, so nothing else needs installing.

**On the command line:**

```sh
curl -fsSL https://raw.githubusercontent.com/flogvit/bible.flogvit.com/main/cli/skills/flogvit-bible/flogvit-bible.mjs \
  -o ~/.local/bin/flogvit-bible && chmod +x ~/.local/bin/flogvit-bible
flogvit-bible --help
```

(`~/.local/bin` must be on your `PATH`; any folder that is works.)

## Use

```sh
flogvit-bible passage "John 3:16" --editions osen,osnb,sblgnt
flogvit-bible passage "Joh 3,16" --include-notes --language nb
flogvit-bible search-bible forgiv sins --testament NT
flogvit-bible original-text "Joh 1,1-3"
flogvit-bible chapter-study "Matt 5"
flogvit-bible check sermon.md
```

`flogvit-bible --help` lists the commands, `flogvit-bible <command> --help` a
command's options. A command can be shortened while it is unambiguous
(`check`, `pass`). `--json` prints the answer as JSON.

The language — of book names, study notes, and which translation is quoted
when none is named — is `--language`, else `FLOGVIT_BIBLE_LANG`, else the
first part of `LANG` (`nb_NO.UTF-8` → `nb`), else English.

### Check a manuscript

```sh
flogvit-bible check sermon.md --language nb
cat chapter-*.md | flogvit-bible check -
```

Each reference is listed with its line and column and the verses it points at,
so a quotation can be compared with its text. One that points past the end of a
chapter or book gets a `PROBLEM:` line, and the command exits with 1:

```
line 2, column 1: Sal 23,9 — PROBLEM: Salmene 23 has 6 verses, not 9.

3 Bible references, 1 with problems.
```

Book names must be capitalised (`Joh 3,16`, not `joh 3,16`); otherwise every
"hos 3" in Norwegian prose would be Hosea. `--no-include-text` leaves out the
verses for a long file.

The file's text is sent to mcp.bible.flogvit.com to be checked, and is not
stored there.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Answered |
| 1 | The answer is a problem: a reference the server cannot read, or `check` found one that does not exist |
| 2 | The command could not run: unknown command or option, server unreachable, or busy (the message says when to try again) |

## How it is built

- **The commands are the MCP server's tools.** The CLI reads `tools/list` from
  `https://mcp.bible.flogvit.com/mcp` on every run and turns each tool into a
  command (`get_passage` → `passage`), its required parameters into arguments
  and the rest into options. A new tool in `../mcp/` is a new command without
  touching this file. The answers — links, the CC BY source line — are the
  server's, so they cannot differ from what an assistant gets over MCP.
- **`check` is the one command with its own code:** it reads the file and sends
  it in parts of whole lines that fit one request, each with the number of its
  first line, and counts the problems for the exit code.
- **The server gives the CLI its own concurrency cap.** The CLI sends
  `User-Agent: flogvit-bible-cli/<version>`, and the server lets it hold at most
  `MCP_MAX_CONCURRENT_CLI` of its slots (`../mcp/README.md`), so a script in a
  loop cannot take the slots the assistants share.
- `FLOGVIT_BIBLE_URL` points it at another server, such as a local one:
  `FLOGVIT_BIBLE_URL=http://localhost:8080/mcp flogvit-bible passage "Ps 23"`.

## Tests

The tests run the file as its own program, with node and with bun, against a
real MCP server on the local database:

```sh
cd ../mcp && bun run test
```

`test/cli.test.ts` checks that every tool is a command with all its options,
the exit codes, the language, a file sent in parts keeping its line numbers,
and that the server recognises the CLI's User-Agent.
