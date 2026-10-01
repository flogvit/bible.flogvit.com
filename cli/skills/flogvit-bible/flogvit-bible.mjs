#!/usr/bin/env node
// flogvit-bible — the Bible on bible.flogvit.com from a terminal, a script or
// an agent. How-to: ../../README.md.
//
// A thin client of the MCP server (mcp.bible.flogvit.com/mcp). The commands are
// not written here: they are the server's tools, read from `tools/list` on
// every run, so a new tool is a new command and the two cannot drift. One file,
// no dependencies, plain JavaScript — it runs with node (18 or later) or bun,
// and it can be copied anywhere on its own.

import { readFileSync } from 'node:fs';

const VERSION = '1.0.0';
const URL_DEFAULT = 'https://mcp.bible.flogvit.com/mcp';
/** The MCP server gives this User-Agent its own concurrency cap (mcp/src/server.ts). */
const USER_AGENT = `flogvit-bible-cli/${VERSION}`;
/** The tool whose positional argument is a FILE, read and sent in parts. */
const FILE_TOOL = 'check_references';

const endpoint = process.env.FLOGVIT_BIBLE_URL || URL_DEFAULT;

class Failure extends Error {}

let rpcId = 0;
async function rpc(method, params) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
  } catch (e) {
    throw new Failure(`Could not reach ${endpoint}: ${e.cause?.message ?? e.message}`);
  }
  const body = await res.json().catch(() => null);
  if (res.status === 503) {
    throw new Failure(`The server is busy. Try again in ${res.headers.get('retry-after') ?? 'a few'} seconds.`);
  }
  if (!body) throw new Failure(`${endpoint} answered ${res.status} without JSON.`);
  if (body.error) throw new Failure(body.error.message);
  return body.result;
}

const kebab = (s) => s.replace(/_/g, '-');
/** `get_passage` → `passage`: the verb adds nothing on a command line. */
const commandName = (tool) => kebab(tool.name.replace(/^get_/, ''));

function findTool(tools, word) {
  const exact = tools.find((t) => commandName(t) === word || t.name === word || kebab(t.name) === word);
  if (exact) return exact;
  const prefixed = tools.filter((t) => commandName(t).startsWith(word));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) throw new Failure(`"${word}" is ambiguous: ${prefixed.map(commandName).join(', ')}.`);
  throw new Failure(`Unknown command "${word}". Run flogvit-bible --help for the list.`);
}

/** Required parameters, in the order the tool declares them. */
function positionals(tool) {
  const required = tool.inputSchema.required ?? [];
  return Object.keys(tool.inputSchema.properties ?? {}).filter((k) => required.includes(k));
}

function typeOf(schema) {
  if (schema.enum) return schema.enum.join('|');
  if (schema.type === 'array') return `${schema.items?.enum?.join('|') ?? schema.items?.type ?? 'value'},…`;
  return schema.type ?? 'value';
}

function convert(name, schema, raw) {
  if (schema.type === 'number' || schema.type === 'integer') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Failure(`--${kebab(name)} takes a number, not "${raw}".`);
    return n;
  }
  if (schema.type === 'boolean') {
    if (raw === 'true' || raw === 'false') return raw === 'true';
    throw new Failure(`--${kebab(name)} takes true or false, not "${raw}".`);
  }
  if (schema.type === 'array') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return raw;
}

/** `--include-notes`, `--no-include-notes`, `--editions osen,osnb`, `--limit=5` — and the words that are not options. */
function parseOptions(tool, words) {
  const props = tool.inputSchema.properties ?? {};
  const args = {};
  const loose = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w.startsWith('--') || w === '--') {
      loose.push(w);
      continue;
    }
    let [flag, value] = w.slice(2).split(/=(.*)/s, 2);
    let negated = false;
    let name = flag.replace(/-/g, '_');
    if (!props[name] && name.startsWith('no_') && props[name.slice(3)]?.type === 'boolean') {
      name = name.slice(3);
      negated = true;
    }
    const schema = props[name];
    if (!schema) {
      const known = Object.keys(props).map((k) => `--${kebab(k)}`).join(', ');
      throw new Failure(`${commandName(tool)} has no option --${flag}.${known ? ` Options: ${known}.` : ''}`);
    }
    if (schema.type === 'boolean' && value === undefined) {
      args[name] = !negated;
      continue;
    }
    if (value === undefined) {
      value = words[++i];
      if (value === undefined) throw new Failure(`--${flag} needs a value.`);
    }
    args[name] = convert(name, schema, value);
  }
  return { args, loose };
}

function parseArgs(tool, words) {
  const props = tool.inputSchema.properties ?? {};
  const { args, loose } = parseOptions(tool, words);
  const pos = positionals(tool).filter((k) => !(k in args));
  if (loose.length > pos.length && pos.length > 0) {
    // `passage John 3:16` and `search-bible forgiv sins`: the last required
    // parameter takes the rest of the words.
    loose.splice(pos.length - 1, loose.length, loose.slice(pos.length - 1).join(' '));
  }
  if (loose.length > pos.length) throw new Failure(`${commandName(tool)} takes no argument "${loose.at(-1)}".`);
  pos.forEach((k, i) => {
    if (loose[i] !== undefined) args[k] = convert(k, props[k], loose[i]);
  });
  const missing = pos.filter((k) => !(k in args));
  if (missing.length) throw new Failure(`${commandName(tool)} needs ${missing.map((k) => `<${k}>`).join(' ')}. See flogvit-bible ${commandName(tool)} --help.`);
  return args;
}

/** `LANG=nb_NO.UTF-8` → `nb`, when the server offers it. Norwegian `no` is `nb`. */
function languageFromEnv(tool) {
  const offered = tool.inputSchema.properties?.language?.enum;
  if (!offered) return undefined;
  const raw = (process.env.FLOGVIT_BIBLE_LANG || process.env.LANG || '').toLowerCase().split(/[_.@-]/)[0];
  const lang = raw === 'no' ? 'nb' : raw;
  return offered.includes(lang) ? lang : undefined;
}

function usage(tools) {
  const width = Math.max(...tools.map((t) => commandName(t).length));
  return `flogvit-bible ${VERSION} — read and search the Bible on bible.flogvit.com

Usage: flogvit-bible <command> [arguments] [--options] [--json]

Commands:
${tools.map((t) => `  ${commandName(t).padEnd(width)}  ${t.title ?? t.description?.split('. ')[0]}`).join('\n')}

Examples:
  flogvit-bible passage "John 3:16" --editions osen,sblgnt
  flogvit-bible search-bible forgiv sins --testament NT
  flogvit-bible original-text "Joh 1,1"
  flogvit-bible check manuscript.md

flogvit-bible <command> --help shows a command's options. --json prints the
server's answer as JSON. A command may be shortened while it is unambiguous.
Language: --language, or FLOGVIT_BIBLE_LANG, or LANG. Server: FLOGVIT_BIBLE_URL
(default ${URL_DEFAULT}).`;
}

function commandHelp(tool) {
  const props = tool.inputSchema.properties ?? {};
  const pos = positionals(tool);
  const lines = [
    `flogvit-bible ${commandName(tool)} ${tool.name === FILE_TOOL ? '<file|->' : pos.map((k) => `<${k}>`).join(' ')}`.trim(),
    '',
    tool.description,
  ];
  const options = Object.entries(props).filter(([k]) => tool.name !== FILE_TOOL || (k !== 'text' && k !== 'first_line'));
  if (options.length) {
    lines.push('', 'Options:');
    for (const [k, s] of options) {
      const dflt = s.default !== undefined ? ` (default ${JSON.stringify(s.default)})` : '';
      const form = s.type === 'boolean' ? `--${kebab(k)}, --no-${kebab(k)}` : `--${kebab(k)} <${typeOf(s)}>`;
      lines.push(`  ${form}${dflt}${pos.includes(k) ? ' — or as an argument' : ''}`);
      if (s.description) lines.push(`      ${s.description}`);
    }
  }
  lines.push('', '  --json  print the answer as JSON');
  return lines.join('\n');
}

const textOf = (result) => result.content.filter((c) => c.type === 'text').map((c) => c.text);

/** A file is sent in parts of whole lines, each told where it starts. */
function parts(text, max) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let current = [];
  let size = 0;
  let start = 1;
  lines.forEach((line, i) => {
    if (current.length && size + line.length + 1 > max) {
      out.push({ text: current.join('\n'), first_line: start });
      current = [];
      size = 0;
      start = i + 1;
    }
    // A single line longer than a part is cut; its references keep their line.
    current.push(line.slice(0, max - 1));
    size += Math.min(line.length, max - 1) + 1;
  });
  if (current.length) out.push({ text: current.join('\n'), first_line: start });
  return out;
}

async function checkFile(tool, args, loose, json) {
  const [path, ...extra] = loose;
  if (!path || extra.length) throw new Failure('check takes one file, or - for standard input.');
  let text;
  try {
    text = readFileSync(path === '-' ? 0 : path, 'utf8');
  } catch (e) {
    throw new Failure(`Cannot read ${path}: ${e.message}`);
  }
  const max = tool.inputSchema.properties.text.maxLength;
  const results = [];
  for (const part of parts(text, max)) results.push(await rpc('tools/call', { name: tool.name, arguments: { ...args, ...part } }));
  const failed = results.find((r) => r.isError);
  if (failed) throw new Failure(textOf(failed).join('\n'));

  const references = results.flatMap((r) => r.structuredContent.references);
  const problems = references.filter((r) => r.problem).length;
  if (json) {
    console.log(JSON.stringify({ references, checked: references.length, problems }, null, 2));
  } else if (results.length === 1) {
    console.log(textOf(results[0]).join('\n\n'));
  } else {
    // Each part ends with its own count; one count for the file instead.
    const found = results.map((r) => textOf(r).slice(0, -1).join('\n\n')).filter(Boolean);
    console.log([...found, `${references.length} Bible references, ${problems} with problems.`].join('\n\n'));
  }
  return problems ? 1 : 0;
}

async function main(argv) {
  const json = argv.includes('--json');
  const words = argv.filter((w) => w !== '--json');
  if (words[0] === '--version' || words[0] === '-v') {
    console.log(VERSION);
    return 0;
  }

  const { tools } = await rpc('tools/list');
  const [command, ...rest] = words;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(usage(tools));
    return 0;
  }
  const tool = findTool(tools, command);
  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(commandHelp(tool));
    return 0;
  }

  const { args, loose } = tool.name === FILE_TOOL ? parseOptions(tool, rest) : { args: parseArgs(tool, rest) };
  if (!('language' in args)) {
    const language = languageFromEnv(tool);
    if (language) args.language = language;
  }
  if (tool.name === FILE_TOOL) return checkFile(tool, args, loose, json);

  const result = await rpc('tools/call', { name: tool.name, arguments: args });
  if (json) console.log(JSON.stringify(result, null, 2));
  else (result.isError ? console.error : console.log)(textOf(result).join('\n\n'));
  return result.isError ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Failure ? e.message : e);
    process.exit(2);
  },
);
