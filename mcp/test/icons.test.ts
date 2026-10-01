import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ICONS, createHandler, createMcpServer } from '../src/server.ts';

// #128: /favicon.ico was 404 on mcp.bible.flogvit.com, so connector lists and
// browser tabs showed an empty icon. The icon is bibel's own — the same bytes
// bible.flogvit.com serves from public/ — and it must also reach the IMAGE,
// which is built from a whitelist.

const ROOT = Bun.fileURLToPath(new URL('../../', import.meta.url));
const handler = createHandler({ maxConcurrent: 1, queueWaitMs: 100, dbBudgetMs: 100 });
const get = (path: string) => handler(new Request(`http://localhost${path}`));

test('the paths a browser and a connector list ask for are among the icons', () => {
  const paths: string[] = ICONS.map((i) => i.path);
  for (const p of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png']) expect(paths).toContain(p);
});

for (const icon of ICONS) {
  test(`${icon.path} serves bibel's own icon as an image`, async () => {
    const res = await get(icon.path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(icon.mimeType);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(new Uint8Array(readFileSync(`${ROOT}public${icon.path}`)));
  });
}

test('serverInfo declares the icons at addresses the server answers', async () => {
  const info = (createMcpServer().server as unknown as { _serverInfo: { icons?: { src: string; mimeType?: string }[] } })
    ._serverInfo;
  expect(info.icons?.length).toBe(ICONS.length);
  for (const declared of info.icons ?? []) {
    const url = new URL(declared.src);
    expect(url.origin).toBe('https://mcp.bible.flogvit.com');
    const res = await get(url.pathname);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(declared.mimeType ?? null);
  }
});

test('the image carries every icon file (Dockerfile COPY and the whitelist)', () => {
  const dockerfile = readFileSync(`${ROOT}mcp/Dockerfile`, 'utf8');
  const ignore = readFileSync(`${ROOT}mcp/Dockerfile.dockerignore`, 'utf8').split('\n');
  for (const icon of ICONS) {
    expect(ignore).toContain(`!public${icon.path}`);
    expect(dockerfile).toContain(`public${icon.path}`);
  }
});

test('anything else is still 404', async () => {
  expect((await get('/favicon.png')).status).toBe(404);
});
