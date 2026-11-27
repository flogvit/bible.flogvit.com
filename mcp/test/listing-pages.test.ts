import { expect, test } from 'bun:test';
import { MCP_EN } from '../../src/lib/dictionaries-mcp.ts';
import { MCPSERVERS, mcpserversReadUrl, mcpserversToolCount } from '../scripts/listing-pages.ts';

// #176: mcpservers.org copies the text of /en/mcp, and `listings.ts check` is
// the Verifiser line for a release. The page sits behind a Cloudflare challenge,
// so check used to print «open the page and look» — the one directory a
// release can leave behind was the one nobody measured.

const intro = (n: number) => MCP_EN['mcp.toolsIntro'].replace('{n}', String(n));

test('the tool count is read from the sentence /en/mcp writes, as mcpservers.org copied it', () => {
  const page = `## What the assistant can look up\n\n${intro(21)}\n\n| Tool | What it does |`;
  expect(mcpserversToolCount(page)).toBe(21);
});

test('the copy from before the count was a number reads as no count, so check says DIFF', () => {
  expect(mcpserversToolCount('The server has thirteen tools. You never call them yourself.')).toBeNull();
  expect(mcpserversToolCount('Just a moment...')).toBeNull();
});

test('the page is read through a reader that gets past the Cloudflare challenge', () => {
  expect(mcpserversReadUrl()).toBe(`https://r.jina.ai/${MCPSERVERS}`);
});
