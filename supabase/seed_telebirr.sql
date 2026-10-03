-- Set listing-fee Telebirr account (run in Supabase SQL Editor)
update public.platform_settings
set
  telebirr_number = '0922578745',
  telebirr_name = 'Mikias Abate',
  updated_at = now()
where id = 1;
