import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

// The image holds what the server imports — and the tests cannot see it
// otherwise. Locally every import resolves through bibel's own node_modules,
// so a package the image lacks is green here and a crash on start in prod:
// that is how #169's verse numberings went out — `Cannot find module
// '@free-bible/kvn'`, the deploy rolled back, and the live server stayed on the
// version before. This follows every import from the entry point and holds it
// to what mcp/Dockerfile and its whitelist put in the image.

const ROOT = resolve(Bun.fileURLToPath(new URL('../..', import.meta.url)));
const dockerfile = readFileSync(join(ROOT, 'mcp/Dockerfile'), 'utf8');
const whitelist = readFileSync(join(ROOT, 'mcp/Dockerfile.dockerignore'), 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('!'))
  .map((l) => l.slice(1).trim());
const entry = (dockerfile.match(/CMD \["bun", "([^"]+)"\]/) ?? [])[1]!;

/** Packages the image has: its own dependencies, and what the Dockerfile copies into node_modules. */
const pkg = JSON.parse(readFileSync(join(ROOT, 'mcp/package.json'), 'utf8')) as { dependencies?: Record<string, string> };
const copied = [...dockerfile.matchAll(/^COPY \S+ \.\/node_modules\/((?:@[^/\s]+\/)?[^/\s]+)/gm)].map((m) => m[1]!);
const packages = new Set([...Object.keys(pkg.dependencies ?? {}), ...copied]);

const inImage = (file: string) => whitelist.some((w) => file === w || file.startsWith(`${w}/`));
const packageName = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
const builtin = (spec: string) => spec === 'bun' || spec.startsWith('bun:') || spec.startsWith('node:') || builtinModules.includes(spec);

/** Every file and package the entry point reaches. */
function walk(): { files: string[]; bare: Map<string, string> } {
  const transpiler = new Bun.Transpiler({ loader: 'tsx' });
  const files = new Set<string>();
  const bare = new Map<string, string>();
  const queue = [join(ROOT, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    const rel = relative(ROOT, file);
    if (files.has(rel)) continue;
    files.add(rel);
    for (const { path } of transpiler.scanImports(readFileSync(file, 'utf8'))) {
      if (path.startsWith('.')) {
        const target = [resolve(dirname(file), path), resolve(dirname(file), `${path}.ts`)].find(existsSync);
        expect(target, `${rel} imports ${path}, which does not exist`).toBeDefined();
        queue.push(target!);
      } else if (!builtin(path)) {
        bare.set(packageName(path), rel);
      }
    }
  }
  return { files: [...files], bare };
}

const reached = walk();

describe('the MCP image holds what the server imports', () => {
  test('the walk starts at the image\'s own entry point and reaches bibel\'s src/lib', () => {
    expect(entry).toBe('mcp/src/index.ts');
    expect(reached.files.some((f) => f.startsWith('src/lib/'))).toBe(true);
    expect(reached.bare.size).toBeGreaterThan(1);
  });

  test('every file it reaches is in the image', () => {
    const missing = reached.files.filter((f) => !inImage(f));
    expect(missing, 'add the path to mcp/Dockerfile.dockerignore (and a COPY in mcp/Dockerfile)').toEqual([]);
  });

  test('every package it imports is installed or copied into the image', () => {
    const missing = [...reached.bare].filter(([name]) => !packages.has(name)).map(([name, from]) => `${name} (from ${from})`);
    expect(missing, 'add it to mcp/package.json, or COPY it into ./node_modules in mcp/Dockerfile').toEqual([]);
  });

  test('what the Dockerfile copies into node_modules is let through by the whitelist', () => {
    for (const [, src] of dockerfile.matchAll(/^COPY (\S+) \.\/node_modules\//gm)) expect(inImage(src!), src).toBe(true);
  });
});
