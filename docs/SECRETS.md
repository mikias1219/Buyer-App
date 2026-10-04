# GitHub / Vercel secrets

## Set on GitHub (repo + `production` environment)

| Secret | Purpose |
|--------|---------|
| `VITE_SUPABASE_URL` | Frontend Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend anon JWT |
| `SUPABASE_URL` | Same URL for tooling |
| `SUPABASE_ANON_KEY` | Anon JWT for tooling |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal token (`sbp_…`) |
| `SUPABASE_PROJECT_REF` | `ysddtbbfyaealgyingiz` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (CI migrations / image move) |
| `SUPABASE_DB_URL` | Session pooler URI (password URL-encoded) |
| `NEXT_PUBLIC_SUPABASE_URL` | Alias for tools that expect Next naming |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

## Still needed for CLI Vercel deploy in Actions

Vercel already deploys this repo via the GitHub integration. Optional secrets for the Actions-based `vercel deploy` step:

1. Create token: https://vercel.com/account/tokens
2. Locally:

```bash
export VERCEL_TOKEN=…
export VITE_SUPABASE_URL=https://ysddtbbfyaealgyingiz.supabase.co
export VITE_SUPABASE_ANON_KEY=…
bash scripts/link-vercel.sh
```

3. Paste printed `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` into GitHub secrets (and `VERCEL_TOKEN`).

Until those exist, CI skips the CLI Vercel step; the GitHub↔Vercel integration still publishes the site.

## Production URL

Latest GitHub deployment target (Vercel): check the latest **Production** deployment on the repo.
