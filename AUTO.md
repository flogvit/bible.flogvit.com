# AUTO.md — flogvit/bible.flogvit.com

How Dux builds, tests, deploys, verifies, rolls back and patches the Bible app.
Format: [Grensesnitt/grensesnitt-auto](https://github.com/Grensesnitt/grensesnitt-auto)
(`docs/reference.md`). Facts read on 2026-10-29 from main of this repository
(`package.json`, `Dockerfile`, `mcp/`, `scripts/init-db.ts`) and of
flogvit/flogvit-com-server (`deploy-bibel-hono.sh`, `deploy-bibel-mcp.sh`,
`deploy-bibel.sh`, `deploy-bibel-data.sh`, `lib-ship.sh`, `compose.yml`).

Two images ship from main: the app and API (`bibel-hono`, bible.flogvit.com)
and the MCP server (`bibel-mcp`, mcp.bible.flogvit.com), both deployed by
`server/deploy-bibel-hono.sh`, which runs `deploy-bibel-mcp.sh` at the end. The
branch `bibel-no` is the old app on bibel.flogvit.no, deployed by
`server/deploy-bibel.sh`; it is not covered here. The Bible text comes from
flogvit/free-bible.

## about

```yaml
version: 1
repository: flogvit/bible.flogvit.com
default_branch: main
description: The Bible app bible.flogvit.com and its MCP server (Bun + Hono), with text from free-bible
work_queue: the Dux work queue for flogvit/bible.flogvit.com (GitHub issues labelled dux)
checked: 2026-10-30
```

## stack

```yaml
packages:
  - path: .
    language: TypeScript (Bun + Hono)
    runtimes:
      - name: bun
        version: 1.4.4
        pinned_in: Dockerfile (FROM oven/bun:1.4.4-slim)
    package_manager: bun
    lockfile: bun.lock
  - path: mcp
    language: TypeScript (Bun, MCP server)
    runtimes:
      - name: bun
        version: 1.4.4
        pinned_in: mcp/Dockerfile (FROM oven/bun:1.4.4-slim)
    package_manager: bun
    lockfile: mcp/bun.lock
```

## build

```yaml
steps:
  - name: stage-kvn
    run: FREE_BIBLE_DIR=../free-bible bun scripts/stage-kvn.ts
    cwd: .
    where: local
    needs: [flogvit/free-bible checked out next to flogvit.com (flogvit.com/free-bible)]
    output: the @free-bible/kvn package in kvn-package/
  - name: images
    run: bash server/deploy-bibel-hono.sh (builds rg.fr-par.scw.cloud/flogvit/bibel-hono and bibel-mcp for linux/amd64)
    cwd: the flogvit.com workspace root
    where: local
    needs: [docker, a docker login to rg.fr-par.scw.cloud]
    output: rg.fr-par.scw.cloud/flogvit/bibel-hono:<UTC timestamp>-<short sha> and bibel-mcp:<UTC timestamp>-<short sha>
```

## test

```yaml
gate:
  - run: bun run typecheck
    cwd: .
  - run: bun run test
    cwd: .
  - run: bun run test
    cwd: mcp
green: exit code 0 from all; the deploy scripts run the same gates (test_gate) before they build
```

## deploy

```yaml
deploys_from: main
environments:
  prod:
    mechanism: docker-image
    start:
      on: command
      command: bash server/deploy-bibel-hono.sh
      cwd: the flogvit.com workspace root, with flogvit.com, server/, bibel/ and free-bible each on a clean origin/main
    target:
      registry: rg.fr-par.scw.cloud/flogvit/bibel-hono and rg.fr-par.scw.cloud/flogvit/bibel-mcp
      host: flogvit-vm (ssh alias), behind the load balancer 51.158.106.120
      compose_dir: /srv/flogvit.com/server
      compose_services: bibel-hono (port 8080, 768m) and bibel-mcp
      tag_variables: BIBEL_HONO_TAG and BIBEL_MCP_TAG in /srv/flogvit.com/server/.env
      database: the managed MySQL db-flogvit-pop2 (Scaleway, fr-par, instance a4f505d0-59d1-4a6b-8adb-779a63facecb); connection in bibel.env
      url: https://bible.flogvit.com and https://mcp.bible.flogvit.com
    order:
      - stage the kvn package from free-bible, then the test gate
      - stop if bibel.env on the VM lacks CONTRIB_TOKEN, REVIEW_TOKEN, DB_HOST, DB_USER or DB_NAME
      - take the deploy lock, rsync Caddyfile and compose.yml, build and push bibel-hono
      - run scripts/init-db.ts in the new image against the database (schema), then switch the container
      - reload Caddy, health check from inside Caddy, smoke.sh; a failure rolls back to the recorded tag
      - deploy-bibel-mcp.sh the same way for bibel-mcp, checked on https://mcp.bible.flogvit.com/healthz
      - after a green deploy, tag this repository with the tag that runs (BIBEL_HONO_TAG) and push the tag; the RELEASE.md post is part of the change merged through the work queue (server/README.md «deploy <navn>»)
    # The owner's call (2026-10-30): a restart in the daytime needs his yes; at
    # night Dux may restart on its own. A kernel reboot of flogvit-vm takes down
    # every flogvit.com product and is always a step for the owner.
    downtime:
      policy: window
      window: daily 23:00-06:00 Europe/Oslo
    patch_effect:
      - kind: restart
        what: docker compose replaces the bibel-hono container; Caddy holds requests while it starts (import gjenforsoek)
        length: up to 20 s
      - kind: restart
        what: the bibel-mcp container is replaced the same way
      - kind: reboot
        what: a kernel update on flogvit-vm, which takes down every flogvit.com product on it
    verify:
      checks:
        - url: https://bible.flogvit.com/api/health
          expect: 200
        - url: https://mcp.bible.flogvit.com/healthz
          expect: 200
        - command: bash server/smoke.sh bibel-hono && bash server/smoke.sh bibel-mcp
          expect: exit code 0
      version:
        command: ssh flogvit-vm "grep -E '^BIBEL_(HONO|MCP)_TAG=' /srv/flogvit.com/server/.env"
        expect: <UTC timestamp>-<short sha of the merged commit>, without -dirty
    rollback:
      backup: "OPEN: the script records the running image tags and the registry keeps the 5 newest. The deploy takes no database backup before scripts/init-db.ts changes the schema; db-flogvit-pop2 has a daily backup schedule with 7 days' retention, but `scw rdb backup list` showed no backups on 2026-10-30, so a restore point is not confirmed"
      undo: |
        The scripts roll back by themselves when a health check or smoke.sh fails. By hand, per service:
        ssh flogvit-vm "sed -i 's|^BIBEL_HONO_TAG=.*|BIBEL_HONO_TAG=<previous tag>|' /srv/flogvit.com/server/.env && cd /srv/flogvit.com/server && docker compose pull bibel-hono && docker compose up -d bibel-hono"
        (BIBEL_MCP_TAG and bibel-mcp the same way). A schema change made by init-db.ts is not rolled back.
```

The Bible text in the database is updated separately, with
`server/deploy-bibel-data.sh`, from free-bible.

## secrets

```yaml
sources:
  - source: host-env-file
    where: /srv/flogvit.com/server/bibel.env on flogvit-vm; layout in server/bibel.env.example
    names: [NODE_ENV, PORT, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, ACCOUNT_API_URL, ACCOUNT_URL, CONTRIB_TOKEN, REVIEW_TOKEN]
  - source: host-env-file
    where: /srv/flogvit.com/server/bibel-mcp.env on flogvit-vm; layout in server/bibel-mcp.env.example
    names: [NODE_ENV, PORT, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME]
  - source: cli-config
    where: ~/.config/scw/config.yaml and a docker login to rg.fr-par.scw.cloud on the deploying machine
    names: [secret_key]
```

## owner-only

```yaml
- area: dns
  what: bible.flogvit.com and mcp.bible.flogvit.com at Domeneshop
- area: host-restart
  what: a reboot of flogvit-vm
- area: publishing
  what: listing the MCP server in a public registry (mcp/server.json)
```

## do-not-touch

```yaml
protected_branches: [main, bibel-no]
migrations:
  path: scripts/init-db.ts
  rule: The schema is set by init-db.ts at each deploy; a change to a table that has data is made so the running app keeps working.
customer_prod_rules: []
paths:
  - path: the branch bibel-no
    why: the old app on bibel.flogvit.no, deployed only by server/deploy-bibel.sh
```

## guards

```yaml
worktree: own
force_push: never
main: work-queue-merge-only
extra:
  - Never build on the VM; images are built on the deploying machine and pulled.
  - ALLOW_MISSING_ENV=1 and SKIP_TESTS=1 skip checks in the deploy scripts; Dux never sets them.
```

## security

```yaml
thresholds:
  auto_to_prod: 9.0
  to_queue: 7.0
dependency_patch:
  how: bun update <package> in the root or in mcp/ so the lockfile changes; run the test gate
  rollout: merge to main through the work queue, then bash server/deploy-bibel-hono.sh from the workspace root
runtime_patch:
  how: raise oven/bun:1.4.4-slim in Dockerfile and mcp/Dockerfile
  rollout: merge to main, then bash server/deploy-bibel-hono.sh
```
