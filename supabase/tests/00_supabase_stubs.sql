-- Minimal stand-ins for what a Supabase project provides, so migrations and RLS can be
-- tested on plain Postgres (locally or in CI). Not applied to real projects.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Same implementation as Supabase's auth.jwt(): claims come from the verified JWT.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Supabase grants table access to service_role by default.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Supabase makes every new function in `public` executable by anon and authenticated (platform
-- default privileges that a project's own `alter default privileges` does not cancel). Emulate
-- that so the grant lockdown is actually tested.
create or replace function public.stub_supabase_function_grants()
returns event_trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in select * from pg_event_trigger_ddl_commands()
           where object_type in ('function', 'procedure') and schema_name = 'public' loop
    execute format('grant execute on function %s to anon, authenticated', r.object_identity);
  end loop;
end;
$$;
drop event trigger if exists stub_supabase_function_grants;
create event trigger stub_supabase_function_grants on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function public.stub_supabase_function_grants();
