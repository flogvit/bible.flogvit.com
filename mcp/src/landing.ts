// mcp.bible.flogvit.com/ — what a person sees who opens the address (#157).
//
// A browser gets a short HTML page in its own language: the address, the
// three commonest ways to connect, and a link to the full guide on the site.
// Everything else (curl, a crawler, an MCP client probing the root) gets the
// plain text it always got. The words are the site's own dictionaries and the
// facts are lib/mcp-info.ts, so this page and /<lang>/mcp cannot disagree.

import { makeT, negotiateLocale, type Locale } from '../../src/lib/i18n.ts';
import { MCP_URL, SNIPPETS } from '../../src/lib/mcp-info.ts';

export const ABOUT = `This is the MCP server for bible.flogvit.com.

Add ${MCP_URL} as a custom connector in Claude, ChatGPT
or any other MCP client to read and search the Bible from the assistant.
No account or key is needed.

How to connect each client: https://bible.flogvit.com/en/mcp
`;

/** The guide on the site, in the reader's language. */
export const guideUrl = (locale: Locale) => `https://bible.flogvit.com/${locale}/mcp`;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A browser asks for text/html first; nothing else does. */
export function wantsHtml(req: Request): boolean {
  return /\btext\/html\b/.test(req.headers.get('accept') ?? '');
}

export function landingHtml(req: Request): { html: string; locale: Locale } {
  const locale = negotiateLocale(null, req.headers.get('accept-language'));
  const t = makeT(locale);
  const e = (k: Parameters<typeof t>[0]) => esc(t(k));
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e('mcp.title')}</title>
<meta name="description" content="${e('mcp.meta')}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="canonical" href="${guideUrl(locale)}">
<style>
:root { --paper: #fbfaf6; --paper-2: #f2efe6; --ink: #1d1c19; --ink-2: #67665f; --border: #dedad0; --gold: #8a6a1f; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --paper: #161513; --paper-2: #211f1c; --ink: #ece9e1; --ink-2: #a9a59a; --border: #36332d; --gold: #d8b866; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 1rem/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1rem 3rem; overflow-wrap: break-word; hyphens: auto; }
.brand { font-weight: 700; letter-spacing: .04em; color: var(--ink-2); margin: 0 0 1.5rem; }
.brand span { color: var(--gold); }
h1 { font-size: 1.75rem; line-height: 1.25; margin: 0 0 1rem; }
h2 { font-size: 1.125rem; margin: 2rem 0 .5rem; }
.addr { display: flex; flex-direction: column; gap: .25rem; min-width: 0; margin: 1.5rem 0; padding: 1rem; background: var(--paper-2); border: 1px solid var(--border); border-radius: 6px; }
.addr small { color: var(--ink-2); }
.addr code { font-size: 1.125rem; overflow-wrap: anywhere; user-select: all; }
ol { padding-left: 1.5rem; } li { margin-bottom: .5rem; }
pre { overflow-x: auto; margin: 0; padding: .75rem 1rem; background: var(--paper-2); border: 1px solid var(--border); border-radius: 6px; font-size: .875rem; }
a { color: var(--gold); }
.more { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
.more a { font-weight: 600; }
</style>
</head>
<body>
<main>
<p class="brand">FLOGVIT<span>.</span>bible · MCP</p>
<h1>${e('mcp.h1')}</h1>
<p>${e('mcp.intro')}</p>
<div class="addr"><small>${e('mcp.addrLabel')}</small><code>${esc(MCP_URL)}</code><small>${e('mcp.facts')}</small></div>
<h2>${e('mcp.claudeH')}</h2>
<ol><li>${e('mcp.claude1')}</li><li>${e('mcp.claude2')}</li><li>${e('mcp.claude3')}</li></ol>
<h2>ChatGPT</h2>
<ol><li>${e('mcp.chatgpt1')}</li><li>${e('mcp.chatgpt2')}</li><li>${e('mcp.chatgpt3')}</li></ol>
<h2>Claude Code</h2>
<pre><code>${esc(SNIPPETS.claudeCode)}</code></pre>
<p class="more">${e('mcp.landingMore')}<br><a href="${guideUrl(locale)}">${e('mcp.landingLink')} →</a></p>
</main>
</body>
</html>
`;
  return { html, locale };
}
