-- Make Mikias admin (Telegram ID 1362166775)
update public.platform_settings
set
  admin_telegram_ids = array['1362166775'],
  telebirr_number = '0922578745',
  telebirr_name = 'Mikias Abate',
  updated_at = now()
where id = 1;
