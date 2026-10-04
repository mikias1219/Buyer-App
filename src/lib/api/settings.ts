import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { DEFAULT_SETTINGS, type PlatformSettings } from '../../types/settings';

export async function fetchSettings(): Promise<PlatformSettings> {
  if (!isSupabaseConfigured || !supabase) return DEFAULT_SETTINGS;

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    console.warn('[settings]', error?.message);
    return DEFAULT_SETTINGS;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    admin_telegram_ids: data.admin_telegram_ids ?? [],
    listing_fee_etb: Number(data.listing_fee_etb),
  } as PlatformSettings;
}

export async function updateSettings(
  patch: Partial<
    Pick<
      PlatformSettings,
      | 'listing_fee_etb'
      | 'telebirr_number'
      | 'telebirr_name'
      | 'admin_telegram_ids'
      | 'support_username'
    >
  >,
): Promise<PlatformSettings | null> {
  if (!isSupabaseConfigured || !supabase) {
    return { ...DEFAULT_SETTINGS, ...patch, updated_at: new Date().toISOString() };
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    console.error('[settings] update failed:', error.message);
    return null;
  }

  return data as PlatformSettings;
}
