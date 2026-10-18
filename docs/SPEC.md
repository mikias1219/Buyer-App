# Shop Manager — Spec + Phase Plan

A Telegram Mini App for running one local shop: products, stock, sales, expenses, profit and a
filterable dashboard. It **replaces** the former TechMarket ET marketplace completely, on the same
Supabase project, the same GitHub Actions CI/CD and the same Vercel deployment.

How to use this file:

1. **Part A** is the source of truth for behaviour and data.
2. **Part B** are the project rules (mirrored in `AGENTS.md`).
3. **Part C** are the phases. Do them in order, one at a time; each ends with acceptance checks.

Base: this repo (React 19 + Vite + Tailwind 4 + TypeScript strict + TanStack Query + zod + i18next,
Supabase Postgres + Edge Functions, Telegram auth via `auth-telegram`).

---

# PART A — THE SPEC

## A1. Product vision

The owner of a small shop (20–500 products) opens the app in Telegram and instantly knows:
**what sold, what is left, what it is worth, and how much money the shop actually made.**

Principles:

- **Numbers you can trust.** Stock and profit are computed from an append-only ledger of stock
  movements and sales; every sale freezes its price and cost at the moment of sale.
- **Fast at the counter.** Recording a sale takes a few taps: search/scan → quantity → pay.
- **Owner sees money, staff sees work.** Cashiers can sell and see stock, never cost or profit.
- **Safe by construction.** Every write is a SECURITY DEFINER RPC that re-checks role and rules.
- **Amharic + English**, ETB, Addis Ababa time zone.

## A2. Roles

Roles live in `profiles.role` and are always read from the database.

| Role | Can do |
| --- | --- |
| `owner` | Everything: products, prices, cost, restock, stock adjustments, sales, void/returns, expenses, dashboard, reports, export, team, settings |
| `staff` | Record sales, see products with **selling price and stock only**, see **their own** sales for today, restock only if `settings.staff_can_restock` |
| `user`  | Signed in but no shop access. Sees "Ask the owner to add you" with their Telegram name; appears in the owner's *Team → Requests* list |

First owner: `INITIAL_ADMIN_TELEGRAM_IDS` env var (existing mechanism), promoted on first login only
while no owner exists. More than one owner is allowed; the last owner cannot demote themselves.

## A3. Business rules

All tunables live in the single-row `shop_settings` table (owner-editable via RPC).

1. **Stock ledger.** Every change in quantity is a row in `stock_movements`
   (`opening | purchase | sale | return | adjustment | damage | void`). `products.stock_qty` is a
   cached total updated **only** inside the same RPC transaction that writes the movement. A DB test
   asserts `stock_qty = Σ qty_delta` for every product.
2. **No overselling.** A sale fails with `insufficient_stock` if any line exceeds the stock on hand,
   unless `allow_negative_stock = true` (default `false`). Product rows are locked `FOR UPDATE`
   inside `record_sale` so two cashiers cannot sell the last unit twice.
3. **Cost method: weighted average cost (WAC).** On restock:
   `new_avg = (stock × avg + qty × unit_cost) / (stock + qty)` (if stock ≤ 0, `new_avg = unit_cost`).
   Sales and adjustments do not change the average.
4. **Price snapshot.** Each `sale_items` row stores `unit_price` and `unit_cost` at the time of sale.
   Later price or cost changes never alter past profit.
5. **Discounts.** Per-line and per-sale discount in ETB, never making a line or the total negative.
   Selling below cost is allowed but shows a warning to the owner (staff are blocked if
   `staff_can_sell_below_cost = false`, default `false`).
6. **Payment method** on every sale: `cash | telebirr | bank | credit`. `credit` requires a customer
   (customers/debts arrive in Phase 6; until then `credit` is hidden).
7. **Idempotency.** `record_sale` takes a client-generated `client_ref uuid` (UNIQUE). A retried or
   double-tapped submit returns the original sale instead of creating a second one.
8. **Void and returns (owner only).** Voiding a sale sets `status = voided`, writes reversing
   `void` movements, and excludes it from all reports. A partial return creates a `sale_returns` row,
   `return` movements and reduces that sale's revenue/profit in the period of the return. Returned
   quantity can never exceed sold quantity. A reason is required for both.
9. **Adjustments.** Stock count corrections and damage/loss require a reason; damage/loss is valued
   at current average cost and reported as **stock loss** in the financial summary.
10. **Expenses.** Owner records expenses with date, category
    (`rent | salary | transport | utilities | supplies | tax | other`), amount, note.
11. **Profit definitions** (for a period, completed sales only, net of returns):
    - Revenue = Σ line totals − sale discounts
    - COGS = Σ qty × unit_cost
    - **Gross profit** = Revenue − COGS; margin % = Gross profit / Revenue
    - **Net profit** = Gross profit − Expenses − Stock loss
12. **Stock value** (now): at cost = Σ stock × avg_cost; at retail = Σ stock × sell_price; potential
    profit = retail − cost.
13. **Low stock.** `stock_qty ≤ reorder_level` (per product, default from settings) → "Low";
    `≤ 0` → "Out". Shown on dashboard and optionally sent by the bot.
14. **Units.** `piece | pack | box | kg | g | litre | metre`. `piece/pack/box` quantities must be
    whole numbers; others allow 3 decimals.
15. **Archive, don't delete.** A product with any movement can only be archived (hidden from Sell,
    kept in reports). A product with no history can be deleted.
16. **Money & time.** `numeric(14,2)` ETB for money, `numeric(14,4)` for average cost,
    `numeric(12,3)` for quantities. "Today/this week/this month" are computed in
    `shop_settings.timezone` (default `Africa/Addis_Ababa`); weeks start Monday. Gregorian calendar
    in v1 (Ethiopian calendar display is an open question).
17. **Audit.** Price changes, cost changes, adjustments, voids, returns, expense edits, role changes
    and settings changes write `audit_log` (before/after).

## A4. State machines

### Sale

```
completed ──void (owner, reason)──▶ voided        (terminal)
completed ──return (owner, items)──▶ completed     (returned_qty grows; fully returned = still completed)
```

### Product

```
active ⇄ archived        (owner)
active ──delete──▶ gone  (owner, only if no stock_movements)
```

### Stock movement types and sign

| Type | Sign | Created by |
| --- | --- | --- |
| `opening` | + | create_product with opening stock |
| `purchase` | + | restock |
| `sale` | − | record_sale |
| `return` | + | return_sale_items |
| `void` | + | void_sale |
| `adjustment` | ± | adjust_stock (count correction) |
| `damage` | − | adjust_stock (loss/damage/expired) |

## A5. Flows

1. **First open.** `auth-telegram` → JWT. `owner`/`staff` land on their home tab; `user` sees the
   no-access screen.
2. **Add product (owner).** Name, category, unit, selling price, cost price, opening stock,
   reorder level, optional SKU/barcode and photo. Creates `opening` movement.
3. **Bulk import (owner, Phase 6).** Upload CSV (template downloadable) → preview with per-row
   validation → import in one transaction.
4. **Restock.** Pick product(s) → qty + unit cost (+ supplier text, note) → `purchase` movements,
   WAC update.
5. **Sell (POS).** Search by name/SKU or category chips → tap to add → adjust qty/discount in cart →
   choose payment method → **Complete sale** (Telegram MainButton) → receipt screen (share as
   text to a chat). Staff see no cost/profit; owner sees a live margin line.
6. **Sales history.** Filter by date range, payment method, cashier, product; open a sale → void or
   return (owner).
7. **Stock count.** Product → *Adjust* → counted qty or loss qty + reason.
8. **Expenses.** Add/edit/delete (owner), list with month total by category.
9. **Dashboard (owner).** Period selector + filters → KPIs, charts, best/slow sellers, low stock.
10. **Reports & export (owner).** Same filters → CSV of sales lines, product performance, stock
    valuation, expenses.
11. **Team.** Owner sees requests from `user`s → grant `staff`; can demote/remove; can promote to
    owner with confirmation.
12. **Bot (Phase 6).** Daily summary at `daily_summary_time` to owners; low-stock alert when a
    product crosses its reorder level; `/today` and `/lowstock` commands for owners.

## A6. Screens and navigation

Bottom nav — owner: **Dashboard · Products · Sell (center, emphasized) · Sales · More**.
Bottom nav — staff: **Sell · Products · My sales**.
*More* (owner): Expenses, Reports, Restock history, Team, Settings, (Phase 6: Customers, Import).

| Screen | Contents |
| --- | --- |
| Dashboard | Period chips (Today, Yesterday, This week, This month, Last month, Custom) + filter sheet (category, product, payment method, cashier). KPI cards: Revenue, Gross profit + margin, Expenses, Net profit, Items sold, # Sales, Avg sale. Stock cards: units on hand, value at cost, value at retail, low/out counts. Charts: revenue & profit trend (day/week/month buckets), sales by category, payment-method split. Lists: Top 10 by qty / by revenue / by profit (toggle), slow movers (no sale in N days), low stock. |
| Products | Search, filter chips (category, Low, Out, Archived), sort (name, stock, best selling, margin). Row: name, stock with unit + status badge, sell price, (owner) cost & margin. |
| Product detail | Stats for the selected period (sold, revenue, profit), stock, avg cost, price, movement history (paged), actions: Edit, Restock, Adjust, Archive. |
| Product form | zod-validated form (A5.2). |
| Sell | Search + category chips + product grid/list, cart bottom sheet, payment method, discount, complete. |
| Receipt | Sale summary, share, (owner) void/return. |
| Sales | Day-grouped list with totals, filters (A5.6). |
| Expenses | Month list + category totals, add/edit sheet. |
| Reports | Filter + export buttons. |
| Team / Settings | A5.11 / shop name, timezone, defaults, staff permissions, bot options. |
| No access | For `user` role. |

Every screen: loading skeleton, empty state with CTA, error with retry, offline banner. The Sell
screen disables *Complete sale* while offline (v1 has no offline queue; see open questions).

## A7. Design system

Keep the existing tokens, Telegram theme integration and `src/components/ui` primitives (Button,
IconButton, Field/Input, NumberInput, Chip, Badge, Card, Skeleton, EmptyState, ErrorState, Toast,
BottomSheet, Tabs, Toggle, Spinner, ImageUploader, Avatar).

Remove marketplace-only components (ListingCard, ListingRow, VerifiedBadge, Rating, ImageGallery,
Stepper if unused, PriceTag replaced by `Money`).

Add: `Money` (ETB formatting, tabular-nums, optional sign/colour), `Quantity` (with unit),
`StatCard` (value, label, delta vs previous period), `StockBadge` (ok/low/out),
`PeriodPicker` (presets + custom range sheet), `FilterSheet`, `QtyStepper`, `CartLine`,
`TrendChart` / `BarList` / `DonutChart` (hand-written SVG, no chart library, accessible labels,
theme-aware colours), `ListRow`, `SectionHeader`.

Profit/loss colours: success for positive, danger for negative, never colour alone (always a sign).

## A8. Data model

Reset migration (Phase 1) **drops** all marketplace objects: tables `products` (old listings),
`product_images`, `payments`, `favorites`, `leads`, `reports`, `reviews`, `product_views`,
`platform_settings`, view `listings_public`, all marketplace RPCs, the `legacy` schema, the
`listing-images` / `payment-proofs` storage buckets. It **keeps** `profiles` (trimmed),
`audit_log`, `notifications_outbox`, auth/error/audit/outbox helpers.

```
shop_settings (single row id=1)
  shop_name text, currency text default 'ETB', timezone text default 'Africa/Addis_Ababa',
  default_reorder_level numeric, allow_negative_stock bool default false,
  staff_can_restock bool default false, staff_can_sell_below_cost bool default false,
  slow_mover_days int default 30, daily_summary_enabled bool, daily_summary_time time,
  low_stock_alerts bool, receipt_footer text, updated_at, updated_by

profiles (kept)  telegram_id PK, public_id, username, first_name, last_name, photo_url, language,
  role ('user','staff','owner'), is_banned, bot_blocked, created_at, updated_at, last_seen_at
  -- marketplace columns dropped (phone*, city, is_verified_seller, listings_free_used)
  -- existing roles mapped: admin→owner, moderator→staff, user→user

categories   id uuid PK, name text UNIQUE (case-insensitive), sort int, archived bool

products     id uuid PK, name, category_id FK, sku text UNIQUE NULL, barcode text UNIQUE NULL,
             unit, sell_price numeric(14,2) ≥0, avg_cost numeric(14,4) ≥0,
             stock_qty numeric(12,3), reorder_level numeric(12,3) ≥0, image_path text,
             notes, status ('active','archived'), created_by, created_at, updated_at
             indexes: lower(name) trgm, category_id, status

stock_movements  id bigint PK, product_id FK, type, qty_delta numeric(12,3) ≠0,
                 unit_cost numeric(14,4), stock_after numeric(12,3),
                 sale_id FK NULL, sale_return_id FK NULL, supplier text, reason text,
                 actor_id FK profiles, created_at   -- append-only (no update/delete grants)
                 indexes: (product_id, created_at desc), (type, created_at)

sales        id uuid PK, receipt_no bigint identity UNIQUE, client_ref uuid UNIQUE,
             sold_at timestamptz, cashier_id FK, customer_id NULL (Phase 6),
             payment_method, subtotal, discount, total, total_cost, status ('completed','voided'),
             void_reason, voided_by, voided_at, note
             indexes: (sold_at), (cashier_id, sold_at), (status, sold_at)

sale_items   id bigint PK, sale_id FK, product_id FK, qty, unit_price, unit_cost,
             discount, line_total, returned_qty default 0 (≤ qty)

sale_returns       id uuid PK, sale_id FK, reason, refund_amount, cost_amount, created_by, created_at
sale_return_items  return_id FK, sale_item_id FK, qty

expenses     id uuid PK, spent_on date, category, amount numeric(14,2) >0, note,
             created_by, created_at, updated_at

-- Phase 6
customers          id uuid PK, name, phone, note, created_at
customer_payments  id uuid PK, customer_id FK, amount, method, note, created_by, created_at
```

### RPCs (all SECURITY DEFINER, `set search_path = public`, role re-checked, stable error codes)

- Session: `get_me()` → profile + role + settings subset.
- Catalog (owner): `upsert_category`, `archive_category`, `create_product(input)`,
  `update_product(id, input)`, `set_product_status(id, status)`, `delete_product(id)`.
- Catalog (read, role-shaped): `list_products(filters)` / `get_product(id)` — cost/margin fields
  returned **only** to owners.
- Stock: `restock(items jsonb, supplier, note)`, `adjust_stock(product_id, mode, qty, reason)`,
  `product_movements(product_id, cursor)`.
- Sales: `record_sale(client_ref, items, payment_method, discount, note)`,
  `void_sale(id, reason)`, `return_sale_items(sale_id, items, reason)`,
  `list_sales(filters, cursor)`, `get_sale(id)` (staff: own sales today only, no cost).
- Expenses (owner): `create_expense`, `update_expense`, `delete_expense`, `list_expenses(filters)`.
- Reports (owner; one shared `filters jsonb`: `from`, `to`, `category_ids`, `product_ids`,
  `payment_methods`, `cashier_ids`):
  `dashboard_summary(filters)` (KPIs + previous-period deltas), `sales_trend(filters, bucket)`,
  `product_performance(filters, sort, limit)`, `category_breakdown(filters)`,
  `payment_breakdown(filters)`, `stock_summary(category_ids)`, `low_stock(limit)`,
  `slow_movers(days, limit)`, `export_sales_lines(filters)`.
- Team/settings (owner): `list_team()`, `set_member_role(public_id, role)`,
  `get_settings()`, `update_settings(input)`.
- Internal: `upsert_telegram_profile`, `bootstrap_owner`, outbox claim/complete, `daily_summary()`.

## A9. Security

1. **Auth** unchanged: `auth-telegram` validates `initData` HMAC, freshness ≤ 24h, upserts profile,
   returns a JWT with `tg_id`.
2. **RLS on every table with no client policies for writes.** Clients have `execute` on the RPCs
   only; base tables are not selectable by `anon`/`authenticated` (reads go through RPCs so cost
   fields can be hidden from staff).
3. `stock_movements`, `sale_items`, `audit_log` are append-only (no update/delete for any client
   path; void/return add new rows).
4. Secrets only in Edge Function env / GitHub secrets. No personal data in code or SQL.
5. Storage: bucket `product-images` (public read, owner-only signed upload via the `storage`
   function, ≤ 2 MB, jpeg/png/webp).
6. DB tests (pgTAP, `scripts/test-db.sh`) prove: `user` can do nothing; staff cannot see cost,
   edit products, void, adjust, read reports or expenses; overselling fails; concurrent-safe
   locking; idempotent `record_sale`; WAC math; void/return math; ledger = cached stock.

## A10. Stack, structure, delivery

- Same stack and libraries. No new runtime dependency without a reason in the PR.
- Structure:

```
src/features/
  auth/ dashboard/ products/ stock/ sell/ sales/ expenses/ reports/ team/ settings/
  (Phase 6) customers/ import/
    api.ts  hooks.ts  schema.ts  logic.ts (+ .test.ts)  components/  pages/
supabase/
  migrations/  functions/{auth-telegram,bot-webhook,notify,storage,daily-summary}  tests/
```

- Edge Functions removed: `verify-phone`. Kept/adapted: `auth-telegram`, `bot-webhook`, `notify`,
  `storage`. Added (Phase 6): `daily-summary` (cron).
- **CI/CD unchanged** (`.github/workflows/ci.yml`): lint, typecheck, unit, DB tests, e2e (mock
  backend), then on `main`: `supabase db push` → deploy functions → Vercel. The legacy
  `migrate_legacy.sql` step and `supabase/scripts/*legacy*` are removed.
- **Branching for the rebuild.** Pushing to `main` (or `rebuild/production`) applies migrations to
  production. All rebuild work happens on branch `shop-rebuild`; it is merged to `main` only at
  the cutover (Phase 7), after a `pg_dump` backup.

## A11. Definition of done

- Owner can, inside real Telegram: add 20+ products (manually or CSV), restock, sell, void/return,
  add expenses, and see correct revenue, profit, stock left and best sellers for any period/filter.
- Staff cannot see cost/profit or change anything except recording sales.
- Ledger invariant and all business-rule tests pass in CI.
- Every screen has loading/empty/error/offline states; en + am complete; lint/typecheck/tests green.

---

# PART B — PROJECT RULES

See `AGENTS.md` (kept in sync with this section).

---

# PART C — PHASES

## Phase 0 — Spec and repo prep (this document)

Replace SPEC and AGENTS for the shop system; confirm assumptions with the owner.
Acceptance: owner approves the spec and the open questions are answered or accepted as defaults.

## Phase 1 — Backend reset + shop schema + RPCs

1. New migration(s): drop marketplace objects (A8), trim/mapped `profiles`, create shop tables,
   constraints, indexes, triggers, RLS, grants.
2. All RPCs from A8 except Phase 6 ones, with role checks, A3 rules and audit writes.
3. Replace `supabase/tests/*` with shop tests (A9.6); keep `scripts/test-db.sh` working in CI.
4. Adapt `auth-telegram` (`bootstrap_owner`), `storage` (product images); delete `verify-phone`;
   remove legacy scripts and the CI legacy step. Update `supabase/seed.sql` with demo categories and
   products for local dev only.
5. `docs/BACKEND.md` updated.
Acceptance: migrations apply cleanly on a copy of the current production schema **and** on an empty
DB; DB tests green; `deno check` green.

## Phase 2 — Client reset: shell, roles, data layer

1. Delete marketplace features (`listings`, `sell` wizard, `payments`, `favorites`, `admin`,
   phone verification) and their locales, tests and e2e specs.
2. New router + role-based bottom nav (A6), no-access screen, design-system additions from A7
   (`Money`, `Quantity`, `StatCard`, `StockBadge`, `PeriodPicker`, `FilterSheet`, `ListRow`).
3. Typed API layer + mock backend for the new RPCs; TanStack Query keys per feature.
Acceptance: app boots for owner/staff/user against mock and local Supabase; all checks green.

## Phase 3 — Products and stock

Products list/filters/sort, product detail with history, product form, categories, restock,
adjust stock, archive/delete. Unit tests for schemas and WAC/stock display logic; e2e: add product →
restock → adjust.

## Phase 4 — Selling and sales history

POS screen, cart, discounts, payment method, idempotent submit, receipt + share, sales history with
filters, void and partial return. e2e: sell → stock decreases → void → stock restored; staff flow.

## Phase 5 — Expenses, dashboard, reports

Expenses CRUD; dashboard with period + filters, KPIs with previous-period delta, trend/category/
payment charts, top/slow sellers, low stock, stock valuation; reports page with CSV export.
Tests: profit formulas, period boundaries in Addis time, filter combinations.

## Phase 6 — Customers & credit, CSV import, bot

Customers + credit sales + debt payments and balances; CSV import with preview/validation;
`daily-summary` function + cron, low-stock alerts, `/today` and `/lowstock` bot commands.

## Phase 7 — Quality and production cutover

Performance pass (500 products, 10k sales), accessibility, security review, README/LAUNCH docs.
Cutover: `pg_dump` backup → merge `shop-rebuild` to `main` → CI applies migrations, deploys
functions and web → smoke test in Telegram (iOS/Android/Desktop) → enter real products.

---

# Open questions (defaults used until answered)

| # | Question | Default assumed |
| --- | --- | --- |
| 1 | App/shop name shown in the UI and bot | "Shop Manager"; shop name editable in Settings |
| 2 | Will staff use the app? | Yes, `staff` role supported; can be ignored if solo |
| 3 | Variants (size/colour/storage) or serial/IMEI tracking? | No; each variant is its own product |
| 4 | Credit sales / customer debts needed? | Yes, but in Phase 6 |
| 5 | VAT/TOT on sales? | No tax handling in v1 |
| 6 | Ethiopian calendar display? | Gregorian in v1 |
| 7 | Offline selling (queue sales without internet)? | Not in v1; idempotent retry only |
| 8 | Existing marketplace data in production (test profiles/listings) | Profiles kept (roles mapped), all listing/payment data dropped after a backup |
| 9 | Barcode scanning with camera? | Not in v1; SKU/barcode typed or searched |
