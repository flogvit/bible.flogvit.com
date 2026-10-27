// HTTP in, MCP out — stateless Streamable HTTP, one server per request.
//
// Stateless because nothing here belongs to a conversation: every tool is a
// read, so there is no session to keep, and any request can land on any
// process (the spec's own advice for servers behind a load balancer).
//
// The cap on concurrent requests is the reason this is its own container. Model
// traffic comes in bursts — one question can be ten tool calls — and it must
// never take the reading site with it. The cap is GLOBAL, not per IP: Claude
// and ChatGPT call connectors from their own servers, so one IP is many users.
//
// The command line client (`cli/`) is the one caller we can tell apart, by its
// User-Agent, and the one most likely to arrive in a loop: a script checking a
// book's worth of files. It gets a cap of its own INSIDE the global one, so a
// script can never hold every slot the assistants share.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { getVerse } from '../../src/lib/bible.ts';
import { CONTENT_TABLES } from '../../src/lib/content-sources.ts';
import { getSql, withRetryBudget } from '../../src/lib/db.ts';
import { registerLookupTools } from './lookups.ts';
import { registerTools } from './tools.ts';
import { ABOUT, landingHtml, wantsHtml } from './landing.ts';

export const SERVER_NAME = 'flogvit-bible';
export const SERVER_VERSION = '1.1.0';

const INSTRUCTIONS = `Bible text and study material from bible.flogvit.com.

Editions: osen (English), osnb (Norwegian Bokmål) and osnn (Norwegian Nynorsk) are open CC BY 4.0 translations made directly from the Hebrew and Greek; sblgnt (Greek NT) and tanach (Hebrew OT) are the source texts.

Quote Bible text from get_passage rather than from memory, and give the link and source line it returns: the CC BY licence requires the attribution to follow the text. Answer in the user's language and pass it as \`language\` (en, nb, nn, sv, fr, es, fi, de).

Typical flow: search_bible or search_topics to find passages, get_passage to read them (several references in one call, separated by ";"), get_original_text for the Hebrew/Greek, get_cross_references and get_chapter_study to go deeper.`;

const ORIGIN = 'https://mcp.bible.flogvit.com';

/**
 * bible.flogvit.com's own icon, served here too (#128): browsers and the
 * crawlers that build MCP-server directories ask for /favicon.ico, and clients
 * that read `serverInfo.icons` get the same files. The bytes are bibel's
 * public/ — copied into the image, not duplicated in this package.
 */
export const ICONS = [
  { path: '/favicon.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
  { path: '/favicon.ico', mimeType: 'image/x-icon', sizes: ['16x16', '32x32'] },
  { path: '/apple-touch-icon.png', mimeType: 'image/png', sizes: ['180x180'] },
] as const;

const PUBLIC_DIR = Bun.fileURLToPath(new URL('../../public', import.meta.url));

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      websiteUrl: 'https://bible.flogvit.com',
      icons: ICONS.map(({ path, mimeType, sizes }) => ({ src: ORIGIN + path, mimeType, sizes: [...sizes] })),
    },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server);
  registerLookupTools(server);
  return server;
}

export interface Limits {
  maxConcurrent: number;
  /** Of `maxConcurrent`, how many the command line client may hold. */
  maxConcurrentCli: number;
  /** How long a request waits for a free slot before it gets 503. */
  queueWaitMs: number;
  /** One DB retry budget for everything a request does (`db.ts`, #107). */
  dbBudgetMs: number;
}

export function limitsFromEnv(): Limits {
  return {
    maxConcurrent: Number(process.env.MCP_MAX_CONCURRENT || 4),
    maxConcurrentCli: Number(process.env.MCP_MAX_CONCURRENT_CLI || 2),
    queueWaitMs: 5000,
    dbBudgetMs: 10_000,
  };
}

/** Content tables this database user cannot read. */
async function ungranted(): Promise<string[]> {
  const missing: string[] = [];
  for (const table of CONTENT_TABLES) {
    try {
      await getSql().unsafe(`SELECT 1 FROM \`${table}\` LIMIT 0`);
    } catch (e) {
      if (!/denied|doesn't exist/i.test((e as Error).message)) throw e;
      missing.push(table);
    }
  }
  return missing;
}

/**
 * A real read, with the service's own grants. `SELECT 1` would pass with a
 * grant missing or `verses` empty; this does not. The grants are applied at
 * provisioning, so a content table added since then is NAMED here — smoke.sh
 * sees the 503, and the deploy rolls back with the reason in the body.
 */
async function health(): Promise<Response> {
  try {
    const missing = await ungranted();
    if (missing.length) {
      return new Response(`no SELECT on ${missing.join(', ')} — re-run the grants (mcp/README.md)`, { status: 503 });
    }
    const v = await getVerse(43, 3, 16, 'osen');
    return v ? new Response(`ok — John 3:16: ${v.text}`) : new Response('no Bible text in the database', { status: 503 });
  } catch {
    return new Response('database unavailable', { status: 503 });
  }
}

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }, { status, headers });
}

/** The User-Agent `cli/flogvit-bible.mjs` sends. */
export const CLI_USER_AGENT = /^flogvit-bible-cli\//;

interface Semaphore {
  acquire(): Promise<boolean>;
  release(): void;
}

function semaphore(max: number, waitMs: number): Semaphore {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    acquire() {
      if (active < max) {
        active++;
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const grant = () => {
          clearTimeout(timer);
          active++;
          resolve(true);
        };
        const timer = setTimeout(() => {
          waiting.splice(waiting.indexOf(grant), 1);
          resolve(false);
        }, waitMs);
        waiting.push(grant);
      });
    },
    release() {
      active--;
      waiting.shift()?.();
    },
  };
}

export function createHandler(limits: Limits): (req: Request) => Promise<Response> {
  const all = semaphore(limits.maxConcurrent, limits.queueWaitMs);
  const cli = semaphore(limits.maxConcurrentCli, limits.queueWaitMs);

  /** The slots a request holds, in the order to give them back — or null when it gets none. */
  const acquire = async (req: Request): Promise<Semaphore[] | null> => {
    const held: Semaphore[] = [];
    const needs = CLI_USER_AGENT.test(req.headers.get('user-agent') ?? '') ? [cli, all] : [all];
    for (const s of needs) {
      if (!(await s.acquire())) {
        for (const h of held) h.release();
        return null;
      }
      held.push(s);
    }
    return held;
  };

  return async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    if (pathname === '/healthz') return withRetryBudget(health, limits.dbBudgetMs);
    if (pathname === '/') {
      // A browser gets the landing page (#157); everything else the text it always got.
      const vary = { vary: 'Accept, Accept-Language' };
      if (!wantsHtml(req)) return new Response(ABOUT, { headers: { 'content-type': 'text/plain; charset=utf-8', ...vary } });
      const { html, locale } = landingHtml(req);
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-language': locale, ...vary } });
    }
    const icon = ICONS.find((i) => i.path === pathname);
    if (icon) {
      return new Response(Bun.file(PUBLIC_DIR + icon.path), {
        headers: { 'content-type': icon.mimeType, 'cache-control': 'public, max-age=86400' },
      });
    }
    if (pathname !== '/mcp') return new Response('Not found', { status: 404 });
    // Stateless: no server-initiated stream to open, no session to delete.
    if (req.method !== 'POST') return jsonRpcError(405, 'Method not allowed.', { allow: 'POST' });

    const held = await acquire(req);
    if (!held) return jsonRpcError(503, 'Busy — try again shortly.', { 'retry-after': '10' });
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 64 * 1024,
    });
    try {
      await server.connect(transport);
      return await withRetryBudget(() => transport.handleRequest(req), limits.dbBudgetMs);
    } finally {
      for (const h of held) h.release();
      await transport.close();
      await server.close();
    }
  };
}
