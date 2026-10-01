// Prints the GRANT statements for the MCP database user, one per line, for
// server/deploy-bibel-mcp.sh --provision to run as the admin user.
//
//   bun mcp/scripts/grants.ts flogvit_bibel

import { grantStatements, MCP_DB_USER } from '../src/grants.ts';

const database = process.argv[2];
if (!database) {
  console.error('usage: bun mcp/scripts/grants.ts <database>');
  process.exit(1);
}
console.log(grantStatements(MCP_DB_USER, database).map((s) => `${s};`).join('\n'));
