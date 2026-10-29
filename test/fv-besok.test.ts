// The «Ekte besøk» beacon (bible.flogvit.com#187, flogvit-com-konto#60, portal/BESOK.md).
//
// public/js/fv-besok.js is a COPY of portal/design/fv-besok.js — its behaviour is
// tested once, in the portal, in real Chrome. Here: the copy is the portal's
// file on the portal's origin/main, it is served, it is part of the build id,
// pages load it, and no Content-Security-Policy stops the POST to /fv-besok.
// Caddy answers /fv-besok itself; this app never sees it.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApp } from "../src/app.ts";
import { WATCHED } from "../src/lib/build-id.ts";

const APP = createApp();
const SIDE = "/nb/";

const ROOT = resolve(import.meta.dir, "..");
const COPY = readFileSync(resolve(ROOT, "public/js/fv-besok.js"), "utf8");

/** portal/ beside the checkout, or beside the main checkout a worktree belongs to. */
function portalDir(): string | null {
  for (let d = ROOT; d !== dirname(d); d = dirname(d)) {
    if (existsSync(resolve(d, "portal/design"))) return resolve(d, "portal");
  }
  const git = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT });
  for (let d = dirname(git.stdout.toString().trim()); d !== dirname(d); d = dirname(d)) {
    if (existsSync(resolve(d, "portal/design"))) return resolve(d, "portal");
  }
  return null;
}

describe("the «Ekte besøk» beacon", () => {
  test("public/js/fv-besok.js is portal/design/fv-besok.js on the portal's origin/main", () => {
    const portal = portalDir();
    expect(portal).not.toBeNull();
    const shown = Bun.spawnSync(["git", "show", "origin/main:design/fv-besok.js"], { cwd: portal! });
    expect(shown.exitCode).toBe(0);
    expect({ same: COPY === shown.stdout.toString(), fix: "bun besokkopi.ts --skriv (in the meta repo)" }).toEqual({
      same: true,
      fix: "bun besokkopi.ts --skriv (in the meta repo)",
    });
  });

  test("/js/fv-besok.js serveres, og det er kopien", async () => {
    const res = await APP.request("/js/fv-besok.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(COPY);
  });

  test("en endret beacon er et nytt bygg — den ligger i public/js, som bygg-id-en hasher", () => {
    expect(WATCHED as readonly string[]).toContain("public/js");
  });

  test("service workeren slipper POST forbi — beaconen svares aldri fra cache", () => {
    expect(readFileSync(resolve(ROOT, "public/sw.js"), "utf8")).toContain("if (request.method !== 'GET') return;");
  });

  test("no Content-Security-Policy stops the POST to /fv-besok on the same origin", async () => {
    const csp = (await APP.request(SIDE)).headers.get("content-security-policy") ?? "";
    const connect = /(?:^|;)\s*connect-src([^;]*)/.exec(csp)?.[1] ?? /(?:^|;)\s*default-src([^;]*)/.exec(csp)?.[1];
    expect(connect === undefined || connect.includes("'self'")).toBe(true);
  });

  // At hver side laster den: sveipet i test/ny-versjon.test.ts, ved siden av versjonsskriptet.
});
