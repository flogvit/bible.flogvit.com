// mcp.bible.flogvit.com — runbook in ../README.md.

import { createHandler, limitsFromEnv } from './server.ts';

const server = Bun.serve({ port: Number(process.env.PORT || 8080), fetch: createHandler(limitsFromEnv()) });

console.log(`bibel-mcp listening on :${server.port}`);
