-- Users created exactly as production does: service_role calls the account functions
-- that the auth-telegram / verify-phone Edge Functions use.
set role service_role;
select public.upsert_telegram_profile('1001', 'seller_one', 'Abel', '', '', 'en');
select public.upsert_telegram_profile('1002', 'buyer_two', 'Bethel', '', '', 'am');
select public.upsert_telegram_profile('1003', '', 'Chala', '', '', 'en');      -- seller without @username
select public.upsert_telegram_profile('9001', 'boss', 'Dawit', '', '', 'en');
select public.upsert_telegram_profile('9002', 'mod', 'Eden', '', '', 'en');
select tap.eq(public.bootstrap_admin('9001'), true, 'first admin can be bootstrapped');
select tap.eq(public.bootstrap_admin('9002'), false, 'bootstrap is a no-op once an admin exists');
select public.set_verified_phone('1001', '251911000001');
select public.set_verified_phone('1002', '0911000002');
select public.set_verified_phone('1003', '+251911000003');
reset role;

select tap.eq((select phone from public.profiles where telegram_id = '1002'), '+251911000002',
              'local 09… phone normalized to +251');

select public_id as mod_pid from public.profiles where telegram_id = '9002' \gset
select tap.login('9001');
set role authenticated;
select public.admin_set_role(:'mod_pid', 'moderator');
select public.admin_update_settings('{"telebirr_number": "0900000000", "telebirr_name": "TechMarket ET"}');
reset role;
select tap.eq((select role from public.profiles where telegram_id = '9002'), 'moderator', 'admin promoted a moderator');

-- Helper used by later suites: create a complete, submittable draft for a seller.
create or replace function tap.make_draft(p_seller text, p_title text, p_price numeric,
                                          p_category text default 'phone', p_brand text default 'Samsung',
                                          p_hash text default '')
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform tap.login(p_seller);
  v_id := public.create_listing(jsonb_build_object(
    'title', p_title, 'description', 'Clean device, works perfectly, box included.',
    'price', p_price, 'category', p_category, 'brand', p_brand, 'condition', 'good', 'city', 'Addis Ababa'));
  perform public.set_listing_images(v_id, jsonb_build_array(jsonb_build_object(
    'path', p_seller || '/' || v_id || '/cover.webp', 'hash', p_hash)));
  return v_id;
end;
$$;
grant execute on function tap.make_draft(text, text, numeric, text, text, text) to authenticated;
