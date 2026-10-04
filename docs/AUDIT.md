# TechMarket ET — Audit of the original app (Phase 0)

Audited commit: `e4d3a08` (initial app) plus the uncommitted Phase 0 attempt.
This document records what was wrong and where each problem is addressed. It is a historical
record; see `docs/BACKEND.md` and `docs/SECURITY.md` for the current design.

## 1. Architecture as found

- Vite + React 19 + Tailwind 4, HashRouter, all routes eagerly imported into one 551 KB (154 KB gzip) chunk.
- Server state held in two React Contexts (`AuthContext`, `ProductsContext`) that download **every**
  product and **every** payment on boot and filter in the browser.
- Data access in `src/lib/api/*` writes directly to tables with the anon key.
- Database defined by ad-hoc SQL files (`schema.sql`, `schema_v2.sql`, `ALL_IN_ONE.sql`) — no ordered migrations.
- No i18n, no form validation library, no design-system folder, no tests beyond two parser tests.

## 2. Security violations (spec A9)

| # | Finding | Where | Severity | Fixed in |
|---|---------|-------|----------|----------|
| S1 | Every table has `using (true)` / `with check (true)` for `anon` on select, insert **and update**. Anyone with the public anon key can rewrite `platform_settings.telebirr_number` (redirecting all fees), make themselves admin, mark listings `active`, confirm their own payments, ban users, read all phone numbers. | `supabase/ALL_IN_ONE.sql`, `schema_v2.sql` | Critical | Phase 1 migrations |
| S2 | No authentication. Identity comes from `initDataUnsafe` and is never verified; any client can claim any `telegram_id`. | `hooks/useTelegram.ts`, `context/AuthContext.tsx` | Critical | Phase 1 `auth-telegram` + Phase 2 client |
| S3 | Admin status decided in the browser (`role` OR `admin_telegram_ids` from a world-readable row); browser user id `0` becomes admin when the admin list is empty. | `context/AuthContext.tsx` | Critical | Phase 1 `is_admin()` + RPCs |
| S4 | "Contact locked" is cosmetic: `seller_username` of every listing (any status) is shipped to every client. | `lib/api/products.ts` | High | `listings_public` view + `request_contact` RPC |
| S5 | Privileged writes are client-side, multi-step and non-atomic (insert product → insert payment → link; confirm payment → update product). Partial failures strand listings with no payment. | `context/ProductsContext.tsx` | High | Single RPCs per transition |
| S6 | Hardcoded personal data (Telebirr number, account name, admin Telegram ID) in SQL, `DEFAULT_SETTINGS`, README — and therefore in the public JS bundle and git history. | several | High | Removed in Phase 0; **values must be treated as public and rotated** |
| S7 | Images stored as base64 data URLs (up to 3 MB each) in `products.image_url`; Browse selects `*`. | `pages/AddItem.tsx` | High (cost/perf) | Storage bucket + signed uploads |
| S8 | Mock data shown in production when the fetch errors **or when there are zero active listings**. | `lib/api/products.ts` | High | Dev-only mock mode with banner |
| S9 | Payment references not unique — one Telebirr transaction can pay for unlimited listings. | schema | High | Unique normalized index |
| S10 | Phone "verification" is a free-text field. | `pages/Onboarding.tsx` | Medium | `verify-phone` Edge Function (signed `requestContact`) |
| S11 | Settings fetch failure silently falls back to hardcoded defaults (including admin ID). | `lib/api/settings.ts` | Medium | Error state, no defaults for money/admin |

## 3. Business-rule gaps (spec A3/A4)

- Status set differs from the spec (`payment_submitted`, `hidden` exist; `in_review`, `paused`, `expired`, `removed` missing). No transition enforcement — admin UI can set any status, including publishing unpaid listings.
- No free quota, moderation queue, expiry, renewal, boost, max-active limit, rejection reasons, refunds-remove-listing, banned-words filter, price sanity, rate limits or audit log.
- Roles: only `user | admin`; no `moderator`.

## 4. Tooling gaps

- `npm run typecheck` ran `tsc --noEmit` against a solution-style `tsconfig.json` (`"files": []`) — it type-checked **zero files**; `build` did the same, so no type checking happened anywhere. `strict` was off.
- `package-lock.json` out of sync with `package.json`, so `npm ci` (and therefore CI) failed before lint/tests.
- vitest 3 incompatible with vite 8; installed libraries (React Query, zod, i18n, Sentry, lucide) not used anywhere.
- ESLint disabled `no-explicit-any`; no react-hooks rules. Unquoted test glob only matched one directory level. Playwright pointed at a missing folder with `--pass-with-no-tests`.

## 5. UX / accessibility gaps (spec A7)

- `user-scalable=no, maximum-scale=1` in `index.html`.
- Text glyphs instead of icons (`⌕`, `LOCK`, `→`, `+`); hard-coded English strings everywhere.
- Single-photo sell form; no drafts; no favorites, share, report, seller profile, deep-link routing.
- No error/offline states; loading text instead of skeletons on several screens.

## 6. File mapping → target structure (A10)

| Original | Target |
|----------|--------|
| `src/App.tsx`, `src/main.tsx` | `src/app/App.tsx`, `src/app/router.tsx`, `src/app/providers.tsx` |
| `src/context/TelegramContext.tsx`, `src/hooks/useTelegram.ts` | `src/lib/telegram.ts` (+ shell hooks in `src/app/`) |
| `src/context/AuthContext.tsx`, `src/lib/api/profiles.ts`, `settings.ts` | `src/features/auth/` (session store, `useSession`) |
| `src/context/ProductsContext.tsx`, `src/lib/api/products.ts` | `src/features/listings/` (React Query hooks) |
| `src/pages/AddItem.tsx` | `src/features/sell/` (wizard) |
| `src/pages/PayListingFee.tsx`, `src/lib/api/payments.ts` | `src/features/payments/` |
| `src/pages/MyListings.tsx` | `src/features/listings/pages/MyListingsPage.tsx` |
| `src/pages/Profile.tsx`, `Onboarding.tsx` | `src/features/profile/` (incl. `/verify-phone`) |
| `src/pages/admin/*` | `src/features/admin/` (lazy chunk) |
| `src/components/ui.tsx` + small components | `src/components/ui/*` |
| `src/utils/format.ts` | `src/lib/format.ts` |
| `supabase/*.sql` | `supabase/migrations/*` + `supabase/seed.sql` |

Deviation from the Phase 0 prompt: rather than mechanically moving files that are fully replaced
in Phases 2–3, each module is rebuilt directly in its target location and the old file deleted in
the same change. The mapping above is what that rebuild follows.
