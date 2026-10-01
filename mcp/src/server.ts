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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { withRetryBudget } from '../../src/lib/db.ts';
import { registerTools } from './tools.ts';

export const SERVER_NAME = 'flogvit-bible';
export const SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = `Bible text and study material from bible.flogvit.com.

Editions: osen (English), osnb (Norwegian Bokmål) and osnn (Norwegian Nynorsk) are open CC BY 4.0 translations made directly from the Hebrew and Greek; sblgnt (Greek NT) and tanach (Hebrew OT) are the source texts.

Quote Bible text from get_passage rather than from memory, and give the link and source line it returns: the CC BY licence requires the attribution to follow the text. Answer in the user's language and pass it as \`language\` (en, nb, nn, sv, fr, es, fi, de).

Typical flow: search_bible or search_topics to find passages, get_passage to read them (several references in one call, separated by ";"), get_original_text for the Hebrew/Greek, get_cross_references and get_chapter_study to go deeper.`;

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server);
  return server;
}

export interface Limits {
  maxConcurrent: number;
  /** How long a request waits for a free slot before it gets 503. */
  queueWaitMs: number;
  /** One DB retry budget for everything a request does (`db.ts`, #107). */
  dbBudgetMs: number;
}

export function limitsFromEnv(env = process.env): Limits {
  return {
    maxConcurrent: Number(env.MCP_MAX_CONCURRENT || 4),
    queueWaitMs: Number(env.MCP_QUEUE_WAIT_MS || 5000),
    dbBudgetMs: Number(env.MCP_DB_BUDGET_MS || 10_000),
  };
}

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }, { status, headers });
}

export function createHandler(limits: Limits): (req: Request) => Promise<Response> {
  let active = 0;
  const waiting: (() => void)[] = [];

  const acquire = (): Promise<boolean> => {
    if (active < limits.maxConcurrent) {
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
      }, limits.queueWaitMs);
      waiting.push(grant);
    });
  };
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
    // Stateless: no server-initiated stream to open, no session to delete.
    if (req.method !== 'POST') return jsonRpcError(405, 'Method not allowed.', { allow: 'POST' });

    if (!(await acquire())) return jsonRpcError(503, 'Busy — try again shortly.', { 'retry-after': '10' });
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
      release();
      await transport.close();
      await server.close();
    }
  };
}
