// What the MCP server (#127) IS, said once (#157): the site's /<lang>/mcp page
// and the server's own landing page at mcp.bible.flogvit.com/ both render from
// this, so the address, the tools and the client snippets cannot say two
// different things. `mcp/test/landing.test.ts` holds TOOL_ROWS against the
// server's real `tools/list` — a tool added there without a row here is red.
//
// The prose is in the dictionaries (`mcp.*`, dictionaries-mcp.ts); this file
// holds only what is NOT translated: names, addresses and code.

import type { MessageKey } from './i18n.ts';

export const MCP_ORIGIN = 'https://mcp.bible.flogvit.com';
export const MCP_URL = `${MCP_ORIGIN}/mcp`;

/** The name clients show the server under, and the key in their config files. */
export const MCP_CLIENT_KEY = 'flogvit-bible';

/** Name in the official MCP Registry — the `name` in `mcp/server.json`. */
export const MCP_REGISTRY_NAME = 'io.github.flogvit/bible';

export const MCP_SOURCE_URL = 'https://github.com/flogvit/bible.flogvit.com/tree/main/mcp';
export const SUPPORT_EMAIL = 'support@flogvit.com';

/**
 * One row per question a reader would ask; a row may cover two tools that
 * belong together (find a person, then read about them).
 */
export const TOOL_ROWS: readonly { tools: readonly string[]; what: MessageKey; ask: MessageKey }[] = [
  { tools: ['get_passage'], what: 'mcp.tool.passage', ask: 'mcp.ask.passage' },
  { tools: ['search_bible'], what: 'mcp.tool.search', ask: 'mcp.ask.search' },
  { tools: ['get_original_text'], what: 'mcp.tool.original', ask: 'mcp.ask.original' },
  { tools: ['search_original_word'], what: 'mcp.tool.originalWord', ask: 'mcp.ask.originalWord' },
  { tools: ['get_cross_references'], what: 'mcp.tool.crossRefs', ask: 'mcp.ask.crossRefs' },
  { tools: ['get_chapter_study'], what: 'mcp.tool.chapterStudy', ask: 'mcp.ask.chapterStudy' },
  { tools: ['get_book_overview'], what: 'mcp.tool.book', ask: 'mcp.ask.book' },
  { tools: ['search_people', 'get_person'], what: 'mcp.tool.people', ask: 'mcp.ask.people' },
  { tools: ['search_topics', 'get_topic'], what: 'mcp.tool.topics', ask: 'mcp.ask.topics' },
  { tools: ['get_daily_verse'], what: 'mcp.tool.daily', ask: 'mcp.ask.daily' },
  { tools: ['check_references'], what: 'mcp.tool.check', ask: 'mcp.ask.check' },
  { tools: ['list_editions'], what: 'mcp.tool.editions', ask: 'mcp.ask.editions' },
];

export const MCP_TOOL_NAMES: readonly string[] = TOOL_ROWS.flatMap((r) => r.tools);

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Config snippets, exactly as each client documents its file. */
export const SNIPPETS = {
  claudeCode: `claude mcp add --transport http ${MCP_CLIENT_KEY} ${MCP_URL}`,
  cursor: json({ mcpServers: { [MCP_CLIENT_KEY]: { url: MCP_URL } } }),
  vscode: json({ servers: { [MCP_CLIENT_KEY]: { type: 'http', url: MCP_URL } } }),
  gemini: json({ mcpServers: { [MCP_CLIENT_KEY]: { httpUrl: MCP_URL } } }),
  windsurf: json({ mcpServers: { [MCP_CLIENT_KEY]: { serverUrl: MCP_URL } } }),
  bridge: json({ mcpServers: { [MCP_CLIENT_KEY]: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL] } } }),
  inspector: 'npx @modelcontextprotocol/inspector',
} as const;

/** The editions the server reads, and the line that says what each one is. */
export const MCP_EDITIONS: readonly { id: string; name: string; what: MessageKey }[] = [
  { id: 'osen', name: 'OSEN — Open Source English', what: 'mcp.ed.translation' },
  { id: 'osnb', name: 'OSNB — Open Source Norsk Bokmål', what: 'mcp.ed.translation' },
  { id: 'osnn', name: 'OSNN — Open Source Norsk Nynorsk', what: 'mcp.ed.translation' },
  { id: 'sblgnt', name: 'SBLGNT — SBL Greek New Testament', what: 'mcp.ed.sblgnt' },
  { id: 'tanach', name: 'Tanach — Leningrad Codex (tanach.us)', what: 'mcp.ed.tanach' },
];
