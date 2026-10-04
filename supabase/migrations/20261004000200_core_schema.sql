-- 0200 · Core schema (SPEC A8).
-- Contact data lives only in `profiles`, which is never publicly readable.
-- Images live in Storage; only their paths are stored here.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─── Shared trigger ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── platform_settings (single row) ──────────────────────────────────
create table if not exists public.platform_settings (
  id                     int primary key default 1 check (id = 1),
  listing_fee_etb        numeric(12, 2) not null default 100 check (listing_fee_etb >= 0),
  free_listings_quota    int not null default 2 check (free_listings_quota between 0 and 100),
  listing_duration_days  int not null default 30 check (listing_duration_days between 1 and 365),
  reminder_days_before   int not null default 5 check (reminder_days_before between 0 and 30),
  max_active_listings    int not null default 10 check (max_active_listings between 1 and 1000),
  boost_price_etb        numeric(12, 2) not null default 50 check (boost_price_etb >= 0),
  boost_days             int not null default 7 check (boost_days between 1 and 90),
  contact_daily_limit    int not null default 20 check (contact_daily_limit between 1 and 1000),
  payment_sla_minutes    int not null default 60 check (payment_sla_minutes between 5 and 10080),
  telebirr_number        text not null default '' check (char_length(telebirr_number) <= 20),
  telebirr_name          text not null default '' check (char_length(telebirr_name) <= 80),
  support_username       text not null default '' check (support_username ~ '^[A-Za-z0-9_]{0,32}$'),
  bot_username           text not null default '' check (bot_username ~ '^[A-Za-z0-9_]{0,32}$'),
  mini_app_short_name    text not null default '' check (mini_app_short_name ~ '^[A-Za-z0-9_]{0,64}$'),
  channel_id             text not null default '' check (channel_id ~ '^(-?[0-9]{1,20}|@[A-Za-z0-9_]{4,32})?$'),
  channel_autopost       boolean not null default false,
  banned_words           text[] not null default '{}',
  updated_at             timestamptz not null default now(),
  updated_by             text
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists platform_settings_touch on public.platform_settings;
create trigger platform_settings_touch before update on public.platform_settings
  for each row execute function public.touch_updated_at();

-- ─── profiles ────────────────────────────────────────────────────────
create table if not exists public.profiles (
  telegram_id         text primary key check (telegram_id ~ '^[0-9]{1,20}$'),
  public_id           uuid not null unique default gen_random_uuid(),
  username            text not null default '' check (username ~ '^[A-Za-z0-9_]{0,32}$'),
  first_name          text not null default '' check (char_length(first_name) <= 64),
  last_name           text not null default '' check (char_length(last_name) <= 64),
  photo_url           text not null default '' check (char_length(photo_url) <= 512),
  phone               text not null default '' check (phone ~ '^(\+?[0-9]{9,15})?$'),
  phone_verified      boolean not null default false,
  city                text not null default '' check (char_length(city) <= 40),
  role                text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  is_banned           boolean not null default false,
  ban_reason          text not null default '' check (char_length(ban_reason) <= 300),
  is_verified_seller  boolean not null default false,
  language            text not null default 'en' check (language in ('en', 'am')),
  listings_free_used  int not null default 0 check (listings_free_used >= 0),
  bot_blocked         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role) where role <> 'user';

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─── products ────────────────────────────────────────────────────────
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           text not null references public.profiles (telegram_id) on delete cascade,
  title               text not null default '' check (char_length(title) <= 80),
  description         text not null default '' check (char_length(description) <= 2000),
  price               numeric(12, 2) check (price is null or (price > 0 and price < 100000000)),
  category            text check (category is null or category in (
                        'phone', 'laptop', 'tablet', 'desktop', 'watch', 'audio', 'accessory', 'other')),
  brand               text not null default '' check (char_length(brand) <= 40),
  model               text not null default '' check (char_length(model) <= 60),
  condition           text check (condition is null or condition in (
                        'new', 'like_new', 'good', 'fair', 'for_parts')),
  city                text not null default '' check (char_length(city) <= 40),
  specs               jsonb not null default '{}' check (jsonb_typeof(specs) = 'object'),
  negotiable          boolean not null default false,
  exchange            boolean not null default false,
  status              text not null default 'draft' check (status in (
                        'draft', 'pending_payment', 'payment_submitted', 'in_review', 'active',
                        'paused', 'sold', 'expired', 'rejected', 'removed')),
  -- Was the current listing period granted from the free quota / free renewal?
  is_free             boolean not null default false,
  -- Is the current listing period covered (free, or fee confirmed)?
  period_paid         boolean not null default false,
  reject_reason       text check (reject_reason is null or reject_reason in (
                        'invalid_reference', 'wrong_amount', 'prohibited_item', 'bad_photos',
                        'misleading_price', 'duplicate', 'other')),
  reject_note         text not null default '' check (char_length(reject_note) <= 500),
  flags               text[] not null default '{}',
  renew_count         int not null default 0 check (renew_count >= 0),
  views               int not null default 0 check (views >= 0),
  expires_at          timestamptz,
  boosted_until       timestamptz,
  published_at        timestamptz,
  reminder_sent_at    timestamptz,
  channel_posted_at   timestamptz,
  sold_at             timestamptz,
  status_changed_at   timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_text         text generated always as (
                        lower(title || ' ' || brand || ' ' || model)) stored
);

create index if not exists products_status_published_idx on public.products (status, published_at desc);
create index if not exists products_status_created_idx on public.products (status, created_at);
create index if not exists products_seller_idx on public.products (seller_id, status);
create index if not exists products_category_idx on public.products (category) where status = 'active';
create index if not exists products_city_idx on public.products (city) where status = 'active';
create index if not exists products_expires_idx on public.products (expires_at) where status in ('active', 'paused');
create index if not exists products_search_trgm_idx on public.products
  using gin (search_text extensions.gin_trgm_ops);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create or replace function public.products_track_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists products_status_change on public.products;
create trigger products_status_change before update on public.products
  for each row execute function public.products_track_status();

-- ─── product_images ──────────────────────────────────────────────────
create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  path        text not null check (path ~ '^[0-9]{1,20}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(webp|jpg|jpeg|png)$'),
  position    int not null check (position between 0 and 7),
  is_cover    boolean generated always as (position = 0) stored,
  hash        text not null default '' check (hash ~ '^([0-9a-f]{64})?$'),
  created_at  timestamptz not null default now(),
  unique (product_id, position)
);

create index if not exists product_images_hash_idx on public.product_images (hash) where hash <> '';

-- ─── payments ────────────────────────────────────────────────────────
create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  telegram_id      text not null references public.profiles (telegram_id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete cascade,
  kind             text not null check (kind in ('listing', 'boost', 'renew')),
  amount_etb       numeric(12, 2) not null check (amount_etb > 0),
  method           text not null default 'telebirr_manual' check (char_length(method) <= 32),
  -- Normalized: upper-case, no whitespace.
  reference        text not null default '' check (reference ~ '^([A-Z0-9-]{6,32})?$'),
  screenshot_path  text not null default '' check (char_length(screenshot_path) <= 200),
  status           text not null default 'pending' check (status in (
                     'pending', 'submitted', 'confirmed', 'rejected', 'refunded')),
  reject_reason    text check (reject_reason is null or reject_reason in (
                     'invalid_reference', 'wrong_amount', 'duplicate', 'other')),
  admin_note       text not null default '' check (char_length(admin_note) <= 500),
  reviewed_by      text references public.profiles (telegram_id) on delete set null,
  reviewed_at      timestamptz,
  submitted_at     timestamptz,
  refunded_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (status = 'pending' or reference <> '')
);

-- One Telebirr transaction can only ever be credited once (rejected attempts don't count).
create unique index if not exists payments_reference_unique on public.payments (reference)
  where reference <> '' and status in ('submitted', 'confirmed', 'refunded');
-- At most one open payment per listing and purpose.
create unique index if not exists payments_open_unique on public.payments (product_id, kind)
  where status in ('pending', 'submitted');
create index if not exists payments_status_idx on public.payments (status, submitted_at);
create index if not exists payments_owner_idx on public.payments (telegram_id, created_at desc);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ─── favorites ───────────────────────────────────────────────────────
create table if not exists public.favorites (
  telegram_id  text not null references public.profiles (telegram_id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (telegram_id, product_id)
);
create index if not exists favorites_product_idx on public.favorites (product_id);

-- ─── leads (contact requests) ────────────────────────────────────────
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  buyer_id    text not null references public.profiles (telegram_id) on delete cascade,
  seller_id   text not null references public.profiles (telegram_id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists leads_buyer_idx on public.leads (buyer_id, created_at desc);
create index if not exists leads_product_idx on public.leads (product_id, buyer_id);

-- ─── reports ─────────────────────────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  text not null references public.profiles (telegram_id) on delete cascade,
  target_type  text not null check (target_type in ('product', 'user')),
  target_id    text not null check (char_length(target_id) <= 64),
  reason       text not null check (reason in (
                 'scam', 'prohibited', 'wrong_info', 'duplicate', 'offensive', 'already_sold', 'other')),
  note         text not null default '' check (char_length(note) <= 500),
  status       text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  resolution   text not null default '' check (char_length(resolution) <= 300),
  resolved_by  text references public.profiles (telegram_id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists reports_open_unique on public.reports (reporter_id, target_type, target_id)
  where status = 'open';
create index if not exists reports_status_idx on public.reports (status, created_at);

-- ─── reviews ─────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  seller_id    text not null references public.profiles (telegram_id) on delete cascade,
  reviewer_id  text not null references public.profiles (telegram_id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  rating       int not null check (rating between 1 and 5),
  comment      text not null default '' check (char_length(comment) <= 500),
  created_at   timestamptz not null default now(),
  unique (reviewer_id, product_id),
  check (seller_id <> reviewer_id)
);
create index if not exists reviews_seller_idx on public.reviews (seller_id, created_at desc);

-- ─── product_views (dedupe: one view per viewer per day) ─────────────
create table if not exists public.product_views (
  product_id  uuid not null references public.products (id) on delete cascade,
  viewer_id   text not null references public.profiles (telegram_id) on delete cascade,
  viewed_on   date not null default current_date,
  primary key (product_id, viewer_id, viewed_on)
);

-- ─── notifications_outbox ────────────────────────────────────────────
create table if not exists public.notifications_outbox (
  id               bigint generated always as identity primary key,
  chat_id          text not null check (chat_id ~ '^(-?[0-9]{1,20}|@[A-Za-z0-9_]{4,32})$'),
  kind             text not null check (char_length(kind) <= 40),
  payload          jsonb not null default '{}',
  attempts         int not null default 0,
  next_attempt_at  timestamptz not null default now(),
  sent_at          timestamptz,
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists outbox_pending_idx on public.notifications_outbox (next_attempt_at)
  where sent_at is null;

-- ─── audit_log ───────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     text,
  action       text not null,
  target_type  text not null,
  target_id    text not null,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_log (created_at desc);
create index if not exists audit_target_idx on public.audit_log (target_type, target_id);
create index if not exists audit_actor_idx on public.audit_log (actor_id, created_at desc);
