-- SPEC A11: "A user cannot read or modify anything they don't own using the public anon key."

-- Setup: a draft (1001), a live listing (1001), a pending-payment listing (1003).
select tap.make_draft('1001', 'Secret draft phone', 15000) as draft_id \gset
select tap.make_draft('1001', 'Live Samsung A54', 25000) as live_id \gset
select tap.login('1001');
set role authenticated;
select public.submit_listing(:'live_id');
reset role;
select tap.login('9002');
set role authenticated;
select public.moderate_listing(:'live_id', true);
reset role;

-- ─── anon: no table access at all, only the safe view ───────────────
select tap.logout();
set role anon;
select tap.throws('select * from public.profiles', '42501', 'anon cannot read profiles');
select tap.throws('select * from public.products', '42501', 'anon cannot read products table');
select tap.throws('select * from public.payments', '42501', 'anon cannot read payments');
select tap.throws('select * from public.platform_settings', '42501', 'anon cannot read raw settings');
select tap.throws('select * from public.audit_log', '42501', 'anon cannot read audit log');
select tap.throws($$insert into public.products (seller_id, title) values ('1001', 'x')$$, '42501', 'anon cannot insert products');
select tap.throws($$update public.platform_settings set telebirr_number = '0999999999'$$, '42501',
                  'anon cannot redirect Telebirr payments');
select tap.throws($$update public.profiles set role = 'admin'$$, '42501', 'anon cannot escalate roles');
select tap.throws($$delete from public.products$$, '42501', 'anon cannot delete listings');
select tap.throws($$select public.create_listing('{}')$$, '42501', 'anon cannot call seller RPCs');
select tap.throws(format('select public.admin_confirm_payment(%L)', gen_random_uuid()), '42501',
                  'anon cannot call admin RPCs');
select tap.throws('select _seller_key from public.listings_public', '42501', 'internal seller key not selectable');
select tap.throws('select search_text from public.listings_public', '42501', 'internal search column not selectable');
select tap.eq((select count(*)::int from public.listings_public where id = :'live_id'), 1, 'anon sees live listing');
select tap.eq((select count(*)::int from public.listings_public where id = :'draft_id'), 0, 'anon cannot see drafts');
select tap.ok(not (public.get_listing(:'live_id') ? 'manage'), 'public listing detail has no management data');
select tap.ok(public.get_listing(:'live_id') -> 'seller' ->> 'name' = 'Abel', 'public seller card shows display name');
select tap.ok(public.get_listing(:'live_id')::text not like '%seller_one%', 'seller @username never in public detail');
select tap.ok(public.get_listing(:'live_id')::text not like '%251911000001%', 'seller phone never in public detail');
select tap.ok(public.search_listings()::text not like '%seller_one%', 'search results contain no usernames');
select tap.throws(format('select public.get_listing(%L)', :'draft_id'), 'not_found', 'anon cannot open a draft by id');
select tap.ok(not (public.get_public_settings() ? 'banned_words'), 'public settings omit banned words');
reset role;

-- ─── authenticated user: only own rows, no writes ───────────────────
select tap.login('1002');
set role authenticated;
select tap.eq((select count(*)::int from public.products), 0, 'buyer sees no product rows via table');
select tap.eq((select count(*)::int from public.profiles), 1, 'user sees only own profile row');
select tap.eq((select count(*)::int from public.payments), 0, 'user sees no other payments');
select tap.eq((select count(*)::int from public.platform_settings), 0, 'non-admin cannot read raw settings');
select tap.throws($$update public.profiles set role = 'admin' where telegram_id = '1002'$$, '42501',
                  'user cannot make themselves admin');
select tap.throws($$update public.profiles set phone_verified = true$$, '42501', 'user cannot self-verify phone');
select tap.throws(format($$update public.products set status = 'active' where id = %L$$, :'draft_id'), '42501',
                  'user cannot set listing status directly');
select tap.throws(format('select public.get_listing(%L)', :'draft_id'), 'not_found', 'user cannot read another user''s draft');
select tap.throws(format('select public.get_my_listing(%L)', :'draft_id'), 'not_found', 'get_my_listing is owner-only');
select tap.throws(format($$select public.update_listing(%L, '{"price": 1}')$$, :'draft_id'), 'not_found',
                  'user cannot edit another user''s listing');
select tap.throws(format($$select public.set_listing_status(%L, 'sold')$$, :'live_id'), 'not_found',
                  'user cannot mark another user''s listing sold');
select tap.throws(format('select public.moderate_listing(%L, true)', :'draft_id'), 'not_authorized',
                  'user cannot moderate');
select tap.throws(format('select public.admin_confirm_payment(%L)', gen_random_uuid()), 'not_authorized',
                  'user cannot confirm payments');
select tap.throws($$select public.admin_update_settings('{"listing_fee_etb": 0}')$$, 'not_authorized',
                  'user cannot change settings');
select tap.throws('select public.admin_dashboard()', 'not_authorized', 'user cannot open admin dashboard');
select tap.throws($$select public.admin_list_users()$$, 'not_authorized', 'user cannot list users');
-- Internal / service-only functions are not callable by clients at all.
select tap.throws(format('select public.listing_go_live(%L)', :'draft_id'), '42501', 'listing_go_live is internal');
select tap.throws($$select public.write_audit('x','y','z',null,null)$$, '42501', 'write_audit is internal');
select tap.throws($$select public.enqueue_notification('1','x','{}')$$, '42501', 'enqueue_notification is internal');
select tap.throws('select public.run_maintenance()', '42501', 'run_maintenance is service-only');
select tap.throws($$select public.set_verified_phone('1002', '251900000000')$$, '42501', 'set_verified_phone is service-only');
select tap.throws($$select public.bootstrap_admin('1002')$$, '42501', 'bootstrap_admin is service-only');
select tap.throws($$select public.upsert_telegram_profile('1002','x','y','','','en')$$, '42501', 'profile upsert is service-only');
select tap.throws('select public.claim_outbox(10)', '42501', 'outbox worker API is service-only');
reset role;

-- ─── moderator: queue yes, money/users/settings no ──────────────────
select public_id as mod_pid from public.profiles where telegram_id = '9002' \gset
select tap.login('9002');
set role authenticated;
select tap.ok(public.admin_dashboard() ? 'in_review', 'moderator sees moderation counters');
select tap.ok(not (public.admin_dashboard() ? 'revenue_30d'), 'moderator does not see revenue');
select tap.throws(format('select public.admin_confirm_payment(%L)', gen_random_uuid()), 'not_authorized',
                  'moderator cannot confirm payments');
select tap.throws($$select public.admin_list_payments()$$, 'not_authorized', 'moderator cannot list payments');
select tap.throws($$select public.admin_update_settings('{"listing_fee_etb": 0}')$$, 'not_authorized',
                  'moderator cannot change settings');
select tap.throws(format($$select public.admin_set_role(%L, 'admin')$$, :'mod_pid'), 'not_authorized',
                  'moderator cannot change roles');
select tap.eq((select count(*)::int from public.platform_settings), 0, 'moderator cannot read raw settings');
select tap.ok((select count(*) from public.products) >= 2, 'staff can read listings through RLS');
reset role;

-- ─── unauthenticated JWT (no tg_id) behaves like no account ─────────
select tap.logout();
set role authenticated;
select tap.throws($$select public.create_listing('{}')$$, 'not_authenticated', 'missing tg_id claim is rejected');
select tap.throws($$select public.get_me()$$, 'not_authenticated', 'get_me requires identity');
reset role;
select tap.login('424242');  -- valid-looking claim, but no profile (never went through auth-telegram)
set role authenticated;
select tap.throws($$select public.create_listing('{}')$$, 'not_authenticated', 'claim without profile is rejected');
reset role;
