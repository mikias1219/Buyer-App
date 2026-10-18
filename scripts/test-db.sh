#!/usr/bin/env bash
# Applies every migration to a fresh database and runs the SQL test suites.
#
#   npm run test:db                       # boots a throwaway local Postgres cluster
#   DATABASE_URL=postgres://... npm run test:db   # uses an existing server (CI)
set -euo pipefail
export LC_ALL=C
unset LOCPATH || true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP=""

cleanup() {
  if [[ -n "$TMP" ]]; then
    "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

if [[ -z "${DATABASE_URL:-}" ]]; then
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  if [[ -z "$PGBIN" ]]; then
    PGBIN="$(dirname "$(command -v initdb)")"
  fi
  TMP="$(mktemp -d)"
  "$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
  "$PGBIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -c listen_addresses='' -p 54329" -l "$TMP/log" -w start >/dev/null
  ADMIN_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
  DB_URL="postgresql://postgres@/techmarket_test?host=$TMP&port=54329"
else
  ADMIN_URL="$DATABASE_URL"
  BASE="${DATABASE_URL%%\?*}"
  QUERY=""
  [[ "$DATABASE_URL" == *"?"* ]] && QUERY="?${DATABASE_URL#*\?}"
  DB_URL="${BASE%/*}/techmarket_test$QUERY"
fi

export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc)
"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists techmarket_test" -c "create database techmarket_test"

run() {
  echo "  · $(basename "$1")"
  "${PSQL[@]}" "$DB_URL" -o /dev/null -f "$1"
}

echo "▸ Supabase stubs"
run "$ROOT/supabase/tests/00_supabase_stubs.sql"
echo "▸ Migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f"; done
echo "▸ Shop migrations are re-runnable"
# Migrations before the shop reset (20261018…) are superseded by it and are not re-applied.
for f in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "20261018" ]] && continue
  "${PSQL[@]}" "$DB_URL" -f "$f" >/dev/null
done
echo "▸ Seed"
run "$ROOT/supabase/seed.sql"
echo "▸ Tests"
for f in "$ROOT"/supabase/tests/*.sql; do   # upgrade/ runs separately below
  [[ "$(basename "$f")" == 00_* ]] && continue
  run "$f"
done

echo "▸ Production upgrade path (marketplace data → shop)"
UP_URL="${DB_URL/techmarket_test/techmarket_upgrade}"
"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists techmarket_upgrade" -c "create database techmarket_upgrade"
"${PSQL[@]}" "$UP_URL" -o /dev/null -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
"${PSQL[@]}" "$UP_URL" -o /dev/null -f "$ROOT/supabase/tests/01_tap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "20261018" ]] || continue
  "${PSQL[@]}" "$UP_URL" -o /dev/null -f "$f"
done
"${PSQL[@]}" "$UP_URL" -o /dev/null -f "$ROOT/supabase/tests/upgrade/marketplace_data.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "20261018" ]] && continue
  "${PSQL[@]}" "$UP_URL" -o /dev/null -f "$f"
done
echo "  · upgrade/verify.sql"
"${PSQL[@]}" "$UP_URL" -o /dev/null -f "$ROOT/supabase/tests/upgrade/verify.sql"
echo "✓ database tests passed"
