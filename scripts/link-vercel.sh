#!/usr/bin/env bash
# One-time local helper: link this repo to Vercel and print IDs to paste as GitHub secrets.
# Usage:
#   export VERCEL_TOKEN=...   # from https://vercel.com/account/tokens
#   bash scripts/link-vercel.sh

set -euo pipefail

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "Set VERCEL_TOKEN first: https://vercel.com/account/tokens"
  exit 1
fi

npm install -g vercel@latest >/dev/null

echo "Linking project (follow prompts if asked)…"
vercel link --yes --token="$VERCEL_TOKEN"

ORG=$(python3 - <<'PY'
import json
print(json.load(open(".vercel/project.json"))["orgId"])
PY
)
PROJECT=$(python3 - <<'PY'
import json
print(json.load(open(".vercel/project.json"))["projectId"])
PY
)

echo
echo "Add these GitHub secrets (repo Settings → Secrets → Actions + environment production):"
echo "  VERCEL_TOKEN=$VERCEL_TOKEN"
echo "  VERCEL_ORG_ID=$ORG"
echo "  VERCEL_PROJECT_ID=$PROJECT"

# Push env vars to Vercel production
if [[ -n "${VITE_SUPABASE_URL:-}" && -n "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  echo "Syncing VITE_* env to Vercel production…"
  printf '%s' "$VITE_SUPABASE_URL" | vercel env add VITE_SUPABASE_URL production --token="$VERCEL_TOKEN" --force || true
  printf '%s' "$VITE_SUPABASE_ANON_KEY" | vercel env add VITE_SUPABASE_ANON_KEY production --token="$VERCEL_TOKEN" --force || true
fi

echo "Done. Push to main to trigger full CI/CD."
