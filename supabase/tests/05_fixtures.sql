-- Users created exactly as production does: service_role calls the account functions
-- used by the auth-telegram Edge Function.
set role service_role;
select public.upsert_telegram_profile('9001', 'boss', 'Dawit', '', '', 'en');
select tap.eq(public.bootstrap_owner('9001'), true, 'first owner can be bootstrapped');
select public.upsert_telegram_profile('9002', 'other', 'Eden', '', '', 'en');
select tap.eq(public.bootstrap_owner('9002'), false, 'bootstrap is a no-op once an owner exists');
select public.upsert_telegram_profile('1001', 'cashier', 'Abel', '', '', 'am');
select public.upsert_telegram_profile('1002', 'stranger', 'Bethel', '', '', 'en');
reset role;

select tap.eq((select count(*)::int from public.notifications_outbox
               where kind = 'access_request' and chat_id = '9001'), 3,
              'owner is told about each new user asking for access');

-- Run a statement as a signed-in Telegram user through the client role.
create or replace function tap.as_user(p_tg_id text)
returns void
language plpgsql
as $$
begin
  perform tap.login(p_tg_id);
  execute 'set role authenticated';
end;
$$;
grant execute on function tap.as_user(text) to authenticated, service_role;

select public_id as staff_pid from public.profiles where telegram_id = '1001' \gset
select tap.as_user('9001');
select public.set_member_role(:'staff_pid', 'staff');
select public.update_settings('{"shop_name": "Test Shop"}');
reset role;
select tap.eq((select role from public.profiles where telegram_id = '1001'), 'staff', 'owner granted staff');
select tap.eq((select shop_name from public.shop_settings), 'Test Shop', 'owner updated settings');

-- Products used by later suites (owner).
select id as cat_phones from public.categories where name = 'Phones' \gset
select id as cat_acc from public.categories where name = 'Accessories' \gset
select tap.as_user('9001');
select (public.create_product(jsonb_build_object(
  'name', 'Charger 20W', 'category_id', :'cat_acc', 'sku', 'CHG-20', 'unit', 'piece',
  'sell_price', 150, 'cost_price', 100, 'opening_stock', 10, 'reorder_level', 3)) ->> 'id') as p_charger \gset
select (public.create_product(jsonb_build_object(
  'name', 'Phone case', 'category_id', :'cat_acc', 'unit', 'piece',
  'sell_price', 200, 'cost_price', 80, 'opening_stock', 5)) ->> 'id') as p_case \gset
select (public.create_product(jsonb_build_object(
  'name', 'Tecno Spark 20', 'category_id', :'cat_phones', 'unit', 'piece',
  'sell_price', 9000, 'cost_price', 7500, 'opening_stock', 3)) ->> 'id') as p_phone \gset
select (public.create_product(jsonb_build_object(
  'name', 'Copper wire', 'unit', 'metre', 'sell_price', 40.5, 'cost_price', 25, 'opening_stock', 100.5)) ->> 'id') as p_wire \gset
reset role;

create table tap.ids (k text primary key, v text not null);
insert into tap.ids values ('charger', :'p_charger'), ('case', :'p_case'), ('phone', :'p_phone'),
  ('wire', :'p_wire'), ('cat_acc', :'cat_acc'), ('cat_phones', :'cat_phones'), ('staff_pid', :'staff_pid');
grant usage on schema tap to authenticated;
grant select on tap.ids to authenticated;

create or replace function tap.id(p_k text) returns uuid language sql stable as $$ select v::uuid from tap.ids where k = p_k $$;
grant execute on function tap.id(text) to authenticated;

-- Ledger invariant (A3.1): cached stock equals the sum of movements for every product.
create or replace function tap.ledger_ok() returns boolean language sql stable as $$
  select not exists (
    select 1 from public.products p
    where p.stock_qty <> coalesce((select sum(m.qty_delta) from public.stock_movements m where m.product_id = p.id), 0)
  );
$$;
