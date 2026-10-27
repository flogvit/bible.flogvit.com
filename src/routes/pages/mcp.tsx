// /mcp — how to use the MCP server (#127) from an AI assistant (#157).
//
// A HOW-TO, not an explanation: the reader came to connect an assistant, so
// the address and the steps per client come first, and what the server is
// gets two sentences. Names, addresses and code come from lib/mcp-info.ts,
// which the server's own landing page renders from too.

import { Hono } from 'hono';
import type { AppEnv } from '../../lib/session.ts';
import { Layout } from '../../views/layout.tsx';
import { Breadcrumbs } from '../../views/breadcrumbs.tsx';
import { layoutProps, tFor, lhref, type Translator, type MessageKey } from '../../lib/i18n.ts';
import {
  MCP_EDITIONS, MCP_REGISTRY_NAME, MCP_SOURCE_URL, MCP_TOOL_NAMES, MCP_URL, SNIPPETS, SUPPORT_EMAIL, TOOL_ROWS,
} from '../../lib/mcp-info.ts';

const r = new Hono<AppEnv>();

/** A translated sentence with ONE placeholder rendered as an element, not as text. */
function withSlot(t: Translator, key: MessageKey, slot: string, el: unknown) {
  const [before, after = ''] = t(key).split(`{${slot}}`);
  return <>{before}{el}{after}</>;
}

const Code = ({ children }: { children: string }) => (
  <pre class="mcp-code"><code>{children}</code></pre>
);

const FileSnippet = ({ t, file, code, k = 'mcp.fileBody' }: { t: Translator; file: string; code: string; k?: MessageKey }) => (
  <>
    <p>{withSlot(t, k, 'file', <code>{file}</code>)}</p>
    <Code>{code}</Code>
  </>
);

r.get('/mcp', (c) => {
  const t = tFor(c);
  return c.html(
    <Layout {...layoutProps(c)} title={`${t('mcp.title')} — FLOGVIT.bible`} description={t('mcp.meta')} styles={['about.css', 'mcp.css']}>
      <div class="about-main">
        <div class="reading-container">
          <Breadcrumbs items={[{ label: t('mcp.crumb') }]} />

          <h1>{t('mcp.h1')}</h1>
          <p class="mcp-lead">{t('mcp.intro')}</p>

          <div class="mcp-address">
            <span class="mcp-address-label">{t('mcp.addrLabel')}</span>
            <code class="mcp-address-url">{MCP_URL}</code>
            <span class="mcp-address-facts">{t('mcp.facts')}</span>
          </div>

          <p>{t('mcp.whatIs')}</p>

          <section class="about-section" id="connect">
            <h2>{t('mcp.connectH')}</h2>

            <h3 id="claude">{t('mcp.claudeH')}</h3>
            <ol>
              <li>{t('mcp.claude1')}</li>
              <li>{t('mcp.claude2')}</li>
              <li>{t('mcp.claude3')}</li>
            </ol>
            <p class="mcp-note">{t('mcp.claudeTeam')}</p>

            <h3 id="chatgpt">ChatGPT</h3>
            <ol>
              <li>{t('mcp.chatgpt1')}</li>
              <li>{t('mcp.chatgpt2')}</li>
              <li>{t('mcp.chatgpt3')}</li>
            </ol>
            <p class="mcp-note">{t('mcp.chatgptNote')}</p>

            <h3 id="claude-code">Claude Code</h3>
            <p>{t('mcp.terminal')}</p>
            <Code>{SNIPPETS.claudeCode}</Code>

            <h3 id="cursor">Cursor</h3>
            <FileSnippet t={t} file="~/.cursor/mcp.json" code={SNIPPETS.cursor} />

            <h3 id="vscode">VS Code</h3>
            <FileSnippet t={t} file=".vscode/mcp.json" code={SNIPPETS.vscode} k="mcp.vscodeBody" />

            <h3 id="gemini">Gemini CLI</h3>
            <FileSnippet t={t} file="~/.gemini/settings.json" code={SNIPPETS.gemini} />

            <h3 id="windsurf">Windsurf</h3>
            <FileSnippet t={t} file="~/.codeium/windsurf/mcp_config.json" code={SNIPPETS.windsurf} />

            <h3 id="other">{t('mcp.otherH')}</h3>
            <p>{t('mcp.other1')}</p>
            <Code>{SNIPPETS.bridge}</Code>
            <p>{t('mcp.inspector')}</p>
            <Code>{SNIPPETS.inspector}</Code>
          </section>

          <section class="about-section" id="tools">
            <h2>{t('mcp.toolsH')}</h2>
            <p>{t('mcp.toolsIntro', { n: MCP_TOOL_NAMES.length })}</p>
            <ul class="mcp-tools">
              {TOOL_ROWS.map((row) => (
                <li>
                  <p class="mcp-tool-names">
                    {row.tools.map((name, i) => <>{i > 0 && ', '}<code>{name}</code></>)}
                  </p>
                  <p>{t(row.what)}</p>
                  <p class="mcp-ask"><span class="mcp-ask-label">{t('mcp.colAsk')}:</span> <q>{t(row.ask)}</q></p>
                </li>
              ))}
            </ul>
            <p>{t('mcp.refs')}</p>
          </section>

          <section class="about-section" id="editions">
            <h2>{t('mcp.editionsH')}</h2>
            <p>{t('mcp.editionsIntro')}</p>
            <ul data-proper-names>
              {MCP_EDITIONS.map((e) => (
                <li>
                  <a href={lhref(`/oversettelser/${e.id}`)}><strong>{e.name}</strong></a> — {t(e.what)}
                </li>
              ))}
            </ul>
            <h3>{t('mcp.licenceH')}</h3>
            <p>{t('mcp.licence1')}</p>
            <p>{t('mcp.licence2')}</p>
            <p><a href={lhref('/oversettelser')}>{t('mcp.licenceLink')}</a></p>
          </section>

          <section class="about-section" id="privacy">
            <h2>{t('mcp.privacyH')}</h2>
            <p>{t('mcp.privacy1')}</p>
            <p>{t('mcp.limits')}</p>
            <p><a href="https://flogvit.com/personvern">{t('mcp.privacyLink')}</a></p>
          </section>

          <section class="about-section" id="support">
            <h2>{t('mcp.supportH')}</h2>
            <p>{withSlot(t, 'mcp.support1', 'email', <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>)}</p>
            <ul>
              <li>
                <a href="https://github.com/flogvit/bible.flogvit.com/issues" target="_blank" rel="noopener noreferrer">{t('mcp.issuesLink')}</a>
              </li>
              <li>
                <a href={MCP_SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('mcp.sourceLink')}</a>
              </li>
            </ul>
            <p>{withSlot(t, 'mcp.registry', 'name', <code>{MCP_REGISTRY_NAME}</code>)}</p>
          </section>
        </div>
      </div>
    </Layout>,
  );
});

export default r;
