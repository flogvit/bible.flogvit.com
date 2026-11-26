// Reading mcpservers.org for `listings.ts check` (#176). Its listing is a copy
// of /en/mcp, so the tool count there is the sentence `mcp.toolsIntro` writes.

import { MCP_EN } from '../../src/lib/dictionaries-mcp.ts';

export const MCPSERVERS = 'https://mcpservers.org/servers/bible-flogvit-com-en-mcp';

/** mcpservers.org answers a script with a Cloudflare challenge; this public reader renders the page and returns its text. */
export const mcpserversReadUrl = () => `https://r.jina.ai/${MCPSERVERS}`;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "The server has {n} tools. …" → /The server has\s*(\d+)\s*tools\./
const [before = '', after = ''] = MCP_EN['mcp.toolsIntro'].split('{n}');
const COUNT = new RegExp(`${escape(before.trim())}\\s*(\\d+)\\s*${escape(after.trim().split(/\s/)[0] ?? '')}`);

/** The tool count the copied page states, or null when it states none (an old copy, or the challenge page). */
export function mcpserversToolCount(text: string): number | null {
  const n = text.match(COUNT)?.[1];
  return n ? Number(n) : null;
}
