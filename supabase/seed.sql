-- Seed: platform settings only. No personal data — set Telebirr details, bot username
-- and channel from the admin Settings screen (or with admin_update_settings) after deploy.
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;
