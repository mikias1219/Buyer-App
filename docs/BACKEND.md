# Backend: Supabase setup, operations and cutover

Covers the database, Edge Functions, secrets, the first owner, scheduling, and the one-time
switch from the old TechMarket marketplace schema to the shop schema. Behaviour is defined in
`docs/SPEC.md`.

## 1. Architecture in one paragraph

The Mini App never reads or writes tables. On boot it sends Telegram's signed `initData` to the
`auth-telegram` Edge Function, which verifies the HMAC, upserts the profile and returns a
short-lived JWT with a `tg_id` claim. With that JWT the app calls SECURITY DEFINER RPCs
(`record_sale`, `restock`, `dashboard_summary`, …). Each RPC reads the caller's role
(`owner | staff | user`) from `profiles`, applies the business rules and returns JSON shaped for
that role (cost and profit only for owners). Every stock change is a row in the append-only
`stock_movements` ledger written in the same transaction as the cached `products.stock_qty`.
Product photos live in the `product-images` bucket, uploaded via signed URLs from the `storage`
function. Bot messages are queued in `notifications_outbox` and delivered by `notify`.

## 2. Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20261004…` | Old marketplace schema (already applied in production; never edited) |
| `supabase/migrations/20261018000100_shop_reset.sql` | Drops the marketplace objects, trims `profiles`, maps roles (runs only once) |
| `supabase/migrations/20261018000200…0600` | Shop schema, RLS/grants, catalog & stock, sales, expenses & reports, team/settings/jobs |
| `supabase/seed.sql` | Settings row + starter categories (local dev / tests) |
| `supabase/functions/auth-telegram` | initData → JWT, first-owner bootstrap |
| `supabase/functions/storage` | Signed upload URLs for product photos (owners only) |
| `supabase/functions/notify` | Scheduled outbox delivery with retry/backoff |
| `supabase/functions/bot-webhook` | `/start`, `/help` → open the Mini App |
| `supabase/tests/*` + `scripts/test-db.sh` | Migrations, roles/RLS, stock, sales, reports and production-upgrade tests on plain Postgres |

## 3. RPC reference

All take/return JSON; errors are raised with a stable code as the message (see §7).

| Area | RPC | Who |
|------|-----|-----|
| Session | `get_me()`, `update_my_profile({language})` | anyone signed in |
| Settings | `get_settings()` (reduced for staff), `update_settings(input)` | member / owner |
| Team | `list_team()`, `set_member_role(public_id, role)` | owner |
| Categories | `list_categories(include_archived)`, `upsert_category({id?, name, sort?})`, `set_category_archived(id, bool)` | member / owner |
| Products | `list_products(filters, limit, offset)`, `get_product(id)`, `find_product_by_code(code)` | member (cost fields owner-only) |
| | `create_product(input)`, `update_product(id, input)`, `set_product_status(id, status)`, `delete_product(id)` | owner |
| Stock | `restock(items, supplier, note)` | owner (staff if `staff_can_restock`) |
| | `adjust_stock(product_id, 'set'\|'loss', qty, reason)`, `product_movements(product_id, before, limit)` | owner |
| | `low_stock(limit)` | member |
| Sales | `record_sale(client_ref, items, payment_method, discount, note)` | member |
| | `list_sales(filters, limit, offset)`, `get_sale(id)` | owner: all; staff: own sales today |
| | `void_sale(id, reason)`, `return_sale_items(sale_id, items, reason)` | owner |
| Expenses | `create_expense`, `update_expense`, `delete_expense`, `list_expenses(filters)` | owner |
| Reports | `dashboard_summary`, `sales_trend(filters, bucket)`, `product_performance(filters, sort, limit)`, `category_breakdown`, `payment_breakdown`, `cashier_breakdown`, `slow_movers(days, limit)`, `stock_summary`, `export_sales_lines` | owner |

Report filters (one shape everywhere): `{ from, to, category_ids, product_ids, payment_methods,
cashier_ids }`, with `from`/`to` as local dates (inclusive, default today) in
`shop_settings.timezone`.

## 4. Secrets

Set Edge Function secrets with `supabase secrets set NAME=value` or in Dashboard → Edge
Functions → Secrets. Names are listed in `.env.example`.

- `JWT_SECRET` must be the project's HS256 secret (Dashboard → Project Settings → JWT Keys →
  *Legacy JWT secret*).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
  automatically into Edge Functions.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go to the web app. With this schema the
  anon key can read nothing at all.

## 5. Fresh project setup

```bash
supabase login && supabase link --project-ref <ref>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql          # optional starter categories
supabase secrets set BOT_TOKEN=... JWT_SECRET=... WEBHOOK_SECRET=... CRON_SECRET=... \
  MINI_APP_URL=https://<your-app> INITIAL_ADMIN_TELEGRAM_IDS=<your numeric telegram id>
supabase functions deploy auth-telegram storage notify bot-webhook
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d url="https://<ref>.supabase.co/functions/v1/bot-webhook" -d secret_token="$WEBHOOK_SECRET"
```

### First owner

Set `INITIAL_ADMIN_TELEGRAM_IDS` to your numeric Telegram ID before you first open the app.
`auth-telegram` makes you the owner on login **only while the shop has no owner**. Afterwards,
staff open the app once (they appear under Team → Requests) and you grant them access.
By hand (ID from your shell, never committed):

```bash
psql "$SUPABASE_DB_URL" -v id="$OWNER_TG_ID" -c "select public.bootstrap_owner(:'id')"
```

### Scheduling `notify` (every minute)

Dashboard → Integrations → Cron → *Create job* → **Supabase Edge Function** `notify`, schedule
`* * * * *`, header `x-cron-secret: <CRON_SECRET>`.

## 6. Production cutover (marketplace → shop, Phase 7)

Production currently runs the 20261004 marketplace schema. CI applies migrations on every push to
`main`, so the shop work stays on branch `shop-rebuild` until this window.

```bash
export SUPABASE_DB_URL='postgresql://...'      # in your shell only
pg_dump "$SUPABASE_DB_URL" --no-owner --format=custom -f backup-$(date +%F-%H%M).dump   # keep it
git checkout main && git merge shop-rebuild && git push   # CI: db push → functions → Vercel
```

What `shop_reset` does to existing data:

- Profiles are kept. Roles map `admin → owner`, `moderator → staff`, `user → user`. Phone,
  city and seller columns are dropped.
- Listings, images metadata, payments, favorites, leads, reports, reviews, views, platform
  settings and the `legacy` schema are **dropped**. `audit_log` history is kept; unsent
  marketplace notifications are deleted.
- The `listing-images` and `payment-proofs` Storage buckets are left alone (Supabase blocks
  deleting storage objects from SQL). Empty and delete them in Dashboard → Storage afterwards.
- Remove the old `verify-phone` function: `supabase functions delete verify-phone`.

`npm run test:db` replays exactly this path (old migrations + marketplace rows → shop migrations).

## 7. Error codes

`not_authenticated`, `banned`, `no_access`, `not_authorized`, `not_found`, `invalid_input`
(detail = field), `invalid_quantity`, `insufficient_stock` (detail = product id),
`product_unavailable`, `below_cost`, `customer_required`, `duplicate_sku`, `duplicate_barcode`,
`duplicate_category`, `has_history`, `no_change`, `invalid_transition`, `return_exceeds_sold`,
`last_owner`, `conflict`.

## 8. Business rules (where they live)

| Rule (SPEC A3) | Enforced in |
|----------------|-------------|
| Ledger + cached stock in one transaction | `apply_movement` (called by every stock-changing RPC) |
| No overselling, row locks in id order | `record_sale`, `adjust_stock` (`allow_negative_stock`) |
| Weighted average cost | `restock` |
| Price/cost snapshot per sale line | `sale_items.unit_price / unit_cost` |
| Discounts, staff below-cost block | `record_sale` (`staff_can_sell_below_cost`) |
| Idempotent sales | `sales.client_ref` UNIQUE + check after locking |
| Void / partial returns, owner only | `void_sale`, `return_sale_items` |
| Profit definitions, filters, time zone | `report_events`, `report_kpis`, `parse_report_filters` |
| Archive vs delete | `delete_product` (`has_history`) |
| Whole-number units | `check_qty` |
| Audit | `write_audit` in every owner write |

Assumptions where the spec left room:

1. Returns and voids put stock back without changing the average cost.
2. Net profit subtracts **damage/loss** only; stock-count corrections are reported separately as
   `adjustments_value` (they can be gains or losses).
3. Report category filters use each product's **current** category.
4. A return reduces revenue on the **return date**, not the original sale date.
5. Staff restocking (when enabled) cannot set the unit cost; the current average is used.
6. Expenses are shop-wide: product/category filters don't apply to them (`scoped: true` tells
   the dashboard to label net profit accordingly).
