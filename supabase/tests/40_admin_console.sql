-- Admin console: dashboard, queues, users (ban/role/verified), reports, settings, audit, outbox worker.

select public_id as buyer_pid from public.profiles where telegram_id = '1002' \gset
select public_id as admin_pid from public.profiles where telegram_id = '9001' \gset
select public_id as shop_pid from public.profiles where telegram_id = '3001' \gset
select public_id as mod_pid from public.profiles where telegram_id = '9002' \gset

select tap.login('9001');
set role authenticated;
select tap.ok((public.admin_dashboard() ->> 'revenue_30d')::numeric > 0, 'dashboard revenue (confirmed − refunded)');
select tap.ok(jsonb_array_length(public.admin_dashboard() -> 'revenue_by_day') = 14, 'dashboard has a 14-day revenue series');
select tap.ok(public.admin_dashboard() -> 'funnel_30d' ? 'live', 'dashboard funnel');
select tap.ok(jsonb_array_length(public.admin_review_queue()) >= 1, 'review queue lists in_review listings');
select tap.ok(public.admin_review_queue() -> 0 -> 'seller' ? 'past_rejections', 'queue includes seller trust signals');
select tap.ok(jsonb_array_length(public.admin_list_payments('confirmed')) >= 1, 'payments queue filtered by status');
select tap.ok(jsonb_array_length(public.admin_list_payments('all', 'thinkpad')) >= 1, 'payments searchable by listing title');
select tap.ok(jsonb_array_length(public.admin_list_payments('all', 'CKK12')) >= 1, 'payments searchable by reference');
select tap.ok((select bool_or((p ->> 'duplicate_count')::int > 0) from jsonb_array_elements(public.admin_list_payments('all')) p),
              'duplicate reference warning surfaced');
select tap.ok(jsonb_array_length(public.admin_list_users('buyer')) = 2, 'user search by username');
select tap.ok((public.admin_get_user(:'shop_pid') -> 'listings') is not null, 'user detail with listings and payments');
select tap.ok(jsonb_array_length(public.admin_list_listings('active')) >= 1, 'listings browser');

-- Roles & self-protection.
select tap.throws(format($$select public.admin_set_role(%L, 'user')$$, :'admin_pid'), 'cannot_target_self',
                  'admin cannot demote themselves (no lockout)');
select tap.throws(format($$select public.admin_set_ban(%L, true, 'x')$$, :'admin_pid'), 'cannot_target_self',
                  'admin cannot ban themselves');
select tap.throws(format($$select public.admin_set_ban(%L, true, '')$$, :'buyer_pid'), 'reason_required',
                  'ban requires a reason');
select tap.eq(public.admin_set_verified(:'shop_pid', true) ->> 'is_verified_seller', 'true', 'verified seller toggle');
reset role;
select tap.ok((select bool_and(seller_verified) from public.listings_public v
               join public.products p on p.id = v.id where p.seller_id = '3001'), 'verified badge shows on listings');

-- Reports: moderator dismisses, admin bans via report.
select tap.login('9002');
set role authenticated;
select id as rep from jsonb_to_recordset(public.admin_list_reports('open')) as x(id uuid) limit 1 \gset
select tap.throws(format($$select public.resolve_report(%L, 'ban_user')$$, :'rep'), 'not_authorized',
                  'moderator cannot ban through reports');
reset role;
select tap.login('9001');
set role authenticated;
select tap.eq(public.resolve_report(:'rep', 'ban_user', 'Scam reports'), 'ban_user', 'admin bans via report');
select tap.throws(format($$select public.resolve_report(%L, 'dismiss')$$, :'rep'), 'illegal_transition',
                  'resolved report cannot be resolved again');
reset role;

-- Banned seller (A3.12): listings hidden, cannot create, contact or report.
select tap.eq((select is_banned from public.profiles where telegram_id = '3001'), true, 'seller banned');
select tap.eq((select count(*)::int from public.listings_public lp join public.products p on p.id = lp.id
               where p.seller_id = '3001'), 0, 'banned seller''s listings hidden from browse');
select tap.login('3001');
set role authenticated;
select tap.throws($$select public.create_listing('{}')$$, 'banned', 'banned user cannot create listings');
select tap.throws(format('select public.request_contact(%L)', (select id from public.listings_public limit 1)), 'banned',
                  'banned user cannot contact sellers');
select tap.throws(format($$select public.submit_report('user', %L, 'scam')$$, :'buyer_pid'), 'banned',
                  'banned user cannot report');
select tap.ok((public.get_me() ->> 'is_banned')::boolean, 'banned user can still see their own status');
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_set_ban(:'shop_pid', false);
reset role;
select tap.ok((select count(*) from public.listings_public lp join public.products p on p.id = lp.id
               where p.seller_id = '3001') >= 1, 'unban restores listings');

-- Settings validation + audit.
select tap.login('9001');
set role authenticated;
select tap.throws($$select public.admin_update_settings('{"is_admin": true}')$$, 'invalid_input', 'unknown settings key rejected');
select tap.throws($$select public.admin_update_settings('{"free_listings_quota": -1}')$$, 'invalid_input', 'out-of-range value rejected');
select tap.throws($$select public.admin_update_settings('{"channel_id": "not a channel"}')$$, 'invalid_input', 'bad channel id rejected');
select tap.eq(public.admin_update_settings('{"free_listings_quota": 3, "support_username": "@help_desk"}') ->> 'support_username',
              'help_desk', 'settings saved, @ stripped');
select tap.ok(jsonb_array_length(public.admin_audit_log('settings')) >= 1, 'settings change in audit log');
select tap.ok((public.admin_audit_log('settings') -> 0 -> 'before' ->> 'free_listings_quota') = '2'
              and (public.admin_audit_log('settings') -> 0 -> 'after' ->> 'free_listings_quota') = '3',
              'audit keeps before/after');
select tap.ok(jsonb_array_length(public.admin_audit_log(p_target_type => 'payment')) >= 3, 'audit filter by target type');
select tap.ok((public.admin_audit_log('user.ban') -> 0 -> 'actor' ->> 'username') = 'boss', 'audit shows the actor');
reset role;

-- ─── Outbox worker (service role) ────────────────────────────────────
set role service_role;
select tap.ok(jsonb_array_length(public.claim_outbox(5)) = 5, 'worker claims a batch');
select tap.eq((select count(*)::int from public.notifications_outbox where attempts = 1 and next_attempt_at > now()), 5,
              'claimed rows are pushed into the future (no double send)');
select id as ob_ok from public.notifications_outbox where attempts = 1 order by id limit 1 \gset
select public.complete_outbox(:'ob_ok', true);
select tap.ok((select sent_at is not null from public.notifications_outbox where id = :'ob_ok'), 'delivered row marked sent');
select id as ob_blocked, chat_id as ob_chat from public.notifications_outbox
where attempts = 1 and sent_at is null and chat_id ~ '^[0-9]+$' order by id limit 1 \gset
select public.complete_outbox(:'ob_blocked', false, '403 Forbidden: bot was blocked by the user', true);
select tap.ok((select bot_blocked from public.profiles where telegram_id = :'ob_chat'), 'blocked bot marks the user');
select tap.eq((select attempts from public.notifications_outbox where id = :'ob_blocked'), 5, 'permanent failure stops retries');
select public.upsert_telegram_profile(:'ob_chat', null, 'Back', '', '', 'en');
select tap.ok(not (select bot_blocked from public.profiles where telegram_id = :'ob_chat'), 'reopening the app clears bot_blocked');
select tap.ok(public.claim_outbox(100) -> 0 ? 'language', 'claimed rows carry recipient language');
reset role;
