---
name: flogvit-bible
description: Read, search and quote the Bible from bible.flogvit.com — passages side by side in English, Norwegian Bokmål and Nynorsk, the Hebrew and Greek source texts word by word, cross-references, chapter study notes, people, stories and themes — and check every Bible reference in a manuscript or sermon file. Use when the user asks what a verse says, wants a Bible quotation, asks about the original Hebrew or Greek, a biblical person or topic, or wants the references in a text checked.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/flogvit-bible.mjs *), Bash(bun ${CLAUDE_SKILL_DIR}/flogvit-bible.mjs *), Bash(flogvit-bible *)
---

# flogvit-bible

A command line client for the Bible on bible.flogvit.com. It needs node 18 or
later, or bun, and network access to `mcp.bible.flogvit.com`.

Run it as `node ${CLAUDE_SKILL_DIR}/flogvit-bible.mjs <command> …` — the file
lies next to this SKILL.md. If `flogvit-bible` is on the PATH, that works too.
Below it is written `flogvit-bible`.

If the session already has the `flogvit-bible` MCP tools (`get_passage`,
`search_bible` …), use those instead: they are the same tools.

## Rules that matter

- **Quote Bible text from the command's output, never from memory.** Keep the
  link and the `Source:` line that follow the text: the translations are
  CC BY 4.0, and the attribution has to go wherever the quotation goes.
- **Pass `--language` in the language of the conversation** (`en`, `nb`, `nn`,
  `sv`, `fr`, `es`, `fi`, `de`). It picks the edition when none is named —
  `nb` → OSNB, `nn` → OSNN, everything else → OSEN (English) — and the language
  of book names and study notes. Without it the machine's `LANG` decides.
- The word-by-word explanations from `original-text` are written in Norwegian.
  Translate them for the user when the conversation is in another language.
- Run `flogvit-bible <command> --help` for a command's options before guessing
  one.

## Commands

| Need | Command |
|---|---|
| What a passage says, in one or more editions | `passage "John 3:16-18" --editions osen,osnb,sblgnt` |
| Translators' notes and alternative renderings | `passage "Joh 3,16" --include-notes` |
| Where the Bible says something | `search-bible forgiv sins --testament NT` (stems match: `forgiv` finds forgive, forgiveness) |
| A phrase exactly | `search-bible '"love one another"'` |
| The Hebrew or Greek, word by word | `original-text "Joh 1,1-3"` |
| Every verse with a Greek or Hebrew word | `search-original-word λόγος` |
| Related passages | `cross-references "Rom 8:28"` |
| A chapter's summary, context, key words, people, themes | `chapter-study "Matt 5"` |
| An introduction to a book | `book-overview Romans` |
| A person | `search-people tamar`, then `person tamar-juda` |
| Stories, themes, prophecies, gospel parallels | `search-topics prodigal`, then `topic story den-fortapte-sonn` |
| Verse of the day | `daily-verse` |
| Editions and their licences | `list-editions` |
| **Every Bible reference in a file** | `check manuscript.md`, or `check -` for standard input |

References are read in both conventions — `John 3:16`, `Joh 3,16`,
`1 Cor 13:4-7`, `1. Kor 13,4.7`, `Gen 1:1-2:3`, `Ps 23` — and several can be
given at once, separated by `;`. Book names work in all eight languages.

Editions: `osen` (English), `osnb` (Norwegian Bokmål), `osnn` (Norwegian
Nynorsk) are open translations from the Hebrew and Greek; `sblgnt` is the
Greek New Testament, `tanach` the Hebrew Old Testament.

`--json` prints the server's answer as JSON. For `check` that is
`{references: [{line, column, written, reference, url, problem?}], checked, problems}`.

## Checking a manuscript

`flogvit-bible check <file> --language nb` lists every reference with its line
and column, the verses it points at, and a `PROBLEM:` line for a chapter or
verse that does not exist. To check a quotation, compare the user's wording
with the verse text printed under its reference; say which edition you
compared with.

- Book names must be capitalised: `Joh 3,16` is found, `joh 3,16` is not, so
  that ordinary words such as Norwegian "hos 3" are not read as Hosea.
- `--no-include-text` lists the references without the verses, for a long
  file.
- The file's text is sent to mcp.bible.flogvit.com to be checked. Tell the
  user before checking a file they have not asked to have checked.

## Exit codes

`0` answered. `1` the answer is a problem: a reference the server cannot read,
or `check` found a reference that does not exist. `2` the command could not
run: unknown command or option, server unreachable, or busy — the message then
says how many seconds to wait before one retry.
