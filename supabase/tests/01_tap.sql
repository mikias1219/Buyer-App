-- Tiny assertion helpers. Every failure raises, so psql (ON_ERROR_STOP) stops the run.
create schema if not exists tap;

create or replace function tap.login(p_tg_id text)
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_tg_id, 'tg_id', p_tg_id, 'role', 'authenticated')::text, false);
$$;

create or replace function tap.logout()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '', false);
$$;

create or replace function tap.ok(p_cond boolean, p_msg text)
returns void
language plpgsql
as $$
begin
  if p_cond is not true then
    raise exception 'FAIL - %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end;
$$;

create or replace function tap.eq(p_got anyelement, p_want anyelement, p_msg text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL - % : got [%], want [%]', p_msg, p_got, p_want;
  end if;
  raise notice 'ok - %', p_msg;
end;
$$;

-- Passes when executing p_sql raises an error whose message OR sqlstate equals p_expected.
create or replace function tap.throws(p_sql text, p_expected text, p_msg text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_expected or sqlstate = p_expected then
      raise notice 'ok - %', p_msg;
      return;
    end if;
    raise exception 'FAIL - % : expected [%], got [%] %', p_msg, p_expected, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL - % : expected error [%] but the statement succeeded', p_msg, p_expected;
end;
$$;

grant usage on schema tap to anon, authenticated, service_role;
grant execute on all functions in schema tap to anon, authenticated, service_role;
