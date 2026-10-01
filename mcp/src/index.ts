// mcp.bible.flogvit.com — runbook in ../README.md.

import { getVerse } from '../../src/lib/bible.ts';
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
    // A real read, with the MCP database user's own grants: a missing grant or
    // an empty `verses` is as fatal here as a dead connection, and `SELECT 1`
    // would have passed both. smoke.sh looks for the verse text.
    if (pathname === '/healthz') {
      try {
        const v = await getVerse(43, 3, 16, 'osen');
        return v ? new Response(`ok — John 3:16: ${v.text}`) : new Response('no Bible text in the database', { status: 503 });
      } catch {
        return new Response('database unavailable', { status: 503 });
      }
    }
    if (pathname === '/') return new Response(ABOUT, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return mcp(req);
  },
});

console.log(`bibel-mcp listening on :${server.port}`);
