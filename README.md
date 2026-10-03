# TechMarket ET — Telegram Mini App

Used-tech marketplace for Ethiopia: Telegram login + phone profile, listing fees (Telebirr), browse/filters, my listings, and an in-app admin dashboard.

## Features

- Telegram identity + required phone onboarding
- Browse with search, category, condition, brand, city, price filters
- Sell flow → listing fee payment (Telebirr reference) → admin confirm → live
- My listings with status chips
- Admin: users, products, payments, finance (income / loss), settings
- Mock data fallback when Supabase is not configured

## Quick start

```bash
npm install
npm run dev          # browser preview only
npm run start:tg     # production build for Telegram (recommended)
npm run tunnel       # Cloudflare HTTPS tunnel → http://127.0.0.1:5173
```

Point BotFather **Menu Button** at the tunnel HTTPS URL.

## Supabase setup

1. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor.
2. Run [`supabase/schema_v2.sql`](supabase/schema_v2.sql) (profiles, payments, settings, product status).
3. Copy `.env.example` → `.env` with your project URL + **anon** key.
4. Make yourself admin (use Telegram ID from **Profile** in the app):

```sql
update public.platform_settings
set
  admin_telegram_ids = array['YOUR_TELEGRAM_NUMERIC_ID'],
  telebirr_number = '0922578745',
  telebirr_name = 'Mikias Abate',
  listing_fee_etb = 100
where id = 1;
```

Or run [`supabase/seed_telebirr.sql`](supabase/seed_telebirr.sql) for Telebirr only.

5. Restart the app. Open Profile → **Open Admin Dashboard**.

## Business rules

| Rule | Behavior |
|------|----------|
| Auth | Telegram user + phone required to sell |
| Revenue | Fixed listing fee (default 100 ETB) |
| Payment | Manual Telebirr; seller submits reference |
| Go live | Admin confirms payment → listing `active` |
| Income | Sum of confirmed fees; refunds count as loss |

## Project structure

```
src/
  components/   Layout, nav, cards, gates, status chips
  context/      Telegram, Auth, Products
  lib/api/      profiles, products, payments, settings
  pages/        Home, Sell, Pay, MyListings, Profile, Onboarding
  pages/admin/  Overview, Payments, Products, Users, Finance, Settings
supabase/
  schema.sql
  schema_v2.sql
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite HMR (browser) |
| `npm run start:tg` | Build + preview on :5173 for Telegram |
| `npm run tunnel` | Cloudflare quick tunnel |
| `npm run build` | Production build only |

## GitHub + Vercel CI/CD

Repo: [mikias1219/Buyer-App](https://github.com/mikias1219/Buyer-App)

### 1) Push
```bash
git push -u origin main
```

### 2) Deploy on Vercel (recommended CI/CD)
1. Open [vercel.com/new](https://vercel.com/new)
2. Import **mikias1219/Buyer-App**
3. Framework: Vite (auto from `vercel.json`)
4. Add Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

Every push to `main` then auto-deploys. GitHub Actions also runs `npm run build` on push/PR (`.github/workflows/ci.yml`).

### 3) Optional Actions deploy
Add repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` for `.github/workflows/deploy-vercel.yml`.

### 4) Telegram Menu Button
Set BotFather Web App URL to your Vercel URL, e.g. `https://buyer-app.vercel.app`
