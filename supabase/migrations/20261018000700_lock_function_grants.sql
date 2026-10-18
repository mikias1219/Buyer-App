-- 0700 (shop) · Function permissions: explicit allowlist (SPEC A9.2).
--
-- On Supabase, newly created functions in `public` become executable by anon/authenticated
-- (platform default privileges), which `alter default privileges ... revoke` in 0200 did not
-- override. That exposed internal SECURITY DEFINER helpers (apply_movement, bootstrap_owner,
-- report_events, claim_outbox, …) through PostgREST. This migration revokes everything and
-- grants back only the client API and the Edge Function helpers.
--
-- RULE for later migrations that create functions: `create or replace` this function with the
-- new client RPCs added to v_client (or v_service), then end the migration with
-- `select public.lock_function_grants();`. supabase/tests/10_security.sql fails if any other
-- function is executable by anon or authenticated (the test DB emulates Supabase's defaults).

create or replace function public.lock_function_grants()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text[] := array[
    'get_me()', 'update_my_profile(jsonb)', 'get_settings()', 'update_settings(jsonb)',
    'list_team()', 'set_member_role(uuid,text)',
    'list_categories(boolean)', 'upsert_category(jsonb)', 'set_category_archived(uuid,boolean)',
    'create_product(jsonb)', 'update_product(uuid,jsonb)', 'set_product_status(uuid,text)',
    'delete_product(uuid)', 'list_products(jsonb,integer,integer)', 'get_product(uuid)',
    'find_product_by_code(text)', 'restock(jsonb,text,text)', 'adjust_stock(uuid,text,numeric,text)',
    'product_movements(uuid,bigint,integer)', 'low_stock(integer)',
    'record_sale(uuid,jsonb,text,numeric,text)', 'void_sale(uuid,text)',
    'return_sale_items(uuid,jsonb,text)', 'get_sale(uuid)', 'list_sales(jsonb,integer,integer)',
    'create_expense(jsonb)', 'update_expense(uuid,jsonb)', 'delete_expense(uuid)',
    'list_expenses(jsonb,integer,integer)', 'dashboard_summary(jsonb)', 'sales_trend(jsonb,text)',
    'product_performance(jsonb,text,integer)', 'category_breakdown(jsonb)',
    'payment_breakdown(jsonb)', 'cashier_breakdown(jsonb)', 'slow_movers(integer,integer)',
    'stock_summary(jsonb)', 'export_sales_lines(jsonb)'
  ];
  v_service text[] := array[
    'upsert_telegram_profile(text,text,text,text,text,text)', 'bootstrap_owner(text)',
    'can_manage_products(text)', 'claim_outbox(integer)',
    'complete_outbox(bigint,boolean,text,boolean)', 'member_role(text)'
  ];
  f record;
  s text;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.prorettype <> 'event_trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;

  foreach s in array v_client loop
    execute format('grant execute on function public.%s to authenticated', s);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach s in array v_service loop
      execute format('grant execute on function public.%s to service_role', s);
    end loop;
  end if;
end;
$$;

revoke execute on function public.lock_function_grants() from public, anon, authenticated;
select public.lock_function_grants();
