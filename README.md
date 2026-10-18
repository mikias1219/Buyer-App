# Shop Manager — Telegram Mini App

Run one local shop from Telegram: products, stock, sales, expenses, profit and a filterable
dashboard. English and Amharic. The behaviour is specified in [docs/SPEC.md](docs/SPEC.md); the
backend (Supabase schema, RPCs, Edge Functions, cutover) in [docs/BACKEND.md](docs/BACKEND.md).

## Roles

- **Owner**: everything, including cost, profit, reports, team and settings.
- **Staff**: record sales, see products with selling price and stock, see their own sales today.
- **No access**: anyone else who opens the bot; the owner can grant access under More → Team.

## Development

```bash
npm install
npm run dev:mock     # in-memory demo backend (switch owner/staff/no-access under More)
npm run dev          # against Supabase (needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
npm run start:tg     # production build + preview for testing inside Telegram
npm run tunnel       # HTTPS tunnel to the preview (point BotFather's menu button at it)
```

## Checks

```bash
npm run lint && npm run typecheck && npm test   # unit tests
npm run test:db                                  # migrations, roles/RLS, stock, sales, reports
npm run test:e2e                                 # Playwright against the mock build (CI)
```

## Deploy

Every push to `main` runs CI (lint, typecheck, unit, DB, e2e) and then applies migrations to the
production Supabase project, deploys the Edge Functions and the web app (Vercel). Secrets: see
`.env.example` and `.github/workflows/ci.yml`.
