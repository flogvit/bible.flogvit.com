#!/usr/bin/env bash
# Deploy av bibel.flogvit.com (Bun+Hono-utgaven) til flogvit-vm — ERSTATTER
# server/deploy-bibel.sh ved cutover (ISSUES.md #18). Kjøres lokalt.
#
# Endringer fra gammel deploy:
# - Rsyncer bibel-hono/ (ikke bibel/) til VM-ens /srv/flogvit.com/bibel/.
# - INGEN bible.db-staging: alt innhold bor i managed MySQL (db-flogvit).
#   Import kjøres separat: bun scripts/init-db.ts && bun scripts/import-bible.ts
#   (lokalt/dev mot db-flogvit; env DB_HOST/PORT/USER/PASSWORD/DB_NAME).
# - Containeren trenger server/bibel.env på VM-en (DB-tilkobling + ev.
#   ACCOUNT_API_URL-override). Secrets lagres VARIG (feedback-durable-secrets)
#   — aldri bare på VM-en.
# - kvn-pakken stages fortsatt fra free-bible (mappings trengs i runtime).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/bibel-hono"
VM=flogvit-vm
SRV=/srv/flogvit.com

echo "==> Stager kvn-pakken fra free-bible"
rm -rf "$SRC/kvn-package"
mkdir -p "$SRC/kvn-package"
cp -r "$ROOT/free-bible/kvn/src" "$SRC/kvn-package/src"
cp -r "$ROOT/free-bible/kvn/mappings" "$SRC/kvn-package/mappings"
cp "$ROOT/free-bible/kvn/package.json" "$SRC/kvn-package/package.json"
cp "$ROOT/free-bible/kvn/tsconfig.json" "$SRC/kvn-package/tsconfig.json"

echo "==> Genererer sitemap (mot DB-en i .env)"
(cd "$SRC" && bun scripts/generate-sitemap.ts)

echo "==> Rsyncer bibel (hono) og server-konfig"
rsync -az --delete --exclude node_modules --exclude .git \
  "$SRC/" $VM:$SRV/bibel/
rsync -az --inplace "$ROOT/server/Caddyfile" "$ROOT/server/compose.yml" $VM:$SRV/server/

echo "==> Bygger og starter"
ssh $VM "cd $SRV/server && docker compose up -d --build bibel && docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile"

echo "==> Sjekk"
ssh $VM "docker exec server-caddy-1 wget -qO- --timeout=10 http://bibel:8080/api/health" && echo " …OK"
