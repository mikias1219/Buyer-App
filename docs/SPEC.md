# TechMarket ET — Full Redesign Spec + AI IDE Prompts

How to use this file:

1. Put **Part A (the Spec)** in your repo as `docs/SPEC.md`.
2. Put **Part B (Project Rules)** in `AGENTS.md` / `CLAUDE.md` / `.cursor/rules` (whatever your IDE reads).
3. Paste the **Phase prompts in Part C one at a time**, in order. Do not skip ahead. Each phase ends with acceptance checks; do not start the next phase until they pass.

Base project: the existing `Buyer-App` (React 19 + Vite + Tailwind 4 + Supabase, Telegram Mini App, HashRouter).

---

# PART A — THE SPEC

## A1. Product vision

TechMarket ET is the fastest, safest way to buy and sell used phones, laptops and gadgets in Ethiopia, entirely inside Telegram.

Principles:

- **Trust first.** Verified sellers, scam warnings, reports, reviews.
- **Native to Telegram.** Bot notifications, deep links, share to chats, channel auto-post, native Main/Back buttons, haptics.
- **Low friction for sellers.** First listings free, 3-step sell wizard, drafts auto-saved.
- **Safe by construction.** All privileged actions happen server-side; the client is never trusted.
- **Amharic + English** from day one.

## A2. Roles

Role
Can do

Guest/Buyer
Browse, search, filter, view listing, favorite, report, request seller contact (after phone is verified)

Seller
Everything a buyer can + create/edit/pause/renew/mark-sold listings, pay fees, boost, see listing analytics

Moderator
Review listing queue, handle reports, reject with reason

Admin
Everything + payments confirm/refund, users (ban), settings, finance, analytics

Roles live in `profiles.role` (`user | moderator | admin`) and are enforced by RLS and RPCs, never only in the UI.

## A3. Business rules (config-driven via `platform_settings`)

1. **Free quota:** each seller gets `free_listings_quota` (default 2) active listings with no fee. Free listings go through moderator review before going live.
2. **Paid fast-track:** beyond the quota, a listing needs `listing_fee_etb` (default 100). Paid listings go live after payment confirmation (no extra review unless flagged).
3. **Duration:** a live listing lasts `listing_duration_days` (default 30). Reminder at day 25 via bot. Expired listings can be renewed (free renew once, then fee again).
4. **Limits:** max `max_active_listings` (default 10) per non-shop seller.
5. **Boost (optional revenue):** `boost_price_etb` for `boost_days` (default 50 ETB / 7 days): shown at top of category + "Featured" badge.
6. **Sold:** seller marks sold; listing is hidden from browse, kept in history; buyer-side review prompt is sent.
7. **Price sanity:** warn if price < 25% or > 400% of the median for the same category+brand (soft warning to seller; moderators see a flag).
8. **Duplicate protection:** `payments.reference` is UNIQUE. Same image hash on different active listings by different sellers → flag for moderation.
9. **Contact access:** seller Telegram username is never in public tables. Buyer taps "Contact seller" → RPC `request_contact(product_id)` checks: listing active, caller phone-verified, caller not banned, rate limit (20/day) → logs a `leads` row → returns the username/deep link.
10. **Rejection:** moderator/admin must choose a reason code (`invalid_reference`, `wrong_amount`, `prohibited_item`, `bad_photos`, `misleading_price`, `duplicate`, `other`) + optional note. Seller can fix and resubmit.
11. **Refunds:** only admin; sets payment `refunded` and listing `removed`; writes audit log.
12. **Bans:** banned users cannot create listings, contact sellers, or report; their active listings are hidden.

## A4. State machines

### Listing status

```
stateDiagram-v2
    [*] --> draft
    draft --> pending_payment: submit (quota exceeded)
    draft --> in_review: submit (free quota)
    pending_payment --> payment_submitted: seller sends Telebirr reference
    payment_submitted --> active: admin confirms payment
    payment_submitted --> rejected: admin rejects payment
    in_review --> active: moderator approves
    in_review --> rejected: moderator rejects
    rejected --> draft: seller edits & resubmits
    active --> paused: seller pauses
    paused --> active: seller resumes
    active --> sold: seller marks sold
    active --> expired: expires_at passed (cron)
    expired --> pending_payment: renew (fee applies)
    expired --> in_review: renew (free quota)
    active --> removed: admin removes / refund
    sold --> [*]
    removed --> [*]
```

### Payment status

`pending → submitted → confirmed | rejected`; `confirmed → refunded`. Transitions are only performed by SECURITY DEFINER RPCs. Illegal transitions raise an error.

## A5. End-to-end user flows

### Flow 1 — First open (everyone)

1. App opens inside Telegram → `Telegram.WebApp.ready()`, `expand()`.
2. Client sends `initData` to Edge Function `auth-telegram` → receives JWT (+ profile). On failure show a full-screen retry state (never silently fall back to mock data in production).
3. If `start_param` exists (e.g. `p_<uuid>`, `c_<category>`, `s_<sellerId>`), deep-link into that screen.
4. Land on **Home**. No phone is required to browse.

### Flow 2 — Browse and buy

```
flowchart TD
  A[Home] --> B[Search / category tile / filter sheet]
  B --> C[Listing grid, infinite scroll]
  C --> D[Listing detail: gallery, specs, seller card]
  D --> E{Phone verified?}
  E -- no --> F[Request contact via Telegram button] --> G
  E -- yes --> G[Tap Contact seller]
  G --> H[Scam-safety sheet: meet in public, check IMEI, no advance payment]
  H --> I[RPC request_contact → opens t.me chat]
  D --> J[Favorite ♥]
  D --> K[Share → deep link into chats]
  D --> L[Report]
```

Home sections: search bar, category tiles with icons, "Featured", "Newest", "Near you" (by city), "Under 20,000 ETB". Filters in a bottom sheet (category, condition, city, price range, brand, specs), sort (newest, price ↑/↓), active-filter chips, server-side pagination (20 per page).

### Flow 3 — Sell (3-step wizard)

```
flowchart TD
  S0[Sell tab] --> G{Phone verified?}
  G -- no --> V[Verify phone: Telegram requestContact] --> S1
  G -- yes --> S1
  S1[Step 1 Photos: 1-8 photos, cover, tips] --> S2[Step 2 Details: category, brand, model, condition, specs, city, description]
  S2 --> S3[Step 3 Price + review preview]
  S3 --> Q{Free quota left?}
  Q -- yes --> R[Submit → in_review] --> D1[Done screen: expected review time]
  Q -- no --> P[Pay listing fee screen] --> T[Send Telebirr, paste reference] --> W[Waiting for confirmation] --> D1
```

Rules: auto-save draft after every step (`status = draft`), resume via My Listings. Images compress client-side (max 1280px, WebP ~0.8) and upload to Supabase Storage. Category-specific fields (Phone: storage, RAM, battery health, IMEI-checked, warranty; Laptop: CPU, RAM, storage, screen size, battery cycles; etc.). Flags: negotiable, exchange accepted. City = dropdown.

### Flow 4 — Manage listings (Mine tab)

Tabs: **Live · In review · Needs action · Sold · Expired · Drafts**. Per-listing actions: edit, pause/resume, mark sold, renew, boost, delete draft. Each card shows views, favorites and contact-count. "Needs action" collects rejected listings and unpaid fees with a clear CTA.

### Flow 5 — Payment (manual Telebirr, gateway-ready)

Screen shows amount, copy buttons (number, name), "Open Telebirr" link, reference input, optional screenshot. After submit: waiting state with "usually reviewed within 1 hour" and a bot notification on result. If rejected: show reason and a "Fix & resubmit" button. The payments layer is behind an interface (`PaymentProvider`) so Telebirr/Chapa/ArifPay webhooks can replace manual review later.

### Flow 6 — Notifications (bot)

Events → Telegram messages with a "Open in app" button: payment submitted (to admins), payment confirmed/rejected, listing approved/rejected, listing expiring (day 25), listing expired, new lead on your listing, listing sold → "Rate the buyer experience", price drop on a favorite. Sent from an Edge Function using the bot token (server-side only).

### Flow 7 — Moderation/Admin

Admin lives under `/admin` (route-guarded AND server-enforced):

- **Dashboard:** today's new listings, in-review count, payments waiting (with SLA badge: >1h amber, >4h red), revenue 7/30 days, conversion funnel (draft → submitted → paid → live).
- **Review queue:** swipe-through cards: photos, specs, price flag, seller trust info → Approve / Reject with reason code.
- **Payments:** queue with reference, amount, time waiting; Confirm / Reject (reason) / Refund; duplicate-reference warning.
- **Reports:** reported listings/users with reasons → dismiss / remove / ban.
- **Users:** search, ban/unban, set moderator, verified-seller toggle.
- **Settings:** fee, quota, durations, Telebirr details, support username, banned words.
- **Audit log:** every privileged action with actor, target, before/after.

## A6. Screen inventory

Route
Screen

`/`
Home

`/search`
Search + results

`/p/:id`
Listing detail

`/seller/:id`
Seller profile (rating, listings)

`/favorites`
Saved items

`/sell`
Sell wizard (`/sell/photos`, `/sell/details`, `/sell/price`, `/sell/review`)

`/pay/:id`
Pay listing fee / boost

`/mine`
My listings (tabs)

`/mine/:id/edit`
Edit listing

`/profile`
Profile + settings + language

`/verify-phone`
Phone verification

`/admin/*`
Dashboard, queue, payments, reports, users, settings, audit

Bottom nav (5 items): **Browse · Saved · Sell (center, emphasized) · Mine · Profile**. Hide the bottom nav on wizard/payment screens and use Telegram `MainButton` for the primary action and `BackButton` for back.

## A7. Design system

- **Look:** clean, modern, trustworthy. Use Telegram theme variables for backgrounds/text so dark mode works automatically; add a brand accent for actions/badges.
- **Tokens** (CSS variables in `index.css` via Tailwind `@theme`):

- Brand: `--tm-brand: #0F766E` (teal), `--tm-brand-contrast: #fff`, `--tm-accent: #F59E0B` (featured/boost), success `#16A34A`, danger `#DC2626`, warning `#D97706`.
- Surfaces: derive from `--tg-theme-bg-color`, `--tg-theme-secondary-bg-color`; text from `--tg-theme-text-color`, hint from `--tg-theme-hint-color`.
- Radius: 12 (inputs), 16 (cards), 24 (sheets). Spacing on an 8px grid. Min touch target 44×44.
- Type scale: 12 / 14 / 16 / 20 / 24 / 32, weights 400/600/700. Numbers use tabular-nums. Prices always formatted `ETB 25,000`.
- **Components to build** (in `src/components/ui/`): Button (primary/secondary/ghost/danger, loading), IconButton, Input, Select, Textarea, NumberInput (thousands format), Chip, Badge, Card, Skeleton, EmptyState, ErrorState, Toast, BottomSheet, Tabs, Stepper, ImageGallery (swipe), ImageUploader (multi, reorder, cover), Rating, VerifiedBadge, PriceTag, ListingCard, ListingRow, FilterSheet.
- **Icons:** `lucide-react` (no emoji/text glyphs).
- **Motion:** 150–250ms transitions, skeletons for loading, subtle press scale, haptic feedback on key actions (`impactOccurred('light')`, `notificationOccurred('success'|'error')`).
- **Accessibility:** contrast AA, labels on inputs, focus rings, remove `user-scalable=no`/`maximum-scale=1`, respect reduced motion.
- **States for every screen:** loading (skeleton), empty (helpful CTA), error (retry), offline.

## A8. Data model (target Postgres schema)

Key changes from the current schema: contact data moved off `products`, images in Storage, new tables, status checks, RLS based on JWT claim `tg_id`.

```
-- profiles: telegram_id text PK, username, first_name, phone, phone_verified bool, city,
--           role ('user','moderator','admin'), is_banned, is_verified_seller, language ('en','am'),
--           listings_free_used int, created_at, updated_at

-- products: id uuid PK, seller_id text FK profiles, title, description, price numeric,
--           category, brand, model, condition, city, specs jsonb, negotiable bool, exchange bool,
--           status (see state machine), reject_reason text, reject_note text,
--           expires_at, boosted_until, views int, created_at, updated_at, published_at

-- product_images: id, product_id FK, path text (Storage), position int, is_cover bool, hash text

-- payments: id, telegram_id FK, product_id FK, kind ('listing','boost','renew'), amount_etb,
--           method, reference text (normalized; UNIQUE when not empty), screenshot_path, status,
--           reject_reason, admin_note, reviewed_by, reviewed_at, created_at

-- favorites: telegram_id, product_id, created_at, PK(telegram_id, product_id)
-- leads: id, product_id, buyer_id, seller_id, created_at   (contact requests)
-- reports: id, reporter_id, target_type ('product','user'), target_id, reason, note, status, resolved_by
-- reviews: id, seller_id, reviewer_id, product_id, rating 1-5, comment, created_at, UNIQUE(reviewer_id, product_id)
-- notifications_outbox: id, telegram_id, kind, payload jsonb, sent_at, error
-- audit_log: id, actor_id, action, target_type, target_id, before jsonb, after jsonb, created_at
-- platform_settings: single row; fee, quotas, durations, boost price, telebirr details, support username, banned_words text[]
```

Views / RPCs (all SECURITY DEFINER with explicit role checks, `set search_path = public`):

- View `listings_public` (active only; no seller contact; includes cover image URL, seller display name, verified flag, rating).
- `create_listing(draft jsonb)`, `submit_listing(id)` (decides `in_review` vs `pending_payment` by quota), `edit_listing`, `set_listing_status(id, status)` (owner-allowed transitions only), `renew_listing(id)`.
- `submit_payment_reference(payment_id, reference)`; `admin_confirm_payment(id)`, `admin_reject_payment(id, reason, note)`, `admin_refund_payment(id)`; `moderate_listing(id, approve, reason, note)`.
- `request_contact(product_id)` → returns Telegram link + inserts lead (rate-limited).
- `toggle_favorite(product_id)`, `register_view(product_id)`, `submit_report(...)`, `submit_review(...)`.
- Cron (pg_cron or scheduled Edge Function): expire listings, send day-25 reminders, un-boost.

## A9. Security architecture

1. **Auth:** Edge Function `auth-telegram` validates `initData` with HMAC-SHA256 (secret = HMAC("WebAppData", BOT_TOKEN)), checks `auth_date` freshness (≤ 24h), upserts profile, returns a JWT signed with the project JWT secret containing `sub`, `role: 'authenticated'`, `tg_id`. The client builds the Supabase client with `Authorization: Bearer <jwt>` and refreshes on expiry.
2. **RLS:** enable on all tables; no `using (true)` on writes. Reads: public only through `listings_public`/`product_images` for active listings; owners read own rows; admins/moderators via `is_staff()` function that reads `profiles.role` from the DB (never from a client-controlled value).
3. **No client-side privileged writes.** Status changes, payment confirmation, bans and settings edits go through RPCs/Edge Functions that re-check role and legal transitions, and write `audit_log`.
4. **Secrets:** bot token, service role key, JWT secret only in Edge Function env. Remove hardcoded personal IDs/phone/name from SQL and `DEFAULT_SETTINGS`; everything comes from `platform_settings`/env.
5. **Storage:** bucket `listing-images` public-read, write only via signed upload URLs issued by an RPC/Edge Function for the owner; enforce size/type limits.
6. **Rate limits:** contact requests, listing creation, reports, payment submissions.
7. **Input safety:** zod validation on the client and `check` constraints in the DB; sanitize text; banned-words filter on submit.
8. **Dev mock mode** only when `import.meta.env.DEV && !isSupabaseConfigured`, clearly bannered; production never falls back to mock data.

## A10. Tech stack and structure

- Keep: React 19, Vite, Tailwind 4, TypeScript, Supabase.
- Add: `@tanstack/react-query`, `react-hook-form` + `zod`, `lucide-react`, `i18next` + `react-i18next`, `browser-image-compression` (or canvas resize), `vitest` + `@testing-library/react`, `playwright`, `@sentry/react`.
- Backend: Supabase migrations in `supabase/migrations/`, Edge Functions in `supabase/functions/` (`auth-telegram`, `bot-webhook`, `notify`, `cron-expire`).
- Suggested structure:

```
src/
  app/            router, providers, query client
  features/
    auth/ listings/ sell/ payments/ favorites/ profile/ admin/ reports/ reviews/
      api/ hooks/ components/ pages/ schema.ts
  components/ui/  design system
  lib/            telegram.ts, supabase.ts, i18n/, format.ts, analytics.ts
  locales/        en.json, am.json
supabase/
  migrations/ functions/ seed.sql
```

## A11. Definition of done (whole project)

- A user cannot read or modify anything they don't own using the public anon key (verified with an RLS test script).
- Whole flow works inside real Telegram: open → browse → deep link → sell → pay → admin confirm → bot message → live → contact → sold.
- No mock data in production builds; every screen has loading/empty/error states.
- Lint, typecheck, unit tests, and e2e happy-path pass in CI.
- English and Amharic strings complete; no hardcoded UI text.

---

# PART B — PROJECT RULES (paste into AGENTS.md / CLAUDE.md / .cursor rules)

```
You are working on TechMarket ET, a Telegram Mini App marketplace for used tech in Ethiopia.
The full product spec is in docs/SPEC.md. Treat it as the source of truth.

Rules:
1. Work in the phases I give you, one at a time. Do not start work from a later phase.
2. Before coding a phase: read docs/SPEC.md and the relevant existing files, then write a short plan (files to add/change, migrations, risks), state it, then proceed.
3. Never trust the client. Privileged actions (confirm payment, change listing status, ban, edit settings) must be implemented as SECURITY DEFINER RPCs or Edge Functions that verify the caller's role from the database and enforce legal state transitions.
4. Never put secrets (bot token, service role key, JWT secret) in client code or committed files. Use env vars; update .env.example with names only.
5. No hardcoded personal data (admin IDs, phone numbers, names). Read from platform_settings or env.
6. TypeScript strict. No `any` unless justified in a comment. Validate all forms with zod.
7. Use the design system components in src/components/ui; no ad-hoc one-off styling for things the system covers. Use lucide-react icons, never emoji/text glyphs.
8. Every screen must implement loading (skeleton), empty, error (with retry) and offline states.
9. All user-facing text goes through i18n (en + am). No hardcoded strings in JSX.
10. Use TanStack Query for server state. Do not add new React Context for server data.
11. Write database changes only as new files in supabase/migrations/ (idempotent where reasonable). Never edit old migrations after they are applied.
12. Add or update tests for business rules (status transitions, quota logic, RLS). Run typecheck, lint and tests before declaring a phase done.
13. At the end of each phase, output: what changed, how to run/verify it, acceptance checklist results, and any open questions or assumptions. If something in the spec is ambiguous or conflicts with the code, state your assumption explicitly instead of silently choosing.
14. Keep commits small and logically grouped; do not rewrite unrelated files.
```

---

# PART C — PHASE PROMPTS (paste one at a time)

## Phase 0 — Audit and foundations

```
Read docs/SPEC.md fully, then audit the current repo.

Tasks:
1. Produce docs/AUDIT.md: current architecture, every place that violates the spec's security rules (open RLS policies, client-side admin checks, base64 images in DB, hardcoded personal data, non-atomic multi-step writes, mock fallbacks in prod paths), and a mapping of existing files → target structure from section A10.
2. Restructure the project to the A10 folder layout WITHOUT changing behavior yet: move files, fix imports, keep the app running.
3. Install and configure: @tanstack/react-query, react-hook-form, zod, @hookform/resolvers, lucide-react, i18next, react-i18next, vitest, @testing-library/react, playwright, @sentry/react (Sentry optional via env DSN).
4. Add scripts: typecheck, lint, test, test:e2e. Update the GitHub Actions workflow to run lint + typecheck + test + build.
5. Create src/lib/telegram.ts: a typed wrapper around Telegram.WebApp (ready/expand, theme sync, MainButton, BackButton, HapticFeedback, CloudStorage, showConfirm, openTelegramLink, requestContact, start_param parsing) with safe no-op fallbacks in a normal browser.
6. Remove hardcoded personal data from the code and SQL samples (replace with env/settings lookups; keep .env.example names only).

Acceptance: app builds and runs exactly as before; `npm run typecheck && npm run lint && npm test && npm run build` all pass; docs/AUDIT.md exists.
```

## Phase 1 — Secure backend (database, auth, RPCs)

```
Implement the secure backend from SPEC sections A3, A4, A8, A9.

Tasks:
1. Create supabase/migrations/ with a clean, ordered set of migrations that create the target schema from A8 (profiles, products, product_images, payments, favorites, leads, reports, reviews, notifications_outbox, audit_log, platform_settings) with check constraints, indexes ((status, created_at), (seller_id), (category), city), updated_at triggers, and UNIQUE on payments.reference (case-insensitive, normalized/trimmed). Include a data-migration script from the old tables (products.seller_username → profiles; image_url base64 → flagged for re-upload).
2. Create helper SQL functions: current_tg_id() (from auth.jwt()->>'tg_id'), is_staff(), is_admin() — reading roles from profiles, SECURITY DEFINER, search_path set.
3. Write strict RLS for every table (no `using (true)` on writes; public reads only via the listings_public view for active listings; owners read/write own drafts; staff via helper functions). Create the listings_public view WITHOUT any seller contact fields.
4. Implement all RPCs listed in A8 as SECURITY DEFINER functions with explicit authorization checks and legal state-transition enforcement per A4. Each privileged RPC writes audit_log. Implement quota logic (free quota vs paid), listing duration/expiry, contact request with rate limit + leads insert, price-sanity flag.
5. Create Supabase Edge Function `auth-telegram`: validate initData HMAC per Telegram docs, reject stale auth_date (>24h), upsert profile (first/username), return a signed JWT (claims: sub, role=authenticated, tg_id) + profile + settings. Add unit tests for the HMAC validation with known-good and tampered vectors.
6. Create Storage bucket `listing-images` policies and an RPC/Edge Function that issues signed upload URLs only for the listing owner, with size/type limits.
7. Write supabase/tests/rls.sql (or a Vitest integration test) proving: anon cannot insert/update/delete anything; a user cannot read another user's drafts or payments; a user cannot confirm payments, change settings, or set status 'active'; request_contact fails for non-active listings and banned users; illegal state transitions fail.
8. Write docs/BACKEND.md with setup steps (env vars, deploy functions, how to make the first admin through a one-time SQL statement using an env-provided ID, never hardcoded).

Acceptance: running migrations on an empty Supabase project works; RLS test suite passes; no seller contact data is selectable by anon; documented setup works end to end.
```

## Phase 2 — Client data layer and auth

```
Replace the client data layer to use the secure backend. Keep the UI looking the same for now.

Tasks:
1. Implement src/features/auth: on boot call auth-telegram with Telegram initData, store JWT in memory (not localStorage), create the Supabase client with the bearer token, auto-refresh before expiry. Expose useSession() with profile, role flags (derived from server data), and settings.
2. Replace ProductsContext/AuthContext server-state logic with TanStack Query hooks per feature: useListings (server-side filters, sort, cursor pagination 20/page, infinite scroll), useListing(id), useMyListings(tab), useFavorites, usePayments(mine), admin queues. Use optimistic updates for favorites and status changes.
3. Convert all writes to call the RPCs from Phase 1 (create_listing, submit_listing, submit_payment_reference, set_listing_status, etc.). Remove direct table updates and the multi-step non-atomic writes.
4. Image handling: client-side compress/resize (max 1280px, WebP), upload to Storage through signed URLs, store only paths. Update rendering to use Storage URLs (with width/quality transforms where supported).
5. Remove the localStorage mock layer from production code paths. Keep an optional dev-only mock mode behind `import.meta.env.DEV && !isSupabaseConfigured` with a visible banner. In production, failed fetches show ErrorState with retry — never fake data.
6. Add zod schemas per feature (schema.ts) shared by forms and API input validation.
7. Add Vitest tests for query hooks (mock RPC layer), schemas, and the quota/status helper logic mirrored on the client.

Acceptance: the existing screens work against the secure backend; opening devtools and using the anon key alone cannot read contacts or mutate others' data; typecheck/lint/tests/build pass.
```

## Phase 3 — Design system and app shell

```
Build the design system from SPEC A7 and the new app shell.

Tasks:
1. Add tokens to index.css (@theme) as specified, deriving surfaces/text from Telegram theme variables with sensible fallbacks, plus brand/accent/success/danger/warning. Support light and dark.
2. Build all components in src/components/ui listed in A7 (Button, IconButton, Input, Select, Textarea, NumberInput, Chip, Badge, Card, Skeleton, EmptyState, ErrorState, Toast, BottomSheet, Tabs, Stepper, ImageGallery, ImageUploader, Rating, VerifiedBadge, PriceTag, ListingCard, ListingRow, FilterSheet). Each with variants, loading/disabled states, a11y attributes, 44px min touch targets. Add a dev-only /ui route (a simple gallery page) rendering every component in all states.
3. App shell: new router (keep HashRouter) with the routes from A6, lazy-loaded route chunks (admin in its own chunk), 5-item bottom nav (Browse, Saved, Sell center emphasized, Mine, Profile) that hides on wizard/payment/admin screens, Telegram BackButton wired to router history, global Toast provider, global ErrorBoundary (reports to Sentry if configured), offline banner.
4. i18n: set up i18next with en.json and am.json, language switcher in Profile, persisted via Telegram CloudStorage + profile.language. Provide the shell/nav/common strings in both languages.
5. Remove user-scalable=no / maximum-scale=1 from index.html; add reduced-motion handling; ensure AA contrast for badges/buttons in both themes.

Acceptance: /ui gallery shows every component in light and dark; app shell navigates all routes (placeholders allowed); Lighthouse accessibility ≥ 90 on the shell; tests/lint/build pass.
```

## Phase 4 — Buyer experience

```
Implement the buyer flow (SPEC Flow 1 and 2).

Tasks:
1. Home: search bar, category tiles with icons, "Featured" (boosted), "Newest", "Near you" (profile city), "Under 20,000 ETB" rails; infinite-scroll grid; skeletons; pull-to-refresh style refetch; empty/error states.
2. Search & Filters: dedicated /search with debounced query using Postgres full-text/trigram search (add migration with pg_trgm + GIN index and a search RPC), FilterSheet (category, condition, city dropdown, price range, brand, category-specific spec filters), sort control, active-filter chips, result count, persist last filters in CloudStorage.
3. Listing detail (/p/:id): swipeable ImageGallery with fullscreen, price + negotiable/exchange badges, spec table from specs jsonb, condition, city, posted/expiry info, seller card (name, verified badge, rating, member since, "other listings"), favorite button, share button (Telegram share link with startapp=p_<id>), report sheet. Call register_view once per session per listing.
4. Contact flow: if phone not verified, prompt to verify via Telegram requestContact (/verify-phone, saves phone_verified=true through the backend). Then "Contact seller" opens the scam-safety BottomSheet (meet in public, check IMEI, never pay in advance, checkbox "I understand") → request_contact RPC → open t.me link via openTelegramLink. Handle rate-limit and banned errors with clear messages. Handle sellers without username (offer bot-relay message path as stated in the spec if implemented, otherwise a friendly explanation).
5. Favorites (/favorites) with optimistic toggle; Seller profile (/seller/:id) with active listings and reviews.
6. Deep links: parse start_param (p_<id>, c_<category>, s_<sellerId>) on boot and route accordingly.
7. All text via i18n (en + am).

Acceptance: a buyer can find, filter, view, favorite, share and contact a seller end to end in Telegram; anon cannot see seller usernames in any network response except via request_contact; pagination is server-side (verify network payload size); tests/lint/build pass; add Playwright e2e for browse → detail → favorite.
```

## Phase 5 — Seller experience (wizard, payments, my listings)

```
Implement the seller flow (SPEC Flow 3, 4, 5).

Tasks:
1. Sell wizard (/sell/photos → /sell/details → /sell/price → /sell/review) using react-hook-form + zod, Stepper UI, Telegram MainButton as the primary action and BackButton for back; hide bottom nav. Auto-save a draft on each step via RPC (resume from Mine → Drafts).
   - Photos: ImageUploader with 1–8 photos, reorder, set cover, tips ("show the screen on, show the IMEI"), compression, upload progress, retry.
   - Details: category-first, then category-specific fields from a config (src/features/sell/categoryFields.ts) stored into specs jsonb; brand/model; condition; city dropdown (Addis Ababa, Adama, Hawassa, Bahir Dar, Mekelle, Dire Dawa, Gondar, Jimma, etc.); description with counter; negotiable and exchange toggles; banned-words check.
   - Price: NumberInput with thousands formatting, market-price hint (median of similar active listings via RPC) and soft warning when out of range.
   - Review: live preview using ListingCard + detail layout; shows whether this listing is free (quota) or needs the fee.
   - Submit via submit_listing → routes to Done screen (free: in_review with expected review time) or Pay screen (paid).
2. Phone verification gate: reuse /verify-phone before the first submission.
3. Pay screen (/pay/:id): amount, copy buttons, "Open Telebirr" link, reference input (validated, normalized), optional screenshot upload, SLA text, waiting state with realtime status (Supabase realtime or polling), rejected state showing reason code (localized) with "Fix & resubmit". Implement a PaymentProvider interface with a ManualTelebirrProvider so a gateway can be added later without UI changes. Support kinds: listing, renew, boost.
4. My Listings (/mine): tabs Live / In review / Needs action / Sold / Expired / Drafts with counts; per-card actions: Edit (/mine/:id/edit re-using wizard components, re-review rules from the spec), Pause/Resume, Mark sold (with confirm via showConfirm + haptics), Renew, Boost (pay flow), Delete draft; show views, favorites and contacts counts.
5. Seller notifications are handled in Phase 6; leave hooks (call notify RPC/outbox insert) where events occur.
6. i18n for all strings (en + am); unit tests for category field schemas, quota decisions, and wizard validation; Playwright e2e: sell (free) → in_review, sell (paid) → pay → submitted.

Acceptance: a seller can create a listing end to end with multiple photos; drafts resume; free vs paid path follows the quota; rejected payments can be fixed and resubmitted; all status changes go through RPCs; tests/lint/build pass.
```

## Phase 6 — Telegram bot, notifications, growth

```
Implement bot-driven features (SPEC Flow 6) and growth features.

Tasks:
1. Edge Function `bot-webhook`: handles /start (with deep-link payloads), /help, /mylistings (inline button opening the Mini App), and inline queries (@bot <text> returns top matching active listings with "Open in app" buttons). Verify the Telegram secret_token header. Document how to set the webhook and menu button in docs/BOT.md.
2. Edge Function `notify` that drains notifications_outbox with retries/backoff and marks sent_at/error. Triggers (DB triggers or RPC side effects insert into outbox) for: payment submitted (to admins), payment confirmed/rejected (to seller, with reason), listing approved/rejected, new lead (to seller), listing expiring (day 25), listing expired, favorite price drop, listing sold → review request to recent leads. Messages are localized by profile.language and include an "Open in app" web_app button deep-linking to the exact screen.
3. Scheduled job (pg_cron or scheduled Edge Function): expire listings, send reminders, end boosts, retry failed notifications.
4. Channel auto-post: when a listing becomes active (and is not a duplicate), post cover photo + title + price + city + "View in app" deep link button to a configured channel (platform_settings.channel_id). Make it a toggle in admin settings.
5. Share: ensure share buttons produce t.me/<bot>/<app>?startapp=p_<id> links with a good preview text.
6. Reviews: after sold, buyers who had a lead get a bot prompt to rate 1–5; implement submit_review and show rating on seller cards.

Acceptance: end-to-end in real Telegram: submit payment → admins get a bot message with a button → confirm → seller receives "live" message → channel post appears → buyer opens deep link → contact → seller gets lead notification. Failures retry and are visible in the outbox table. Docs written; tests for outbox draining and message localization pass.
```

## Phase 7 — Admin and moderation

```
Rebuild the admin area (SPEC Flow 7). Every screen must be backed by RPCs/RLS from Phase 1; hiding UI is not enough.

Tasks:
1. Admin shell (/admin/*) with its own lazy chunk, role-guarded in UI and enforced server-side. Moderators see only the queue/reports; admins see everything.
2. Dashboard: new listings today, in-review count, payments waiting with SLA badges (>1h amber, >4h red), revenue 7/30 days (confirmed − refunded), funnel (draft → submitted → paid → live), top categories; simple charts (lightweight library or SVG).
3. Review queue: card-by-card mode with photos, specs, price-sanity flag, seller trust info (verified, past rejections, ratings); Approve / Reject with reason code + note; keyboard-less, thumb-friendly; undo within 10 seconds where possible.
4. Payments: filters (waiting/confirmed/rejected/refunded), search by reference/seller, duplicate-reference warning, Confirm / Reject (reason code) / Refund (with confirm), shows time waiting and listing preview inline.
5. Reports: queue with reasons; actions dismiss / remove listing / warn / ban user.
6. Users: search, role change (admin only), ban/unban with reason, verified-seller toggle, user detail (listings, payments, reports).
7. Settings: fee, free quota, duration, max active listings, boost price/days, Telebirr details, support username, channel id and auto-post toggle, banned words. All changes written to audit_log.
8. Audit log viewer with filters (actor, action, target, date).
9. Tests: RPC authorization (moderator cannot confirm payments; user cannot call admin RPCs), UI guards, and Playwright e2e for confirm/reject flows.

Acceptance: admin tasks are doable one-handed on a phone; unauthorized users get server-side errors, not just hidden buttons; every privileged action appears in audit_log.
```

## Phase 8 — Quality, performance, launch

```
Prepare for production.

Tasks:
1. Performance: route-level code splitting verified, image transforms/lazy loading, list virtualization if needed, bundle analysis (target initial JS < 200 KB gzip), React Query cache tuning, avoid refetch storms.
2. Reliability: global error handling, Sentry wired for client and Edge Functions, offline and slow-network states, idempotent RPCs for payment submission, retries with backoff in the client where safe.
3. Analytics: lightweight event tracking (privacy-friendly; no PII) for the funnel: view_listing, favorite, contact_click, sell_start, sell_step, submit, payment_submit, approved. Wire into the admin funnel dashboard.
4. Security review: re-run the RLS test suite, check no secrets in the repo/bundle (grep), confirm CORS and rate limits on Edge Functions, confirm Storage policies, run a dependency audit. Write docs/SECURITY.md summarizing the model and how to rotate keys.
5. Test coverage: Vitest for business rules ≥ 80% on features/*/logic, Playwright happy paths: buy flow, sell free flow, sell paid flow, admin confirm, admin reject-and-resubmit.
6. Delivery: CI runs lint + typecheck + unit + e2e (against a local Supabase or mocked layer) + build; Vercel preview deploys per PR; environment variable checklist in README; update README with the new architecture, flows, scripts, and setup (replace the old README sections).
7. Launch checklist in docs/LAUNCH.md: BotFather setup (menu button, commands, webhook secret), channel creation, first admin creation, seed settings, smoke-test script to run in real Telegram on iOS, Android and Desktop.

Acceptance: CI green; all checklists pass; docs complete; a fresh clone + documented setup produces a working environment.
```

---

# PART D — Tips for getting good results from the AI IDE

- **One phase per session.** Start a fresh chat for each phase, with the Rules file active and `docs/SPEC.md` open. Long mixed chats drift.
- **Review migrations by hand** before running them on a real Supabase project, especially RLS and RPCs. Run Phase 1's RLS tests yourself.
- **Never paste real secrets into the IDE chat.** Put the bot token and service role key only in Supabase function secrets and local `.env` (git-ignored).
- **Rotate anything that was ever committed.** The existing repo contains a real Telegram ID, phone number and name in SQL and defaults, so treat those as public and change the Telebirr account/admin setup accordingly.
- **Test in real Telegram early** (iOS, Android and Desktop). The WebView differs from a browser, especially for file inputs, safe areas and `MainButton`.
- If the AI produces something that contradicts the spec, tell it which section it violates and ask it to fix it rather than re-prompting from scratch.