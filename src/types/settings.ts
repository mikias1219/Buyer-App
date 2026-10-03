export interface PlatformSettings {
  id: number;
  listing_fee_etb: number;
  telebirr_number: string;
  telebirr_name: string;
  admin_telegram_ids: string[];
  support_username: string;
  updated_at: string;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  id: 1,
  listing_fee_etb: 100,
  telebirr_number: '0922578745',
  telebirr_name: 'Mikias Abate',
  admin_telegram_ids: ['1362166775'],
  support_username: 'support',
  updated_at: new Date().toISOString(),
};
