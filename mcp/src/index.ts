// mcp.bible.flogvit.com — runbook in ../README.md.

import { getSql } from '../../src/lib/db.ts';
import { createHandler, limitsFromEnv } from './server.ts';

const ABOUT = `This is the MCP server for bible.flogvit.com.

Add https://mcp.bible.flogvit.com/mcp as a custom connector in Claude, ChatGPT
or any other MCP client to read and search the Bible from the assistant.
No account or key is needed.
`;

const mcp = createHandler(limitsFromEnv());

const server = Bun.serve({
  port: Number(process.env.PORT || 8080),
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === '/healthz') {
      try {
        await getSql()`SELECT 1`;
        return new Response('ok');
      } catch {
        return new Response('database unavailable', { status: 503 });
      }
    }
    if (pathname === '/') return new Response(ABOUT, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return mcp(req);
  },
});

console.log(`bibel-mcp listening on :${server.port}`);
