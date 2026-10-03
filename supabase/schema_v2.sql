-- TechMarket ET v2 — profiles, payments, settings, product status
-- Run AFTER schema.sql (or on a fresh project). Safe to re-run with IF NOT EXISTS / ADD COLUMN guards.

create extension if not exists "pgcrypto";

-- ─── Profiles ───────────────────────────────────────────────
create table if not exists public.profiles (
  telegram_id text primary key,
  username text not null default '',
  first_name text not null default '',
  phone text not null default '',
  city text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Platform settings (single row id = 1) ────────────────
create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  listing_fee_etb numeric(12, 2) not null default 100 check (listing_fee_etb >= 0),
  telebirr_number text not null default '0922578745',
  telebirr_name text not null default 'Mikias Abate',
  admin_telegram_ids text[] not null default '{}',
  support_username text not null default 'support',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, telebirr_number, telebirr_name, listing_fee_etb)
values (1, '0922578745', 'Mikias Abate', 100)
on conflict (id) do update
set
  telebirr_number = excluded.telebirr_number,
  telebirr_name = excluded.telebirr_name;

-- ─── Extend products ──────────────────────────────────────
alter table public.products
  add column if not exists status text not null default 'active';

alter table public.products
  add column if not exists brand text not null default '';

alter table public.products
  add column if not exists city text not null default '';

alter table public.products
  add column if not exists listing_fee_etb numeric(12, 2) not null default 0;

alter table public.products
  add column if not exists payment_id uuid;

-- Drop old loose check if present, then enforce status values
do $$
begin
  alter table public.products drop constraint if exists products_status_check;
  alter table public.products
    add constraint products_status_check
    check (status in (
      'draft', 'pending_payment', 'payment_submitted',
      'active', 'rejected', 'sold', 'hidden'
    ));
exception when others then null;
end $$;

-- ─── Payments ─────────────────────────────────────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null references public.profiles (telegram_id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  amount_etb numeric(12, 2) not null check (amount_etb >= 0),
  method text not null default 'telebirr',
  reference text not null default '',
  status text not null default 'pending' check (
    status in ('pending', 'submitted', 'confirmed', 'rejected', 'refunded')
  ),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_telegram_id_idx on public.payments (telegram_id);
create index if not exists products_status_idx on public.products (status);
create index if not exists products_city_idx on public.products (city);
create index if not exists profiles_phone_idx on public.profiles (phone);

-- Link payment_id FK after payments exists
do $$
begin
  alter table public.products
    drop constraint if exists products_payment_id_fkey;
  alter table public.products
    add constraint products_payment_id_fkey
    foreign key (payment_id) references public.payments (id) on delete set null;
exception when others then null;
end $$;

-- ─── Helpers ──────────────────────────────────────────────
create or replace function public.is_platform_admin(p_telegram_id text)
returns boolean
language sql
stable
as $$
  select
    coalesce(
      (
        select
          p_telegram_id = any (s.admin_telegram_ids)
          or exists (
            select 1 from public.profiles pr
            where pr.telegram_id = p_telegram_id and pr.role = 'admin'
          )
        from public.platform_settings s
        where s.id = 1
      ),
      false
    );
$$;

-- ─── RLS ──────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.payments enable row level security;
alter table public.platform_settings enable row level security;
alter table public.products enable row level security;

-- Drop old open policies on products if they exist
drop policy if exists "Public can read products" on public.products;
drop policy if exists "Anyone can insert products" on public.products;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_upsert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "payments_select" on public.payments;
drop policy if exists "payments_insert" on public.payments;
drop policy if exists "payments_update" on public.payments;
drop policy if exists "settings_select" on public.platform_settings;
drop policy if exists "settings_update" on public.platform_settings;
drop policy if exists "products_select" on public.products;
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;

-- MVP: anon client (Telegram Mini App). Tighten later with Edge Function auth.
create policy "profiles_select" on public.profiles
  for select to anon, authenticated using (true);

create policy "profiles_insert" on public.profiles
  for insert to anon, authenticated with check (true);

create policy "profiles_update" on public.profiles
  for update to anon, authenticated using (true) with check (true);

create policy "products_select" on public.products
  for select to anon, authenticated using (true);

create policy "products_insert" on public.products
  for insert to anon, authenticated with check (true);

create policy "products_update" on public.products
  for update to anon, authenticated using (true) with check (true);

create policy "payments_select" on public.payments
  for select to anon, authenticated using (true);

create policy "payments_insert" on public.payments
  for insert to anon, authenticated with check (true);

create policy "payments_update" on public.payments
  for update to anon, authenticated using (true) with check (true);

create policy "settings_select" on public.platform_settings
  for select to anon, authenticated using (true);

create policy "settings_update" on public.platform_settings
  for update to anon, authenticated using (true) with check (true);

-- ─── Bootstrap note ───────────────────────────────────────
-- After running this SQL, set yourself as admin:
--   update public.platform_settings
--   set admin_telegram_ids = array['YOUR_TELEGRAM_NUMERIC_ID']
--   where id = 1;
--
-- Telebirr defaults: 0922578745 / Mikias Abate (see seed_telebirr.sql)
