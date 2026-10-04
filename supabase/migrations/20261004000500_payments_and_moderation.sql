-- 0500 · Payments (manual Telebirr) and moderation RPCs (SPEC A3.2, A3.10–11, A4).
-- Payment: pending → submitted → confirmed | rejected ; confirmed → refunded.

create or replace function public.normalize_reference(p_ref text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_ref, ''), '\s+', '', 'g'));
$$;

create or replace function public.payment_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', pay.id, 'kind', pay.kind, 'status', pay.status, 'amount_etb', pay.amount_etb,
    'reference', pay.reference, 'has_screenshot', pay.screenshot_path <> '',
    'reject_reason', pay.reject_reason, 'admin_note', pay.admin_note,
    'submitted_at', pay.submitted_at, 'reviewed_at', pay.reviewed_at, 'created_at', pay.created_at,
    'product', jsonb_build_object(
      'id', p.id, 'title', p.title, 'price', p.price, 'status', p.status,
      'cover_path', (select path from public.product_images where product_id = p.id order by position limit 1)
    )
  )
  from public.payments pay
  join public.products p on p.id = pay.product_id
  where pay.id = p_id;
$$;

-- Owner (or staff) view of one payment, plus where to pay.
create or replace function public.get_payment(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user(true);
  s public.platform_settings := public.get_settings();
  v_owner text;
begin
  select telegram_id into v_owner from public.payments where id = p_id;
  if v_owner is null or (v_owner <> v_user.telegram_id and v_user.role = 'user') then
    perform public.app_error('not_found');
  end if;
  return public.payment_json(p_id) || jsonb_build_object(
    'pay_to', jsonb_build_object('telebirr_number', s.telebirr_number, 'telebirr_name', s.telebirr_name),
    'sla_minutes', s.payment_sla_minutes
  );
end;
$$;

create or replace function public.submit_payment_reference(
  p_payment_id uuid, p_reference text, p_screenshot_path text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.profiles := public.require_user();
  pay public.payments;
  p public.products;
  v_ref text := public.normalize_reference(p_reference);
  v_shot text := coalesce(p_screenshot_path, '');
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found or pay.telegram_id <> v_user.telegram_id then
    perform public.app_error('not_found');
  end if;
  if v_ref !~ '^[A-Z0-9-]{6,32}$' then
    perform public.app_error('invalid_reference_format');
  end if;
  -- Idempotent retry of the same submission.
  if pay.status = 'submitted' and pay.reference = v_ref then
    return public.payment_json(pay.id);
  end if;
  if pay.status <> 'pending' then
    perform public.app_error('illegal_transition', pay.status || ' -> submitted');
  end if;
  if (select count(*) from public.payments
      where telegram_id = v_user.telegram_id and submitted_at > now() - interval '1 hour') >= 10 then
    perform public.app_error('rate_limited');
  end if;
  if v_shot <> '' and v_shot !~ ('^' || v_user.telegram_id || '/[0-9a-f-]{36}\.(webp|jpg|jpeg|png)$') then
    perform public.app_error('invalid_input', 'screenshot_path');
  end if;
  if exists (select 1 from public.payments
             where reference = v_ref and id <> pay.id and status in ('submitted', 'confirmed', 'refunded')) then
    perform public.app_error('duplicate_reference');
  end if;

  select * into p from public.products where id = pay.product_id for update;
  if pay.kind in ('listing', 'renew') and p.status <> 'pending_payment' then
    perform public.app_error('illegal_transition', p.status || ' -> payment_submitted');
  end if;
  if pay.kind = 'boost' and p.status <> 'active' then
    perform public.app_error('listing_not_active');
  end if;

  update public.payments
  set reference = v_ref, screenshot_path = v_shot, status = 'submitted', submitted_at = now()
  where id = pay.id;

  if pay.kind in ('listing', 'renew') then
    update public.products set status = 'payment_submitted' where id = p.id;
  end if;

  perform public.notify_admins('payment_submitted', jsonb_build_object(
    'payment_id', pay.id, 'kind', pay.kind, 'amount_etb', pay.amount_etb, 'title', p.title, 'reference', v_ref));

  return public.payment_json(pay.id);
exception
  when unique_violation then
    perform public.app_error('duplicate_reference');
    return null;
end;
$$;

create or replace function public.admin_confirm_payment(p_id uuid, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.profiles := public.require_admin();
  s public.platform_settings := public.get_settings();
  pay public.payments;
  p public.products;
  v_flags text[];
begin
  select * into pay from public.payments where id = p_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if pay.status <> 'submitted' then
    perform public.app_error('illegal_transition', pay.status || ' -> confirmed');
  end if;
  select * into p from public.products where id = pay.product_id for update;

  update public.payments
  set status = 'confirmed', reviewed_by = v_admin.telegram_id, reviewed_at = now(),
      admin_note = left(coalesce(p_note, ''), 500)
  where id = p_id;

  if pay.kind in ('listing', 'renew') then
    if p.status <> 'payment_submitted' then
      perform public.app_error('illegal_transition', p.status || ' -> paid');
    end if;
    v_flags := public.listing_compute_flags(p.id);
    update public.products set period_paid = true, flags = v_flags where id = p.id;
    -- Paid listings go live immediately unless flagged for a human look (A3.2).
    if cardinality(v_flags) = 0 then
      perform public.listing_go_live(p.id);
    else
      update public.products set status = 'in_review' where id = p.id;
    end if;
  else
    update public.products
    set boosted_until = greatest(now(), coalesce(boosted_until, now())) + make_interval(days => s.boost_days)
    where id = p.id;
  end if;

  perform public.write_audit('payment.confirm', 'payment', p_id::text, to_jsonb(pay),
                             (select to_jsonb(x) from public.payments x where x.id = p_id));
  perform public.enqueue_notification(pay.telegram_id, 'payment_confirmed', jsonb_build_object(
    'payment_id', pay.id, 'kind', pay.kind, 'product_id', p.id, 'title', p.title,
    'listing_status', (select status from public.products where id = p.id)));
  return public.payment_json(p_id);
end;
$$;

create or replace function public.admin_reject_payment(p_id uuid, p_reason text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments;
  p public.products;
begin
  perform public.require_admin();
  if p_reason is null or p_reason not in ('invalid_reference', 'wrong_amount', 'duplicate', 'other') then
    perform public.app_error('reason_required');
  end if;
  select * into pay from public.payments where id = p_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if pay.status <> 'submitted' then
    perform public.app_error('illegal_transition', pay.status || ' -> rejected');
  end if;
  select * into p from public.products where id = pay.product_id for update;

  update public.payments
  set status = 'rejected', reject_reason = p_reason, admin_note = left(coalesce(p_note, ''), 500),
      reviewed_by = public.current_tg_id(), reviewed_at = now()
  where id = p_id;

  if pay.kind in ('listing', 'renew') and p.status = 'payment_submitted' then
    update public.products
    set status = 'rejected', reject_reason = p_reason, reject_note = left(coalesce(p_note, ''), 500)
    where id = p.id;
  end if;

  perform public.write_audit('payment.reject', 'payment', p_id::text, to_jsonb(pay),
                             (select to_jsonb(x) from public.payments x where x.id = p_id));
  perform public.enqueue_notification(pay.telegram_id, 'payment_rejected', jsonb_build_object(
    'payment_id', pay.id, 'kind', pay.kind, 'product_id', p.id, 'title', p.title,
    'reason', p_reason, 'note', left(coalesce(p_note, ''), 500)));
  return public.payment_json(p_id);
end;
$$;

create or replace function public.admin_refund_payment(p_id uuid, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments;
  p public.products;
begin
  perform public.require_admin();
  select * into pay from public.payments where id = p_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if pay.status <> 'confirmed' then
    perform public.app_error('illegal_transition', pay.status || ' -> refunded');
  end if;
  select * into p from public.products where id = pay.product_id for update;

  update public.payments
  set status = 'refunded', refunded_at = now(), admin_note = left(coalesce(p_note, ''), 500)
  where id = p_id;

  if pay.kind in ('listing', 'renew') then
    if p.status not in ('sold', 'removed') then
      update public.products set status = 'removed', boosted_until = null where id = p.id;
    end if;
  else
    update public.products set boosted_until = null where id = p.id;
  end if;

  perform public.write_audit('payment.refund', 'payment', p_id::text, to_jsonb(pay),
                             (select to_jsonb(x) from public.payments x where x.id = p_id));
  perform public.enqueue_notification(pay.telegram_id, 'payment_refunded', jsonb_build_object(
    'payment_id', pay.id, 'kind', pay.kind, 'product_id', p.id, 'title', p.title));
  return public.payment_json(p_id);
end;
$$;

-- Moderator/admin decision on a listing in review (A3.10).
create or replace function public.moderate_listing(
  p_id uuid, p_approve boolean, p_reason text default null, p_note text default ''
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products;
begin
  perform public.require_staff();
  select * into p from public.products where id = p_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if p.status <> 'in_review' then
    perform public.app_error('illegal_transition', p.status || ' -> moderated');
  end if;

  if p_approve then
    if not p.period_paid then
      perform public.app_error('payment_required');
    end if;
    perform public.listing_go_live(p_id);
  else
    if p_reason is null or p_reason not in (
      'prohibited_item', 'bad_photos', 'misleading_price', 'duplicate', 'other') then
      perform public.app_error('reason_required');
    end if;
    update public.products
    set status = 'rejected', reject_reason = p_reason, reject_note = left(coalesce(p_note, ''), 500)
    where id = p_id;
    perform public.enqueue_notification(p.seller_id, 'listing_rejected', jsonb_build_object(
      'product_id', p.id, 'title', p.title, 'reason', p_reason, 'note', left(coalesce(p_note, ''), 500)));
  end if;

  perform public.write_audit(case when p_approve then 'listing.approve' else 'listing.reject' end,
    'product', p_id::text,
    jsonb_build_object('status', p.status),
    (select jsonb_build_object('status', status, 'reject_reason', reject_reason, 'reject_note', reject_note)
     from public.products where id = p_id));
  return (select status from public.products where id = p_id);
end;
$$;

create or replace function public.admin_remove_listing(p_id uuid, p_reason text, p_note text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products;
begin
  perform public.require_staff();
  if p_reason is null or p_reason not in (
    'prohibited_item', 'bad_photos', 'misleading_price', 'duplicate', 'other') then
    perform public.app_error('reason_required');
  end if;
  select * into p from public.products where id = p_id for update;
  if not found then
    perform public.app_error('not_found');
  end if;
  if p.status in ('draft', 'sold', 'removed') then
    perform public.app_error('illegal_transition', p.status || ' -> removed');
  end if;
  update public.products
  set status = 'removed', reject_reason = p_reason, reject_note = left(coalesce(p_note, ''), 500),
      boosted_until = null
  where id = p_id;
  perform public.write_audit('listing.remove', 'product', p_id::text,
    jsonb_build_object('status', p.status),
    jsonb_build_object('status', 'removed', 'reject_reason', p_reason, 'reject_note', p_note));
  perform public.enqueue_notification(p.seller_id, 'listing_removed', jsonb_build_object(
    'product_id', p.id, 'title', p.title, 'reason', p_reason, 'note', left(coalesce(p_note, ''), 500)));
  return 'removed';
end;
$$;

grant execute on function
  public.get_payment(uuid),
  public.submit_payment_reference(uuid, text, text),
  public.admin_confirm_payment(uuid, text),
  public.admin_reject_payment(uuid, text, text),
  public.admin_refund_payment(uuid, text),
  public.moderate_listing(uuid, boolean, text, text),
  public.admin_remove_listing(uuid, text, text)
  to authenticated;
