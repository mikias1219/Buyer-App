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
echo "▸ Migrations are re-runnable"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" "$DB_URL" -f "$f" >/dev/null; done
echo "▸ Seed"
run "$ROOT/supabase/seed.sql"
echo "▸ Tests"
for f in "$ROOT"/supabase/tests/*.sql; do
  [[ "$(basename "$f")" == 00_* ]] && continue
  run "$f"
done

echo "▸ Legacy MVP → v1 migration path"
LEGACY_URL="${DB_URL/techmarket_test/techmarket_legacy}"
"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists techmarket_legacy" -c "create database techmarket_legacy"
for f in supabase/tests/00_supabase_stubs.sql supabase/tests/01_tap.sql supabase/tests/legacy/mvp_schema.sql \
         supabase/tests/legacy/sample_data.sql; do
  "${PSQL[@]}" "$LEGACY_URL" -o /dev/null -f "$ROOT/$f"
done
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" "$LEGACY_URL" -o /dev/null -f "$f"; done
"${PSQL[@]}" "$LEGACY_URL" -o /dev/null -f "$ROOT/supabase/scripts/migrate_legacy.sql"
"${PSQL[@]}" "$LEGACY_URL" -o /dev/null -f "$ROOT/supabase/scripts/migrate_legacy.sql"   # idempotent
echo "  · legacy/verify.sql"
"${PSQL[@]}" "$LEGACY_URL" -o /dev/null -f "$ROOT/supabase/tests/legacy/verify.sql"
echo "✓ database tests passed"
