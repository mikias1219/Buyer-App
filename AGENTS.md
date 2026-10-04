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
