-- Roles, RLS and grants (SPEC A2, A9).

-- ─── Direct table access is impossible for clients ──────────────────
set role anon;
select tap.throws('select * from public.products', '42501', 'anon cannot read products');
select tap.throws('select public.get_me()', '42501', 'anon cannot call RPCs');
reset role;

select tap.as_user('9001');
select tap.throws('select * from public.sales', '42501', 'even the owner cannot read tables directly');
select tap.throws('update public.products set stock_qty = 999', '42501', 'no direct stock edits');
select tap.throws($$insert into public.stock_movements (product_id, type, qty_delta, stock_after)
                    values (tap.id('charger'), 'purchase', 5, 15)$$, '42501', 'no direct ledger writes');
select tap.throws($$select public.upsert_telegram_profile('1', '', '', '', '', 'en')$$, '42501',
                  'service-only functions are not callable by clients');
select tap.throws($$select public.bootstrap_owner('1002')$$, '42501', 'clients cannot bootstrap owners');
reset role;

-- ─── user role: signed in, no shop access ───────────────────────────
select tap.as_user('1002');
select tap.eq(public.get_me() ->> 'role', 'user', 'get_me works for users without access');
select tap.ok(not (public.get_me() -> 'settings' ? 'allow_negative_stock'), 'users see no shop settings');
select tap.throws('select public.list_products()', 'no_access', 'user cannot list products');
select tap.throws($$select public.record_sale(gen_random_uuid(),
                    jsonb_build_array(jsonb_build_object('product_id', tap.id('charger'), 'qty', 1)), 'cash')$$,
                  'no_access', 'user cannot sell');
select tap.throws('select public.dashboard_summary()', 'no_access', 'user cannot read reports');
reset role;

-- Unknown caller
select tap.login('424242');
set role authenticated;
select tap.throws('select public.get_me()', 'not_authenticated', 'unknown Telegram id is rejected');
reset role;
select tap.logout();

-- ─── staff: sell + see stock, never cost/profit ─────────────────────
select tap.as_user('1001');
select tap.ok(not exists (
  select 1 from jsonb_array_elements(public.list_products() -> 'items') i
  where i ? 'avg_cost' or i ? 'margin' or i ? 'stock_value_cost'),
  'staff product list has no cost fields');
select tap.ok(not (public.get_product(tap.id('charger')) ? 'avg_cost'), 'staff product detail has no cost');
select tap.throws($$select public.create_product('{"name":"X","sell_price":1}')$$, 'not_authorized', 'staff cannot create products');
select tap.throws($$select public.update_product(tap.id('charger'), '{"sell_price":1}')$$, 'not_authorized', 'staff cannot change prices');
select tap.throws($$select public.adjust_stock(tap.id('charger'), 'set', 1, 'x')$$, 'not_authorized', 'staff cannot adjust stock');
select tap.throws($$select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('charger'), 'qty', 1)))$$,
                  'not_authorized', 'staff cannot restock by default');
select tap.throws('select public.dashboard_summary()', 'not_authorized', 'staff cannot read the dashboard');
select tap.throws('select public.list_expenses()', 'not_authorized', 'staff cannot read expenses');
select tap.throws($$select public.create_expense('{"spent_on":"2026-01-01","category":"rent","amount":1}')$$,
                  'not_authorized', 'staff cannot add expenses');
select tap.throws('select public.list_team()', 'not_authorized', 'staff cannot manage the team');
select tap.throws($$select public.update_settings('{"allow_negative_stock":true}')$$, 'not_authorized', 'staff cannot edit settings');
select tap.throws($$select public.product_movements(tap.id('charger'))$$, 'not_authorized', 'staff cannot read cost history');
select tap.ok(not (public.get_settings() ? 'slow_mover_days'), 'staff get the reduced settings');
reset role;

-- Staff restock when allowed: cost cannot be set by staff (keeps the average).
select tap.as_user('9001');
select public.update_settings('{"staff_can_restock": true}');
reset role;
select tap.as_user('1001');
select public.restock(jsonb_build_array(jsonb_build_object('product_id', tap.id('case'), 'qty', 5, 'unit_cost', 1)), 'Merkato', '');
reset role;
select tap.eq((select avg_cost from public.products where id = tap.id('case')), 80.0000::numeric(14,4),
              'staff restock ignores the unit cost they send');
select tap.eq((select stock_qty from public.products where id = tap.id('case')), 10.000::numeric(12,3), 'staff restock adds stock');
select tap.as_user('9001');
select public.update_settings('{"staff_can_restock": false}');
reset role;

-- ─── team rules ──────────────────────────────────────────────────────
select public_id as owner_pid from public.profiles where telegram_id = '9001' \gset
select tap.as_user('9001');
select tap.throws(format($$select public.set_member_role(%L, 'staff')$$, :'owner_pid'), 'last_owner',
                  'the last owner cannot demote themselves');
select tap.eq(jsonb_array_length(public.list_team() -> 'members'), 2, 'team lists owner + staff');
select tap.ok(jsonb_array_length(public.list_team() -> 'requests') >= 1, 'team lists access requests');
select tap.throws($$select public.set_member_role(tap.id('staff_pid'), 'admin')$$, 'invalid_input', 'unknown roles are rejected');
reset role;
select tap.ok(exists (select 1 from public.notifications_outbox where chat_id = '1001' and kind = 'role_changed'),
              'staff member is told about their new role');
select tap.ok(exists (select 1 from public.audit_log where action = 'user.set_role' and target_id = '1001'),
              'role change is audited');

-- Banned owner loses access.
update public.profiles set is_banned = true where telegram_id = '9002';
select tap.as_user('9002');
select tap.throws('select public.list_products()', 'banned', 'banned users are blocked');
reset role;
update public.profiles set is_banned = false where telegram_id = '9002';
