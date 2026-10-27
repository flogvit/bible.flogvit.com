// The MCP directories after a release: what each one shows, and the registry
// publish that updates them. Runbook: mcp/README.md → «Releasing a new version».
//
//   bun scripts/listings.ts check     compare the live server, the registry and mcptry
//   bun scripts/listings.ts publish   publish server.json to the MCP Registry
//
// publish refuses until the live server runs this server.json's version with
// this checkout's tools: the registry entry is what mcptry, Glama and PulseMCP
// copy, and it should never describe a server that is not out yet.

import { MCP_REGISTRY_NAME, MCP_TOOL_NAMES, MCP_URL } from '../../src/lib/mcp-info.ts';
import { SERVER_VERSION } from '../src/server.ts';

const REGISTRY = 'https://registry.modelcontextprotocol.io';
const MCPTRY = `https://mcptry.com/servers/${MCP_REGISTRY_NAME}`;
const MCPSERVERS = 'https://mcpservers.org/servers/bible-flogvit-com-en-mcp';
const OWNER = 'flogvit';

const entry = (await Bun.file(new URL('../server.json', import.meta.url)).json()) as {
  name: string;
  version: string;
  description: string;
  websiteUrl: string;
};

async function rpc(method: string, params?: unknown): Promise<any> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return ((await res.json()) as { result: unknown }).result;
}

async function live(): Promise<{ version: string; tools: string[] }> {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'listings', version: '1' } });
  const list = await rpc('tools/list');
  return { version: init.serverInfo.version, tools: (list.tools as { name: string }[]).map((t) => t.name).sort() };
}

async function registry(): Promise<{ version: string; description: string } | null> {
  const res = await fetch(`${REGISTRY}/v0.1/servers?search=${encodeURIComponent(MCP_REGISTRY_NAME)}`);
  const { servers } = (await res.json()) as { servers: { server: { name: string; version: string; description: string }; _meta?: any }[] };
  const latest = servers.find((s) => s.server.name === MCP_REGISTRY_NAME && s._meta?.['io.modelcontextprotocol.registry/official']?.isLatest);
  return latest ? latest.server : null;
}

/** mcptry's page as text: the version it copied from the registry, and the tool count from its last check. */
async function mcptry(): Promise<{ version: string | null; tools: number | null }> {
  const html = await (await fetch(MCPTRY)).text();
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const version = text.match(new RegExp(`${MCP_REGISTRY_NAME.replace(/[./]/g, '\\$&')} v ([\\d.]+)`))?.[1] ?? null;
  const tools = text.match(/Tools \( (\d+) \)/)?.[1];
  return { version, tools: tools ? Number(tools) : null };
}

const want = [...MCP_TOOL_NAMES].sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function check(): Promise<boolean> {
  const l = await live();
  const r = await registry();
  const m = await mcptry();
  const rows: [string, boolean, string][] = [
    ['server.json = SERVER_VERSION', entry.version === SERVER_VERSION, `${entry.version} / ${SERVER_VERSION}`],
    ['live server version', l.version === entry.version, l.version],
    ['live tools = this checkout', same(l.tools, want), `${l.tools.length} live, ${want.length} here`],
    ['registry version', r?.version === entry.version, r?.version ?? 'not found'],
    ['registry description', r?.description === entry.description, r?.description ?? '-'],
    ['mcptry version (from the registry, every 30 min)', m.version === entry.version, m.version ?? 'not read'],
    ['mcptry tools (its own scheduled check)', m.tools === l.tools.length, `${m.tools ?? 'not read'}`],
  ];
  for (const [what, ok, value] of rows) console.log(`${ok ? 'ok  ' : 'DIFF'} ${what}: ${value}`);
  console.log(`\nmcpservers.org is behind a Cloudflare check and cannot be read from here. Open ${MCPSERVERS}:`);
  console.log(`its text is a copy of ${entry.websiteUrl}; if it still shows the old tool count, press «Request update» once.`);
  return rows.every(([, ok]) => ok);
}

async function publish(): Promise<void> {
  if (entry.version !== SERVER_VERSION) throw new Error(`server.json says ${entry.version}, SERVER_VERSION says ${SERVER_VERSION}. Raise both.`);
  const l = await live();
  if (l.version !== entry.version || !same(l.tools, want)) {
    throw new Error(`The live server runs ${l.version} with ${l.tools.length} tools; this checkout is ${entry.version} with ${want.length}. Publish after the rollout.`);
  }
  const r = await registry();
  if (r?.version === entry.version) {
    console.log(`The registry already has ${entry.version}. Nothing to publish.`);
    return;
  }

  const validation = await fetch(`${REGISTRY}/v0.1/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
  if (!validation.ok) throw new Error(`validate: ${validation.status} ${await validation.text()}`);

  const gh = (args: string[]) => Bun.spawnSync(['gh', ...args]).stdout.toString().trim();
  const login = gh(['api', 'user', '-q', '.login']);
  if (login !== OWNER) throw new Error(`gh is logged in as "${login}"; the io.github.${OWNER} namespace needs ${OWNER}.`);
  const auth = await fetch(`${REGISTRY}/v0.1/auth/github-at`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ github_token: gh(['auth', 'token']) }),
  });
  if (!auth.ok) throw new Error(`auth: ${auth.status} ${await auth.text()}`);
  const { registry_token } = (await auth.json()) as { registry_token: string };

  const res = await fetch(`${REGISTRY}/v0.1/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${registry_token}` },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`publish: ${res.status} ${await res.text()}`);
  const after = await registry();
  console.log(`Published ${entry.version}; the registry now says ${after?.version}. mcptry copies it within 30 minutes: run check then.`);
}

const command = process.argv[2];
if (command === 'check') process.exit((await check()) ? 0 : 1);
else if (command === 'publish') await publish();
else {
  console.error('usage: bun scripts/listings.ts check | publish');
  process.exit(2);
}
