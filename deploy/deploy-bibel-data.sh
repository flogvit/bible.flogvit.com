#!/usr/bin/env bash
# Oppdaterer bibel-INNHOLD i prod (managed MySQL, db-flogvit) fra free-bible.
# Dette er data-motstykket til deploy-bibel.sh (som kun deployer app-koden).
#
# Steg:
#   1. Importerer innhold LOKALT fra det ekte free-bible-repoet (scripts/import-bible.ts
#      mot DBngin-MySQL i bibel/.env). Kilden resolveres via symlinken
#      flogvit.com/free-bible -> ../free-bible, eller eksplisitt FREE_BIBLE_DIR.
#   2. For hver innholdstabell: dumper fra lokal DB og laster ATOMISK til prod
#      (START TRANSACTION; DELETE; INSERT…; COMMIT). Per-tabell-transaksjon =
#      ingen nedetid (lesere ser gammelt snapshot til COMMIT) og håndterer
#      sletninger korrekt (full replace, ikke bare upsert).
#   3. Restarter bibel-hono (books-tabellen caches i minnet fra boot).
#
# Bruk:
#   deploy/deploy-bibel-data.sh                 # full innholds-paritet (alle tabeller)
#   deploy/deploy-bibel-data.sh references_ persons stories content_hashes db_meta
#                                                # kun navngitte tabeller (raskere)
#   FREE_BIBLE_DIR=/sti/til/free-bible deploy/deploy-bibel-data.sh …
#
# Prod-DB er kun på privat nett; vi når den via en engangs mysql:8-klientcontainer
# på docker-nettet server_default med env fra /srv/flogvit.com/server/bibel.env.
# Brukertabeller (user_*, sessions o.l.) røres ALDRI — kun import-eide innholdstabeller.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"                    # bibel/
FREE_BIBLE_DIR="${FREE_BIBLE_DIR:-$(cd "$SRC/../free-bible" && pwd -P)}"  # følg symlink → ekte repo

VM=flogvit-vm
ENVFILE=/srv/flogvit.com/server/bibel.env
NET=server_default
MYSQLDUMP="${MYSQLDUMP:-/opt/homebrew/opt/mysql-client/bin/mysqldump}"

# Lokal DB (DBngin) — samme tilkobling som bibel/.env
LDB_HOST="${DB_HOST:-127.0.0.1}"
LDB_PORT="${DB_PORT:-3312}"
LDB_USER="${DB_USER:-root}"
LDB_NAME="${DB_NAME:-flogvit_bibel}"

# Innholdstabellene import-pipelinen eier (speiler CONTENT_TABLES i import-bible.ts).
DEFAULT_TABLES="books verses bible_editions word4word references_ book_summaries book_context \
chapter_summaries chapter_context important_words important_verses verse_prayers \
verse_sermons themes timeline_periods timeline_events timeline_references \
timeline_book_sections prophecy_categories prophecies prophecy_fulfillments persons \
chapter_insights daily_verses reading_plans gospel_parallel_sections gospel_parallels \
gospel_parallel_passages verse_mappings works work_verse_refs days number_symbolism reading_texts \
reading_text_refs stories content_hashes db_meta"
TABLES="${*:-$DEFAULT_TABLES}"

# Prod mysql-klient som leser tilkobling fra bibel.env inne i containeren.
# MYSQL_PWD unngår «Using a password»-advarselen og holder exit-koder rene.
prod_mysql() {
  ssh "$VM" "docker run --rm -i --network $NET --env-file $ENVFILE mysql:8 \
    sh -c 'export MYSQL_PWD=\"\$DB_PASSWORD\"; exec mysql -h\"\$DB_HOST\" -P\"\$DB_PORT\" -u\"\$DB_USER\" \"\$DB_NAME\"'"
}

echo "==> Kilde:    $FREE_BIBLE_DIR"
echo "==> Lokal DB: $LDB_HOST:$LDB_PORT/$LDB_NAME"
echo "==> Tabeller: $(echo $TABLES | wc -w | tr -d ' ') stk"

echo "==> 1/3 Importerer lokalt"
( cd "$SRC" && FREE_BIBLE_DIR="$FREE_BIBLE_DIR" DB_PORT="$LDB_PORT" bun scripts/import-bible.ts )

echo "==> 2/3 Laster tabeller til prod (atomisk per tabell)"
for t in $TABLES; do
  printf '    %-28s' "$t"
  {
    echo "SET NAMES utf8mb4; SET FOREIGN_KEY_CHECKS=0; SET autocommit=0; START TRANSACTION;"
    echo "DELETE FROM \`$t\`;"
    "$MYSQLDUMP" -h"$LDB_HOST" -P"$LDB_PORT" -u"$LDB_USER" \
      --no-create-info --skip-add-locks --skip-disable-keys --skip-comments \
      --complete-insert --skip-lock-tables --no-tablespaces \
      "$LDB_NAME" "$t"
    echo "COMMIT;"
  } | prod_mysql
  echo "ok"
done

echo "==> 3/3 Restarter bibel-hono"
ssh "$VM" "cd /srv/flogvit.com/server && docker compose restart bibel-hono"

echo "==> Ferdig — prod-innhold er nå i paritet med lokal DB"
