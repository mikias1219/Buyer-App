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
  telebirr_number: '',
  telebirr_name: '',
  admin_telegram_ids: [],
  support_username: 'support',
  updated_at: new Date().toISOString(),
};
