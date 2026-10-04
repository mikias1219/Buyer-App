-- SPEC A3 business rules + A4 state machine, end to end.

-- Fresh seller 2001 (unverified at first) so quota counters start at zero.
set role service_role;
select public.upsert_telegram_profile('2001', 'seller_q', 'Fikir', '', '', 'en');
reset role;

select tap.make_draft('2001', 'iPhone 12 128GB', 30000, 'phone', 'Apple') as a_id \gset
select tap.make_draft('2001', 'iPhone 11 64GB', 22000, 'phone', 'Apple') as b_id \gset
select tap.make_draft('2001', 'iPhone XR 64GB', 15000, 'phone', 'Apple') as c_id \gset

select tap.login('2001');
set role authenticated;

-- ─── Submit gates ────────────────────────────────────────────────────
select tap.throws(format('select public.submit_listing(%L)', :'a_id'), 'phone_not_verified',
                  'cannot submit before verifying phone');
reset role;
set role service_role;
select public.set_verified_phone('2001', '251922000001');
reset role;
select tap.login('2001');
set role authenticated;

select public.create_listing('{"title": "Half done"}') as incomplete_id \gset
select tap.throws(format('select public.submit_listing(%L)', :'incomplete_id'), 'listing_incomplete',
                  'incomplete draft cannot be submitted');
select tap.ok((public.get_my_listing(:'incomplete_id') -> 'missing') ? 'photos', 'missing fields are reported (photos)');
select tap.throws($$select public.create_listing('{"price": "abc"}')$$, 'invalid_input', 'bad price type rejected');
select tap.throws($$select public.create_listing('{"category": "spaceship"}')$$, 'invalid_input', 'unknown category rejected');
select tap.throws($$select public.create_listing('{"price": -5}')$$, 'invalid_input', 'negative price rejected');
select tap.throws(format($$select public.set_listing_images(%L, '[{"path": "9999/%s/x.webp"}]')$$, :'incomplete_id', :'incomplete_id'),
                  'invalid_input', 'cannot attach images from another user''s storage folder');

-- ─── Free quota (A3.1): first 2 free → in_review, 3rd needs the fee ──
select tap.eq(public.submit_listing(:'a_id') ->> 'status', 'in_review', 'listing #1 free → in_review');
select tap.eq(public.submit_listing(:'b_id') ->> 'status', 'in_review', 'listing #2 free → in_review');
select public.submit_listing(:'c_id') as c_submit \gset
select tap.eq((:'c_submit'::jsonb) ->> 'status', 'pending_payment', 'listing #3 beyond quota → pending_payment');
select tap.eq(((:'c_submit'::jsonb) ->> 'amount_etb')::numeric, 100::numeric, 'fee equals listing_fee_etb');
select (:'c_submit'::jsonb) ->> 'payment_id' as c_pay \gset
select tap.eq((public.get_me() ->> 'free_listings_left')::int, 0, 'free quota used up');
select tap.throws(format('select public.submit_listing(%L)', :'a_id'), 'illegal_transition', 'cannot submit twice');

-- Owner cannot jump states.
select tap.throws(format($$select public.set_listing_status(%L, 'active')$$, :'a_id'), 'illegal_transition',
                  'owner cannot self-approve in_review → active');
select tap.throws(format($$select public.set_listing_status(%L, 'paused')$$, :'a_id'), 'illegal_transition',
                  'cannot pause a listing that is not live');
select tap.throws(format('select public.update_listing(%L, %L)', :'a_id', '{"price": 1}'), 'listing_locked',
                  'listing under review cannot be edited');
reset role;

-- ─── Moderation (A3.10) ──────────────────────────────────────────────
select tap.login('9002');
set role authenticated;
select tap.eq(public.moderate_listing(:'a_id', true), 'active', 'moderator approves #1 → active');
select tap.throws(format('select public.moderate_listing(%L, false)', :'b_id'), 'reason_required',
                  'rejection requires a reason code');
select tap.throws(format($$select public.moderate_listing(%L, false, 'because')$$, :'b_id'), 'reason_required',
                  'rejection reason must be a known code');
select tap.eq(public.moderate_listing(:'b_id', false, 'bad_photos', 'Show the screen on'), 'rejected',
              'moderator rejects #2 with reason');
select tap.throws(format('select public.moderate_listing(%L, true)', :'a_id'), 'illegal_transition',
                  'cannot approve an already active listing');
reset role;

select tap.ok((select expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 minute'
               from public.products where id = :'a_id'), 'live listing expires in listing_duration_days');
select tap.ok(exists (select 1 from public.notifications_outbox where chat_id = '2001' and kind = 'listing_live'),
              'seller notified when listing goes live');
select tap.ok(exists (select 1 from public.notifications_outbox
                      where chat_id = '2001' and kind = 'listing_rejected' and payload ->> 'reason' = 'bad_photos'),
              'seller notified of rejection with reason');
select tap.ok(exists (select 1 from public.audit_log where action = 'listing.reject' and target_id = :'b_id'),
              'moderation is audited');

-- Rejected → fix → resubmit: stays free, does not consume quota again.
select tap.login('2001');
set role authenticated;
select tap.eq(public.get_listing(:'b_id') -> 'manage' ->> 'reject_reason', 'bad_photos', 'owner sees rejection reason');
select public.update_listing(:'b_id', '{"description": "Now with photos of the screen turned on."}');
select tap.eq(public.submit_listing(:'b_id') ->> 'status', 'in_review', 'resubmitted free listing → in_review again');
reset role;
select tap.eq((select listings_free_used from public.profiles where telegram_id = '2001'), 2,
              'resubmission does not consume another free slot');

-- ─── Paid path (A3.2) + duplicate reference (A3.8) ───────────────────
select tap.login('2001');
set role authenticated;
select tap.throws(format($$select public.submit_payment_reference(%L, 'ab')$$, :'c_pay'), 'invalid_reference_format',
                  'reference must look like a transaction id');
select tap.eq(public.submit_payment_reference(:'c_pay', ' ckk 12abc34 ') ->> 'status', 'submitted',
              'payment reference submitted');
select tap.eq((select reference from public.payments where id = :'c_pay'), 'CKK12ABC34', 'reference normalized');
select tap.eq(public.submit_payment_reference(:'c_pay', 'CKK12ABC34') ->> 'status', 'submitted',
              'resubmitting the same reference is idempotent');
select tap.throws(format($$select public.submit_payment_reference(%L, 'OTHER12345')$$, :'c_pay'), 'illegal_transition',
                  'cannot change reference after submission');
reset role;
select tap.eq((select status from public.products where id = :'c_id'), 'payment_submitted', 'listing awaits confirmation');
select tap.ok(exists (select 1 from public.notifications_outbox where chat_id = '9001' and kind = 'payment_submitted'),
              'admins notified about submitted payment');

-- Another seller reuses the same Telebirr reference.
select tap.make_draft('1003', 'Dell XPS 13', 60000, 'laptop', 'Dell') as d_id \gset
select tap.login('1003');
set role authenticated;
select public.submit_listing(:'d_id') ->> 'status' as d_status \gset
reset role;
-- 1003 still has free quota, so force the paid path for this check.
update public.products set status = 'pending_payment', period_paid = false, is_free = false where id = :'d_id';
update public.profiles set listings_free_used = 2 where telegram_id = '1003';
insert into public.payments (telegram_id, product_id, kind, amount_etb) values ('1003', :'d_id', 'listing', 100)
returning id as d_pay \gset
select tap.login('1003');
set role authenticated;
select tap.throws(format($$select public.submit_payment_reference(%L, 'ckk12abc34')$$, :'d_pay'), 'duplicate_reference',
                  'same Telebirr reference cannot pay for two listings');
select tap.throws(format($$select public.submit_payment_reference(%L, 'ZZZ999888')$$, :'c_pay'), 'not_found',
                  'cannot submit a reference for someone else''s payment');
reset role;

-- Admin confirms → goes live (no flags). Illegal re-confirm fails.
select tap.login('9001');
set role authenticated;
select tap.eq(public.admin_confirm_payment(:'c_pay') ->> 'status', 'confirmed', 'admin confirms payment');
select tap.throws(format('select public.admin_confirm_payment(%L)', :'c_pay'), 'illegal_transition',
                  'cannot confirm twice');
select tap.throws(format($$select public.admin_reject_payment(%L, 'other')$$, :'c_pay'), 'illegal_transition',
                  'cannot reject a confirmed payment');
reset role;
select tap.eq((select status from public.products where id = :'c_id'), 'active', 'paid listing live after confirmation');
select tap.ok((select period_paid from public.products where id = :'c_id'), 'period marked paid');
select tap.ok(exists (select 1 from public.audit_log where action = 'payment.confirm' and target_id = :'c_pay'),
              'payment confirmation audited with before/after');

-- Payment rejection → listing rejected → fix & resubmit creates a new payment.
select tap.login('1003');
set role authenticated;
select public.submit_payment_reference(:'d_pay', 'TYPO000001');
reset role;
select tap.login('9001');
set role authenticated;
select tap.throws(format($$select public.admin_reject_payment(%L, 'nope')$$, :'d_pay'), 'reason_required',
                  'payment rejection needs a reason code');
select public.admin_reject_payment(:'d_pay', 'invalid_reference', 'No such transaction');
reset role;
select tap.eq((select status || ':' || reject_reason from public.products where id = :'d_id'),
              'rejected:invalid_reference', 'rejected payment rejects listing with reason');
select tap.login('1003');
set role authenticated;
select public.submit_listing(:'d_id') as d_resubmit \gset
select tap.eq((:'d_resubmit'::jsonb) ->> 'status', 'pending_payment', 'fix & resubmit → pending_payment');
select tap.ok((:'d_resubmit'::jsonb) ->> 'payment_id' <> :'d_pay', 'a fresh payment is opened');
select tap.eq(public.submit_payment_reference(((:'d_resubmit'::jsonb) ->> 'payment_id')::uuid, 'TYPO000001') ->> 'status',
              'submitted', 'reference of a rejected payment may be reused');
reset role;

-- ─── Refund (A3.11): admin only, removes listing ────────────────────
select tap.login('9002');
set role authenticated;
select tap.throws(format('select public.admin_refund_payment(%L)', :'c_pay'), 'not_authorized', 'moderator cannot refund');
reset role;
select tap.login('9001');
set role authenticated;
select tap.eq(public.admin_refund_payment(:'c_pay', 'Duplicate charge') ->> 'status', 'refunded', 'admin refunds');
reset role;
select tap.eq((select status from public.products where id = :'c_id'), 'removed', 'refund removes the listing');
select tap.eq((select count(*)::int from public.listings_public where id = :'c_id'), 0, 'refunded listing not public');

-- ─── Pause / resume / sold (A3.6) ────────────────────────────────────
select tap.login('2001');
set role authenticated;
select tap.eq(public.set_listing_status(:'a_id', 'paused'), 'paused', 'owner pauses');
reset role;
select tap.eq((select count(*)::int from public.listings_public where id = :'a_id'), 0, 'paused listing hidden from browse');
select tap.login('2001');
set role authenticated;
select tap.eq(public.set_listing_status(:'a_id', 'active'), 'active', 'owner resumes');
reset role;

-- ─── Editing a live listing ──────────────────────────────────────────
select tap.login('1002');
set role authenticated;
select public.toggle_favorite(:'a_id');
reset role;
select tap.login('2001');
set role authenticated;
select tap.eq(public.update_listing(:'a_id', '{"price": 28000, "negotiable": true}') ->> 'status', 'active',
              'price/negotiable edits apply instantly');
reset role;
select tap.ok(exists (select 1 from public.notifications_outbox
                      where chat_id = '1002' and kind = 'price_drop' and payload ->> 'product_id' = :'a_id'),
              'price drop notifies users who saved the listing');
select tap.login('2001');
set role authenticated;
select tap.eq(public.update_listing(:'a_id', '{"title": "iPhone 12 128GB Blue"}') ->> 'status', 'in_review',
              'substantive edit sends live listing back to review');
reset role;
select expires_at as a_expiry from public.products where id = :'a_id' \gset
select tap.login('9002');
set role authenticated;
select public.moderate_listing(:'a_id', true);
reset role;
select tap.eq((select expires_at from public.products where id = :'a_id'), :'a_expiry'::timestamptz,
              're-approval after edit keeps the original expiry');

-- ─── Expiry + renewal (A3.3) ─────────────────────────────────────────
update public.products set expires_at = now() + interval '2 days' where id = :'a_id';
set role service_role;
select tap.ok((public.run_maintenance() ->> 'reminded')::int >= 1, 'maintenance sends expiry reminder');
reset role;
select tap.ok(exists (select 1 from public.notifications_outbox where chat_id = '2001' and kind = 'listing_expiring'),
              'expiring reminder queued');
update public.products set expires_at = now() - interval '1 minute' where id = :'a_id';
set role service_role;
select tap.ok((public.run_maintenance() ->> 'expired')::int >= 1, 'maintenance expires overdue listings');
reset role;
select tap.eq((select status from public.products where id = :'a_id'), 'expired', 'listing expired');

select tap.login('2001');
set role authenticated;
select tap.eq(public.renew_listing(:'a_id') ->> 'status', 'in_review', 'first renewal is free (→ review)');
reset role;
select tap.login('9002');
set role authenticated;
select public.moderate_listing(:'a_id', true);
reset role;
select tap.ok((select expires_at > now() + interval '29 days' from public.products where id = :'a_id'),
              'renewed listing gets a fresh period');
update public.products set expires_at = now() - interval '1 minute' where id = :'a_id';
set role service_role;
select public.run_maintenance();
reset role;
select tap.login('2001');
set role authenticated;
select public.renew_listing(:'a_id') as renew2 \gset
select tap.eq((:'renew2'::jsonb) ->> 'status', 'pending_payment', 'second renewal requires the fee');
select tap.eq((select kind from public.payments where id = ((:'renew2'::jsonb) ->> 'payment_id')::uuid), 'renew',
              'renewal payment kind is renew');
reset role;

-- ─── Boost (A3.5) ────────────────────────────────────────────────────
select tap.login('2001');
set role authenticated;
select tap.throws(format('select public.create_boost_payment(%L)', :'a_id'), 'listing_not_active', 'only live listings can be boosted');
reset role;
select tap.login('1001');
set role authenticated;
select public.create_boost_payment(x.live_id) ->> 'payment_id' as boost_pay
from (select id as live_id from public.products where seller_id = '1001' and status = 'active' limit 1) x \gset
select public.submit_payment_reference(:'boost_pay', 'BOOST00001');
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_confirm_payment(:'boost_pay');
reset role;
select tap.ok((select is_featured from public.listings_public lp
               join public.payments pay on pay.product_id = lp.id where pay.id = :'boost_pay'),
              'confirmed boost marks listing as featured');

-- ─── Mark sold → review requests to buyers who made contact ─────────
select id as sell_id from public.products where seller_id = '1001' and status = 'active' limit 1 \gset
select tap.login('1002');
set role authenticated;
select public.request_contact(:'sell_id');
reset role;
select tap.login('1001');
set role authenticated;
select tap.eq(public.set_listing_status(:'sell_id', 'sold'), 'sold', 'owner marks sold');
select tap.throws(format($$select public.set_listing_status(%L, 'active')$$, :'sell_id'), 'illegal_transition',
                  'sold is terminal');
reset role;
select tap.ok(exists (select 1 from public.notifications_outbox where chat_id = '1002' and kind = 'review_request'),
              'buyer who contacted the seller is asked for a review');

-- ─── Limits: banned words, max active, delete rules ─────────────────
select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"banned_words": ["Replica", "  "]}');
reset role;
select tap.eq((select banned_words from public.platform_settings), array['replica'], 'banned words normalized');
select tap.make_draft('1003', 'Replica iPhone 15 Pro', 9000) as bad_id \gset
select tap.login('1003');
set role authenticated;
select tap.throws(format('select public.submit_listing(%L)', :'bad_id'), 'banned_words', 'banned words block submission');
reset role;

select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"max_active_listings": 1, "banned_words": []}');
reset role;
select tap.make_draft('2001', 'Galaxy S21', 21000) as max_id \gset
select tap.login('2001');
set role authenticated;
select tap.throws(format('select public.submit_listing(%L)', :'max_id'), 'max_active_listings',
                  'max active listings enforced');
select tap.eq(public.delete_listing(:'incomplete_id') ->> 'deleted', 'true', 'draft can be deleted');
select tap.throws(format('select public.delete_listing(%L)', :'b_id'), 'listing_locked', 'listing in review cannot be deleted');
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"max_active_listings": 10}');
reset role;

-- ─── Fee set to 0 → everything free ─────────────────────────────────
select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"listing_fee_etb": 0}');
reset role;
select tap.make_draft('2001', 'Pixel 7', 20000, 'phone', 'Google') as free_id \gset
select tap.login('2001');
set role authenticated;
select tap.eq(public.submit_listing(:'free_id') ->> 'status', 'in_review', 'with fee 0, quota-exhausted seller still goes to review');
reset role;
select tap.login('9001');
set role authenticated;
select public.admin_update_settings('{"listing_fee_etb": 100}');
reset role;
