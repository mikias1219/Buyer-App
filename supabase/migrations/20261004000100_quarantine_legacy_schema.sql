-- 0100 · Move the pre-release MVP tables out of the public API.
--
-- The MVP created public.products/profiles/payments/platform_settings with
-- `using (true)` policies for anon. If that shape is detected (products.image_url),
-- the tables are moved to a private `legacy` schema (not exposed by PostgREST),
-- their open policies are dropped, and the old helper is removed. Data can be
-- copied into the new schema with supabase/scripts/migrate_legacy.sql.
-- On a fresh project this migration is a no-op.

create schema if not exists legacy;
revoke all on schema legacy from public;

do $$
declare
  t text;
  pol record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'image_url'
  ) then
    foreach t in array array['payments', 'products', 'profiles', 'platform_settings'] loop
      if to_regclass('public.' || t) is not null then
        for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
          execute format('drop policy if exists %I on public.%I', pol.policyname, t);
        end loop;
        execute format('alter table public.%I set schema legacy', t);
        execute format('revoke all on legacy.%I from anon, authenticated', t);
      end if;
    end loop;
    drop function if exists public.is_platform_admin(text);
  end if;
end $$;
