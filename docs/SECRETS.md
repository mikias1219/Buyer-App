# GitHub / Vercel secrets

## Already set on GitHub (repo + `production` environment)

| Secret | Purpose |
|--------|---------|
| `VITE_SUPABASE_URL` | Frontend Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend anon JWT |
| `SUPABASE_URL` | Same URL for tooling |
| `SUPABASE_ANON_KEY` | Anon JWT for tooling |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal token (`sbp_…`) |
| `SUPABASE_PROJECT_REF` | `ysddtbbfyaealgyingiz` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (CI migrations / image move) |
| `NEXT_PUBLIC_SUPABASE_URL` | Alias for tools that expect Next naming |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

## Still needed for full auto-deploy

### 1) Database URL
From Supabase → **Project Settings → Database → Connection string → URI** (Session pooler).

```text
SUPABASE_DB_URL=postgresql://postgres.ysddtbbfyaealgyingiz:YOUR_REAL_PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
```

Do **not** leave `[YOUR-PASSWORD]` in place.

```bash
printf '%s' 'postgresql://…' | gh secret set SUPABASE_DB_URL -R mikias1219/Buyer-App
printf '%s' 'postgresql://…' | gh secret set SUPABASE_DB_URL -R mikias1219/Buyer-App --env production
```

### 2) Vercel (one-time)
1. Create token: https://vercel.com/account/tokens  
2. Locally:

```bash
export VERCEL_TOKEN=…
export VITE_SUPABASE_URL=https://ysddtbbfyaealgyingiz.supabase.co
export VITE_SUPABASE_ANON_KEY=…
bash scripts/link-vercel.sh
```

3. Paste printed `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` into GitHub secrets (and `VERCEL_TOKEN`).

After that, every push to `main` runs checks → migrations (if DB URL set) → functions → Vercel.
