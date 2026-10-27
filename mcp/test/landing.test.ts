import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { MCP_REGISTRY_NAME, MCP_TOOL_NAMES, MCP_URL } from '../../src/lib/mcp-info.ts';
import { ICONS, SERVER_NAME, SERVER_VERSION, createHandler } from '../src/server.ts';
import { mcpPost } from './calls.ts';

// #157: the address itself is where many people land — from a directory, a
// registry listing or a link someone pasted. A browser gets the guide in
// short; an MCP client on /mcp gets exactly what it got before. And what the
// site and the registry SAY about the server is held against what it IS.

const handler = createHandler({ maxConcurrent: 2, maxConcurrentCli: 2, queueWaitMs: 100, dbBudgetMs: 2000 });
const root = (headers: Record<string, string>) => handler(new Request('http://localhost/', { headers }));

test('a browser opening the address gets the landing page in its language', async () => {
  const res = await root({ accept: 'text/html,*/*;q=0.8', 'accept-language': 'sv-SE,sv;q=0.9' });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  expect(res.headers.get('content-language')).toBe('sv');
  expect(res.headers.get('vary')).toContain('Accept');
  const html = await res.text();
  expect(html).toContain('href="https://bible.flogvit.com/sv/mcp"');
  expect(html).toContain(MCP_URL);
});

test('curl and anything else that is not a browser gets the plain text', async () => {
  const res = await root({ accept: '*/*' });
  expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  expect(await res.text()).toContain(MCP_URL);
});

test('/mcp still answers an MCP client, and a GET there is still 405', async () => {
  const res = await mcpPost(handler, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { result: { serverInfo: { name: string } } };
  expect(body.result.serverInfo.name).toBe(SERVER_NAME);
  expect((await handler(new Request('http://localhost/mcp'))).status).toBe(405);
});

test('the tools the page lists are exactly the tools the server has', async () => {
  const res = await mcpPost(handler, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const { result } = (await res.json()) as { result: { tools: { name: string }[] } };
  expect(result.tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
});

test('server.json (the MCP Registry entry) says what the server is', () => {
  const entry = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
  expect(entry.name).toBe(MCP_REGISTRY_NAME);
  expect(entry.version).toBe(SERVER_VERSION);
  // The registry's own limit; a longer one is refused at publish time.
  expect(entry.description.length).toBeLessThanOrEqual(100);
  expect(entry.remotes).toEqual([{ type: 'streamable-http', url: MCP_URL }]);
  const served: string[] = ICONS.map((i) => `https://mcp.bible.flogvit.com${i.path}`);
  for (const icon of entry.icons) expect(served).toContain(icon.src);
});
