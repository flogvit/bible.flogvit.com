// What the MCP server's database user may read: SELECT on the tables bibel's
// import owns (`CONTENT_TABLES`), and nothing else. The user tables — notes,
// manuscripts, shares, contributions — are out of reach, so a compromised npm
// package in this image can read nothing that is not already published.
//
// Derived from `CONTENT_TABLES`, not listed: a new content table is granted on
// the next `--provision`, and a new USER table can never be.

import { CONTENT_TABLES } from '../../src/lib/content-sources.ts';

export const MCP_DB_USER = 'bibel-mcp';

export function grantStatements(user: string, database: string, host = '%'): string[] {
  return CONTENT_TABLES.map((t) => `GRANT SELECT ON \`${database}\`.\`${t}\` TO '${user}'@'${host}'`);
}
