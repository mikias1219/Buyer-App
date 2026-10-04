# Backend: Supabase setup, operations and cutover

Covers the database, Edge Functions, secrets, first admin, scheduling, and the one-time
migration from the MVP schema. The security model is summarized in `docs/SECURITY.md`.

## 1. Architecture in one paragraph

The Mini App never writes to tables. On boot it sends Telegram's signed `initData` to the
`auth-telegram` Edge Function, which verifies the HMAC, upserts the profile and returns a
short-lived JWT with a `tg_id` claim. With that JWT the app calls SECURITY DEFINER RPCs
(`create_listing`, `submit_listing`, `submit_payment_reference`, `admin_confirm_payment`, …).
Each RPC reads the caller's role from `profiles` and enforces the legal state transitions.
Public browsing uses the `listings_public` view and `search_listings`, which never expose
seller contact data. Images live in Storage, uploaded via signed URLs from the `storage`
function. Bot messages are queued in `notifications_outbox` and delivered by the `notify`
function, which also runs expiry, reminders and boost expiry.

## 2. Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/*.sql` | Ordered, re-runnable schema, RLS, RPCs. Never edit an applied migration; add a new file. |
| `supabase/seed.sql` | Settings row only (no personal data). |
| `supabase/functions/auth-telegram` | initData → JWT |
| `supabase/functions/verify-phone` | Signed `requestContact` payload → `phone_verified = true` |
| `supabase/functions/storage` | Signed upload URLs (listing images, payment proofs), signed proof downloads |
| `supabase/functions/notify` | Scheduled: maintenance + outbox delivery with retry/backoff |
| `supabase/functions/bot-webhook` | `/start`, `/help`, `/sell`, `/mylistings`, inline search, contact fallback |
| `supabase/scripts/migrate_legacy.sql` | One-time MVP → v1 data copy (idempotent) |
| `scripts/migrate-legacy-images.mjs` | One-time move of base64 images into Storage |
| `supabase/scripts/cleanup_legacy.sql` | Drop the MVP tables after verification (irreversible) |
| `supabase/tests/*` + `scripts/test-db.sh` | Migration, RLS, business-rule and legacy-path tests on plain Postgres |

## 3. Secrets

Set Edge Function secrets with the Supabase CLI (`supabase secrets set NAME=value`) or in
Dashboard → Edge Functions → Secrets. Names are listed in `.env.example`.

- `JWT_SECRET` must be the secret your project uses to verify HS256 tokens
  (Dashboard → Project Settings → JWT Keys → *Legacy JWT secret*). PostgREST accepts our
  tokens only if they are signed with it. If you rotate it, every session re-authenticates
  automatically on next open.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
  automatically into Edge Functions; don't set them yourself.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go to the web app. The anon key
  is public by design: with the RLS in this repo it can read only the public catalogue.

## 4. Fresh project setup

```bash
# 0. Tools: Supabase CLI (https://supabase.com/docs/guides/cli), psql
supabase login && supabase link --project-ref <ref>

# 1. Database
supabase db push                      # applies supabase/migrations in order
psql "$SUPABASE_DB_URL" -f supabase/seed.sql

# 2. Functions + secrets
supabase secrets set BOT_TOKEN=... JWT_SECRET=... WEBHOOK_SECRET=... CRON_SECRET=... \
  MINI_APP_URL=https://<your-app> INITIAL_ADMIN_TELEGRAM_IDS=<your numeric telegram id>
supabase functions deploy auth-telegram verify-phone storage notify bot-webhook

# 3. Bot webhook
curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d url="https://<ref>.supabase.co/functions/v1/bot-webhook" -d secret_token="$WEBHOOK_SECRET"
```

### First admin

Set `INITIAL_ADMIN_TELEGRAM_IDS` to your numeric Telegram ID before you first open the app.
`auth-telegram` promotes you on login **only while the project has no admin**. After that,
manage roles from Admin → Users. To do it by hand instead (one-off, ID from your shell, not
committed):

```bash
psql "$SUPABASE_DB_URL" -v id="$ADMIN_TG_ID" \
  -c "select public.bootstrap_admin(:'id')"     # the user must have opened the app once
```

### Scheduling `notify` (every minute)

Dashboard → Integrations → Cron → *Create job* → type **Supabase Edge Function**, function
`notify`, schedule `* * * * *`, header `x-cron-secret: <CRON_SECRET>`.
Migration 0800 also schedules `run_maintenance()` every 10 minutes via `pg_cron` when that
extension is enabled, so expiry keeps working even if the function schedule is missing.

### Settings

After first login, open Admin → Settings and fill in the Telebirr number/name, support
username, bot username and Mini App short name (needed for share links and channel posts).
If you use auto-posting, also set the channel ID and add the bot as a channel admin.

## 5. Production cutover from the MVP (one maintenance window)

The MVP schema let the anon key write everything. Migration `0100` moves those tables into
a private `legacy` schema. **The old web app stops working the moment it runs**, so deploy
the new web app in the same window.

```bash
export SUPABASE_DB_URL='postgresql://...'      # in your shell only

# 1. Backup (keep it!)
pg_dump "$SUPABASE_DB_URL" --no-owner --format=custom -f backup-$(date +%F-%H%M).dump

# 2. Schema + data
for f in supabase/migrations/*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/migrate_legacy.sql

# 3. Images (service key from Dashboard → API; shell only)
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-legacy-images.mjs

# 4. Functions + secrets (section 4), then deploy the new web app (Vercel)
# 5. Smoke test in Telegram (docs/LAUNCH.md). When happy, optionally:
psql "$SUPABASE_DB_URL" -f supabase/scripts/cleanup_legacy.sql
```

What the data copy does:

- Profiles are copied. Phones are kept but marked **unverified**, because MVP phones were
  typed in, not verified through Telegram.
- Legacy `admin_telegram_ids` become `admin` roles.
- Listings keep their status (`hidden` becomes `removed`). Live ones get a fresh 30-day period.
- Payments are copied with normalized references. Invalid references become `LEGACY-…`
  (the original is kept in the admin note), and duplicates get a `-D<n>` suffix.
- Rows created by browser-preview "guest" users are dropped.

The whole path is exercised by `npm run test:db` against the real MVP schema.

## 6. Testing

```bash
npm run test:db     # throwaway local Postgres (or DATABASE_URL in CI): migrations twice,
                    # RLS/security, lifecycle, buyer, admin suites, legacy migration path
npm test            # unit tests incl. initData HMAC, JWT and bot message rendering
```

## 7. Business rules (where they live)

| Rule (SPEC A3) | Enforced in |
|----------------|-------------|
| Free quota: first N listings free, then fee | `submit_listing` (`listings_free_used`, `is_free`, `period_paid`) |
| Paid listings live on confirmation unless flagged | `admin_confirm_payment` → `listing_go_live` / `in_review` |
| Duration, reminders, expiry | `listing_go_live`, `run_maintenance` |
| Renewal: first free (review), then fee | `renew_listing` |
| Max active listings | `count_open_listings` in `submit_listing` / `renew_listing` |
| Boost | `create_boost_payment` + `admin_confirm_payment` |
| Price sanity & duplicate photos → moderation flags | `listing_compute_flags` |
| Unique Telebirr reference | `payments_reference_unique` index + `submit_payment_reference` |
| Contact via RPC only, rate-limited, logged | `request_contact` (+ `leads`) |
| Rejection reason codes | `moderate_listing`, `admin_reject_payment`, `admin_remove_listing` |
| Refund → listing removed, admin only | `admin_refund_payment` |
| Bans hide listings and block actions | `listings_public` view + `require_user()` |

Assumptions where the spec left room (also listed in the phase report):

1. The free quota is **lifetime** (first N listings), matching the `listings_free_used` counter.
2. Editing photos, title, description, category or specs of a live listing sends it back to
   review. Price, city, negotiable and exchange changes apply instantly (and price drops notify
   people who saved the listing).
3. Re-approval after an edit keeps the original expiry date.
4. A reference from a *rejected* payment may be reused, since it was never credited.
5. A seller without a public @username is reached through their verified phone (`tel:` link).
6. With `listing_fee_etb = 0`, every listing is free and goes through review.
