#!/usr/bin/env bash
# Deletes all shop data (products, sales, stock history, expenses, customers) so you can start
# fresh. Team members and shop settings are kept. See scripts/sql/reset_shop_data.sql.
#
#   export SUPABASE_DB_URL='postgresql://...'   # Supabase → Project Settings → Database → URI
#   bash scripts/reset-shop-data.sh             # shows counts, backs up, asks before deleting
#   bash scripts/reset-shop-data.sh --no-backup # skip the pg_dump backup (not recommended)
#
# Product photos in the product-images storage bucket are not deleted; remove them in the
# Supabase dashboard (Storage) if you want the space back.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${SUPABASE_DB_URL:-}"
BACKUP=1
[[ "${1:-}" == "--no-backup" ]] && BACKUP=0

if [[ -z "$DB_URL" ]]; then
  echo "Set SUPABASE_DB_URL first (Supabase → Project Settings → Database → Connection string → URI)." >&2
  exit 1
fi

PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc "$DB_URL")

echo "Current data:"
"${PSQL[@]}" -A -F $'\t' -c "
  select 'products', count(*) from public.products
  union all select 'categories', count(*) from public.categories
  union all select 'sales', count(*) from public.sales
  union all select 'stock movements', count(*) from public.stock_movements
  union all select 'expenses', count(*) from public.expenses
  union all select 'customers', count(*) from public.customers" -t | column -t -s $'\t'
echo

if [[ $BACKUP -eq 1 ]]; then
  mkdir -p "$ROOT/backups"
  FILE="$ROOT/backups/shop-data-$(date +%Y%m%d-%H%M%S).sql"
  echo "Backing up shop data to $FILE …"
  pg_dump "$DB_URL" --data-only --no-owner \
    -t public.products -t public.categories -t public.sales -t public.sale_items \
    -t public.sale_returns -t public.sale_return_items -t public.stock_movements \
    -t public.expenses -t public.customers -t public.customer_payments >"$FILE"
  echo "Backup saved."
  echo
fi

echo "This permanently deletes ALL products, sales, stock history, expenses and customers."
read -r -p "Type DELETE to continue: " answer
if [[ "$answer" != "DELETE" ]]; then
  echo "Cancelled. Nothing was deleted."
  exit 1
fi

"${PSQL[@]}" -f "$ROOT/scripts/sql/reset_shop_data.sql"
echo "✓ Shop data removed. Team and settings are unchanged."
