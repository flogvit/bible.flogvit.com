#!/usr/bin/env bash
# Deploy av bibel.flogvit.com (Bun+Hono-utgaven, branch `main`) til flogvit-vm.
# Kjøres lokalt fra en checkout av main (katalogen dette scriptet
# ligger i). PARALLELL DRIFT: bibel.flogvit.no (gammel app, branch bibel-no,
# /srv/…/bibel/, service `bibel`) røres IKKE — hono-varianten bor i /srv/…/bibel-hono/ som
# service `bibel-hono`.
#
# - Ingen bible.db-staging: alt innhold bor i managed MySQL (db-flogvit).
#   Import kjøres separat (scripts/init-db.ts + import-bible.ts, eller dump —
#   DB-en er kun på privat nett, se server/deploy-konto.sh-mønsteret).
# - Containeren trenger server/bibel.env på VM-en (DB-tilkobling; konto nås
#   som http://konto:3020 på docker-nettet).
# - kvn-pakken stages fra free-bible (mappings trengs i runtime).
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$SRC/.." && pwd)"
[ -d "$ROOT/free-bible" ] || ROOT="/Users/vhanssen/WebstormProjects/flogvit/flogvit.com"
VM=flogvit-vm

# Bygger LOKALT og sender ferdig image — VM-en bygger aldri (server/lib-ship.sh).
source "$ROOT/server/lib-ship.sh"
SRV=/srv/flogvit.com

echo "==> Stager kvn-pakken fra free-bible"
rm -rf "$SRC/kvn-package"
mkdir -p "$SRC/kvn-package"
cp -r "$ROOT/free-bible/kvn/src" "$SRC/kvn-package/src"
cp -r "$ROOT/free-bible/kvn/mappings" "$SRC/kvn-package/mappings"
cp "$ROOT/free-bible/kvn/package.json" "$SRC/kvn-package/package.json"
cp "$ROOT/free-bible/kvn/tsconfig.json" "$SRC/kvn-package/tsconfig.json"

if [ -f "$SRC/.env" ]; then
  echo "==> Genererer sitemap (mot DB-en i .env)"
  (cd "$SRC" && bun scripts/generate-sitemap.ts) || echo "    (hopper over — DB utilgjengelig, bruker committet sitemap.xml)"
else
  echo "==> Hopper over sitemap-generering (ingen .env) — bruker committet sitemap.xml"
fi

echo "==> Rsyncer bibel-hono og server-konfig"
rsync -az --delete --exclude node_modules --exclude .git --exclude .env --exclude data --exclude dist \
  "$SRC/" $VM:$SRV/bibel-hono/
rsync -az --inplace "$ROOT/server/Caddyfile" "$ROOT/server/compose.yml" $VM:$SRV/server/

echo "==> Bygger og pusher"
# Bygg og push imaget, men IKKE start tjenesten foer skjemaet er migrert.
# build_and_push setter $IMAGE_TAG; migreringen under kjoerer NOEYAKTIG det
# imaget, saa skjemaet loftes av samme kode som skal ta over.
build_and_push bibel-hono "$ROOT/bibel"
preflight "$VM"
rsync -az --inplace "$ROOT/server/compose.yml" "$VM:$SRV/server/"

# MIGRER SKJEMAET FOER RESTART.
#
# Appen kjoerer IKKE ensureSchema() ved oppstart — bare scripts/init-db.ts gjoer
# det (bibel/CLAUDE.md «Migrering»). En ren kode-deploy kan derfor aldri lofte
# skjemaet, og kode som forventer en ny kolonne tar ned siden.
#
# Det skjedde 2026-07-26: `language`-kolonnen manglet i ALLE 30+ prod-tabellene,
# bible.flogvit.com svarte 500 «Unknown column 'language' in 'where clause'», og
# maatte rulles tilbake. Dokumentasjonen sa dette; den ble ikke lest. Derfor
# staar det som et STEG her, ikke som en merknad.
#
# init-db.ts er idempotent: CREATE IF NOT EXISTS + runMigrations().
echo "==> Migrerer skjemaet fra det NYE imaget (idempotent)"
ssh "$VM" "docker pull -q rg.fr-par.scw.cloud/flogvit/bibel-hono:$IMAGE_TAG >/dev/null && \
  docker run --rm --network server_default --env-file $SRV/server/bibel.env \
  rg.fr-par.scw.cloud/flogvit/bibel-hono:$IMAGE_TAG bun scripts/init-db.ts"

echo "==> Starter bibel-hono"
deploy_to bibel-hono "$VM"

# Bekreft at containeren faktisk byttet image — `compose up` sier «Running» ogsaa
# naar den ikke gjorde noe.
ssh $VM "cd $SRV/server && docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile"

echo "==> Sjekk"
ssh $VM "docker compose -f $SRV/server/compose.yml exec caddy wget -qO- --timeout=10 http://bibel-hono:8080/api/health" && echo " …OK"

# Porten `health` ikke var: sjekker at bibel-hono faktisk naar databasen
# innenfra containeren, ikke bare at HTTP svarer. Ruller tilbake hvis ikke.
verify bibel-hono
release_previous
