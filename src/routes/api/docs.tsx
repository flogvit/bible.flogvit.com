// API-ET, SLIK EN UTVIKLER MØTER DET (#114)
//
// To flater over den samme sannheten (`lib/openapi.ts`):
//
//   GET /api/openapi.json   maskinen — OpenAPI 3.1, til Swagger UI, Redoc
//                           eller en klientgenerator
//   GET /api/docs           mennesket — hvert endepunkt, parametrene, og en
//                           forespørsel du kan KJØRE fra sida
//
// HVORFOR SIDA ER VÅR EGEN OG IKKE swagger-ui-dist
// ------------------------------------------------
// Repoets første regel er «innebygd/web-standard framfor npm-pakker», og #112
// er hva som skjer når et verktøytre kommer inn bakveien: 108 av 115 pakker i
// låsen var noe ingen del av appen importerte. Alternativet — å laste Swagger
// UI fra et CDN — gjør en side vi eier avhengig av at noen andre er oppe, og
// sender leseren vår til dem. Sida er derfor SSR fra spesifikasjonen, i samme
// stack som resten. Dokumentet er standard, så den som VIL ha Swagger UI kan
// peke den på `/api/openapi.json` uten at vi holder på et tredjepartstre.
//
// SIDA STÅR IKKE I `PAGES`, og det er ikke en forglemmelse. `PAGES` er
// lokaliserte sider, og hver invariant der er formulert på åtte språk:
// hreflang-klynge, prefiksede lenker, ordboks-fullstendighet, ingen norsk tekst
// under `/en/`. En API-referanse er ett dokument på engelsk under `/api/` —
// den ville stått som unntak i hver eneste av dem. Den har sin egen vakt i
// `test/api-docs.test.ts`, og også en BREDDE-halvdel, siden #50 er en klasse
// som ikke bryr seg om hvem sida er skrevet for.

import { Hono } from 'hono';
import { assetUrl } from '../../lib/static-cache.ts';
import {
  API_OPERATIONS,
  API_TAGS,
  API_VERSION,
  LANG_PARAM,
  openapiDocument,
  openapiPath,
  type ApiOperation,
  type ApiParam,
} from '../../lib/openapi.ts';
import { absoluteUrl } from '../../lib/site-url.ts';

const r = new Hono();

/** `\`kode\`` → <code>, ett avsnitt per tom linje. Ingen HTML fra kilden. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((para) => (
        <p>
          {para.split('`').map((bit, i) => (i % 2 === 1 ? <code>{bit}</code> : bit))}
        </p>
      ))}
    </>
  );
}

const anchorFor = (op: ApiOperation): string =>
  `${op.method}-${openapiPath(op.route).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const tagAnchor = (tag: string): string => `tag-${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const AUTH_TEXT: Record<NonNullable<ApiOperation['auth']>, string> = {
  session: 'Signed-in account',
  plus: 'FLOGVIT.plus account',
  contribToken: 'x-contrib-token header',
  reviewToken: 'x-review-token header',
};

function Params({ params }: { params: ApiParam[] }) {
  return (
    <div class="doc-table-wrap">
      <table class="doc-params">
        <thead>
          <tr>
            <th>Name</th>
            <th>In</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr>
              <td>
                <code>{p.name}</code>
                {(p.required || p.in === 'path') && <span class="doc-required">required</span>}
              </td>
              <td>{p.in}</td>
              <td>{p.type ?? 'string'}</td>
              <td>
                <Prose text={p.description} />
                {p.example !== undefined && (
                  <p class="doc-example">
                    Example: <code>{p.example}</code>
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * «Prøv» er den samme adressen vakta henter (`prove.url`), ikke et eksempel
 * ingen har kjørt: er parameternavnet endret, blir testen rød før leseren
 * rekker å kopiere den gamle formen.
 */
function Operation({ op }: { op: ApiOperation }) {
  const path = openapiPath(op.route);
  const params = [...(op.params ?? []), ...(op.lang ? [LANG_PARAM] : [])];
  const bodyExample = op.body ? JSON.stringify(op.body.example, null, 2) : '';

  return (
    <article class="doc-op" id={anchorFor(op)}>
      <h3 class="doc-op-head">
        <span class={`doc-method doc-method-${op.method}`}>{op.method.toUpperCase()}</span>
        <code class="doc-path">{path}</code>
      </h3>
      <p class="doc-summary">{op.summary}</p>
      {op.auth && <p class="doc-auth">Requires: {AUTH_TEXT[op.auth]}</p>}
      {op.description && (
        <div class="doc-desc">
          <Prose text={op.description} />
        </div>
      )}

      {params.length > 0 && <Params params={params} />}

      {op.body && (
        <div class="doc-body">
          <h4>Request body</h4>
          <Prose text={op.body.description} />
          <pre>
            <code>{bodyExample}</code>
          </pre>
        </div>
      )}

      <div class="doc-responses">
        <h4>Responses</h4>
        <ul>
          {Object.entries(op.responses).map(([status, description]) => (
            <li>
              <code class="doc-status">{status}</code> <Prose text={description} />
            </li>
          ))}
        </ul>
      </div>

      {/* Uten `prove` er det ingen knapp: grunnen står i `ikkeProvd`, som er
          en NOTIS TIL OSS på norsk — den hører ikke på en engelsk referanse,
          og det leseren trenger å vite (svaret er ~73 MB) står i teksten. */}
      {op.prove && (
        <form class="doc-try" data-try data-method={op.method}>
          <label class="doc-try-url">
            <span>Request</span>
            <input type="text" name="url" value={op.prove.url} spellcheck={false} />
          </label>
          {op.prove.body !== undefined && (
            <label class="doc-try-body">
              <span>Body (JSON)</span>
              <textarea name="body" rows={3} spellcheck={false}>
                {JSON.stringify(op.prove.body)}
              </textarea>
            </label>
          )}
          <button type="submit">Send</button>
          <p class="doc-try-status" data-status hidden></p>
          <pre class="doc-try-out" data-out hidden></pre>
        </form>
      )}
    </article>
  );
}

function DocsPage() {
  const byTag = API_TAGS.map((tag) => ({
    tag,
    ops: API_OPERATIONS.filter((op) => op.tag === tag.name),
  })).filter((group) => group.ops.length > 0);

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>API — FLOGVIT.bible</title>
        <meta
          name="description"
          content="The bible.flogvit.com HTTP API: the Bible text, the daily verse, the study content and your own notes. OpenAPI 3.1."
        />
        <link rel="canonical" href={absoluteUrl('/api/docs')} />
        <link rel="stylesheet" href={assetUrl('/css/api-docs.css')} />
        <script type="module" src={assetUrl('/js/api-docs.js')} />
      </head>
      <body>
        <header class="doc-header">
          <p class="doc-brand">FLOGVIT.bible</p>
          <h1>API</h1>
          <p class="doc-lede">
            Everything this site knows, over HTTP: the Bible text in several editions and
            versifications, the verse of the day, the study content around a chapter — and, for a
            signed-in account, the reader’s own notes, lists and reading progress.
          </p>
          <p class="doc-lede">
            Reading is open — no key and no account. The machine-readable description is{' '}
            <a href="/api/openapi.json">
              <code>/api/openapi.json</code>
            </a>{' '}
            (OpenAPI 3.1); point Swagger UI, Redoc or a client generator straight at it.
          </p>
          <p class="doc-lede">
            Add <code>?lang=en</code> to any request to pick the language of the content. Without
            it we read the <code>Referer</code>, then <code>Accept-Language</code>, and fall back to
            English.
          </p>
        </header>

        <nav class="doc-nav" aria-label="Sections">
          <ul>
            {byTag.map(({ tag, ops }) => (
              <li>
                <a href={`#${tagAnchor(tag.name)}`}>{tag.name}</a> <span>{ops.length}</span>
              </li>
            ))}
          </ul>
        </nav>

        <main class="doc-main">
          {byTag.map(({ tag, ops }) => (
            <section class="doc-section" id={tagAnchor(tag.name)}>
              <h2>{tag.name}</h2>
              <p class="doc-tag-desc">{tag.description}</p>
              {ops.map((op) => (
                <Operation op={op} />
              ))}
            </section>
          ))}
        </main>

        <footer class="doc-footer">
          <p>
            {API_OPERATIONS.length} endpoints. Version {API_VERSION}.
          </p>
        </footer>
      </body>
    </html>
  );
}

/** GET /api/openapi.json — spesifikasjonen. */
r.get('/openapi.json', (c) =>
  c.json(openapiDocument(), 200, { 'Cache-Control': 'public, max-age=300' }),
);

/** GET /api/docs — utforskersida. */
r.get('/docs', (c) =>
  c.html(DocsPage(), 200, { 'Cache-Control': 'public, max-age=300' }),
);

export default r;
